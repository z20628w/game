import bpy
import numpy as np

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\anim_check_log.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== anim check ==\n')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx', automatic_bone_orientation=True, ignore_leaf_bones=False)
for o in [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Armature']
s = 1.1515 / 1.7887
arm.scale = tuple(x * s for x in arm.scale)
bpy.context.view_layer.update()

# drive the pose over frames and record bone transforms
bones_of_interest = ['root', 'Hips', 'LeftUpLeg', 'RightUpLeg', 'Spine', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand']
log('sample pose at frames 1,17,34,50,67 (bone world translation + rotation angle)')
for f in [1, 17, 34, 50, 67]:
    bpy.context.scene.frame_set(f)
    parts = []
    for name in bones_of_interest:
        if name not in arm.pose.bones:
            continue
        pb = arm.pose.bones[name]
        w = arm.matrix_world @ pb.matrix
        t = w.translation
        import math
        angle = math.degrees(w.to_quaternion().angle)
        parts.append(f'{name}:t=({t.x:.2f},{t.y:.2f},{t.z:.2f}) rot={angle:.1f}deg')
    log(f'frame {f}: ' + ' | '.join(parts))
