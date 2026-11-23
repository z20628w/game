import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 67

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\glb_fcurves_check.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== GLB fcurve keyframes ==\n')

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
a = arm.animation_data.action
log('n fcurves: %d' % len(a.layers[0].strips[0].channelbags[0].fcurves))
for L in a.layers:
    for s in L.strips:
        for cb in s.channelbags:
            fcs = cb.fcurves
            for fc in fcs:
                if fc.data_path.startswith('pose.bones["LeftLeg"]'):
                    n = len(fc.keyframe_points)
                    kfs = sorted((kp.co[0], round(kp.co[1], 5)) for kp in fc.keyframe_points)
                    log(f'LeftLeg arr={fc.array_index} n={n}')
                    log('  first10: ' + str(kfs[:10]))
                    log('  last10:  ' + str(kfs[-10:]))
            break
        break
    break
