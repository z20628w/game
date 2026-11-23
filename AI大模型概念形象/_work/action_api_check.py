import bpy

bpy.ops.wm.open_mainfile(filepath=r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend')
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\action_api_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== action api check ==\n')

arm = bpy.data.objects['Armature']
a = arm.animation_data.action
log(f'action: {a.name}')
log(f'action.layers count: {len(a.layers)}')
for li, L in enumerate(a.layers):
    log(f'  layer[{li}]: strips={len(L.strips)}')
    for si, s in enumerate(L.strips):
        log(f'    strip[{si}]: channelbags={len(s.channelbags)}')
        for bi, cb in enumerate(s.channelbags):
            paths = {}
            for f in cb.fcurves:
                paths[f.data_path] = paths.get(f.data_path, 0) + 1
            log(f'      bag[{bi}]: {len(cb.fcurves)} fcurves')
            for p, n in sorted(paths.items()):
                log(f'        {p} x{n}')

# check pose bones location at frame 1
bpy.context.scene.frame_set(1)
for name in ['Hips', 'Spine2', 'LeftArm', 'Head']:
    pb = arm.pose.bones[name]
    log(f'pose {name}: location={tuple(round(x,4) for x in pb.location)}')
