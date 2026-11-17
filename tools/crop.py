import sys
from PIL import Image
# usage: crop.py in.png out.png x0 y0 x1 y1 [scale]
a = sys.argv
im = Image.open(a[1]).crop(tuple(map(int, a[3:7])))
k = int(a[7]) if len(a) > 7 else 4
im.resize((im.width * k, im.height * k), Image.LANCZOS).save(a[2])
