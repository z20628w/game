import bpy, os
from mathutils import Vector

OUT = r'D:\my_code\我的学习\AI大模型概念形象\_work\preview'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 60
scene.render.fps_base = 1.0
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_std.glb')
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'

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

cx, cy, cz = 0.0, 0.02, 0.55
r = 0.62
cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = r * 2.2
cam_obj = bpy.data.objects.new('cam', cam_data)
bpy.context.collection.objects.link(cam_obj)
scene.camera = cam_obj
cam_obj.location = (cx + r*2.0, cy - r*2.0, cz + r*1.1)
cam_obj.rotation_mode = 'QUATERNION'
cam_obj.rotation_quaternion = look_at(cam_obj.location, (cx, cy, cz))

# frame 0 = rest (no animation influence)
for fr, tag in [(0, 'rest'), (1, 'f01')]:
    scene.frame_set(fr)
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUT, f'final_{tag}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', tag, flush=True)
