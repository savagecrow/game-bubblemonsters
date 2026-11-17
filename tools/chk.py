import sys
from PIL import Image
bg = Image.new('RGBA', (700, 380), (40, 60, 40, 255))
for n, x in (('green', 0), ('blue', 350)):
    s = Image.open(f'assets/mon_{n}.png')
    bg.alpha_composite(s, (x, 0))
bg.save(sys.argv[1])
