import bpy, os
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend')

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\blend_check2_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== blend render with light ==\n')

arm = bpy.data.objects['Armature']
mesh = bpy.data.objects['Mesh_0']
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'
if scene.world is None:
    scene.world = bpy.data.worlds.new('W')
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.15, 0.18, 0.22, 1.0)

bpy.ops.object.light_add(type='SUN', location=(3, -4, 6))
bpy.context.object.data.energy = 5.0
bpy.ops.object.light_add(type='AREA', location=(1, 1, 3))
bpy.context.object.data.energy = 100.0

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
    cam_data.ortho_scale = r * 2.8
    cam_obj = bpy.data.objects.new('cam', cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_loc = (cx + r*2.4, cy - r*2.4, cz + r*1.3)
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
    log(f'rendered {name}: bbox x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}] r={r:.3f}')

render('blend2_f1.png', 1)
render('blend2_f17.png', 17)
render('blend2_f34.png', 34)
log('done')
