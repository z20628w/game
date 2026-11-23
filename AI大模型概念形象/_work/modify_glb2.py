import json, struct

SRC = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk_raw_export.glb'
OUT = r'D:\my_code\我的学习\AI大模型概念形象\Qwen\3d模型\Qwen_walk.glb'

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

# find translation samplers
trans_samplers = set()
kept = []
for ch in anim['channels']:
    if ch['target']['path'] == 'translation':
        trans_samplers.add(ch['sampler'])
    else:
        kept.append(ch)
print(f'removing {len(anim["channels"])-len(kept)} translation channels, {len(trans_samplers)} samplers')

# rebuild samplers list without translation ones
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

# drop animations with no channels? keep structure (channels remain)
print('remaining channels:', len(anim['channels']), 'samplers:', len(anim['samplers']))

json_blob = json.dumps(json_data, separators=(',', ':')).encode('utf-8')
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

with open(OUT, 'wb') as f:
    f.write(bytes(out))
print(f'wrote {OUT} ({len(out)} bytes)')
