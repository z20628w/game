import bpy
import numpy as np

FBX = r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx'
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\probe_models.txt'

def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)

with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== probe new models ==\n')

# FBX armature height
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
arm = bpy.data.objects['Armature']
heads = [(arm.matrix_world @ b.head_local) for b in arm.data.bones]
zs = [h.z for h in heads]
log('FBX arm.scale: %s' % (tuple(round(x, 6) for x in arm.scale),))
log('FBX bone heads z range: %.4f .. %.4f (height %.4f)' % (min(zs), max(zs), max(zs) - min(zs)))
# bone head y range (in case different orientation)
ys = [h.y for h in heads]
log('FBX bone heads y range: %.4f .. %.4f' % (min(ys), max(ys)))
log('FBX total bones: %d' % len(arm.data.bones))

models = [
    ('doubao', r'D:\my_code\我的学习\AI大模型概念形象\Doubao\3D模型\doubao.glb'),
    ('CYD-Male', r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Male\3D模型\CYD-Male.glb'),
    ('CYD-female', r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Female\3D模型\CYD-female.glb'),
]
for name, p in models:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=p)
    mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    co = np.empty(len(mesh.data.vertices) * 3, dtype=np.float64)
    mesh.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    log('== %s ==' % name)
    log('  mesh name: %s, verts: %d' % (mesh.name, len(co)))
    log('  local bbox x[%.4f,%.4f] y[%.4f,%.4f] z[%.4f,%.4f]' % (co[:,0].min(), co[:,0].max(), co[:,1].min(), co[:,1].max(), co[:,2].min(), co[:,2].max()))
    # world bbox (transform)
    mw = np.array(mesh.matrix_world)
    co4 = np.hstack([co, np.ones((len(co),1))]).T
    w = (mw @ co4).T[:, :3]
    log('  world bbox x[%.4f,%.4f] y[%.4f,%.4f] z[%.4f,%.4f]' % (w[:,0].min(), w[:,0].max(), w[:,1].min(), w[:,1].max(), w[:,2].min(), w[:,2].max()))
