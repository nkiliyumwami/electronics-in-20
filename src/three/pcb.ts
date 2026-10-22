import * as THREE from 'three';
import { M, mesh, std, chipPassive, sot23, smdLed, isShared, marking, smdCode } from './lib';
import { nightlightDesign, PLACEMENT, BOARD, type NightLightOpts } from '../content/nightlight';
import type { Design } from '../sim/drc';

// Printed circuit boards, built in real layers. Board coordinates are in mm,
// x to the right and y "down" the board (which maps to +z in 3D). 1 unit = 1 cm.
export const S = 0.1; // units per mm

// Visual layer thicknesses (units). Copper and mask are exaggerated so they show.
export const T = { core: 0.16, cu: 0.014, mask: 0.008, silk: 0.004 };
export type LayerName = 'silkTop' | 'maskTop' | 'cuTop' | 'core' | 'cuBot' | 'maskBot';
export const LAYER_INFO: Record<LayerName, { name: string; job: string; color: string }> = {
  silkTop: { name: 'Silkscreen (top)', job: 'White ink: part outlines, names and markings. Purely for people.', color: '#fbfbf7' },
  maskTop: { name: 'Solder mask (top)', job: 'The green coating. It protects the copper and stops solder from bridging; it has openings only over the pads.', color: '#0a4a23' },
  cuTop: { name: 'Top copper', job: 'Traces and pads on top, about 35 µm thick (1 oz). This is the wiring.', color: '#d98a46' },
  core: { name: 'FR-4 core (1.6 mm)', job: 'Stiff fibreglass and epoxy. It holds everything and insulates the two copper layers from each other.', color: '#cdbf86' },
  cuBot: { name: 'Bottom copper: ground plane', job: 'An (almost) unbroken sheet of copper connected to ground. Every signal\'s return current flows here, right under its trace.', color: '#d98a46' },
  maskBot: { name: 'Solder mask (bottom)', job: 'Protects the bottom copper.', color: '#0a4a23' },
};

const Y = {
  cuBot: T.mask,
  core: T.mask + T.cu,
  cuTop: T.mask + T.cu + T.core,
  maskTop: T.mask + T.cu + T.core + T.cu,
  silkTop: T.mask + T.cu + T.core + T.cu + T.mask,
};
export const TOP = Y.silkTop + T.silk; // top surface height (where parts sit)

export interface Pad {
  id: string; // e.g. "U1.8"
  net: string;
  x: number;
  y: number;
  w: number;
  h: number;
  round?: boolean;
  drill?: number; // through-hole when set
  mesh: THREE.Object3D;
}

export interface Trace {
  id: string;
  net: string;
  pts: [number, number][];
  width: number;
  layer: 'top' | 'bottom';
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  setWidth(mm: number): void;
}

export interface Via {
  id: string;
  net: string;
  x: number;
  y: number;
  group: THREE.Group;
  barrel: THREE.Mesh;
}

/** A 2-layer board. Add pads, traces and vias, then call finish(). */
export class PcbBoard {
  readonly group = new THREE.Group();
  readonly layers: Record<LayerName, THREE.Group>;
  readonly w: number;
  readonly h: number;
  pads: Pad[] = [];
  traces: Trace[] = [];
  vias: Via[] = [];
  private slots: { x: number; y: number; w: number; h: number }[] = [];
  private planeMesh: THREE.Mesh | null = null;
  private maskMesh: THREE.Mesh | null = null;
  private silkCanvas = document.createElement('canvas');
  private silkMesh: THREE.Mesh | null = null;
  silkDraw: ((g: CanvasRenderingContext2D, px: (mm: number) => number) => void) | null = null;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.layers = {
      silkTop: new THREE.Group(),
      maskTop: new THREE.Group(),
      cuTop: new THREE.Group(),
      core: new THREE.Group(),
      cuBot: new THREE.Group(),
      maskBot: new THREE.Group(),
    };
    for (const k of Object.keys(this.layers) as LayerName[]) {
      this.layers[k].name = k;
      this.group.add(this.layers[k]);
    }
    // Core and bottom mask are simple slabs.
    this.layers.core.add(mesh(new THREE.BoxGeometry(w * S, T.core, h * S), M.fr4(), [0, Y.core + T.core / 2, 0]));
    this.layers.maskBot.add(mesh(new THREE.BoxGeometry(w * S, T.mask, h * S), M.maskSolid(), [0, T.mask / 2, 0]));
  }

  /** Board mm → local 3D position at a given height. */
  at(x: number, y: number, height = TOP): THREE.Vector3 {
    return new THREE.Vector3((x - this.w / 2) * S, height, (y - this.h / 2) * S);
  }

  pad(id: string, net: string, x: number, y: number, w: number, h: number, opts: { round?: boolean; drill?: number } = {}): Pad {
    const g = new THREE.Group();
    const cuMat = M.copper().clone();
    const mk = (yy: number) => {
      const m = opts.round
        ? mesh(new THREE.CylinderGeometry((w * S) / 2, (w * S) / 2, T.cu + 0.002, 24), cuMat)
        : mesh(new THREE.BoxGeometry(w * S, T.cu + 0.002, h * S), cuMat);
      m.position.copy(this.at(x, y, yy + T.cu / 2));
      return m;
    };
    g.add(mk(Y.cuTop));
    if (opts.drill) {
      // Through-hole: pad on both layers, plated barrel, dark hole.
      const bot = mk(Y.cuBot);
      this.layers.cuBot.add(bot);
      const barrel = mesh(new THREE.CylinderGeometry((opts.drill * S) / 2 + 0.004, (opts.drill * S) / 2 + 0.004, T.core + 2 * T.cu, 16, 1, true), cuMat);
      barrel.position.copy(this.at(x, y, Y.cuBot + (T.core + 2 * T.cu) / 2));
      this.layers.core.add(barrel);
      const hole = mesh(new THREE.CylinderGeometry((opts.drill * S) / 2, (opts.drill * S) / 2, T.core + 2 * T.cu + 0.01, 16), std('#151515', 0.9));
      hole.position.copy(barrel.position);
      g.add(hole);
    }
    this.layers.cuTop.add(g);
    const p: Pad = { id, net, x, y, w, h, round: opts.round, drill: opts.drill, mesh: g };
    this.pads.push(p);
    return p;
  }

  trace(id: string, net: string, pts: [number, number][], width: number, layer: 'top' | 'bottom' = 'top'): Trace {
    const g = new THREE.Group();
    const material = M.copper().clone();
    const yy = (layer === 'top' ? Y.cuTop : Y.cuBot) + T.cu / 2;
    const build = (wmm: number) => {
      for (const c of [...g.children]) {
        g.remove(c);
        (c as THREE.Mesh).geometry.dispose();
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = this.at(pts[i][0], pts[i][1], yy);
        const b = this.at(pts[i + 1][0], pts[i + 1][1], yy);
        const len = a.distanceTo(b);
        const seg = mesh(new THREE.BoxGeometry(len, T.cu, wmm * S), material);
        seg.position.copy(a).lerp(b, 0.5);
        seg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        g.add(seg);
      }
      for (const p of pts) {
        const j = mesh(new THREE.CylinderGeometry((wmm * S) / 2, (wmm * S) / 2, T.cu, 16), material);
        j.position.copy(this.at(p[0], p[1], yy));
        g.add(j);
      }
    };
    build(width);
    (layer === 'top' ? this.layers.cuTop : this.layers.cuBot).add(g);
    const t: Trace = {
      id, net, pts, width, layer, group: g, material,
      setWidth: (mm) => {
        t.width = mm;
        build(mm);
      },
    };
    this.traces.push(t);
    return t;
  }

  via(id: string, net: string, x: number, y: number, drill = 0.3, ring = 0.6): Via {
    const g = new THREE.Group();
    const cu = M.copper().clone();
    const rTop = mesh(new THREE.CylinderGeometry((ring * S) / 2, (ring * S) / 2, T.cu + 0.002, 20), cu);
    rTop.position.copy(this.at(x, y, Y.cuTop + T.cu / 2));
    const rBot = mesh(new THREE.CylinderGeometry((ring * S) / 2, (ring * S) / 2, T.cu + 0.002, 20), cu);
    rBot.position.copy(this.at(x, y, Y.cuBot + T.cu / 2));
    const barrel = mesh(new THREE.CylinderGeometry((drill * S) / 2 + 0.003, (drill * S) / 2 + 0.003, T.core + 2 * T.cu, 16, 1, true), cu);
    barrel.position.copy(this.at(x, y, Y.cuBot + (T.core + 2 * T.cu) / 2));
    this.layers.cuTop.add(rTop);
    this.layers.cuBot.add(rBot);
    this.layers.core.add(barrel);
    const v: Via = { id, net, x, y, group: g, barrel };
    (barrel.userData as { via?: Via }).via = v;
    (rTop.userData as { via?: Via }).via = v;
    this.vias.push(v);
    return v;
  }

  /** Cut (or remove, with null) a slot in the ground plane. */
  setSlots(slots: { x: number; y: number; w: number; h: number }[]) {
    this.slots = slots;
    this.buildPlane();
  }

  private buildPlane() {
    const m = 0.5; // pull back from the board edge
    const sh = new THREE.Shape();
    const X = (x: number) => (x - this.w / 2) * S;
    const Z = (y: number) => (y - this.h / 2) * S;
    sh.moveTo(X(m), Z(m));
    sh.lineTo(X(this.w - m), Z(m));
    sh.lineTo(X(this.w - m), Z(this.h - m));
    sh.lineTo(X(m), Z(this.h - m));
    sh.lineTo(X(m), Z(m));
    // Antipads: clear the plane around through-holes and vias that are not ground.
    const holes: { x: number; y: number; r: number }[] = [];
    for (const p of this.pads) if (p.drill && p.net !== 'GND') holes.push({ x: p.x, y: p.y, r: Math.max(p.w, p.h) / 2 + 0.4 });
    for (const v of this.vias) if (v.net !== 'GND') holes.push({ x: v.x, y: v.y, r: 0.6 });
    for (const hh of holes) {
      const p = new THREE.Path();
      p.absarc(X(hh.x), Z(hh.y), hh.r * S, 0, Math.PI * 2, true);
      sh.holes.push(p);
    }
    for (const s of this.slots) {
      const p = new THREE.Path();
      p.moveTo(X(s.x), Z(s.y));
      p.lineTo(X(s.x), Z(s.y + s.h));
      p.lineTo(X(s.x + s.w), Z(s.y + s.h));
      p.lineTo(X(s.x + s.w), Z(s.y));
      p.lineTo(X(s.x), Z(s.y));
      sh.holes.push(p);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: T.cu, bevelEnabled: false, curveSegments: 12 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, Y.cuBot + T.cu, 0);
    if (this.planeMesh) {
      this.planeMesh.geometry.dispose();
      this.planeMesh.geometry = geo;
    } else {
      this.planeMesh = new THREE.Mesh(geo, M.copper().clone());
      this.layers.cuBot.add(this.planeMesh);
    }
  }

  get plane(): THREE.Mesh {
    return this.planeMesh!;
  }

  /** Build the plane, mask (with pad openings) and silkscreen. Call after adding pads. */
  finish() {
    this.buildPlane();
    // Top mask with openings over pads.
    const sh = new THREE.Shape();
    const X = (x: number) => (x - this.w / 2) * S;
    const Z = (y: number) => (y - this.h / 2) * S;
    sh.moveTo(X(0), Z(0));
    sh.lineTo(X(this.w), Z(0));
    sh.lineTo(X(this.w), Z(this.h));
    sh.lineTo(X(0), Z(this.h));
    sh.lineTo(X(0), Z(0));
    const e = 0.1; // mask expansion around pads
    for (const p of this.pads) {
      const path = new THREE.Path();
      if (p.round) path.absarc(X(p.x), Z(p.y), (p.w / 2 + e) * S, 0, Math.PI * 2, true);
      else {
        const x0 = X(p.x - p.w / 2 - e), x1 = X(p.x + p.w / 2 + e), z0 = Z(p.y - p.h / 2 - e), z1 = Z(p.y + p.h / 2 + e);
        path.moveTo(x0, z0);
        path.lineTo(x0, z1);
        path.lineTo(x1, z1);
        path.lineTo(x1, z0);
        path.lineTo(x0, z0);
      }
      sh.holes.push(path);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: T.mask, bevelEnabled: false, curveSegments: 16 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, Y.maskTop + T.mask, 0);
    this.maskMesh = new THREE.Mesh(geo, M.mask());
    this.layers.maskTop.add(this.maskMesh);
    // Silkscreen: a transparent canvas texture.
    const ppm = 24; // pixels per mm
    this.silkCanvas.width = Math.round(this.w * ppm);
    this.silkCanvas.height = Math.round(this.h * ppm);
    const g = this.silkCanvas.getContext('2d')!;
    g.clearRect(0, 0, this.silkCanvas.width, this.silkCanvas.height);
    g.strokeStyle = '#fbfbf7';
    g.fillStyle = '#fbfbf7';
    g.lineWidth = 0.15 * ppm;
    this.silkDraw?.(g, (mm) => mm * ppm);
    const tex = new THREE.CanvasTexture(this.silkCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.silkMesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w * S, this.h * S), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, depthWrite: false }));
    this.silkMesh.rotation.x = -Math.PI / 2;
    this.silkMesh.position.y = Y.silkTop + T.silk / 2;
    this.layers.silkTop.add(this.silkMesh);
  }

  /** Items for the exploded-view controller: each layer moves up/down. */
  explodeItems(gap = 0.6) {
    const order: LayerName[] = ['maskBot', 'cuBot', 'core', 'cuTop', 'maskTop', 'silkTop'];
    return order.map((k, i) => ({ obj: this.layers[k], offset: new THREE.Vector3(0, (i - 2) * gap, 0) }));
  }
}

// --------------------------------------------------------- part models
const body = (w: number, h: number, d: number, color = '#1d1f21') => mesh(new THREE.BoxGeometry(w * S, h * S, d * S), std(color, 0.5));

export function soic8(mark: string[] = ['ATTINY85', '20SU 2541']): THREE.Group {
  const g = new THREE.Group();
  const b = body(4.9, 1.5, 3.9);
  b.position.y = (1.5 * S) / 2 + 0.01;
  g.add(b);
  const t = marking(4.0 * S, 2.6 * S, mark);
  t.position.y = 1.5 * S + 0.011;
  g.add(t);
  const dot = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.005, 12), std('#555', 0.5), [-1.8 * S, 1.5 * S + 0.012, -1.3 * S]);
  g.add(dot);
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const lead = mesh(new THREE.BoxGeometry(0.45 * S, 0.2 * S, 1.2 * S), M.tin(), [(-1.905 + i * 1.27) * S, 0.012, side * 2.6 * S]);
      g.add(lead);
    }
  }
  return g;
}

/** JST-style 2-pin through-hole connector, pins along y (board), pitch in mm. */
export function jst2(pitch = 2.0, color = '#f4f1e6'): THREE.Group {
  const g = new THREE.Group();
  const w = pitch + 3.9;
  const housing = body(4.5, 6, w, color);
  housing.position.set(-0.6 * S, (6 * S) / 2, 0);
  g.add(housing);
  for (const z of [-pitch / 2, pitch / 2]) g.add(mesh(new THREE.BoxGeometry(0.5 * S, 3.5 * S, 0.5 * S), M.gold(), [0, -0.6 * S, z * S]));
  return g;
}

export function tactSmd(): { group: THREE.Group; press(d: boolean): void } {
  const g = new THREE.Group();
  const b = body(6, 2.5, 6, '#2a2c2f');
  b.position.y = (2.5 * S) / 2;
  g.add(b);
  g.add(mesh(new THREE.BoxGeometry(6.1 * S, 0.3 * S, 6.1 * S), M.steel(), [0, 2.6 * S, 0]));
  const cap = mesh(new THREE.CylinderGeometry(1.75 * S, 1.75 * S, 1.6 * S, 20), std('#dcd6c6', 0.5), [0, 3.4 * S, 0]);
  g.add(cap);
  for (const [x, z] of [[-3.6, -2.25], [3.6, -2.25], [-3.6, 2.25], [3.6, 2.25]]) g.add(mesh(new THREE.BoxGeometry(1.2 * S, 0.3 * S, 0.7 * S), M.tin(), [x * S, 0.15 * S, z * S]));
  return { group: g, press: (d) => (cap.position.y = (d ? 3.0 : 3.4) * S) };
}

// --------------------------------------------------------- night-light board
export { STRIP_AMPS } from '../content/nightlight';
export interface NightLightBuildOpts extends NightLightOpts {
  c1Offset?: boolean; // DRC demo: C1 not on its pads
  withParts?: boolean; // place 3D parts (default true)
}

export interface NightLight {
  board: PcbBoard;
  design: Design;
  parts: Record<string, THREE.Object3D>;
  power: Trace[];
  traces: Record<string, Trace>;
  vias: Record<string, Via>;
  /** Nets and their pins, for ratsnest lines. */
  nets: Record<string, string[]>;
  pad(id: string): Pad;
  button: { press(d: boolean): void };
  led: THREE.MeshStandardMaterial;
}

/** The capstone "night-light" board, 50 × 30 mm, built from its design data. */
export function nightLight(o: NightLightBuildOpts = {}): NightLight {
  const design = nightlightDesign(o);
  const b = new PcbBoard(BOARD.w, BOARD.h);
  for (const p of design.pads) b.pad(p.id, p.net, p.x, p.y, p.w, p.h, { round: p.round, drill: p.drill });
  const traces: Record<string, Trace> = {};
  for (const t of design.traces) traces[t.id] = b.trace(t.id, t.net, t.pts, t.width);
  const vias: Record<string, Via> = {};
  for (const v of design.vias) vias[v.id.replace('V_', '')] = b.via(v.id, v.net, v.x, v.y, v.drill, v.ring);
  b.silkDraw = (g, px) => {
    const rect = (x: number, y: number, w: number, h: number) => g.strokeRect(px(x), px(y), px(w), px(h));
    const text = (t: string, x: number, y: number, size = 1.3) => {
      g.font = `bold ${px(size)}px system-ui, sans-serif`;
      g.fillText(t, px(x), px(y));
    };
    rect(1, 3.5, 6, 7);
    text('J1', 1.2, 12.5);
    text('+', 6.2, 6.5, 1.2);
    rect(43, 3.5, 6, 7.5);
    text('J2 STRIP', 40.5, 13.3, 1.1);
    rect(16.5, 15, 7, 6);
    text('U1', 18.6, 14.4);
    g.beginPath();
    g.arc(px(17.6), px(15.6), px(0.3), 0, Math.PI * 2);
    g.fill();
    text('C1', 24.4, 12.8, 1.1);
    if (!o.noR1) text('R1', 9.5, 13.5, 1.1);
    rect(6, 18.6, 8, 7);
    text('SW1', 7.3, 27.5);
    text('R2', 27.2, 20.2, 1.1);
    text('D1', 32.3, 20.2, 1.1);
    text('Q1', 37.6, 12, 1.1);
    text('NIGHT-LIGHT v1', 28, 28, 1.4);
  };
  b.finish();

  // 3D parts.
  const parts: Record<string, THREE.Object3D> = {};
  const place = (ref: string, obj: THREE.Object3D, x: number, y: number, rotY = 0) => {
    obj.position.copy(b.at(x, y));
    obj.rotation.y = rotY;
    b.group.add(obj);
    parts[ref] = obj;
    obj.userData.ref = ref;
  };
  let led: THREE.MeshStandardMaterial = std('#ff3020', 0.3);
  let button = { press: (_: boolean) => {} };
  const at = (ref: string) => [PLACEMENT[ref].x, PLACEMENT[ref].y, PLACEMENT[ref].rot] as const;
  if (o.withParts !== false) {
    place('J1', jst2(2.0), ...at('J1'));
    place('J2', jst2(2.5, '#f2efe4'), ...at('J2'));
    place('U1', soic8(), ...at('U1'));
    const c1 = chipPassive(0.2, 0.125, 'C');
    place('C1', c1, ...at('C1'));
    if (o.c1Offset) {
      c1.position.add(new THREE.Vector3(0.12, 0, 0.1));
      c1.rotation.y = 0.5;
    }
    if (!o.noR1) place('R1', chipPassive(0.2, 0.125, 'R', smdCode(10000)), ...at('R1'));
    const sw = tactSmd();
    place('SW1', sw.group, ...at('SW1'));
    button = sw;
    place('R2', chipPassive(0.2, 0.125, 'R', smdCode(220)), ...at('R2'));
    const d1 = smdLed('#ff3020');
    place('D1', d1.group, ...at('D1'));
    led = d1.lens;
    place('Q1', sot23('A09T'), ...at('Q1'));
  }

  const nets: Record<string, string[]> = {};
  for (const p of b.pads) (nets[p.net] ??= []).push(p.id);
  return {
    board: b,
    design,
    parts,
    power: [traces.P5V, traces.PDRAIN].filter(Boolean),
    traces,
    vias,
    nets,
    pad: (id) => b.pads.find((p) => p.id === id)!,
    button,
    led,
  };
}

export const PART_INFO: Record<string, { name: string; job: string; symbol: 'connector' | 'chip' | 'capacitor' | 'resistor' | 'button' | 'led' | 'mosfet' }> = {
  J1: { name: 'J1 battery connector', job: 'Brings 5 V in from the battery pack.', symbol: 'connector' },
  J2: { name: 'J2 LED strip connector', job: 'Feeds the 3 A LED strip. Its traces must be wide.', symbol: 'connector' },
  U1: { name: 'U1 microcontroller (SOIC-8)', job: 'Reads the button and switches the strip through Q1.', symbol: 'chip' },
  C1: { name: 'C1 100 nF decoupling capacitor', job: 'The local tank right at U1\'s power pin.', symbol: 'capacitor' },
  R1: { name: 'R1 10 kΩ pull-up', job: 'Holds the button input HIGH until pressed.', symbol: 'resistor' },
  R2: { name: 'R2 220 Ω', job: 'Sets the indicator LED current.', symbol: 'resistor' },
  D1: { name: 'D1 indicator LED', job: 'Shows the night-light is on.', symbol: 'led' },
  SW1: { name: 'SW1 button', job: 'Toggles the light. Pressing it pulls U1\'s input to ground.', symbol: 'button' },
  Q1: { name: 'Q1 MOSFET (SOT-23)', job: 'Switches the 3 A strip, driven fully on or off by U1.', symbol: 'mosfet' },
};

/** Dispose helper for boards created outside a stage. */
export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | undefined;
    if (mat && !isShared(mat)) mat.dispose();
  });
}
