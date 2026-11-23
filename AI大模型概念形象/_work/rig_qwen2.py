import bpy

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb'
OUT_BLEND = r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend'
OUT_GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\rig2_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== rig v2 ==\n')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
# remove FBX meshes/empties, keep armature
for o in [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Armature']
log(f'armature scale before: {tuple(round(x,6) for x in arm.scale)}')

bpy.ops.import_scene.gltf(filepath=GLB)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
log(f'mesh: {mesh.name} verts={len(mesh.data.vertices)} polys={len(mesh.data.polygons)}')

def arm_world_z_range():
    zs = []
    for b in arm.data.bones:
        for v in (b.head_local, b.tail_local):
            zs.append((arm.matrix_world @ v).z)
    return min(zs), max(zs)

def mesh_world_z_range():
    zs = []
    for v in mesh.data.vertices:
        zs.append((mesh.matrix_world @ v.co).z)
    return min(zs), max(zs)

az0, az1 = arm_world_z_range()
mz0, mz1 = mesh_world_z_range()
log(f'armature world z range: [{az0:.4f}, {az1:.4f}] height={az1-az0:.4f}')
log(f'mesh world z range: [{mz0:.4f}, {mz1:.4f}] height={mz1-mz0:.4f}')

s = (mz1 - mz0) / (az1 - az0)
log(f'scale factor = {s:.6f}')
arm.scale = tuple(x * s for x in arm.scale)
az0, az1 = arm_world_z_range()
log(f'after scale, armature world z range: [{az0:.4f}, {az1:.4f}]')

# also snap x/z lateral alignment: keep bones centered at mesh center
# mesh center x/z
mx = []; mz = []
for v in mesh.data.vertices:
    w = mesh.matrix_world @ v.co
    mx.append(w.x); mz.append(w.z)
mesh_cx = (min(mx)+max(mx))/2
log(f'mesh world x center: {mesh_cx:.4f}')

# automatic weights
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
log('ARMATURE_AUTO done')
log(f'modifiers: {[m.type for m in mesh.modifiers]}')
log(f'vertex groups: {len(mesh.vertex_groups)}')

# verify weights
import collections
vg = mesh.vertex_groups
named = {g.name: g.index for g in vg}
n_empty = 0
for v in mesh.data.vertices:
    if not v.groups:
        n_empty += 1
log(f'vertices with no weight group: {n_empty} / {len(mesh.data.vertices)}')

# scene frames
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 67
log(f'frames: 1-67 fps={bpy.context.scene.render.fps}')

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
log('saved ' + OUT_BLEND)

bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    use_selection=False,
    export_animations=True,
    export_skins=True,
    export_yup=True,
)
log('exported ' + OUT_GLB)
log('== rig v2 done ==')
