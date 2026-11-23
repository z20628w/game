import bpy, json, os

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb'
OUT_BLEND = r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend'
OUT_GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\rig_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

# fresh scene
bpy.ops.wm.read_factory_settings(use_empty=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== rig start ==\n')

# 1) import FBX
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
log('imported FBX')

# remove FBX meshes and empties, keep armature
to_remove = [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]
for o in to_remove:
    bpy.data.objects.remove(o, do_unlink=True)
log(f'removed FBX helper objects: {len(to_remove)}')

arm = bpy.data.objects['Armature']
log(f'armature: scale={tuple(round(x,5) for x in arm.scale)} loc={tuple(round(x,5) for x in arm.location)}')
log(f'armature bones: {len(arm.data.bones)}, action: {arm.animation_data.action.name if arm.animation_data and arm.animation_data.action else None}')

# inspect action details (new layered API)
if arm.animation_data and arm.animation_data.action:
    a = arm.animation_data.action
    log(f'action frame_range={tuple(round(x,3) for x in a.frame_range)} name={a.name}')
    # gather fcurve data via strips
    try:
        for L in a.layers:
            for s in L.strips:
                sub = s.action if getattr(s, 'action', None) else None
                if sub is not None:
                    log(f'  strip action: {sub.name!r} frame_range={tuple(round(x,3) for x in sub.frame_range)}')
                    fcs = getattr(sub, 'fcurves', None)
                    if fcs is not None:
                        paths = sorted(set(f.data_path.split('"')[1] if '"' in f.data_path else f.data_path for f in fcs))
                        log(f'  fcurve paths ({len(fcs)}): {paths[:50]}')
                    else:
                        log(f'  (no fcurves attr; has: {[x for x in dir(sub) if not x.startswith("_")][:30]})')
    except Exception as e:
        log(f'  action inspect error: {e}')

# 2) import GLB
bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
log(f'imported GLB, meshes: {[(o.name, len(o.data.vertices), len(o.data.polygons)) for o in meshes]}')
mesh = meshes[0]
log(f'mesh world: scale={tuple(round(x,5) for x in mesh.scale)} loc={tuple(round(x,5) for x in mesh.location)}')

# compute world heights of skeleton and mesh
def world_bbox_y(objs):
    ys = []
    for o in objs:
        if o.type == 'MESH':
            for v in o.data.vertices:
                ys.append((o.matrix_world @ v.co).y)
    return (min(ys), max(ys))

def armature_bone_world_y():
    ys = []
    for b in arm.data.bones:
        for v in (b.head_local, b.tail_local):
            w = arm.matrix_world @ v
            ys.append(w.y)
    return (min(ys), max(ys))

mmin, mmax = world_bbox_y(meshes)
log(f'mesh world y range: [{mmin:.4f}, {mmax:.4f}], height={mmax-mmin:.4f}')
amin, amax = armature_bone_world_y()
log(f'armature world y range: [{amin:.4f}, {amax:.4f}], height={amax-amin:.4f}')

# scale armature to match mesh height, pivot at world origin
scale_factor = (mmax - mmin) / (amax - amin)
log(f'computed scale factor: {scale_factor:.6f}')
arm.scale = tuple(x * scale_factor for x in arm.scale)

amin2, amax2 = armature_bone_world_y()
log(f'after scale armature y range: [{amin2:.4f}, {amax2:.4f}]')

# 3) automatic weights
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
log(f'parent_set ARMATURE_AUTO done; modifiers={[m.type for m in mesh.modifiers]}')
log(f'mesh vertex groups: {len(mesh.vertex_groups)}')

# 4) set animation range to the walk cycle
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 67
log(f'scene frames: {bpy.context.scene.frame_start}-{bpy.context.scene.frame_end}, fps={bpy.context.scene.render.fps}')

# 5) save blend
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
log('saved blend: ' + OUT_BLEND)

# 6) export GLB
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    use_selection=False,
    export_animations=True,
    export_skins=True,
    export_yup=True,
)
log('exported GLB: ' + OUT_GLB)
log('== rig done ==')
