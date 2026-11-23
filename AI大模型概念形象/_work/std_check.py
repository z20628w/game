import bpy, numpy as np

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 60
scene.render.fps_base = 1.0
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_std.glb')

LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\std_check.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== std GLB check v2 ==\n')

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
mesh = [o for o in bpy.data.objects if o.type == 'MESH' and o.name == 'Mesh_0'][0]
if not mesh:
    mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
log('arm name: %s  scale: %s' % (arm.name, tuple(round(x,6) for x in arm.scale)))
log('mesh name: %s' % mesh.name)
log('mesh verts: %d' % len(mesh.data.vertices))
log('mesh raw bbox z[%.4f,%.4f]' % (mesh.data.vertices[0].co.z, max(v.co.z for v in mesh.data.vertices)))

scene.frame_set(0)
bpy.context.view_layer.update()
for name in ['root', 'Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'Spine', 'Head']:
    pb = arm.pose.bones.get(name)
    if pb:
        m = arm.matrix_world @ pb.matrix
        log('pose %-10s T=(%.4f, %.4f, %.4f)' % (name, m.translation.x, m.translation.y, m.translation.z))
    b = arm.data.bones.get(name)
    if b:
        mw = arm.matrix_world @ b.matrix_local
        log('rest %-10s T=(%.4f, %.4f, %.4f)' % (name, mw.translation.x, mw.translation.y, mw.translation.z))

# evaluated mesh at rest
deps = bpy.context.evaluated_depsgraph_get()
ev = mesh.evaluated_get(deps)
log('evaluated verts: %d' % len(ev.data.vertices))
if len(ev.data.vertices) > 100:
    xs = [v.co.x for v in ev.data.vertices]
    ys = [v.co.y for v in ev.data.vertices]
    zs = [v.co.z for v in ev.data.vertices]
    log('eval bbox x[%.3f,%.3f] y[%.3f,%.3f] z[%.3f,%.3f]' % (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
