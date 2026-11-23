import bpy, time
import numpy as np

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb'
OUT_BLEND = r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend'
OUT_GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\rig3_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== rig v3 (numpy weights) ==\n')

t_all = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
for o in [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Armature']

bpy.ops.import_scene.gltf(filepath=GLB)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]

# scale armature to mesh height
az0, az1 = 0.0, 1.7887  # known from diag (root at 0, Head_end 1.7887 with scale 0.01)
mz0, mz1 = 0.0, 1.1515  # mesh z range (apply transform keeps z 0..1.1515)
s = (mz1 - mz0) / (az1 - az0)
arm.scale = tuple(x * s for x in arm.scale)
bpy.context.view_layer.update()
log(f'scale factor: {s:.6f}, arm.scale={tuple(round(x,6) for x in arm.scale)}')

# apply mesh transform (local == world)
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
log('mesh transform applied (rotation/scale)')

# ---- numpy nearest-bone weights ----
bones = list(arm.data.bones)
names = [b.name for b in bones]
# bone world segments
seg_p = np.array([(arm.matrix_world @ b.head_local) for b in bones], dtype=np.float64)
seg_q = np.array([(arm.matrix_world @ b.tail_local) for b in bones], dtype=np.float64)
dirs = seg_q - seg_p
lensq = np.einsum('ij,ij->i', dirs, dirs)
# vertices
co = np.empty(len(mesh.data.vertices) * 3, dtype=np.float64)
mesh.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
N = co.shape[0]
log(f'verts={N} bones={len(bones)}')

K = 4  # bones per vertex
B = len(bones)
eps = 1e-6

def dist_to_segments(points):
    # points: (m,3) -> distances to B segments (m,B)
    m = points.shape[0]
    d = np.zeros((m, B), dtype=np.float64)
    for i in range(B):
        dpi = points - seg_p[i]         # (m,3)
        t = dpi @ dirs[i] / (lensq[i] + eps)
        t = np.clip(t, 0.0, 1.0)
        proj = seg_p[i] + t[:, None] * dirs[i]
        d[:, i] = np.linalg.norm(points - proj, axis=1)
    return d

# assign weights in chunks
chunk = 20000
all_w = np.zeros((N, B), dtype=np.float64)
n_ok = 0
for start in range(0, N, chunk):
    end = min(start + chunk, N)
    pts = co[start:end]
    d = dist_to_segments(pts)
    # pick K nearest
    idx = np.argpartition(d, K - 1, axis=1)[:, :K]
    vals = np.take_along_axis(d, idx, axis=1)
    w = 1.0 / (vals + 1e-3) ** 2
    wsum = w.sum(axis=1, keepdims=True)
    w = w / wsum
    for j in range(K):
        all_w[start:end, idx[:, j]] += w[:, j]
    n_ok += (end - start)
    if (start // chunk) % 10 == 0:
        log(f'  weighted {end}/{N}')
log(f'numpy weighting done for {n_ok} verts in {time.time()-t_all:.1f}s')

# sanity: per-vertex weight sums
rowsum = all_w.sum(axis=1)
bad = int((np.abs(rowsum - 1.0) > 1e-4).sum())
log(f'vertices with weight sum != 1: {bad}')

# write to vertex groups
for name in names:
    if name not in mesh.vertex_groups:
        mesh.vertex_groups.new(name=name)
group_idx = {g.name: g.index for g in mesh.vertex_groups}
# map bone index -> group index
bone2group = np.array([group_idx[n] for n in names], dtype=np.int32)

# add group weights: for each group, set weights via add (chunked by vertex)
for gi in range(len(names)):
    pass

# write via batch add per group (bpy supports array add)
for bi in range(B):
    wcol = all_w[:, bi]
    gi = bone2group[bi]
    nz = np.nonzero(wcol)[0]
    if len(nz) == 0:
        continue
    vg = mesh.vertex_groups[gi]
    vg.add(nz.tolist(), wcol[nz].tolist(), 'REPLACE')
    log(f'  group {names[bi]} ({gi}): {len(nz)} verts')
log('groups written')

# verify
n_empty = sum(1 for v in mesh.data.vertices if not v.groups)
log(f'verts with no weights: {n_empty}')
# top group sizes
sizes = [(g.name, g.index, sum(1 for v in mesh.data.vertices for gr in v.groups if gr.group == g.index))
         for g in mesh.vertex_groups]
sizes.sort(key=lambda x: -x[2])
log('group sizes top: ' + str(sizes[:12]))

# parent mesh to armature with ARMATURE modifier (keep transforms)
mesh.parent = arm
mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
log('parented + ARMATURE modifier')

# frames
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
log(f'total time {time.time()-t_all:.1f}s')
log('== rig v3 done ==')
