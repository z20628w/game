import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\glb_frames_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== GLB frames ==\n')

arm = bpy.data.objects['Armature']
mesh = bpy.data.objects['Mesh_0']
scene = bpy.context.scene

def bbox(frame):
    scene.frame_set(frame)
    deps = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(deps)
    xs, ys, zs = [], [], []
    for v in ev.data.vertices:
        w = mesh.matrix_world @ v.co
        xs.append(w.x); ys.append(w.y); zs.append(w.z)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

for f in [0, 1, 17, 34, 67]:
    b = bbox(f)
    log(f'frame {f}: x[{b[0]:.3f},{b[1]:.3f}] y[{b[2]:.3f},{b[3]:.3f}] z[{b[4]:.3f},{b[5]:.3f}]')

for f in [0, 1, 34]:
    scene.frame_set(f)
    deps = bpy.context.evaluated_depsgraph_get()
    pb = arm.pose.bones['Hips']
    m = arm.matrix_world @ pb.matrix
    log(f'frame {f} Hips world matrix T=({m.translation.x:.4f},{m.translation.y:.4f},{m.translation.z:.4f})')
    log(f'  Hips pose quat: ({pb.rotation_quaternion.x:.4f},{pb.rotation_quaternion.y:.4f},{pb.rotation_quaternion.z:.4f},{pb.rotation_quaternion.w:.4f})')
    pb2 = arm.pose.bones['LeftLeg']
    m2 = arm.matrix_world @ pb2.matrix
    log(f'frame {f} LeftLeg world T=({m2.translation.x:.4f},{m2.translation.y:.4f},{m2.translation.z:.4f})')

# rest pose check: disable action temporarily
arm.animation_data.action = None
b = bbox(0)
log(f'REST (no action): x[{b[0]:.3f},{b[1]:.3f}] y[{b[2]:.3f},{b[3]:.3f}] z[{b[4]:.3f},{b[5]:.3f}]')
