const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');

const ui = {
  start: document.querySelector('#startScreen'),
  gameOver: document.querySelector('#gameOver'),
  startButton: document.querySelector('#startButton'),
  restartButton: document.querySelector('#restartButton'),
  pauseButton: document.querySelector('#pauseButton'),
  settingsButton: document.querySelector('#settingsButton'),
  settingsModal: document.querySelector('#settingsModal'),
  profileNameInput: document.querySelector('#profileNameInput'),
  controlSchemeSelect: document.querySelector('#controlSchemeSelect'),
  musicVolumeInput: document.querySelector('#musicVolumeInput'),
  sfxVolumeInput: document.querySelector('#sfxVolumeInput'),
  musicVolumeLabel: document.querySelector('#musicVolumeLabel'),
  sfxVolumeLabel: document.querySelector('#sfxVolumeLabel'),
  musicMuteInput: document.querySelector('#musicMuteInput'),
  sfxMuteInput: document.querySelector('#sfxMuteInput'),
  resetButton: document.querySelector('#resetButton'),
  pilotName: document.querySelector('#pilotName'),
  score: document.querySelector('#scoreValue'),
  weapon: document.querySelector('#weaponValue'),
  xp: document.querySelector('#xpValue'),
  damage: document.querySelector('#damageValue'),
  finalScore: document.querySelector('#finalScore'),
};

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const STORAGE_KEY = 'movement-black-run-settings';
const TWO_PI = Math.PI * 2;

const defaultSettings = {
  profileName: 'Runner',
  controlScheme: 'wasd',
  musicVolume: 45,
  sfxVolume: 70,
  musicMuted: false,
  sfxMuted: false,
};

const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
const settings = { ...defaultSettings, ...savedSettings };

const keys = new Set();
const pointer = { active: false, x: WIDTH / 2, y: HEIGHT - 90, firing: false };

const weapons = [
  { name: 'Vulture Splitter', cooldown: 170, speed: 610, pattern: [-0.02], radius: 4, damageMod: 1 },
  { name: 'Twin Money', cooldown: 210, speed: 600, pattern: [-0.1, 0.1], radius: 4, damageMod: 0.9 },
  { name: 'Yellow Fan', cooldown: 260, speed: 560, pattern: [-0.22, -0.08, 0.08, 0.22], radius: 3.5, damageMod: 0.72 },
  { name: 'Move Rail', cooldown: 310, speed: 760, pattern: [0], radius: 6, damageMod: 1.9 },
  { name: 'Chain Burst', cooldown: 130, speed: 530, pattern: [-0.04, 0.04], radius: 3, damageMod: 0.62 },
  { name: 'Boss Cutter', cooldown: 360, speed: 690, pattern: [-0.14, 0, 0.14], radius: 5, damageMod: 1.25 },
];

const enemyTypes = {
  vulture: {
    name: 'Стервятник',
    score: 45,
    hp: 1,
    radius: 22,
    speed: 110,
    color: '#0a0a08',
  },
  streak: {
    name: 'Жёлтая молния',
    score: 70,
    hp: 1,
    radius: 18,
    speed: 185,
    color: '#161207',
  },
  heavy: {
    name: 'Монолит',
    score: 160,
    hp: 4,
    radius: 36,
    speed: 58,
    color: '#050505',
  },
  triad: {
    name: 'Триада',
    score: 120,
    hp: 2,
    radius: 30,
    speed: 72,
    color: '#090908',
  },
  shade: {
    name: 'Призрак',
    score: 95,
    hp: 2,
    radius: 26,
    speed: 98,
    color: 'rgba(10, 10, 8, 0.42)',
  },
};

const game = {
  running: false,
  paused: false,
  started: false,
  over: false,
  time: 0,
  last: performance.now(),
  spawnTimer: 0,
  powerTimer: 2800,
  signTimer: 5000,
  bossTimer: 36000,
  score: 0,
  weaponIndex: 0,
  damage: 1,
  xp: 0,
  shake: 0,
  player: { x: WIDTH * 0.5, y: HEIGHT - 78, radius: 18, hp: 3, invulnerable: 0 },
  bullets: [],
  enemyBullets: [],
  enemies: [],
  powerups: [],
  particles: [],
  signs: [],
  stars: [],
};

const audio = {
  context: null,
  musicGain: null,
  sfxGain: null,
  bass: null,
  lead: null,
  musicStarted: false,
};

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function syncSettingsToUi() {
  ui.profileNameInput.value = settings.profileName;
  ui.controlSchemeSelect.value = settings.controlScheme;
  ui.musicVolumeInput.value = settings.musicVolume;
  ui.sfxVolumeInput.value = settings.sfxVolume;
  ui.musicMuteInput.checked = settings.musicMuted;
  ui.sfxMuteInput.checked = settings.sfxMuted;
  ui.musicVolumeLabel.textContent = `${settings.musicVolume}%`;
  ui.sfxVolumeLabel.textContent = `${settings.sfxVolume}%`;
  ui.pilotName.textContent = settings.profileName || 'Runner';
  updateAudioGains();
}

function updateAudioGains() {
  if (!audio.context) return;
  const now = audio.context.currentTime;
  const musicLevel = settings.musicMuted ? 0 : settings.musicVolume / 100;
  const sfxLevel = settings.sfxMuted ? 0 : settings.sfxVolume / 100;
  audio.musicGain.gain.setTargetAtTime(musicLevel * 0.16, now, 0.03);
  audio.sfxGain.gain.setTargetAtTime(sfxLevel * 0.32, now, 0.02);
}

function initAudio() {
  if (audio.context) {
    audio.context.resume();
    updateAudioGains();
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audio.context = new AudioContextClass();
  audio.musicGain = audio.context.createGain();
  audio.sfxGain = audio.context.createGain();
  audio.musicGain.connect(audio.context.destination);
  audio.sfxGain.connect(audio.context.destination);
  updateAudioGains();
  startMusicLoop();
}

function startMusicLoop() {
  if (audio.musicStarted || !audio.context) return;
  audio.musicStarted = true;
  const ctxAudio = audio.context;
  const master = audio.musicGain;

  audio.bass = ctxAudio.createOscillator();
  audio.bass.type = 'sawtooth';
  audio.bass.frequency.value = 58;
  const bassFilter = ctxAudio.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 220;
  const bassGain = ctxAudio.createGain();
  bassGain.gain.value = 0.55;
  audio.bass.connect(bassFilter).connect(bassGain).connect(master);
  audio.bass.start();

  audio.lead = ctxAudio.createOscillator();
  audio.lead.type = 'square';
  audio.lead.frequency.value = 116;
  const leadGain = ctxAudio.createGain();
  leadGain.gain.value = 0.04;
  audio.lead.connect(leadGain).connect(master);
  audio.lead.start();

  const notes = [58, 58, 73, 65, 58, 87, 78, 65];
  let step = 0;
  window.setInterval(() => {
    if (!game.running || game.paused || !audio.context) return;
    const now = ctxAudio.currentTime;
    audio.bass.frequency.setTargetAtTime(notes[step % notes.length], now, 0.03);
    audio.lead.frequency.setTargetAtTime(notes[(step + 3) % notes.length] * 2, now, 0.02);
    step += 1;
  }, 360);
}

function playTone(type) {
  if (!audio.context || settings.sfxMuted || settings.sfxVolume === 0) return;
  const ctxAudio = audio.context;
  const now = ctxAudio.currentTime;
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  const filter = ctxAudio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 820;

  const presets = {
    shot: { wave: 'square', start: 620, end: 260, gain: 0.1, time: 0.08 },
    hit: { wave: 'sawtooth', start: 180, end: 90, gain: 0.16, time: 0.12 },
    pickup: { wave: 'sine', start: 460, end: 920, gain: 0.18, time: 0.16 },
    boom: { wave: 'triangle', start: 95, end: 36, gain: 0.22, time: 0.32 },
    hurt: { wave: 'sawtooth', start: 120, end: 55, gain: 0.26, time: 0.22 },
  };
  const preset = presets[type] || presets.shot;
  osc.type = preset.wave;
  osc.frequency.setValueAtTime(preset.start, now);
  osc.frequency.exponentialRampToValueAtTime(preset.end, now + preset.time);
  gain.gain.setValueAtTime(preset.gain, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + preset.time);
  osc.connect(filter).connect(gain).connect(audio.sfxGain);
  osc.start(now);
  osc.stop(now + preset.time + 0.03);
}

function createStars() {
  game.stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    speed: 12 + Math.random() * 42,
    size: Math.random() * 1.8 + 0.3,
    alpha: Math.random() * 0.5 + 0.18,
  }));
}

function resetGame() {
  game.running = true;
  game.paused = false;
  game.started = true;
  game.over = false;
  game.time = 0;
  game.last = performance.now();
  game.spawnTimer = 700;
  game.powerTimer = 2600;
  game.signTimer = 3500;
  game.bossTimer = 34000;
  game.score = 0;
  game.weaponIndex = 0;
  game.damage = 1;
  game.xp = 0;
  game.shake = 0;
  game.player = { x: WIDTH * 0.5, y: HEIGHT - 78, radius: 18, hp: 3, invulnerable: 1200 };
  game.bullets = [];
  game.enemyBullets = [];
  game.enemies = [];
  game.powerups = [];
  game.particles = [];
  game.signs = [];
  createStars();
  ui.start.hidden = true;
  ui.gameOver.hidden = true;
  ui.pauseButton.textContent = 'Пауза';
  updateHud();
}

function updateHud() {
  ui.pilotName.textContent = settings.profileName || 'Runner';
  ui.score.textContent = Math.floor(game.score).toLocaleString('ru-RU');
  ui.weapon.textContent = weapons[game.weaponIndex].name;
  ui.xp.textContent = `${game.xp} / 5`;
  ui.damage.textContent = `${game.damage}`;
}

function spawnEnemy(forceType) {
  const elapsed = game.time / 1000;
  const pool = ['vulture', 'vulture', 'vulture', 'streak', 'triad'];
  if (elapsed > 18) pool.push('heavy');
  if (elapsed > 28) pool.push('shade');
  if (elapsed > 42) pool.push('streak', 'triad', 'heavy');
  const kind = forceType || pool[Math.floor(Math.random() * pool.length)];
  const base = enemyTypes[kind];
  const enemy = {
    kind,
    name: base.name,
    x: 60 + Math.random() * (WIDTH - 120),
    y: -50,
    vx: 0,
    vy: base.speed + Math.min(72, elapsed * 1.4),
    radius: base.radius,
    hp: base.hp,
    maxHp: base.hp,
    score: base.score,
    phase: Math.random() * TWO_PI,
    shootTimer: kind === 'triad' ? 1000 + Math.random() * 1100 : 1800 + Math.random() * 2000,
    flash: 0,
  };

  if (kind === 'streak') enemy.vx = Math.random() > 0.5 ? 135 : -135;
  if (kind === 'shade') enemy.vx = Math.random() > 0.5 ? 48 : -48;
  game.enemies.push(enemy);
}

function spawnBoss() {
  const boss = {
    kind: 'boss',
    name: 'Movement Auditor',
    x: WIDTH / 2,
    y: -88,
    vx: 80,
    vy: 42,
    radius: 82,
    hp: 28 + Math.floor(game.time / 14000),
    maxHp: 28 + Math.floor(game.time / 14000),
    score: 1200,
    phase: 0,
    shootTimer: 900,
    flash: 0,
  };
  game.enemies.push(boss);
  spawnSign(true);
}

function spawnPowerup(kind) {
  const types = ['weapon', 'damage', 'xp'];
  const type = kind || types[Math.floor(Math.random() * types.length)];
  game.powerups.push({
    type,
    x: 60 + Math.random() * (WIDTH - 120),
    y: -25,
    vy: 95,
    radius: 17,
    spin: 0,
  });
}

function spawnSign(forceMoney = false) {
  const signTypes = [
    { text: 'Move is for Money', mode: 'billboard', side: 'left' },
    { text: 'Movement', sub: 'The People’s Chain', mode: 'vertical', side: 'right' },
    { text: 'THE MOVE STACK', mode: 'ghost', side: Math.random() > 0.5 ? 'left' : 'right' },
  ];
  const sign = forceMoney ? signTypes[0] : signTypes[Math.floor(Math.random() * signTypes.length)];
  game.signs.push({
    ...sign,
    x: sign.side === 'left' ? 26 : WIDTH - 250,
    y: -110,
    w: sign.mode === 'vertical' ? 86 : 230,
    h: sign.mode === 'vertical' ? 300 : 74,
    speed: 34,
    flicker: 0,
    life: 0,
  });
}

function shoot() {
  const weapon = weapons[game.weaponIndex];
  const now = game.time;
  if (game.nextShot && now < game.nextShot) return;
  game.nextShot = now + Math.max(70, weapon.cooldown - game.xp * 12);
  const totalDamage = Math.max(1, Math.round(game.damage * weapon.damageMod));

  weapon.pattern.forEach((angleOffset, index) => {
    game.bullets.push({
      x: game.player.x + (index - (weapon.pattern.length - 1) / 2) * 10,
      y: game.player.y - 22,
      vx: Math.sin(angleOffset) * weapon.speed,
      vy: -Math.cos(angleOffset) * weapon.speed,
      radius: weapon.radius,
      damage: totalDamage,
      life: 1200,
      weapon: game.weaponIndex,
    });
  });
  playTone('shot');
}

function enemyShoot(enemy) {
  if (enemy.kind === 'triad') {
    [-0.28, 0, 0.28].forEach((spread) => enemyBullet(enemy, spread, 175));
  } else if (enemy.kind === 'boss') {
    [-0.46, -0.24, 0, 0.24, 0.46].forEach((spread) => enemyBullet(enemy, spread, 150));
  } else if (enemy.kind === 'shade') {
    enemyBullet(enemy, 0, 210);
  }
}

function enemyBullet(enemy, spread, speed) {
  const dx = game.player.x - enemy.x;
  const dy = game.player.y - enemy.y;
  const angle = Math.atan2(dy, dx) + spread;
  game.enemyBullets.push({
    x: enemy.x,
    y: enemy.y + enemy.radius * 0.35,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 8,
    life: 4200,
  });
}

function addParticles(x, y, count, color = '#ffd21a', size = 3, power = 1) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TWO_PI;
    const speed = (40 + Math.random() * 190) * power;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: Math.random() * size + 1,
      life: 420 + Math.random() * 520,
      maxLife: 940,
      color,
    });
  }
}

function handleInput(dt) {
  const player = game.player;
  const speed = 310 + game.xp * 12;
  let dx = 0;
  let dy = 0;

  if (settings.controlScheme === 'mouse') {
    player.x += (pointer.x - player.x) * Math.min(1, dt * 8);
    player.y += (pointer.y - player.y) * Math.min(1, dt * 8);
    if (pointer.firing) shoot();
  } else {
    const leftKeys = settings.controlScheme === 'wasd' ? ['KeyA'] : ['ArrowLeft'];
    const rightKeys = settings.controlScheme === 'wasd' ? ['KeyD'] : ['ArrowRight'];
    const upKeys = settings.controlScheme === 'wasd' ? ['KeyW'] : ['ArrowUp'];
    const downKeys = settings.controlScheme === 'wasd' ? ['KeyS'] : ['ArrowDown'];

    if (leftKeys.some((key) => keys.has(key))) dx -= 1;
    if (rightKeys.some((key) => keys.has(key))) dx += 1;
    if (upKeys.some((key) => keys.has(key))) dy -= 1;
    if (downKeys.some((key) => keys.has(key))) dy += 1;
    if (keys.has('Space')) shoot();

    const length = Math.hypot(dx, dy) || 1;
    player.x += (dx / length) * speed * dt;
    player.y += (dy / length) * speed * dt;
  }

  player.x = clamp(player.x, 28, WIDTH - 28);
  player.y = clamp(player.y, 48, HEIGHT - 34);
}

function update(dt, ms) {
  if (!game.running || game.paused) return;
  game.time += ms;
  game.score += dt * 5;
  game.shake = Math.max(0, game.shake - ms);
  game.player.invulnerable = Math.max(0, game.player.invulnerable - ms);

  handleInput(dt);
  updateTimers(ms);
  updateBackground(dt);
  updateBullets(dt, ms);
  updateEnemies(dt, ms);
  updatePowerups(dt, ms);
  updateParticles(dt, ms);
  handleCollisions();
  updateHud();
}

function updateTimers(ms) {
  game.spawnTimer -= ms;
  game.powerTimer -= ms;
  game.signTimer -= ms;
  game.bossTimer -= ms;

  if (game.spawnTimer <= 0) {
    const elapsed = game.time / 1000;
    const batch = elapsed > 32 && Math.random() > 0.62 ? 2 : 1;
    for (let i = 0; i < batch; i += 1) spawnEnemy();
    game.spawnTimer = Math.max(330, 980 - elapsed * 7);
  }

  if (game.powerTimer <= 0) {
    const roll = Math.random();
    spawnPowerup(roll < 0.42 ? 'weapon' : roll < 0.72 ? 'damage' : 'xp');
    game.powerTimer = 5600 + Math.random() * 4200;
  }

  if (game.signTimer <= 0) {
    spawnSign();
    game.signTimer = 15000 + Math.random() * 5000;
  }

  if (game.bossTimer <= 0) {
    spawnBoss();
    game.bossTimer = 46000 + Math.random() * 12000;
  }
}

function updateBackground(dt) {
  game.stars.forEach((star) => {
    star.y += star.speed * dt;
    if (star.y > HEIGHT + 4) {
      star.y = -4;
      star.x = Math.random() * WIDTH;
    }
  });

  game.signs.forEach((sign) => {
    sign.y += sign.speed * dt;
    sign.life += dt;
    sign.flicker += dt;
  });
  game.signs = game.signs.filter((sign) => sign.y < HEIGHT + 160);
}

function updateBullets(dt, ms) {
  game.bullets.forEach((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= ms;
  });
  game.enemyBullets.forEach((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= ms;
  });
  game.bullets = game.bullets.filter((bullet) => bullet.life > 0 && bullet.y > -30 && bullet.x > -40 && bullet.x < WIDTH + 40);
  game.enemyBullets = game.enemyBullets.filter((bullet) => bullet.life > 0 && bullet.y < HEIGHT + 40 && bullet.x > -40 && bullet.x < WIDTH + 40);
}

function updateEnemies(dt, ms) {
  game.enemies.forEach((enemy) => {
    enemy.phase += dt;
    enemy.flash = Math.max(0, enemy.flash - ms);

    if (enemy.kind === 'streak') {
      enemy.x += Math.sin(enemy.phase * 7) * 260 * dt + enemy.vx * dt * 0.18;
      if (Math.random() < 0.05) addParticles(enemy.x, enemy.y + 16, 1, '#ffd21a', 2, 0.35);
    } else if (enemy.kind === 'shade') {
      enemy.x += Math.sin(enemy.phase * 2.1) * 80 * dt + enemy.vx * dt;
      enemy.shootTimer -= ms;
      if (enemy.shootTimer <= 0) {
        enemyShoot(enemy);
        enemy.flash = 280;
        enemy.shootTimer = 2200 + Math.random() * 1400;
      }
    } else if (enemy.kind === 'triad') {
      enemy.x += Math.sin(enemy.phase * 1.6) * 32 * dt;
      enemy.shootTimer -= ms;
      if (enemy.shootTimer <= 0) {
        enemyShoot(enemy);
        enemy.flash = 420;
        enemy.shootTimer = 1700 + Math.random() * 900;
      }
    } else if (enemy.kind === 'boss') {
      enemy.y = Math.min(96, enemy.y + enemy.vy * dt);
      enemy.x += enemy.vx * dt;
      if (enemy.x < 130 || enemy.x > WIDTH - 130) enemy.vx *= -1;
      enemy.shootTimer -= ms;
      if (enemy.shootTimer <= 0) {
        enemyShoot(enemy);
        enemy.flash = 360;
        enemy.shootTimer = Math.max(520, 1100 - game.time / 180);
      }
    } else {
      enemy.x += Math.sin(enemy.phase * 1.2) * 12 * dt;
    }

    if (enemy.kind !== 'boss') enemy.y += enemy.vy * dt;
    enemy.x = clamp(enemy.x, enemy.radius, WIDTH - enemy.radius);
  });
  game.enemies = game.enemies.filter((enemy) => enemy.y < HEIGHT + 100 && enemy.hp > 0);
}

function updatePowerups(dt) {
  game.powerups.forEach((powerup) => {
    powerup.y += powerup.vy * dt;
    powerup.spin += dt * 4;
  });
  game.powerups = game.powerups.filter((powerup) => powerup.y < HEIGHT + 40);
}

function updateParticles(dt, ms) {
  game.particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.life -= ms;
  });
  game.particles = game.particles.filter((particle) => particle.life > 0);
}

function handleCollisions() {
  game.bullets.forEach((bullet) => {
    game.enemies.forEach((enemy) => {
      if (bullet.dead || enemy.hp <= 0) return;
      if (distance(bullet, enemy) < bullet.radius + enemy.radius * 0.72) {
        bullet.dead = true;
        enemy.hp -= bullet.damage;
        enemy.flash = 180;
        addParticles(bullet.x, bullet.y, enemy.kind === 'heavy' ? 5 : 3, '#ffd21a', 2.8, 0.7);
        playTone('hit');
        if (enemy.hp <= 0) killEnemy(enemy);
      }
    });
  });
  game.bullets = game.bullets.filter((bullet) => !bullet.dead);

  game.enemyBullets.forEach((bullet) => {
    if (game.player.invulnerable > 0 || bullet.dead) return;
    if (distance(bullet, game.player) < bullet.radius + game.player.radius * 0.8) {
      bullet.dead = true;
      damagePlayer();
    }
  });
  game.enemyBullets = game.enemyBullets.filter((bullet) => !bullet.dead);

  game.enemies.forEach((enemy) => {
    if (game.player.invulnerable > 0 || enemy.hp <= 0) return;
    if (distance(enemy, game.player) < enemy.radius + game.player.radius * 0.72) {
      enemy.hp = 0;
      killEnemy(enemy, false);
      damagePlayer();
    }
  });

  game.powerups.forEach((powerup) => {
    if (powerup.dead) return;
    if (distance(powerup, game.player) < powerup.radius + game.player.radius) {
      powerup.dead = true;
      collectPowerup(powerup);
    }
  });
  game.powerups = game.powerups.filter((powerup) => !powerup.dead);
}

function killEnemy(enemy, giveReward = true) {
  enemy.hp = 0;
  game.score += enemy.score;
  game.shake = enemy.kind === 'boss' || enemy.kind === 'heavy' ? 260 : 100;
  addParticles(enemy.x, enemy.y, enemy.kind === 'heavy' ? 36 : enemy.kind === 'boss' ? 70 : 18, '#ffd21a', enemy.kind === 'boss' ? 5 : 3.6, enemy.kind === 'boss' ? 1.6 : 1);
  playTone(enemy.kind === 'boss' || enemy.kind === 'heavy' ? 'boom' : 'hit');

  if (giveReward) {
    if (enemy.kind === 'boss') {
      spawnPowerup('weapon');
      spawnPowerup('damage');
      spawnPowerup('xp');
    } else if (Math.random() < 0.12) {
      spawnPowerup();
    }
  }
}

function damagePlayer() {
  game.player.hp -= 1;
  game.player.invulnerable = 1500;
  game.shake = 420;
  addParticles(game.player.x, game.player.y, 24, '#fff9df', 3.8, 1.3);
  playTone('hurt');
  if (game.player.hp <= 0) endGame();
}

function collectPowerup(powerup) {
  if (powerup.type === 'weapon') {
    game.weaponIndex = (game.weaponIndex + 1) % weapons.length;
  } else if (powerup.type === 'damage') {
    game.damage += 1;
  } else if (powerup.type === 'xp') {
    game.xp = Math.min(5, game.xp + 1);
  }
  game.score += 80;
  addParticles(powerup.x, powerup.y, 22, powerupColor(powerup.type), 3, 1);
  playTone('pickup');
}

function endGame() {
  game.running = false;
  game.over = true;
  ui.gameOver.hidden = false;
  ui.finalScore.textContent = `Счёт: ${Math.floor(game.score).toLocaleString('ru-RU')}`;
}

function draw() {
  ctx.save();
  if (game.shake > 0) {
    const amount = Math.min(8, game.shake / 55);
    ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  }
  drawBackground();
  drawSigns();
  drawBullets();
  drawPowerups();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawOverlayHud();
  ctx.restore();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#030303');
  gradient.addColorStop(0.48, '#080806');
  gradient.addColorStop(1, '#010101');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = 'rgba(255, 210, 26, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 90, HEIGHT);
    ctx.stroke();
  }

  game.stars.forEach((star) => {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = '#ffd21a';
    ctx.fillRect(star.x, star.y, star.size, star.size * 2.8);
  });
  ctx.globalAlpha = 1;
}

function drawSigns() {
  game.signs.forEach((sign) => {
    const flickerPhase = Math.floor(sign.life * 7) % 9;
    const bright = flickerPhase === 0 || flickerPhase === 3 || flickerPhase === 4 || flickerPhase === 5;
    const alpha = bright ? 0.9 : sign.mode === 'ghost' ? 0.1 : 0.28;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (sign.mode === 'billboard') {
      ctx.fillStyle = '#ffd21a';
      ctx.shadowColor = '#ffd21a';
      ctx.shadowBlur = bright ? 20 : 3;
      ctx.fillRect(sign.x, sign.y, sign.w, sign.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#050505';
      ctx.font = '900 24px Inter, sans-serif';
      const text = bright && flickerPhase === 5 ? 'Move is for ...oney' : sign.text;
      ctx.fillText(text, sign.x + 15, sign.y + 45);
    } else if (sign.mode === 'vertical') {
      ctx.strokeStyle = '#ffd21a';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd21a';
      ctx.shadowBlur = bright ? 18 : 2;
      ctx.strokeRect(sign.x, sign.y, sign.w, sign.h);
      ctx.translate(sign.x + sign.w * 0.58, sign.y + sign.h - 22);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '900 30px Inter, sans-serif';
      ctx.strokeText('Movement', 0, 0);
      ctx.font = '700 14px Inter, sans-serif';
      ctx.strokeText('The People’s Chain', 8, 26);
    } else {
      ctx.globalAlpha = bright ? 0.24 : 0.08;
      ctx.fillStyle = '#3d392b';
      ctx.font = '1000 42px Inter, sans-serif';
      ctx.fillText(sign.text, sign.x, sign.y + 58);
    }
    ctx.restore();
  });
}

function drawPlayer() {
  const player = game.player;
  ctx.save();
  ctx.translate(player.x, player.y);
  const blink = player.invulnerable > 0 && Math.floor(game.time / 90) % 2 === 0;
  ctx.globalAlpha = blink ? 0.45 : 1;

  ctx.fillStyle = '#ffd21a';
  ctx.shadowColor = '#ffd21a';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(22, 22);
  ctx.lineTo(0, 12);
  ctx.lineTo(-22, 22);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#050505';
  ctx.font = '1000 18px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('M', 0, 7);
  ctx.restore();
}

function drawBullets() {
  game.bullets.forEach((bullet) => {
    ctx.save();
    ctx.fillStyle = '#ffd21a';
    ctx.shadowColor = '#ffd21a';
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  });

  game.enemyBullets.forEach((bullet) => {
    ctx.save();
    ctx.fillStyle = '#ffd21a';
    ctx.shadowColor = '#ffd21a';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius * 0.46, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  });
}

function drawPowerups() {
  game.powerups.forEach((powerup) => {
    ctx.save();
    ctx.translate(powerup.x, powerup.y);
    ctx.rotate(powerup.spin);
    ctx.fillStyle = powerupColor(powerup.type);
    ctx.shadowColor = powerupColor(powerup.type);
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, 0, powerup.radius, 0, TWO_PI);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#050505';
    ctx.font = '1000 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', 0, 1);
    ctx.restore();
  });
}

function drawEnemies() {
  game.enemies.forEach((enemy) => {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.kind === 'vulture') drawVulture(enemy);
    if (enemy.kind === 'streak') drawStreak(enemy);
    if (enemy.kind === 'heavy') drawHeavy(enemy);
    if (enemy.kind === 'triad') drawTriad(enemy);
    if (enemy.kind === 'shade') drawShade(enemy);
    if (enemy.kind === 'boss') drawBoss(enemy);
    ctx.restore();
  });
}

function drawVulture(enemy) {
  ctx.fillStyle = '#050505';
  ctx.strokeStyle = '#ffd21a';
  ctx.lineWidth = enemy.flash > 0 ? 3 : 1;
  ctx.beginPath();
  ctx.moveTo(0, 26);
  ctx.lineTo(16, -4);
  ctx.lineTo(28, -20);
  ctx.lineTo(5, -12);
  ctx.lineTo(0, -28);
  ctx.lineTo(-5, -12);
  ctx.lineTo(-28, -20);
  ctx.lineTo(-16, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd21a';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(0, -19, 18, 5, 0, 0, TWO_PI);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillRect(-8, -5, 5, 5);
  ctx.fillRect(4, -5, 5, 5);
}

function drawStreak(enemy) {
  ctx.strokeStyle = 'rgba(255, 210, 26, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-48, 14);
  ctx.lineTo(-14, 2);
  ctx.stroke();
  ctx.fillStyle = '#090906';
  ctx.strokeStyle = '#ffd21a';
  ctx.lineWidth = enemy.flash > 0 ? 3 : 1;
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(13, 22);
  ctx.lineTo(0, 16);
  ctx.lineTo(-13, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd21a';
  for (let i = -1; i <= 1; i += 1) ctx.fillRect(-8 + i * 8, -3 + i * 10, 16, 4);
}

function drawHeavy(enemy) {
  ctx.fillStyle = '#040404';
  ctx.strokeStyle = '#ffd21a';
  ctx.lineWidth = enemy.flash > 0 ? 3 : 1;
  ctx.fillRect(-42, -30, 84, 60);
  ctx.strokeRect(-42, -30, 84, 60);
  ctx.fillStyle = '#ffd21a';
  for (let x = -28; x <= 28; x += 14) {
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(x, -18, 2.5, 0, TWO_PI);
    ctx.arc(x, 18, 2.5, 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const cracks = enemy.maxHp - enemy.hp;
  ctx.strokeStyle = '#ffd21a';
  for (let i = 0; i < cracks; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-28 + i * 18, -8);
    ctx.lineTo(-16 + i * 18, 2);
    ctx.lineTo(-25 + i * 18, 17);
    ctx.stroke();
  }
}

function drawTriad(enemy) {
  ctx.fillStyle = '#050505';
  ctx.strokeStyle = '#ffd21a';
  ctx.lineWidth = enemy.flash > 0 ? 3 : 1;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(42, 5);
  ctx.lineTo(24, 30);
  ctx.lineTo(-24, 30);
  ctx.lineTo(-42, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  [-18, 0, 18].forEach((x) => {
    ctx.fillStyle = '#ffd21a';
    ctx.globalAlpha = enemy.flash > 0 ? 1 : 0.48;
    ctx.beginPath();
    ctx.arc(x, -5, 5, 0, TWO_PI);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawShade(enemy) {
  ctx.globalAlpha = enemy.flash > 0 ? 0.86 : 0.42;
  ctx.fillStyle = 'rgba(6, 6, 5, 0.86)';
  ctx.strokeStyle = `rgba(255, 210, 26, ${enemy.flash > 0 ? 0.9 : 0.32})`;
  ctx.lineWidth = enemy.flash > 0 ? 3 : 1;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.bezierCurveTo(42, -8, 48, 24, 0, 22);
  ctx.bezierCurveTo(-48, 24, -42, -8, 0, -18);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBoss(enemy) {
  ctx.fillStyle = '#050505';
  ctx.strokeStyle = '#ffd21a';
  ctx.lineWidth = enemy.flash > 0 ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(0, -74);
  ctx.lineTo(92, -8);
  ctx.lineTo(62, 60);
  ctx.lineTo(0, 32);
  ctx.lineTo(-62, 60);
  ctx.lineTo(-92, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffd21a';
  ctx.globalAlpha = 0.9;
  ctx.font = '1000 44px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('M', 0, 10);
  ctx.globalAlpha = 1;

  const hpWidth = 150 * (enemy.hp / enemy.maxHp);
  ctx.fillStyle = 'rgba(255, 210, 26, 0.18)';
  ctx.fillRect(-75, 72, 150, 8);
  ctx.fillStyle = '#ffd21a';
  ctx.fillRect(-75, 72, hpWidth, 8);
}

function drawParticles() {
  game.particles.forEach((particle) => {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.radius, particle.radius);
  });
  ctx.globalAlpha = 1;
}

function drawOverlayHud() {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.fillRect(14, 14, 164, 42);
  ctx.strokeStyle = 'rgba(255, 210, 26, 0.25)';
  ctx.strokeRect(14, 14, 164, 42);
  ctx.fillStyle = '#ffd21a';
  ctx.font = '900 15px Inter, sans-serif';
  ctx.fillText(`HP ${'■'.repeat(Math.max(0, game.player.hp))}`, 28, 40);

  if (game.paused) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#ffd21a';
    ctx.font = '1000 56px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ПАУЗА', WIDTH / 2, HEIGHT / 2);
  }
  ctx.restore();
}

function powerupColor(type) {
  if (type === 'damage') return '#fff9df';
  if (type === 'xp') return '#7cff6b';
  return '#ffd21a';
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loop(now) {
  const ms = Math.min(34, now - game.last);
  const dt = ms / 1000;
  game.last = now;
  update(dt, ms);
  draw();
  requestAnimationFrame(loop);
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
  };
}

ui.startButton.addEventListener('click', () => {
  initAudio();
  resetGame();
});

ui.restartButton.addEventListener('click', () => {
  initAudio();
  resetGame();
});

ui.pauseButton.addEventListener('click', () => {
  if (!game.started || game.over) return;
  game.paused = !game.paused;
  ui.pauseButton.textContent = game.paused ? 'Продолжить' : 'Пауза';
});

ui.settingsButton.addEventListener('click', () => {
  ui.settingsModal.showModal();
});

ui.profileNameInput.addEventListener('input', () => {
  settings.profileName = ui.profileNameInput.value.trim() || 'Runner';
  saveSettings();
  updateHud();
});

ui.controlSchemeSelect.addEventListener('change', () => {
  settings.controlScheme = ui.controlSchemeSelect.value;
  saveSettings();
});

ui.musicVolumeInput.addEventListener('input', () => {
  settings.musicVolume = Number(ui.musicVolumeInput.value);
  ui.musicVolumeLabel.textContent = `${settings.musicVolume}%`;
  saveSettings();
  updateAudioGains();
});

ui.sfxVolumeInput.addEventListener('input', () => {
  settings.sfxVolume = Number(ui.sfxVolumeInput.value);
  ui.sfxVolumeLabel.textContent = `${settings.sfxVolume}%`;
  saveSettings();
  updateAudioGains();
});

ui.musicMuteInput.addEventListener('change', () => {
  settings.musicMuted = ui.musicMuteInput.checked;
  saveSettings();
  updateAudioGains();
});

ui.sfxMuteInput.addEventListener('change', () => {
  settings.sfxMuted = ui.sfxMuteInput.checked;
  saveSettings();
  updateAudioGains();
});

ui.resetButton.addEventListener('click', () => {
  Object.assign(settings, defaultSettings);
  saveSettings();
  syncSettingsToUi();
});

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'KeyP') ui.pauseButton.click();
  if (event.code === 'Escape' && ui.settingsModal.open) ui.settingsModal.close();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

canvas.addEventListener('pointermove', (event) => {
  const point = getCanvasPoint(event);
  pointer.x = point.x;
  pointer.y = point.y;
});

canvas.addEventListener('pointerdown', (event) => {
  initAudio();
  const point = getCanvasPoint(event);
  pointer.active = true;
  pointer.firing = true;
  pointer.x = point.x;
  pointer.y = point.y;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointerup', (event) => {
  pointer.active = false;
  pointer.firing = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener('pointerleave', () => {
  pointer.firing = false;
});

syncSettingsToUi();
createStars();
requestAnimationFrame(loop);
