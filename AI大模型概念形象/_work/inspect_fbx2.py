import bpy

# clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)

fbx_path = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True, ignore_leaf_bones=False)

print('== actions ==', flush=True)
for a in bpy.data.actions:
    attrs = [x for x in dir(a) if not x.startswith('_')]
    print(f'  action: name={a.name!r} frame_range={a.frame_range} attrs_sample={attrs[:40]}', flush=True)
    fc = getattr(a, 'fcurves', None)
    if fc is not None:
        print(f'    fcurves count={len(fc)}', flush=True)
        paths = sorted(set(f.data_path for f in fc))
        print('    data_paths:', paths[:40], flush=True)
    nla = a.frame_range
    print(f'    frame_range={nla}', flush=True)

print('== scene ==', flush=True)
print(f'  frame_start={bpy.context.scene.frame_start} frame_end={bpy.context.scene.frame_end} fps={bpy.context.scene.render.fps}', flush=True)

print('== mesh details ==', flush=True)
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        m = obj.data
        print(f'  mesh: name={obj.name!r} verts={len(m.vertices)} polys={len(m.polygons)} groups={[g.name for g in m.vertex_groups][:8]}', flush=True)
        bb = [m.vertices[v].co for v in range(len(m.vertices))]
        xs = [v.co.x for v in m.vertices]; ys = [v.co.y for v in m.vertices]; zs = [v.co.z for v in m.vertices]
        print(f'    bbox local: x[{min(xs):.2f},{max(xs):.2f}] y[{min(ys):.2f},{max(ys):.2f}] z[{min(zs):.2f},{max(zs):.2f}]', flush=True)
        world = obj.matrix_world
        print(f'    world scale={world.to_scale()} loc={world.translation}', flush=True)
