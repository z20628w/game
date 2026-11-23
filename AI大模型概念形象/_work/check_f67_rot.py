import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\f67_rot_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== frame 67 rotation check ==\n')

scene = bpy.context.scene
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
scene.frame_start = 1
scene.frame_end = 67

# collect full pose quaternion for all bones at frames 34, 66, 67
pose_by_frame = {}
for fr in [34, 66, 67]:
    scene.frame_set(fr)
    bpy.context.view_layer.update()
    qs = {}
    for pb in arm.pose.bones:
        qs[pb.name] = tuple(round(x, 5) for x in pb.rotation_quaternion)
    pose_by_frame[fr] = qs

names = [pb.name for pb in arm.pose.bones]
maxdiff = 0.0
for nm in names:
    q34 = pose_by_frame[34][nm]
    q66 = pose_by_frame[66][nm]
    q67 = pose_by_frame[67][nm]
    # difference as max abs component diff (after sign flip)
    d66_67 = min(max(abs(a-b) for a, b in zip(q66, q67)),
                 max(abs(a+b) for a, b in zip(q66, q67)))
    d34_67 = min(max(abs(a-b) for a, b in zip(q34, q67)),
                 max(abs(a+b) for a, b in zip(q34, q67)))
    flag = ''
    if d66_67 > 0.01:
        flag = f' <-- 66vs67 diff {d66_67:.4f}'
    log(f'{nm:16s} f66={q66} f67={q67}  d34_67={d34_67:.5f}{flag}')
    maxdiff = max(maxdiff, d66_67)
log(f'max 66vs67 quat diff: {maxdiff:.5f}')
