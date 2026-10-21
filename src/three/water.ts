import * as THREE from 'three';
import { M, mesh, std, roundedPath, setHeat } from './lib';

// The water-analogy kit: pipes, pumps, narrowings, tanks, valves and taps.
// voltage = pressure, current = flow, resistance = narrowness,
// capacitor = tank, diode = one-way valve, transistor = tap worked by a small hand.

export const WATER_BLUE = '#3c8fe0';

export function pipe(points: THREE.Vector3[], radius = 0.12, closed = false) {
  const path = roundedPath(points, 0.35, closed);
  const m = M.pipe();
  const o = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(24, Math.round(path.getLength() * 10)), radius, 14, closed), m);
  return { mesh: o, path };
}

/** A dial gauge facing +Z. set(f) moves the needle (0..1). */
export function gauge(radius = 0.34) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.06, 32), std('#f7f7f2', 0.4), [0, 0, 0], [Math.PI / 2, 0, 0]));
  g.add(mesh(new THREE.TorusGeometry(radius, 0.04, 8, 32), M.steel(), [0, 0, 0.03]));
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 1.15 - (i / 11) * Math.PI * 1.3;
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.03, 0.01), std(new THREE.Color().setHSL(0.6 - i * 0.05, 0.8, 0.5), 0.5), [Math.cos(a) * radius * 0.76, Math.sin(a) * radius * 0.76, 0.035], [0, 0, a]));
  }
  const needle = new THREE.Group();
  needle.add(mesh(new THREE.BoxGeometry(radius * 0.7, 0.025, 0.012), std('#c0281f', 0.4), [radius * 0.35, 0, 0]));
  needle.position.z = 0.045;
  g.add(needle, mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), M.steel(), [0, 0, 0.05], [Math.PI / 2, 0, 0]));
  return {
    group: g,
    set: (f: number) => {
      needle.rotation.z = Math.PI * 1.15 - Math.max(0, Math.min(1, f)) * Math.PI * 1.3;
    },
  };
}

/** Pump body sitting in a vertical pipe run. Spins its impeller with flow. */
export function pump() {
  const g = new THREE.Group();
  const housing = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 32), std('#2e6fb8', 0.4, 0.2), [0, 0, 0], [Math.PI / 2, 0, 0]);
  const cover = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 32), M.pipe(), [0, 0, 0.27], [Math.PI / 2, 0, 0]);
  const imp = new THREE.Group();
  imp.position.z = 0.24;
  for (let i = 0; i < 5; i++) {
    const blade = mesh(new THREE.BoxGeometry(0.34, 0.06, 0.04), std('#f2f2f2', 0.4), [0.17, 0, 0]);
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI * 2) / 5;
    holder.add(blade);
    imp.add(holder);
  }
  const motorBox = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), std('#2b2f33', 0.5), [0, 0, -0.45]);
  g.add(housing, cover, imp, motorBox);
  const gg = gauge(0.3);
  gg.group.position.set(0, 0.85, 0.05);
  g.add(gg.group, mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8), M.steel(), [0, 0.55, 0]));
  return {
    group: g,
    setPressure: gg.set,
    spin: (dt: number, speed: number) => {
      imp.rotation.z -= dt * speed * 3;
    },
  };
}

/**
 * A glass pipe section along X whose middle narrows. narrow(f): f = 0 wide open,
 * 1 = pinched almost shut. Also glows with friction heat.
 */
export function narrowing(length = 1.4, radius = 0.12) {
  const g = new THREE.Group();
  const m = std('#b9cbe0', 0.25, 0.1, { transparent: true, opacity: 0.85 });
  let geo: THREE.BufferGeometry = new THREE.BufferGeometry();
  const o = new THREE.Mesh(geo, m);
  o.rotation.z = -Math.PI / 2;
  g.add(o);
  let cur = 0.5;
  const build = (f: number) => {
    cur = f;
    const inner = radius * (1 - 0.85 * Math.max(0, Math.min(1, f)));
    const pts: THREE.Vector2[] = [];
    const n = 32;
    for (let i = 0; i <= n; i++) {
      const y = -length / 2 + (i / n) * length;
      const t = Math.abs(y) / (length / 2);
      const bump = t < 0.55 ? 1 : t > 0.9 ? 0 : 1 - (t - 0.55) / 0.35;
      const s = bump * bump * (3 - 2 * bump);
      pts.push(new THREE.Vector2(radius + 0.04 - (radius + 0.04 - inner - 0.04) * s, y));
    }
    geo.dispose();
    geo = new THREE.LatheGeometry(pts, 24);
    o.geometry = geo;
  };
  build(cur);
  return {
    group: g,
    setNarrow: build,
    get narrow() {
      return cur;
    },
    setHeat: (t: number) => setHeat(m, t),
    material: m,
  };
}

/** Transparent tank with a water level 0..1. */
export function tank(height = 1.4, radius = 0.5) {
  const g = new THREE.Group();
  const shell = mesh(new THREE.CylinderGeometry(radius, radius, height, 32, 1, true), M.pipe(), [0, height / 2, 0]);
  const bottom = mesh(new THREE.CylinderGeometry(radius, radius, 0.04, 32), M.steel(), [0, 0.02, 0]);
  const waterMat = M.water();
  const water = mesh(new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, 1, 32), waterMat, [0, 0.5, 0]);
  g.add(shell, bottom, water);
  const setLevel = (f: number) => {
    const l = Math.max(0.001, Math.min(1, f)) * (height - 0.04);
    water.scale.y = l;
    water.position.y = 0.04 + l / 2;
  };
  setLevel(0);
  return { group: g, setLevel };
}

/** One-way valve: a flap that swings open for forward flow (+X) and seals for reverse. */
export function checkValve(radius = 0.12) {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(radius * 2.4, 24, 16), M.pipe(), [0, 0, 0]);
  body.scale.set(1.3, 1, 1);
  const seat = mesh(new THREE.TorusGeometry(radius * 1.2, 0.03, 8, 24), M.steel(), [-0.05, 0, 0], [0, Math.PI / 2, 0]);
  const hinge = new THREE.Group();
  hinge.position.set(-0.02, radius * 1.25, 0);
  const flap = mesh(new THREE.CylinderGeometry(radius * 1.25, radius * 1.25, 0.03, 24), std('#e05a2a', 0.5), [0, -radius * 1.25, 0], [0, 0, Math.PI / 2]);
  hinge.add(flap);
  g.add(body, seat, hinge);
  return {
    group: g,
    /** open: 0 closed, 1 fully open. */
    setOpen: (f: number) => {
      hinge.rotation.z = -Math.max(0, Math.min(1, f)) * 1.1;
    },
  };
}

/** A tap (gate valve) with a handle and a small hand turning it. */
export function tapValve(radius = 0.14) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.45, 0.45), std('#b87333', 0.35, 0.8)));
  const gate = mesh(new THREE.BoxGeometry(0.06, radius * 2.2, radius * 2.2), std('#7a4b22', 0.5, 0.5), [0, 0, 0]);
  const stem = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 10), M.steel(), [0, 0.45, 0]);
  const wheel = mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 24), std('#c0281f', 0.4), [0, 0.7, 0], [Math.PI / 2, 0, 0]);
  // Small hand: palm + fingers.
  const hand = new THREE.Group();
  const skin = std('#e2b48f', 0.7);
  hand.add(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.16), skin, [0, 0, 0]));
  for (let i = 0; i < 4; i++) hand.add(mesh(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8), skin, [0.08 + 0.02, 0, -0.06 + i * 0.04], [0, 0, Math.PI / 2]));
  hand.position.set(0.32, 0.78, 0);
  g.add(gate, stem, wheel, hand);
  return {
    group: g,
    hand,
    setOpen: (f: number) => {
      const x = Math.max(0, Math.min(1, f));
      gate.position.y = x * radius * 2.1;
      wheel.rotation.z = x * Math.PI * 2;
      hand.rotation.y = x * Math.PI * 2;
      hand.position.set(Math.cos(x * Math.PI * 2) * 0.32, 0.78, -Math.sin(x * Math.PI * 2) * 0.32);
    },
  };
}
