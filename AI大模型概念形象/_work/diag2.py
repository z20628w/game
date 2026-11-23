import bpy, time

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\diag2_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== diag2 ==\n')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
for o in [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Armature']
bpy.ops.import_scene.gltf(filepath=GLB)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]

log(f'arm.scale before: {tuple(round(x,6) for x in arm.scale)}')
log(f'arm.matrix_world row3: {tuple(round(x,6) for x in arm.matrix_world[3])}')
s = 1.1515 / 1.7887
arm.scale = tuple(x * s for x in arm.scale)
bpy.context.view_layer.update()
log(f'arm.scale after assign: {tuple(round(x,6) for x in arm.scale)}')
log(f'arm.matrix_world row0: {tuple(round(x,6) for x in arm.matrix_world[0])}')
log(f'arm.matrix_world row3: {tuple(round(x,6) for x in arm.matrix_world[3])}')

# bone world positions after update
for name in ['root', 'Hips', 'LeftUpLeg', 'LeftFoot', 'Head', 'Head_end']:
    if name in arm.data.bones:
        b = arm.data.bones[name]
        w = arm.matrix_world @ b.head_local
        log(f'bone {name}: world={tuple(round(x,4) for x in w)}')

# mesh transform
log(f'mesh.matrix_world row0: {tuple(round(x,6) for x in mesh.matrix_world[0])}')
log(f'mesh.matrix_world row1: {tuple(round(x,6) for x in mesh.matrix_world[1])}')
log(f'mesh.matrix_world row2: {tuple(round(x,6) for x in mesh.matrix_world[2])}')
# apply mesh transform so local == world (remove 90deg rotation), centered on bone space
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
log(f'after apply: mesh.matrix_world = {tuple(tuple(round(x,5) for x in r) for r in mesh.matrix_world)}')
xs = [v.co.x for v in mesh.data.vertices]; ys = [v.co.y for v in mesh.data.vertices]; zs = [v.co.z for v in mesh.data.vertices]
log(f'mesh local bbox after apply: x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]')

# bone local head/tail ranges in armature space
# now try automatic weights and time it
t0 = time.time()
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
t1 = time.time()
log(f'ARMATURE_AUTO took {t1-t0:.1f}s')
log(f'vertex groups: {len(mesh.vertex_groups)}')
n_empty = 0
n_nonzero = 0
samples = {}
for v in mesh.data.vertices:
    if not v.groups:
        n_empty += 1
    else:
        n_nonzero += 1
        for g in v.groups:
            samples.setdefault(mesh.vertex_groups[g.group].name, 0)
            samples[mesh.vertex_groups[g.group].name] += 1
log(f'verts with weights: {n_nonzero}, without: {n_empty}')
top = sorted(samples.items(), key=lambda x: -x[1])[:15]
log(f'top groups: {top}')
