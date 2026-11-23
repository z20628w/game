import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\f67_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== frame 67 check ==\n')

scene = bpy.context.scene
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
scene.frame_start = 1
scene.frame_end = 67

for fr in [1, 34, 66, 67]:
    scene.frame_set(fr)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    log(f'-- frame {fr} --')
    for name in ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftArm', 'RightArm', 'Head']:
        pb = arm.pose.bones[name]
        m = arm.matrix_world @ pb.matrix
        log(f'  {name:11s} T=({m.translation.x:7.4f},{m.translation.y:7.4f},{m.translation.z:7.4f})')
    ev = mesh.evaluated_get(deps)
    xs, ys, zs = [], [], []
    for v in ev.data.vertices:
        w = mesh.matrix_world @ v.co
        xs.append(w.x); ys.append(w.y); zs.append(w.z)
    log(f'  mesh bbox x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]')

# animation keyframe count per bone
a = arm.animation_data.action
for L in a.layers:
    for s in L.strips:
        for cb in s.channelbags:
            for f in cb.fcurves:
                if f.data_path.startswith('pose.bones["Hips"]'):
                    n = len(f.keyframe_points)
                    log(f'  Hips fcurve {f.array_index}: {n} keyframes')
