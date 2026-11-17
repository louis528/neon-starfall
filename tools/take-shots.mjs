// Regenerate screenshots/ from the game's deterministic shot scenes: serve game/ with the
// repo's own serve.ts, open each ?shot= URL at 1280x800, wait for the page to flag
// window.__shotReady, and save a quality-80 JPEG. Also reports any network request that
// leaves the local server (there must be none: the game is fully offline) and any page
// error, and enforces the competition's 256 KiB per-screenshot cap.
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8137;
const SHOTS = [
  { name: '1-start.jpg', query: '?shot=start&seed=1' },
  { name: '2-play.jpg', query: '?shot=play&seed=1' },
  { name: '3-end.jpg', query: '?shot=end&seed=1' },
];
const CAP = 262144;

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: root, stdio: 'pipe' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('serve.ts did not come up');
}

let failed = false;
try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (err) => { failed = true; console.error('PAGE ERROR:', err.message); });
  page.on('request', (req) => {
    if (!req.url().startsWith(`http://127.0.0.1:${PORT}`) && !req.url().startsWith('data:')) {
      failed = true;
      console.error('EXTERNAL REQUEST:', req.url());
    }
  });
  for (const shot of SHOTS) {
    await page.goto(`http://127.0.0.1:${PORT}/${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
    const out = join(root, 'screenshots', shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 80 });
    const bytes = statSync(out).size;
    console.log(`${shot.name}: ${bytes} bytes ${bytes <= CAP ? 'OK' : 'OVER CAP!'}`);
    if (bytes > CAP) failed = true;
  }
  await browser.close();
} finally {
  stop();
}
if (failed) process.exit(1);
console.log('screenshots done');
