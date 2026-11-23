import bpy, json, sys, os

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\pose_compare_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== pose compare ==\n')

def dump_rest(tag, arm):
    log(f'-- REST {tag} --')
    for name in ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftArm', 'Head']:
        b = arm.data.bones[name]
        m = b.matrix_local
        log(f'{name:12s} head=({b.head_local.x:.3f},{b.head_local.y:.3f},{b.head_local.z:.3f}) '
            f'col0=({m[0][0]:.4f},{m[1][0]:.4f},{m[2][0]:.4f}) col1=({m[0][1]:.4f},{m[1][1]:.4f},{m[2][1]:.4f}) col2=({m[0][2]:.4f},{m[1][2]:.4f},{m[2][2]:.4f})')

# mode 1: v11 blend
bpy.ops.wm.open_mainfile(filepath=r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend')
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
arm = bpy.data.objects['Armature']
log('--- BLEND (v11) frame 1 ---')
for name in ['Hips', 'Spine2', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftArm', 'LeftForeArm', 'Head', 'Neck']:
    pb = arm.pose.bones[name]
    m = arm.matrix_world @ pb.matrix
    log(f'{name:12s} T=({m.translation.x:8.4f},{m.translation.y:8.4f},{m.translation.z:8.4f}) '
        f'rot col0=({m[0][0]:.4f},{m[1][0]:.4f},{m[2][0]:.4f}) col1=({m[0][1]:.4f},{m[1][1]:.4f},{m[2][1]:.4f})')
dump_rest('BLEND', arm)

# mode 2: GLB import
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
log('--- GLB import frame 1 ---')
for name in ['Hips', 'Spine2', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftArm', 'LeftForeArm', 'Head', 'Neck']:
    pb = arm.pose.bones[name]
    m = arm.matrix_world @ pb.matrix
    log(f'{name:12s} T=({m.translation.x:8.4f},{m.translation.y:8.4f},{m.translation.z:8.4f}) '
        f'rot col0=({m[0][0]:.4f},{m[1][0]:.4f},{m[2][0]:.4f}) col1=({m[0][1]:.4f},{m[1][1]:.4f},{m[2][1]:.4f})')
dump_rest('GLB', arm)
