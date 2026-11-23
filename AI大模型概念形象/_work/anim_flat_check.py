import bpy, json, struct
import numpy as np

# ---- Part 1: FBX source animation ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx',
                         automatic_bone_orientation=True, ignore_leaf_bones=False)
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 67
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\anim_flat_check.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== animation flatness check ==\n')

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
a = arm.animation_data.action
log('FBX action fcurves: %d' % len(a.layers[0].strips[0].channelbags[0].fcurves))
# sample bone rotations at frames
def sample_rot(bone):
    vals = {}
    for fr in [1, 17, 34, 50, 67]:
        scene.frame_set(fr)
        bpy.context.view_layer.update()
        q = arm.pose.bones[bone].rotation_quaternion
        vals[fr] = tuple(round(x, 5) for x in q)
    return vals

for bone in ['LeftLeg', 'LeftArm', 'RightArm', 'Hips']:
    v = sample_rot(bone)
    log(f'FBX {bone:10s} rot: ' + '  '.join(f'f{fr}={q}' for fr, q in v.items()))
    loc = arm.pose.bones[bone].location
    log(f'FBX {bone:10s} loc: ' + '  '.join(f'f{fr}={tuple(round(x,4) for x in loc)}' for fr in [1,17,34,50,67]))

# ---- Part 2: GLB animation curve values ----
def load_glb(path):
    with open(path, 'rb') as f:
        f.read(12)
        while True:
            hdr = f.read(8)
            if not hdr:
                break
            clen, ctype = struct.unpack('<II', hdr)
            data = f.read(clen)
            if ctype == 0x4E4F534A:
                return json.loads(data)
GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
j = load_glb(GLB)
# print anim sampler input counts distribution
anim = j['animations'][0]
samplers = anim['samplers']
from collections import Counter
cnt = Counter()
for s in samplers:
    cnt[j['accessors'][s['input']]['count']] += 1
log(f'GLB sampler input-count distribution: {dict(cnt)}')
