import struct

def probe_fbx(path):
    with open(path, 'rb') as f:
        head = f.read(64)
    print('first bytes:', head[:32])
    if head.startswith(b'Kaydara FBX Binary'):
        print('格式: 二进制 FBX')
        ver = head[20:23]
        print('FBX 版本: 7.%s' % ver.decode('ascii', errors='replace'))
    elif head.lstrip().startswith(b'; FBX'):
        print('格式: ASCII FBX')
        print(head[:500])
    else:
        print('格式: 未知/其他')

probe_fbx(r'D:\my_code\我的学习\AI大模型概念形象\3D模型骨骼与动画\走路.fbx')
