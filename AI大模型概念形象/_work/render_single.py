import bpy, os, sys
from mathutils import Vector

frame = int(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else 1
frame_end_override = None
if '--fe' in sys.argv:
    frame_end_override = int(sys.argv[sys.argv.index('--fe') + 1])
OUT = r'D:\my_code\我的学习\AI大模型概念形象\_work\preview'

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 60  # must be set BEFORE import so GLB seconds map to frames 1..67
scene.render.fps_base = 1.0
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_std.glb')
scene.frame_start = 1
scene.frame_end = frame_end_override if frame_end_override else 67
scene.render.fps = 60
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

# Blender imports GLB as Z-up: model center in Blender space ~ (0, 0.02, 0.55)
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

scene.frame_set(frame)
scene.render.filepath = os.path.join(OUT, f'final_f{frame:02d}.png')
bpy.ops.render.render(write_still=True)
print('rendered frame', frame, flush=True)
