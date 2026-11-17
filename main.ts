// A working best-game-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. A starting point, not a winner: Block Dodger, a
// plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a title screen,
// score, lives and levels, game over and restart, flat colours and no sound. Build your own game
// (any genre, any library you vendor under game/, or none), put your 3 or 4 PNG or JPEG screenshots
// in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- Neon Starfall build steps (added for this entry) ---------------------
// Before the hand-in below, validate the payload against the same caps the
// scorer enforces, so a broken entry fails here with a readable message
// instead of inside the grader. After the hand-in, a build manifest derived
// purely from the copied files is written next to the dossier.

// Recursively list a directory as sorted root-relative paths with sizes.
function listTree(root, dir = root, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listTree(root, full, acc);
    else acc.push({ path: full.slice(root.length + 1), bytes: statSync(full).size });
  }
  return acc;
}

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

function preflight() {
  const problems = [];
  if (!existsSync(join(gameDir, 'index.html'))) problems.push('game/index.html is missing');
  const gameFiles = existsSync(gameDir) ? listTree(gameDir) : [];
  const gameBytes = gameFiles.reduce((sum, f) => sum + f.bytes, 0);
  if (gameFiles.length > 993) problems.push(`game/ holds ${gameFiles.length} files (cap 993)`);
  if (gameBytes > 50331648) problems.push(`game/ totals ${gameBytes} bytes (cap 50331648)`);
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort()
    : [];
  if (shots.length < 3 || shots.length > 4) problems.push(`screenshots/ holds ${shots.length} images (need 3 or 4)`);
  for (const name of shots) {
    const bytes = statSync(join(shotsDir, name)).size;
    if (bytes > 262144) problems.push(`screenshots/${name} is ${bytes} bytes (cap 262144)`);
  }
  if (problems.length) throw new Error(`Neon Starfall pre-flight failed:\n- ${problems.join('\n- ')}`);
  return { gameFiles, gameBytes, shots };
}

const checked = preflight();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

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

// Deterministic build manifest: every value comes from the copied files
// (sorted paths, sizes, and a sha256 over each path and its content), with
// no timestamps or randomness, so two runs over the same tree produce a
// byte-identical build-info.json and the handed-in bytes stay auditable.
const payload = listTree(join(out, 'game')).map((f) => ({ ...f, path: `game/${f.path}` }));
if (existsSync(join(out, 'screenshots'))) {
  payload.push(...listTree(join(out, 'screenshots')).map((f) => ({ ...f, path: `screenshots/${f.path}` })));
}
const digest = createHash('sha256');
for (const f of payload) {
  digest.update(f.path);
  digest.update('\0');
  digest.update(readFileSync(join(out, f.path)));
  digest.update('\0');
}
const manifest = {
  game: 'Neon Starfall',
  files: payload,
  file_count: payload.length,
  total_bytes: payload.reduce((sum, f) => sum + f.bytes, 0),
  game_files: checked.gameFiles.length,
  game_bytes: checked.gameBytes,
  screenshots: checked.shots,
  payload_sha256: digest.digest('hex'),
};
writeFileSync(join(out, 'build-info.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Neon Starfall: handed in ${manifest.file_count} files (${manifest.total_bytes} bytes), ` +
    `payload sha256 ${manifest.payload_sha256}`,
);
