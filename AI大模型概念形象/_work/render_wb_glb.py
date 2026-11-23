import bpy, os
from mathutils import Vector

OUT = r'D:\my_code\我的学习\AI大模型概念形象\_work\preview'

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')
scene.frame_start = 1
scene.frame_end = 67
scene.render.fps = 60
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'

mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]

def look_at(cam_loc, target):
    direction = (Vector(target) - Vector(cam_loc)).normalized()
    z = -direction
    x = Vector((1, 0, 0))
    if abs(z.dot(x)) > 0.9:
        x = Vector((0, 1, 0))
    y = z.cross(x).normalized()
    x = y.cross(z).normalized()
    m = __import__('mathutils').Matrix((x, y, z)).transposed()
    return m.to_quaternion()

def bbox(frame):
    scene.frame_set(frame)
    deps = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(deps)
    xs, ys, zs = [], [], []
    for v in ev.data.vertices:
        w = mesh.matrix_world @ v.co
        xs.append(w.x); ys.append(w.y); zs.append(w.z)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_obj = bpy.data.objects.new('cam', cam_data)
bpy.context.collection.objects.link(cam_obj)
scene.camera = cam_obj

for frame in [1, 17, 34, 50, 67]:
    b = bbox(frame)
    cx = (b[0]+b[1])/2; cy = (b[2]+b[3])/2; cz = (b[4]+b[5])/2
    r = max(b[1]-b[0], b[3]-b[2], b[5]-b[4])/2
    print(f'frame {frame}: bbox x[{b[0]:.3f},{b[1]:.3f}] y[{b[2]:.3f},{b[3]:.3f}] z[{b[4]:.3f},{b[5]:.3f}] r={r:.3f}')
    cam_data.ortho_scale = r * 2.2
    cam_obj.location = (cx + r*2.0, cy - r*2.0, cz + r*1.1)
    cam_obj.rotation_mode = 'QUATERNION'
    cam_obj.rotation_quaternion = look_at(cam_obj.location, (cx, cy, cz))
    scene.frame_set(frame)
    scene.render.filepath = os.path.join(OUT, f'wb_glb_f{frame}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', frame)
