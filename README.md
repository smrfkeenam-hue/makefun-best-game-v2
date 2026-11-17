# makefun-best-game-v2

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/smrfkeenam-hue/makefun-best-game-v2/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/smrfkeenam-hue/makefun-best-game-v2/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

STEAMWARD — the train never stops. Lay the track before it does. A real-time track-laying game: guide a runaway engine ten miles to the terminus, placing straights, curves, bridges and tunnels from a hand of three while the train rolls — faster every mile. Three cars, a brake with limited charges, coal to collect, and a derail costs a car. Playable offline in a desktop browser, no libraries, no network.

## How to play

- Click a tile in your hand, then click the board to lay it. **R** rotates it, **right-click** removes a laid tile (−15), **D** discards (−10).
- **SPACE** brakes the train (3 charges per mile, +1 per coal). **P** pauses, **M** mutes.
- Straight and curve tiles go on grass, bridges on water, tunnels in mountains. Reach the TERMINUS on the right edge of the board to finish the mile; finish mile 5 to repair a car.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/game/, out/screenshots/ and out/dossier.json
```

## Screenshots

Staged scenes of the real game (`?shot=start|play|win|lose`), listed in `shots.json`; the cover is `1-play.jpg`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
