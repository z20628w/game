import bpy, os
from mathutils import Vector

OUT = r'D:\my_code\我的学习\AI大模型概念形象\_work\preview'
os.makedirs(OUT, exist_ok=True)

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

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')

# frame range from animation
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 67
bpy.context.scene.render.fps = 60

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.image_settings.file_format = 'PNG'

# bounds
xs, ys, zs = [], [], []
for o in bpy.data.objects:
    if o.type == 'MESH':
        m = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        for v in m.data.vertices:
            w = o.matrix_world @ v.co
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
center = Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
radius = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))/2
print('bounds center', tuple(round(c,3) for c in center), 'radius', round(radius,3))

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = radius * 2.6
cam_obj = bpy.data.objects.new('cam', cam_data)
bpy.context.collection.objects.link(cam_obj)
cam_obj.location = (center.x + radius*2.4, center.y - radius*2.4, center.z + radius*1.3)
cam_obj.rotation_mode = 'QUATERNION'
cam_obj.rotation_quaternion = look_at(cam_obj.location, center)
scene.camera = cam_obj

# light
bpy.ops.object.light_add(type='SUN', location=(2, -2, 4))
bpy.context.object.data.energy = 4.0

for frame in [1, 17, 34, 50, 67]:
    scene.frame_set(frame)
    # recompute bounds (character may move)
    xs, ys, zs = [], [], []
    deps = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.type == 'MESH':
            m = o.evaluated_get(deps)
            for v in m.data.vertices:
                w = o.matrix_world @ v.co
                xs.append(w.x); ys.append(w.y); zs.append(w.z)
    if xs:
        cx = (min(xs)+max(xs))/2; cy = (min(ys)+max(ys))/2; cz = (min(zs)+max(zs))/2
        cam_obj.location = (cx + radius*2.4, cy - radius*2.4, cz + radius*1.3)
        cam_obj.rotation_quaternion = look_at(cam_obj.location, (cx, cy, cz))
    scene.render.filepath = os.path.join(OUT, f'qwen_walk_f{frame}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered frame', frame)

print('done')
