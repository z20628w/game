import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Doubao\3D模型\doubao_walk.glb')
for o in bpy.data.objects:
    if o.type == 'MESH':
        print('MESH', o.name, 'verts', len(o.data.vertices), 'loc', tuple(round(x,4) for x in o.location))
    else:
        print(o.type, o.name)
