import sys, glob
from PIL import Image
# usage: contact.py dir out.png  -> all pngs on a dark-blue background, 8 per row
d, out = sys.argv[1:3]
fs = sorted(glob.glob(d + '/*.png'))
W = 300; cols = 8; rows = (len(fs) + cols - 1) // cols
sh = Image.new('RGB', (cols * W, rows * W), (20, 40, 90))
for i, f in enumerate(fs):
    o = Image.open(f); o.thumbnail((W - 10, W - 10))
    sh.paste(o, ((i % cols) * W + 5, (i // cols) * W + 5), o)
sh.save(out)
