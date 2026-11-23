import json, struct

def peek_glb(path):
    print('== GLB:', path)
    with open(path, 'rb') as f:
        magic, version, length = struct.unpack('<III', f.read(12))
        print(f'GLB magic={hex(magic)} version={version} length={length}')
        while True:
            hdr = f.read(8)
            if not hdr:
                break
            clen, ctype = struct.unpack('<II', hdr)
            data = f.read(clen)
            if ctype == 0x4E4F534A:
                j = json.loads(data)
                print('JSON keys:', list(j.keys()))
                print('nodes:', len(j.get('nodes', [])), 'meshes:', len(j.get('meshes', [])),
                      'skins:', len(j.get('skins', [])), 'animations:', len(j.get('animations', [])))
                for i, n in enumerate(j.get('nodes', [])):
                    nm = n.get('name', '')
                    extra = []
                    if 'mesh' in n:
                        extra.append('mesh')
                    if 'skin' in n:
                        extra.append('skin')
                    if 'children' in n:
                        extra.append(f'children={len(n["children"])}')
                    print(f'  node[{i}] name={nm!r} {" ".join(extra)}')
                    if i > 120:
                        break
                for i, s in enumerate(j.get('skins', [])):
                    print(f'  skin[{i}]: joints={len(s.get("joints", []))} inverseBindMatrices={"yes" if "inverseBindMatrices" in s else "no"} skeleton={s.get("skeleton", None)}')
                    print(f'    joints sample: {s.get("joints", [])[:12]}')
                for i, a in enumerate(j.get('animations', [])):
                    print(f'  anim[{i}]: name={a.get("name", "")!r} channels={len(a.get("channels", []))} samplers={len(a.get("samplers", []))}')
                    ch = a.get('channels', [])
                    targets = set((c['target'].get('path'), c['target'].get('node')) for c in ch)
                    paths = sorted(set(t[0] for t in targets))
                    print(f'    channel paths: {paths}')
                    print(f'    first channels: {json.dumps(ch[:3], ensure_ascii=False)[:400]}')
                # mesh primitives with JOINTS/WEIGHTS
                for i, m in enumerate(j.get('meshes', [])):
                    for p in m.get('primitives', []):
                        attrs = p.get('attributes', {})
                        print(f'  mesh[{i}] attrs: {list(attrs.keys())} mode={p.get("mode", 4)}')
                return j
    print('no JSON chunk')

peek_glb(r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb')
