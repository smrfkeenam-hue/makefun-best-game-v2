// STEAMWARD — a best-game-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, no library
// and no network request). The train never stops; the player lays track
// ahead of it across ten miles, bridging rivers and tunnelling mountains,
// with three cars, a brake, and coal to collect. This program hands the
// entry in: it copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads,
// with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import {
  cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The gate needs 3-4 screenshots; fail here with a plain message instead
// of letting the dossier builder report a cryptic shortfall later.
const shotFiles = readdirSync(join(out, 'screenshots'))
  .filter((name) => /\.(png|jpe?g)$/i.test(name));
if (shotFiles.length < 3) {
  throw new Error(
    `STEAMWARD needs at least 3 screenshots in screenshots/, found ${shotFiles.length}. `
    + 'Take them with the Playwright script (shots.json) before running this.',
  );
}
console.log(`STEAMWARD: copied game/ and ${shotFiles.length} screenshots to ${out}`);

// game/index.html is the entry the browser opens; without it the entry is
// an empty folder, so refuse early rather than shipping a broken game.
if (!existsSync(join(out, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — the entry has no game to play.');
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`STEAMWARD: wrote dossier.json (${dossierBytes} bytes). Entry is ready in ${out}.`);
