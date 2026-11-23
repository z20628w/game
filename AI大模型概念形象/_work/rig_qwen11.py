import bpy, time
import numpy as np

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb'
OUT_BLEND = r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend'
OUT_GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\rig11_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== rig v11 (keep arm scale, no parent, drop location curves) ==\n')

t_all = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
for o in [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Armature']

bpy.ops.import_scene.gltf(filepath=GLB)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]

# scale armature object (DO NOT apply into bones)
s = 1.1515 / 1.7887
arm.scale = tuple(x * s for x in arm.scale)
bpy.context.view_layer.update()
log(f'arm.scale = {tuple(round(x,6) for x in arm.scale)}')

bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
log('mesh transform applied')

bones = list(arm.data.bones)
names = [b.name for b in bones]
seg_p = np.array([(arm.matrix_world @ b.head_local) for b in bones], dtype=np.float64)
seg_q = np.array([(arm.matrix_world @ b.tail_local) for b in bones], dtype=np.float64)
dirs = seg_q - seg_p
lensq = np.einsum('ij,ij->i', dirs, dirs)

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

co = np.empty(len(mesh.data.vertices) * 3, dtype=np.float64)
mesh.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
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
    bone_idx_all[start:end] = idx
    weight_all[start:end] = w
    if (start // chunk) % 5 == 0:
        log(f'  weighted {end}/{N}')

rs = weight_all.sum(axis=1)
log(f'weight sums: min={rs.min():.6f} max={rs.max():.6f}')

for name in names:
    if name not in mesh.vertex_groups:
        mesh.vertex_groups.new(name=name)
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
log(f'write took {time.time()-t0:.1f}s')
n_empty = sum(1 for v in mesh.data.vertices if not v.groups)
log(f'verts no-weights: {n_empty}')

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
log(f'removed object-level: {removed_obj}, bone-location: {removed_loc}')
# clear all pose bone locations (FBX leftover cm values would leak into GLB translation channels)
for pb in arm.pose.bones:
    pb.location = (0.0, 0.0, 0.0)
    if pb.rotation_mode == 'QUATERNION':
        pb.rotation_quaternion = pb.rotation_quaternion
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
log(f'total {time.time()-t_all:.1f}s')
log('== rig v11 done ==')
