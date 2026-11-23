/* =========================================================
   See my experience - the vortex
   - A spiral-galaxy vortex spins in the centre of the screen.
   - The 16 websites float around it as irregular 3D panels, each on its own orbit.
     Their motion is real Newtonian physics (src/physics.js), much slower than the vortex.
   - Hover a panel: it stops and grows. Move away: it moves on again. Click: open the site.
   - Drag with the mouse to turn the whole scene.
   - Phones, "reduce motion", no WebGL or the "List view" button: a light 2D card grid.
   The 2D cards in experience.html are the single source of truth for names, links and images.
   ========================================================= */
import * as THREE from 'three';
import { bgVert, bgFrag, partVert, partFrag, diskVert, tornadoVert, swirlFrag, glowFrag } from './cinematic.js';
import { createSim } from './physics.js';

(function () {
  'use strict';

  const gsap = window.gsap;
  const root = document.documentElement;
  const cardEls = Array.prototype.slice.call(document.querySelectorAll('#cards .card'));
  const N = cardEls.length;
  const sites = cardEls.map(function (a, i) {
    return { index: i, name: a.dataset.name, url: a.href, src: a.dataset.src };
  });

  const journey = document.getElementById('journey');
  const hud = document.getElementById('hud');
  const hudNum = document.getElementById('hudNum');
  const hudName = document.getElementById('hudName');
  const hudLink = document.getElementById('hudLink');
  const hudScroll = document.getElementById('hudScroll');
  const intro = document.getElementById('intro');
  const toggleBtn = document.getElementById('viewToggle');
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loaderText');
  const canvas = document.getElementById('gl');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smallScreen = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;

  /* ---------- 2D mode: reveal cards while scrolling ---------- */
  let io = null;
  function startCardReveal() {
    if (io) return;
    if (!('IntersectionObserver' in window)) {
      cardEls.forEach(function (c) { c.classList.add('in'); });
      return;
    }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    cardEls.forEach(function (c, i) {
      c.style.transitionDelay = (i % 2) * 90 + 'ms';
      io.observe(c);
    });
  }

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  const can3D = !reduceMotion && !smallScreen && webglAvailable();
  root.classList.add('flat', 'reveal');
  startCardReveal();
  if (!can3D) return;                // simplified version: vortex in CSS + cards

  /* =========================================================
     3D scene
     ========================================================= */
  const PANEL_W = 4.4;
  const PANEL_H = PANEL_W * 614 / 1280;
  const VORTEX_R = 8.5;              // radius of the visible vortex disc
  const CAM_DIST = 27;

  let renderer, scene, camera, bgMesh, dust, vortex, swirl, glow, sim;
  const bolts = [];                  // lightning bolts (pooled)
  let nextBolt = 1.2;
  const panels = [];                 // { mesh, mat, hover, scale }
  let mode3D = false;
  let running = false;
  let clock = new THREE.Clock();

  // camera orbit (drag to turn the scene)
  let yaw = 0, pitch = 0.12, yawVel = 0.0;
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const mouse = new THREE.Vector2(10, 10);
  const mouseSmooth = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  let mouseSeen = false;
  let hoverIdx = -1;
  let selectedIdx = -1;
  let dragging = false, dragMoved = 0, downX = 0, downY = 0, lastX = 0, lastY = 0;

  const accentColor = new THREE.Color('#a259ff');

  // Opened straight from disk (file://)? Browsers then refuse to use the screenshots as WebGL
  // textures, so js/textures-local.js (small inlined copies) is loaded first.
  const isFile = window.location.protocol === 'file:';
  function texSrc(site) {
    if (isFile && window.__TEX) {
      const key = site.src.replace(/^.*\//, '').replace('-1280.webp', '');
      if (window.__TEX[key]) return window.__TEX[key];
    }
    return site.src;
  }

  /* ---------- panel shaders ---------- */
  const panelVert = [
    'uniform float uVel; uniform float uTime; uniform float uHover;',
    'varying vec2 vUv; varying float vDepth;',
    'void main(){',
    '  vUv = uv;',
    '  vec3 p = position;',
    '  float bend = sin(uv.x * 3.14159);',
    '  p.z += bend * uVel * 0.9 + sin(uv.y * 6.0 + uTime * 1.6) * 0.03 * (uHover + uVel);',
    '  p.y += sin(uv.x * 6.2832 + uTime) * 0.03 * uHover;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  const panelFrag = [
    'precision highp float;',
    'uniform sampler2D uTex; uniform float uVel; uniform float uTime; uniform float uHover; uniform float uActive; uniform vec3 uAccent;',
    'varying vec2 vUv; varying float vDepth;',
    'float hash(float n){ return fract(sin(n) * 43758.5453123); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float v = clamp(abs(uVel), 0.0, 1.0);',
    '  float g = max(uHover * 0.5, v * 0.6);',
    '  float band = floor(uv.y * 16.0);',
    '  float t = floor(uTime * 11.0);',
    '  float on = step(0.80, hash(band * 3.1 + t * 0.37)) * g;',
    '  uv.x += (hash(band * 7.13 + t * 1.7) - 0.5) * 0.12 * on;',
    '  float s = 0.0015 + v * 0.012 + uHover * 0.006 + on * 0.014;',
    '  float r = texture2D(uTex, uv + vec2(s, 0.0)).r;',
    '  float gr = texture2D(uTex, uv).g;',
    '  float b = texture2D(uTex, uv - vec2(s, 0.0)).b;',
    '  vec3 col = vec3(r, gr, b);',
    '  col *= 0.95 + 0.05 * sin(vUv.y * 700.0 + uTime * 4.0);',
    '  col += uAccent * on * 0.12;',
    '  col *= mix(0.55, 1.0, smoothstep(46.0, 16.0, vDepth)) * (0.80 + 0.20 * uActive + 0.25 * uHover);',
    '  vec2 e = min(vUv, 1.0 - vUv);',
    '  float edge = smoothstep(0.0, 0.012, min(e.x * 0.55, e.y * 1.15));',
    '  vec3 frame = uAccent * (1.2 + uHover * 1.4);',
    '  col = mix(frame, col, edge);',
    '  float fade = smoothstep(80.0, 50.0, vDepth) * smoothstep(0.6, 3.2, vDepth);',
    '  gl_FragColor = vec4(col, fade);',
    '}'
  ].join('\n');

  /* ---------- build ---------- */
  function build(onProgress) {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x0b0616, 1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);

    // Background nebula (fullscreen quad, drawn first, ignores depth)
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: bgVert, fragmentShader: bgFrag, depthTest: false, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uProg: { value: 0.35 }, uRes: { value: new THREE.Vector2(1, 1) },
        uVel: { value: 0 }, uTint: { value: new THREE.Color('#a259ff') }
      }
    });
    bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
    bgMesh.frustumCulled = false;
    bgMesh.renderOrder = -10;
    scene.add(bgMesh);

    // Distant dust
    const DUST = 1500;
    const pos = new Float32Array(DUST * 3);
    const col = new Float32Array(DUST * 3);
    const seed = new Float32Array(DUST);
    const palette = [new THREE.Color('#d2b0ff'), new THREE.Color('#ff6fc0'), new THREE.Color('#ffa05a'), new THREE.Color('#7fb4ff')];
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      const c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      seed[i] = Math.random();
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const dm = new THREE.ShaderMaterial({
      vertexShader: partVert, fragmentShader: partFrag, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uVel: { value: 0 } }
    });
    dust = new THREE.Points(dg, dm);
    dust.frustumCulled = false;
    scene.add(dust);

    // The vortex: disc + inflowing particles + core glow
    vortex = new THREE.Group();
    scene.add(vortex);
    const SW = 16000;
    const sr = new Float32Array(SW * 4);
    const sp = new Float32Array(SW * 3);              // positions are computed in the shader
    for (let i = 0; i < SW; i++) {
      sr[i * 4] = Math.random(); sr[i * 4 + 1] = Math.random(); sr[i * 4 + 2] = Math.random(); sr[i * 4 + 3] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aRand', new THREE.BufferAttribute(sr, 4));
    const sm = new THREE.ShaderMaterial({
      vertexShader: tornadoVert, fragmentShader: swirlFrag, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uH: { value: 17 } }
    });
    swirl = new THREE.Points(sg, sm);
    swirl.frustumCulled = false;
    vortex.add(swirl);

    const glowMat = new THREE.ShaderMaterial({
      vertexShader: diskVert, fragmentShader: glowFrag, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } }
    });
    glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), glowMat);
    scene.add(glow);

    for (let k = 0; k < 3; k++) {
      const MAXV = 600;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3));
      g.setDrawRange(0, 0);
      const m = new THREE.LineBasicMaterial({ color: 0xd8c8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const l = new THREE.LineSegments(g, m);
      l.frustumCulled = false;
      scene.add(l);
      bolts.push({ line: l, life: 0, dur: 0.4, seed: 0 });
    }

    // Physics + panels
    sim = createSim(N, 7);
    const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H, 20, 10);
    const texLoader = new THREE.TextureLoader();
    let loaded = 0;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    updateCamera(0, 0);
    sim.snapOrientation(camPos);
    return new Promise(function (resolve) {
      sites.forEach(function (s, i) {
        const mat = new THREE.ShaderMaterial({
          vertexShader: panelVert, fragmentShader: panelFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
          uniforms: {
            uTex: { value: null }, uVel: { value: 0 }, uTime: { value: 0 }, uHover: { value: 0 },
            uActive: { value: 0 }, uAccent: { value: accentColor.clone() }
          }
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.index = i;
        mesh.position.copy(sim.bodies[i].p);
        mesh.quaternion.copy(sim.bodies[i].q);
        mesh.scale.setScalar(sim.bodies[i].scale);
        scene.add(mesh);
        panels.push({ mesh: mesh, mat: mat, hover: 0, scale: sim.bodies[i].scale });
        texLoader.load(texSrc(s), function (tex) {
          tex.anisotropy = Math.min(8, maxAniso);
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          mat.uniforms.uTex.value = tex;
          loaded++;
          onProgress(loaded);
          if (loaded === N) resolve();
        }, undefined, function () {
          loaded++;                       // a missing image must not block the gallery
          onProgress(loaded);
          if (loaded === N) resolve();
        });
      });
    });
  }

  /* ---------- camera ---------- */
  function updateCamera(dt, time) {
    mouseSmooth.lerp(mouseSeen ? mouse : new THREE.Vector2(0, 0), 1 - Math.exp(-dt * 3));
    const cp = Math.cos(pitch);
    camPos.set(Math.sin(yaw) * cp * CAM_DIST, Math.sin(pitch) * CAM_DIST, Math.cos(yaw) * cp * CAM_DIST);
    camera.position.copy(camPos);
    camera.position.x += mouseSmooth.x * 0.9;
    camera.position.y += mouseSmooth.y * 0.6;
    lookAt.set(0, 1.6, 0);
    camera.lookAt(lookAt);
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bgMesh.material.uniforms.uRes.value.set(w, h);
    const sc = h * 0.30 * renderer.getPixelRatio();
    dust.material.uniforms.uScale.value = sc;
    swirl.material.uniforms.uScale.value = sc * 1.1;
  }

  /* ---------- scroll: the scene fades out when you move on to the numbers ---------- */
  function readScroll() {
    const vh = window.innerHeight;
    const y = window.scrollY;
    const out = Math.min(1, Math.max(0, (y - vh * 0.15) / (vh * 0.65)));
    canvas.style.opacity = String(1 - out);
    hud.style.opacity = String(Math.max(0, 1 - out * 1.6));
    intro.style.opacity = String(Math.max(0, 1 - out * 1.6));
    hudScroll.style.opacity = y > 30 ? '0' : '1';
    if (mode3D && y < vh * 1.05 && !running) startLoop();
  }

  /* ---------- HUD ---------- */
  function select(i) {
    if (i === selectedIdx || i < 0) return;
    const first = selectedIdx < 0;
    selectedIdx = i;
    const s = sites[i];
    hudLink.href = s.url;
    hudLink.setAttribute('aria-label', 'Visit ' + s.name);
    const num = (i + 1 < 10 ? '0' : '') + (i + 1);
    const parts = [hudNum.parentNode, hudName, hudLink];
    if (!gsap) {
      hudNum.textContent = num; hudName.textContent = s.name;
      parts.forEach(function (p) { p.style.opacity = '1'; p.style.visibility = 'visible'; });
      return;
    }
    gsap.killTweensOf(parts);
    gsap.to(parts, {
      opacity: 0, y: 10, duration: first ? 0 : 0.14, ease: 'power2.in', onComplete: function () {
        hudNum.textContent = num;
        hudName.textContent = s.name;
        parts.forEach(function (p) { p.style.visibility = 'visible'; });
        gsap.fromTo(parts, { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.05 });
      }
    });
  }


  /* ---------- lightning: irregular jagged bolts with branches ---------- */
  function jag(out, a, b, disp, depth) {
    if (depth === 0) { out.push(a.x, a.y, a.z, b.x, b.y, b.z); return; }
    const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    m.x += (Math.random() - 0.5) * disp; m.y += (Math.random() - 0.5) * disp * 0.4; m.z += (Math.random() - 0.5) * disp;
    jag(out, a, m, disp * 0.55, depth - 1);
    jag(out, m, b, disp * 0.55, depth - 1);
    if (depth > 2 && Math.random() < 0.32) {                      // a side branch
      const e = m.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, -Math.random() * 5.5 - 1, (Math.random() - 0.5) * 7));
      jag(out, m, e, disp * 0.5, depth - 2);
    }
  }
  function fireBolt(b) {
    const ang = Math.random() * 6.2832, r0 = Math.random() * 3.2;
    const a = new THREE.Vector3(Math.cos(ang) * r0, 8.5, Math.sin(ang) * r0);
    const ang2 = ang + (Math.random() - 0.5) * 1.6, r1 = 1 + Math.random() * 8;
    const e = new THREE.Vector3(Math.cos(ang2) * r1, -8.6 + Math.random() * 1.2, Math.sin(ang2) * r1);
    const pts = [];
    jag(pts, a, e, 5.2, 6);
    const n = Math.min(pts.length, 600 * 3);
    const arr = b.line.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) arr[i] = pts[i];
    b.line.geometry.attributes.position.needsUpdate = true;
    b.line.geometry.setDrawRange(0, n / 3);
    b.life = b.dur = 0.22 + Math.random() * 0.3;
  }
  function updateBolts(dt, time) {
    nextBolt -= dt;
    if (nextBolt <= 0) {
      nextBolt = 0.5 + Math.random() * 2.4 * (Math.random() < 0.3 ? 0.25 : 1);
      const free = bolts.filter(function (b) { return b.life <= 0; })[0];
      if (free) fireBolt(free);
    }
    let flash = 0;
    bolts.forEach(function (b) {
      if (b.life <= 0) { b.line.material.opacity = 0; return; }
      b.life -= dt;
      const t = Math.max(0, b.life / b.dur);
      const flick = Math.random() < 0.35 ? 0.25 : 1.0;           // irregular flicker
      b.line.material.opacity = Math.min(1, t * 1.6) * flick;
      flash = Math.max(flash, b.line.material.opacity);
    });
    glow.scale.setScalar(1 + flash * 0.35);
  }

  /* ---------- loop ---------- */
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;

    // camera orbit with inertia
    if (!dragging) {
      yaw += yawVel * dt;
      yawVel *= Math.exp(-dt * 2.2);
    }
    updateCamera(dt, time);

    // hover: raycast against the moving panels
    let newHover = -1;
    if (mouseSeen && !dragging) {
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(panels.map(function (p) { return p.mesh; }), false);
      if (hits.length) newHover = hits[0].object.userData.index;
    }
    if (newHover !== hoverIdx) {
      hoverIdx = newHover;
      sim.setFrozen(hoverIdx);                 // the hovered panel stops; it moves on again when the mouse leaves
      if (hoverIdx >= 0) select(hoverIdx);
      canvas.style.cursor = dragging ? 'grabbing' : (hoverIdx >= 0 ? 'pointer' : 'grab');
    }

    // physics
    sim.step(dt);
    sim.orient(dt, camera.position);

    for (let i = 0; i < N; i++) {
      const p = panels[i], b = sim.bodies[i];
      p.hover += ((i === hoverIdx ? 1 : 0) - p.hover) * (1 - Math.exp(-dt * 8));
      p.mesh.position.copy(b.p);
      p.mesh.quaternion.copy(b.q);
      p.mesh.scale.setScalar(p.scale * (1 + 0.55 * p.hover));
      const u = p.mat.uniforms;
      u.uTime.value = time;
      u.uVel.value = Math.min(1, b.w.length() * 4);          // wobble after a collision makes it flicker
      u.uHover.value = p.hover;
      u.uActive.value = p.hover;
    }

    // vortex
    vortex.rotation.z = 0.10 * Math.sin(time * 0.6) + 0.05 * Math.sin(time * 1.3);
    vortex.rotation.x = 0.08 * Math.sin(time * 0.5 + 1.0);
    swirl.material.uniforms.uTime.value = time;
    glow.material.uniforms.uTime.value = time;
    glow.quaternion.copy(camera.quaternion);
    updateBolts(dt, time);
    bgMesh.material.uniforms.uTime.value = time;
    dust.material.uniforms.uTime.value = time;
    dust.rotation.y = time * 0.004;

    renderer.render(scene, camera);

    if (window.scrollY > window.innerHeight * 1.05) running = false;   // off screen: stop drawing
  }
  function startLoop() {
    if (running) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }

  /* ---------- events ---------- */
  function onPointerMove(e) {
    mouseSeen = true;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      yaw -= dx * 0.006;
      pitch = Math.min(1.1, Math.max(0.12, pitch + dy * 0.004));
      yawVel = -dx * 0.006 / Math.max(0.008, 0.016) * 0.5;
      lastX = e.clientX; lastY = e.clientY;
    }
  }
  function overUi(e) { return !!(e.target && e.target.closest && e.target.closest('a, button, nav')); }
  function onDown(e) {
    if (!mode3D || overUi(e) || e.button > 0) return;
    dragging = true; dragMoved = 0;
    downX = lastX = e.clientX; downY = lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
  }
  function onUp(e) {
    if (!mode3D) return;
    const wasDragging = dragging;
    dragging = false;
    canvas.style.cursor = hoverIdx >= 0 ? 'pointer' : 'grab';
    if (!wasDragging || overUi(e)) return;
    if (dragMoved < 6 && hoverIdx >= 0) window.open(sites[hoverIdx].url, '_blank', 'noopener');
  }

  /* ---------- mode switch ---------- */
  function enter3D() {
    mode3D = true;
    root.classList.add('gl');
    root.classList.remove('flat');
    toggleBtn.textContent = 'List view';
    resize();
    readScroll();
    canvas.style.cursor = 'grab';
    startLoop();
  }
  function enterFlat() {
    mode3D = false;
    running = false;
    root.classList.remove('gl');
    root.classList.add('flat');
    sim.setFrozen(-1);
    canvas.style.opacity = '';
    hud.style.opacity = '';
    intro.style.opacity = '';
    toggleBtn.textContent = '3D view';
    window.scrollTo(0, 0);
  }

  function init() {
    loader.hidden = false;
    const p = build(function (n) { loaderText.textContent = 'Loading 3D gallery ' + n + ' / ' + N; });
    p.then(function () {
      resize();
      toggleBtn.hidden = false;
      enter3D();
      loader.classList.add('is-done');
      setTimeout(function () { loader.hidden = true; }, 700);
    });
  }

  window.addEventListener('resize', function () { if (mode3D) { resize(); readScroll(); } });
  window.addEventListener('scroll', function () { if (mode3D) readScroll(); }, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointerleave', function () { mouseSeen = false; mouse.set(10, 10); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) running = false; else if (mode3D) readScroll(); });
  toggleBtn.addEventListener('click', function () { if (mode3D) enterFlat(); else enter3D(); });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); enterFlat(); toggleBtn.hidden = true; });

  function safeInit() {
    try {
      init();
    } catch (e) {
      loader.hidden = true;
      root.classList.remove('gl');
      root.classList.add('flat');
    }
  }
  if (isFile) {
    const sc = document.createElement('script');
    sc.src = 'js/textures-local.js';
    sc.onload = safeInit;
    sc.onerror = function () { /* stay in the simple card view */ };
    document.head.appendChild(sc);
  } else {
    safeInit();
  }
})();
