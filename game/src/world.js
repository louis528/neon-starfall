// The Neon Starfall simulation: the player ship, three enemy kinds (diving drones, spinning
// asteroids, a carrier every fifth wave), enemy fire, power-ups, the combo multiplier, waves
// and particles. It knows nothing about the DOM or sound: step() advances the state by a fixed
// step and returns a bitmask of events for the shell to announce and sonify. Every random draw
// comes from the seeded generator, so a seed always replays the same game.
import {
  ASTEROID, CARRIER, COMBO, DRONE, ENEMY_BULLET, FIELD, PLAYER, POWERUP, WAVE,
} from './config.js';

export const EV_LASER = 1;
export const EV_EXPLOSION = 2;
export const EV_BIG_EXPLOSION = 4;
export const EV_PICKUP = 8;
export const EV_HIT = 16;
export const EV_OVER = 32;
export const EV_WAVE = 64;
export const EV_SHIELD_BREAK = 128;

const TAU = Math.PI * 2;

function makeStars(random) {
  const layers = [
    { speed: 22, size: 1.1, count: 90 },
    { speed: 55, size: 1.8, count: 60 },
    { speed: 118, size: 2.6, count: 32 },
  ];
  return layers.map((layer) => ({
    ...layer,
    stars: Array.from({ length: layer.count }, () => ({
      x: random.range(0, FIELD.width),
      y: random.range(0, FIELD.height),
      phase: random.range(0, TAU),
    })),
  }));
}

export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    lives: PLAYER.lives,
    wave: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    over: false,
    shake: 0,
    banner: null, // { text, sub, timer, kind: 'start' | 'clear' }
    player: null,
    carrier: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    powerups: [],
    particles: [],
    floaters: [],
    starLayers: makeStars(random),
    queue: [],
    attractTimer: 0,
  };

  function resetPlayer() {
    state.player = {
      x: FIELD.width / 2,
      y: 690,
      invuln: 0,
      fireCooldown: 0,
      spreadTimer: 0,
      shield: false,
      flash: 0,
      trailTimer: 0,
      alive: true,
    };
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.lives = PLAYER.lives;
    state.wave = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.over = false;
    state.shake = 0;
    state.banner = null;
    state.carrier = null;
    state.bullets.length = 0;
    state.enemyBullets.length = 0;
    state.enemies.length = 0;
    state.powerups.length = 0;
    state.particles.length = 0;
    state.floaters.length = 0;
    state.queue.length = 0;
    state.attractTimer = 0;
    resetPlayer();
  }

  // ------------------------------------------------------------- spawning

  function spawnDrone(x, delayFree) {
    state.enemies.push({
      kind: 'drone',
      x, baseX: x, y: -30,
      hp: DRONE.hp, maxHp: DRONE.hp, radius: DRONE.radius,
      t: random.range(0, TAU),
      phase: random.range(0, TAU),
      speed: DRONE.baseSpeed + DRONE.speedPerWave * (state.wave - 1) + random.range(-14, 20),
      fireTimer: random.range(1.2, DRONE.fireInterval + 1.2),
      flash: 0,
      scoreValue: DRONE.score,
    });
    return delayFree;
  }

  function spawnAsteroid(x, big) {
    const radius = big ? ASTEROID.radiusBig : ASTEROID.radiusSmall;
    const verts = [];
    const n = big ? 9 : 7;
    for (let i = 0; i < n; i += 1) verts.push(random.range(0.72, 1.12));
    state.enemies.push({
      kind: 'asteroid',
      x, y: -56,
      hp: big ? ASTEROID.hpBig : ASTEROID.hpSmall,
      maxHp: big ? ASTEROID.hpBig : ASTEROID.hpSmall,
      radius,
      t: 0, phase: 0,
      speed: (ASTEROID.baseSpeed + ASTEROID.speedPerWave * (state.wave - 1)) * random.range(0.85, 1.2),
      drift: random.range(-26, 26),
      rot: random.range(0, TAU),
      rotSpeed: random.range(-ASTEROID.spin, ASTEROID.spin) || 0.7,
      verts,
      flash: 0,
      scoreValue: big ? ASTEROID.scoreBig : ASTEROID.scoreSmall,
    });
  }

  function spawnCarrier() {
    const cycle = Math.max(1, Math.round(state.wave / WAVE.carrierEvery));
    const hp = CARRIER.baseHp + CARRIER.hpPerCycle * (cycle - 1);
    const carrier = {
      kind: 'carrier',
      x: FIELD.width / 2, y: -110,
      hp, maxHp: hp, radius: CARRIER.radius,
      t: 0, phase: 0,
      fireTimer: 2.2, burstLeft: 0, burstTimer: 0,
      flash: 0,
      scoreValue: CARRIER.score,
    };
    state.enemies.push(carrier);
    state.carrier = carrier;
  }

  /** Build the spawn queue for wave `n`: drone streams, scattered asteroids, or a carrier. */
  function startWave(n) {
    state.wave = n;
    const queue = [];
    if (n % WAVE.carrierEvery === 0) {
      queue.push({ kind: 'carrier', delay: 0.6 });
      const escorts = 5 + n / WAVE.carrierEvery;
      for (let i = 0; i < escorts; i += 1) {
        queue.push({ kind: 'drone', delay: 4 + i * 2.4, x: random.range(110, FIELD.width - 110) });
      }
    } else {
      let delay = 0.4;
      let left = WAVE.dronesBase + WAVE.dronesPerWave * n;
      while (left > 0) {
        const group = Math.min(left, random.int(3, 5));
        const gx = random.range(130, FIELD.width - 130);
        for (let i = 0; i < group; i += 1) {
          queue.push({ kind: 'drone', delay, x: Math.min(FIELD.width - 60, Math.max(60, gx + random.range(-90, 90))) });
          delay += 0.38;
        }
        left -= group;
        delay += random.range(1.0, 1.9);
      }
      const rocks = Math.min(WAVE.asteroidsBase + Math.floor(n / 2), 8);
      for (let i = 0; i < rocks; i += 1) {
        queue.push({ kind: 'asteroid', delay: random.range(1.5, Math.max(3, delay - 1)), x: random.range(70, FIELD.width - 70), big: random.chance(0.45) });
      }
    }
    queue.sort((a, b) => a.delay - b.delay);
    state.queue = queue;
    state.banner = { text: `WAVE ${n}`, sub: n % WAVE.carrierEvery === 0 ? 'CARRIER SIGNATURE DETECTED' : '', timer: 1.5, kind: 'start' };
  }

  function runQueue(dt) {
    for (const item of state.queue) item.delay -= dt;
    while (state.queue.length > 0 && state.queue[0].delay <= 0) {
      const item = state.queue.shift();
      if (item.kind === 'drone') spawnDrone(item.x);
      else if (item.kind === 'asteroid') spawnAsteroid(item.x, item.big);
      else if (item.kind === 'carrier') spawnCarrier();
    }
  }

  // ------------------------------------------------------------- effects

  function explode(x, y, color, count, speed, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = random.range(0, TAU);
      const v = random.range(speed * 0.25, speed);
      const life = random.range(0.3, 0.85);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life, maxLife: life,
        size: random.range(size * 0.5, size * 1.4),
        color,
      });
    }
  }

  function floater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 1.1 });
  }

  // ------------------------------------------------------------- combat

  function dropRoll(x, y) {
    if (!random.chance(POWERUP.dropChance)) return;
    const kind = random.chance(POWERUP.lifeChance) ? 'life' : random.chance(0.55) ? 'spread' : 'shield';
    state.powerups.push({ kind, x, y, t: random.range(0, TAU), radius: POWERUP.radius });
  }

  function killEnemy(enemy, index, events) {
    state.enemies.splice(index, 1);
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.perStep));
    const gained = enemy.scoreValue * state.multiplier;
    state.score += gained;
    floater(enemy.x, enemy.y, `+${gained}`, '#ffe74a');
    if (enemy.kind === 'carrier') {
      state.carrier = null;
      explode(enemy.x, enemy.y, '#b46bff', 46, 420, 4.4);
      explode(enemy.x, enemy.y, '#ff3df0', 30, 300, 3.4);
      explode(enemy.x, enemy.y, '#ffffff', 16, 200, 2.6);
      state.shake = Math.max(state.shake, 17);
      events |= EV_BIG_EXPLOSION;
    } else {
      const color = enemy.kind === 'drone' ? '#ff3df0' : '#ff9a3d';
      explode(enemy.x, enemy.y, color, enemy.kind === 'asteroid' && enemy.maxHp > 1 ? 20 : 13, 300, 3.2);
      events |= EV_EXPLOSION;
    }
    dropRoll(enemy.x, enemy.y);
    return events;
  }

  function hitPlayer(events) {
    const p = state.player;
    state.combo = 0;
    state.multiplier = 1;
    state.comboTimer = 0;
    state.lives -= 1;
    explode(p.x, p.y, '#3df3ff', 30, 360, 3.6);
    explode(p.x, p.y, '#ffffff', 12, 220, 2.4);
    state.shake = Math.max(state.shake, 15);
    events |= EV_HIT;
    if (state.lives <= 0) {
      p.alive = false;
      state.over = true;
      explode(p.x, p.y, '#ff3df0', 34, 380, 4);
      events |= EV_OVER | EV_BIG_EXPLOSION;
    } else {
      p.invuln = PLAYER.invulnerable;
    }
    return events;
  }

  function fireEnemyBullet(from, spreadAngle) {
    const p = state.player;
    const base = Math.atan2(p.y - from.y, p.x - from.x) + (spreadAngle ?? 0);
    state.enemyBullets.push({
      x: from.x, y: from.y + 8,
      vx: Math.cos(base) * ENEMY_BULLET.speed,
      vy: Math.sin(base) * ENEMY_BULLET.speed,
      radius: ENEMY_BULLET.radius,
      life: ENEMY_BULLET.life,
    });
  }

  function updatePlayer(dt, input, events) {
    const p = state.player;
    if (!p.alive) return events;
    p.x = Math.min(FIELD.width - 30, Math.max(30, p.x + input.x * PLAYER.speed * dt));
    p.y = Math.min(PLAYER.maxY, Math.max(PLAYER.minY, p.y + input.y * PLAYER.speed * dt));
    if (p.invuln > 0) p.invuln -= dt;
    if (p.spreadTimer > 0) p.spreadTimer -= dt;
    if (p.flash > 0) p.flash -= dt;
    p.fireCooldown -= dt;

    // Engine trail: a soft cyan spark every few steps, drifting down.
    p.trailTimer -= dt;
    if (p.trailTimer <= 0) {
      p.trailTimer = 0.028;
      state.particles.push({
        x: p.x + random.range(-4, 4), y: p.y + 20,
        vx: random.range(-14, 14), vy: random.range(120, 190),
        life: 0.34, maxLife: 0.34, size: random.range(1.6, 3), color: '#3df3ff',
      });
    }

    if (input.fire && p.fireCooldown <= 0) {
      p.fireCooldown = PLAYER.fireInterval;
      p.flash = 0.05;
      const angles = p.spreadTimer > 0 ? [-0.17, 0, 0.17] : [0];
      for (const a of angles) {
        state.bullets.push({
          x: p.x + Math.sin(a) * 10, y: p.y - 20,
          vx: Math.sin(a) * PLAYER.bulletSpeed,
          vy: -Math.cos(a) * PLAYER.bulletSpeed,
          radius: PLAYER.bulletRadius,
        });
      }
      events |= EV_LASER;
    }
    return events;
  }

  function updateEnemies(dt, attract, events) {
    const p = state.player;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.kind === 'drone') {
        e.y += e.speed * dt;
        e.x = e.baseX + Math.sin(e.t * DRONE.swayFrequency + e.phase) * DRONE.swayAmplitude;
        if (!attract && state.wave >= DRONE.fireFromWave && p.alive && e.y > 30 && e.y < FIELD.height * 0.62) {
          e.fireTimer -= dt;
          if (e.fireTimer <= 0) {
            e.fireTimer = DRONE.fireInterval * random.range(0.75, 1.3);
            if (random.chance(DRONE.fireChance)) fireEnemyBullet(e, 0);
          }
        }
      } else if (e.kind === 'asteroid') {
        e.y += e.speed * dt;
        e.x += e.drift * dt;
        e.rot += e.rotSpeed * dt;
        if (e.x < e.radius) { e.x = e.radius; e.drift = Math.abs(e.drift); }
        if (e.x > FIELD.width - e.radius) { e.x = FIELD.width - e.radius; e.drift = -Math.abs(e.drift); }
      } else if (e.kind === 'carrier') {
        if (e.y < CARRIER.y) e.y = Math.min(CARRIER.y, e.y + 95 * dt);
        e.x = FIELD.width / 2 + Math.sin(e.t * CARRIER.swaySpeed) * CARRIER.swayAmplitude;
        if (!attract && p.alive && e.y >= CARRIER.y - 1) {
          if (e.burstLeft > 0) {
            e.burstTimer -= dt;
            if (e.burstTimer <= 0) {
              e.burstTimer = CARRIER.burstGap;
              e.burstLeft -= 1;
              fireEnemyBullet({ x: e.x - 34, y: e.y + 30 }, -0.09);
              fireEnemyBullet({ x: e.x + 34, y: e.y + 30 }, 0.09);
            }
          } else {
            e.fireTimer -= dt;
            if (e.fireTimer <= 0) {
              e.fireTimer = CARRIER.fireInterval * random.range(0.85, 1.15);
              e.burstLeft = CARRIER.burstCount;
              e.burstTimer = 0;
            }
          }
        }
      }
      if (e.y - e.radius > FIELD.height + 70) {
        state.enemies.splice(i, 1);
        if (e.kind === 'carrier') state.carrier = null;
      }
    }
    return events;
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -24 || b.x < -24 || b.x > FIELD.width + 24) state.bullets.splice(i, 1);
    }
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = state.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y < -24 || b.y > FIELD.height + 24 || b.x < -24 || b.x > FIELD.width + 24) {
        state.enemyBullets.splice(i, 1);
      }
    }
  }

  function collide(events) {
    const p = state.player;
    // Player bullets against enemies (last enemy first: carriers sit behind their escorts).
    for (let bi = state.bullets.length - 1; bi >= 0; bi -= 1) {
      const b = state.bullets[bi];
      let consumed = false;
      for (let ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
        const e = state.enemies[ei];
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const rr = b.radius + e.radius * 0.86;
        if (dx * dx + dy * dy <= rr * rr) {
          consumed = true;
          e.hp -= 1;
          e.flash = 0.09;
          if (e.hp <= 0) events = killEnemy(e, ei, events);
          break;
        }
      }
      if (consumed) state.bullets.splice(bi, 1);
    }
    if (!p.alive) return events;
    const vulnerable = p.invuln <= 0;
    // Enemy bullets against the player.
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = state.enemyBullets[i];
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const rr = b.radius + PLAYER.radius * 0.8;
      if (dx * dx + dy * dy <= rr * rr) {
        state.enemyBullets.splice(i, 1);
        if (!vulnerable) continue;
        if (p.shield) {
          p.shield = false;
          p.invuln = 1.0;
          explode(p.x, p.y, '#51ff9e', 16, 260, 3);
          events |= EV_SHIELD_BREAK;
        } else {
          events = hitPlayer(events);
        }
        if (!p.alive || p.invuln > 0) break;
      }
    }
    if (!p.alive) return events;
    // Enemies ramming the player.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const rr = e.radius * 0.8 + PLAYER.radius;
      if (dx * dx + dy * dy <= rr * rr) {
        const wasCarrier = e.kind === 'carrier';
        events = killEnemy(e, i, events);
        if (!wasCarrier && vulnerable && !p.shield) {
          events = hitPlayer(events);
        } else if (!wasCarrier && p.shield && vulnerable) {
          p.shield = false;
          p.invuln = 1.0;
          events |= EV_SHIELD_BREAK;
        }
        if (!p.alive) break;
      }
    }
    // Power-ups drifting into the ship.
    for (let i = state.powerups.length - 1; i >= 0; i -= 1) {
      const u = state.powerups[i];
      const dx = u.x - p.x;
      const dy = u.y - p.y;
      const rr = u.radius + PLAYER.radius + 6;
      if (dx * dx + dy * dy <= rr * rr) {
        state.powerups.splice(i, 1);
        if (u.kind === 'spread') {
          p.spreadTimer = POWERUP.spreadSeconds;
          floater(p.x, p.y - 34, 'SPREAD SHOT', '#ffe74a');
        } else if (u.kind === 'shield') {
          p.shield = true;
          floater(p.x, p.y - 34, 'SHIELD UP', '#51ff9e');
        } else {
          state.lives = Math.min(state.lives + 1, 6);
          floater(p.x, p.y - 34, '+1 LIFE', '#ff6b81');
        }
        explode(u.x, u.y, '#ffffff', 8, 160, 2.2);
        events |= EV_PICKUP;
      }
    }
    return events;
  }

  function updateFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { state.particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.985;
      pt.vy *= 0.985;
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 44 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
    for (const layer of state.starLayers) {
      for (const s of layer.stars) {
        s.y += layer.speed * dt;
        if (s.y > FIELD.height + 3) { s.y = -3; s.x = random.range(0, FIELD.width); }
      }
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 34);
  }

  // ------------------------------------------------------------- the step

  /**
   * Advance by dt. `input` is { x, y, fire } with axes in -1..1. In attract mode the world
   * drifts decoratively behind the title screen: no fire, no score, no damage.
   */
  function step(dt, input, attract) {
    let events = 0;
    state.time += dt;
    updateFx(dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) { state.combo = 0; state.multiplier = 1; }
    }

    if (attract) {
      state.attractTimer -= dt;
      if (state.attractTimer <= 0) {
        state.attractTimer = random.range(0.7, 1.5);
        if (random.chance(0.55)) spawnAsteroid(random.range(70, FIELD.width - 70), random.chance(0.4));
        else spawnDrone(random.range(90, FIELD.width - 90));
      }
      const p = state.player;
      p.x = FIELD.width / 2 + Math.sin(state.time * 0.6) * 130;
      p.y = 688 + Math.sin(state.time * 1.7) * 7;
      p.trailTimer -= dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = 0.03;
        state.particles.push({
          x: p.x + random.range(-4, 4), y: p.y + 20,
          vx: random.range(-12, 12), vy: random.range(110, 170),
          life: 0.32, maxLife: 0.32, size: random.range(1.6, 3), color: '#3df3ff',
        });
      }
      events = updateEnemies(dt, true, events);
      return events;
    }

    if (state.banner !== null) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) {
        if (state.banner.kind === 'clear' && !state.over) {
          startWave(state.wave + 1);
          events |= EV_WAVE;
        } else {
          state.banner = null;
        }
      }
    }

    const bannerBlocking = state.banner !== null && state.banner.kind === 'clear';
    if (!bannerBlocking && !state.over) runQueue(dt);
    events = updatePlayer(dt, input, events);
    events = updateEnemies(dt, false, events);
    updateBullets(dt);
    events = collide(events);
    for (let i = state.powerups.length - 1; i >= 0; i -= 1) {
      const u = state.powerups[i];
      u.t += dt;
      u.y += POWERUP.fallSpeed * dt;
      if (u.y > FIELD.height + 30) state.powerups.splice(i, 1);
    }

    // Wave cleared: queue spent, sky empty, no banner already running.
    if (!state.over && state.banner === null && state.queue.length === 0 && state.enemies.length === 0 && state.wave >= 1) {
      const bonus = 100 * state.wave;
      state.score += bonus;
      state.banner = { text: `WAVE ${state.wave} CLEAR`, sub: `BONUS +${bonus}`, timer: WAVE.bannerSeconds, kind: 'clear' };
      events |= EV_WAVE;
    }
    return events;
  }

  // A fresh world is a reset world: the title screen's attract mode steps it before any
  // game starts, so the player and the empty sky must exist from the beginning.
  reset();

  return { state, reset, startWave, step };
}
