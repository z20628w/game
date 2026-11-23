import bpy, os
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend')

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\wb_check_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== workbench geometry check ==\n')

arm = bpy.data.objects['Armature']
mesh = bpy.data.objects['Mesh_0']
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'

def render_wb(name, frame):
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
    cam_loc = (cx + r*2.4, cy - r*2.4, cz + r*1.2)
    direction = (Vector((cx, cy, cz)) - Vector(cam_loc)).normalized()
    z_axis = -direction
    x_axis = Vector((1,0,0)) if abs(z_axis.dot((1,0,0))) < 0.9 else Vector((0,1,0))
    y_axis = z_axis.cross(x_axis).normalized()
    x_axis = y_axis.cross(z_axis).normalized()
    m = __import__('mathutils').Matrix((x_axis, y_axis, z_axis)).transposed()
    cam_obj.location = cam_loc
    cam_obj.rotation_mode = 'QUATERNION'
    cam_obj.rotation_quaternion = m.to_quaternion()
    scene.camera = cam_obj
    scene.render.filepath = os.path.join(r'D:\my_code\我的学习\AI大模型概念形象\_work\preview', name)
    bpy.ops.render.render(write_still=True)
    log(f'rendered {name}: x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]')

render_wb('wb_f1_parented.png', 1)

# ---- now unparent mesh, keep only modifier ----
mesh.parent = None
mesh.matrix_world = __import__('mathutils').Matrix.Identity(4)
bpy.context.view_layer.update()
log('unparented mesh, matrix_world = identity')
log(f'mesh loc={tuple(round(x,5) for x in mesh.location)} scale={tuple(round(x,5) for x in mesh.scale)}')
mod = mesh.modifiers[0]
log(f'modifier object = {mod.object.name if mod.object else None}')
render_wb('wb_f1_unparented.png', 1)
render_wb('wb_f17_unparented.png', 17)
render_wb('wb_f34_unparented.png', 34)
log('done')
