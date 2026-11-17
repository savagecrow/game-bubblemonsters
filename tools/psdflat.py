"""Read the flattened composite of a PSD (8-bit RGB/RGBA, raw or RLE) without layer parsing.
usage: python -I tools/psdflat.py in.psd out.png
"""
import sys, struct
from PIL import Image

d = open(sys.argv[1], 'rb').read()
assert d[:4] == b'8BPS'
ver, = struct.unpack('>H', d[4:6])
ch, h, w, depth, mode = struct.unpack('>HIIHH', d[12:26])
p = 26
for _ in range(3):  # color mode data, image resources, layer+mask info
    n, = struct.unpack('>I', d[p:p + 4]) if ver == 1 or _ < 2 else struct.unpack('>I', d[p:p + 4])
    p += 4 + n
comp, = struct.unpack('>H', d[p:p + 2])
p += 2
print('size', w, h, 'ch', ch, 'depth', depth, 'comp', comp)
planes = []
if comp == 0:
    for c in range(ch):
        planes.append(d[p:p + w * h]); p += w * h
else:
    counts = struct.unpack('>%dH' % (h * ch), d[p:p + 2 * h * ch])
    p += 2 * h * ch
    k = 0
    for c in range(ch):
        out = bytearray()
        for r in range(h):
            n = counts[k]; k += 1
            row = d[p:p + n]; p += n
            i = 0; line = bytearray()
            while i < len(row):
                b = row[i]; i += 1
                if b < 128:
                    line += row[i:i + b + 1]; i += b + 1
                elif b > 128:
                    line += row[i:i + 1] * (257 - b); i += 1
            out += line[:w]
        planes.append(bytes(out))
bands = [Image.frombytes('L', (w, h), pl) for pl in planes[:4]]
im = Image.merge('RGBA' if len(bands) == 4 else 'RGB', bands)
im.save(sys.argv[2])
