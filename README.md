# Marisol Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/moonku-ai/marisol-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/moonku-ai/marisol-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for make.fun's **"Make GTA 6"** bounty ($1,666 in USDC). You are **Rae Marisol**, a courier fresh off the ferry in the sun-soaked coastal city of Marisol Bay — deliver packages, steal cars, dodge the Marisol Bay Police, and run five story missions to own the waterfront.

## Play it

Serve the `game/` folder with any static server and open `index.html` in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests — every script, font and sound is a file in `game/` or synthesized at runtime (three.js r152 is vendored under `game/vendor/`).

## The game

- **Open world on foot and by car** — downtown towers, beach and sea, marina, suburbs; a full road grid with traffic lights, sidewalks and palms.
- **Drive and steal** — 8 parked cars plus live traffic; enter any car with `E`, arcade driving physics, exhaust smoke, crash sparks and brake lights.
- **Traffic + pedestrians** — AI cars follow the roads and stop at red lights; pedestrians walk the sidewalks and flee from gunfire.
- **Wanted 0–5 stars** — crimes (theft, shootings, hit-and-runs) raise the heat; police cruisers chase and ram, officers hunt you on foot, a heli joins at 5 stars; hide to cool down, get **BUSTED** if an officer holds you, **WASTED** if your health hits zero.
- **5 story missions** — M1 First Delivery (timed), M2 The Commission (steal the coral Comet GT), M3 Gold Rush (hold the jewellers, escape the heat), M4 Hot Streets (3 checkpoints under fire), M5 Last Ferry Out (5-star escape to the pier helipad). Cash rewards, sequential unlocks, retry after failure.
- **Combat** — pistol and a buyable rifle (Bay Arms, $300), crosshair aiming, tracers, hit sparks, enemy gunmen who shoot back, hit-stop and camera shake.
- **HUD + minimap** — health/armor bars, cash, wanted stars, clock, objective text with distance, speedometer, kill feed, live 2D minimap.
- **Menus + saves** — start screen with the story, pause, game-over retry, and localStorage saves (mission, cash, position) with a Continue button.
- **Procedural audio** — WebAudio engine hum, police siren, gunshots and a bass loop. `M` mutes.

## Controls

| Key | Action |
| --- | --- |
| W A S D / mouse | Move / look (Shift to sprint) |
| E | Enter / exit car |
| Click / F | Shoot (1 fists, 2 pistol/rifle) |
| R | Reload |
| G | Buy rifle at Bay Arms ($300) |
| M | Mute |
| Esc | Pause |

Debug hooks for testing: `?shot=chase|street|mission|coast&seed=1` stages a screenshot scene, `?auto` skips the title screen, `?god` makes Rae invulnerable, and `window.__marisol` exposes `G.step / G.teleport / G.state`.

## Tech

- three.js r152 (vendored UMD build) + plain ES modules, no build step
- Pure static files under `game/`; `main.ts` (Node 22 stdlib) copies `game/` + `screenshots/` to the output dir and writes `dossier.json` via the vendored make.fun library
- Screenshots are real renders of the game, taken with Playwright

Built by an AI agent for make.fun's "Make GTA 6" bounty.
