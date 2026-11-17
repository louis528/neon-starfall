// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by an autopilot, so the frame is
// what a short game really looks like and the same seed always gives the same frame.
//
//   start — the title screen over the attract world, drifting for a few seconds.
//   play  — a competent pilot (leads its targets, sidesteps bullets and rocks) mid-run.
//   end   — a reckless pilot that never dodges and stops firing once the sky gets busy:
//           the waves grind it down to the game-over screen.
import { FIELD, PLAYER, STEP } from './config.js';
import { EV_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 21;
const END_LIMIT_SECONDS = 900;

/** The enemy the pilot should engage: the lowest one it can still reach, carriers first. */
function targetOf(state) {
  let best = null;
  for (const e of state.enemies) {
    if (e.kind === 'carrier') return e;
    if (best === null || e.y > best.y) best = e;
  }
  return best;
}

/** Incoming danger near a point: bullets closing in, or a body about to overlap. */
function dangerAt(state, x, y) {
  let danger = 0;
  for (const b of state.enemyBullets) {
    const dx = b.x - x;
    const dy = b.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 130 * 130) danger += 2.2 * (1 - Math.sqrt(d2) / 130);
    // A bullet above, roughly in this column and travelling down, will arrive soon.
    if (Math.abs(dx) < 30 && dy < 0 && dy > -260 && b.vy > 0) danger += 1.6;
  }
  for (const e of state.enemies) {
    if (e.kind === 'carrier') continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    const rr = e.radius + PLAYER.radius + 26;
    if (d2 < rr * rr) danger += 3;
  }
  return danger;
}

/**
 * Steer toward the target's column while refusing to sit in danger: sample staying, and
 * stepping left or right, and take the safe option nearest the target.
 */
function pilot(state, reckless) {
  const p = state.player;
  if (!p.alive) return { x: 0, y: 0, fire: false };
  const target = targetOf(state);
  const wantX = target === null ? FIELD.width / 2 : target.x;
  const wantY = target !== null && target.kind === 'asteroid' ? 690 : 672;
  const options = [0, -1, 1, -0.5, 0.5];
  let bestOpt = 0;
  let bestCost = Infinity;
  for (const ox of options) {
    const nx = Math.min(FIELD.width - 30, Math.max(30, p.x + ox * PLAYER.speed * 0.22));
    const cost = Math.abs(nx - wantX) * 0.012 + (reckless ? 0 : dangerAt(state, nx, p.y) * 2.4);
    if (cost < bestCost) { bestCost = cost; bestOpt = ox; }
  }
  const dx = Math.abs(wantX - p.x) < 8 && bestOpt === 0 ? 0 : bestOpt;
  const dy = Math.abs(wantY - p.y) < 10 ? 0 : Math.sign(wantY - p.y);
  // The reckless pilot gives up shooting partway through, so the sky fills and closes in.
  const fire = reckless ? state.time < 26 : target !== null;
  return { x: dx, y: dy, fire };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name !== 'play' && name !== 'end') {
    world.reset();
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0, fire: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.reset();
  world.startWave(1);
  if (name === 'play') {
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      if (world.step(STEP, pilot(state, false), false) & EV_OVER) break;
    }
    return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
    if (world.step(STEP, pilot(state, true), false) & EV_OVER) break;
  }
  return { screen: SCREEN_OVER, best: state.score };
}
