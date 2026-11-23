import json, struct, numpy as np

def load_glb(path):
    with open(path, 'rb') as f:
        f.read(12)
        while True:
            hdr = f.read(8)
            if not hdr:
                break
            clen, ctype = struct.unpack('<II', hdr)
            data = f.read(clen)
            if ctype == 0x4E4F534A:
                return json.loads(data), data
        return None, None

j, _ = load_glb(r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_std.glb')
with open(r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_std.glb', 'rb') as f:
    f.read(12)
    while True:
        hdr = f.read(8)
        if not hdr:
            break
        clen, ctype = struct.unpack('<II', hdr)
        data = f.read(clen)
        if ctype == 0x004E4942:
            b = data
            break

print('nodes with mesh:', [(i, n.get('name'), n.get('mesh')) for i, n in enumerate(j['nodes']) if 'mesh' in n])
print('meshes:', [(i, m.get('name'), len(m['primitives'])) for i, m in enumerate(j['meshes'])])
print('buffer byteLength:', j['buffers'][0]['byteLength'], 'actual bin:', len(b))
skin = j['skins'][0]
acc = j['accessors'][skin['inverseBindMatrices']]
bv = j['bufferViews'][acc['bufferView']]
off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
ibm = np.frombuffer(b, dtype=np.float32, count=58*16, offset=off).reshape(58, 4, 4)
print('IBM[1] (Hips) read back:')
print(ibm[1])
# expected: inv of world. world Hips = T(0,0.6174,0.0147) R(90y)
# expected inv: R(-90y) with T = -(R^-1 @ T) = (0, -0.6174, -0.0147)? compute expected
R = np.array([[0,0,1],[0,1,0],[-1,0,0]])  # 90y
W = np.eye(4); W[:3,:3] = R; W[:3,3] = [0, 0.61734985, 0.01468339]
Wi = np.linalg.inv(W)
print('expected IBM[1] (math):')
print(Wi)
# check glTF col-major reading: ibm[1] as read should equal math matrix (col-major stored, reshaped row-major == transpose of math)
print('ibm[1].T == expected?', np.allclose(ibm[1].T, Wi))
