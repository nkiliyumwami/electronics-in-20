// Independent re-computation of every number used in the questions.
// Keys are "<lesson>/<question>". For each question:
//   answer  – the correct value, recomputed from scratch (SI units)
//   choices – for multiple choice: the value each option's explanation claims
//             (the right answer, or the result of the specific mistake it names)
//   traps   – for numeric questions: the mistake each trap message describes
//   allowed – every number allowed to appear in the question's texts
//   extra   – any other claim in the texts, checked as code
import { Circuit } from '../src/sim/solver.ts';
import { E12 } from '../src/sim/physics.ts';

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
const mA = (a: number) => a * 1000;

// ESP32 facts the questions rely on.
const PIN = 3.3; // V, a HIGH output
const RED = 2.0; // V, red LED forward voltage
const PIN_MAX_MA = 40; // absolute maximum per pin
const DESIGN_MA = 20; // design limit per pin, and the LED's rating
const ABS_MAX = 3.6; // V on any pin

export const CHECKS: Record<string, Spec> = {};

// ============================================================ Module 1
CHECKS['1.1/q1'] = {
  allowed: [PIN, 0, 5, 1.7],
  extra: [{ name: '3V3 is 1.7 V below 5 V', check: () => eq(r1(5 - PIN), 1.7, '5 − 3.3') }],
};
CHECKS['1.1/q3'] = { allowed: [0, 1] };
{
  // 1.2 q1: 3.3 V pin, red LED, 330 Ω.
  const VR = PIN - RED;
  const R = 330;
  CHECKS['1.2/q1'] = {
    answer: VR / R,
    traps: {
      '0.01': PIN / R, // used the full 3.3 V
      [String(2 / 330)]: RED / R, // used the LED's voltage
      '0.254': R / VR / 1000, // R ÷ V, typed in mA
    },
    allowed: [PIN, RED, R, r1(VR), r1(mA(VR / R))],
    extra: [{ name: '"≈ 3.9 mA"', check: () => eq(r1(mA(VR / R)), 3.9, 'I') }],
  };
}
{
  // 1.2 q2: three LEDs at ~10 mA each.
  const VR = PIN - RED;
  const ideal = VR / 0.01;
  const decades = [10, 100, 1000];
  const std = decades.flatMap((d) => E12.map((x) => Math.round(x * d)));
  const pick = Math.min(...std.filter((x) => x >= ideal - 1e-9));
  CHECKS['1.2/q2'] = {
    answer: pick,
    choices: {
      '150 Ω': pick, // nearest standard value at or above the ideal
      '33 Ω': 33, // ~39 mA
      '330 Ω': 330, // ~3.9 mA
      '1.3 kΩ': VR / 0.001, // 1.3 V ÷ 1 mA: slipped decimal
    },
    allowed: [3, RED, 10, PIN, r1(VR), ideal, pick, r1(mA(VR / pick)), 33, Math.round(mA(VR / 33)), PIN_MAX_MA, DESIGN_MA, 330, r1(mA(VR / 330)), 1, r1(mA(VR / 1300))],
    extra: [
      { name: 'ideal 130 Ω', check: () => eq(Math.round(ideal), 130, 'ideal') },
      { name: '150 Ω → 8.7 mA', check: () => eq(r1(mA(VR / 150)), 8.7, 'I') },
      { name: '33 Ω → 39 mA, near the 40 mA max', check: () => eq(Math.round(mA(VR / 33)), 39, 'I') },
      { name: '1.3 kΩ → 1.0 mA', check: () => eq(r1(mA(VR / 1300)), 1.0, 'I') },
    ],
  };
}
{
  // 1.2 q3: 5–15 mA band.
  const VR = PIN - RED;
  const I = (r: number) => r1(mA(VR / r));
  CHECKS['1.2/q3'] = {
    allowed: [5, 15, 16, 220, I(220), 150, I(150), 100, I(100)],
    extra: [
      { name: '220 Ω → 5.9 mA', check: () => eq(I(220), 5.9, 'I') },
      { name: '150 Ω → 8.7 mA', check: () => eq(I(150), 8.7, 'I') },
      { name: '100 Ω → 13.0 mA', check: () => eq(I(100), 13.0, 'I') },
      { name: 'all three in 5–15 mA, 330 Ω is not', check: () => ([220, 150, 100].every((r) => I(r) >= 5 && I(r) <= 15) && I(330) < 5 ? true : 'band') },
    ],
  };
}
{
  // 1.3 q3: 3V3 → 220 Ω → red LED → GND, meter (0.5 Ω shunt) in the gap.
  const sol = new Circuit([
    { kind: 'V', id: 'S', p: 'v33', n: 'gnd', v: PIN },
    { kind: 'R', id: 'R1', a: 'v33', b: 'rL', r: 220 },
    { kind: 'R', id: 'meter', a: 'rL', b: 'ledA', r: 0.5 },
    { kind: 'D', id: 'LED', a: 'ledA', k: 'gnd', vf: RED, rs: 0 },
  ]).dc();
  const i = sol.i('meter');
  CHECKS['1.3/q3'] = {
    allowed: [r1(mA(i)), PIN, RED, 220],
    extra: [{ name: 'about 5.9 mA with the meter in', check: () => eq(r1(mA(i)), 5.9, 'I') }],
  };
}

// ============================================================ Module 2
{
  const a = 5, b = 6;
  CHECKS['2.4/q1'] = { answer: (a + b) / 1000, traps: { '0.006': b / 1000 }, allowed: [a, b, a + b] };
  CHECKS['2.4/q2'] = {
    allowed: [RED, PIN, 2 * RED, 5],
    extra: [
      { name: '2.0 + 2.0 = 4.0 > 3.3', check: () => (2 * RED > PIN ? true : 'two LEDs fit') },
      { name: 'two red LEDs fit under 5 V', check: () => (2 * RED < 5 ? true : 'not under 5 V') },
    ],
  };
}

// ============================================================ Module 3
CHECKS['3.1/q1'] = { allowed: [27, PIN] };
{
  // 3.2 q1: 100 k / 47 k from 5 V.
  const Vin = 5, R1 = 100e3, R2 = 47e3;
  const v = (Vin * R2) / (R1 + R2);
  CHECKS['3.2/q1'] = {
    answer: v,
    traps: { [String((5 * 100) / 147)]: (Vin * R1) / (R1 + R2), '2.35': (Vin * R2) / R1 },
    allowed: [100, 47, Vin, 147, r2(v)],
    extra: [{ name: '"≈ 1.60 V"', check: () => eq(r2(v), 1.6, 'Vout') }],
  };
}
CHECKS['3.2/q2'] = { allowed: [4, 32, 39, 5, PIN] };
{
  const full = 4.2;
  const vOut = (r1k: number, r2k: number) => (full * r2k) / (r1k + r2k);
  const uA = (r1k: number, r2k: number) => (full / ((r1k + r2k) * 1e3)) * 1e6;
  CHECKS['3.2/q3'] = {
    allowed: [full, 1.8, 2.5, 50, 100, r1(vOut(100, 100)), Math.round(uA(100, 100)), 10, Math.round(uA(10, 10))],
    extra: [
      { name: '100k/100k → 2.1 V, 21 µA (passes)', check: () => (eq(r1(vOut(100, 100)), 2.1, 'V') === true && Math.round(uA(100, 100)) === 21 ? true : 'values') },
      { name: '10k/10k → 210 µA (fails)', check: () => eq(Math.round(uA(10, 10)), 210, 'µA') },
    ],
  };
}
{
  const DRY = 2900, WET = 1300, now = 2300;
  const pct = ((DRY - now) / (DRY - WET)) * 100;
  CHECKS['3.3/q1'] = {
    answer: pct,
    traps: { '62.5': ((now - WET) / (DRY - WET)) * 100, [String((2300 / 4095) * 100)]: (now / 4095) * 100 },
    allowed: [DRY, WET, now, 100, DRY - WET, pct, 4095],
  };
}
CHECKS['3.3/q2'] = { allowed: [5] };
CHECKS['3.3/q3'] = { allowed: [40, 60, 30] };
{
  const th = 0.75 * PIN;
  CHECKS['3.4/q1'] = {
    answer: th,
    traps: { [String(0.75 * 5)]: 0.75 * 5 },
    allowed: [0.75, PIN, 2.475, 2.5, 5],
    extra: [{ name: '"= 2.475 V, about 2.5 V"', check: () => eq(Math.round(th * 1000) / 1000, 2.475, 'threshold') }],
  };
}
{
  const Vin = 5, R1 = 1e3, R2 = 2e3;
  const v = (Vin * R2) / (R1 + R2);
  CHECKS['3.4/q2'] = {
    answer: v,
    choices: { '3.33 V': v, '1.67 V': (Vin * R1) / (R1 + R2), '2.5 V': Vin / 2, '5 V': Vin },
    allowed: [Vin, 1, 2, 3, r2(v), ABS_MAX, r2((Vin * R1) / (R1 + R2)), 2.5],
    extra: [{ name: '3.33 V is HIGH and under 3.6 V', check: () => (v > 0.75 * PIN && v < ABS_MAX ? true : 'not safe') }],
  };
  CHECKS['3.4/q3'] = { allowed: [ABS_MAX, Vin, r2(v)] };
}

// ============================================================ Module 4
{
  const d = 0.25;
  const avg = d * PIN;
  CHECKS['4.1/q1'] = {
    answer: avg,
    traps: { [String(0.75 * 3.3)]: (1 - d) * PIN },
    allowed: [25, PIN, d, r2(avg), 0, 75],
    extra: [{ name: '"≈ 0.83 V"', check: () => eq(r2(avg), 0.83, 'avg') }],
  };
}
CHECKS['4.1/q2'] = { allowed: [5, RED, PIN] };
CHECKS['4.1/q3'] = { allowed: [20, 30, 25] };
CHECKS['4.2/q1'] = { allowed: [5, 150, PIN, DESIGN_MA, 26] };
CHECKS['4.2/q3'] = { allowed: [26, PIN, 150, 5] };
CHECKS['4.3/q2'] = { allowed: [230, 120, 5] };
CHECKS['4.3/q3'] = { allowed: [5] };

// ============================================================ Module 5
CHECKS['5.1/q1'] = { allowed: [PIN, 5] };
CHECKS['5.3/q2'] = { allowed: [9600, 115200] };
CHECKS['5.3/q3'] = { allowed: [9600] };

// ============================================================ Module 6
{
  const out = 3.3, head = 1.1;
  CHECKS['6.1/q1'] = {
    answer: out + head,
    traps: { '2.2': out - head },
    allowed: [head, out, r1(out + head), 4.2],
    extra: [{ name: 'a full Li-ion (4.2 V) is below 4.4 V', check: () => (4.2 < out + head ? true : 'not below') }],
  };
  CHECKS['6.1/q2'] = { allowed: [18650, 4.2, ABS_MAX, PIN] };
  CHECKS['6.1/q3'] = {
    allowed: [18650, 3, ABS_MAX, 0.2, 4.2, r1(out + 0.2), out],
    extra: [{ name: 'LDO keeps 3.3 V down to 3.5 V', check: () => eq(r1(out + 0.2), 3.5, 'dropout') }],
  };
}
CHECKS['6.2/q3'] = { allowed: [3] };
{
  const cap = 2500, I = 25;
  CHECKS['6.3/q1'] = { answer: cap / I, traps: { '62500': cap * I, '0.01': I / cap }, allowed: [I, cap, cap / I] };
  CHECKS['6.3/q2'] = { allowed: [10, 5] };
  // Plant Buddy: awake 5 s at 100 mA every 10 min; asleep 10 µA (low-power board).
  const period = 600, awake = 5, iAwake = 100, iSleep = 0.01;
  const avg = (awake * iAwake + (period - awake) * iSleep) / period;
  const days = cap / avg / 24;
  CHECKS['6.3/q3'] = {
    allowed: [cap, 90, 10, 5, 1],
    extra: [
      { name: 'average under 1 mA', check: () => (avg < 1 ? true : `${avg} mA`) },
      { name: 'over 90 days', check: () => (days > 90 ? true : `${days} days`) },
      { name: '"about four months" (105–135 days)', check: () => (days > 105 && days < 135 ? true : `${days} days`) },
    ],
  };
}
{
  const Vin = 12, Vout = 5, I = 0.5;
  CHECKS['6.4/q1'] = {
    answer: (Vin - Vout) * I,
    traps: { '6': Vin * I, '2.5': Vout * I },
    allowed: [Vin, Vout, 500, I, Vin - Vout, (Vin - Vout) * I, Vout * I, Vin * I],
  };
  CHECKS['6.4/q3'] = {
    allowed: [Vout, 500, Vin, 100, 3.5],
    extra: [
      { name: 'LDO at 12 V burns 3.5 W', check: () => eq((Vin - Vout) * I, 3.5, 'heat') },
      { name: 'buck at 90% wastes ~0.25 W', check: () => { const w = Vout * I * (1 / 0.9 - 1); return w > 0.2 && w < 0.32 ? true : `${w} W`; } },
    ],
  };
}

// ============================================================ Module 7
CHECKS['7.1/q1'] = { allowed: [PIN] };
CHECKS['1.3/q2'] = { allowed: [0] };
CHECKS['2.2/q2'] = { allowed: [0] };
CHECKS['2.2/q3'] = { allowed: [0] };
CHECKS['6.4/q2'] = { allowed: [5] };
CHECKS['7.1/q2'] = { allowed: [100, 0.1, PIN] };
CHECKS['7.1/q3'] = { allowed: [PIN] };
CHECKS['7.3/q1'] = { allowed: [PIN, 5] };
