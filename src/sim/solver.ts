// A tiny DC / transient circuit solver using modified nodal analysis.
//
// Supported parts:
//   R        resistor
//   V        ideal voltage source (optionally with series resistance)
//   I        ideal current source
//   SUPPLY   bench supply: constant voltage until the current limit, then constant current
//   D        diode / LED, piecewise linear: off (open) or on (Vf + series R)
//   SW       switch (closed ≈ 1 mΩ, open = open)
//   M        N-channel MOSFET used as a switch; resistance depends on gate–source voltage
//   C        capacitor (open in DC; backward-Euler companion model in transient)
//   L        inductor  (short in DC; backward-Euler companion model in transient)
//
// The node named 'gnd' is the 0 V reference. Every node also gets a 1 GΩ leak to
// ground, so floating sections still solve (they just sit near 0 V).

export type Elem =
  | { kind: 'R'; id: string; a: string; b: string; r: number }
  | { kind: 'V'; id: string; p: string; n: string; v: number; rs?: number }
  | { kind: 'I'; id: string; p: string; n: string; i: number }
  | { kind: 'SUPPLY'; id: string; p: string; n: string; v: number; ilim: number }
  | { kind: 'D'; id: string; a: string; k: string; vf: number; rs: number }
  | { kind: 'SW'; id: string; a: string; b: string; closed: boolean }
  | { kind: 'M'; id: string; d: string; g: string; s: string; vth: number; ron: number }
  | { kind: 'C'; id: string; a: string; b: string; c: number }
  | { kind: 'L'; id: string; a: string; b: string; l: number };

export interface Solution {
  /** Node voltage relative to gnd. Unknown nodes read 0. */
  v(node: string): number;
  /** Voltage between two nodes: v(a) - v(b). */
  vab(a: string, b: string): number;
  /**
   * Current through a part, in its natural direction:
   * R/SW/C/L a→b, D a→k, M d→s, V/SUPPLY/I delivered out of p into the circuit.
   */
  i(id: string): number;
  /** Power dissipated in a part (sources report power delivered). */
  p(id: string): number;
  /** Diode / LED conducting? Supply in current limit? */
  on(id: string): boolean;
  ok: boolean;
}

const G_LEAK = 1e-9;
const R_OPEN = 1e12;
const R_SW = 1e-3;
const R_L_DC = 1e-4;

/** MOSFET channel resistance for a given gate–source voltage. */
export function mosfetR(vgs: number, vth: number, ron: number): number {
  if (vgs <= vth) return R_OPEN;
  // Full enhancement about 1.3 V above threshold. In between, resistance falls
  // smoothly (exponentially) from very high to ron: the "half-on" region.
  const full = vth + 1.3;
  if (vgs >= full) return ron;
  const t = (vgs - vth) / (full - vth); // 0..1
  const hi = 1e4;
  return hi * Math.pow(ron / hi, t);
}

interface TransientState {
  vc: Map<string, number>; // capacitor voltages a-b
  il: Map<string, number>; // inductor currents a→b
}

export class Circuit {
  elems: Elem[];
  state: TransientState = { vc: new Map(), il: new Map() };
  private diodeOn = new Map<string, boolean>();
  private supplyCC = new Map<string, boolean>();
  private mosR = new Map<string, number>();

  constructor(elems: Elem[] = []) {
    this.elems = elems;
  }

  /** DC operating point (caps open, inductors shorted). */
  dc(): Solution {
    return this.solveWith(null);
  }

  /** Advance the transient simulation by dt seconds and return the new state. */
  step(dt: number): Solution {
    const sol = this.solveWith(dt);
    for (const e of this.elems) {
      if (e.kind === 'C') this.state.vc.set(e.id, sol.vab(e.a, e.b));
      if (e.kind === 'L') this.state.il.set(e.id, sol.i(e.id));
    }
    return sol;
  }

  private solveWith(dt: number | null): Solution {
    let last: Solution | null = null;
    // Iterate piecewise models until diode / supply / MOSFET states settle.
    for (let iter = 0; iter < 40; iter++) {
      const sol = this.linearSolve(dt);
      last = sol;
      let changed = false;
      for (const e of this.elems) {
        if (e.kind === 'D') {
          const on = this.diodeOn.get(e.id) ?? false;
          if (on && sol.i(e.id) < -1e-9) { this.diodeOn.set(e.id, false); changed = true; }
          else if (!on && sol.vab(e.a, e.k) > e.vf + 1e-6) { this.diodeOn.set(e.id, true); changed = true; }
        } else if (e.kind === 'SUPPLY') {
          const cc = this.supplyCC.get(e.id) ?? false;
          const out = sol.i(e.id);
          const vout = sol.vab(e.p, e.n);
          if (!cc && out > e.ilim * 1.0001) { this.supplyCC.set(e.id, true); changed = true; }
          else if (cc && vout > e.v + 1e-6) { this.supplyCC.set(e.id, false); changed = true; }
        } else if (e.kind === 'M') {
          const vgs = sol.vab(e.g, e.s);
          const r = mosfetR(vgs, e.vth, e.ron);
          const old = this.mosR.get(e.id) ?? R_OPEN;
          if (Math.abs(Math.log(r) - Math.log(old)) > 1e-3) { this.mosR.set(e.id, r); changed = true; }
        }
      }
      if (!changed) break;
    }
    return last!;
  }

  private linearSolve(dt: number | null): Solution {
    // Collect nodes.
    const nodes = new Map<string, number>();
    const node = (n: string) => {
      if (n === 'gnd') return -1;
      let k = nodes.get(n);
      if (k === undefined) { k = nodes.size; nodes.set(n, k); }
      return k;
    };
    for (const e of this.elems) {
      if ('a' in e) node(e.a);
      if ('b' in e) node(e.b);
      if ('p' in e) node(e.p);
      if ('n' in e) node(e.n);
      if ('k' in e) node(e.k);
      if ('d' in e) { node(e.d); node(e.g); node(e.s); }
    }
    // Branch currents for voltage-type elements.
    const branches = new Map<string, number>();
    for (const e of this.elems) {
      if (e.kind === 'V') branches.set(e.id, 0);
      if (e.kind === 'SUPPLY' && !this.supplyCC.get(e.id)) branches.set(e.id, 0);
      if (e.kind === 'D' && this.diodeOn.get(e.id)) branches.set(e.id, 0);
    }
    let bi = nodes.size;
    for (const id of branches.keys()) branches.set(id, bi++);
    const n = bi;
    const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const z: number[] = new Array(n).fill(0);

    const stampG = (a: number, b: number, g: number) => {
      if (a >= 0) A[a][a] += g;
      if (b >= 0) A[b][b] += g;
      if (a >= 0 && b >= 0) { A[a][b] -= g; A[b][a] -= g; }
    };
    // Current i flowing from a to b through the element (leaves a, enters b).
    const stampI = (a: number, b: number, i: number) => {
      if (a >= 0) z[a] -= i;
      if (b >= 0) z[b] += i;
    };
    const stampV = (p: number, nn: number, k: number, v: number, rs = 0) => {
      // Branch current k flows from p through the source to n (MNA convention).
      if (p >= 0) { A[p][k] += 1; A[k][p] += 1; }
      if (nn >= 0) { A[nn][k] -= 1; A[k][nn] -= 1; }
      A[k][k] -= rs;
      z[k] += v;
    };

    for (let i = 0; i < nodes.size; i++) A[i][i] += G_LEAK;

    for (const e of this.elems) {
      switch (e.kind) {
        case 'R': stampG(node(e.a), node(e.b), 1 / Math.max(e.r, 1e-6)); break;
        case 'SW': stampG(node(e.a), node(e.b), 1 / (e.closed ? R_SW : R_OPEN)); break;
        case 'V': stampV(node(e.p), node(e.n), branches.get(e.id)!, e.v, e.rs ?? 0); break;
        case 'I': stampI(node(e.n), node(e.p), e.i); break; // pushes i out of p
        case 'SUPPLY':
          if (this.supplyCC.get(e.id)) stampI(node(e.n), node(e.p), e.ilim);
          else stampV(node(e.p), node(e.n), branches.get(e.id)!, e.v);
          break;
        case 'D':
          if (this.diodeOn.get(e.id)) {
            // On: V(a) - V(k) = vf + rs·I. The MNA branch current runs p→n through the
            // element, which here is exactly the a→k diode current.
            stampV(node(e.a), node(e.k), branches.get(e.id)!, e.vf, e.rs);
          } else {
            stampG(node(e.a), node(e.k), 1 / R_OPEN);
          }
          break;
        case 'M': {
          const r = this.mosR.get(e.id) ?? R_OPEN;
          stampG(node(e.d), node(e.s), 1 / r);
          stampG(node(e.g), node(e.s), 1 / R_OPEN);
          break;
        }
        case 'C': {
          if (dt === null) { stampG(node(e.a), node(e.b), 1 / R_OPEN); break; }
          const g = e.c / dt;
          const v0 = this.state.vc.get(e.id) ?? 0;
          stampG(node(e.a), node(e.b), g);
          // Companion source: current g·v0 flowing b→a (keeps the old voltage).
          stampI(node(e.b), node(e.a), g * v0);
          break;
        }
        case 'L': {
          if (dt === null) { stampG(node(e.a), node(e.b), 1 / R_L_DC); break; }
          const g = dt / e.l;
          const i0 = this.state.il.get(e.id) ?? 0;
          stampG(node(e.a), node(e.b), g);
          stampI(node(e.a), node(e.b), i0);
          break;
        }
      }
    }

    const x = gaussSolve(A, z);
    const ok = x !== null;
    const X = x ?? new Array(n).fill(0);
    const v = (name: string) => {
      if (name === 'gnd') return 0;
      const k = nodes.get(name);
      return k === undefined ? 0 : X[k];
    };
    const byId = new Map(this.elems.map((e) => [e.id, e]));
    const self = this;
    const current = (id: string): number => {
      const e = byId.get(id);
      if (!e) return 0;
      switch (e.kind) {
        case 'R': return (v(e.a) - v(e.b)) / Math.max(e.r, 1e-6);
        case 'SW': return (v(e.a) - v(e.b)) / (e.closed ? R_SW : R_OPEN);
        case 'V': return -X[branches.get(id)!];
        case 'I': return e.i;
        case 'SUPPLY':
          return self.supplyCC.get(id) ? e.ilim : -X[branches.get(id)!];
        case 'D':
          return self.diodeOn.get(id) ? X[branches.get(id)!] : (v(e.a) - v(e.k)) / R_OPEN;
        case 'M': return (v(e.d) - v(e.s)) / (self.mosR.get(id) ?? R_OPEN);
        case 'C': {
          if (dt === null) return 0;
          const v0 = self.state.vc.get(id) ?? 0;
          return (e.c / dt) * (v(e.a) - v(e.b) - v0);
        }
        case 'L': {
          if (dt === null) return (v(e.a) - v(e.b)) / R_L_DC;
          const i0 = self.state.il.get(id) ?? 0;
          return i0 + (dt / e.l) * (v(e.a) - v(e.b));
        }
      }
    };
    return {
      ok,
      v,
      vab: (a, b) => v(a) - v(b),
      i: current,
      p: (id) => {
        const e = byId.get(id);
        if (!e) return 0;
        const i = current(id);
        switch (e.kind) {
          case 'V': case 'I': case 'SUPPLY': return (v(e.p) - v(e.n)) * i;
          case 'D': return (v(e.a) - v(e.k)) * i;
          case 'M': return (v(e.d) - v(e.s)) * i;
          default: return (v(e.a) - v(e.b)) * i;
        }
      },
      on: (id) => self.diodeOn.get(id) ?? self.supplyCC.get(id) ?? false,
    };
  }
}

function gaussSolve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let best = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[best][c])) best = r;
    if (Math.abs(M[best][c]) < 1e-300) return null;
    [M[c], M[best]] = [M[best], M[c]];
    const piv = M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Convenience: solve a DC circuit once. */
export function solveDC(elems: Elem[]): Solution {
  return new Circuit(elems).dc();
}
