import bpy, math

OUT = r'D:\my_code\我的学习\AI大模型概念形象\_work\preview'

def setup_view():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # light
    bpy.ops.object.light_add(type='SUN', location=(2, -2, 4))
    sun = bpy.context.object
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    # camera
    bpy.ops.object.camera_add(location=(2.2, -2.6, 1.0))
    cam = bpy.context.object
    cam.rotation_euler = (math.radians(90), 0, math.radians(60))
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x = 640
    bpy.context.scene.render.resolution_y = 800
    bpy.context.scene.render.image_settings.file_format = 'PNG'
    bpy.context.scene.render.film_transparent = True

def render_scene(name, frame=None):
    if frame is not None:
        bpy.context.scene.frame_set(frame)
    import os
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('rendered:', path, flush=True)

# ---- render FBX character at frame 1 and 30 ----
setup_view()
bpy.ops.import_scene.fbx(filepath=r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx', automatic_bone_orientation=True, ignore_leaf_bones=False)
render_scene('fbx_char_f1.png', frame=1)
render_scene('fbx_char_f30.png', frame=30)

# ---- render Qwen GLB ----
setup_view()
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb')
render_scene('qwen_glb.png')
