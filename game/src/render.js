// The renderer: everything is drawn in code on a 2D canvas — vector ships, sprite glows,
// a parallax starfield over slow nebula clouds. The logical field is 1280x800; the canvas
// is letterboxed to the window and scaled by the device pixel ratio, so the picture is the
// same on every screen. shadowBlur is used only on a few hero elements (title text, the
// carrier core); the many small glows are pre-rendered sprites, which keeps the frame cheap.
import { ASTEROID, CARRIER, COMBO, FIELD, FONT, FONT_MONO, PALETTE, PLAYER, POWERUP } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

/** A radial glow sprite: white-hot core fading through `color` to transparent. */
function makeGlowSprite(color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** The nebula backdrop, painted once: three soft colour clouds on deep space. */
function makeNebula() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const g = c.getContext('2d');
  const blobs = [
    [150, 110, 190, PALETTE.nebulaA],
    [480, 260, 220, PALETTE.nebulaB],
    [330, 60, 150, PALETTE.nebulaC],
    [90, 330, 130, PALETTE.nebulaB],
    [560, 90, 120, PALETTE.nebulaA],
  ];
  for (const [x, y, r, color] of blobs) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 640, 400);
  }
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  const sprites = {
    cyan: makeGlowSprite('rgba(61,243,255,0.85)'),
    magenta: makeGlowSprite('rgba(255,61,240,0.85)'),
    yellow: makeGlowSprite('rgba(255,231,74,0.9)'),
    red: makeGlowSprite('rgba(255,84,112,0.9)'),
    green: makeGlowSprite('rgba(81,255,158,0.85)'),
    orange: makeGlowSprite('rgba(255,154,61,0.85)'),
    violet: makeGlowSprite('rgba(180,107,255,0.85)'),
    white: makeGlowSprite('rgba(255,255,255,0.8)'),
  };
  const nebula = makeNebula();

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * view.dpr);
    canvas.height = Math.round(canvas.clientHeight * view.dpr);
    view.scale = Math.min(canvas.clientWidth / FIELD.width, canvas.clientHeight / FIELD.height);
    view.ox = (canvas.clientWidth - FIELD.width * view.scale) / 2;
    view.oy = (canvas.clientHeight - FIELD.height * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function glow(sprite, x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- entities

  function drawShip(p, time) {
    if (!p.alive) return;
    const blink = p.invuln > 0 && Math.floor(time * 14) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = blink ? 0.35 : 1;
    // Engine flame: a flickering teardrop under the hull.
    const flame = 13 + Math.sin(time * 42) * 3.5 + Math.sin(time * 71) * 2;
    const flameGrad = ctx.createLinearGradient(0, 14, 0, 14 + flame + 8);
    flameGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    flameGrad.addColorStop(0.35, 'rgba(61,243,255,0.85)');
    flameGrad.addColorStop(1, 'rgba(61,243,255,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-6, 14);
    ctx.lineTo(0, 16 + flame);
    ctx.lineTo(6, 14);
    ctx.closePath();
    ctx.fill();
    // Hull: a sleek dart with swept wings and magenta tips.
    const hull = ctx.createLinearGradient(0, -24, 0, 18);
    hull.addColorStop(0, '#bffcff');
    hull.addColorStop(0.45, PALETTE.player);
    hull.addColorStop(1, '#0e6d8c');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(7, -4);
    ctx.lineTo(21, 13);
    ctx.lineTo(21, 17);
    ctx.lineTo(8, 13);
    ctx.lineTo(4, 17);
    ctx.lineTo(-4, 17);
    ctx.lineTo(-8, 13);
    ctx.lineTo(-21, 17);
    ctx.lineTo(-21, 13);
    ctx.lineTo(-7, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,254,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = PALETTE.playerAccent;
    ctx.beginPath();
    ctx.moveTo(21, 13); ctx.lineTo(21, 17); ctx.lineTo(14, 14.5); ctx.closePath();
    ctx.moveTo(-21, 13); ctx.lineTo(-21, 17); ctx.lineTo(-14, 14.5); ctx.closePath();
    ctx.fill();
    // Cockpit.
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.ellipse(0, -6, 3.4, 7, 0, 0, TAU);
    ctx.fill();
    // Muzzle flash on the frame the guns fire.
    if (p.flash > 0) glow(sprites.yellow, 0, -30, 34, 0.9);
    ctx.restore();
    // Shield bubble.
    if (p.shield) {
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(time * 5) * 0.15;
      ctx.strokeStyle = PALETTE.shield;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= 0.35;
      glow(sprites.green, p.x, p.y, 84, 0.5);
      ctx.restore();
    }
  }

  function drawDrone(e, time) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.sin(e.t * 2.1 + e.phase) * 0.22);
    glow(sprites.magenta, 0, 0, 74, 0.5);
    const body = ctx.createLinearGradient(0, -16, 0, 18);
    body.addColorStop(0, '#ff8df7');
    body.addColorStop(0.5, PALETTE.drone);
    body.addColorStop(1, '#8c1166');
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : body;
    ctx.beginPath();
    ctx.moveTo(0, 19);
    ctx.lineTo(6, 4);
    ctx.lineTo(19, -9);
    ctx.lineTo(19, -14);
    ctx.lineTo(7, -8);
    ctx.lineTo(0, -13);
    ctx.lineTo(-7, -8);
    ctx.lineTo(-19, -14);
    ctx.lineTo(-19, -9);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,251,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : PALETTE.droneCore;
    ctx.beginPath();
    ctx.arc(0, 0, 4.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawAsteroid(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    const grad = ctx.createRadialGradient(-e.radius * 0.3, -e.radius * 0.3, e.radius * 0.2, 0, 0, e.radius * 1.15);
    grad.addColorStop(0, '#c97a2e');
    grad.addColorStop(1, PALETTE.asteroidDark);
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : grad;
    ctx.beginPath();
    const n = e.verts.length;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU;
      const r = e.radius * e.verts[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = e.flash > 0 ? '#ffffff' : PALETTE.asteroid;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    if (e.flash <= 0) {
      ctx.fillStyle = 'rgba(60, 28, 4, 0.5)';
      ctx.beginPath();
      ctx.arc(e.radius * 0.28, e.radius * 0.1, e.radius * 0.2, 0, TAU);
      ctx.arc(-e.radius * 0.3, e.radius * 0.34, e.radius * 0.14, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCarrier(e, time) {
    ctx.save();
    ctx.translate(e.x, e.y);
    glow(sprites.violet, 0, 0, 340, 0.4);
    const hull = ctx.createLinearGradient(0, -52, 0, 46);
    hull.addColorStop(0, '#d9b8ff');
    hull.addColorStop(0.4, PALETTE.carrier);
    hull.addColorStop(1, '#3c1573');
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : hull;
    ctx.beginPath();
    ctx.moveTo(-118, 18);
    ctx.lineTo(-84, -26);
    ctx.lineTo(-40, -44);
    ctx.lineTo(40, -44);
    ctx.lineTo(84, -26);
    ctx.lineTo(118, 18);
    ctx.lineTo(86, 40);
    ctx.lineTo(30, 30);
    ctx.lineTo(0, 46);
    ctx.lineTo(-30, 30);
    ctx.lineTo(-86, 40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,225,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Side pods and gun turrets.
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#5b21a8';
    for (const sx of [-92, 92]) {
      ctx.beginPath();
      ctx.ellipse(sx, 6, 20, 13, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#2a1650';
    for (const sx of [-34, 34]) {
      ctx.beginPath();
      ctx.arc(sx, 34, 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = PALETTE.carrier;
      ctx.stroke();
    }
    // The pulsing core — the one place shadowBlur earns its keep.
    ctx.save();
    ctx.shadowColor = '#ff3df0';
    ctx.shadowBlur = 22;
    const coreGrad = ctx.createRadialGradient(0, -6, 0, 0, -6, 17);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.4, '#ff3df0');
    coreGrad.addColorStop(1, 'rgba(255,61,240,0.15)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, -6, 13 + Math.sin(time * 4) * 2, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Damage bar under the hull.
    if (e.hp < e.maxHp) {
      const w = 190;
      ctx.fillStyle = 'rgba(8,10,26,0.8)';
      ctx.fillRect(e.x - w / 2, e.y + 58, w, 7);
      ctx.fillStyle = PALETTE.danger;
      ctx.fillRect(e.x - w / 2, e.y + 58, (w * e.hp) / e.maxHp, 7);
    }
  }

  function drawPowerup(u, time) {
    const pulse = 1 + Math.sin(time * 5 + u.t * 3) * 0.1;
    ctx.save();
    ctx.translate(u.x, u.y + Math.sin(time * 3 + u.t) * 3);
    ctx.scale(pulse, pulse);
    const conf = {
      spread: { color: PALETTE.spread, sprite: sprites.yellow },
      shield: { color: PALETTE.shield, sprite: sprites.green },
      life: { color: PALETTE.life, sprite: sprites.red },
    }[u.kind];
    glow(conf.sprite, 0, 0, 62, 0.65);
    ctx.fillStyle = 'rgba(8,12,30,0.9)';
    ctx.strokeStyle = conf.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, POWERUP.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = conf.color;
    ctx.strokeStyle = conf.color;
    if (u.kind === 'spread') {
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (const a of [-0.5, 0, 0.5]) {
        ctx.moveTo(0, 6);
        ctx.lineTo(Math.sin(a) * 10, 6 - Math.cos(a) * 13);
      }
      ctx.stroke();
    } else if (u.kind === 'shield') {
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, -5.5);
      ctx.lineTo(8, 2);
      ctx.quadraticCurveTo(8, 8, 0, 10.5);
      ctx.quadraticCurveTo(-8, 8, -8, 2);
      ctx.lineTo(-8, -5.5);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 9);
      ctx.bezierCurveTo(-13, -1, -8, -10, 0, -4.5);
      ctx.bezierCurveTo(8, -10, 13, -1, 0, 9);
      ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- HUD & screens

  function text(str, x, y, size, color, align = 'left', mono = false, weight = 700) {
    ctx.font = `${weight} ${size}px ${mono ? FONT_MONO : FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawHud(state, best) {
    const p = state.player;
    text(`SCORE ${String(state.score).padStart(6, '0')}`, 26, 32, 25, PALETTE.text, 'left', true);
    text(`BEST ${String(Math.max(best, state.score)).padStart(6, '0')}`, 26, 62, 15, PALETTE.muted, 'left', true);
    if (state.combo > 1) {
      const frac = Math.max(0, state.comboTimer / COMBO.window);
      text(`COMBO ×${state.multiplier}`, 26, 96, 20, PALETTE.bullet, 'left', true);
      ctx.fillStyle = 'rgba(255,231,74,0.25)';
      ctx.fillRect(26, 112, 132, 5);
      ctx.fillStyle = PALETTE.bullet;
      ctx.fillRect(26, 112, 132 * frac, 5);
    }
    text(`WAVE ${Math.max(1, state.wave)}`, FIELD.width - 26, 32, 25, PALETTE.text, 'right', true);
    // Lives as little ship silhouettes.
    for (let i = 0; i < state.lives; i += 1) {
      const x = FIELD.width - 40 - i * 30;
      ctx.fillStyle = PALETTE.player;
      ctx.beginPath();
      ctx.moveTo(x, 52);
      ctx.lineTo(x + 8, 68);
      ctx.lineTo(x, 63);
      ctx.lineTo(x - 8, 68);
      ctx.closePath();
      ctx.fill();
    }
    if (p.spreadTimer > 0) {
      text('SPREAD', 26, FIELD.height - 30, 16, PALETTE.spread, 'left', true);
      ctx.fillStyle = 'rgba(255,231,74,0.25)';
      ctx.fillRect(110, FIELD.height - 34, 110, 7);
      ctx.fillStyle = PALETTE.spread;
      ctx.fillRect(110, FIELD.height - 34, 110 * Math.min(1, p.spreadTimer / POWERUP.spreadSeconds), 7);
    }
    if (p.shield) text('◉ SHIELD', 26, FIELD.height - 58, 16, PALETTE.shield, 'left', true);
    if (state.carrier !== null) {
      const w = 430;
      const x = (FIELD.width - w) / 2;
      text('CARRIER', FIELD.width / 2, 24, 14, PALETTE.carrier, 'center', true);
      ctx.fillStyle = 'rgba(8,10,26,0.8)';
      ctx.fillRect(x, 34, w, 10);
      ctx.fillStyle = PALETTE.carrier;
      ctx.fillRect(x, 34, (w * Math.max(0, state.carrier.hp)) / state.carrier.maxHp, 10);
      ctx.strokeStyle = 'rgba(240,225,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, 34, w, 10);
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
  }

  function drawTitle(state, best) {
    const cx = FIELD.width / 2;
    ctx.save();
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 34;
    text('NEON', cx, 168, 104, PALETTE.player, 'center', false, 800);
    ctx.shadowColor = PALETTE.playerAccent;
    text('STARFALL', cx, 268, 104, '#ff7df3', 'center', false, 800);
    ctx.restore();
    text('A  N E O N  A R C A D E  S H O O T E R', cx, 348, 21, PALETTE.text, 'center', true, 400);
    panel(cx - 308, 396, 616, 168);
    text('MOVE', cx - 278, 434, 19, PALETTE.player, 'left', true);
    text('WASD · Arrow keys · Drag', cx - 176, 434, 19, PALETTE.text, 'left');
    text('FIRE', cx - 278, 472, 19, PALETTE.player, 'left', true);
    text('Hold SPACE · Hold pointer', cx - 176, 472, 19, PALETTE.text, 'left');
    text('PAUSE', cx - 278, 510, 19, PALETTE.player, 'left', true);
    text('P — grab spread, shield & lives as they fall', cx - 176, 510, 19, PALETTE.text, 'left');
    if (best > 0) text(`BEST SCORE  ${best}`, cx, 606, 20, PALETTE.bullet, 'center', true);
    const blink = 0.74 + Math.sin(state.time * 4.2) * 0.26;
    ctx.globalAlpha = blink;
    text('PRESS ENTER OR CLICK TO LAUNCH', cx, 664, 24, PALETTE.text, 'center', false, 800);
    ctx.globalAlpha = 1;
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(24, 2, 10, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const cx = FIELD.width / 2;
    ctx.save();
    ctx.shadowColor = PALETTE.danger;
    ctx.shadowBlur = 30;
    text('GAME OVER', cx, 268, 84, PALETTE.danger, 'center', false, 800);
    ctx.restore();
    text(`SCORE  ${state.score}`, cx, 378, 40, PALETTE.text, 'center', true);
    text(state.score >= best && state.score > 0 ? `NEW BEST!` : `BEST  ${best}`, cx, 428, 22, PALETTE.bullet, 'center', true);
    text(`REACHED WAVE ${Math.max(1, state.wave)}`, cx, 472, 20, PALETTE.muted, 'center', true);
    const blink = 0.74 + Math.sin(state.time * 4.2) * 0.26;
    ctx.globalAlpha = blink;
    text('PRESS ENTER OR CLICK TO RETRY', cx, 566, 23, PALETTE.text, 'center', false, 800);
    ctx.globalAlpha = 1;
  }

  function drawBanner(banner) {
    const total = banner.kind === 'clear' ? 2.2 : 1.5;
    const remain = banner.timer;
    const phase = 1 - remain / total; // 0 in, 1 out
    const alpha = Math.min(1, Math.min(phase, 1 - phase) * 4 + 0.15);
    const cx = FIELD.width / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = banner.kind === 'clear' ? PALETTE.shield : PALETTE.player;
    ctx.shadowBlur = 24;
    text(banner.text, cx, 300, 56, banner.kind === 'clear' ? PALETTE.shield : PALETTE.player, 'center', false, 800);
    ctx.restore();
    if (banner.sub) {
      ctx.globalAlpha = alpha;
      text(banner.sub, cx, 352, 21, PALETTE.bullet, 'center', true);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------- the frame

  function draw(state, screen, best, opts = {}) {
    const { dpr, scale, ox, oy } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

    // Screen shake: a decaying offset driven by the state's shake magnitude.
    if (state.shake > 0.2) {
      const t = state.time * 60;
      ctx.translate(Math.sin(t * 1.7) * state.shake * 0.55, Math.cos(t * 2.3) * state.shake * 0.55);
    }

    // Deep space: gradient, two nebula layers scrolling at different depths, then stars.
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.spaceTop);
    grad.addColorStop(0.55, PALETTE.space);
    grad.addColorStop(1, '#03040c');
    ctx.fillStyle = grad;
    ctx.fillRect(-24, -24, FIELD.width + 48, FIELD.height + 48);
    const nebA = (state.time * 7) % FIELD.height;
    const nebB = (state.time * 13) % FIELD.height;
    ctx.globalAlpha = 0.5;
    for (const off of [nebA - FIELD.height, nebA]) ctx.drawImage(nebula, 0, off, FIELD.width, FIELD.height);
    ctx.globalAlpha = 0.3;
    for (const off of [nebB - FIELD.height, nebB]) ctx.drawImage(nebula, -160, off, FIELD.width + 320, FIELD.height);
    ctx.globalAlpha = 1;
    for (const layer of state.starLayers) {
      for (const s of layer.stars) {
        const tw = 0.55 + 0.45 * Math.sin(state.time * 2.4 + s.phase);
        ctx.globalAlpha = tw;
        ctx.fillStyle = '#dfefff';
        ctx.fillRect(s.x, s.y, layer.size, layer.size);
      }
    }
    ctx.globalAlpha = 1;

    // Entities, back to front.
    for (const u of state.powerups) drawPowerup(u, state.time);
    for (const e of state.enemies) {
      if (e.kind === 'drone') drawDrone(e, state.time);
      else if (e.kind === 'asteroid') drawAsteroid(e);
      else drawCarrier(e, state.time);
    }
    for (const b of state.enemyBullets) {
      glow(sprites.red, b.x, b.y, 30, 0.85);
      ctx.fillStyle = '#ffe3e9';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.4, 0, TAU);
      ctx.fill();
    }
    drawShip(state.player, state.time);
    for (const b of state.bullets) {
      glow(sprites.yellow, b.x, b.y, 30, 0.8);
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 2.6, 7.5, Math.atan2(b.vx, -b.vy), 0, TAU);
      ctx.fill();
    }
    for (const pt of state.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      glow(pt.color === '#3df3ff' ? sprites.cyan : pt.color === '#ff3df0' ? sprites.magenta
        : pt.color === '#ff9a3d' ? sprites.orange : pt.color === '#b46bff' ? sprites.violet
        : pt.color === '#51ff9e' ? sprites.green : sprites.white,
        pt.x, pt.y, pt.size * 7, a * 0.9);
    }
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      text(f.text, f.x, f.y, 17, f.color, 'center', true);
    }
    ctx.globalAlpha = 1;

    // Chrome over the world.
    if (screen !== SCREEN_TITLE) drawHud(state, best);
    if (state.banner !== null && screen === SCREEN_PLAY) drawBanner(state.banner);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_OVER) drawOver(state, best);
    else if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(3,5,16,0.6)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      text('PAUSED', FIELD.width / 2, 380, 54, PALETTE.text, 'center', false, 800);
      text('P or ESC to resume', FIELD.width / 2, 436, 20, PALETTE.muted, 'center');
    }
    if (opts.muted) text('MUTED (M)', FIELD.width - 26, FIELD.height - 26, 14, PALETTE.muted, 'right', true);

    // A fine neon frame around the field.
    ctx.strokeStyle = 'rgba(61,243,255,0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2);
  }

  return {
    draw,
    /** Convert a pointer position in canvas device pixels to logical field coordinates. */
    toLogical(devX, devY) {
      return {
        x: (devX / view.dpr - view.ox) / view.scale,
        y: (devY / view.dpr - view.oy) / view.scale,
      };
    },
  };
}
