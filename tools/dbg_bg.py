import sys
from PIL import Image
import numpy as np
# print luminance histogram of low-saturation pixels for a region (x0,y0,x1,y1 in 2744 space)
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int)
x0, y0, x1, y1 = map(int, sys.argv[2:6])
a = im[y0:y1, x0:x1]
sat = a.max(2) - a.min(2); lum = a.mean(2)
sel = lum[sat < 22]
h, _ = np.histogram(sel, bins=range(0, 260, 10))
print(list(zip(range(0, 250, 10), h)))
