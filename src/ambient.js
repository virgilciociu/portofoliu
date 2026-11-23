/* =========================================================
   Cinematic ambient background for Home / About / Connect
   - Same nebula + particles as the "See my experience" gallery, tinted with the page accent.
   - The camera drifts forward while you scroll, and follows the mouse a little.
   - Phones, "reduce motion" and browsers without WebGL keep the CSS aurora instead.
   - Also plays a short cinematic reveal of the page content (GSAP).
   ========================================================= */
import * as THREE from 'three';
import { bgVert, bgFrag, partVert, partFrag } from './cinematic.js';

(function () {
  'use strict';

  const gsap = window.gsap;
  const root = document.documentElement;
  const canvas = document.getElementById('ambient');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smallScreen = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;

  /* ---------- cinematic reveal of the page content ---------- */
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

  /* ---------- WebGL ambient background ---------- */
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  if (!canvas || reduceMotion || smallScreen || !webglAvailable()) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setClearColor(0x0b0616, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 160);
  camera.position.set(0, 0, 10);

  let tint = new THREE.Color('#a259ff');
  try {
    const v = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    if (v) tint = new THREE.Color(v);
  } catch (e) { /* keep default */ }

  const bgMat = new THREE.ShaderMaterial({
    vertexShader: bgVert, fragmentShader: bgFrag, depthTest: false, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uProg: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      uVel: { value: 0 }, uTint: { value: tint }
    }
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  const COUNT = 1500;
  const LEN = 220;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const palette = [new THREE.Color('#d2b0ff'), new THREE.Color('#ff6fc0'), new THREE.Color('#ffa05a'), new THREE.Color('#7fb4ff'), tint];
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 36;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = 14 - Math.random() * LEN;
    const c = palette[(Math.random() * palette.length) | 0];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    seed[i] = Math.random();
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const pm = new THREE.ShaderMaterial({
    vertexShader: partVert, fragmentShader: partFrag, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uVel: { value: 0 } }
  });
  const particles = new THREE.Points(pg, pm);
  particles.frustumCulled = false;
  scene.add(particles);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bgMat.uniforms.uRes.value.set(w, h);
    pm.uniforms.uScale.value = h * 0.3 * renderer.getPixelRatio();
  }
  resize();

  const mouse = new THREE.Vector2(0, 0);
  const mouseSmooth = new THREE.Vector2(0, 0);
  let scrollFrac = 0, scrollSmooth = 0, prevScroll = 0, vel = 0;
  let running = false;
  const clock = new THREE.Clock();

  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollFrac = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    scrollSmooth += (scrollFrac - scrollSmooth) * (1 - Math.exp(-dt * 4));
    const v = (scrollSmooth - prevScroll) / Math.max(dt, 0.001);
    prevScroll = scrollSmooth;
    vel += (Math.max(-1.2, Math.min(1.2, v * 2.2)) - vel) * (1 - Math.exp(-dt * 6));
    mouseSmooth.lerp(mouse, 1 - Math.exp(-dt * 3));

    camera.position.set(mouseSmooth.x * 0.9, mouseSmooth.y * 0.5, 10 - ((t * 0.55 + scrollSmooth * 60) % (LEN - 60)));
    camera.rotation.set(-mouseSmooth.y * 0.03, -mouseSmooth.x * 0.05, Math.sin(t * 0.2) * 0.01);
    bgMat.uniforms.uTime.value = t;
    bgMat.uniforms.uProg.value = scrollSmooth * 0.6 + (t * 0.004) % 1;
    bgMat.uniforms.uVel.value = vel;
    pm.uniforms.uTime.value = t;
    pm.uniforms.uVel.value = vel;
    renderer.render(scene, camera);
  }
  function start() {
    if (running) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('pointermove', function (e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }, { passive: true });
  document.addEventListener('visibilitychange', function () { if (document.hidden) running = false; else start(); });
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    running = false;
    root.classList.remove('amb');
  });

  readScroll();
  scrollSmooth = prevScroll = scrollFrac;
  root.classList.add('amb');
  start();
})();
