import * as THREE from 'three';
import { resistorBands, heatColor } from '../sim/physics';

// Shared, procedurally built component library. Units: 1 = 1 cm.
// Every builder returns a Group whose origin sits on the board surface.

// ------------------------------------------------------------- materials
const matCache = new Map<string, THREE.MeshStandardMaterial>();
const sharedSet = new WeakSet<THREE.Material>();
/** Shared library materials are reused across lessons and never disposed. */
export function isShared(m: THREE.Material): boolean {
  return sharedSet.has(m);
}
export function mat(key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    sharedSet.add(m);
    matCache.set(key, m);
  }
  return m;
}
const std = (color: THREE.ColorRepresentation, rough = 0.6, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

export const M = {
  boardWhite: () => mat('boardWhite', () => std('#f1efe8', 0.75)),
  plasticDark: () => mat('plasticDark', () => std('#232526', 0.55)),
  plasticBlack: () => mat('plasticBlack', () => std('#151617', 0.45)),
  plasticGrey: () => mat('plasticGrey', () => std('#8d9196', 0.6)),
  lead: () => mat('lead', () => std('#c9ccd1', 0.3, 0.9)),
  copper: () => mat('copper', () => std('#d98a46', 0.32, 1)),
  gold: () => mat('gold', () => std('#e8c35a', 0.25, 1)),
  solder: () => mat('solder', () => std('#d5d9dc', 0.25, 1)),
  tin: () => mat('tin', () => std('#b9bec4', 0.35, 0.9)),
  fr4: () => mat('fr4', () => std('#cdbf86', 0.85)),
  mask: () => mat('mask', () => std('#0f5e2f', 0.38, 0, { transparent: true, opacity: 0.9 })),
  maskSolid: () => mat('maskSolid', () => std('#0f5e2f', 0.4)),
  silk: () => mat('silk', () => std('#fbfbf7', 0.7)),
  resistorBody: () => mat('resBody', () => std('#d8c49b', 0.55)),
  ceramic: () => mat('ceramic', () => std('#e09a3c', 0.6)),
  capBlue: () => mat('capBlue', () => std('#2a4f8f', 0.45)),
  capStripe: () => mat('capStripe', () => std('#d9dde3', 0.5)),
  smdTan: () => mat('smdTan', () => std('#b99a6b', 0.7)),
  die: () => mat('die', () => std('#3a4a63', 0.25, 0.6)),
  glass: () => mat('glass', () => std('#f4f8ff', 0.05, 0.1, { transparent: true, opacity: 0.3, depthWrite: false })),
  water: () => mat('water', () => std('#3c8fe0', 0.15, 0, { transparent: true, opacity: 0.55 })),
  pipe: () => mat('pipe', () => std('#a9c9ea', 0.15, 0.1, { transparent: true, opacity: 0.55, depthWrite: false })),
  steel: () => mat('steel', () => std('#a7adb4', 0.35, 0.85)),
  rubber: () => mat('rubber', () => std('#2e3134', 0.85)),
};

const wireColors: Record<string, string> = {
  red: '#d6312b', black: '#26282a', blue: '#2a68d1', yellow: '#efc22a', green: '#2f9e44', orange: '#ef7d1d', white: '#f3f3f3', purple: '#8c4bd1',
};
export type WireColor = keyof typeof wireColors;
export const WIRE_COLORS = Object.keys(wireColors) as WireColor[];
export function wireMat(c: WireColor) {
  return mat(`wire-${c}`, () => std(wireColors[c], 0.45));
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, pos?: [number, number, number], rot?: [number, number, number]) {
  const o = new THREE.Mesh(geo, m);
  if (pos) o.position.set(...pos);
  if (rot) o.rotation.set(...rot);
  return o;
}

// ---------------------------------------------------------------- glow
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function glowSprite(color: THREE.ColorRepresentation, size = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

/** Set the emissive "heat glow" of a material from 0 (cold) to 1 (glowing red hot). */
export function setHeat(m: THREE.MeshStandardMaterial, t: number) {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.25) {
    m.emissive.setRGB(0, 0, 0);
    m.emissiveIntensity = 0;
    return;
  }
  const k = (x - 0.25) / 0.75;
  m.emissive.setRGB(1, 0.25 + 0.4 * k, 0.05 * k);
  m.emissiveIntensity = 0.15 + 1.4 * k * k;
}

/** Colour a material by a heat map value (blue → red). */
export function setHeatMap(m: THREE.MeshStandardMaterial, t: number) {
  const [r, g, b] = heatColor(t);
  m.color.setRGB(r, g, b);
  m.emissive.setRGB(r * 0.35, g * 0.35, b * 0.35);
  m.emissiveIntensity = 1;
}

// ------------------------------------------------------------- resistor
export interface ResistorObj {
  group: THREE.Group;
  body: THREE.Mesh;
  setValue(ohms: number): void;
  setHeat(t: number): void;
  setBurnt(b: boolean): void;
  /** Lead tip positions in local space. */
  ends: [THREE.Vector3, THREE.Vector3];
}

/**
 * Axial through-hole resistor lying along X, legs bent down into the board.
 * span = distance between the two holes.
 */
export function resistor(ohms: number, span = 1.016): ResistorObj {
  const g = new THREE.Group();
  const bodyMat = M.resistorBody().clone();
  const L = 0.62;
  const R = 0.105;
  const y = 0.32;
  const body = mesh(new THREE.CapsuleGeometry(R, L - 2 * R, 6, 16), bodyMat, [0, y, 0], [0, 0, Math.PI / 2]);
  // Bulged end caps.
  const capGeo = new THREE.SphereGeometry(R * 1.18, 16, 12);
  const capL = mesh(capGeo, bodyMat, [-L / 2 + R * 0.6, y, 0]);
  const capR = mesh(capGeo, bodyMat, [L / 2 - R * 0.6, y, 0]);
  g.add(body, capL, capR);
  const bands: THREE.Mesh[] = [];
  const bandGeo = new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.045, 18);
  for (let i = 0; i < 5; i++) {
    const b = mesh(bandGeo, std('#000', 0.5), [0, y, 0], [0, 0, Math.PI / 2]);
    bands.push(b);
    g.add(b);
  }
  // Legs.
  const legMat = M.lead();
  const legR = 0.022;
  const half = span / 2;
  const hz = new THREE.CylinderGeometry(legR, legR, half - L / 2 + 0.05, 8);
  const legH1 = mesh(hz, legMat, [-(half + L / 2) / 2, y, 0], [0, 0, Math.PI / 2]);
  const legH2 = mesh(hz, legMat, [(half + L / 2) / 2, y, 0], [0, 0, Math.PI / 2]);
  const vt = new THREE.CylinderGeometry(legR, legR, y + 0.1, 8);
  const legV1 = mesh(vt, legMat, [-half, (y - 0.1) / 2, 0]);
  const legV2 = mesh(vt, legMat, [half, (y - 0.1) / 2, 0]);
  g.add(legH1, legH2, legV1, legV2);
  const charred = std('#2b241d', 0.9);

  const setValue = (v: number) => {
    const bs = resistorBands(v);
    // Layout: digits grouped at the left, tolerance band at the right.
    const n = bs.length;
    const xs = n === 4 ? [-0.2, -0.11, -0.02, 0.19] : [-0.22, -0.14, -0.06, 0.02, 0.19];
    bands.forEach((b, i) => {
      b.visible = i < n;
      if (i < n) {
        (b.material as THREE.MeshStandardMaterial).color.set(bs[i].hex);
        const metal = bs[i].name === 'gold' || bs[i].name === 'silver';
        (b.material as THREE.MeshStandardMaterial).metalness = metal ? 0.9 : 0;
        (b.material as THREE.MeshStandardMaterial).roughness = metal ? 0.3 : 0.5;
        b.position.x = xs[i];
      }
    });
  };
  setValue(ohms);
  return {
    group: g,
    body,
    setValue,
    setHeat: (t) => setHeat(bodyMat, t),
    setBurnt: (b) => {
      body.material = b ? charred : bodyMat;
      capL.material = capR.material = body.material;
    },
    ends: [new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0)],
  };
}

// ------------------------------------------------------------------ LED
export interface LedObj {
  group: THREE.Group;
  setLight(t: number): void;
  setDead(d: boolean): void;
  flip(f: boolean): void;
  color: THREE.Color;
}

export const LED_COLORS = {
  red: { hex: '#ff2a1a', vf: 2.0 },
  green: { hex: '#2bff5a', vf: 2.2 },
  blue: { hex: '#2a7bff', vf: 3.0 },
  yellow: { hex: '#ffd21a', vf: 2.1 },
  white: { hex: '#f4f6ff', vf: 3.1 },
};

/** 5 mm LED standing on two legs spaced `span` apart along X (anode, the long leg, at -X; flat cathode side at +X). */
export function led(color: keyof typeof LED_COLORS = 'red', span = 0.254): LedObj {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const c = new THREE.Color(LED_COLORS[color].hex);
  const lensMat = new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.15), roughness: 0.15, transparent: true, opacity: 0.85, emissive: c, emissiveIntensity: 0.05 });
  const y0 = 0.55;
  const r = 0.25;
  const cyl = mesh(new THREE.CylinderGeometry(r, r, 0.42, 24), lensMat, [0, y0 + 0.21, 0]);
  const dome = mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lensMat, [0, y0 + 0.42, 0]);
  // Rim with the flat (cathode) side.
  const rimShape = new THREE.Shape();
  rimShape.absarc(0, 0, r * 1.15, -1.25, Math.PI * 2 - 1.9, false);
  rimShape.closePath();
  const rim = mesh(new THREE.ExtrudeGeometry(rimShape, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }), lensMat, [0, y0, 0], [-Math.PI / 2, 0, 0]);
  inner.add(cyl, dome, rim);
  const legMat = M.lead();
  const legA = mesh(new THREE.CylinderGeometry(0.02, 0.02, y0 + 0.12, 8), legMat, [-span / 2, (y0 - 0.12) / 2, 0]);
  const legK = mesh(new THREE.CylinderGeometry(0.02, 0.02, y0 + 0.02, 8), legMat, [span / 2, (y0 - 0.02) / 2 - 0.05, 0]);
  inner.add(legA, legK);
  const glow = glowSprite(c, 1.6);
  glow.position.set(0, y0 + 0.35, 0);
  glow.visible = false;
  g.add(glow);
  const deadMat = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.35), roughness: 0.4, transparent: true, opacity: 0.9 });
  return {
    group: g,
    color: c,
    setLight: (t) => {
      const x = Math.max(0, Math.min(1.5, t));
      lensMat.emissiveIntensity = 0.05 + x * 2.2;
      glow.visible = x > 0.02;
      (glow.material as THREE.SpriteMaterial).opacity = Math.min(1, x * 0.9);
      glow.scale.setScalar(0.8 + x * 1.4);
    },
    setDead: (d) => {
      cyl.material = dome.material = rim.material = d ? deadMat : lensMat;
      if (d) glow.visible = false;
    },
    flip: (f) => {
      inner.rotation.y = f ? Math.PI : 0;
    },
  };
}

// -------------------------------------------------------------- battery
export interface BatteryObj {
  group: THREE.Group;
  /** Terminal tip positions (local). */
  plus: THREE.Vector3;
  minus: THREE.Vector3;
  /** Show voltage as pressure: gauge needle + colour ring. */
  setVoltage(v: number, vmax: number): void;
}

/** A big battery pack lying along X, + terminal at +X, with a pressure gauge on top. */
export function battery(label = 'BATTERY'): BatteryObj {
  const g = new THREE.Group();
  const L = 2.4;
  const R = 0.55;
  const y = R + 0.02;
  const shell = mesh(new THREE.CylinderGeometry(R, R, L, 32), std('#2c2f33', 0.45, 0.3), [0, y, 0], [0, 0, Math.PI / 2]);
  const band = mesh(new THREE.CylinderGeometry(R * 1.005, R * 1.005, L * 0.36, 32), std('#e8b021', 0.45, 0.2), [L * 0.28, y, 0], [0, 0, Math.PI / 2]);
  const cap = mesh(new THREE.CylinderGeometry(R * 0.32, R * 0.32, 0.12, 20), M.steel(), [L / 2 + 0.06, y, 0], [0, 0, Math.PI / 2]);
  const base = mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.04, 32), M.steel(), [-L / 2 - 0.02, y, 0], [0, 0, Math.PI / 2]);
  g.add(shell, band, cap, base);
  // Engraved +/- marks (small boxes).
  const markMat = std('#ffffff', 0.5);
  const plusH = mesh(new THREE.BoxGeometry(0.22, 0.03, 0.05), markMat, [L * 0.28, y + R, 0]);
  const plusV = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.22), markMat, [L * 0.28, y + R, 0]);
  const minus = mesh(new THREE.BoxGeometry(0.22, 0.03, 0.05), markMat, [-L * 0.3, y + R, 0]);
  g.add(plusH, plusV, minus);
  // Pressure gauge (dial) on a little post near the + end.
  const gauge = new THREE.Group();
  gauge.position.set(L * 0.05, y + R + 0.32, 0);
  const face = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 32), std('#f7f7f2', 0.4), [0, 0, 0], [Math.PI / 2, 0, 0]);
  const bezel = mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 32), M.steel(), [0, 0, 0.03]);
  const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), M.steel(), [0, -0.32, 0]);
  // Coloured arc: low (blue) → high (orange).
  const arcGroup = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 1.15 - (i / 11) * Math.PI * 1.3;
    const seg = mesh(new THREE.BoxGeometry(0.06, 0.03, 0.01), std(new THREE.Color().setHSL(0.6 - i * 0.05, 0.8, 0.5), 0.5), [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.035], [0, 0, a]);
    arcGroup.add(seg);
  }
  const needle = new THREE.Group();
  needle.add(mesh(new THREE.BoxGeometry(0.24, 0.025, 0.012), std('#c0281f', 0.4), [0.12, 0, 0]));
  needle.position.z = 0.045;
  const hub = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), M.steel(), [0, 0, 0.05], [Math.PI / 2, 0, 0]);
  gauge.add(face, bezel, post, arcGroup, needle, hub);
  g.add(gauge);
  void label;
  return {
    group: g,
    plus: new THREE.Vector3(L / 2 + 0.12, y, 0),
    minus: new THREE.Vector3(-L / 2 - 0.04, y, 0),
    setVoltage: (v, vmax) => {
      const f = Math.max(0, Math.min(1, v / vmax));
      needle.rotation.z = Math.PI * 1.15 - f * Math.PI * 1.3;
    },
  };
}

// ----------------------------------------------------------- breadboard
export interface BreadboardObj {
  group: THREE.Group;
  /** Local position of hole (col, row). Rows 0–4 = a–e, 5–9 = f–j; rails: 'top+','top-','bot+','bot-'. */
  hole(col: number, row: number | 'top+' | 'top-' | 'bot+' | 'bot-'): THREE.Vector3;
  pitch: number;
  cols: number;
}

export function breadboard(cols = 30, rails = true): BreadboardObj {
  const p = 0.254;
  const g = new THREE.Group();
  const W = cols * p + 0.6;
  const D = rails ? 5.5 : 3.5;
  const T = 0.85;
  const body = mesh(new THREE.BoxGeometry(W, T, D), M.boardWhite(), [0, -T / 2, 0]);
  g.add(body);
  const groove = mesh(new THREE.BoxGeometry(W - 0.2, 0.02, 0.28), std('#dedbd2', 0.8), [0, 0.001, 0]);
  g.add(groove);
  const x0 = -((cols - 1) * p) / 2;
  const rowZ = (r: number) => (r < 5 ? -0.4 - (4 - r) * p - 0.0 : 0.4 + (r - 5) * p);
  const railZ = { 'top-': -2.35, 'top+': -2.1, 'bot+': 2.1, 'bot-': 2.35 } as const;
  // Holes as an instanced mesh.
  const holeGeo = new THREE.BoxGeometry(0.1, 0.012, 0.1);
  const holeMat = std('#3a3c3e', 0.9);
  const positions: THREE.Vector3[] = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < 10; r++) positions.push(new THREE.Vector3(x0 + c * p, 0.002, rowZ(r)));
  for (let c = 0; c < cols && rails; c++) {
    if (c % 6 === 5) continue;
    for (const z of Object.values(railZ)) positions.push(new THREE.Vector3(x0 + c * p, 0.002, z));
  }
  const inst = new THREE.InstancedMesh(holeGeo, holeMat, positions.length);
  const mtx = new THREE.Matrix4();
  positions.forEach((pos, i) => inst.setMatrixAt(i, mtx.makeTranslation(pos.x, pos.y, pos.z)));
  g.add(inst);
  // Rail stripes.
  const red = std('#d23a32', 0.6);
  const blue = std('#2b62c4', 0.6);
  const stripe = (z: number, m: THREE.Material) => g.add(mesh(new THREE.BoxGeometry(W - 0.4, 0.004, 0.04), m, [0, 0.002, z]));
  if (rails) {
    stripe(-2.55, blue);
    stripe(-1.9, red);
    stripe(1.9, red);
    stripe(2.55, blue);
  }
  return {
    group: g,
    pitch: p,
    cols,
    hole: (c, r) => {
      const x = x0 + c * p;
      if (typeof r === 'number') return new THREE.Vector3(x, 0, rowZ(r));
      return new THREE.Vector3(x, 0, railZ[r]);
    },
  };
}

// ----------------------------------------------------------------- wire
/** Polyline with rounded corners, usable for tubes and particle paths. */
export function roundedPath(points: THREE.Vector3[], radius = 0.15, closed = false): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const pts = closed ? [...points, points[0], points[1]] : points;
  if (pts.length < 2) return path;
  let prev = pts[0].clone();
  if (closed) {
    // Start halfway along the first segment so the loop closes cleanly.
    prev = pts[0].clone().lerp(pts[1], 0.5);
  }
  const startIdx = 1;
  const endIdx = closed ? pts.length - 1 : pts.length - 1;
  for (let i = startIdx; i < endIdx; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ab = b.clone().sub(a);
    const bc = c.clone().sub(b);
    const r = Math.min(radius, ab.length() / 2, bc.length() / 2);
    const p1 = b.clone().sub(ab.normalize().multiplyScalar(r));
    const p2 = b.clone().add(bc.normalize().multiplyScalar(r));
    if (prev.distanceTo(p1) > 1e-5) path.add(new THREE.LineCurve3(prev.clone(), p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    prev = p2;
  }
  const last = closed ? pts[pts.length - 2].clone().lerp(pts[pts.length - 1], 0.5) : pts[pts.length - 1];
  if (prev.distanceTo(last) > 1e-5) path.add(new THREE.LineCurve3(prev.clone(), last.clone()));
  return path;
}

export interface WireObj {
  mesh: THREE.Mesh;
  path: THREE.CurvePath<THREE.Vector3>;
  setPoints(points: THREE.Vector3[]): void;
  setColor(c: WireColor): void;
  setGlow(t: number): void;
}

/** Insulated jumper wire along a polyline. */
export function wire(points: THREE.Vector3[], color: WireColor = 'red', radius = 0.045, corner = 0.15): WireObj {
  let path = roundedPath(points, corner);
  let m = wireMat(color).clone();
  const segs = () => Math.max(16, Math.round(path.getLength() * 12));
  const o = new THREE.Mesh(new THREE.TubeGeometry(path, segs(), radius, 8, false), m);
  return {
    mesh: o,
    get path() {
      return path;
    },
    setPoints: (pts) => {
      path = roundedPath(pts, corner);
      o.geometry.dispose();
      o.geometry = new THREE.TubeGeometry(path, segs(), radius, 8, false);
    },
    setColor: (c) => {
      m.color.copy(wireMat(c).color);
    },
    setGlow: (t) => setHeat(m, t),
  } as WireObj;
}

// ------------------------------------------------------------ capacitors
export interface CapObj {
  group: THREE.Group;
  /** Sub-parts for exploded views. */
  parts: THREE.Object3D[];
}

export function ceramicCap(): CapObj {
  const g = new THREE.Group();
  const y = 0.5;
  const disc = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 24), M.ceramic(), [0, y, 0], [Math.PI / 2, 0, 0]);
  const legs = new THREE.Group();
  legs.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, y + 0.1, 8), M.lead(), [-0.127, (y - 0.1) / 2, 0]));
  legs.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, y + 0.1, 8), M.lead(), [0.127, (y - 0.1) / 2, 0]));
  g.add(disc, legs);
  return { group: g, parts: [disc, legs] };
}

export interface ElectroObj extends CapObj {
  setPop(t: number): void;
  flip(f: boolean): void;
  can: THREE.Mesh;
}

/** Electrolytic can with a light stripe marking the negative (−) leg at +X. */
export function electrolyticCap(height = 0.9, radius = 0.32): ElectroObj {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const y0 = 0.12;
  const canMat = M.capBlue().clone();
  const can = mesh(new THREE.CylinderGeometry(radius, radius, height, 32), canMat, [0, y0 + height / 2, 0]);
  // Stripe: a thin partial cylinder on the − side.
  const stripe = mesh(new THREE.CylinderGeometry(radius * 1.01, radius * 1.01, height * 0.98, 16, 1, true, Math.PI / 2 - 0.45, 0.9), M.capStripe(), [0, y0 + height / 2, 0]);
  const top = mesh(new THREE.CylinderGeometry(radius * 0.98, radius * 0.98, 0.02, 32), M.steel(), [0, y0 + height + 0.01, 0]);
  // Scored "K" vent on top.
  const vent1 = mesh(new THREE.BoxGeometry(radius * 1.4, 0.022, 0.02), std('#6c7177', 0.5), [0, y0 + height + 0.012, 0], [0, Math.PI / 4, 0]);
  const vent2 = mesh(new THREE.BoxGeometry(radius * 1.4, 0.022, 0.02), std('#6c7177', 0.5), [0, y0 + height + 0.012, 0], [0, -Math.PI / 4, 0]);
  const minusMarks = new THREE.Group();
  for (let i = 0; i < 3; i++) minusMarks.add(mesh(new THREE.BoxGeometry(0.02, 0.01, 0.1), std('#2a4f8f', 0.5), [radius * 1.015, y0 + height * (0.3 + i * 0.2), 0], [0, 0, Math.PI / 2]));
  const legs = new THREE.Group();
  legs.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, y0 + 0.22, 8), M.lead(), [-0.127, (y0 - 0.12) / 2 + 0.01, 0]));
  legs.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, y0 + 0.12, 8), M.lead(), [0.127, (y0 - 0.12) / 2 + 0.05, 0]));
  inner.add(can, stripe, top, vent1, vent2, minusMarks, legs);
  return {
    group: g,
    can,
    parts: [top, can, legs],
    setPop: (t) => {
      // Bulge and burst the vent.
      const s = 1 + t * 0.12;
      can.scale.set(s, 1, s);
      vent1.position.y = vent2.position.y = y0 + height + 0.012 + t * 0.12;
      canMat.color.set(t > 0.5 ? '#3b3f49' : '#2a4f8f');
    },
    flip: (f) => {
      inner.rotation.y = f ? Math.PI : 0;
    },
  };
}

// ----------------------------------------------------------- semis
/** TO-220 power MOSFET standing up, legs G-D-S along X. */
export function mosfetTO220(): { group: THREE.Group; body: THREE.Mesh; bodyMat: THREE.MeshStandardMaterial; legs: THREE.Vector3[] } {
  const g = new THREE.Group();
  const bodyMat = M.plasticBlack().clone();
  const body = mesh(new THREE.BoxGeometry(1.0, 0.9, 0.45), bodyMat, [0, 1.05, 0]);
  const tab = mesh(new THREE.BoxGeometry(1.0, 0.65, 0.12), M.steel(), [0, 1.8, -0.17]);
  const hole = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 16), std('#1a1a1a', 0.8), [0, 1.85, -0.17], [Math.PI / 2, 0, 0]);
  g.add(body, tab, hole);
  const legs: THREE.Vector3[] = [];
  for (let i = -1; i <= 1; i++) {
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.04), M.tin(), [i * 0.254, 0.3, 0]));
    legs.push(new THREE.Vector3(i * 0.254, 0, 0));
  }
  return { group: g, body, bodyMat, legs };
}

/** SOT-23 (3 pins) SMD package. Size ≈ 2.9 × 1.3 mm → 0.29 × 0.13. */
export function sot23(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.29, 0.1, 0.13), M.plasticDark(), [0, 0.07, 0]));
  const lp = new THREE.BoxGeometry(0.045, 0.02, 0.07);
  g.add(mesh(lp, M.tin(), [-0.095, 0.02, 0.095]));
  g.add(mesh(lp, M.tin(), [0.095, 0.02, 0.095]));
  g.add(mesh(lp, M.tin(), [0, 0.02, -0.095]));
  return g;
}

/** Chip resistor / capacitor. Size in cm (0805 = 0.2 × 0.125). */
export function chipPassive(l = 0.2, w = 0.125, kind: 'R' | 'C' = 'R'): THREE.Group {
  const g = new THREE.Group();
  const t = kind === 'R' ? 0.05 : 0.08;
  g.add(mesh(new THREE.BoxGeometry(l * 0.7, t, w), kind === 'R' ? M.plasticDark() : M.smdTan(), [0, t / 2 + 0.005, 0]));
  const capG = new THREE.BoxGeometry(l * 0.16, t + 0.01, w + 0.004);
  g.add(mesh(capG, M.tin(), [-l / 2 + l * 0.08, t / 2 + 0.005, 0]));
  g.add(mesh(capG, M.tin(), [l / 2 - l * 0.08, t / 2 + 0.005, 0]));
  return g;
}

/** Small SMD LED (0805-ish) with a coloured lens. */
export function smdLed(color = '#ff3020'): { group: THREE.Group; lens: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const lens = std(color, 0.3, 0, { emissive: new THREE.Color(color), emissiveIntensity: 0.05, transparent: true, opacity: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.125), std('#f3f0e6', 0.6), [0, 0.03, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.035, 0.1), lens, [0, 0.07, 0]));
  return { group: g, lens };
}

/** Quad flat package microcontroller with pins on four sides. */
export function qfp(size = 1.0, pinsPerSide = 8): { group: THREE.Group; pins: THREE.Mesh[]; body: THREE.Mesh } {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(size, 0.14, size), M.plasticDark(), [0, 0.1, 0]);
  const dot = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), std('#444', 0.4), [-size / 2 + 0.12, 0.175, -size / 2 + 0.12]);
  g.add(body, dot);
  const pins: THREE.Mesh[] = [];
  const pitch = (size * 0.8) / (pinsPerSide - 1);
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < pinsPerSide; i++) {
      const o = -size * 0.4 + i * pitch;
      const pin = mesh(new THREE.BoxGeometry(0.2, 0.025, 0.045), M.tin().clone(), [0, 0.03, 0]);
      const r = (s * Math.PI) / 2;
      const d = size / 2 + 0.08;
      // side s: rotate around y
      const x = Math.cos(r) * d - Math.sin(r) * o;
      const z = Math.sin(r) * d + Math.cos(r) * o;
      pin.position.set(x, 0.03, z);
      pin.rotation.y = -r;
      g.add(pin);
      pins.push(pin);
    }
  }
  return { group: g, pins, body };
}

/** DIP-8 chip on legs (for breadboards). */
export function dip(pins = 8): { group: THREE.Group; legs: THREE.Vector3[] } {
  const g = new THREE.Group();
  const n = pins / 2;
  const L = n * 0.254 + 0.05;
  g.add(mesh(new THREE.BoxGeometry(L, 0.33, 0.64), M.plasticDark(), [0, 0.38, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12), std('#444', 0.5), [-L / 2 + 0.12, 0.55, 0], [0, 0, 0]));
  const legs: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    for (const z of [-0.381, 0.381]) {
      const x = -((n - 1) * 0.254) / 2 + i * 0.254;
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.36, 0.025), M.tin(), [x, 0.18, z]));
      legs.push(new THREE.Vector3(x, 0, z));
    }
  }
  return { group: g, legs };
}

// -------------------------------------------------------------- misc
export function button(): { group: THREE.Group; cap: THREE.Mesh; press(d: boolean): void } {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), M.plasticDark(), [0, 0.2, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.03, 0.62), M.steel(), [0, 0.385, 0]));
  const cap = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 20), std('#d9d4c6', 0.5), [0, 0.48, 0]);
  g.add(cap);
  for (const [x, z] of [[-0.25, -0.33], [0.25, -0.33], [-0.25, 0.33], [0.25, 0.33]]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.25, 0.03), M.tin(), [x, 0.02, z]));
  return { group: g, cap, press: (d) => (cap.position.y = d ? 0.42 : 0.48) };
}

export function motor(): { group: THREE.Group; shaft: THREE.Group } {
  const g = new THREE.Group();
  const can = mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 32), M.steel(), [0, 0.62, 0], [0, 0, Math.PI / 2]);
  const end = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 32), std('#2c2f33', 0.5), [-0.75, 0.62, 0], [0, 0, Math.PI / 2]);
  const shaft = new THREE.Group();
  shaft.position.set(0.7, 0.62, 0);
  shaft.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 12), M.steel(), [0.2, 0, 0], [0, 0, Math.PI / 2]));
  const fan = new THREE.Group();
  fan.position.x = 0.4;
  for (let i = 0; i < 3; i++) fan.add(mesh(new THREE.BoxGeometry(0.04, 0.6, 0.14), std('#e05a2a', 0.5), [0, 0.3, 0], [0, 0, 0]).translateY(0).rotateX((i * Math.PI * 2) / 3));
  shaft.add(fan);
  g.add(can, end, shaft);
  return { group: g, shaft };
}

export function bulb(): { group: THREE.Group; setLight(t: number): void; filament: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.35, 20), M.steel(), [0, 0.18, 0]);
  const glass = mesh(new THREE.SphereGeometry(0.42, 24, 16), M.glass(), [0, 0.68, 0]);
  const filMat = std('#5a4a3a', 0.5, 0, { emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0 });
  const fil = mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), filMat, [0, 0.66, 0]);
  const glow = glowSprite('#ffcf70', 1.8);
  glow.position.set(0, 0.68, 0);
  glow.visible = false;
  g.add(base, glass, fil, glow);
  return {
    group: g,
    filament: filMat,
    setLight: (t) => {
      filMat.emissiveIntensity = t * 4;
      glow.visible = t > 0.02;
      (glow.material as THREE.SpriteMaterial).opacity = Math.min(1, t);
      glow.scale.setScalar(0.8 + t * 1.6);
    },
  };
}

export function fuse(): { group: THREE.Group; setBlown(b: boolean): void } {
  const g = new THREE.Group();
  const y = 0.3;
  const tube = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 20), M.glass(), [0, y, 0], [0, 0, Math.PI / 2]);
  const capL = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 20), M.steel(), [-0.42, y, 0], [0, 0, Math.PI / 2]);
  const capR = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 20), M.steel(), [0.42, y, 0], [0, 0, Math.PI / 2]);
  const wireOk = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), M.tin(), [0, y, 0], [0, 0, Math.PI / 2]);
  const blackened = mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.5, 20), std('#2e2a26', 0.9, 0, { transparent: true, opacity: 0.7 }), [0, y, 0], [0, 0, Math.PI / 2]);
  blackened.visible = false;
  g.add(tube, capL, capR, wireOk, blackened);
  return {
    group: g,
    setBlown: (b) => {
      wireOk.visible = !b;
      blackened.visible = b;
    },
  };
}

/** A simple board (green PCB) with optional thickness. */
export function smallBoard(w: number, d: number, color = '#0f5e2f'): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, 0.16, d), std(color, 0.4), [0, -0.08, 0]);
}

/** Male header pin (for board-to-board wiring). */
export function headerPin(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), M.plasticBlack(), [0, 0.125, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), M.gold(), [0, 0.35, 0]));
  return g;
}

/** Floor shadow under the scene (cheap, soft). */
export function contactShadow(w: number, d: number, opacity = 0.18): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grd.addColorStop(0, `rgba(0,0,0,${opacity})`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.9;
  m.userData.noFrame = true;
  return m;
}

/** Small arrow (cone) for direction hints. */
export function arrow(color = '#e86f00', size = 0.2): THREE.Mesh {
  const m = mesh(new THREE.ConeGeometry(size * 0.5, size, 12), std(color, 0.4, 0, { emissive: new THREE.Color(color), emissiveIntensity: 0.4 }));
  return m;
}

export { mesh, std };
