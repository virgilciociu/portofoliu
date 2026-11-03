/* =========================================================
   See my experience - 30 second acid-bass loop + synced slideshow
   Tempo: 112 BPM  ->  1 beat = 0.5357 s  ->  14 bars (56 beats) = exactly 30 s
   All screenshots share those 56 beats (3 or 4 beats each), so the slideshow and
   the music loop restart together and every slide change lands on a beat.
   Slides change with a 0.5 s crossfade. Leaving the page stops the music at once.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Timing ---------- */
  const BPM = 112;
  const STEP = 60 / BPM / 4;            // one 16th note, in seconds
  const STEPS_PER_BAR = 16;
  const BARS = 14;
  const TOTAL_STEPS = STEPS_PER_BAR * BARS;   // 224 steps = 30.000 s
  const LOOP = STEP * TOTAL_STEPS;
  const TOTAL_BEATS = BARS * 4;

  /* ---------- The bass line (one bar, 16 steps, Hz) ---------- */
  const acidBass = [
    55, 55, 82, 55,
    110, 82, 55, 82,
    55, 147, 110, 82,
    55, 82, 55, 41
  ];
  const semi = (n) => Math.pow(2, n / 12);
  // Per-bar transpose (semitones): bars 11 and 12 (index 10, 11) move up, the rest stay in A.
  const BAR_SHIFT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 5, 0, 0].map(semi);
  // Filter cutoff per bar: opens up through the track, big sweep in the breakdown (bars 9-10).
  const CUTOFF = [350, 350, 450, 450, 700, 700, 900, 900, 1400, 2400, 1100, 1100, 900, 900];
  const ACCENT = [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0];
  const ARP = [220, 261.63, 329.63, 440, 329.63, 261.63, 220, 164.81];

  const hasKick = (bar) => bar < 8 || bar >= 10;       // bars 9-10 = breakdown (no kick)
  const hasHats = (bar) => bar >= 2;
  const hasClap = (bar) => bar >= 4 && (bar < 8 || bar >= 10);
  const hasLead = (bar) => bar >= 6;
  const hasRoll = (bar, s) => (bar === 9 || bar === 13) && s >= 8;

  /* ---------- DOM ---------- */
  const frame = document.getElementById('frame');
  const slides = Array.prototype.slice.call(frame.querySelectorAll('.slide'));
  const dots = Array.prototype.slice.call(document.querySelectorAll('#dots span'));
  const leds = Array.prototype.slice.call(document.querySelectorAll('#leds span'));
  const btn = document.getElementById('soundBtn');
  const hint = document.getElementById('hint');
  const FADE_MS = 500;                  // crossfade length
  const HINT_DEFAULT = hint.textContent;

  /* ---------- State ---------- */
  let ctx = null;
  let out = null;            // per-playback output bus (disconnected on stop = instant silence)
  let leadBus = null;
  let noiseBuf = null;
  let musicOn = false;
  let userMuted = false;
  let t0 = 0;                // audio-clock time of step 0
  let nextStep = 0;
  let timer = null;
  let vt0 = performance.now() / 1000;   // visual clock epoch when no audio is playing

  try { userMuted = localStorage.getItem('portfolio-music') === 'off'; } catch (e) { /* ignore */ }

  /* =========================================================
     Audio engine (Web Audio, no external files)
     ========================================================= */
  function ensureCtx() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const len = ctx.sampleRate;           // 1 s of white noise
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function buildBus() {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(comp);
    comp.connect(ctx.destination);

    // Lead bus with a dotted-eighth echo
    leadBus = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    leadBus.connect(out);
    leadBus.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(out);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  function noiseHit(t, type, freq, q, vol, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  function clap(t) {
    noiseHit(t, 'bandpass', 1500, 1.2, 0.4, 0.02);
    noiseHit(t + 0.013, 'bandpass', 1500, 1.2, 0.4, 0.02);
    noiseHit(t + 0.026, 'bandpass', 1500, 1.2, 0.5, 0.16);
  }

  function bass(t, freq, prevFreq, accent, glide, cutoff) {
    const o = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    sub.type = 'square';
    subGain.gain.value = 0.22;
    if (glide) {
      o.frequency.setValueAtTime(prevFreq, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
      sub.frequency.setValueAtTime(prevFreq * 2, t);
      sub.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.05);
    } else {
      o.frequency.setValueAtTime(freq, t);
      sub.frequency.setValueAtTime(freq * 2, t);
    }
    f.type = 'lowpass';
    f.Q.value = 12;
    f.frequency.setValueAtTime(cutoff * (accent ? 4 : 2.2), t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + 0.16);
    const peak = accent ? 0.55 : 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.setValueAtTime(peak, t + STEP * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 0.97);
    o.connect(f);
    sub.connect(subGain);
    subGain.connect(f);
    f.connect(g);
    g.connect(out);
    o.start(t);
    sub.start(t);
    o.stop(t + STEP + 0.02);
    sub.stop(t + STEP + 0.02);
  }

  function lead(t, freq) {
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    f.type = 'lowpass';
    f.frequency.value = 2600;
    f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.connect(f);
    f.connect(g);
    g.connect(leadBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  function scheduleStep(n) {
    const inLoop = n % TOTAL_STEPS;
    const bar = Math.floor(inLoop / STEPS_PER_BAR);
    const s = inLoop % STEPS_PER_BAR;
    const t = t0 + n * STEP;
    if (t < ctx.currentTime - 0.02) return;       // never play late notes in a burst

    const shift = BAR_SHIFT[bar];
    const freq = acidBass[s] * shift;
    const prev = acidBass[(s + STEPS_PER_BAR - 1) % STEPS_PER_BAR] * shift;
    bass(t, freq, prev, ACCENT[s] === 1, s % 4 === 3, CUTOFF[bar]);

    if (hasKick(bar) && s % 4 === 0) kick(t);
    if (hasHats(bar) && s % 4 === 2) noiseHit(t, 'highpass', 7500, 0.7, 0.22, 0.09);
    if (bar >= 4 && s % 2 === 1) noiseHit(t, 'highpass', 8500, 0.7, 0.07, 0.03);
    if (hasClap(bar) && (s === 4 || s === 12)) clap(t);
    if (hasLead(bar) && s % 2 === 0) lead(t, ARP[(s / 2) % ARP.length] * shift);
    if (hasRoll(bar, s)) noiseHit(t, 'bandpass', 1800, 0.9, 0.12 + 0.03 * (s - 8), 0.1);
  }

  function tick() {
    const limit = ctx.currentTime + 0.15;
    while (t0 + nextStep * STEP < limit) {
      scheduleStep(nextStep);
      nextStep++;
    }
  }

  /* =========================================================
     Transport (start / stop)
     ========================================================= */
  function updateButton() {
    btn.innerHTML = musicOn ? '&#9632; Mute music' : '&#9654; Play music';
    btn.setAttribute('aria-pressed', musicOn ? 'true' : 'false');
    hint.textContent = HINT_DEFAULT;
  }

  function beginPlayback() {
    if (musicOn) return;
    buildBus();
    musicOn = true;
    t0 = ctx.currentTime + 0.12;       // slideshow restarts at slide 1, bar 1, together with the music
    nextStep = 0;
    clearInterval(timer);
    timer = setInterval(tick, 25);
    tick();
    updateButton();
  }

  function tryStart() {
    if (musicOn || !ensureCtx()) return;
    if (ctx.state === 'running') { beginPlayback(); return; }
    const p = ctx.resume();
    if (p && p.then) {
      p.then(function () {
        if (ctx.state === 'running' && !musicOn && !userMuted) beginPlayback();
      }, function () { /* blocked - wait for a gesture */ });
    }
  }

  // Hard stop for navigation: no sound may continue on, or after, another page.
  function haltAudio() {
    if (timer) { clearInterval(timer); timer = null; }
    musicOn = false;
    if (out) { try { out.disconnect(); } catch (e) { /* ignore */ } out = null; }
    if (ctx) {
      const c = ctx;
      ctx = null;
      try { const p = c.close(); if (p && p.catch) p.catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
    }
  }

  function stopMusic() {
    const p = currentPos();
    musicOn = false;
    clearInterval(timer);
    vt0 = performance.now() / 1000 - p;        // slideshow keeps going without sound
    if (out) { try { out.disconnect(); } catch (e) { /* ignore */ } }
    updateButton();
  }

  btn.addEventListener('click', function () {
    if (musicOn) {
      userMuted = true;
      try { localStorage.setItem('portfolio-music', 'off'); } catch (e) { /* ignore */ }
      stopMusic();
    } else {
      userMuted = false;
      try { localStorage.removeItem('portfolio-music'); } catch (e) { /* ignore */ }
      tryStart();
    }
  });

  // First tap / key anywhere starts the music (browsers block sound before a gesture).
  function onGesture(e) {
    if (btn.contains(e.target)) return;
    if (e.target.closest && e.target.closest('a[href]')) return;   // a tap on a menu link must not start music
    if (!userMuted && !musicOn) tryStart();
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, onGesture, { passive: true });
  });

  // Any link click (capture phase), leaving the tab/page, or the browser caching the page: silence first.
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && !a.target && !e.defaultPrevented) haltAudio();
  }, true);
  window.addEventListener('pagehide', haltAudio);
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;            // coming back from the back/forward cache: start fresh
    updateButton();
    if (!userMuted) tryStart();
  });

  document.addEventListener('visibilitychange', function () {
    if (!ctx || !musicOn) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  /* =========================================================
     Slideshow + beat visuals (driven by the same clock as the music)
     ========================================================= */
  function currentPos() {
    if (musicOn && ctx) {
      const lat = ctx.outputLatency || ctx.baseLatency || 0;
      return Math.max(0, ctx.currentTime - lat - t0);
    }
    return performance.now() / 1000 - vt0;
  }

  let curSlide = -1;
  let curStep = -1;
  let fadeTimer = null;
  // Slide k starts on beat round(k * 56 / N): with 16 slides that alternates 4 and 3 beats.
  const slideStart = slides.map(function (_, k) { return Math.round(k * TOTAL_BEATS / slides.length) * 4; });

  function slideAt(step) {
    let k = slides.length - 1;
    while (k > 0 && step < slideStart[k]) k--;
    return k;
  }

  function setSlide(i) {
    const prev = curSlide;
    curSlide = i;
    clearTimeout(fadeTimer);
    slides.forEach(function (el, k) {
      el.classList.remove('is-prev');
      el.classList.toggle('is-active', k === i);
    });
    // the old picture stays fully visible underneath while the new one fades in over 0.5 s
    if (prev >= 0 && prev !== i) {
      slides[prev].classList.add('is-prev');
      fadeTimer = setTimeout(function () { slides[prev].classList.remove('is-prev'); }, FADE_MS + 30);
    }
    dots.forEach(function (el, k) { el.classList.toggle('on', k === i); });
  }

  function pulse() {
    frame.classList.remove('beat');
    void frame.offsetWidth;                // restart the CSS animation
    frame.classList.add('beat');
  }

  function render() {
    const inLoop = currentPos() % LOOP;
    const step = Math.floor(inLoop / STEP);
    const slide = slideAt(step);
    if (slide !== curSlide) setSlide(slide);
    if (step !== curStep) {
      const s = step % STEPS_PER_BAR;
      if (curStep >= 0) leds[curStep % STEPS_PER_BAR].classList.remove('on');
      leds[s].classList.add('on');
      curStep = step;
      if (s % 4 === 0) pulse();
    }
    requestAnimationFrame(render);
  }

  setSlide(0);
  updateButton();
  window.addEventListener('load', function () {
    slides.forEach(function (el) { const im = el.querySelector('img'); if (im) { im.loading = 'eager'; } });
  });
  requestAnimationFrame(render);

  /* ---------- Try to autoplay; fall back to "tap to start" ---------- */
  let policy = null;
  try { if (navigator.getAutoplayPolicy) policy = navigator.getAutoplayPolicy('audiocontext'); } catch (e) { /* ignore */ }
  if (!userMuted && policy !== 'disallowed') tryStart();

  setTimeout(function () {
    if (!musicOn && !userMuted) {
      hint.textContent = 'Your browser blocks autoplay: tap anywhere or press "Play music" to start the beat.';
    }
  }, 600);
})();
