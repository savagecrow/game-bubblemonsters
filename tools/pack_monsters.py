import sys, json
from PIL import Image
# usage: pack_monsters.py scratch_dir out_dir
# Packs the cut frames of both monsters into assets/mon2_<name>.png + assets/mon2.json (frames pre-shrunk, shared per-character scale).
sd, od = sys.argv[1:3]
K = 0.5
SETS = {
    'green': {
        'idle': ['g4b/g_idle%d' % i for i in range(5)],
        'walk': ['g4b/g_walk%d' % i for i in range(8)],
        'atk': ['g4b/g_atk%d' % i for i in range(5)],
        'jump': ['g4b/g_jump%d' % i for i in range(5)],     # crouch, up, apex, down, land
        'hurt': ['g4b/g_hurt%d' % i for i in range(5)],     # scared, scared, flail, slump, KO
    },
    'blue': {
        'idle': ['b8/b_top%d' % i for i in range(3)],
        'walk': ['b8/b_top%d' % i for i in range(3, 9)],
        'atk': ['b8/b_atk%d' % i for i in range(5)],
        'jump': ['b8/b_jump%d' % i for i in range(5)],
    },
}
meta = {}
for name, groups in SETS.items():
    frames = []
    for gk, files in groups.items():
        for f in files:
            im = Image.open('%s/%s.png' % (sd, f)).convert('RGBA')
            im = im.resize((max(1, round(im.width * K)), max(1, round(im.height * K))), Image.LANCZOS)
            frames.append((gk, im))
    W = 1024; x = y = rowh = 0; placed = []
    for gk, im in frames:
        if x + im.width + 2 > W: x = 0; y += rowh + 2; rowh = 0
        placed.append((gk, x, y, im)); x += im.width + 2; rowh = max(rowh, im.height)
    atlas = Image.new('RGBA', (W, y + rowh + 2), (0, 0, 0, 0))
    m = {}
    for gk, px, py, im in placed:
        atlas.paste(im, (px, py)); m.setdefault(gk, []).append([px, py, im.width, im.height])
    atlas.save('%s/mon2_%s.png' % (od, name))
    meta[name] = {'ref': m['idle'][0][3], 'f': m}      # ref = idle height in atlas px (scale reference)
    print(name, atlas.size, {k: len(v) for k, v in m.items()})
json.dump(meta, open(od + '/mon2.json', 'w'))
