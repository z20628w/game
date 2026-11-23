import bpy

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\glb_roundtrip_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== GLB roundtrip check ==\n')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')

for o in bpy.data.objects:
    print(f'  obj: {o.name!r} type={o.type} scale={tuple(round(x,5) for x in o.scale)} loc={tuple(round(x,4) for x in o.location)} rot={tuple(round(x,4) for x in o.rotation_euler)}', flush=True)

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
log(f'armature scale: {tuple(round(x,6) for x in arm.scale)}')
for name in ['root', 'Hips', 'LeftUpLeg', 'Head', 'Head_end']:
    if name in arm.data.bones:
        b = arm.data.bones[name]
        w = arm.matrix_world @ b.head_local
        log(f'bone {name}: local head={tuple(round(x,3) for x in b.head_local)} world={tuple(round(x,4) for x in w)}')
        if name in arm.pose.bones:
            pw = arm.matrix_world @ arm.pose.bones[name].matrix
            log(f'  pose world translation={tuple(round(x,4) for x in pw.translation)}')

# mesh bbox at frame 1
bpy.context.scene.frame_set(1)
deps = bpy.context.evaluated_depsgraph_get()
ev = mesh.evaluated_get(deps)
xs, ys, zs = [], [], []
for v in ev.data.vertices:
    w = mesh.matrix_world @ v.co
    xs.append(w.x); ys.append(w.y); zs.append(w.z)
log(f'mesh frame1 bbox: x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]')
log(f'mesh.matrix_world: {tuple(tuple(round(x,5) for x in r) for r in mesh.matrix_world)}')

# check action channels on imported armature
if arm.animation_data and arm.animation_data.action:
    a = arm.animation_data.action
    log(f'action: {a.name}')
    cnt = {}
    for L in a.layers:
        for s in L.strips:
            for cb in s.channelbags:
                for f in cb.fcurves:
                    cnt[f.data_path] = cnt.get(f.data_path, 0) + 1
    for path, n in sorted(cnt.items()):
        log(f'  {path} x{n}')
else:
    log('NO action on imported armature!')
