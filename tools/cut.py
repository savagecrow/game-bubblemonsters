import sys
from PIL import Image
import numpy as np
from scipy import ndimage as ndi
# usage: cut.py src out x0 y0 x1 y1 kind(green|blue)
src, out = sys.argv[1], sys.argv[2]
box = tuple(map(int, sys.argv[3:7]))
kind = sys.argv[7]
im = Image.open(src).convert('RGB').crop(box)
a = np.asarray(im).astype(int)
R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
sat = a.max(2) - a.min(2)
lum = a.mean(2)
bg = (sat < 38) & (lum > 70) & (lum < 135) & (B >= R - 4)
bad = np.zeros(bg.shape, bool)
yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
if kind == 'green':
    bad |= (B > G + 6) & (lum > 70)                 # lavender gaps between monsters
    bad |= (yy < 48) & (xx > 100)                   # orange monster above
    bad |= (R > G + 25) & (yy < 70) & (B < 150) & (xx > 100)
    bad |= yy > 322                                 # title text
    bad |= (yy > 295) & (G > 180) & (B < 110) & (R < 200) & (xx > 150)
    bad |= (yy < 62) & (xx > 215)
elif kind == 'blue':
    orange = (R > B + 60) & (G > 80)
    bad |= (R > G + 8) & (lum > 105) & ~orange      # pink / lavender monster
    bad |= (G > B + 25) & (yy > 300)                # title text
    bad |= (xx < 45) & (R > G + 3) & (yy < 200)
    bad |= yy > 336
    bad |= (yy < 26) & (xx > 100) & (xx < 215)
lab, n = ndi.label(~(bg | bad))
cy, cx = a.shape[0] // 2, a.shape[1] // 2
keep = lab == lab[cy, cx]
keep = ndi.binary_closing(keep, iterations=2)
keep = ndi.binary_fill_holes(keep)
keep = ndi.binary_opening(keep, iterations=3)
lab, n = ndi.label(keep)
keep = lab == lab[cy, cx]
al = ndi.gaussian_filter(keep.astype(float), 0.7)
rgba = np.dstack([a, (al * 255).astype(int)]).astype('uint8')
o = Image.fromarray(rgba, 'RGBA')
o = o.crop(o.getbbox())
o.save(out)
print(o.size)
