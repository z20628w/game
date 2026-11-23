import json, struct, sys
import numpy as np

name = sys.argv[sys.argv.index('--') + 1]
DIRS = {
    'doubao': r'D:\my_code\我的学习\AI大模型概念形象\Doubao\3D模型',
    'CYD-Male': r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Male\3D模型',
    'CYD-female': r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Female\3D模型',
}
PREFIXES = {'doubao': 'doubao', 'CYD-Male': 'CYD-Male', 'CYD-female': 'CYD-female'}
d = DIRS[name]
p = PREFIXES[name]
SRC = d + '\\' + p + '_walk_raw_export.glb'
TMP = d + '\\' + p + '_walk_notrans.glb'
DST = d + '\\' + p + '_walk.glb'

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

def write_glb(path, j, bin_data):
    json_blob = json.dumps(j, separators=(',', ':')).encode('utf-8')
    pad_json = (4 - len(json_blob) % 4) % 4
    json_blob += b' ' * pad_json
    pad_bin = (4 - len(bin_data) % 4) % 4
    bin_out = bin_data + b'\x00' * pad_bin
    total = 12 + 8 + len(json_blob) + 8 + len(bin_out)
    out = bytearray()
    out += struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(json_blob), 0x4E4F534A)
    out += json_blob
    out += struct.pack('<II', len(bin_out), 0x004E4942)
    out += bin_out
    assert len(out) == total
    with open(path, 'wb') as f:
        f.write(bytes(out))

# step 1: drop translation channels
with open(SRC, 'rb') as f:
    data = f.read()
pos = 12
json_data = None
bin_data = b''
while pos < len(data):
    clen, ctype = struct.unpack('<II', data[pos:pos+8])
    body = data[pos+8:pos+8+clen]
    if ctype == 0x4E4F534A:
        json_data = json.loads(body)
    elif ctype == 0x004E4942:
        bin_data = body
    pos += 8 + clen
    if pos % 4 != 0:
        pos += 4 - (pos % 4)

anim = json_data['animations'][0]
trans_samplers = set()
kept = []
for ch in anim['channels']:
    if ch['target']['path'] == 'translation':
        trans_samplers.add(ch['sampler'])
    else:
        kept.append(ch)
new_samplers = []
sampler_map = {}
for i, s in enumerate(anim['samplers']):
    if i in trans_samplers:
        continue
    sampler_map[i] = len(new_samplers)
    new_samplers.append(s)
for ch in kept:
    ch['sampler'] = sampler_map[ch['sampler']]
anim['channels'] = kept
anim['samplers'] = new_samplers
print('dropped %d translation channels, remaining %d' % (len(anim['channels']) - len(kept) + len(kept) - len(kept), len(kept)))
# correct count print
dropped = sum(1 for ch in json_data['animations'][0]['channels'] if False)
print('remaining channels:', len(kept), 'samplers:', len(new_samplers))
write_glb(TMP, json_data, bin_data)
print('wrote notrans', TMP)

# step 2: standardize to meters + pure inverse IBM
j, _ = load_glb(TMP)
with open(TMP, 'rb') as f:
    f.read(12)
    while True:
        hdr = f.read(8)
        if not hdr:
            break
        clen, ctype = struct.unpack('<II', hdr)
        d2 = f.read(clen)
        if ctype == 0x004E4942:
            b = d2
            break

nodes = j['nodes']
arm_id = None
for i, n in enumerate(nodes):
    if n.get('name') == 'Armature':
        arm_id = i
        break
arm_s = np.array(nodes[arm_id].get('scale', [1, 1, 1]), dtype=np.float64)
scl = arm_s[0]
print('Armature scale:', scl)
for i, n in enumerate(nodes):
    n['id'] = i
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        nodes[c]['parent'] = i

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
    M[:3, :3] = R * S[None, :]
    M[:3, 3] = T
    return M

def world_mat(nid):
    n = nodes[nid]
    M = local_mat(n)
    p = n.get('parent')
    if p is not None:
        return world_mat(p) @ M
    return M

for nid in joints:
    n = nodes[nid]
    if 'translation' in n:
        n['translation'] = [round(float(x) * scl, 9) for x in n['translation']]
nodes[arm_id]['scale'] = [1.0, 1.0, 1.0]
if 'translation' in nodes[arm_id]:
    nodes[arm_id]['translation'] = [0.0, 0.0, 0.0]

new_ibm = np.zeros((len(joints), 4, 4))
for ji, jn in enumerate(joints):
    W = world_mat(jn)
    new_ibm[ji] = np.linalg.inv(W)

acc = j['accessors'][skin['inverseBindMatrices']]
bv = j['bufferViews'][acc['bufferView']]
off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
ibm_bytes = new_ibm.transpose(0, 2, 1).astype(np.float32).reshape(-1).tobytes()
assert len(ibm_bytes) == len(joints) * 64
data = bytearray(b)
data[off:off+len(ibm_bytes)] = ibm_bytes
b = bytes(data)

# verify skin mat = I for Hips (joint index 1)
print('Hips world T:', world_mat(joints[1])[:3, 3])
print('skin_mat[1] =', np.round(world_mat(joints[1]) @ new_ibm[1], 5).tolist())
write_glb(DST, j, b)
print('wrote', DST)
