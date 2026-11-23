import json, struct, numpy as np, shutil

SRC = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'
BAK = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_raw_export.glb'

shutil.copy2(SRC, BAK)

with open(SRC, 'rb') as f:
    data = f.read()

# parse header + chunks
magic, version, length = struct.unpack('<III', data[:12])
pos = 12
bin_start = None
bin_data = bytearray()
json_data = None
while pos < len(data):
    clen, ctype = struct.unpack('<II', data[pos:pos+8])
    body = data[pos+8:pos+8+clen]
    if ctype == 0x4E4F534A:
        json_data = json.loads(body)
    elif ctype == 0x004E4942:
        bin_start = pos + 8
        bin_data = bytearray(body)
    pos += 8 + clen
    if pos % 4 != 0:
        pos += 4 - (pos % 4)

def accessor_offsets(j, acc_idx):
    a = j['accessors'][acc_idx]
    bv = j['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return off, a

# find all translation samplers
translation_samplers = set()
for ch in json_data['animations'][0]['channels']:
    if ch['target']['path'] == 'translation':
        translation_samplers.add(ch['sampler'])

modified = 0
for si in translation_samplers:
    samp = json_data['animations'][0]['samplers'][si]
    off, acc = accessor_offsets(json_data, samp['output'])
    cnt = acc['count']
    # VEC3 float => 3 floats per element
    nbytes = cnt * 3 * 4
    zeros = b'\x00' * nbytes
    if bin_start is None:
        raise RuntimeError('no BIN chunk')
    abs_off = bin_start + off
    bin_data[off:off+nbytes] = zeros
    modified += 1

print(f'zeroed {modified} translation samplers')

# rebuild GLB
new_bin = bytes(bin_data)
json_blob = json.dumps(json_data, separators=(',', ':')).encode('utf-8')
pad_json = (4 - len(json_blob) % 4) % 4
json_blob += b' ' * pad_json
pad_bin = (4 - len(new_bin) % 4) % 4
new_bin += b'\x00' * pad_bin
total = 12 + 8 + len(json_blob) + 8 + len(new_bin)
out = bytearray()
out += struct.pack('<III', 0x46546C67, 2, total)
out += struct.pack('<II', len(json_blob), 0x4E4F534A)
out += json_blob
out += struct.pack('<II', len(new_bin), 0x004E4942)
out += new_bin
assert len(out) == total

with open(SRC, 'wb') as f:
    f.write(bytes(out))
print(f'wrote {SRC} ({len(out)} bytes)')
