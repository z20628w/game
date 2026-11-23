import bpy, sys

# clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)

fbx_path = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
print('== importing FBX ==', flush=True)
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True, ignore_leaf_bones=False)

print('== scene objects ==', flush=True)
for obj in bpy.data.objects:
    print(f'  obj: name={obj.name!r} type={obj.type} parent={obj.parent.name if obj.parent else None}', flush=True)

print('== armatures ==', flush=True)
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        print(f'  armature: {obj.name!r} pose bones: {len(obj.pose.bones)} edit bones: {len(obj.data.bones)}', flush=True)
        print('  bone tree:', flush=True)
        def walk(bone, depth):
            print('  ' * (depth+1) + f'{bone.name} head={tuple(round(v,4) for v in bone.head_local)} tail={tuple(round(v,4) for v in bone.tail_local)}', flush=True)
            for c in bone.children:
                walk(c, depth+1)
        for b in obj.data.bones:
            if b.parent is None:
                walk(b, 0)

print('== actions ==', flush=True)
for a in bpy.data.actions:
    print(f'  action: name={a.name!r} frame_range={a.frame_range} fcurves={len(a.fcurves)}', flush=True)
    names = sorted(set((f.data_path.split('"')[1] if '"' in f.data_path else f.data_path) for f in a.fcurves))
    print('  animated properties:', names[:30], flush=True)

print('== scene frame info ==', flush=True)
print(f'  frame_start={bpy.context.scene.frame_start} frame_end={bpy.context.scene.frame_end} fps={bpy.context.scene.render.fps}', flush=True)

print('== meshes ==', flush=True)
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        m = obj.data
        print(f'  mesh: name={obj.name!r} verts={len(m.vertices)} polys={len(m.polygons)}', flush=True)
        has_skin = any(v.groups for v in m.vertices)
        print(f'    has vertex groups: {len(m.vertex_groups)}, has skin weights: {has_skin}', flush=True)
        if len(m.vertex_groups):
            print('    groups:', [g.name for g in m.vertex_groups][:40], flush=True)
        print(f'    modifiers: {[mod.type for mod in obj.modifiers]}', flush=True)
