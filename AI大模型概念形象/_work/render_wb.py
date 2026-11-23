import bpy, math, os
from mathutils import Vector

OUT = r'D:\my_code\我的学习\AI大模型概念形象\_work\preview'
os.makedirs(OUT, exist_ok=True)

def look_at(cam_loc, target):
    # camera looks along -Z; compute rotation so -Z points from cam to target
    direction = (Vector(target) - Vector(cam_loc)).normalized()
    # build rotation matrix: Z axis = -direction, X/Y arbitrary orthogonal
    z = -direction
    x = Vector((1, 0, 0))
    if abs(z.dot(x)) > 0.9:
        x = Vector((0, 1, 0))
    y = z.cross(x).normalized()
    x = y.cross(z).normalized()
    m = __import__('mathutils').Matrix((x, y, z)).transposed()
    return m.to_quaternion()

def render_obj(name, obj_names, engine='BLENDER_WORKBENCH', frame=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # scene settings
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = 'PNG'
    if engine == 'BLENDER_WORKBENCH':
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'MATERIAL'
    # find bounds of given objects
    xs, ys, zs = [], [], []
    for o in bpy.data.objects:
        if o.name in obj_names and o.type == 'MESH':
            for v in o.data.vertices:
                w = o.matrix_world @ v.co
                xs.append(w.x); ys.append(w.y); zs.append(w.z)
    if not xs:
        print('no mesh found', flush=True); return
    center = Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
    radius = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))/2
    # camera ortho
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = radius * 2.6
    cam_obj = bpy.data.objects.new('cam', cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = (center.x + radius*2.2, center.y - radius*2.2, center.z + radius*1.2)
    cam_obj.rotation_mode = 'QUATERNION'
    cam_obj.rotation_quaternion = look_at(cam_obj.location, center)
    scene.camera = cam_obj
    # lights for workbench not needed
    if frame is not None:
        scene.frame_set(frame)
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print('rendered:', name, flush=True)

# test with default cube
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.5))
bpy.context.object.name = 'CubeTest'
render_obj('test_cube.png', ['CubeTest'], engine='BLENDER_WORKBENCH')

# render FBX char (workbench)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx', automatic_bone_orientation=True, ignore_leaf_bones=False)
names = [o.name for o in bpy.data.objects if o.type == 'MESH']
render_obj('fbx_wb_f1.png', names, engine='BLENDER_WORKBENCH', frame=1)
render_obj('fbx_wb_f30.png', names, engine='BLENDER_WORKBENCH', frame=30)

# render Qwen GLB (workbench)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb')
names = [o.name for o in bpy.data.objects if o.type == 'MESH']
render_obj('qwen_wb.png', names, engine='BLENDER_WORKBENCH')
