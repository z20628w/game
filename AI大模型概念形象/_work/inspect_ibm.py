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

skin = j['skins'][0]
a = j['accessors'][skin['inverseBindMatrices']]
bv = j['bufferViews'][a['bufferView']]
off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
count = a['count']
ibm = np.frombuffer(b, dtype=np.float32, count=count*16, offset=off).reshape(count, 4, 4)

joint_names = [j['nodes'][n].get('name', '?') for n in skin['joints']]
print('== IBM ==')
print('count:', count, 'joints:', len(skin['joints']))
for i in range(count):
    m = ibm[i]
    # glTF matrices are column-major: translation is in the 4th column => numpy row 3
    t = m[3, :3]
    print(f'{i:2d} {joint_names[i]:20s} T=({t[0]:10.4f},{t[1]:10.4f},{t[2]:10.4f})')

# compare with node transforms (rest local translations)
print()
print('== node rest T (from joints) ==')
for ni in skin['joints']:
    n = j['nodes'][ni]
    t = n.get('translation', None)
    print(f'node[{ni}] {n.get("name","?"):20s} T={None if t is None else tuple(round(x,3) for x in t)}')
