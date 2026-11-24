/* =========================================================
   Page backgrounds for Home / About / Connect (plain 2D canvas, light on phones too)
   - Home    : light-navy night sky with twinkling yellow / white / blue stars, a few bigger ones.
   - About   : old IBM-logo style, "Virgil C" repeated in letters cut by horizontal stripes (blue).
   - Connect : the same IBM style in dark green.
   "Reduce motion" draws one still frame. Also plays a short GSAP reveal of the page content.
   ========================================================= */
(function () {
  'use strict';

  const gsap = window.gsap;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  const canvas = document.getElementById('ambient');
  const root = document.documentElement;

  /* ---------- reveal of the page content ---------- */
  function reveal() {
    if (!gsap || reduceMotion) return;
    const nav = document.querySelector('.nav');
    const items = Array.prototype.slice.call(document.querySelectorAll('main > *'));
    const footer = document.querySelector('.footer');
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (nav) tl.from(nav, { y: -24, opacity: 0, duration: 0.8, clearProps: 'all' }, 0);
    if (items.length) {
      tl.from(items, {
        y: 38, opacity: 0, scale: 0.97, filter: 'blur(10px)',
        duration: 1.1, stagger: 0.14, clearProps: 'all'
      }, 0.25);
    }
    if (footer) tl.from(footer, { opacity: 0, duration: 0.9, clearProps: 'all' }, 0.9);
  }
  reveal();

  /* ---------- which background? ---------- */
  const cls = document.body.className;
  const mode = /page-home/.test(cls) ? 'sky' : /page-about/.test(cls) ? 'about' : /page-connect/.test(cls) ? 'connect' : '';
  if (!canvas || !mode) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const IBM = {
    about: { bg: '#0a1f44', fg: '#3a7bd5' },
    connect: { bg: '#0b2a1f', fg: '#2f8f6a' }
  };

  let W = 0, H = 0, dpr = 1;
  let draw = function () {};
  let animated = !reduceMotion;

  /* ---------- Home: night sky ---------- */
  const STAR_COLORS = ['#ffe28a', '#ffffff', '#9cc4ff', '#fff3c4', '#c9dcff'];
  let stars = [];
  const sprites = {};
  function sprite(color) {
    if (sprites[color]) return sprites[color];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color);
    gr.addColorStop(0.12, color);
    gr.addColorStop(0.35, color + '55');
    gr.addColorStop(1, color + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    sprites[color] = c;
    return c;
  }
  function makeStars() {
    const area = W * H;
    const small = Math.round(Math.min(900, Math.max(160, area / (isPhone ? 2600 : 3200))));
    stars = [];
    for (let i = 0; i < small; i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 0.9, c: STAR_COLORS[(Math.random() * 5) | 0], p: Math.random() * 6.28, s: 0.8 + Math.random() * 2.2, t: 0 });
    }
    for (let i = 0; i < Math.round(small / 12); i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: 1.4 + Math.random() * 1.0, c: STAR_COLORS[(Math.random() * 5) | 0], p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.4, t: 1 });
    }
    for (let i = 0; i < (isPhone ? 5 : 9); i++) {
      stars.push({ x: 0.05 + Math.random() * 0.9, y: 0.04 + Math.random() * 0.8, r: 2.6 + Math.random() * 1.8, c: STAR_COLORS[(Math.random() * 3) | 0], p: Math.random() * 6.28, s: 0.5 + Math.random() * 0.9, t: 2 });
    }
  }
  function drawSky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#16275c');
    g.addColorStop(0.55, '#26398a');
    g.addColorStop(1, '#4a4fa0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = animated ? 0.55 + 0.45 * Math.sin(t * s.s + s.p) : 0.85;
      const x = s.x * W, y = s.y * H;
      if (s.t === 0) {
        ctx.globalAlpha = 0.35 + 0.65 * tw;
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.2832); ctx.fill();
      } else {
        const size = s.r * (s.t === 2 ? 11 : 7) * (0.85 + 0.15 * tw);
        ctx.globalAlpha = 0.5 + 0.5 * tw;
        ctx.drawImage(sprite(s.c), x - size, y - size, size * 2, size * 2);
        if (s.t === 2) {                               // faint cross spikes on the big ones
          ctx.globalAlpha = 0.18 + 0.25 * tw;
          ctx.strokeStyle = s.c;
          ctx.lineWidth = 1;
          const L = size * 1.5;
          ctx.beginPath();
          ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
          ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- About / Connect: IBM-style "Virgil C" ---------- */
  let tile = null, tileW = 0, rowH = 0;
  function makeTile(fg) {
    const S = Math.max(64, Math.min(170, Math.min(W, H) * (isPhone ? 0.26 : 0.19)));
    rowH = Math.round(S * 1.02);
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = '900 ' + S + 'px Georgia, "Times New Roman", serif';
    const word = 'Virgil C';
    tileW = Math.ceil(probe.measureText(word).width + S * 0.55);
    tile = document.createElement('canvas');
    tile.width = tileW; tile.height = rowH;
    const g = tile.getContext('2d');
    g.font = '900 ' + S + 'px Georgia, "Times New Roman", serif';
    g.textBaseline = 'alphabetic';
    g.fillStyle = fg;
    g.fillText(word, S * 0.1, S * 0.8);
    const period = S / 12.5;                            // the horizontal cuts, like the IBM logo
    g.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < rowH; y += period) g.fillRect(0, y + period * 0.58, tileW, period * 0.42);
  }
  function drawIBM(t) {
    const p = IBM[mode];
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, W, H);
    const rows = Math.ceil(H / rowH) + 1;
    ctx.globalAlpha = 0.9;
    for (let r = 0; r < rows; r++) {
      const dir = r % 2 ? -1 : 1;
      let off = (animated ? t * 7 * dir : 0) + r * tileW * 0.37;
      off = ((off % tileW) + tileW) % tileW;
      const y = r * rowH - rowH * 0.15;
      for (let x = -off - tileW; x < W; x += tileW) ctx.drawImage(tile, Math.round(x), Math.round(y));
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- sizing + loop ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mode === 'sky') { makeStars(); draw = drawSky; }
    else { makeTile(IBM[mode].fg); draw = drawIBM; }
    draw(performance.now() / 1000);
  }

  let running = false, t0 = performance.now();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    draw((now - t0) / 1000);
  }
  function start() {
    if (running || !animated) return;
    running = true;
    requestAnimationFrame(frame);
  }

  resize();
  root.classList.add('amb');
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) running = false; else start(); });
  start();
})();
