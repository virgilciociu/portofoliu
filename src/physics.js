/* =========================================================
   Orbit physics for the "See my experience" vortex.
   Real Newtonian mechanics, integrated with a fixed-step leapfrog (kick-drift-kick):
   - the vortex is a heavy central mass (inverse-square gravity, softened at the core)
   - every website panel is a body with its own mass, radius, velocity and inclined orbit
   - weak mutual gravity between panels + soft-sphere collisions (spring + damping)
   - a repulsive core and a soft outer boundary keep everything in view
   - panels keep an orientation (quaternion) with an angular velocity; a damped torsional spring
     turns them toward the camera, so collisions make them wobble naturally
   Angular speed of an orbit is about sqrt(GM / r^3): the outer panels move slowest,
   and all of them are much slower than the vortex itself.
   ========================================================= */
import * as THREE from 'three';

export const GM = 10.5;            // gravitational parameter of the vortex
const EPS_CENTER = 1.2;            // softening of the central potential
const R_CORE = 5.6;                // inside this radius the vortex pushes panels out
const R_OUT = 19.5;                // outside this radius a soft wall pulls them back
const G_MUTUAL = 0.6;              // strength of the mutual attraction (scaled by body masses)
const EPS_MUTUAL = 2.2;
const K_CONTACT = 14;              // contact spring
const C_CONTACT = 0.0;              // pure spring: elastic bounces, orbits keep their energy

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim(N, seed) {
  const rnd = mulberry32(seed || 7);
  const bodies = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < N; i++) {
    const r0 = 8.8 + ((i * 7) % N) / N * 6.4 + rnd() * 0.8;   // start (apoapsis) radius, spread out
    const theta = i * golden + rnd() * 0.5;               // angle along the orbit at t = 0
    const node = rnd() * Math.PI * 2;                     // longitude of the ascending node
    const incl = (rnd() - 0.5) * 2 * (36 * Math.PI / 180);  // inclination, +-36 degrees
    const rp = R_CORE + 1.0;                              // closest approach stays outside the core
    const fMin = Math.sqrt(2 * rp / (r0 + rp));
    const f = fMin + rnd() * (0.99 - fMin);               // speed relative to circular speed -> ellipse

    const e1 = new THREE.Vector3(Math.cos(node), 0, Math.sin(node));
    const normal = new THREE.Vector3(0, 1, 0).applyAxisAngle(e1, incl);
    const e2 = new THREE.Vector3().crossVectors(normal, e1).normalize();

    const p = e1.clone().multiplyScalar(Math.cos(theta) * r0).addScaledVector(e2, Math.sin(theta) * r0);
    const vc = Math.sqrt(GM / r0);
    const v = e1.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(e2, Math.cos(theta)).multiplyScalar(vc * f);

    const scale = 0.86 + rnd() * 0.3;                     // panels are not all the same size
    const tilt = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), (rnd() - 0.5) * 0.9
    );
    bodies.push({
      p: p, v: v, a: new THREE.Vector3(),
      m: 0.18 + (scale - 0.86) * 0.9,                     // bigger panel = heavier
      R: 2.05 * scale,                                    // collision radius
      scale: scale,
      q: new THREE.Quaternion(), w: new THREE.Vector3(),
      tilt: tilt
    });
  }

  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const rel = new THREE.Vector3();
  const kick = new THREE.Vector3();
  let frozen = -1;
  let collisions = 0;

  function accelerations() {
    for (let i = 0; i < N; i++) {
      const b = bodies[i];
      b.a.set(0, 0, 0);
      // central gravity (softened)
      const r2 = b.p.lengthSq();
      const r = Math.sqrt(r2);
      const d2 = r2 + EPS_CENTER * EPS_CENTER;
      b.a.addScaledVector(b.p, -GM / (d2 * Math.sqrt(d2)));
      if (r < R_CORE && r > 1e-4) b.a.addScaledVector(b.p, (R_CORE - r) * 14 / r);   // vortex pushes out
      if (r > R_OUT) b.a.addScaledVector(b.p, -(r - R_OUT) * 0.9 / r);                // soft outer wall
    }
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const A = bodies[i], B = bodies[j];
        tmp.subVectors(B.p, A.p);
        const d2 = tmp.lengthSq();
        const d = Math.sqrt(d2) || 1e-4;
        // mutual gravity (softened): each panel is pulled toward the other, in proportion to its mass
        const g = G_MUTUAL / Math.pow(d2 + EPS_MUTUAL * EPS_MUTUAL, 1.5);
        A.a.addScaledVector(tmp, g * B.m);
        B.a.addScaledVector(tmp, -g * A.m);
        // soft-sphere contact: spring on the overlap plus damping of the approach speed
        const overlap = A.R + B.R - d;
        if (overlap > 0) {
          nrm.copy(tmp).multiplyScalar(1 / d);
          rel.subVectors(B.v, A.v);
          const push = Math.max(0, K_CONTACT * overlap - C_CONTACT * rel.dot(nrm));
          A.a.addScaledVector(nrm, -push / (1 + A.m));
          B.a.addScaledVector(nrm, push / (1 + B.m));
          // the hit makes both panels wobble a little
          kick.crossVectors(nrm, rel).multiplyScalar(0.002);
          A.w.add(kick);
          B.w.add(kick);
          collisions++;
        }
      }
    }
  }

  accelerations();

  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const ax = new THREE.Vector3();

  const sim = {
    bodies: bodies,
    get collisions() { return collisions; },
    setFrozen: function (i) { frozen = i; },
    /** advance the motion by dt seconds (fixed internal sub-steps of 1/120 s) */
    step: function (dt) {
      const H = 1 / 120;
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(H, left);
        left -= h;
        for (let i = 0; i < N; i++) {                      // kick (half)
          if (i === frozen) continue;
          bodies[i].v.addScaledVector(bodies[i].a, h * 0.5);
        }
        for (let i = 0; i < N; i++) {                      // drift
          if (i === frozen) continue;
          bodies[i].p.addScaledVector(bodies[i].v, h);
        }
        accelerations();
        for (let i = 0; i < N; i++) {                      // kick (half)
          if (i === frozen) continue;
          bodies[i].v.addScaledVector(bodies[i].a, h * 0.5);
        }
      }
    },
    /** turn every panel toward the camera with a damped torsional spring (its own wobble) */
    orient: function (dt, cam) {
      const K = 6.0, C = 2.4;
      for (let i = 0; i < N; i++) {
        const b = bodies[i];
        m4.lookAt(cam, b.p, up);                           // +z of the panel points at the camera
        q1.setFromRotationMatrix(m4).multiply(b.tilt);     // desired orientation
        q2.copy(b.q).invert();
        q1.multiply(q2);                                   // error rotation (desired * current^-1)
        if (q1.w < 0) { q1.x = -q1.x; q1.y = -q1.y; q1.z = -q1.z; q1.w = -q1.w; }
        const s = Math.sqrt(Math.max(0, 1 - q1.w * q1.w));
        const ang = 2 * Math.atan2(s, q1.w);
        if (s > 1e-6) ax.set(q1.x / s, q1.y / s, q1.z / s); else ax.set(0, 0, 0);
        b.w.addScaledVector(ax, K * ang * dt).addScaledVector(b.w, -C * dt);
        const wl = b.w.length();
        if (wl > 1e-7) {
          q2.setFromAxisAngle(ax.copy(b.w).multiplyScalar(1 / wl), wl * dt);
          b.q.premultiply(q2).normalize();
        }
      }
    },
    /** initial orientation (no wobble at start) */
    snapOrientation: function (cam) {
      for (let i = 0; i < N; i++) {
        const b = bodies[i];
        m4.lookAt(cam, b.p, up);
        b.q.setFromRotationMatrix(m4).multiply(b.tilt);
      }
    }
  };
  return sim;
}
