import struct, json, os

def inspect_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67:
        return {'file': os.path.basename(path), 'error': 'not a GLB'}
    clen, ctype = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+clen])
    meshes = gltf.get('meshes', [])
    accessors = gltf.get('accessors', [])
    total_verts = 0
    total_tris = 0
    prims = 0
    for m in meshes:
        for p in m.get('primitives', []):
            prims += 1
            attrs = p.get('attributes', {})
            pos = attrs.get('POSITION')
            if pos is not None:
                total_verts += accessors[pos]['count']
            idx = p.get('indices')
            if idx is not None:
                total_tris += accessors[idx]['count'] // 3
    skins = gltf.get('skins', [])
    return {
        'file': os.path.basename(path),
        'size_kb': round(len(data)/1024, 1),
        'nodes': len(gltf.get('nodes', [])),
        'meshes': len(meshes),
        'primitives': prims,
        'vertices': total_verts,
        'triangles': total_tris,
        'materials': len(gltf.get('materials', [])),
        'images': len(gltf.get('images', [])),
        'skins': len(skins),
        'joints': sum(len(s.get('joints', [])) for s in skins),
        'animations': len(gltf.get('animations', [])),
    }

base = r'D:\my_code\我的学习\AI大模型概念形象'
targets = [
    os.path.join(base, r'Doubao\3D模型\doubao.glb'),
    os.path.join(base, r'Doubao\3D模型\doubao_walk.glb'),
    os.path.join(base, r'Qwen\3d模型\Qwen.glb'),
]
for p in targets:
    if os.path.exists(p):
        info = inspect_glb(p)
        print(json.dumps(info, ensure_ascii=False))
    else:
        print(json.dumps({'file': os.path.basename(p), 'error': 'not found'}, ensure_ascii=False))
