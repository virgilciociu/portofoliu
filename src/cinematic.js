/* Shared cinematic shaders (nebula background + particles), used by every page. */
export const bgVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }';

export const bgFrag = [
  'precision highp float;',
  'uniform float uTime; uniform float uProg; uniform vec2 uRes; uniform float uVel; uniform vec3 uTint;',
  'varying vec2 vUv;',
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }',
  'float fbm(vec2 p){ float a = 0.5; float s = 0.0; for(int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }',
  'void main(){',
  '  vec2 uv = vUv; uv.x *= uRes.x / uRes.y;',
  '  float t = uTime * 0.05;',
  '  vec2 q = vec2(fbm(uv * 1.6 + vec2(t, uProg * 3.0)), fbm(uv * 1.6 + vec2(5.2, 1.3) - t));',
  '  float f = fbm(uv * 2.2 + q * 2.6 + vec2(0.0, uProg * 5.0));',
  '  vec3 deep = vec3(0.030, 0.012, 0.075);',
  '  vec3 magenta = vec3(0.80, 0.18, 0.62);',
  '  vec3 orange = vec3(1.00, 0.46, 0.20);',
  '  vec3 blue = vec3(0.18, 0.34, 1.00);',
  '  float h = fract(uProg * 1.6);',
  '  vec3 c1 = mix(magenta, blue, smoothstep(0.0, 1.0, abs(sin(uProg * 6.2832))));',
  '  vec3 c2 = mix(orange, magenta, smoothstep(0.0, 1.0, abs(cos(uProg * 6.2832 * 0.5))));',
  '  c1 = mix(c1, uTint, 0.38);',
  '  vec3 col = deep;',
  '  col = mix(col, c1, smoothstep(0.35, 0.80, f) * 0.55);',
  '  col = mix(col, c2, smoothstep(0.55, 0.95, q.x * f * 1.7) * 0.5);',
  '  col += vec3(0.5, 0.4, 1.0) * pow(max(f - 0.62, 0.0), 2.0) * 1.4;',
  '  float vig = smoothstep(1.25, 0.25, length(vUv - 0.5) * 1.5);',
  '  col *= 0.35 + 0.65 * vig;',
  '  col += abs(uVel) * 0.05;',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
  ].join('\n');

export const partVert = [
  'attribute float aSeed; attribute vec3 aColor; uniform float uTime; uniform float uScale; uniform float uVel;',
  'varying vec3 vColor; varying float vAlpha;',
  'void main(){',
  '  vec3 p = position;',
  '  p.x += sin(uTime * 0.25 + aSeed * 40.0) * 0.6;',
  '  p.y += cos(uTime * 0.21 + aSeed * 31.0) * 0.6;',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  float d = -mv.z;',
  '  gl_PointSize = clamp((1.0 + aSeed * 2.4) * uScale / max(d, 0.1), 1.0, 26.0);',
  '  gl_Position = projectionMatrix * mv;',
  '  vColor = aColor;',
  '  vAlpha = smoothstep(2.0, 10.0, d) * smoothstep(60.0, 14.0, d) * (0.45 + 0.55 * aSeed);',
  '}'
  ].join('\n');

export const partFrag = [
  'precision highp float; varying vec3 vColor; varying float vAlpha;',
  'void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if(d > 0.5) discard;',
  '  float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor, a * a * vAlpha); }'
  ].join('\n');


/* ---------- Vortex (spiral galaxy) used by "See my experience" ---------- */
// Flat disc with spiral arms, rotating faster near the centre (like a real vortex)
export const diskVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
export const diskFrag = [
  'precision highp float;',
  'uniform float uTime; uniform vec3 uTint; varying vec2 vUv;',
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'float fbm(vec2 p){ float a = 0.5; float s = 0.0; for(int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.07 + 5.3; a *= 0.5; } return s; }',
  'void main(){',
  '  vec2 p = (vUv - 0.5) * 2.0;',
  '  float r = length(p);',
  '  if (r > 1.0) discard;',
  '  float a = atan(p.y, p.x);',
  '  float spin = uTime * 1.5 / (sqrt(r) * 1.4 + 0.45);',
  '  float ang = a + spin;',
  '  float arms = pow(0.5 + 0.5 * cos(3.0 * ang + 7.0 * log(r + 0.06)), 2.2);',
  '  float turb = fbm(vec2(ang * 2.0 + r * 3.0, r * 7.0 - uTime * 0.15));',
  '  float dens = arms * (0.45 + 0.9 * turb) * smoothstep(1.0, 0.45, r) * smoothstep(0.0, 0.10, r);',
  '  dens += 0.28 * turb * smoothstep(1.0, 0.1, r);',
  '  float core = exp(-r * 7.0) * 2.4;',
  '  vec3 violet = mix(vec3(0.55, 0.30, 1.00), uTint, 0.25);',
  '  vec3 pink = vec3(1.00, 0.30, 0.68);',
  '  vec3 warm = vec3(1.00, 0.72, 0.42);',
  '  vec3 col = mix(violet, pink, smoothstep(0.75, 0.30, r));',
  '  col = mix(col, warm, smoothstep(0.34, 0.04, r));',
  '  col = col * dens + vec3(1.0, 0.86, 0.7) * core;',
  '  gl_FragColor = vec4(col, clamp(dens * 0.9 + core, 0.0, 1.0));',
  '}'
].join('\n');

// Particles flowing inwards along spiral arms
export const swirlVert = [
  'attribute vec4 aRand; uniform float uTime; uniform float uScale; uniform float uR;',
  'varying vec3 vColor; varying float vAlpha;',
  'void main(){',
  '  float k = fract(aRand.x - uTime * 0.016);',
  '  float r = uR * (0.05 + 0.95 * pow(k, 1.35));',
  '  float spin = uTime * 1.6 / (sqrt(r) * 1.1 + 0.5);',
  '  float arm = floor(aRand.y * 3.0) * 2.0944;',
  '  float ang = arm - 2.3 * log(r * 0.45 + 0.2) + spin + (aRand.z - 0.5) * (0.9 / (0.6 + r * 0.35));',
  '  float y = (aRand.w - 0.5) * 0.7 * exp(-r * 0.22);',
  '  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  gl_Position = projectionMatrix * mv;',
  '  float d = max(-mv.z, 0.1);',
  '  gl_PointSize = clamp((1.2 + aRand.w * 2.6) * uScale / d, 1.0, 12.0);',
  '  float t = r / uR;',
  '  vec3 c = mix(vec3(1.0, 0.80, 0.55), vec3(1.0, 0.38, 0.76), smoothstep(0.0, 0.35, t));',
  '  vColor = mix(c, vec3(0.62, 0.45, 1.0), smoothstep(0.3, 0.9, t));',
  '  vAlpha = smoothstep(0.0, 0.07, k) * smoothstep(1.0, 0.75, k) * (0.55 + 0.45 * aRand.w);',
  '}'
].join('\n');
export const swirlFrag = [
  'precision highp float; varying vec3 vColor; varying float vAlpha;',
  'void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;',
  '  float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor, a * a * vAlpha); }'
].join('\n');

// Soft glow behind the vortex core (billboard)
export const glowFrag = [
  'precision highp float; varying vec2 vUv; uniform float uTime;',
  'void main(){ vec2 p = (vUv - 0.5) * 2.0; float r = length(p); if (r > 1.0) discard;',
  '  float g = exp(-r * 4.2) * (0.9 + 0.1 * sin(uTime * 1.3));',
  '  vec3 col = mix(vec3(1.0, 0.45, 0.8), vec3(1.0, 0.85, 0.65), exp(-r * 6.0));',
  '  gl_FragColor = vec4(col * g, g); }'
].join('\n');

// Tornado: narrow rope at the bottom, flaring funnel, wide rotating cloud on top, dust at the base.
// Its axis bends and wobbles irregularly.
export const tornadoVert = [
  'attribute vec4 aRand; uniform float uTime; uniform float uScale; uniform float uH;',
  'varying vec3 vColor; varying float vAlpha;',
  'void main(){',
  '  float cls = aRand.z;',
  '  float h = fract(aRand.x + uTime * 0.04);',
  '  float rad; float y; float spd = 3.0;',
  '  vec3 col; float al = 1.0;',
  '  if (cls < 0.10) {',                                   // dust cloud at the base
  '    h = fract(aRand.x * 3.0 + uTime * 0.05) * 0.10;',
  '    rad = 0.8 + 3.2 * aRand.w * (0.6 + h * 4.0);',
  '    y = (h * 0.4 - 0.5) * uH + aRand.y * 0.9;',
  '    col = vec3(0.78, 0.58, 0.5); al = 0.55; spd = 1.6;',
  '  } else if (cls < 0.34) {',                              // wide cloud layer at the top
  '    h = 0.90 + 0.10 * aRand.w;',
  '    rad = 1.4 + 4.6 * pow(aRand.x, 0.7);',
  '    y = (h - 0.5) * uH + sin(aRand.y * 40.0) * 0.5 * (1.0 - aRand.x);',
  '    col = vec3(0.55, 0.45, 0.85); al = 0.45; spd = 0.9 + 1.6 * (1.0 - aRand.x);',
  '  } else {',                                              // the funnel itself
  '    rad = (0.18 + 4.1 * pow(h, 2.4)) * (0.6 + 0.4 * aRand.w);',
  '    y = (h - 0.5) * uH;',
  '    col = mix(vec3(0.95, 0.80, 0.78), vec3(0.72, 0.52, 1.0), smoothstep(0.1, 0.9, h));',
  '    spd = 3.4 - 1.8 * h;',
  '  }',
  '  float hh = clamp((y / uH) + 0.5, 0.0, 1.0);',
  '  float ang = aRand.y * 6.2832 + uTime * spd + hh * 4.0;',
  '  float cx = 1.5 * hh * hh * sin(hh * 4.0 + uTime * 0.8) + 0.5 * hh * sin(hh * 10.0 - uTime * 1.6) - 0.9 * (1.0 - hh) * sin(uTime * 0.9);',
  '  float cz = 1.5 * hh * hh * cos(hh * 3.0 + uTime * 0.6) + 0.5 * hh * cos(hh * 8.0 + uTime * 1.2);',
  '  vec3 p = vec3(cos(ang) * rad + cx, y, sin(ang) * rad + cz);',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  gl_Position = projectionMatrix * mv;',
  '  float d = max(-mv.z, 0.1);',
  '  gl_PointSize = clamp((1.2 + aRand.w * 2.6) * uScale / d, 1.0, 11.0);',
  '  vColor = col;',
  '  vAlpha = al * smoothstep(0.0, 0.06, hh) * (0.45 + 0.55 * aRand.w) * (cls >= 0.34 ? smoothstep(1.0, 0.85, h) * smoothstep(0.0, 0.06, h) : 1.0);',
  '}'
].join('\n');
