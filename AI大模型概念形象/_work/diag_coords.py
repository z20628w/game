import bpy

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\diag_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== diag ==\n')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
arm = bpy.data.objects['Armature']
mw = arm.matrix_world
log(f'arm.matrix_world =')
log(f'  row0 {tuple(round(x,5) for x in mw[0])}')
log(f'  row1 {tuple(round(x,5) for x in mw[1])}')
log(f'  row2 {tuple(round(x,5) for x in mw[2])}')
log(f'  row3 {tuple(round(x,5) for x in mw[3])}')
for name in ['root', 'Hips', 'LeftUpLeg', 'LeftFoot', 'Head', 'Head_end']:
    if name in arm.data.bones:
        b = arm.data.bones[name]
        w = mw @ b.head_local
        log(f'bone {name}: local head={tuple(round(x,3) for x in b.head_local)} -> world={tuple(round(x,4) for x in w)}')

# mesh world bbox full range for FBX meshes
xs, ys, zs = [], [], []
for o in bpy.data.objects:
    if o.type == 'MESH':
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
log(f'FBX meshes world bbox: x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
mw = mesh.matrix_world
log(f'mesh.matrix_world =')
log(f'  row0 {tuple(round(x,5) for x in mw[0])}')
log(f'  row1 {tuple(round(x,5) for x in mw[1])}')
log(f'  row2 {tuple(round(x,5) for x in mw[2])}')
log(f'  row3 {tuple(round(x,5) for x in mw[3])}')
xs, ys, zs = [], [], []
for v in mesh.data.vertices:
    w = mw @ v.co
    xs.append(w.x); ys.append(w.y); zs.append(w.z)
log(f'GLB mesh world bbox: x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]')
# also local
log(f'GLB mesh local bbox: x[{min(v.co.x for v in mesh.data.vertices):.3f},{max(v.co.x for v in mesh.data.vertices):.3f}] y[{min(v.co.y for v in mesh.data.vertices):.3f},{max(v.co.y for v in mesh.data.vertices):.3f}] z[{min(v.co.z for v in mesh.data.vertices):.3f},{max(v.co.z for v in mesh.data.vertices):.3f}]')
