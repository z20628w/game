import json, struct, numpy as np

SRC = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
DST = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_std.glb'

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

j, b = load_glb(SRC)
nodes = j['nodes']

# --- find Armature node, read its scale ---
arm_id = None
for i, n in enumerate(nodes):
    if n.get('name') == 'Armature':
        arm_id = i
        break
arm_s = np.array(nodes[arm_id].get('scale', [1, 1, 1]), dtype=np.float64)
s = arm_s[0]
print('Armature scale:', s)

# --- build parent links ---
for i, n in enumerate(nodes):
    n['id'] = i
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        nodes[c]['parent'] = i

# --- recompute IBM as pure inverse of rest world (meters) ---
skin = j['skins'][0]
joints = skin['joints']

def quat_to_mat(q):
    x, y, z, w = q
    return np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]], dtype=np.float64)

def local_mat(n):
    if 'translation' in n:
        T = np.array(n['translation'], dtype=np.float64)
    else:
        T = np.zeros(3)
    if 'rotation' in n:
        R = quat_to_mat(n['rotation'])
    else:
        R = np.eye(3)
    if 'scale' in n:
        S = np.array(n['scale'], dtype=np.float64)
    else:
        S = np.ones(3)
    M = np.eye(4)
    M[:3, :3] = R * S[None, :]  # column scale
    M[:3, 3] = T
    return M

def world_mat(nid):
    n = nodes[nid]
    M = local_mat(n)
    p = n.get('parent')
    if p is not None:
        return world_mat(p) @ M
    return M

# first: verify rest world (Hips) before change
h_old = world_mat(joints[1])
print('old Hips world T:', h_old[:3, 3])

# --- modify node translations: bones cm -> meters (only joint nodes and arm node scale->1) ---
for nid in joints:
    n = nodes[nid]
    if 'translation' in n:
        n['translation'] = [round(float(x) * s, 9) for x in n['translation']]
# arm node: scale -> 1
nodes[arm_id]['scale'] = [1.0, 1.0, 1.0]
if 'translation' in nodes[arm_id]:
    nodes[arm_id]['translation'] = [0.0, 0.0, 0.0]

h_new = world_mat(joints[1])
print('new Hips world T:', h_new[:3, 3])

# --- recompute IBM ---
new_ibm = np.zeros((len(joints), 4, 4))
for ji, jn in enumerate(joints):
    W = world_mat(jn)
    new_ibm[ji] = np.linalg.inv(W)
print('IBM[1] new (Hips):')
print(new_ibm[1])
# verify skin matrix = world @ IBM = I
print('skin_mat[1] =', np.round(world_mat(joints[1]) @ new_ibm[1], 6).tolist())

# --- write new IBM into binary ---
acc = j['accessors'][skin['inverseBindMatrices']]
bv = j['bufferViews'][acc['bufferView']]
off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
# per-matrix transpose then flatten: glTF col-major == math matrix transposed, per joint
ibm_bytes = new_ibm.transpose(0, 2, 1).astype(np.float32).reshape(-1).tobytes()
assert len(ibm_bytes) == 58 * 64
data = bytearray(b)
data[off:off+58*64] = ibm_bytes
b = bytes(data)

# --- also update nodes JSON (translations changed) ---
# (j already mutated in place)

# --- write GLB ---
json_bytes = json.dumps(j, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
json_bytes += b' ' * ((4 - len(json_bytes) % 4) % 4)
bin_pad = b' ' * ((4 - len(b) % 4) % 4)
with open(DST, 'wb') as f:
    total = 12 + 8 + len(json_bytes) + 8 + len(b) + len(bin_pad)
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(json_bytes), 0x4E4F534A))
    f.write(json_bytes)
    f.write(struct.pack('<II', len(b) + len(bin_pad), 0x004E4942))
    f.write(b)
    f.write(bin_pad)
print('written', DST)
