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

for label, path in [('RAW-EXPORT', r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_raw_export.glb'),
                    ('FINAL', r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')]:
    j, b = load_glb(path)
    prim = j['meshes'][0]['primitives'][0]
    acc = j['accessors'][prim['attributes']['JOINTS_0']]
    bv = j['bufferViews'][acc['bufferView']]
    print(f'== {label} ==')
    print('accessor:', {k: v for k, v in acc.items() if k in ('componentType', 'type', 'count', 'byteOffset')})
    print('bufferView:', {k: v for k, v in bv.items() if k in ('byteOffset', 'byteLength', 'target')})
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    dtype = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[acc['componentType']]
    cnt = acc['count']
    jnt = np.frombuffer(b, dtype=dtype, count=cnt*4, offset=off).reshape(-1, 4)
    print('JOINTS min/max:', jnt.min(), jnt.max())
    print('first 8 verts JOINTS:', jnt[:8].tolist())
    print()
