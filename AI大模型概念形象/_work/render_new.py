import bpy, os, sys
import numpy as np
from mathutils import Vector, Matrix

glb = sys.argv[sys.argv.index('--') + 1]
prefix = sys.argv[sys.argv.index('--') + 2]
OUT = r'D:\my_code\我的学习\AI大模型概念形象\_work\preview'
fps = 60

def look_at_quat(cam_loc, target):
    direction = (Vector(target) - Vector(cam_loc)).normalized()
    z = -direction
    x = Vector((1, 0, 0))
    if abs(z.dot(x)) > 0.9:
        x = Vector((0, 1, 0))
    y = z.cross(x).normalized()
    x = y.cross(z).normalized()
    m = Matrix((x, y, z)).transposed()
    return m.to_quaternion()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = fps
scene.render.fps_base = 1.0
bpy.ops.import_scene.gltf(filepath=glb)
scene.frame_start = 1
scene.frame_end = 67
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'

mesh = max([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: len(o.data.vertices))
print('using mesh:', mesh.name, len(mesh.data.vertices), flush=True)
co = np.empty(len(mesh.data.vertices) * 3, dtype=np.float64)
mesh.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
mw = np.array(mesh.matrix_world)
w = (np.hstack([co, np.ones((len(co),1))]) @ mw.T)[:, :3]
lo = w.min(axis=0)
hi = w.max(axis=0)
center = (lo + hi) / 2
r = float(np.linalg.norm(hi - lo) / 2)
print('mesh bbox lo', lo, 'hi', hi, 'center', center, 'r', r, flush=True)

def setup_cam():
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = r * 2.2
    cam_obj = bpy.data.objects.new('cam', cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    cam_obj.location = (center[0] + r*2.0, center[1] - r*2.0, center[2] + r*1.1)
    cam_obj.rotation_mode = 'QUATERNION'
    cam_obj.rotation_quaternion = look_at_quat(cam_obj.location, center)
    return cam_obj

def add_lights():
    bpy.ops.object.light_add(type='SUN', location=(3, -2, 5))
    bpy.context.object.data.energy = 4.0
    bpy.ops.object.light_add(type='SUN', location=(-3, -3, 3))
    bpy.context.object.data.energy = 1.5

# WORKBENCH pass (solid shading)
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'FLAT'
setup_cam()
frames = [0, 1, 17, 34, 50, 66]
for fr in frames:
    scene.frame_set(fr)
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUT, f'{prefix}_f{fr:02d}.png')
    bpy.ops.render.render(write_still=True)
    print('wb rendered', prefix, fr, flush=True)

# EEVEE pass with material
scene.render.engine = 'BLENDER_EEVEE'
add_lights()
scene.frame_set(34)
scene.render.filepath = os.path.join(OUT, f'{prefix}_eevee_f34.png')
bpy.ops.render.render(write_still=True)
print('eevee rendered', flush=True)
