// ============================================================
// TYPE TO SURVIVE — game.js
// CHUNK 1: canvas setup, avatar upload, menu wiring, idle player render
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

  // ---------- start button (placeholder until chunk 2+) ----------
  startBtn.addEventListener('click', () => {
    menuOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    // Game systems (spawning, typing, HP, timer, etc.) land in later chunks.
    // For now this just confirms the transition works end-to-end.
    console.log('Game start pressed. Avatar uploaded:', !!player.avatarImage);
  });

})();
