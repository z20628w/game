import bpy, time
import numpy as np

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb'
OUT_BLEND = r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend'
OUT_GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\rig4_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== rig v4 (numpy weights, per-vertex write) ==\n')

t_all = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
for o in [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Armature']

bpy.ops.import_scene.gltf(filepath=GLB)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]

s = 1.1515 / 1.7887
arm.scale = tuple(x * s for x in arm.scale)
bpy.context.view_layer.update()
log(f'scale factor: {s:.6f}')

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

co = np.empty(len(mesh.data.vertices) * 3, dtype=np.float64)
mesh.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
N = co.shape[0]
B = len(bones)
K = 4
log(f'verts={N} bones={B}')

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

all_w = np.zeros((N, B), dtype=np.float64)
chunk = 20000
for start in range(0, N, chunk):
    end = min(start + chunk, N)
    pts = co[start:end]
    d = dist_to_segments(pts)
    idx = np.argpartition(d, K - 1, axis=1)[:, :K]
    vals = np.take_along_axis(d, idx, axis=1)
    w = 1.0 / (vals + 1e-3) ** 2
    wsum = w.sum(axis=1, keepdims=True)
    w = np.divide(w, wsum, out=np.zeros_like(w), where=wsum > 0)
    for j in range(K):
        all_w[start:end, idx[:, j]] += w[:, j]
    log(f'  weighted {end}/{N}')

# diagnosis
rs = all_w.sum(axis=1)
log(f'rowsum: min={rs.min():.6f} max={rs.max():.6f} mean={rs.mean():.6f} bad={int((np.abs(rs-1)>1e-3).sum())}')
# force normalize + cleanup
all_w = np.nan_to_num(all_w, nan=0.0, posinf=0.0, neginf=0.0)
rs = all_w.sum(axis=1, keepdims=True)
all_w = np.divide(all_w, rs, out=np.zeros_like(all_w), where=rs > 0)
log(f'after normalize rowsum: min={all_w.sum(axis=1).min():.6f} max={all_w.sum(axis=1).max():.6f}')

# create groups
for name in names:
    if name not in mesh.vertex_groups:
        mesh.vertex_groups.new(name=name)
group_idx = {g.name: g.index for g in mesh.vertex_groups}
bone2group = np.array([group_idx[n] for n in names], dtype=np.int32)

# per-vertex write (bpy 5.2 vg.add takes single float)
t0 = time.time()
for bi in range(B):
    wcol = all_w[:, bi]
    gi = bone2group[bi]
    nz = np.nonzero(wcol)[0]
    if len(nz) == 0:
        log(f'  group {names[bi]}: 0 verts (skip)')
        continue
    vg = mesh.vertex_groups[gi]
    for k in range(len(nz)):
        vg.add([int(nz[k])], float(wcol[nz[k]]), 'REPLACE')
    log(f'  group {names[bi]} ({gi}): {len(nz)} verts')
log(f'write took {time.time()-t0:.1f}s')

# verify readback
n_empty = sum(1 for v in mesh.data.vertices if not v.groups)
log(f'verts with no weights after write: {n_empty}')
# sample check: sum of weights per vertex
bad_sum = 0
for v in mesh.data.vertices:
    if v.groups:
        ssum = sum(g.weight for g in v.groups)
        if abs(ssum - 1.0) > 1e-3:
            bad_sum += 1
log(f'verts with weight-sum != 1 (sample all): {bad_sum}')

# parent + modifier
mesh.parent = arm
mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
log('parented + ARMATURE modifier')

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
log('== rig v4 done ==')
