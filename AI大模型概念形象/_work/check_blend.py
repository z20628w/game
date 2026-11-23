import bpy, os
from mathutils import Vector

# load the rigged blend directly (bypass GLB round-trip)
bpy.ops.wm.open_mainfile(filepath=r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend')

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\blend_check_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== blend direct check ==\n')

# objects
arm = bpy.data.objects['Armature']
mesh = bpy.data.objects['Mesh_0']
log(f'arm loc={tuple(round(x,4) for x in arm.location)} rot={tuple(round(x,4) for x in arm.rotation_euler)} scale={tuple(round(x,5) for x in arm.scale)}')
log(f'action present: {arm.animation_data.action.name if arm.animation_data else None}')

def mesh_bbox_world():
    deps = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(deps)
    xs, ys, zs = [], [], []
    for v in ev.data.vertices:
        w = mesh.matrix_world @ v.co
        xs.append(w.x); ys.append(w.y); zs.append(w.z)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

# rest pose (frame 0? use frame where animation not applied -> disable animation temporarily)
# record at frame 1 and frame 0
for f in [0, 1, 17, 34, 67]:
    bpy.context.scene.frame_set(f)
    xs0, xs1, ys0, ys1, zs0, zs1 = mesh_bbox_world()
    log(f'frame {f}: x[{xs0:.3f},{xs1:.3f}] y[{ys0:.3f},{ys1:.3f}] z[{zs0:.3f},{zs1:.3f}]')

# disable modifier to get rest mesh
mesh.modifiers[0].show_viewport = False
bpy.context.view_layer.update()
xs0, xs1, ys0, ys1, zs0, zs1 = mesh_bbox_world()
log(f'rest (modifier off): x[{xs0:.3f},{xs1:.3f}] y[{ys0:.3f},{ys1:.3f}] z[{zs0:.3f},{zs1:.3f}]')
mesh.modifiers[0].show_viewport = True

# render frame 1 and 34 directly
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'

def render(name, frame):
    scene.frame_set(frame)
    deps = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(deps)
    xs, ys, zs = [], [], []
    for v in ev.data.vertices:
        w = mesh.matrix_world @ v.co
        xs.append(w.x); ys.append(w.y); zs.append(w.z)
    cx = (min(xs)+max(xs))/2; cy = (min(ys)+max(ys))/2; cz = (min(zs)+max(zs))/2
    r = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))/2
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = r * 2.6
    cam_obj = bpy.data.objects.new('cam', cam_data)
    bpy.context.collection.objects.link(cam_obj)
    direction = (Vector((cx, cy, cz)) - Vector((cx + r*2.4, cy - r*2.4, cz + r*1.3))).normalized()
    z_axis = -direction
    x_axis = Vector((1,0,0)) if abs(z_axis.dot((1,0,0))) < 0.9 else Vector((0,1,0))
    y_axis = z_axis.cross(x_axis).normalized()
    x_axis = y_axis.cross(z_axis).normalized()
    m = __import__('mathutils').Matrix((x_axis, y_axis, z_axis)).transposed()
    cam_obj.location = (cx + r*2.4, cy - r*2.4, cz + r*1.3)
    cam_obj.rotation_mode = 'QUATERNION'
    cam_obj.rotation_quaternion = m.to_quaternion()
    scene.camera = cam_obj
    scene.render.filepath = os.path.join(r'D:\my_code\我的学习\AI大模型概念形象\_work\preview', name)
    bpy.ops.render.render(write_still=True)
    log(f'rendered {name} radius={r:.3f}')

render('blend_f1.png', 1)
render('blend_f34.png', 34)
log('done')
