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

def read_acc(j, b, idx, ncols, dtype):
    a = j['accessors'][idx]
    bv = j['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    cnt = a.get('count')
    return np.frombuffer(b, dtype=dtype, count=cnt*ncols, offset=off).reshape(-1, ncols)

j, b = load_glb(r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')
skin = j['skins'][0]
joints = skin['joints']
joint_names = [j['nodes'][n].get('name', '?') for n in joints]
print('joints array (skin.joints):', joints)
print('joint names:', joint_names)

prim = j['meshes'][0]['primitives'][0]
attrs = prim['attributes']
print()
print('attributes:', list(attrs.keys()))

jnt = read_acc(j, b, attrs['JOINTS_0'], 4, np.uint16)
wgt = read_acc(j, b, attrs['WEIGHTS_0'], 4, np.float32)
print('JOINTS_0 shape:', jnt.shape, 'dtype range:', jnt.min(), '-', jnt.max())
print('WEIGHTS_0 shape:', wgt.shape, 'sum min/max:', wgt.sum(axis=1).min(), wgt.sum(axis=1).max())

# sample a few vertices and interpret JOINTS both ways
print()
print('joint value analysis:')
vals = jnt.ravel()
wvals = wgt.ravel()
print('unique joint values (top 70 by frequency):')
from collections import Counter
c = Counter(vals.tolist())
for v, n in c.most_common(70):
    print(f'  {v}: {n}')

# check weights on out-of-range joints
oor = vals >= len(joints)
print()
print(f'out-of-range joint values: {oor.sum()} slots of {vals.size}')
print(f'out-of-range with weight>0: {(oor & (wvals > 0)).sum()}')
print(f'out-of-range with weight==0: {(oor & (wvals == 0)).sum()}')

# for in-range joints, check weight distribution
inr = vals < len(joints)
print(f'in-range slots: {inr.sum()}')
nonzero_inr = (inr & (wvals > 0)).sum()
print(f'in-range with weight>0: {nonzero_inr}')

