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
skin = j['skins'][0]
acc = j['accessors'][skin['inverseBindMatrices']]
bv = j['bufferViews'][acc['bufferView']]
print('IBM accessor:', {k: v for k, v in acc.items() if k != 'bufferView'})
print('IBM bufferView:', bv)
off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
print('offset:', off)
ibm = np.frombuffer(b, dtype=np.float32, count=58*16, offset=off).reshape(58, 4, 4)
print('IBM[1] (Hips):')
print(ibm[1])

# Build rest world for Hips manually to test skin matrix
def quat_to_mat(q):
    x, y, z, w = q
    return np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]], dtype=np.float64)

n = {i: nodes[i] for i in range(len(nodes))}
arm = n[58]
s = arm.get('scale', [1,1,1])
root = n[57]
hips = n[56]
R_hips = quat_to_mat(hips.get('rotation', [0,0,0,1]))
T_hips = np.array(hips.get('translation', [0,0,0]))
# Hips world = arm_scale * root * hips
world = np.eye(4)
world[:3,:3] = R_hips * (np.array(s)[None, :] if False else s)
world[:3,3] = T_hips * np.array(s)  # arm scale applied to child T
print('Hips rest world:')
print(world)
print('Hips world colnorm:', np.linalg.norm(world[:3,:3], axis=0))
sm = world @ ibm[1]
print('skin_mat (world @ IBM[1]):')
print(sm)
print('skin_mat colnorm:', np.linalg.norm(sm[:3,:3], axis=0))
