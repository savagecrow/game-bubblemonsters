# Bubble Monsters

A Bubble Bobble style platformer with its own twists, playable solo, two on one keyboard, or online co-op.
Open `index.html` (any static host works; no build step, no server).

## Features
- Trap monsters in bubbles, pop them into fruit, chain the pops (each pop in a chain doubles the points).
- Floating bubbles are platforms: land on them and ride them up; jump off with a boost.
- Bouncy fruit (melon, pumpkin, plum) are springs; they pop after three bounces for a bonus.
- Floor and ceiling holes are bubble teleporters; from stage 4 there are also mid-air teleporter pairs.
- Hold shield to wrap yourself in a bubble (drains, then recharges). Shield/Down + Jump drops through a platform.
- Power orbs: speed, wide bubbles, rapid fire, shield refill. Boss every 5th stage. Hurry-up ghost.
- Endless generated stages (4 themes). Every stage is validated with the real physics so every platform and enemy spawn is reachable.
- Online: PeerJS (WebRTC), 4-letter room codes. Host-authoritative: the host simulates, the guest sends inputs and renders 30 Hz snapshots, and predicts its own dragon locally so it feels instant.
- Touch controls on touch devices (`?touch=1` to force them). `P` pause, `M` music, `Esc` leave.

## Layout
`js/sim.js` rules (no DOM) | `js/levels.js` stage generator | `js/reach.js` stage validator | `js/art.js` art and placeholder characters |
`js/main.js` UI, loop, online glue, prediction | `js/net.js` | `js/audio.js` synth sfx + music.
Bubbles are the Unity "2D Bubble Animations" pack, packed by `tools/pack.py`. Dragons and monsters are placeholders drawn in `art.js`.

## Dev tools
- `node dev/shot.js "autostart=solo&lv=4" shots/x.png 1500 [@script.js]` screenshot one frame of the real game (optionally run a script first).
- `node dev/nettest.js` two-tab online test (also with 160 ms of artificial lag).
- `node dev/reach.js 60` validate stages; `node dev/dbg.js 10` print a stage; `node dev/bot.js 30 6000 2` headless smoke sweep.
- `dev/t*.js` are scripted checks of individual mechanics for shot.js.
