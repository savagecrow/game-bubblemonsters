"""Pack the Unity 2D Bubble Animations art into small game-ready sheets.
usage: python -I tools/pack.py <extracted bubble dir> <out dir>
"""
import sys, os, glob, json
from PIL import Image

bub, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
meta = {}


def sheet(name, files, cell, cols):
    rows = (len(files) + cols - 1) // cols
    img = Image.new('RGBA', (cols * cell, rows * cell), (0, 0, 0, 0))
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGBA')
        im = im.resize((cell, cell), Image.LANCZOS)
        img.alpha_composite(im, ((i % cols) * cell, (i // cols) * cell))
    img.save(os.path.join(out, name + '.png'), optimize=True)
    meta[name] = {'cell': cell, 'cols': cols, 'n': len(files)}


F = os.path.join(bub, 'Assets', 'Bubble', 'Frames')
# bubble loop looks (30 frames each), 96px cells
for tag, d in [('bubA', 'BubbleAnimation'), ('bubB', 'BubbleAnimation-2'), ('bubC', 'BubbleAnimation-3'), ('bubD', 'BubbleAnimation-4')]:
    sheet(tag, sorted(glob.glob(os.path.join(F, d, '*.png'))), 96, 6)
# pop effects (12 frames), 128px cells
for tag, d in [('popA', 'BubbleExplosion'), ('popB', 'BubbleExplosion_2'), ('popC', 'BubbleExplosion_4')]:
    sheet(tag, sorted(glob.glob(os.path.join(F, d, '*.png'))), 128, 6)
json.dump(meta, open(os.path.join(out, 'sheets.json'), 'w'), indent=1)
print(meta)
