import bpy

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\action_api_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== action API explore ==\n')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx', automatic_bone_orientation=True, ignore_leaf_bones=False)
for o in [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Armature']

a = arm.animation_data.action
log(f'action: {a.name} type={type(a)}')
log(f'has layers: {len(a.layers)}')
for li, L in enumerate(a.layers):
    log(f'  layer[{li}] strips={len(L.strips)}')
    for si, s in enumerate(L.strips):
        log(f'    strip[{si}] type={type(s)} dir={[x for x in dir(s) if not x.startswith("_")][:40]}')
        sub = getattr(s, 'action', None)
        log(f'    strip.channelbags: {[type(x).__name__ for x in s.channelbags]}')
        for ci, cb in enumerate(s.channelbags):
            log(f'      cb[{ci}] type={type(cb)} dir={[x for x in dir(cb) if not x.startswith("_")][:50]}')
            fcs = cb.fcurves
            log(f'      fcurves: {len(fcs)}')
            from collections import Counter
            cnt = Counter()
            for f in fcs:
                cnt[f.data_path] += 1
            for path, n in list(cnt.items())[:70]:
                log(f'        {path} x{n}')
            # groups
            log(f'      groups: {len(cb.groups)}')
            for g in cb.groups[:5]:
                log(f'        group {g.name!r} channels={len(g.channels) if hasattr(g, "channels") else "?"}')
            log(f'    strip action: {sub.name} type={type(sub)} dir={[x for x in dir(sub) if not x.startswith("_")][:60]}')
            fcs = getattr(sub, 'fcurves', None)
            if fcs is not None:
                log(f'    fcurves: {len(fcs)}')
                for f in fcs[:10]:
                    log(f'      fcurve data_path={f.data_path!r} array_index={f.array_index} keyframes={len(f.keyframe_points)}')
            # channelbag?
            cb = getattr(sub, 'channels', None)
            if cb is not None:
                log(f'    channels: {list(cb.keys())}')
