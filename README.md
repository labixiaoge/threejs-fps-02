[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/labixiaoge/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/labixiaoge/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# RUSTLINE DEPOT — a three.js tactical FPS

A round-based tactical FPS in three.js (0.187.0), built for the make.fun
`threejs-fps-02` bounty. Counter-Strike-style, never a copy: an original map,
original art, original sounds, original names. Single-player against bots,
desktop browser, static files, no build step, no network requests.

## The game

You lead Vanguard (amber) against the Sentinel squad (teal) on **Rustline
Depot**, a rail depot at dawn with three lanes — North, Mid, South — and two
plant sites. First team to 8 rounds wins (max 15).

- **Objective:** carry the charge to Site A (Warehouse) or Site B (Fuel
  Yard) and hold **E** to plant (3.5 s). The 40 s fuse then runs; Sentinel
  must defuse (5 s channel) or lose the round when it blows. Elimination
  also wins a round.
- **Economy:** $800 to start, +$300 per kill, +$300 per plant, +$3,250 per
  round won / +$1,900 per round lost (plus a loss-streak bonus). Spend it
  in the buy menu (**B**) during the 15 s buy phase: four weapons and
  plated armour. Weapons stay yours for the match.
- **Gunplay:** four weapons (P9 sidearm, VK-9 Repeater SMG, AR-77 Longshot
  rifle, LW-50 Lance sniper) with distinct damage, fire rate, magazine and
  recoil. Spread grows with movement and sustained fire and shrinks when
  crouched or aiming (right mouse) — stopping to aim pays. Headshots deal
  2–4× damage. Armour absorbs half of each hit.
- **Bots:** 4 teammates + 5 enemies with a real state machine — route
  following along a waypoint graph (BFS paths), engaging with
  line-of-sight checks, reaction times and burst fire, strafing while they
  shoot, planting and defusing the charge, converging on the planted site.
- **Movement:** acceleration, friction, gravity, jump, crouch, slow walk,
  axis-separated AABB collision with the map. Fixed 60 Hz simulation,
  decoupled from rendering; pooled tracers and particles (no per-frame
  allocation in hot loops).
- **Presentation:** procedural canvas textures (asphalt, concrete,
  container corrugation, hazard stripes, gradient dawn sky), dynamic
  shadows, dusk fog, muzzle flash light, tracers, impact bursts, WebAudio
  synthesised sounds (no audio files), live 2D minimap, kill feed, hit
  markers, damage vignette, round banners.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Click | Fire |
| Right mouse (hold) | Aim (tighter spread, narrower view) |
| R | Reload |
| E (hold) | Plant the charge at a site |
| B | Buy menu (buy phase; keys 1–4 buy) |
| 1 / 2 / 3 | Sidearm / rifle / sniper |
| Ctrl or C | Crouch |
| Shift | Walk slowly |
| Space | Jump |
| M | Mute |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No install, no build. Any static server works; `game/index.html` is the entry.

## Screenshots

`screenshots/` holds four real renders of the game's own code, taken in
headless Chromium at 1280×800 via the deterministic `?shot=` frames
(`shots.json`): title screen, live firefight, buy menu, round won.

## Layout

- `main.ts` — Node 22 entrypoint: copies `game/` + `screenshots/` to
  `/output` (`MAKEFUN_OUTPUT_DIR` outside the grader) and writes
  `dossier.json` with `buildDossier` from `vendor/makefun-threejs.ts`.
- `game/index.html` — the page: HUD DOM, buy menu, one import map for `three`.
- `game/src/` — one module per job: `main.js` (loop + rounds + economy),
  `world.js` (Rustline Depot map + waypoint graph), `player.js` (movement
  + collision + health/armour), `weapon.js` (four guns + view model),
  `bots.js` (bot AI), `combat.js` (hitscan, tracers, particles),
  `objective.js` (plant/defuse/fuse), `hud.js` (HUD, buy menu, minimap),
  `input.js` (keyboard/mouse/pointer lock), `audio.js` (synth sounds),
  `palette.js` (palette + procedural textures).
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
- `serve.ts` — local static server for play-testing.

## License

MIT — see `LICENSE`. three.js is under its own MIT license
(`game/vendor/three/LICENSE`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=j11gmnzr&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
