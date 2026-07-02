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

  // visualViewport reports the space actually visible on screen — on
  // mobile, when the on-screen keyboard opens, its height shrinks to
  // exclude the keyboard area. window.innerHeight does NOT reliably do
  // this across browsers, so we prefer visualViewport when available and
  // fall back to window dimensions otherwise (desktop, older browsers).
  function getViewportSize() {
    if (window.visualViewport) {
      return {
        w: window.visualViewport.width,
        h: window.visualViewport.height,
      };
    }
    return { w: window.innerWidth, h: window.innerHeight };
  }

  function resizeCanvas() {
    const size = getViewportSize();
    W = size.w;
    H = size.h;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // keep #app (and therefore the HUD overlay) sized to the space that's
    // actually visible above the on-screen keyboard, not the full window
    document.getElementById('app').style.setProperty('--app-h', H + 'px');
    // keep the player centered in the newly-available space (e.g. when the
    // keyboard opens/closes mid-game) rather than leaving it offset
    if (typeof centerPlayer === 'function') centerPlayer();
  }
  window.addEventListener('resize', resizeCanvas);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeCanvas);
  }

  // ---------- avatar state ----------
  // avatarImage stays null until the player uploads one; player renders as a
  // plain circle with an icon until then.
  const player = {
    x: 0, y: 0,
    radius: 34,
    avatarImage: null,
    maxHp: 10,
    hp: 10,
    damage: 1, // per completed word; upgraded via skill points
    skillPoints: 0, // banked, unspent points
    slowFactor: 1, // multiplier applied to enemy speed; Chill Field reduces this
    skillLevels: { health: 0, damage: 0, slow: 0 },
  };

  function centerPlayer() {
    player.x = W / 2;
    player.y = H / 2;
  }

  // NOTE: resizeCanvas's first call must happen after `player` is declared
  // above, since it calls centerPlayer() which reads player.x/y. Calling it
  // any earlier throws (const player is in its temporal dead zone), which
  // would silently abort the rest of this script — including the avatar
  // upload and start button wiring below. Keep this call here.
  resizeCanvas();

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

  // ============================================================
  // CHUNK 5: difficulty scaling — tiered words, enemy HP/speed/damage
  // ============================================================

  // Word bank tiered by difficulty: tier 0 is short/common, higher tiers
  // get longer and less common. The active tier widens over time so easy
  // words keep showing up too (avoids an abrupt jump), but harder words
  // mix in increasingly.
  //
  // The actual word/sentence content now lives in data.json (fetched
  // below) so the word/sentence database can be expanded just by editing
  // that file — no code changes needed. WORD_TIERS/BOSS_SENTENCES start
  // as a small built-in fallback and get replaced once the fetch resolves,
  // so the game still works (with a limited word set) if data.json is
  // unreachable for any reason (offline file:// usage, network hiccup).
  let WORD_TIERS = [
    ['cat', 'dog', 'run', 'jump'],
    ['storm', 'blade', 'shadow', 'ember'],
  ];
  // BOSS_SENTENCES is now an array of arrays-of-sentences: each tier can
  // hold multiple sentence variants, and one is picked at random each time
  // a boss at that tier spawns (see sentenceForBoss below), so replaying
  // doesn't always show the exact same sentence.
  let BOSS_SENTENCES = [
    [['the', 'storm', 'breaks']],
  ];
  let gameDataLoaded = false;

  function loadGameData() {
    return fetch('data.json')
      .then(res => {
        if (!res.ok) throw new Error('data.json fetch failed: ' + res.status);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data.wordTiers) && data.wordTiers.length > 0) {
          WORD_TIERS = data.wordTiers.map(tier => tier.words);
        }
        if (Array.isArray(data.bossSentences) && data.bossSentences.length > 0) {
          BOSS_SENTENCES = data.bossSentences.map(tier => tier.sentences);
        }
        gameDataLoaded = true;
      })
      .catch(err => {
        // fall back to the small built-in word lists above; log for
        // debugging but don't block the game from being playable
        console.warn('Could not load data.json, using built-in fallback word list.', err);
        gameDataLoaded = true;
      });
  }

  function currentMaxWordTier() {
    // unlock a new tier roughly every 2 minutes, capped at the last tier
    const tier = Math.floor(elapsed / 120);
    return Math.min(tier, WORD_TIERS.length - 1);
  }

  function buildActiveWordPool() {
    // pool includes every tier up to the current max, so easy words never
    // fully disappear — they just get outnumbered by harder ones over time
    const maxTier = currentMaxWordTier();
    let pool = [];
    for (let t = 0; t <= maxTier; t++) {
      pool = pool.concat(WORD_TIERS[t]);
    }
    return pool;
  }

  function randomWord(excludeWords) {
    const exclude = excludeWords || [];
    const fullPool = buildActiveWordPool();
    const pool = fullPool.filter(w => !exclude.includes(w));
    const useable = pool.length > 0 ? pool : fullPool; // fallback if pool exhausted
    return useable[Math.floor(Math.random() * useable.length)];
  }

  function wordsInPlay() {
    return enemies.filter(e => !e.dead).map(e => e.word);
  }

  // ---------- enemy stat scaling ----------
  // All scaling is a function of elapsed survival time. Curves are tuned
  // to feel gentle for the first ~1-2 minutes (matching the chunk-2 ramp)
  // then continue scaling indefinitely with soft caps so the game stays
  // readable/fair even after a very long survival run.

  function currentEnemyMaxHp() {
    // +1 max HP every 2 minutes, capped at 6 (so even very long runs stay
    // at "a handful of words", not absurd bullet-sponge enemies)
    const steps = Math.floor(elapsed / 120);
    return Math.min(1 + steps, 6);
  }

  function currentEnemyContactDamage() {
    // +1 contact damage every 3 minutes, capped at 5
    const steps = Math.floor(elapsed / 180);
    return Math.min(1 + steps, 5);
  }

  function currentDifficultyLabel() {
    // human-readable difficulty tier for the HUD, purely informational
    return Math.floor(elapsed / 60) + 1; // "level" ticks up once per minute
  }

  // ============================================================
  // CHUNK 7: boss fights — every 2 minutes, type a full sentence to kill
  // ============================================================

  // Sentences tiered by boss index (0 = first boss at 2:00, 1 = second at
  // 4:00, etc.), growing in word count and word length as boss number
  // increases per the game's request. Capped to the last tier for very
  // long runs so it never becomes unreasonably long.
  // (BOSS_SENTENCES itself is declared above near WORD_TIERS, populated by
  // loadGameData() from data.json.)

  function sentenceForBoss(bossIndex) {
    const tier = Math.min(bossIndex, BOSS_SENTENCES.length - 1);
    const variants = BOSS_SENTENCES[tier];
    const pick = variants[Math.floor(Math.random() * variants.length)];
    return pick;
  }

  let bossActive = false;
  let boss = null; // { x, y, radius, words, wordIndex, typedInWord, bossIndex }
  let bossIndex = 0; // increments each boss fight, used to pick sentence tier
  let lastBossMinuteTriggered = -1; // tracks which 2-minute mark we've already spawned a boss for

  const bossBanner = document.getElementById('boss-banner');
  const bossHpBar = document.getElementById('boss-hp-bar');

  function checkBossSpawn() {
    if (bossActive) return;
    const twoMinBlock = Math.floor(elapsed / 120);
    if (twoMinBlock > 0 && twoMinBlock > lastBossMinuteTriggered) {
      lastBossMinuteTriggered = twoMinBlock;
      spawnBoss();
    }
  }

  function spawnBoss() {
    bossActive = true;
    // clear the field so the boss is the sole focus, per the chosen design
    enemies = [];
    resetTypedBuffer();
    updateTypedBufferDisplay();

    const words = sentenceForBoss(bossIndex).slice();
    // boss moves much slower than a regular enemy at this point in the
    // run — it's meant to give plenty of time to type the sentence, with
    // contact only as a real-but-distant threat, not constant pressure
    const regularSpeed = currentEnemySpeed();
    boss = {
      x: player.x,
      y: player.y - Math.min(W, H) * 0.32, // enters from the top-center area
      radius: 46,
      words: words,
      wordIndex: 0,
      typedInWord: '',
      speed: regularSpeed * 0.15,
      dmg: currentEnemyContactDamage() * 2,
    };

    bossBanner.classList.remove('hidden');
    updateBossHpBar();
    soundBossAppear();
  }

  function updateBoss(dt) {
    if (!boss) return;
    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= player.radius + boss.radius) {
      // boss reaches the player: deals its (doubled) contact damage, then
      // the fight ends immediately with no card reward, per the chosen
      // design — this is a real threat to respect, not just a typing puzzle
      takeDamage(boss.dmg);
      bossActive = false;
      boss = null;
      bossBanner.classList.add('hidden');
      resetTypedBuffer();
      updateTypedBufferDisplay();
      return;
    }

    const vx = (dx / dist) * boss.speed;
    const vy = (dy / dist) * boss.speed;
    boss.x += vx * dt;
    boss.y += vy * dt;
  }

  function updateBossHpBar() {
    if (!boss) return;
    const total = boss.words.length;
    const remaining = total - boss.wordIndex;
    const pct = Math.max(0, (remaining / total) * 100);
    bossHpBar.style.width = pct + '%';
  }

  function handleBossKeyInput(rawKey) {
    if (!boss) return;

    if (rawKey === 'Backspace') {
      if (boss.typedInWord.length > 0) {
        boss.typedInWord = boss.typedInWord.slice(0, -1);
        updateTypedBufferDisplay();
      }
      return;
    }

    // sentences need letters AND the space between words; we accept a
    // literal space keypress to advance only if the current word is
    // already fully typed (prevents accidentally skipping mid-word)
    if (rawKey === ' ') {
      const word = boss.words[boss.wordIndex];
      if (boss.typedInWord.toLowerCase() === word.toLowerCase()) {
        advanceBossWord();
      }
      return;
    }
    if (rawKey.length !== 1 || !/^[a-zA-Z]$/.test(rawKey)) return;

    const word = boss.words[boss.wordIndex].toLowerCase();
    const attempt = (boss.typedInWord + rawKey).toLowerCase();

    if (word.startsWith(attempt)) {
      boss.typedInWord += rawKey.toLowerCase();
      soundTypingTick();
      if (boss.typedInWord.toLowerCase() === word) {
        advanceBossWord();
        return;
      }
    } else {
      boss.typedInWord = '';
      soundMistake();
    }
    updateTypedBufferDisplay();
  }

  function advanceBossWord() {
    boss.wordIndex += 1;
    boss.typedInWord = '';
    updateBossHpBar();
    updateTypedBufferDisplay();
    soundBossWordComplete();
    if (boss.wordIndex >= boss.words.length) {
      defeatBoss();
    }
  }

  function defeatBoss() {
    bossActive = false;
    bossIndex += 1;
    score += 100;
    soundBossDefeated();
    if (boss) spawnKillParticles(boss.x, boss.y, '#FFB627');
    boss = null;
    bossBanner.classList.add('hidden');
    resetTypedBuffer();
    updateTypedBufferDisplay();
    openCardPickOverlay();
  }

  // ============================================================
  // CHUNK 7 (cont.): card rewards — pick 1 of 3 after each boss kill
  // ============================================================

  // Each card has a unique id, display info, and an `apply` function run
  // once when chosen. Effects are simple counters/flags on `player` that
  // other systems (projectiles, auto-fire ticking, contact resolution)
  // check — this keeps the reward system additive and stackable without
  // needing a big rework of the existing shooting/combat code.
  const CARD_POOL = [
    {
      id: 'extra_fire',
      icon: '🔥',
      name: 'Extra Fire',
      desc: 'Your shots ignite enemies, dealing burn damage over time.',
      apply: () => { player.hasFireRounds = true; },
    },
    {
      id: 'twin_shot',
      icon: '⚔',
      name: 'Twin Shot',
      desc: 'Each completed word also fires a bonus shot at the next nearest enemy.',
      apply: () => { player.hasTwinShot = true; },
    },
    {
      id: 'auto_rocket',
      icon: '🚀',
      name: 'Auto Rocket',
      desc: 'Every 30s, automatically fires a rocket at the nearest enemy.',
      apply: () => {
        player.hasAutoRocket = true;
        if (!player.autoRocketInterval) player.autoRocketInterval = 30;
      },
    },
    {
      id: 'vampiric_rounds',
      icon: '🩸',
      name: 'Vampiric Rounds',
      desc: 'Kills have a 10% chance to heal you for 1 HP.',
      apply: () => { player.vampiricChance = (player.vampiricChance || 0) + 0.10; },
    },
    {
      id: 'shield_charge',
      icon: '🛡',
      name: 'Shield Charge',
      desc: 'Every 60s, gain a shield that blocks the next contact hit.',
      apply: () => {
        player.hasShieldCharge = true;
        if (!player.shieldChargeInterval) player.shieldChargeInterval = 60;
      },
    },
    {
      id: 'quick_hands',
      icon: '⚡',
      name: 'Quick Hands',
      desc: 'Completed words deal a bonus burst of +1 damage.',
      apply: () => { player.damage += 1; },
    },
    {
      id: 'slipstream',
      icon: '✦',
      name: 'Slipstream',
      desc: 'Slowly regenerate 1 HP every 45 seconds.',
      apply: () => {
        player.hasRegen = true;
        if (!player.regenInterval) player.regenInterval = 45;
      },
    },
    {
      id: 'piercing_word',
      icon: '➳',
      name: 'Piercing Word',
      desc: 'Your shots pierce through to hit a second enemy behind the first.',
      apply: () => { player.hasPiercing = true; },
    },
    {
      id: 'overclock',
      icon: '⏱',
      name: 'Overclock',
      desc: 'Reduces Auto Rocket cooldown (only useful if you own one).',
      apply: () => {
        player.autoRocketInterval = Math.max(10, (player.autoRocketInterval || 30) - 8);
      },
    },
  ];

  const cardPickOverlay = document.getElementById('cardpick-overlay');
  const cardGridEl = document.getElementById('card-grid');

  function rollThreeCards() {
    const pool = CARD_POOL.slice();
    const picked = [];
    while (picked.length < 3 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  function openCardPickOverlay() {
    paused = true;
    cardGridEl.innerHTML = '';

    const choices = rollThreeCards();
    for (const card of choices) {
      const el = document.createElement('div');
      el.className = 'pick-card';
      el.innerHTML = `
        <div class="icon">${card.icon}</div>
        <div class="name">${card.name}</div>
        <div class="desc">${card.desc}</div>
      `;
      el.addEventListener('click', () => {
        card.apply();
        closeCardPickOverlay();
      });
      cardGridEl.appendChild(el);
    }

    hud.classList.add('hidden');
    cardPickOverlay.classList.remove('hidden');
    mobileCapture.blur();
  }

  function closeCardPickOverlay() {
    paused = false;
    cardPickOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    focusMobileCapture();
    lastTime = performance.now(); // avoid a huge dt spike from time spent paused
    requestAnimationFrame(gameLoop);
  }

  function drawBoss() {
    if (!boss) return;

    // body: larger flat shape, distinct from regular enemies (diamond)
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.beginPath();
    ctx.moveTo(0, -boss.radius);
    ctx.lineTo(boss.radius, 0);
    ctx.lineTo(0, boss.radius);
    ctx.lineTo(-boss.radius, 0);
    ctx.closePath();
    ctx.fillStyle = '#FF3B5C';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFB627';
    ctx.stroke();
    ctx.restore();

    // Full sentence rendered as one continuous pill above the boss:
    // completed words solid cyan, the current word shows live per-letter
    // progress (typed chars cyan, untyped bright), remaining words dim.
    // This replaces the old current-word-only + separate dim-preview
    // layout so the whole sentence is visible at a glance throughout.
    // Font size shrinks for longer sentences / narrower screens so the
    // whole line still fits comfortably without overflowing the canvas.
    const maxPillWidth = Math.min(W * 0.92, 760);
    let fontSize = 15;
    ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
    const spaceWidthAt = (size) => { ctx.font = `600 ${size}px "JetBrains Mono", monospace`; return ctx.measureText(' ').width; };
    const sentenceWidthAt = (size) => {
      ctx.font = `600 ${size}px "JetBrains Mono", monospace`;
      const sw = ctx.measureText(' ').width;
      let total = 0;
      for (let i = 0; i < boss.words.length; i++) {
        total += ctx.measureText(boss.words[i]).width;
        if (i < boss.words.length - 1) total += sw;
      }
      return total;
    };
    while (fontSize > 9 && sentenceWidthAt(fontSize) + 28 > maxPillWidth) {
      fontSize -= 1;
    }
    ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
    const spaceWidth = ctx.measureText(' ').width;

    // pre-measure total width across all words + spaces so we can center
    // the whole sentence as a single block above the boss
    let totalWidth = 0;
    const wordWidths = boss.words.map(w => ctx.measureText(w).width);
    wordWidths.forEach((w, i) => {
      totalWidth += w;
      if (i < boss.words.length - 1) totalWidth += spaceWidth;
    });

    const paddingX = 14;
    const pillW = totalWidth + paddingX * 2;
    const pillH = 28;
    const px = boss.x;
    const py = Math.max(pillH / 2 + 10, boss.y - boss.radius - 26);

    ctx.save();
    ctx.fillStyle = 'rgba(255,182,39,0.16)';
    ctx.strokeStyle = '#FFB627';
    ctx.lineWidth = 1.5;
    roundRect(ctx, px - pillW / 2, py - pillH / 2, pillW, pillH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let cursorX = px - totalWidth / 2;

    for (let wi = 0; wi < boss.words.length; wi++) {
      const w = boss.words[wi];
      if (wi < boss.wordIndex) {
        // already-completed word: fully locked in
        ctx.fillStyle = '#3FE0D0';
        ctx.fillText(w, cursorX, py + 1);
      } else if (wi === boss.wordIndex) {
        // current word: per-letter progress, same language as regular enemies
        const typedCount = boss.typedInWord.length;
        let charX = cursorX;
        for (let ci = 0; ci < w.length; ci++) {
          ctx.fillStyle = ci < typedCount ? '#3FE0D0' : '#E7ECF3';
          ctx.fillText(w[ci], charX, py + 1);
          charX += ctx.measureText(w[ci]).width;
        }
      } else {
        // not yet reached: dimmed
        ctx.fillStyle = 'rgba(231,236,243,0.4)';
        ctx.fillText(w, cursorX, py + 1);
      }
      cursorX += wordWidths[wi] + spaceWidth;
    }
    ctx.restore();
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
    // starts very sparse (one enemy every ~3.2s alone on screen), tightens
    // down toward a floor over the first ~4 minutes, then keeps inching
    // down very slowly forever (long-run difficulty) without ever going
    // below a hard floor that would make it unfair/unreadable.
    const t = elapsed / 240; // 0..1 ramp over first 4 minutes
    const clamped = Math.min(1, t);
    const start = 3.2, midFloor = 0.45;
    let interval = start - (start - midFloor) * clamped;

    // slow long-run tightening past the 4-minute mark
    if (elapsed > 240) {
      const extraMinutes = (elapsed - 240) / 60;
      interval -= extraMinutes * 0.01; // tiny extra tightening per minute
    }
    interval = Math.max(0.28, interval); // hard floor

    // small randomness so it doesn't feel metronomic
    return interval * (0.85 + Math.random() * 0.3);
  }

  function currentEnemySpeed() {
    // starts slow (28px/s, easy to read/react to), ramps to a base cap of
    // ~95px/s by ~3min, then keeps creeping up slowly forever with a hard
    // ceiling so long runs stay theoretically dodgeable/readable.
    const t = elapsed / 180;
    const clamped = Math.min(1, t);
    const start = 28, midCap = 95;
    let base = start + (midCap - start) * clamped;

    if (elapsed > 180) {
      const extraMinutes = (elapsed - 180) / 60;
      base += extraMinutes * 3; // gentle long-run creep
    }
    base = Math.min(base, 160); // hard ceiling

    return (base + Math.random() * 8) * player.slowFactor;
  }

  let enemyIdCounter = 1;

  function spawnEnemy() {
    // Spawn just beyond whichever screen edge the angle points toward,
    // so enemies appear close to off-screen and walk into view quickly
    // instead of crawling for a long time across empty space outside
    // the viewport (which is what made them feel "stuck off-screen").
    const angle = Math.random() * Math.PI * 2;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const margin = 50; // how far past the edge they spawn, in px
    // distance from center to the screen edge along this direction
    const tx = dirX !== 0 ? (W / 2) / Math.abs(dirX) : Infinity;
    const ty = dirY !== 0 ? (H / 2) / Math.abs(dirY) : Infinity;
    const edgeDist = Math.min(tx, ty);
    const spawnRadius = edgeDist + margin;
    const x = player.x + dirX * spawnRadius;
    const y = player.y + dirY * spawnRadius;

    const maxHp = currentEnemyMaxHp();
    enemies.push({
      id: enemyIdCounter++,
      x, y,
      word: randomWord(wordsInPlay()),
      speed: currentEnemySpeed(),
      radius: 18,
      color: '#FF3B5C',
      dmg: currentEnemyContactDamage(),
      maxHp: maxHp,
      hp: maxHp,
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
    checkSkillPointAward();
    checkBossSpawn();
    if (bossActive) return; // no regular spawning while a boss fight is on
    spawnTimer += dt;
    if (spawnTimer >= nextSpawnIn) {
      spawnTimer = 0;
      rollNextSpawn();
      spawnEnemy();
    }
  }

  // ============================================================
  // CHUNK 6: skill points — earned per minute, spent in a paused overlay
  // ============================================================

  // We award 1 skill point at each whole-minute mark of elapsed survival
  // time. `lastSkillMinuteAwarded` tracks the last minute boundary we've
  // already paid out, so we never double-award if a frame's dt straddles
  // a boundary or the loop briefly stalls.
  let lastSkillMinuteAwarded = 0;
  let paused = false; // true while the level-up (or future card-pick) overlay is open

  const levelupOverlay = document.getElementById('levelup-overlay');
  const spAvailableEl = document.getElementById('sp-available');
  const spPluralEl = document.getElementById('sp-plural');
  const levelupContinueBtn = document.getElementById('levelup-continue');
  const lvlHealthEl = document.getElementById('lvl-health');
  const lvlDamageEl = document.getElementById('lvl-damage');
  const lvlSlowEl = document.getElementById('lvl-slow');
  const spValEl = document.getElementById('sp-val');

  function checkSkillPointAward() {
    const currentMinute = Math.floor(elapsed / 60);
    if (currentMinute > lastSkillMinuteAwarded) {
      lastSkillMinuteAwarded = currentMinute;
      player.skillPoints += 1;
      spValEl.textContent = player.skillPoints;
      openLevelUpOverlay();
    }
  }

  function openLevelUpOverlay() {
    paused = true;
    spAvailableEl.textContent = player.skillPoints;
    spPluralEl.textContent = player.skillPoints === 1 ? '' : 's';
    lvlHealthEl.textContent = player.skillLevels.health;
    lvlDamageEl.textContent = player.skillLevels.damage;
    lvlSlowEl.textContent = player.skillLevels.slow;
    levelupContinueBtn.classList.add('hidden'); // only shown once points are spent down to 0... actually allow continue any time
    levelupContinueBtn.classList.remove('hidden');
    hud.classList.add('hidden');
    levelupOverlay.classList.remove('hidden');
    mobileCapture.blur(); // no typing needed while choosing a skill
  }

  function closeLevelUpOverlay() {
    paused = false;
    levelupOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    focusMobileCapture();
    lastTime = performance.now(); // avoid a huge dt spike from time spent paused
    requestAnimationFrame(gameLoop);
  }

  function applySkill(skillName) {
    if (player.skillPoints <= 0) return;

    if (skillName === 'health') {
      player.maxHp += 2;
      player.hp = Math.min(player.maxHp, player.hp + 2);
      player.skillLevels.health += 1;
      renderHearts();
    } else if (skillName === 'damage') {
      player.damage += 1;
      player.skillLevels.damage += 1;
    } else if (skillName === 'slow') {
      // -8% enemy speed, stacking multiplicatively so repeated picks keep
      // giving a real (if diminishing) benefit rather than flattening out
      player.slowFactor *= 0.92;
      player.skillLevels.slow += 1;
    } else {
      return;
    }

    player.skillPoints -= 1;
    spValEl.textContent = player.skillPoints;

    if (player.skillPoints > 0) {
      // more points to spend — refresh the overlay's counters and stay open
      spAvailableEl.textContent = player.skillPoints;
      spPluralEl.textContent = player.skillPoints === 1 ? '' : 's';
      lvlHealthEl.textContent = player.skillLevels.health;
      lvlDamageEl.textContent = player.skillLevels.damage;
      lvlSlowEl.textContent = player.skillLevels.slow;
    } else {
      // all points spent — close automatically and resume play
      closeLevelUpOverlay();
    }
  }

  document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('click', () => {
      applySkill(card.dataset.skill);
    });
  });

  levelupContinueBtn.addEventListener('click', () => {
    // lets the player bank remaining points and resume now if they'd
    // rather not spend everything immediately (kept available for them
    // at the next minute's overlay since skillPoints persists)
    closeLevelUpOverlay();
  });


  let gameOverTriggered = false;
  let flashTimer = 0; // counts down after a hit, drives the red screen flash
  const dmgFlashEl = document.getElementById('dmg-flash');

  function takeDamage(amount) {
    if (gameOverTriggered) return;

    if (player.shieldCharges && player.shieldCharges > 0) {
      player.shieldCharges -= 1;
      flashTimer = 0.15;
      triggerShake(3, 0.12); // light shake even on block, feels responsive
      return;
    }

    player.hp = Math.max(0, player.hp - amount);
    flashTimer = 0.35;
    triggerShake(amount >= 2 ? 10 : 6, 0.28); // bigger shake for boss hits
    soundDamage();
    renderHearts();
    if (player.hp <= 0) {
      triggerGameOver();
    }
  }

  // ---------- card-driven periodic effects ----------
  // Auto Rocket, Shield Charge recharge, and Slipstream regen all tick on
  // their own timers independent of typing. Timers only run once their
  // respective card has been picked (flag set to true by CARD_POOL.apply).
  function updateTimedEffects(dt) {
    if (player.hasAutoRocket) {
      player.autoRocketTimer = (player.autoRocketTimer || 0) + dt;
      const interval = player.autoRocketInterval || 30;
      if (player.autoRocketTimer >= interval) {
        player.autoRocketTimer = 0;
        const target = pickClosestEnemy(aliveEnemies());
        if (target) {
          resolveHit(target);
          // a slightly heavier visual than a regular shot, reusing the
          // same projectile renderer for simplicity
          projectiles.push({
            x: player.x, y: player.y,
            targetX: target.x, targetY: target.y,
            targetId: target.id, progress: 0, speed: 3.2,
          });
        }
      }
    }

    if (player.hasShieldCharge) {
      player.shieldChargeTimer = (player.shieldChargeTimer || 0) + dt;
      const interval = player.shieldChargeInterval || 60;
      if (player.shieldChargeTimer >= interval) {
        player.shieldChargeTimer = 0;
        player.shieldCharges = Math.min(1, (player.shieldCharges || 0) + 1);
      }
    }

    if (player.hasRegen) {
      player.regenTimer = (player.regenTimer || 0) + dt;
      const interval = player.regenInterval || 45;
      if (player.regenTimer >= interval) {
        player.regenTimer = 0;
        if (player.hp < player.maxHp) {
          player.hp += 1;
          renderHearts();
        }
      }
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

      // Extra Fire: burn ticks independent of contact/typing damage
      if (e.burnTime && e.burnTime > 0) {
        e.burnTime -= dt;
        e.hp -= e.burnDps * dt;
        if (e.hp <= 0) {
          e.dead = true;
          kills += 1;
          score += 10;
          continue;
        }
      }

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
    if (!running || gameOverTriggered || paused) return;

    if (bossActive) {
      handleBossKeyInput(rawKey);
      return;
    }

    if (rawKey === 'Backspace') {
      if (currentTyped.length === 0) return;
      currentTyped = currentTyped.slice(0, -1);
      if (currentTyped.length === 0) {
        // nothing left typed — fully clear the lock too
        lockedEnemyId = null;
      } else if (lockedEnemyId !== null) {
        // still have a lock: only keep it if the locked enemy's word still
        // starts with the shortened buffer (it always will, since we only
        // ever removed a character — kept here for safety/clarity)
        const locked = enemies.find(e => e.id === lockedEnemyId && !e.dead);
        if (!locked || !locked.word.toLowerCase().startsWith(currentTyped)) {
          lockedEnemyId = null;
        }
      } else {
        // no lock yet (was still disambiguating) — re-check if the
        // shortened buffer now uniquely matches one enemy
        const matches = findMatchingEnemies(currentTyped);
        if (matches.length === 1) lockedEnemyId = matches[0].id;
      }
      updateTypedBufferDisplay();
      return;
    }

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
        resetTypedBuffer();
      } else if (locked.word.toLowerCase().startsWith(attempt)) {
        currentTyped = attempt;
        soundTypingTick();
        if (locked.word.toLowerCase() === attempt) {
          fireAtEnemy(locked);
          resetTypedBuffer();
        }
        updateTypedBufferDisplay();
        return;
      } else {
        resetTypedBuffer();
        soundMistake();
        updateTypedBufferDisplay();
        return;
      }
    }

    const matches = findMatchingEnemies(attempt);
    if (matches.length === 0) {
      currentTyped = '';
      soundMistake();
      updateTypedBufferDisplay();
      return;
    }

    currentTyped = attempt;
    soundTypingTick();

    if (matches.length === 1) {
      const target = matches[0];
      lockedEnemyId = target.id;
      if (target.word.toLowerCase() === attempt) {
        fireAtEnemy(target);
        resetTypedBuffer();
      }
    }

    updateTypedBufferDisplay();
  }

  window.addEventListener('keydown', (e) => {
    // On touch devices we read characters from the hidden input's `input`
    // event instead (more reliable for on-screen keyboards), so skip
    // keydown there to avoid double-counting the same keystroke when a
    // physical/bluetooth keyboard is also attached.
    if (isTouchDevice()) return;
    // avoid hijacking typing inside any *other* text input/overlay
    if (e.target && e.target.tagName !== 'BODY' &&
        (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    // space normally scrolls the page, and backspace can navigate the
    // browser back in some browsers when focus isn't on a text field —
    // both are used for gameplay, so stop their default behavior while
    // actively playing
    if ((e.key === ' ' || e.key === 'Backspace') && running && !paused) e.preventDefault();
    handleKeyInput(e.key);
  });

  function updateTypedBufferDisplay() {
    if (bossActive && boss) {
      typedBufferEl.textContent = boss.typedInWord;
    } else {
      typedBufferEl.textContent = currentTyped;
    }
  }

  // ---------- mobile on-screen keyboard support ----------
  // Many mobile browsers (especially Android/Chrome and some iOS cases)
  // don't reliably fire normal `keydown` with usable `key` values for
  // on-screen keyboard taps. The robust cross-platform approach is to
  // focus a real (but invisible) <input>, which summons the native
  // keyboard, and read characters from its `input` event instead —
  // then immediately clear it so it never visibly accumulates text.
  const mobileCapture = document.getElementById('mobile-key-capture');

  function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  function focusMobileCapture() {
    if (!isTouchDevice()) return;
    // slight delay helps some mobile browsers honor focus reliably when
    // called right after a tap/click that also changed DOM visibility
    setTimeout(() => {
      try { mobileCapture.focus({ preventScroll: true }); } catch (_) { mobileCapture.focus(); }
    }, 50);
  }

  mobileCapture.addEventListener('input', (e) => {
    // mobile on-screen keyboards report a backspace press as a
    // deleteContentBackward inputType with an empty resulting value
    // (since we keep the field cleared) — detect that explicitly, since
    // the length-based check below would otherwise miss it entirely.
    if (e.inputType === 'deleteContentBackward') {
      handleKeyInput('Backspace');
      e.target.value = '';
      return;
    }

    const val = e.target.value;
    if (val.length > 0) {
      // handle each typed character in order (normally just one, but
      // some IME/autocomplete behavior can deliver more than one at once)
      for (const ch of val) {
        handleKeyInput(ch);
      }
    }
    // clear immediately so the invisible input never builds up text,
    // which keeps future `input` events simple (always "what's new")
    e.target.value = '';
  });

  // if the capture input loses focus while the game is running (e.g. the
  // player taps elsewhere, or the keyboard is dismissed), bring it back
  // so typing keeps working without the player having to do anything
  mobileCapture.addEventListener('blur', () => {
    if (running && !gameOverTriggered) {
      focusMobileCapture();
    }
  });

  // ---------- projectiles ----------
  // Simple visual traveling shot from player to the target's last known
  // position; damage resolves immediately on fire (typing IS the hit-scan),
  // the projectile is purely a juice/feedback effect.
  let projectiles = [];

  function fireAtEnemy(enemy, isBonusShot) {
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

    // Piercing Word: the same shot also strikes one enemy roughly behind
    // the target from the player's point of view, simulated here as just
    // hitting the next-closest alive enemy past this one (full geometric
    // raycast isn't necessary for the effect to read as "piercing")
    if (player.hasPiercing) {
      const dx = enemy.x - player.x, dy = enemy.y - player.y;
      const dist = Math.hypot(dx, dy);
      const behind = aliveEnemies()
        .filter(e => e.id !== enemy.id)
        .find(e => {
          const ex = e.x - player.x, ey = e.y - player.y;
          const edist = Math.hypot(ex, ey);
          // roughly same direction and farther away than the primary target
          const dot = (dx * ex + dy * ey) / (dist * edist || 1);
          return dot > 0.85 && edist > dist;
        });
      if (behind) resolveHit(behind);
    }

    // Twin Shot: bonus shot at the next nearest *other* enemy, skipped for
    // the bonus shot itself so it can't chain infinitely
    if (player.hasTwinShot && !isBonusShot) {
      const others = aliveEnemies().filter(e => e.id !== enemy.id);
      const next = pickClosestEnemy(others);
      if (next) fireAtEnemy(next, true);
    }
  }

  function resolveHit(enemy) {
    enemy.hp -= player.damage;
    enemy.hitFlash = 0.12;

    if (player.hasFireRounds) {
      enemy.burnTime = 1.5;
      enemy.burnDps = Math.max(1, Math.round(player.damage * 0.4));
    }

    if (enemy.hp <= 0) {
      enemy.dead = true;
      kills += 1;
      // combo + score (registerKill adds the points, so don't add separately)
      registerKill(enemy.x, enemy.y);
      // particles burst from enemy death position
      spawnKillParticles(enemy.x, enemy.y, '#FF3B5C');
      soundKill();

      if (player.vampiricChance && Math.random() < player.vampiricChance) {
        player.hp = Math.min(player.maxHp, player.hp + 1);
        renderHearts();
      }
    } else {
      enemy.word = randomWord(wordsInPlay());
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

    // HP pips above the pill for multi-hit enemies, so the player can see
    // how many words/shots remain on a tougher target at a glance
    if (enemy.maxHp > 1) {
      const pipR = 3;
      const pipGap = 9;
      const totalW = (enemy.maxHp - 1) * pipGap;
      let pipX = x - totalW / 2;
      const pipY = y - pillH / 2 - 9;
      for (let i = 0; i < enemy.maxHp; i++) {
        ctx.beginPath();
        ctx.arc(pipX, pipY, pipR, 0, Math.PI * 2);
        ctx.fillStyle = i < enemy.hp ? '#FF3B5C' : 'rgba(255,59,92,0.2)';
        ctx.fill();
        pipX += pipGap;
      }
    }

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

      const pillOffset = e.maxHp > 1 ? e.radius + 26 : e.radius + 18;
      drawWordPill(e, e.x, e.y - pillOffset);
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

  // ============================================================
  // PERSISTENCE — best time and best score saved via localStorage.
  // Uses a single key 'tts:best' storing a small JSON object so
  // both values are read/written atomically.
  // ============================================================

  const STORAGE_KEY = 'tts:best';
  const bestTimeEl = document.getElementById('best-time');
  const bestScoreEl = document.getElementById('best-score');

  function loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { time: 0, score: 0 };
      const parsed = JSON.parse(raw);
      return {
        time: typeof parsed.time === 'number' ? parsed.time : 0,
        score: typeof parsed.score === 'number' ? parsed.score : 0,
      };
    } catch (_) {
      return { time: 0, score: 0 };
    }
  }

  function saveBest(time, score) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ time, score }));
    } catch (_) {
      // localStorage blocked (private mode, quota exceeded, etc.) — silently no-op
    }
  }

  function updateBestDisplay() {
    const best = loadBest();
    bestTimeEl.textContent = best.time > 0 ? formatTime(best.time) : '--:--';
    bestScoreEl.textContent = best.score > 0 ? best.score : '---';
  }

  // populate the menu's best-stats display immediately on load
  updateBestDisplay();

  const goTimeEl = document.getElementById('go-time');
  const goScoreEl = document.getElementById('go-score');
  const goKillsEl = document.getElementById('go-kills');
  const gameOverOverlay = document.getElementById('gameover-overlay');
  const restartBtn = document.getElementById('restart-btn');
  const newBestTag = document.getElementById('new-best-tag');

  function triggerGameOver() {
    if (gameOverTriggered) return;
    gameOverTriggered = true;
    running = false;
    soundGameOver();
    resetTypedBuffer();
    updateTypedBufferDisplay();
    mobileCapture.blur();

    goTimeEl.textContent = formatTime(elapsed);
    goScoreEl.textContent = score;
    goKillsEl.textContent = kills;

    // compare against saved best and update if this run beats either record
    const best = loadBest();
    const newBestTime = elapsed > best.time;
    const newBestScore = score > best.score;
    const isNewBest = newBestTime || newBestScore;

    if (isNewBest) {
      saveBest(
        newBestTime ? elapsed : best.time,
        newBestScore ? score : best.score,
      );
      newBestTag.classList.remove('hidden');
      document.getElementById('gameover-stats').classList.add('new-best');
    } else {
      newBestTag.classList.add('hidden');
      document.getElementById('gameover-stats').classList.remove('new-best');
    }

    // refresh menu display so returning to main menu shows the updated record
    updateBestDisplay();

    hud.classList.add('hidden');
    gameOverOverlay.classList.remove('hidden');
  }

  restartBtn.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    startGame();
  });

  const gameOverHomeBtn = document.getElementById('gameover-home-btn');
  gameOverHomeBtn.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    returnToMainMenu();
  });
  // ============================================================
  // ESC pause menu — separate from the level-up/card "paused" state.
  // Reuses the same `paused` flag to actually freeze the game loop, but
  // tracks its own overlay/visibility and a distinct reason so it doesn't
  // fight with the level-up/card flow.
  // ============================================================

  const pauseOverlay = document.getElementById('pause-overlay');
  const pauseNoteEl = document.getElementById('pause-note');
  const pauseResumeBtn = document.getElementById('pause-resume-btn');
  const pauseQuitBtn = document.getElementById('pause-quit-btn');

  let escPaused = false; // true only when the ESC menu itself caused the pause

  function openPauseMenu() {
    if (!running || gameOverTriggered) return;

    if (paused && !escPaused) {
      // a level-up or card-pick overlay is already open and driving the
      // pause; per the chosen design we surface a small note rather than
      // stacking another overlay on top of it
      pauseNoteEl.style.display = 'block';
      pauseResumeBtn.classList.add('hidden');
      pauseQuitBtn.classList.add('hidden');
      pauseOverlay.classList.remove('hidden');
      hud.classList.add('hidden');
      return;
    }

    if (paused) return; // ESC pause already open, ignore repeat presses

    escPaused = true;
    paused = true;
    pauseNoteEl.style.display = 'none';
    pauseResumeBtn.classList.remove('hidden');
    pauseQuitBtn.classList.remove('hidden');
    pauseOverlay.classList.remove('hidden');
    hud.classList.add('hidden');
    mobileCapture.blur();
  }

  function closePauseMenu(resumeGame) {
    pauseOverlay.classList.add('hidden');

    if (!escPaused) {
      // we were just showing the "already paused elsewhere" note — closing
      // it should simply uncover whichever overlay was actually driving
      // the pause (level-up or card-pick), not touch game state
      if (paused) {
        // the underlying overlay (level-up/card-pick) is still open and
        // remains the user's responsibility to resolve
      }
      return;
    }

    escPaused = false;
    if (resumeGame) {
      paused = false;
      hud.classList.remove('hidden');
      focusMobileCapture();
      lastTime = performance.now(); // avoid a huge dt spike from time spent paused
      requestAnimationFrame(gameLoop);
    }
    // if not resuming, returnToMainMenu() (called separately) handles
    // tearing the run down entirely
  }

  function returnToMainMenu() {
    running = false;
    paused = false;
    escPaused = false;
    pauseOverlay.classList.add('hidden');
    hud.classList.add('hidden');
    mobileCapture.blur();
    menuOverlay.classList.remove('hidden');
    idleLoop(); // resume the calm menu-background animation
  }

  pauseResumeBtn.addEventListener('click', () => closePauseMenu(true));
  pauseQuitBtn.addEventListener('click', () => returnToMainMenu());

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!running) return; // no-op on the main menu / game-over screen

    const pauseOverlayOpen = !pauseOverlay.classList.contains('hidden');

    if (pauseOverlayOpen && escPaused) {
      // ESC again while our own pause menu is open: resume
      closePauseMenu(true);
    } else if (pauseOverlayOpen && !escPaused) {
      // ESC again while only the "already paused elsewhere" note is
      // showing: dismiss the note, leaving the underlying level-up/card
      // overlay exactly as it was
      closePauseMenu(false);
    } else {
      openPauseMenu();
    }
  });

  // ============================================================
  // POLISH: kill particles, screen shake, combo multiplier, Web Audio
  // ============================================================

  // ---------- Web Audio sound engine ----------
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // resume if suspended (browsers require user gesture first)
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone({ freq = 440, freq2 = null, type = 'sine', gain = 0.18,
                      attack = 0.005, decay = 0.08, duration = 0.1,
                      noiseAmount = 0, pitchDrop = 0 } = {}) {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(gain, now + attack);
      master.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
      master.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (freq2) osc.frequency.linearRampToValueAtTime(freq2, now + attack + decay);
      if (pitchDrop) osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freq - pitchDrop), now + attack + decay);
      osc.connect(master);
      osc.start(now);
      osc.stop(now + duration);

      if (noiseAmount > 0) {
        const bufLen = ctx.sampleRate * duration;
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * noiseAmount;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        noise.connect(master);
        noise.start(now);
        noise.stop(now + duration);
      }
    } catch (_) { /* audio failures are silent */ }
  }

  function soundTypingTick() {
    playTone({ freq: 880 + Math.random() * 220, type: 'square',
               gain: 0.04, attack: 0.001, decay: 0.018, duration: 0.022 });
  }
  function soundKill() {
    playTone({ freq: 520, freq2: 740, type: 'triangle',
               gain: 0.22, attack: 0.004, decay: 0.12, duration: 0.14 });
  }
  function soundMistake() {
    playTone({ freq: 220, type: 'sawtooth',
               gain: 0.08, attack: 0.002, decay: 0.06, duration: 0.07,
               noiseAmount: 0.3 });
  }
  function soundDamage() {
    playTone({ freq: 180, type: 'sawtooth', pitchDrop: 120,
               gain: 0.28, attack: 0.001, decay: 0.18, duration: 0.2,
               noiseAmount: 0.5 });
  }
  function soundBossAppear() {
    // rising tension sting: two stacked oscillators
    playTone({ freq: 120, freq2: 200, type: 'sawtooth',
               gain: 0.18, attack: 0.05, decay: 0.55, duration: 0.65 });
    playTone({ freq: 180, freq2: 260, type: 'square',
               gain: 0.09, attack: 0.08, decay: 0.45, duration: 0.6 });
  }
  function soundBossDefeated() {
    // ascending triumphant chord — three notes staggered
    [0, 80, 180].forEach((delay, i) => {
      setTimeout(() => {
        playTone({ freq: [523, 659, 784][i], type: 'triangle',
                   gain: 0.20, attack: 0.01, decay: 0.35, duration: 0.4 });
      }, delay);
    });
  }
  function soundGameOver() {
    [0, 120, 260].forEach((delay, i) => {
      setTimeout(() => {
        playTone({ freq: [400, 300, 180][i], type: 'sawtooth',
                   gain: 0.18, attack: 0.01, decay: 0.28, duration: 0.35,
                   noiseAmount: 0.15 });
      }, delay);
    });
  }
  function soundBossWordComplete() {
    playTone({ freq: 660, type: 'triangle',
               gain: 0.14, attack: 0.003, decay: 0.09, duration: 0.1 });
  }

  // ---------- kill particles ----------
  let particles = [];

  function spawnKillParticles(x, y, color) {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.4;
      const speed = 60 + Math.random() * 90;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.5 + Math.random() * 3,
        color,
        alpha: 1,
        life: 0.35 + Math.random() * 0.15, // seconds total lifetime
        age: 0,
      });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.age += dt;
      const t = p.age / p.life; // 0..1
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // drag
      p.vx *= 1 - dt * 4;
      p.vy *= 1 - dt * 4;
      p.alpha = Math.max(0, 1 - t);
    }
    particles = particles.filter(p => p.age < p.life);
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- screen shake ----------
  let shakeTimer = 0;
  let shakeMag = 0;
  let shakeX = 0, shakeY = 0;

  function triggerShake(magnitude, duration) {
    // keep the stronger shake if one is already running
    if (magnitude > shakeMag || shakeTimer <= 0) {
      shakeMag = magnitude;
    }
    shakeTimer = Math.max(shakeTimer, duration);
  }

  function updateShake(dt) {
    if (shakeTimer <= 0) { shakeX = 0; shakeY = 0; return; }
    shakeTimer = Math.max(0, shakeTimer - dt);
    const intensity = shakeMag * (shakeTimer > 0 ? 1 : 0);
    shakeX = (Math.random() * 2 - 1) * intensity;
    shakeY = (Math.random() * 2 - 1) * intensity;
  }

  // ---------- combo multiplier ----------
  let combo = 0;
  let comboTimer = 0;
  const COMBO_WINDOW = 2.2; // seconds between kills to keep the chain alive
  let comboPopups = []; // brief on-screen combo flash

  function registerKill(x, y) {
    comboTimer = COMBO_WINDOW;
    combo += 1;
    const multiplier = Math.max(1, combo);
    const points = 10 * multiplier;
    score += points;

    if (combo >= 2) {
      // show a combo popup near the kill
      comboPopups.push({
        x, y: y - 30,
        text: `×${combo} COMBO  +${points}`,
        age: 0,
        life: 0.9,
      });
    } else {
      // single kill — no popup, just score
      comboPopups.push({
        x, y: y - 24,
        text: `+${points}`,
        age: 0,
        life: 0.6,
      });
    }
  }

  function updateCombo(dt) {
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }
    for (const p of comboPopups) p.age += dt;
    comboPopups = comboPopups.filter(p => p.age < p.life);
  }

  function drawComboPopups() {
    ctx.save();
    for (const p of comboPopups) {
      const t = p.age / p.life;
      const alpha = Math.max(0, 1 - t * t);
      const yOff = -t * 28; // floats upward
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${combo >= 2 ? 16 : 13}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = combo >= 2 ? '#FFB627' : '#3FE0D0';
      ctx.fillText(p.text, p.x, p.y + yOff);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function updateComboHud() {
    if (combo >= 2) {
      waveInfoEl.textContent = `×${combo} COMBO  |  lvl ${currentDifficultyLabel()} · enemies: ${enemies.length}`;
      waveInfoEl.style.color = '#FFB627';
    } else {
      waveInfoEl.textContent = `lvl ${currentDifficultyLabel()} · enemies: ${enemies.length}`;
      waveInfoEl.style.color = '';
    }
  }



  function gameLoop(timestamp) {
    if (!running) return;
    if (paused) return;
    const dt = Math.min(0.05, (timestamp - lastTime) / 1000 || 0);
    lastTime = timestamp;

    updateSpawning(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateProjectiles(dt);
    updateHitFlashes(dt);
    updateParticles(dt);
    updateShake(dt);
    updateCombo(dt);
    if (!bossActive) updateTimedEffects(dt);
    updateFlash(dt);

    // apply screen shake as a canvas translation before all draw calls,
    // then reset afterward so HUD/overlays are never affected
    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBackground();
    drawEnemies();
    drawProjectiles();
    drawBoss();
    drawParticles();
    drawComboPopups();
    drawPlayer();

    ctx.restore(); // end screen shake transform

    timerEl.textContent = formatTime(elapsed);
    scoreValEl.textContent = score;
    updateComboHud();

    requestAnimationFrame(gameLoop);
  }

  function startGame() {
    enemies = [];
    projectiles = [];
    particles = [];
    comboPopups = [];
    combo = 0;
    comboTimer = 0;
    shakeTimer = 0;
    shakeMag = 0;
    shakeX = 0;
    shakeY = 0;
    resetTypedBuffer();
    updateTypedBufferDisplay();
    elapsed = 0;
    lastSkillMinuteAwarded = 0;
    paused = false;
    spawnTimer = 0;
    rollNextSpawn();
    centerPlayer();

    // boss state
    bossActive = false;
    boss = null;
    bossIndex = 0;
    lastBossMinuteTriggered = -1;
    bossBanner.classList.add('hidden');

    player.hp = player.maxHp = 10;
    player.damage = 1;
    player.skillPoints = 0;
    player.slowFactor = 1;
    player.skillLevels = { health: 0, damage: 0, slow: 0 };

    // card effect flags/timers — fully cleared so a fresh run starts with
    // no carried-over rewards from a previous playthrough
    player.hasFireRounds = false;
    player.hasTwinShot = false;
    player.hasAutoRocket = false;
    player.autoRocketInterval = 30;
    player.autoRocketTimer = 0;
    player.vampiricChance = 0;
    player.hasShieldCharge = false;
    player.shieldChargeInterval = 60;
    player.shieldChargeTimer = 0;
    player.shieldCharges = 0;
    player.hasRegen = false;
    player.regenInterval = 45;
    player.regenTimer = 0;
    player.hasPiercing = false;

    score = 0;
    kills = 0;
    gameOverTriggered = false;
    flashTimer = 0;
    dmgFlashEl.style.opacity = 0;
    renderHearts();
    spValEl.textContent = 0;

    running = true;
    if (idleAnimId) cancelAnimationFrame(idleAnimId);
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // on phones/tablets, bring up the on-screen keyboard right away so
    // the player can start typing without an extra tap
    focusMobileCapture();
  }

  // ---------- start button ----------
  // Disabled until the word/sentence data finishes loading from data.json,
  // so a very slow connection can't let someone start before any words
  // exist to type. In the very common case this resolves almost
  // instantly (small local JSON file).
  startBtn.disabled = true;
  startBtn.textContent = 'LOADING...';
  loadGameData().then(() => {
    startBtn.disabled = false;
    startBtn.textContent = 'START';
  });

  startBtn.addEventListener('click', () => {
    if (!gameDataLoaded) return; // guard against a stray click slipping through before disabled state applied
    menuOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    startGame();
  });

})();
