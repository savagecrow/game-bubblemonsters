import sys
from PIL import Image
import numpy as np
from scipy import ndimage as ndi
# usage: cutsheet.py src outdir prefix "name:y0:y1,name:y0:y1" [minarea]
# y values are in the 2000px-wide display space of the 2744px source.
# Keys sprites off a grey / checker / grid background by saturation + dark outline, splits each row band
# into separate sprites, writes one RGBA png per sprite (left-to-right order).
src, outdir, prefix, bands = sys.argv[1:5]
minarea = int(sys.argv[5]) if len(sys.argv) > 5 else 6000
im = Image.open(src).convert('RGB'); S = 2744 / 2000.0
a = np.asarray(im).astype(int)
sat = a.max(2) - a.min(2); lum = a.mean(2)
checker = len(sys.argv) > 6 and sys.argv[6] == 'checker'   # fake-transparency checkerboard: dark squares are mid grey
mask_all = np.logical_or(sat >= 42, lum < 70) if checker else np.logical_or(sat >= 22, lum < 178)
for b in bands.split(','):
    name, y0, y1 = b.split(':'); y0 = int(int(y0) * S); y1 = int(int(y1) * S)
    m = mask_all[y0:y1]; rgb = a[y0:y1]
    if checker:   # flood the checkerboard from the band edge; whatever it cannot reach (incl. eye whites) is sprite
        bgish = (sat[y0:y1] < 22) & (lum[y0:y1] >= 158) & (lum[y0:y1] <= 228)
        seed = ~ndi.binary_dilation(ndi.binary_opening(m, iterations=3), iterations=18)   # cells are boxed by frame lines: seed from anywhere far from a sprite
        be = ndi.binary_erosion(bgish, iterations=4)          # eroded so thin leaks in the outline do not let the flood into the eye
        reached = ndi.binary_dilation(ndi.binary_propagation(seed & be, mask=be), iterations=6) & bgish
        eyefill = ~reached & ~((sat[y0:y1] < 22) & (lum[y0:y1] < 158))   # not grey lines / outlines
    core = ndi.binary_opening(m, iterations=3)
    lab, n = ndi.label(ndi.binary_dilation(core, iterations=14))
    objs = ndi.find_objects(lab); items = []
    for i, sl in enumerate(objs):
        comp = lab == i + 1
        if (core & comp).sum() < minarea: continue
        keep = ndi.binary_dilation(core & comp, iterations=5) & m & comp
        keep = ndi.binary_closing(keep, iterations=2); keep = ndi.binary_fill_holes(keep)
        if checker: keep |= eyefill & ndi.binary_dilation(keep, iterations=12) & comp
        keep = ndi.binary_opening(keep, iterations=1)
        l2, n2 = ndi.label(keep); sizes = ndi.sum(keep, l2, range(1, n2 + 1))
        keep = np.isin(l2, [k + 1 for k, s in enumerate(sizes) if s > 400])
        al = ndi.gaussian_filter(keep.astype(float), 0.8)
        rgba = np.dstack([rgb, (np.clip(al * 1.3, 0, 1) * 255).astype(int)]).astype('uint8')
        o = Image.fromarray(rgba, 'RGBA'); bb = o.getbbox()
        if not bb: continue
        items.append((sl[1].start, o.crop(bb)))
    items.sort(key=lambda t: t[0])
    for k, (_, o) in enumerate(items):
        o.save('%s/%s_%s%d.png' % (outdir, prefix, name, k)); print(name, k, o.size)
