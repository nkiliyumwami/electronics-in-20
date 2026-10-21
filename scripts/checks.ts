// Independent re-computation of every number used in the questions.
// Keys are "<lesson>/<question>". For each question:
//   answer  – the correct value, recomputed from scratch (SI units)
//   choices – for multiple choice: the value each option's explanation claims
//             (the right answer, or the result of the specific mistake it names)
//   traps   – for numeric questions: the mistake each trap message describes
//   allowed – every number allowed to appear in the question's texts
//   extra   – any other claim in the texts, checked as code
import { Circuit } from '../src/sim/solver.ts';
import { nearestE12 } from '../src/sim/physics.ts';

export interface Spec {
  answer?: number;
  choices?: Record<string, number>;
  traps?: Record<string, number>;
  allowed?: number[];
  extra?: { name: string; check: () => true | string }[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
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
  const par = 1 / (1 / R + 1 / R);
  CHECKS['2.3/q1'] = {
    answer: par,
    traps: { '2000': R + R }, // added them as if in series
    allowed: [1, par],
    extra: [{ name: '"half of 1 kΩ is 500 Ω"', check: () => eq(R / 2, par, 'half') }],
  };
}
{
  // 2.3 q2: 470 Ω + 220 Ω in series.
  const a = 470, b = 220;
  const par = 1 / (1 / a + 1 / b);
  CHECKS['2.3/q2'] = {
    answer: a + b,
    traps: { '150': Math.round(par / 10) * 10 }, // parallel value ≈ 149.9 Ω, trap matches within 1%
    allowed: [a, b, a + b],
    extra: [{ name: 'parallel 470‖220 ≈ 150 Ω (trap matches within 1%)', check: () => (Math.abs(par - 150) / 150 < 0.01 ? true : `parallel = ${par}`) }],
  };
}
