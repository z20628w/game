import bpy, math, os

OUT = r'D:\my_code\我的学习\AI大模型概念形象\_work\preview'

def setup_view(center, radius):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.object.light_add(type='SUN', location=(3, -4, 6))
    sun = bpy.context.object
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(45), 0, math.radians(-35))
    # second fill light
    bpy.ops.object.light_add(type='AREA', location=(center[0]-2, center[1]+1, center[2]+2))
    fill = bpy.context.object
    fill.data.energy = 80.0
    fill.data.size = 2.0
    # camera
    bpy.ops.object.camera_add(location=(center[0]+2.6*radius, center[1]-2.6*radius, center[2]+1.1*radius))
    cam = bpy.context.object
    cam.rotation_euler = (math.radians(90), 0, math.radians(45))
    bpy.context.scene.camera = cam
    # track camera to center
    track = cam.constraints.new(type='TRACK_TO')
    track.target = bpy.data.objects.new(name='target', object_data=None)
    bpy.context.collection.objects.link(track.target)
    track.target.location = center
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    # render settings
    bpy.context.scene.render.resolution_x = 720
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.render.image_settings.file_format = 'PNG'
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.render.engine = 'BLENDER_EEVEE'
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new('World')
    bpy.context.scene.world.use_nodes = True
    bg = bpy.context.scene.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.92, 0.94, 0.97, 1.0)
    bg.inputs[1].default_value = 1.0

def scene_bounds():
    xs, ys, zs = [], [], []
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            for v in obj.data.vertices:
                w = obj.matrix_world @ v.co
                xs.append(w.x); ys.append(w.y); zs.append(w.z)
    if not xs:
        return None
    return ((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2,
            max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))/2)

def render_scene(name, frame=None):
    if frame is not None:
        bpy.context.scene.frame_set(frame)
    os.makedirs(OUT, exist_ok=True)
    bpy.context.scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print('rendered:', name, flush=True)

# ---- FBX character ----
bpy.ops.import_scene.fbx(filepath=r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx', automatic_bone_orientation=True, ignore_leaf_bones=False)
bounds = scene_bounds()
print('fbx bounds:', bounds, flush=True)
setup_view(bounds[:3], max(bounds[3], 1.0))
render_scene('fbx_char_f1.png', frame=1)
render_scene('fbx_char_f30.png', frame=30)

# ---- Qwen GLB ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb')
bounds = scene_bounds()
print('qwen bounds:', bounds, flush=True)
setup_view(bounds[:3], max(bounds[3], 0.8))
render_scene('qwen_glb.png')
