import bpy, time, sys
import numpy as np

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
MODELS = {
    'doubao': {
        'glb': r'D:\my_code\我的学习\AI大模型概念形象\Doubao\3D模型\doubao.glb',
        'out_dir': r'D:\my_code\我的学习\AI大模型概念形象\Doubao\3D模型',
        'prefix': 'doubao',
    },
    'CYD-Male': {
        'glb': r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Male\3D模型\CYD-Male.glb',
        'out_dir': r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Male\3D模型',
        'prefix': 'CYD-Male',
    },
    'CYD-female': {
        'glb': r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Female\3D模型\CYD-female.glb',
        'out_dir': r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Female\3D模型',
        'prefix': 'CYD-female',
    },
}

name = sys.argv[sys.argv.index('--') + 1]
cfg = MODELS[name]
GLB = cfg['glb']
OUT_DIR = cfg['out_dir']
PREFIX = cfg['prefix']
OUT_BLEND = r'D:\my_code\我的学习\AI大模型概念形象\_work\%s_rigged.blend' % PREFIX
OUT_GLB = OUT_DIR + '\\' + PREFIX + '_walk_raw_export.glb'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\rig_%s_log.txt' % PREFIX

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== rig %s ==\n' % name)

t_all = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
for o in [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Armature']

bpy.ops.import_scene.gltf(filepath=GLB)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]

# apply mesh transform fully so mesh.local == world (Z-up, meters)
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
log('mesh %s transform applied, location=%s' % (mesh.name, tuple(round(x,6) for x in mesh.location)))

# model height in world Z
co = np.empty(len(mesh.data.vertices) * 3, dtype=np.float64)
mesh.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
h = co[:, 2].max() - co[:, 2].min()
log('mesh verts: %d, height z: %.4f' % (len(co), h))

# scale armature so skeleton tree (1.7072) matches model height
s = h / 1.7072
arm.scale = tuple(x * s for x in arm.scale)
bpy.context.view_layer.update()
log('arm.scale = %s (s=%.6f)' % (tuple(round(x,6) for x in arm.scale), s))

bones = list(arm.data.bones)
names = [b.name for b in bones]
seg_p = np.array([(arm.matrix_world @ b.head_local) for b in bones], dtype=np.float64)
seg_q = np.array([(arm.matrix_world @ b.tail_local) for b in bones], dtype=np.float64)
dirs = seg_q - seg_p
lensq = np.einsum('ij,ij->i', dirs, dirs)
log('bone z range: %.4f .. %.4f' % (seg_p[:,2].min(), seg_p[:,2].max()))

radius_lim = {}
leg_bones = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToeBase_end',
             'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToeBase_end']
arm_bones = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHand_end',
             'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHand_end']
finger_bones = [n for n in names if n.startswith(('left_', 'right_'))]
head_bones = ['Neck', 'Head', 'Head_end']
for n in leg_bones:
    radius_lim[n] = 0.16
for n in arm_bones:
    radius_lim[n] = 0.22
for n in finger_bones:
    radius_lim[n] = 0.12
for n in head_bones:
    radius_lim[n] = 0.35

N = co.shape[0]
B = len(bones)
K = 4

def dist_to_segments(points):
    m = points.shape[0]
    d = np.zeros((m, B), dtype=np.float64)
    for i in range(B):
        dpi = points - seg_p[i]
        t = dpi @ dirs[i] / (lensq[i] + 1e-9)
        t = np.clip(t, 0.0, 1.0)
        proj = seg_p[i] + t[:, None] * dirs[i]
        d[:, i] = np.linalg.norm(points - proj, axis=1)
    return d

bone_idx_all = np.empty((N, K), dtype=np.int32)
weight_all = np.empty((N, K), dtype=np.float64)
chunk = 20000
t0 = time.time()
for start in range(0, N, chunk):
    end = min(start + chunk, N)
    pts = co[start:end]
    d = dist_to_segments(pts)
    d[:, 0] = np.inf
    for i in range(1, B):
        nm = names[i]
        if nm in radius_lim:
            r = radius_lim[nm]
            d[:, i] = np.where(d[:, i] > r, np.inf, d[:, i])
    idx = np.argpartition(d, K - 1, axis=1)[:, :K]
    vals = np.take_along_axis(d, idx, axis=1)
    valid = np.isfinite(vals)
    w = np.zeros_like(vals)
    w[valid] = 1.0 / (vals[valid] + 1e-3) ** 2
    wsum = w.sum(axis=1, keepdims=True)
    w = np.divide(w, wsum, out=np.zeros_like(w), where=wsum > 0)
    # fallback: zero-weight verts get nearest bone (any bone incl. root)
    zero = (wsum[:, 0] <= 0)
    if zero.any():
        dmin = np.argmin(d, axis=1)
        w[zero, 0] = 1.0
        idx[zero, 0] = dmin[zero]
        w[zero, 1:] = 0.0
        log('  chunk fallback zero-weight: %d / %d' % (zero.sum(), end - start))
    bone_idx_all[start:end] = idx
    weight_all[start:end] = w
    if (start // chunk) % 5 == 0:
        log('  weighted %d/%d (%.0fs)' % (end, N, time.time() - t0))
log('weighting done %.0fs' % (time.time() - t0))

rs = weight_all.sum(axis=1)
log('weight sums: min=%.6f max=%.6f' % (rs.min(), rs.max()))

for nm in names:
    if nm not in mesh.vertex_groups:
        mesh.vertex_groups.new(name=nm)
group_idx = {g.name: g.index for g in mesh.vertex_groups}
bone2group = np.array([group_idx[n] for n in names], dtype=np.int32)

t0 = time.time()
for bi in range(B):
    gi = int(bone2group[bi])
    rows, cols = np.where(bone_idx_all == bi)
    if len(rows) == 0:
        continue
    wvals = weight_all[rows, cols]
    vg = mesh.vertex_groups[gi]
    for k in range(len(rows)):
        vg.add([int(rows[k])], float(wvals[k]), 'REPLACE')
log('write vgroups took %.0fs' % (time.time() - t0))
n_empty = sum(1 for v in mesh.data.vertices if not v.groups)
log('verts no-weights: %d' % n_empty)

mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
log('ARMATURE modifier only (no parent)')

a = arm.animation_data.action
removed_obj = 0
removed_loc = 0
for L in a.layers:
    for s in L.strips:
        for cb in s.channelbags:
            for f in list(cb.fcurves):
                if not f.data_path.startswith('pose.bones['):
                    cb.fcurves.remove(f)
                    removed_obj += 1
                elif '.location' in f.data_path:
                    cb.fcurves.remove(f)
                    removed_loc += 1
log('removed object-level: %d, bone-location: %d' % (removed_obj, removed_loc))
for pb in arm.pose.bones:
    pb.location = (0.0, 0.0, 0.0)
log('cleared all pose bone locations')
arm.rotation_euler = (0, 0, 0)
arm.location = (0, 0, 0)
bpy.context.view_layer.update()

bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 67
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
log('saved blend')
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    use_selection=False,
    export_animations=True,
    export_skins=True,
    export_yup=True,
)
log('exported GLB')
log('total %.0fs' % (time.time() - t_all))
log('== done ==')
