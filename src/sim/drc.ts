// A small but real design-rule checker for 2-layer boards. Pure data, no 3D.
// Units: mm. Copper shapes: rectangular/round pads, trace segments (capsules), vias.

export interface PadD { id: string; net: string; x: number; y: number; w: number; h: number; round?: boolean; drill?: number }
export interface TraceD { id: string; net: string; pts: [number, number][]; width: number; layer?: 'top' | 'bottom' }
export interface ViaD { id: string; net: string; x: number; y: number; drill: number; ring: number }
export interface Design { pads: PadD[]; traces: TraceD[]; vias: ViaD[] }

export interface Rules {
  clearance: number; // min copper-to-copper gap between different nets
  minWidth: number; // min trace width
  minRing: number; // min annular ring (ring radius − drill radius)
}
export const DEFAULT_RULES: Rules = { clearance: 0.2, minWidth: 0.15, minRing: 0.13 };

export interface DrcError {
  kind: 'clearance' | 'short' | 'unrouted' | 'width' | 'ring';
  msg: string;
  x: number;
  y: number;
  a?: string;
  b?: string;
  gap?: number;
}

// ------------------------------------------------------------ geometry
type Shape =
  | { t: 'seg'; ax: number; ay: number; bx: number; by: number; r: number }
  | { t: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { t: 'circle'; x: number; y: number; r: number };

interface Item { id: string; net: string; shape: Shape; top: boolean; bottom: boolean }

function ptSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function segSeg(a: [number, number, number, number], b: [number, number, number, number]): number {
  const [ax, ay, bx, by] = a;
  const [cx, cy, dx, dy] = b;
  // Intersection test.
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  if (o(ax, ay, bx, by, cx, cy) !== o(ax, ay, bx, by, dx, dy) && o(cx, cy, dx, dy, ax, ay) !== o(cx, cy, dx, dy, bx, by)) return 0;
  return Math.min(ptSeg(ax, ay, cx, cy, dx, dy), ptSeg(bx, by, cx, cy, dx, dy), ptSeg(cx, cy, ax, ay, bx, by), ptSeg(dx, dy, ax, ay, bx, by));
}
function ptRect(px: number, py: number, r: { x0: number; y0: number; x1: number; y1: number }): number {
  const dx = Math.max(r.x0 - px, 0, px - r.x1);
  const dy = Math.max(r.y0 - py, 0, py - r.y1);
  return Math.hypot(dx, dy);
}
function rectEdges(r: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number][] {
  return [
    [r.x0, r.y0, r.x1, r.y0],
    [r.x1, r.y0, r.x1, r.y1],
    [r.x1, r.y1, r.x0, r.y1],
    [r.x0, r.y1, r.x0, r.y0],
  ];
}
/** Edge-to-edge distance between two copper shapes (negative or 0 = touching). */
export function gap(a: Shape, b: Shape): number {
  if (a.t === 'circle' && b.t === 'circle') return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  if (a.t === 'circle' && b.t === 'seg') return ptSeg(a.x, a.y, b.ax, b.ay, b.bx, b.by) - a.r - b.r;
  if (a.t === 'seg' && b.t === 'circle') return gap(b, a);
  if (a.t === 'circle' && b.t === 'rect') return ptRect(a.x, a.y, b) - a.r;
  if (a.t === 'rect' && b.t === 'circle') return gap(b, a);
  if (a.t === 'seg' && b.t === 'seg') return segSeg([a.ax, a.ay, a.bx, a.by], [b.ax, b.ay, b.bx, b.by]) - a.r - b.r;
  if (a.t === 'seg' && b.t === 'rect') {
    if (ptRect(a.ax, a.ay, b) === 0 || ptRect(a.bx, a.by, b) === 0) return -a.r;
    return Math.min(...rectEdges(b).map((e) => segSeg([a.ax, a.ay, a.bx, a.by], e))) - a.r;
  }
  if (a.t === 'rect' && b.t === 'seg') return gap(b, a);
  if (a.t === 'rect' && b.t === 'rect') {
    const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
    const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
    return Math.hypot(dx, dy);
  }
  return Infinity;
}

function items(d: Design): Item[] {
  const out: Item[] = [];
  for (const p of d.pads) {
    const shape: Shape = p.round ? { t: 'circle', x: p.x, y: p.y, r: p.w / 2 } : { t: 'rect', x0: p.x - p.w / 2, y0: p.y - p.h / 2, x1: p.x + p.w / 2, y1: p.y + p.h / 2 };
    out.push({ id: p.id, net: p.net, shape, top: true, bottom: !!p.drill });
  }
  for (const t of d.traces) {
    for (let i = 0; i < t.pts.length - 1; i++) {
      const bottom = t.layer === 'bottom';
      out.push({ id: `${t.id}#${i}`, net: t.net, shape: { t: 'seg', ax: t.pts[i][0], ay: t.pts[i][1], bx: t.pts[i + 1][0], by: t.pts[i + 1][1], r: t.width / 2 }, top: !bottom, bottom });
    }
  }
  for (const v of d.vias) out.push({ id: v.id, net: v.net, shape: { t: 'circle', x: v.x, y: v.y, r: v.ring / 2 }, top: true, bottom: true });
  return out;
}

const centre = (s: Shape): [number, number] => (s.t === 'circle' ? [s.x, s.y] : s.t === 'rect' ? [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2] : [(s.ax + s.bx) / 2, (s.ay + s.by) / 2]);
const owner = (id: string) => id.split('#')[0];

/**
 * Run the checks. `plane`: the bottom layer is a ground plane that connects every
 * GND through-hole and via (other bottom items are ignored for connectivity).
 */
export function runDrc(d: Design, rules: Rules = DEFAULT_RULES, plane = true): DrcError[] {
  const errs: DrcError[] = [];
  const it = items(d);
  // Clearance and shorts (top layer).
  const seen = new Set<string>();
  for (let i = 0; i < it.length; i++) {
    for (let j = i + 1; j < it.length; j++) {
      const A = it[i], B = it[j];
      if (A.net === B.net) continue;
      if (!(A.top && B.top)) continue;
      const g = gap(A.shape, B.shape);
      if (g < rules.clearance - 1e-9) {
        const key = [owner(A.id), owner(B.id)].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const [ax, ay] = centre(A.shape);
        const [bx, by] = centre(B.shape);
        errs.push(
          g <= 0
            ? { kind: 'short', msg: `Short: ${owner(A.id)} (${A.net}) touches ${owner(B.id)} (${B.net})`, x: (ax + bx) / 2, y: (ay + by) / 2, a: owner(A.id), b: owner(B.id), gap: g }
            : { kind: 'clearance', msg: `Clearance: ${owner(A.id)} (${A.net}) is ${g.toFixed(2)} mm from ${owner(B.id)} (${B.net}); the rule is ${rules.clearance} mm`, x: (ax + bx) / 2, y: (ay + by) / 2, a: owner(A.id), b: owner(B.id), gap: g },
        );
      }
    }
  }
  // Width and ring.
  for (const t of d.traces) if (t.width < rules.minWidth) errs.push({ kind: 'width', msg: `Trace ${t.id} is ${t.width} mm wide; the minimum is ${rules.minWidth} mm`, x: t.pts[0][0], y: t.pts[0][1] });
  for (const v of d.vias) if ((v.ring - v.drill) / 2 < rules.minRing) errs.push({ kind: 'ring', msg: `Via ${v.id} annular ring is too thin`, x: v.x, y: v.y });
  // Connectivity: union-find over touching same-net copper.
  const parent = it.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => (parent[find(a)] = find(b));
  for (let i = 0; i < it.length; i++) {
    for (let j = i + 1; j < it.length; j++) {
      if (it[i].net !== it[j].net) continue;
      const sameLayer = (it[i].top && it[j].top) || (it[i].bottom && it[j].bottom);
      if (sameLayer && gap(it[i].shape, it[j].shape) <= 1e-6) union(i, j);
    }
  }
  if (plane) {
    const gnd = it.map((x, i) => (x.net === 'GND' && x.bottom ? i : -1)).filter((i) => i >= 0);
    for (let k = 1; k < gnd.length; k++) union(gnd[0], gnd[k]);
  }
  const padIdx = new Map(d.pads.map((p) => [p.id, it.findIndex((x) => x.id === p.id)]));
  const byNet = new Map<string, PadD[]>();
  for (const p of d.pads) if (p.net !== 'NC') (byNet.get(p.net) ?? byNet.set(p.net, []).get(p.net)!).push(p);
  for (const [net, pads] of byNet) {
    if (pads.length < 2) continue;
    const root = find(padIdx.get(pads[0].id)!);
    for (const p of pads.slice(1)) {
      if (find(padIdx.get(p.id)!) !== root) {
        errs.push({ kind: 'unrouted', msg: `Unrouted: ${p.id} is not connected to ${pads[0].id} (net ${net})`, x: p.x, y: p.y, a: p.id, b: pads[0].id });
      }
    }
  }
  return errs;
}
