import bpy, numpy as np

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 60
scene.render.fps_base = 1.0

# import original Qwen.glb
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb')
orig = [o for o in bpy.data.objects if o.type == 'MESH'][0]
ov = np.array([v.co for v in orig.data.vertices])
print('orig verts:', len(ov), 'bbox z', ov[:,2].min(), ov[:,2].max(), flush=True)
# apply transform to world
mw = np.array(orig.matrix_world)
ov4 = np.hstack([ov, np.ones((len(ov),1))]).T
ow = (mw @ ov4).T[:, :3]
print('orig world bbox x[%.3f,%.3f] y[%.3f,%.3f] z[%.3f,%.3f]' % (ow[:,0].min(), ow[:,0].max(), ow[:,1].min(), ow[:,1].max(), ow[:,2].min(), ow[:,2].max()), flush=True)

# import rigged GLB
bpy.ops.import_scene.gltf(filepath=r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')
rig = [o for o in bpy.data.objects if o.type == 'MESH' and o.name != orig.name][0]
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
scene.frame_set(0)
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
ev = rig.evaluated_get(deps)
rv = np.array([v.co for v in ev.data.vertices])
print('rig rest verts:', len(rv), 'bbox z', rv[:,2].min(), rv[:,2].max(), flush=True)
mw2 = np.array(rig.matrix_world)
rv4 = np.hstack([rv, np.ones((len(rv),1))]).T
rw = (mw2 @ rv4).T[:, :3]
print('rig rest world bbox x[%.3f,%.3f] y[%.3f,%.3f] z[%.3f,%.3f]' % (rw[:,0].min(), rw[:,0].max(), rw[:,1].min(), rw[:,1].max(), rw[:,2].min(), rw[:,2].max()), flush=True)

# vertex-by-vertex compare: for sampled rig verts find nearest orig vert
# brute force sample: for 100 sampled rig verts find nearest orig vert
idx = np.linspace(0, len(rw)-1, 2000).astype(int)
dists = []
for i in idx:
    d = np.min(np.linalg.norm(ow - rw[i], axis=1))
    dists.append(d)
dists = np.array(dists)
print('rig->orig nearest dist: median %.4f  p95 %.4f  max %.4f' % (np.median(dists), np.percentile(dists, 95), dists.max()), flush=True)
# same but orig->rig for sampled
idx2 = np.linspace(0, len(ow)-1, 2000).astype(int)
dists2 = []
for i in idx2:
    d = np.min(np.linalg.norm(rw - ow[i], axis=1))
    dists2.append(d)
dists2 = np.array(dists2)
print('orig->rig nearest dist: median %.4f  p95 %.4f  max %.4f' % (np.median(dists2), np.percentile(dists2, 95), dists2.max()), flush=True)
