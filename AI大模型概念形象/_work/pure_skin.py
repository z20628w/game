import json, struct, numpy as np
import sys

GLB = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_std.glb'

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

j, b = load_glb(GLB)

def read_acc(acc_id, count=None):
    acc = j['accessors'][acc_id]
    bv = j['bufferViews'][acc['bufferView']]
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    comp = acc['componentType']
    dtype = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
             5125: np.uint32, 5126: np.float32}[comp]
    typ = acc['type']
    ncols = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[typ]
    n = count or acc['count']
    data = np.frombuffer(b, dtype=dtype, count=n*ncols, offset=off)
    if typ == 'SCALAR':
        return data.reshape(n)
    return data.reshape(n, ncols)

def node_world(nodes, node_id, anim_state):
    # anim_state: dict node_id -> (T3, R4, S3) local transform (or None)
    node = nodes[node_id]
    if 'children' in node:
        pass
    parent = node.get('parent')
    T, R, S = anim_state.get(node_id, (None, None, None))
    if T is None:
        if 'translation' in node:
            T = np.array(node['translation'], dtype=np.float64)
        else:
            T = np.zeros(3)
    if R is None:
        if 'rotation' in node:
            R = np.array(node['rotation'], dtype=np.float64)
        else:
            R = np.array([0, 0, 0, 1], dtype=np.float64)
    if S is None:
        if 'scale' in node:
            S = np.array(node['scale'], dtype=np.float64)
        else:
            S = np.ones(3)
    # local matrix from TRS
    M = np.eye(4)
    x, y, z, w = R
    M[:3, :3] = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]], dtype=np.float64)
    M[:3, :3] *= S
    M[:3, 3] = T
    if parent is None:
        return M
    return node_world(nodes, parent, anim_state) @ M

# build parent links
nodes = j['nodes']
for i, n in enumerate(nodes):
    n['id'] = i
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        nodes[c]['parent'] = i

# scene
scn = j['scenes'][j['scene']]
root_nodes = scn['nodes']
mesh_node_id = None
arm_node_id = None
for rn in root_nodes:
    # find Armature node (has scale) and Mesh node
    pass
# locate by name or by mesh attribute
for i, n in enumerate(nodes):
    if n.get('name') == 'Armature':
        arm_node_id = i
    if 'mesh' in n:
        mesh_node_id = i
print('arm_node', arm_node_id, 'mesh_node', mesh_node_id)

mesh_node = nodes[mesh_node_id]
mesh = j['meshes'][mesh_node['mesh']]
prim = mesh['primitives'][0]
POS = read_acc(prim['attributes']['POSITION'])
JNT = read_acc(prim['attributes']['JOINTS_0']).astype(np.int64)
WGT = read_acc(prim['attributes']['WEIGHTS_0']).astype(np.float64)
print('POS', POS.shape, 'JNT', JNT.min(), JNT.max(), 'WGT sum per vert', WGT.sum(axis=1).min(), WGT.sum(axis=1).max())

skin_id = mesh_node.get('skin')
if skin_id is None:
    skin_id = prim.get('skin')
if skin_id is None:
    skin_id = j['meshes'][mesh_node['mesh']].get('skin')
print('skin_id', skin_id)
skin = j['skins'][skin_id]
joints = skin['joints']
IBM_raw = read_acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).astype(np.float64)
print('n joints', len(joints), 'IBM shape', IBM_raw.shape)

# ---- animation state at frame f ----
# find anim
anim = j['animations'][0]
samplers = anim['samplers']
channels = anim['channels']
inputs = {}
for si, s in enumerate(samplers):
    inputs[si] = read_acc(s['input'])
outputs = {}
for si, s in enumerate(samplers):
    outputs[si] = read_acc(s['output'])
# frame -> time: input is time in seconds. frame f at fps 60 -> t = (f-1)/60 ? or f/60
# inputs typically 0..1.1 (67 frames at 60fps -> 66/60=1.1). check

def anim_state_at_time(t):
    state = {}
    for ch in channels:
        sid = ch['sampler']
        node_id = ch['target']['node']
        path = ch['target']['path']
        inp = inputs[sid]
        out = outputs[sid]
        # nearest / linear interpolate (use np.interp for scalar columns)
        val = np.zeros(out.shape[1])
        for col in range(out.shape[1]):
            val[col] = np.interp(t, inp, out[:, col])
        T, R, S = state.get(node_id, (None, None, None))
        if path == 'translation':
            T = val
        elif path == 'rotation':
            R = val
        elif path == 'scale':
            S = val
        state[node_id] = (T, R, S)
    return state

inp0 = inputs[0]
print('anim input range:', inp0.min(), inp0.max(), 'count', len(inp0))
print('sampler0 input acc:', j['accessors'][anim['samplers'][0]['input']])
print('sampler0 output acc:', j['accessors'][anim['samplers'][0]['output']])
print('outputs[0] shape:', outputs[0].shape, outputs[0].dtype)
print('channels:', len(channels), 'samplers:', len(samplers))
from collections import Counter
cnt = Counter()
for ch in channels:
    cnt[(ch['target']['path'], ch['target'].get('node'))] += 1
print('channel path counts:', dict(cnt))
fps = 60
t_frames = {}
for f in [1, 17, 34, 50, 67]:
    t_frames[f] = f / fps  # GLB input: 1/60 .. 67/60 maps to frame 1..67
print('times:', t_frames)

# static state (no anim) for rest comparison
static = {}
for i, n in enumerate(nodes):
    if 'translation' in n or 'rotation' in n or 'scale' in n:
        static[i] = (np.array(n.get('translation', [0,0,0]), dtype=np.float64),
                     np.array(n.get('rotation', [0,0,0,1]), dtype=np.float64),
                     np.array(n.get('scale', [1,1,1]), dtype=np.float64))

def skin_bbox(state):
    # world matrices for each joint
    joint_world = np.zeros((len(joints), 4, 4))
    for ji, jn in enumerate(joints):
        joint_world[ji] = node_world(nodes, jn, state)
    # skinning matrices
    skin_mat = np.zeros((len(joints), 4, 4))
    for ji in range(len(joints)):
        # IBM stored column-major -> numpy array is transpose; use .T to get math matrix
        skin_mat[ji] = joint_world[ji] @ IBM_raw[ji].T
    # transform POS
    v4 = np.hstack([POS, np.ones((POS.shape[0], 1))]).astype(np.float64)
    out = np.zeros_like(v4)
    for k in range(4):
        jidx = JNT[:, k]
        w = WGT[:, k]
        # gather skin_mat per vertex
        m = skin_mat[jidx]  # (N,4,4)
        out += (m @ v4[:, :, None])[:, :, 0] * w[:, None]
    return out[:, :3]

for f in [1, 17, 34, 67]:
    state = anim_state_at_time(t_frames[f])
    b = skin_bbox(state)
    print(f'frame {f}: bbox x[{b[:,0].min():.4f},{b[:,0].max():.4f}] y[{b[:,1].min():.4f},{b[:,1].max():.4f}] z[{b[:,2].min():.4f},{b[:,2].max():.4f}]')

# debug frame 1: joint world + anim values
state1 = anim_state_at_time(t_frames[1])
print('--- frame1 debug ---')
for jn in [57, 56, 4]:
    nm = nodes[jn].get('name')
    st = state1.get(jn)
    if st:
        print(f'node[{jn}] {nm} anim T={st[0]} R={tuple(round(float(x),4) for x in st[1])} S={st[2]}')
    m = node_world(nodes, jn, state1)
    print(f'node[{jn}] {nm} world T=({m[0,3]:.4f},{m[1,3]:.4f},{m[2,3]:.4f}) world colnorm={tuple(round(float(np.linalg.norm(m[:3,k])),4) for k in range(3))}')

# rest (no anim applied)
b = skin_bbox(static)
print(f'rest : bbox x[{b[:,0].min():.4f},{b[:,0].max():.4f}] y[{b[:,1].min():.4f},{b[:,1].max():.4f}] z[{b[:,2].min():.4f},{b[:,2].max():.4f}]')

# compare frame 1 vs 67 (loop closure)
b1 = skin_bbox(anim_state_at_time(t_frames[1]))
b67 = skin_bbox(anim_state_at_time(t_frames[67]))
diff = np.abs(b1 - b67)
print('f1 vs f67 max vertex diff:', diff.max())

# vertex continuity: f66 vs f67, f34 vs f67
b66 = skin_bbox(anim_state_at_time(t_frames[66] if 66 in t_frames else 66.0/60))
b34 = skin_bbox(anim_state_at_time(t_frames[34]))
# recompute with explicit times
v66 = skin_bbox(anim_state_at_time(65.0/60))
v67 = skin_bbox(anim_state_at_time(66.0/60))
v34 = skin_bbox(anim_state_at_time(33.0/60))
v33 = skin_bbox(anim_state_at_time(32.0/60))
print('f66 vs f67 max vertex diff:', np.abs(v66-v67).max())
print('f33 vs f34 max vertex diff:', np.abs(v33-v34).max())
print('f34 vs f67 max vertex diff:', np.abs(v34-v67).max())
# largest per-frame bbox jitter
for f, t in [(63,62.0/60),(64,63.0/60),(65,64.0/60),(66,65.0/60),(67,66.0/60)]:
    vb = skin_bbox(anim_state_at_time(t))
    print(f'frame {f}: y[{vb[:,1].min():.4f},{vb[:,1].max():.4f}]', flush=True)
