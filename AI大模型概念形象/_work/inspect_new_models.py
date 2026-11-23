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
                return json.loads(data)
        return None

paths = {
    'doubao': r'D:\my_code\我的学习\AI大模型概念形象\Doubao\3D模型\doubao.glb',
    'CYD-Male': r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Male\3D模型\CYD-Male.glb',
    'CYD-female': r'D:\my_code\我的学习\AI大模型概念形象\CYD_DESIGN\Female\3D模型\CYD-female.glb',
}
for name, p in paths.items():
    try:
        j = load_glb(p)
    except Exception as e:
        print(name, 'FAIL', e)
        continue
    meshes = j.get('meshes', [])
    nodes = j.get('nodes', [])
    skins = j.get('skins', [])
    mats = j.get('materials', [])
    print('====', name)
    print('  meshes:', len(meshes), ' skins:', len(skins), ' mats:', len(mats), ' nodes:', len(nodes))
    for i, m in enumerate(meshes):
        prim = m['primitives'][0] if m.get('primitives') else {}
        attrs = prim.get('attributes', {})
        mat = prim.get('material')
        matname = mats[mat].get('name') if mat is not None and mat < len(mats) else None
        print('  mesh[%d] name=%s attrs=%s indices=%s material=%s(%s)' % (i, m.get('name'), list(attrs.keys()), prim.get('indices'), mat, matname))
    # mesh nodes
    for ni, n in enumerate(nodes):
        if 'mesh' in n:
            print('  node[%d] %s mesh=%s' % (ni, n.get('name'), n['mesh']))
    # file size
    import os
    print('  size: %.1f MB' % (os.path.getsize(p) / 1e6))
