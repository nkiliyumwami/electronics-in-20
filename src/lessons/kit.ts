import * as THREE from 'three';
import { battery, breadboard, contactShadow, wire, type BreadboardObj, type BatteryObj, type WireColor, type WireObj } from '../three/lib';
import { pipe, pump, narrowing } from '../three/water';
import { Flow } from '../three/particles';
import type { SceneCtx } from './types';

// Shared building blocks for breadboard lessons.

export const FLOW_COLOR = '#ff9a1f';
export const WATER_FLOW = '#5fb4ff';

/** Raise a board point by y. */
export const up = (p: THREE.Vector3, y: number) => new THREE.Vector3(p.x, p.y + y, p.z);

/** Jumper wire points between two board holes, arching to height h. */
export function jumperPts(a: THREE.Vector3, b: THREE.Vector3, h = 0.5): THREE.Vector3[] {
  return [a.clone(), up(a, h), up(b, h), b.clone()];
}

/** Points for a wire from a battery terminal (pointing along ±X) to a board hole. */
export function batteryPts(tip: THREE.Vector3, dir: 1 | -1, hole: THREE.Vector3, h = 0.6): THREE.Vector3[] {
  const out = tip.clone().add(new THREE.Vector3(0.35 * dir, 0, 0));
  return [tip.clone(), out, new THREE.Vector3(out.x, hole.y + h, out.z), new THREE.Vector3(out.x, hole.y + h, hole.z), up(hole, h), hole.clone()];
}

export interface Bench {
  bb: BreadboardObj;
  bat: BatteryObj;
  batGroup: THREE.Group;
  /** Battery terminals in real-group space. */
  plus: THREE.Vector3;
  minus: THREE.Vector3;
}

/** Breadboard with a battery lying behind it. */
export function bench(ctx: SceneCtx, cols = 17, batteryZ = -2.9): Bench {
  const bb = breadboard(cols, cols > 20);
  ctx.stage.real.add(bb.group);
  ctx.stage.real.add(contactShadow(cols * 0.254 + 5, 9));
  const bat = battery();
  bat.group.position.set(0, -0.85, batteryZ);
  ctx.stage.real.add(bat.group);
  ctx.stage.part(bb.group, {
    name: 'Breadboard',
    job: 'A board for building circuits without solder. Holes in the same short column are connected underneath.',
    symbol: 'breadboard',
  });
  ctx.stage.part(bat.group, {
    name: 'Battery',
    job: 'Supplies the push (voltage). The gauge shows how hard it pushes, like a pump\'s pressure.',
    symbol: 'battery',
  });
  const plus = bat.plus.clone().add(bat.group.position);
  const minus = bat.minus.clone().add(bat.group.position);
  return { bb, bat, batGroup: bat.group, plus, minus };
}

export function addWire(ctx: SceneCtx, pts: THREE.Vector3[], color: WireColor, name = 'Wire'): WireObj {
  const w = wire(pts, color);
  ctx.stage.real.add(w.mesh);
  ctx.stage.part(w.mesh, { name, job: 'Carries current with almost no resistance. Everything along one wire sits at the same voltage.', symbol: 'wire' });
  return w;
}

/** A flow of particles along a list of points (polyline, closed loop). */
export function flowAlong(parent: THREE.Object3D, pts: THREE.Vector3[], color = FLOW_COLOR, opts: { closed?: boolean; spacing?: number; radius?: number } = {}) {
  const path = new THREE.CatmullRomCurve3(pts, opts.closed ?? true, 'catmullrom', 0.05);
  const f = new Flow(path, { color, spacing: opts.spacing ?? 0.32, radius: opts.radius ?? 0.05, closed: opts.closed ?? true });
  parent.add(f.mesh);
  return f;
}

/** Dense resample of a polyline so CatmullRom keeps sharp corners. */
export function dense(input: THREE.Vector3[], step = 0.12): THREE.Vector3[] {
  // Drop repeated points (zero-length segments upset the curve).
  const pts = input.filter((p, i) => i === 0 || p.distanceTo(input[i - 1]) > 1e-4);
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) pts.pop();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    for (let k = 0; k < n; k++) out.push(a.clone().lerp(b, k / n));
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

/**
 * Water twin of a simple loop: pump at the back, a narrowing at the front.
 * Returns parts plus the loop path for water particles.
 */
export function waterLoop(ctx: SceneCtx, w = 3.6, d = 3.6, y = 0.4) {
  const g = new THREE.Group();
  ctx.stage.water.add(g);
  g.add(contactShadow(w + 3, d + 3));
  const x0 = -w / 2, x1 = w / 2, zb = -d / 2, zf = d / 2;
  const corners = [new THREE.Vector3(x0, y, zf), new THREE.Vector3(x0, y, zb), new THREE.Vector3(x1, y, zb), new THREE.Vector3(x1, y, zf)];
  const p = pipe(corners, 0.13, true);
  g.add(p.mesh);
  const pm = pump();
  pm.group.position.set(0, y, zb);
  g.add(pm.group);
  const nar = narrowing(1.6, 0.13);
  nar.group.position.set(0, y, zf);
  g.add(nar.group);
  ctx.stage.part(pm.group, { name: 'Pump (= battery)', job: 'Creates pressure, which pushes water around the loop. Pressure is the water version of voltage.', symbol: 'pump' });
  ctx.stage.part(nar.group, { name: 'Narrow pipe (= resistor)', job: 'A narrow section resists the flow. The narrower it is, the less water gets through for the same pressure.', symbol: 'pipe' });
  ctx.stage.part(p.mesh, { name: 'Pipe (= wire)', job: 'Carries the flow with almost no resistance.', symbol: 'pipe' });
  // Flow loop: clockwise seen from above, matching the real circuit (+ terminal → right).
  const loop = dense([new THREE.Vector3(0, y, zb), new THREE.Vector3(x1, y, zb), new THREE.Vector3(x1, y, zf), new THREE.Vector3(x0, y, zf), new THREE.Vector3(x0, y, zb), new THREE.Vector3(-0.01, y, zb)]);
  const flow = flowAlong(g, loop, WATER_FLOW, { radius: 0.07 });
  return { group: g, pump: pm, narrowing: nar, flow, y, zf, zb, x0, x1 };
}
