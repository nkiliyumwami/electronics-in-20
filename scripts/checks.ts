// Independent re-computation of every number used in the questions.
// Keys are "<lesson>/<question>". For each question:
//   answer  – the correct value, recomputed from scratch (SI units)
//   choices – for multiple choice: the value each option's explanation claims
//             (the right answer, or the result of the specific mistake it names)
//   traps   – for numeric questions: the mistake each trap message describes
//   allowed – every number allowed to appear in the question's texts
//   extra   – any other claim in the texts, checked as code
import { Circuit } from '../src/sim/solver.ts';
import { nearestE12, traceRise, traceWidthFor } from '../src/sim/physics.ts';

const par = (a: number, b: number) => 1 / (1 / a + 1 / b);

export interface Spec {
  answer?: number;
  choices?: Record<string, number>;
  traps?: Record<string, number>;
  allowed?: number[];
  extra?: { name: string; check: () => true | string }[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const eq = (a: number, b: number, what: string): true | string => (Math.abs(a - b) <= Math.abs(b) * 1e-6 + 1e-12 ? true : `${what}: ${a} ≠ ${b}`);

export const CHECKS: Record<string, Spec> = {};

// ============================================================ Module 1
CHECKS['1.1/q1'] = { allowed: [3.3] };
CHECKS['1.1/q3'] = { allowed: [0, 1] };
CHECKS['1.3/q2'] = { allowed: [0] };

{
  // 1.2 q1: 5 V across 1 kΩ.
  const V = 5, R = 1000;
  CHECKS['1.2/q1'] = {
    answer: V / R,
    choices: {
      '5 A': V / 1, // forgot the k
      '5 mA': V / R, // correct
      '0.2 mA': (1 / V) * 1e-3, // 1 ÷ 5 with R in kΩ, read as mA
      '200 mA': (R / V) * 1e-3, // R ÷ V = 200, read as mA
    },
    allowed: [V, 1, R, V / R, (V / R) * 1000, 1 / V, R / V],
  };
}
{
  // 1.2 q2: 5 V and 100 mA.
  const V = 5, I = 0.1, P = V * I;
  CHECKS['1.2/q2'] = {
    answer: P,
    traps: {
      '500': P * 1000, // answered in mW but the unit box says W
      '0.0005': P * 1e-3, // typed 0.5 with the unit box on mW
    },
    allowed: [V, 100, I, P, P * 1000, 0.25],
    extra: [{ name: '"double what a ¼ W resistor can take"', check: () => eq(P / 0.25, 2, 'ratio') }],
  };
}
{
  // 1.2 q3: 5 V, 20 mA target.
  const V = 5, I = 0.02, R = V / I;
  const buy = nearestE12(R);
  CHECKS['1.2/q3'] = {
    allowed: [V, 20, I, R, buy, r1((V / buy) * 1000)],
    extra: [
      { name: '250 Ω', check: () => eq(R, 250, 'R') },
      { name: 'nearest standard value 270 Ω', check: () => eq(buy, 270, 'E12') },
      { name: '"about 18.5 mA"', check: () => eq(r1((V / buy) * 1000), 18.5, 'I with 270 Ω') },
    ],
  };
}
{
  // 1.3 q3: scene values: 5 V battery, 220 Ω, red LED 2.0 V, meter shunt 0.5 Ω in the gap.
  const sol = new Circuit([
    { kind: 'V', id: 'B', p: 'top', n: 'gnd', v: 5 },
    { kind: 'R', id: 'R1', a: 'top', b: 'rL', r: 220 },
    { kind: 'R', id: 'meter', a: 'rL', b: 'ledA', r: 0.5 },
    { kind: 'D', id: 'LED', a: 'ledA', k: 'gnd', vf: 2.0, rs: 0 },
  ]).dc();
  const mA = r1(sol.i('meter') * 1000);
  CHECKS['1.3/q3'] = {
    allowed: [mA],
    extra: [{ name: '"about 13.6 mA"', check: () => eq(mA, 13.6, 'meter reading') }],
  };
}

// ============================================================ Module 2
CHECKS['2.1/q1'] = { allowed: [0] };
CHECKS['2.1/q2'] = { allowed: [0] };
CHECKS['2.1/q3'] = { allowed: [0] };
CHECKS['2.2/q1'] = { allowed: [0] };
{
  // 2.3 q1: two 1 kΩ in parallel.
  const R = 1000;
  const p2 = par(R, R);
  CHECKS['2.3/q1'] = {
    answer: p2,
    traps: { '2000': R + R }, // added them as if in series
    allowed: [1, p2],
    extra: [{ name: '"half of 1 kΩ is 500 Ω"', check: () => eq(R / 2, p2, 'half') }],
  };
}
{
  // 2.3 q2: 470 Ω + 220 Ω in series.
  const a = 470, b = 220;
  const pp = par(a, b);
  CHECKS['2.3/q2'] = {
    answer: a + b,
    traps: { '150': Math.round(pp / 10) * 10 }, // parallel value ≈ 149.9 Ω, trap matches within 1%
    allowed: [a, b, a + b],
    extra: [{ name: 'parallel 470‖220 ≈ 150 Ω (trap matches within 1%)', check: () => (Math.abs(pp - 150) / 150 < 0.01 ? true : `parallel = ${pp}`) }],
  };
}

// ============================================================ Module 3
{
  // 3.1 q1: 10 V, R1 = 8 kΩ, R2 = 2 kΩ.
  const Vin = 10, R1 = 8000, R2 = 2000;
  const out = (Vin * R2) / (R1 + R2);
  CHECKS['3.1/q1'] = {
    answer: out,
    traps: { '8': (Vin * R1) / (R1 + R2) }, // voltage across R1 instead
    allowed: [Vin, 8, 2, out, 10],
    extra: [{ name: '"a fifth of the total"', check: () => eq(R2 / (R1 + R2), 1 / 5, 'share') }],
  };
}
{
  // 3.1 q2: 10 kΩ / 10 kΩ divider with a 1 kΩ load.
  const R = 10000, L = 1000;
  const bottom = par(R, L);
  const ratio = bottom / (R + bottom);
  CHECKS['3.1/q2'] = {
    allowed: [1, 10, Math.round(bottom)],
    extra: [
      { name: '"acts like about 909 Ω"', check: () => eq(Math.round(bottom), 909, 'R2‖load') },
      { name: '"less than a tenth of the input"', check: () => (ratio < 0.1 ? true : `ratio ${ratio}`) },
    ],
  };
}
{
  // 3.1 q3: 5 V → 3.3 V. Hint R1 = 1 kΩ, R2 = 2 kΩ.
  const v = (5 * 2000) / 3000;
  CHECKS['3.1/q3'] = {
    allowed: [5, 3.3, 0.1, 1, 2, 3],
    extra: [{ name: 'hint pair 1k/2k gives 3.3 ± 0.1 V', check: () => (Math.abs(v - 3.3) <= 0.1 ? true : `got ${v}`) }],
  };
}
{
  // 3.2 q1: 10 kΩ × 100 nF.
  const R = 10000, C = 100e-9;
  CHECKS['3.2/q1'] = {
    answer: R * C,
    traps: { '1': R * 100e-6 }, // used µ instead of n
    allowed: [10, 100, R, C, R * C, 1, 63],
    extra: [{ name: '"about 63% after one time constant"', check: () => eq(Math.round((1 - Math.exp(-1)) * 100), 63, '%') }],
  };
}
CHECKS['3.2/q2'] = { allowed: [63] };
CHECKS['3.2/q3'] = {
  allowed: [2, 63, 10, 20, 100],
  extra: [
    { name: '20 kΩ × 100 µF = 2 s', check: () => eq(20e3 * 100e-6, 2, 'tau') },
    { name: '100 kΩ × 20 µF = 2 s', check: () => eq(100e3 * 20e-6, 2, 'tau') },
  ],
};
{
  // 3.3 q1: 5 V, 2 V LED, 15 mA.
  const Vs = 5, Vf = 2, I = 0.015;
  const R = (Vs - Vf) / I;
  const buy = nearestE12(R);
  CHECKS['3.3/q1'] = {
    answer: R,
    traps: { '333.3': Math.round((Vs / I) * 10) / 10 }, // ignored the LED's voltage
    allowed: [Vs, Vf, 15, I, R, buy, r1(((Vs - Vf) / buy) * 1000), Vs - Vf],
    extra: [
      { name: 'nearest standard value 220 Ω', check: () => eq(buy, 220, 'E12') },
      { name: '"about 13.6 mA"', check: () => eq(r1(((Vs - Vf) / buy) * 1000), 13.6, 'I') },
    ],
  };
}
CHECKS['3.3/q3'] = { allowed: [10, 20, 0.015] };
{
  // 3.5 q1: VDD = 3.3 V, limit VDD + 0.3 V.
  const lim = 3.3 + 0.3;
  CHECKS['3.5/q1'] = { allowed: [3.3, 0.3, 5, lim], extra: [{ name: '3.3 + 0.3 = 3.6', check: () => eq(Math.round(lim * 10) / 10, 3.6, 'limit') }] };
}
// 3.5 q2: values come from the datasheet shown in the scene (DATASHEET in src/content/datasheet.ts).
import { DATASHEET } from '../src/content/datasheet.ts';
{
  const abs = DATASHEET.absMax.find((r) => r.param === 'Current per I/O pin')!;
  const rec = DATASHEET.operating.find((r) => r.param === 'Current per I/O pin')!;
  CHECKS['3.5/q2'] = {
    answer: abs.max * 1e-3,
    traps: { '0.008': rec.max * 1e-3 }, // read the recommended table instead
    allowed: [abs.max, rec.max],
  };
}
CHECKS['3.5/q3'] = { allowed: [5, 3.3] };

// ============================================================ Module 4
{
  const hi = (vdd: number) => 0.7 * vdd;
  const lo = (vdd: number) => 0.3 * vdd;
  CHECKS['4.1/q1'] = {
    allowed: [3.3, 5, 0.7, hi(5)],
    extra: [{ name: '0.7 × 5 = 3.5 V', check: () => eq(hi(5), 3.5, 'VIH(5 V)') }],
  };
  CHECKS['4.1/q2'] = {
    answer: hi(3.3),
    traps: { '0.99': lo(3.3) }, // used the LOW threshold
    allowed: [3.3, 0.7, 0.3, hi(3.3), lo(3.3), 1],
  };
  CHECKS['4.1/q3'] = { allowed: [3.3, 5, hi(3.3), hi(5)] };
  // Explanation claims, checked here too.
  CHECKS['4.1/q3'].extra = [
    { name: 'explanation: 2.31 V and 0.99 V for 3.3 V', check: () => (eq(Math.round(hi(3.3) * 100) / 100, 2.31, 'hi') === true && eq(Math.round(lo(3.3) * 100) / 100, 0.99, 'lo') === true ? true : 'mismatch') },
  ];
}
{
  const V = 3.3, R = 10000;
  CHECKS['4.2/q2'] = {
    allowed: [10, V, 0, r2(((V / R) * 1000))],
    extra: [{ name: '3.3 V ÷ 10 kΩ = 0.33 mA', check: () => eq(r2((V / R) * 1000), 0.33, 'mA') }],
  };
  CHECKS['4.2/q3'] = { allowed: [] };
}

// ============================================================ Module 5
// Scene constants for 5.1 (src/lessons/scenes/l5_1.ts uses the same numbers).
export const BUDGET = { capacity: 2000, mcuActive: 10, mcuSleep: 0.05, led: 20, radioListen: 15, radioBurst: 800, burstMs: 10, burstEveryS: 60, sensor: 1 };
{
  const cap = 2000, I = 25;
  CHECKS['5.1/q1'] = {
    answer: cap / I,
    traps: { '50000': cap * I }, // multiplied instead of dividing
    allowed: [I, cap, cap / I, 3],
    extra: [
      { name: '"a little over 3 days"', check: () => (cap / I / 24 > 3 && cap / I / 24 < 3.5 ? true : `${cap / I / 24} days`) },
      { name: 'explanation: 2000 mAh = 20 mA × 100 h = 200 mA × 10 h', check: () => (cap / 20 === 100 && cap / 200 === 10 ? true : 'mismatch') },
    ],
  };
}
CHECKS['5.1/q2'] = { allowed: [20, 800, 410], extra: [{ name: '410 is halfway between 20 and 800', check: () => eq((20 + 800) / 2, 410, 'halfway') }] };
{
  const B = BUDGET;
  const limit = B.capacity / 168;
  const lean = B.mcuSleep + (B.radioBurst * B.burstMs) / 1000 / B.burstEveryS + B.sensor; // LED off, radio bursts, MCU sleeping
  CHECKS['5.1/q3'] = {
    allowed: [2000, 168, r1(limit)],
    extra: [
      { name: '2000 ÷ 168 ≈ 11.9 mA', check: () => eq(r1(limit), 11.9, 'limit') },
      { name: 'the lean setup really beats a week', check: () => (B.capacity / lean > 168 ? true : `only ${B.capacity / lean} h`) },
      { name: 'the default setup does not', check: () => (B.capacity / (B.mcuActive + B.led + B.radioListen + B.sensor) < 168 ? true : 'default already passes') },
    ],
  };
}
{
  const Vin = 12, Vout = 5, I = 0.5;
  CHECKS['5.2/q1'] = {
    answer: (Vin - Vout) * I,
    traps: { '6': Vin * I, '2.5': Vout * I }, // total input power; load power
    allowed: [Vin, Vout, 500, I, (Vin - Vout) * I, Vin - Vout, Vout * I, Vin * I],
  };
  CHECKS['5.2/q3'] = { allowed: [5, 500, 12, 100, 3.5], extra: [{ name: 'LDO at 12 V burns 3.5 W', check: () => eq((Vin - Vout) * I, 3.5, 'heat') }] };
}
CHECKS['5.2/q2'] = {
  allowed: [5],
  extra: [{ name: 'explanation: LDO at 12→5 V, 0.5 A wastes more than the load uses', check: () => ((12 - 5) * 0.5 > 5 * 0.5 ? true : 'not more') }],
};
// 5.2 q3 explain: "the buck wastes only about a quarter of a watt" (scene efficiency 90%).
CHECKS['5.2/q3'].extra!.push({ name: 'buck at 90% wastes ~0.25 W', check: () => { const w = 2.5 * (1 / 0.9 - 1); return w > 0.2 && w < 0.32 ? true : `${w} W`; } });
CHECKS['5.3/q1'] = { allowed: [100] };
CHECKS['5.3/q3'] = { allowed: [0.1] };

// ============================================================ Module 6
CHECKS['6.1/q3'] = { allowed: [5] };
{
  const inch = 25.4;
  CHECKS['6.2/q1'] = {
    allowed: [805 /* the code 0805 */, 0.08, 0.05, 25.4, 2.0, 1.25, 2012, 0.8, 0.5, 2.5, 8, 5],
    extra: [
      { name: '0.08 in ≈ 2.0 mm', check: () => (Math.abs(0.08 * inch - 2.0) < 0.05 ? true : `${0.08 * inch}`) },
      { name: '0.05 in ≈ 1.25 mm', check: () => (Math.abs(0.05 * inch - 1.25) < 0.03 ? true : `${0.05 * inch}`) },
      { name: '"about 2.5 times bigger" (mm reading vs inch)', check: () => (Math.abs((0.08 * inch) / 0.8 - 2.5) < 0.1 ? true : `${(0.08 * inch) / 0.8}`) },
    ],
  };
  // Explanation claim "0805 → 2.0 × 1.25 mm → metric 2012" is the same maths.
}
{
  // 6.3: IPC-2221, outer layer, 1 oz copper. Scene: 3 A, slider from 0.4 mm.
  const I = 3, start = 0.4;
  const need = traceWidthFor(I, 20);
  CHECKS['6.3/q2'] = {
    allowed: [3, 20, 0.9, 1, 2221, Math.round(traceRise(start, I)), start],
    extra: [
      { name: '+20 °C at 3 A needs ≈ 0.9 mm', check: () => (Math.abs(need - 0.9) < 0.01 ? true : `${need} mm`) },
      { name: 'starting 0.4 mm runs at ≈ +76 °C', check: () => eq(Math.round(traceRise(start, I)), 76, 'rise') },
      { name: 'slider 0.2–1.6 mm puts 0.9 mm in the middle', check: () => eq((0.2 + 1.6) / 2, 0.9, 'mid') },
    ],
  };
}
import { nightlightDesign, nightlightErcPins } from '../src/content/nightlight.ts';
import { runDrc } from '../src/sim/drc.ts';
import { runErc } from '../src/sim/erc.ts';
{
  // The board used in 6.3, 6.4, Module 7 and the capstone must be clean, and each
  // planted 6.4 problem must be caught by exactly one check.
  const n = (o: object) => runDrc(nightlightDesign(o));
  CHECKS['6.4/q3'] = {
    allowed: [],
    extra: [
      { name: 'night-light board: DRC clean', check: () => (n({}).length === 0 ? true : n({}).map((e) => e.msg).join('; ')) },
      { name: 'night-light board: ERC clean', check: () => (runErc(nightlightErcPins()).length === 0 ? true : 'ERC errors') },
      { name: 'planted clearance error detected', check: () => (n({ badClearance: true }).filter((e) => e.kind === 'clearance').length === 1 ? true : 'not exactly one') },
      { name: 'planted unrouted net detected', check: () => (n({ missing: ['LED_A'] }).filter((e) => e.kind === 'unrouted').length === 1 ? true : 'not exactly one') },
      { name: 'planted floating input detected by ERC', check: () => (runErc(nightlightErcPins({ noR1: true })).length === 1 ? true : 'not exactly one') },
      { name: 'power trace width set to the 6.3 answer', check: () => (nightlightDesign({}).traces.find((t) => t.id === 'P5V')!.width >= traceWidthFor(3, 20) - 0.001 ? true : 'too thin') },
    ],
  };
}

// ============================================================ Module 7
CHECKS['7.1/q2'] = { allowed: [100] };
CHECKS['7.3/q2'] = { allowed: [50, 0.1] };
CHECKS['7.3/q3'] = { allowed: [5, 100] };
