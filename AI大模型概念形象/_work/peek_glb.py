import json, struct, sys

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
            if ctype == 0x4E4F534A:  # JSON
                j = json.loads(data)
                print('JSON keys:', list(j.keys()))
                print('scenes:', len(j.get('scenes', [])), 'nodes:', len(j.get('nodes', [])),
                      'meshes:', len(j.get('meshes', [])), 'materials:', len(j.get('materials', [])))
                print('skins:', len(j.get('skins', [])), 'animations:', len(j.get('animations', [])))
                for i, n in enumerate(j.get('nodes', [])):
                    print(f'  node[{i}]:', json.dumps(n, ensure_ascii=False)[:200])
                    if i >= 40:
                        print('  ...(more nodes)')
                        break
                for i, m in enumerate(j.get('meshes', [])):
                    print(f'  mesh[{i}]:', json.dumps(m, ensure_ascii=False)[:200])
                if j.get('skins'):
                    print('  skin0:', json.dumps(j['skins'][0], ensure_ascii=False)[:300])
                if j.get('animations'):
                    print('  anim0:', json.dumps(j['animations'][0], ensure_ascii=False)[:300])
                for i, s in enumerate(j.get('scenes', [])):
                    print(f'  scene[{i}]:', json.dumps(s, ensure_ascii=False)[:300])
                return j
    print('no JSON chunk found')

if __name__ == '__main__':
    peek_glb(r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen.glb')
