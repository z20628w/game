import bpy

bpy.ops.wm.open_mainfile(filepath=r'D:\my_code\我的学习\AI大模型概念形象\_work\qwen_rigged.blend')
LOG = r'D:\my_code\我的学习\AI大模型概念形象\_work\vgroups_log.txt'
def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('== vertex groups ==\n')

mesh = bpy.data.objects['Mesh_0']
log(f'mesh: {mesh.name} vgroups={len(mesh.vertex_groups)} verts={len(mesh.data.vertices)}')
for i, g in enumerate(mesh.vertex_groups):
    if i < 70 or g.name in ('Hips', 'Spine', 'LeftUpLeg', 'Head'):
        log(f'  [{i}] {g.name}')
if len(mesh.vertex_groups) > 70:
    log(f'  ... total {len(mesh.vertex_groups)}')

# check how many verts have weights and in which groups
from collections import Counter
cnt = Counter()
for v in mesh.data.vertices:
    cnt[len(v.groups)] += 1
log(f'verts by group-count: {dict(sorted(cnt.items()))}')
