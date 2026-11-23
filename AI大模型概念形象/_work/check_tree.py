import json, struct, numpy as np

GLB = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
with open(GLB, 'rb') as f:
    f.read(12)
    while True:
        hdr = f.read(8)
        if not hdr:
            break
        clen, ctype = struct.unpack('<II', hdr)
        data = f.read(clen)
        if ctype == 0x4E4F534A:
            j = json.loads(data)
        elif ctype == 0x004E4942:
            b = data

nodes = j['nodes']
for i, n in enumerate(nodes):
    n['id'] = i
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        nodes[c]['parent'] = i

# print node tree around armature
def dump(nid, depth=0):
    n = nodes[nid]
    t = n.get('translation', [0,0,0])
    r = n.get('rotation', [0,0,0,1])
    s = n.get('scale', [1,1,1])
    print('  '*depth + f'[{nid}] {n.get("name","?")} T={tuple(round(x,4) for x in t)} R={tuple(round(x,4) for x in r)} S={tuple(round(x,4) for x in s)}')
    for c in n.get('children', []):
        dump(c, depth+1)

# find armature node
arm = None
for i, n in enumerate(nodes):
    if n.get('name') == 'Armature':
        arm = i
print('=== node tree from Armature ===')
dump(arm)

# skin
skin = j['skins'][0]
print('skin joints:', skin['joints'])
print('skeleton node:', skin.get('skeleton'))

acc = j['accessors'][skin['inverseBindMatrices']]
bv = j['bufferViews'][acc['bufferView']]
off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
ibm = np.frombuffer(b, dtype=np.float32, count=58*16, offset=off).reshape(58, 4, 4)
names = [nodes[k].get('name', f'n{k}') for k in skin['joints']]
print('=== IBM translation (m[3,:3]) and node T per joint ===')
for k in [0, 1, 2, 4]:
    nid = skin['joints'][k]
    nn = nodes[nid]
    print(f'joint{k} node[{nid}] {names[k]:10s} nodeT={tuple(round(x,4) for x in nn.get("translation",[0,0,0]))}')
    print(f'   IBM   T={tuple(round(float(x),4) for x in ibm[k][3,:3])}  scale={tuple(round(float(x),4) for x in np.linalg.norm(ibm[k][:3,:3], axis=0))}')

# mesh node transform
mesh_node = [n for n in nodes if n.get('name') == 'Mesh_0'][0]
print('Mesh_0 node:', {k: mesh_node.get(k) for k in ('name','translation','rotation','scale','skin','mesh')})
