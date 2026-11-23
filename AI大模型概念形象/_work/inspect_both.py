import bpy

# clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)

fbx_path = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True, ignore_leaf_bones=False)

print('== actions ==', flush=True)
for a in bpy.data.actions:
    print(f'  action: name={a.name!r} frame_range={tuple(round(x,3) for x in a.frame_range)}', flush=True)
    try:
        for L in a.layers:
            for s in L.strips:
                print(f'    strip: frame_start={s.frame_start} frame_end={s.frame_end} action={s.action.name if getattr(s, "action", None) else None}', flush=True)
    except Exception as e:
        print(f'    layer inspect failed: {e}', flush=True)

print('== scene ==', flush=True)
print(f'  frame_start={bpy.context.scene.frame_start} frame_end={bpy.context.scene.frame_end} fps={bpy.context.scene.render.fps}', flush=True)

print('== mesh details ==', flush=True)
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        m = obj.data
        xs = [v.co.x for v in m.vertices]; ys = [v.co.y for v in m.vertices]; zs = [v.co.z for v in m.vertices]
        groups = [g.name for g in obj.vertex_groups]
        print(f'  mesh: name={obj.name!r} verts={len(m.vertices)} polys={len(m.polygons)}', flush=True)
        print(f'    bbox local: x[{min(xs):.2f},{max(xs):.2f}] y[{min(ys):.2f},{max(ys):.2f}] z[{min(zs):.2f},{max(zs):.2f}]', flush=True)
        print(f'    groups({len(groups)}): {groups[:12]}', flush=True)
        print(f'    modifiers: {[mod.type for mod in obj.modifiers]}', flush=True)

# now import GLB
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb')
print('== after GLB import ==', flush=True)
for obj in bpy.data.objects:
    t = obj.type
    extra = ''
    if t == 'MESH':
        m = obj.data
        xs = [v.co.x for v in m.vertices]; ys = [v.co.y for v in m.vertices]; zs = [v.co.z for v in m.vertices]
        extra = f' bbox x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]'
        world = obj.matrix_world
        extra += f' world_scale={tuple(round(x,4) for x in world.to_scale())} loc={tuple(round(x,3) for x in world.translation)}'
    print(f'  obj: name={obj.name!r} type={t} parent={obj.parent.name if obj.parent else None}{extra}', flush=True)
