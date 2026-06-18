// ============================================================
// TYPE TO SURVIVE — game.js
// ============================================================

(function () {
  'use strict';

  // ---------- DOM refs ----------
  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d');

  const menuOverlay = document.getElementById('menu-overlay');
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreviewWrap = document.getElementById('avatar-preview-wrap');
  const startBtn = document.getElementById('start-btn');
  const hud = document.getElementById('hud');
  const waveInfoEl = document.getElementById('wave-info');

  // ---------- canvas sizing ----------
  let W = 0, H = 0, DPR = Math.max(1, window.devicePixelRatio || 1);

  function resizeCanvas() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ---------- avatar state ----------
  // avatarImage stays null until the player uploads one; player renders as a
  // plain circle with an icon until then.
  const player = {
    x: 0, y: 0,
    radius: 34,
    avatarImage: null,
    maxHp: 10,
    hp: 10,
    damage: 1, // per completed word; upgraded via skill points in chunk 6
  };

  function centerPlayer() {
    player.x = W / 2;
    player.y = H / 2;
  }

  // ---------- avatar upload wiring ----------
  avatarPreviewWrap.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        player.avatarImage = img;
        // swap the placeholder "+" icon for the real preview in the menu
        avatarPreviewWrap.innerHTML = '';
        const previewImg = document.createElement('img');
        previewImg.src = ev.target.result;
        avatarPreviewWrap.appendChild(previewImg);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // ---------- idle render loop (menu state) ----------
  // Draws a calm idle scene behind the menu: dark arena, subtle grid/vignette,
  // and the player circle sitting in the center so the avatar choice is
  // visible in context even before starting.

  function drawBackground() {
    ctx.clearRect(0, 0, W, H);

    // base fill
    ctx.fillStyle = '#0B0E14';
    ctx.fillRect(0, 0, W, H);

    // faint radial grid rings centered on player, evokes "arena" / radar
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const maxR = Math.hypot(W, H) / 2;
    for (let r = 80; r < maxR; r += 80) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // faint cross axes
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.moveTo(-maxR, 0); ctx.lineTo(maxR, 0);
    ctx.moveTo(0, -maxR); ctx.lineTo(0, maxR);
    ctx.stroke();
    ctx.restore();

    // vignette
    const grad = ctx.createRadialGradient(player.x, player.y, 60, player.x, player.y, maxR);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawPlayer() {
    const { x, y, radius, avatarImage } = player;

    // soft glow ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,182,39,0.10)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImage) {
      // draw image cover-fit inside the circle
      const iw = avatarImage.width, ih = avatarImage.height;
      const scale = Math.max((radius * 2) / iw, (radius * 2) / ih);
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(avatarImage, x - dw / 2, y - dh / 2, dw, dh);
    } else {
      // plain circle fallback fill
      ctx.fillStyle = '#1C2230';
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.fillStyle = '#FFB627';
      ctx.font = `${radius}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☺', x, y + 2);
    }
    ctx.restore();

    // ring border
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFB627';
    ctx.stroke();
  }

  let idleAnimId = null;
  function idleLoop() {
    centerPlayer();
    drawBackground();
    drawPlayer();
    idleAnimId = requestAnimationFrame(idleLoop);
  }
  idleLoop();

  // ============================================================
  // CHUNK 2: enemy spawning, movement, rendering
  // ============================================================

  // Basic word bank for now — difficulty tiering arrives in chunk 5.
  const WORD_BANK = [
    'cat', 'dog', 'run', 'jump', 'fire', 'wolf', 'rock', 'wave',
    'storm', 'blade', 'shadow', 'ember', 'frost', 'spike', 'crawl',
    'venom', 'rust', 'howl', 'grit', 'fang'
  ];

  function randomWord() {
    return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
  }

  // ---------- enemy entity ----------
  // Each enemy: { x, y, word, speed, radius, color, dead }
  let enemies = [];

  // ---------- early-game ramp ----------
  // We track elapsed survival time (seconds) and derive spawn interval +
  // enemy speed from it. This is a *gentle* early ramp distinct from the
  // full difficulty system (word tiers, enemy HP, contact damage) that
  // lands in chunk 5 — here we only care about "how many, how fast".
  let elapsed = 0; // seconds since game start, reset on startGame()

  function currentSpawnInterval() {
    // starts very sparse (one enemy every ~3.2s alone on screen),
    // tightens down to a floor of ~0.5s by the 2-minute mark.
    const t = elapsed / 120; // 0..1 over first 2 minutes
    const clamped = Math.min(1, t);
    const start = 3.2, floor = 0.5;
    const interval = start - (start - floor) * clamped;
    // small randomness so it doesn't feel metronomic
    return interval * (0.85 + Math.random() * 0.3);
  }

  function currentEnemySpeed() {
    // starts slow (28px/s, easy to read/react to), ramps to 95px/s by ~3min
    const t = elapsed / 180;
    const clamped = Math.min(1, t);
    const start = 28, cap = 95;
    const base = start + (cap - start) * clamped;
    return base + Math.random() * 8;
  }

  let enemyIdCounter = 1;

  function spawnEnemy() {
    // spawn on a circle comfortably beyond the visible edge so they
    // visibly walk on-screen rather than popping in
    const maxDim = Math.max(W, H);
    const spawnRadius = maxDim * 0.62 + 60;
    const angle = Math.random() * Math.PI * 2;
    const x = player.x + Math.cos(angle) * spawnRadius;
    const y = player.y + Math.sin(angle) * spawnRadius;

    enemies.push({
      id: enemyIdCounter++,
      x, y,
      word: randomWord(),
      speed: currentEnemySpeed(),
      radius: 18,
      color: '#FF3B5C',
      dmg: 1, // contact damage to player; scales with difficulty in chunk 5
      maxHp: 1, // multi-hit enemies (2-3 words to kill) arrive with chunk 5 scaling
      hp: 1,
      dead: false,
    });
  }

  // ---------- spawn timing ----------
  let spawnTimer = 0;
  let nextSpawnIn = 0;

  function rollNextSpawn() {
    nextSpawnIn = currentSpawnInterval();
  }

  function updateSpawning(dt) {
    elapsed += dt;
    spawnTimer += dt;
    if (spawnTimer >= nextSpawnIn) {
      spawnTimer = 0;
      rollNextSpawn();
      spawnEnemy();
    }
  }

  // ---------- player damage state ----------
  let gameOverTriggered = false;
  let flashTimer = 0; // counts down after a hit, drives the red screen flash
  const dmgFlashEl = document.getElementById('dmg-flash');

  function takeDamage(amount) {
    if (gameOverTriggered) return;
    player.hp = Math.max(0, player.hp - amount);
    flashTimer = 0.35; // seconds the flash stays visible, fades out
    renderHearts();
    if (player.hp <= 0) {
      triggerGameOver();
    }
  }

  function updateFlash(dt) {
    if (flashTimer > 0) {
      flashTimer = Math.max(0, flashTimer - dt);
      dmgFlashEl.style.opacity = (flashTimer / 0.35).toFixed(2);
    } else {
      dmgFlashEl.style.opacity = 0;
    }
  }

  // ---------- enemy movement ----------
  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy);

      // reaching the player: deal contact damage, enemy is consumed.
      if (dist <= player.radius + e.radius) {
        e.dead = true;
        takeDamage(e.dmg);
        continue;
      }

      const vx = (dx / dist) * e.speed;
      const vy = (dy / dist) * e.speed;
      e.x += vx * dt;
      e.y += vy * dt;
    }
    // prune dead enemies
    enemies = enemies.filter(e => !e.dead);
  }

  // ============================================================
  // CHUNK 3: typing input, targeting, projectiles, shooting
  // ============================================================

  // currentTyped: the buffer the player has typed so far toward the locked
  // word. lockedEnemyId: once a unique prefix match exists, we commit to
  // that enemy's id so further typing always resolves against it even if
  // new enemies spawn with an overlapping prefix.
  let currentTyped = '';
  let lockedEnemyId = null;
  const typedBufferEl = document.getElementById('typed-buffer');

  function aliveEnemies() {
    return enemies.filter(e => !e.dead);
  }

  function findMatchingEnemies(prefix) {
    const p = prefix.toLowerCase();
    return aliveEnemies().filter(e => e.word.toLowerCase().startsWith(p));
  }

  function pickClosestEnemy(list) {
    let best = null, bestDist = Infinity;
    for (const e of list) {
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  function resetTypedBuffer() {
    currentTyped = '';
    lockedEnemyId = null;
  }

  function handleKeyInput(rawKey) {
    if (!running || gameOverTriggered) return;
    // ignore modifier/control keys, only accept single printable characters
    if (rawKey.length !== 1) return;
    if (!/^[a-zA-Z]$/.test(rawKey)) return; // letters only for now (word bank is alpha)

    const key = rawKey.toLowerCase();
    const attempt = currentTyped + key;

    // if we already have a locked target, the attempt MUST continue that
    // enemy's word — a wrong key here resets per the chosen design.
    if (lockedEnemyId !== null) {
      const locked = enemies.find(e => e.id === lockedEnemyId && !e.dead);
      if (!locked) {
        // locked enemy died or despawned between keystrokes; clear and
        // re-evaluate this keystroke fresh below.
        resetTypedBuffer();
      } else if (locked.word.toLowerCase().startsWith(attempt)) {
        currentTyped = attempt;
        if (locked.word.toLowerCase() === attempt) {
          fireAtEnemy(locked);
          resetTypedBuffer();
        }
        updateTypedBufferDisplay();
        return;
      } else {
        // mistake: reset progress on this word entirely
        resetTypedBuffer();
        updateTypedBufferDisplay();
        return;
      }
    }

    // no lock yet: find all alive enemies whose word starts with the attempt
    const matches = findMatchingEnemies(attempt);
    if (matches.length === 0) {
      // wrong key with nothing matching at all — reset (nothing to reset really, but stay safe)
      currentTyped = '';
      updateTypedBufferDisplay();
      return;
    }

    currentTyped = attempt;

    if (matches.length === 1) {
      // unique match — lock on
      const target = matches[0];
      lockedEnemyId = target.id;
      if (target.word.toLowerCase() === attempt) {
        fireAtEnemy(target);
        resetTypedBuffer();
      }
    }
    // if multiple matches still tie, stay unlocked until next keystroke
    // disambiguates; closest-enemy tiebreak only matters if the tie never
    // resolves (extremely rare with varied word bank) — handled implicitly
    // since both stay valid candidates next keystroke.

    updateTypedBufferDisplay();
  }

  window.addEventListener('keydown', (e) => {
    // avoid hijacking typing inside any future text inputs/overlays
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    handleKeyInput(e.key);
  });

  function updateTypedBufferDisplay() {
    typedBufferEl.textContent = currentTyped;
  }

  // ---------- projectiles ----------
  // Simple visual traveling shot from player to the target's last known
  // position; damage resolves immediately on fire (typing IS the hit-scan),
  // the projectile is purely a juice/feedback effect.
  let projectiles = [];

  function fireAtEnemy(enemy) {
    projectiles.push({
      x: player.x,
      y: player.y,
      targetX: enemy.x,
      targetY: enemy.y,
      targetId: enemy.id,
      progress: 0,
      speed: 5.5, // progress units per second (0..1 lifetime), tuned for snappy travel
    });
    resolveHit(enemy);
  }

  function resolveHit(enemy) {
    enemy.hp -= player.damage;
    enemy.hitFlash = 0.12; // brief white flash on the enemy when struck
    if (enemy.hp <= 0) {
      enemy.dead = true;
      kills += 1;
      score += 10;
    } else {
      // enemy survives — assign a fresh word so the player has a new prompt
      enemy.word = randomWord();
    }
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      p.progress += p.speed * dt;
    }
    projectiles = projectiles.filter(p => p.progress < 1);
  }

  function drawProjectiles() {
    ctx.save();
    for (const p of projectiles) {
      const x = p.x + (p.targetX - p.x) * p.progress;
      const y = p.y + (p.targetY - p.y) * p.progress;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFB627';
      ctx.shadowColor = 'rgba(255,182,39,0.8)';
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.restore();
  }

  function updateHitFlashes(dt) {
    for (const e of enemies) {
      if (e.hitFlash && e.hitFlash > 0) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
      }
    }
  }


  function drawWordPill(enemy, x, y) {
    const word = enemy.word;
    const isLocked = enemy.id === lockedEnemyId;
    const typedCount = isLocked ? currentTyped.length : 0;

    ctx.font = '600 14px "JetBrains Mono", monospace';
    const paddingX = 10;
    const textWidth = ctx.measureText(word).width;
    const pillW = textWidth + paddingX * 2;
    const pillH = 22;

    ctx.save();
    ctx.fillStyle = isLocked ? 'rgba(255,182,39,0.16)' : 'rgba(28,34,48,0.85)';
    ctx.strokeStyle = isLocked ? '#FFB627' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = isLocked ? 1.5 : 1;
    roundRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, 6);
    ctx.fill();
    ctx.stroke();

    // per-letter coloring: typed chars lock in cyan, remaining stay bright
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let cursorX = x - textWidth / 2;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      ctx.fillStyle = i < typedCount ? '#3FE0D0' : '#E7ECF3';
      ctx.fillText(ch, cursorX, y + 1);
      cursorX += ctx.measureText(ch).width;
    }
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawEnemies() {
    for (const e of enemies) {
      // body: simple flat triangle pointed toward the player to read as
      // "incoming" at a glance, per the flat-shape art direction.
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const angle = Math.atan2(dy, dx);
      const isLocked = e.id === lockedEnemyId;
      const flashing = e.hitFlash && e.hitFlash > 0;

      ctx.save();
      ctx.translate(e.x, e.y);

      // locked-target glow ring, drawn before rotation so it stays upright
      if (isLocked) {
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,182,39,0.18)';
        ctx.fill();
      }

      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(e.radius, 0);
      ctx.lineTo(-e.radius * 0.8, e.radius * 0.75);
      ctx.lineTo(-e.radius * 0.8, -e.radius * 0.75);
      ctx.closePath();
      ctx.fillStyle = flashing ? '#FFFFFF' : e.color;
      ctx.fill();
      if (isLocked) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFB627';
        ctx.stroke();
      }
      ctx.restore();

      drawWordPill(e, e.x, e.y - e.radius - 18);
    }
  }

  // ---------- HUD: hearts ----------
  const hpRowEl = document.getElementById('hp-row');

  function renderHearts() {
    hpRowEl.innerHTML = '';
    for (let i = 0; i < player.maxHp; i++) {
      const heart = document.createElement('div');
      heart.className = 'heart' + (i < player.hp ? '' : ' empty');
      hpRowEl.appendChild(heart);
    }
  }

  // ---------- HUD: timer ----------
  const timerEl = document.getElementById('timer');

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---------- score (basic placeholder; real scoring rules can refine later) ----------
  let score = 0;
  let kills = 0;
  const scoreValEl = document.getElementById('score-val');

  // ---------- game over ----------
  const gameOverOverlay = document.getElementById('gameover-overlay');
  const goTimeEl = document.getElementById('go-time');
  const goScoreEl = document.getElementById('go-score');
  const goKillsEl = document.getElementById('go-kills');
  const restartBtn = document.getElementById('restart-btn');
  const newBestTag = document.getElementById('new-best-tag');

  function triggerGameOver() {
    if (gameOverTriggered) return;
    gameOverTriggered = true;
    running = false;
    resetTypedBuffer();
    updateTypedBufferDisplay();

    goTimeEl.textContent = formatTime(elapsed);
    goScoreEl.textContent = score;
    goKillsEl.textContent = kills;
    newBestTag.classList.add('hidden'); // best-score comparison lands with persistence chunk

    hud.classList.add('hidden');
    gameOverOverlay.classList.remove('hidden');
  }

  restartBtn.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    startGame();
  });
  let running = false;
  let lastTime = 0;

  function gameLoop(timestamp) {
    if (!running) return;
    const dt = Math.min(0.05, (timestamp - lastTime) / 1000 || 0); // clamp dt, skip huge jumps
    lastTime = timestamp;

    updateSpawning(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateHitFlashes(dt);
    updateFlash(dt);

    drawBackground();
    drawEnemies();
    drawProjectiles();
    drawPlayer();

    timerEl.textContent = formatTime(elapsed);
    scoreValEl.textContent = score;
    waveInfoEl.textContent = `enemies on screen: ${enemies.length}`;

    requestAnimationFrame(gameLoop);
  }

  function startGame() {
    // reset state
    enemies = [];
    projectiles = [];
    resetTypedBuffer();
    updateTypedBufferDisplay();
    elapsed = 0;
    spawnTimer = 0;
    rollNextSpawn();
    centerPlayer();

    player.hp = player.maxHp;
    score = 0;
    kills = 0;
    gameOverTriggered = false;
    flashTimer = 0;
    dmgFlashEl.style.opacity = 0;
    renderHearts();

    running = true;
    if (idleAnimId) cancelAnimationFrame(idleAnimId);
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  // ---------- start button ----------
  startBtn.addEventListener('click', () => {
    menuOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    startGame();
  });

})();
