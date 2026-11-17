// Every tuning number and colour of Neon Starfall in one place. The playfield is a fixed
// 1280x800 logical area; the renderer scales it to the window, so no rule below depends on
// the screen size.

export const FIELD = { width: 1280, height: 800 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  speed: 540,
  /** The ship may roam the whole width and the lower two thirds of the field. */
  minY: 430,
  maxY: 756,
  fireInterval: 0.14,
  bulletSpeed: 920,
  bulletRadius: 5,
  invulnerable: 2.0,
  lives: 3,
};

export const DRONE = {
  radius: 17,
  hp: 1,
  baseSpeed: 148,
  speedPerWave: 9,
  swayAmplitude: 64,
  swayFrequency: 2.1,
  fireFromWave: 3,
  fireInterval: 2.6,
  fireChance: 0.55,
  score: 100,
};

export const ASTEROID = {
  hpSmall: 1,
  hpBig: 3,
  radiusSmall: 20,
  radiusBig: 36,
  baseSpeed: 96,
  speedPerWave: 6,
  spin: 1.6,
  scoreSmall: 50,
  scoreBig: 150,
};

export const CARRIER = {
  radius: 74,
  y: 118,
  baseHp: 42,
  hpPerCycle: 14,
  swayAmplitude: 330,
  swaySpeed: 0.42,
  fireInterval: 1.7,
  burstCount: 3,
  burstGap: 0.14,
  score: 1000,
};

export const ENEMY_BULLET = { speed: 330, radius: 6, life: 4.5 };

export const POWERUP = {
  radius: 15,
  fallSpeed: 128,
  dropChance: 0.13,
  lifeChance: 0.16, // of the drops that happen, this share is an extra life
  spreadSeconds: 12,
};

export const COMBO = {
  window: 2.6,
  perStep: 8, // kills per multiplier step
  maxMultiplier: 8,
};

export const WAVE = {
  bannerSeconds: 2.2,
  dronesBase: 6,
  dronesPerWave: 2,
  asteroidsBase: 2,
  carrierEvery: 5,
};

export const PALETTE = {
  space: '#05060f',
  spaceTop: '#0a1030',
  nebulaA: 'rgba(64, 32, 140, 0.55)',
  nebulaB: 'rgba(10, 90, 120, 0.5)',
  nebulaC: 'rgba(140, 20, 90, 0.4)',
  player: '#3df3ff',
  playerCore: '#e8feff',
  playerAccent: '#ff3df0',
  bullet: '#ffe74a',
  enemyBullet: '#ff5470',
  drone: '#ff3df0',
  droneCore: '#ffd7fb',
  asteroid: '#ff9a3d',
  asteroidDark: '#8a4d16',
  carrier: '#b46bff',
  carrierCore: '#2a1650',
  spread: '#ffe74a',
  shield: '#51ff9e',
  life: '#ff6b81',
  text: '#eaf6ff',
  muted: '#8fa3c8',
  danger: '#ff5470',
  panel: 'rgba(10, 16, 38, 0.72)',
  panelEdge: 'rgba(61, 243, 255, 0.5)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-starfall.best';
