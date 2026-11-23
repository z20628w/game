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

def read_acc(j, b, idx):
    a = j['accessors'][idx]
    bv = j['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    comp = a.get('componentType'); typ = a.get('type'); cnt = a.get('count')
    if comp == 5126 and typ == 'VEC3':
        return np.frombuffer(b, dtype=np.float32, count=cnt*3, offset=off).reshape(-1, 3)
    if comp == 5126 and typ == 'VEC4':
        return np.frombuffer(b, dtype=np.float32, count=cnt*4, offset=off).reshape(-1, 4)
    if comp == 5126 and typ == 'SCALAR':
        return np.frombuffer(b, dtype=np.float32, count=cnt, offset=off)
    return None

j, b = load_glb(r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')
anim = j['animations'][0]
print('anim samplers:', len(anim['samplers']), 'channels:', len(anim['channels']))
print()
print('translation channel values (first/last keyframe per bone):')
seen = set()
for ch in anim['channels']:
    if ch['target']['path'] != 'translation':
        continue
    node = ch['target']['node']
    if node in seen:
        continue
    seen.add(node)
    samp = anim['samplers'][ch['sampler']]
    tvals = read_acc(j, b, samp['input'])
    vals = read_acc(j, b, samp['output'])
    n0 = j['nodes'][node].get('name', '?')
    first = vals[0] if len(vals) else None
    last = vals[-1] if len(vals) else None
    print(f'  node[{node}] {n0:20s} kf={len(vals):3d} first=({tuple(round(x,3) for x in first)}) last=({tuple(round(x,3) for x in last)})')

print()
print('rotation channel first values (sanity):')
seen = set()
for ch in anim['channels']:
    if ch['target']['path'] != 'rotation':
        continue
    node = ch['target']['node']
    if node in seen:
        continue
    seen.add(node)
    samp = anim['samplers'][ch['sampler']]
    vals = read_acc(j, b, samp['output'])
    n0 = j['nodes'][node].get('name', '?')
    first = vals[0] if len(vals) else None
    print(f'  node[{node}] {n0:20s} kf={len(vals):3d} first=({tuple(round(x,4) for x in first)})')
