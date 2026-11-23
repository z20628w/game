import json, struct, numpy as np

def load_glb(path):
    with open(path, 'rb') as f:
        magic, version, length = struct.unpack('<III', f.read(12))
        json_data = None
        bin_data = b''
        while True:
            hdr = f.read(8)
            if not hdr:
                break
            clen, ctype = struct.unpack('<II', hdr)
            data = f.read(clen)
            if ctype == 0x4E4F534A:
                json_data = json.loads(data)
            elif ctype == 0x004E4942:
                bin_data = data
    return json_data, bin_data

j, b = load_glb(r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')

def get_accessor(idx):
    a = j['accessors'][idx]
    bv = j['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    comp = a.get('componentType')
    typ = a.get('type')
    count = a.get('count')
    np_types = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32}
    if comp == 5126 and typ == 'VEC3':
        arr = np.frombuffer(b, dtype=np.float32, count=count*3, offset=off).reshape(-1, 3)
    elif comp == 5126 and typ == 'VEC4':
        arr = np.frombuffer(b, dtype=np.float32, count=count*4, offset=off).reshape(-1, 4)
    elif comp == 5123 and typ == 'VEC4':
        arr = np.frombuffer(b, dtype=np.uint16, count=count*4, offset=off).reshape(-1, 4)
    else:
        return None
    return arr

print('== GLB internal data ==')
print('nodes:', len(j['nodes']), 'meshes:', len(j['meshes']), 'skins:', len(j['skins']), 'animations:', len(j['animations']))

# mesh position
mesh = j['meshes'][0]
prim = mesh['primitives'][0]
pos_acc = prim['attributes']['POSITION']
pos = get_accessor(pos_acc)
print('POSITION accessor:', j['accessors'][pos_acc].get('min'), j['accessors'][pos_acc].get('max'), 'count', len(pos))
print('POSITION range: x[%.3f,%.3f] y[%.3f,%.3f] z[%.3f,%.3f]' % (pos[:,0].min(), pos[:,0].max(), pos[:,1].min(), pos[:,1].max(), pos[:,2].min(), pos[:,2].max()))

# skin joints and IBM
skin = j['skins'][0]
print('skin joints:', skin['joints'])
print('skeleton:', skin.get('skeleton'))
ibm = get_accessor(skin['inverseBindMatrices'])
print('IBM count:', None if ibm is None else len(ibm))

# node transforms (translation/rotation/scale)
for i, n in enumerate(j['nodes']):
    t = n.get('translation', 'default')
    s_ = n.get('scale', 'default')
    r = n.get('rotation', 'default')
    print(f'node[{i}] {n.get("name","?"):20s} T={t} S={s_} R={"q" if r!="default" else "none"} mesh={n.get("mesh")} skin={n.get("skin")} children={len(n.get("children",[]))}')

# animation channels targeting root/armature node
anim = j['animations'][0]
print('anim channels:', len(anim['channels']))
from collections import Counter
targets = Counter((c['target']['node'], c['target']['path']) for c in anim['channels'])
for (node, path), cnt in sorted(targets.items()):
    print(f'  node {node} ({j["nodes"][node].get("name")}) {path} x{cnt}')
