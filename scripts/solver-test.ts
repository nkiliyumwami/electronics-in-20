// Quick sanity tests for the circuit solver: `node scripts/solver-test.ts`
import { Circuit, solveDC } from '../src/sim/solver.ts';

let fails = 0;
function near(name: string, got: number, want: number, tol = 1e-3) {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got ${got.toPrecision(6)}, want ${want}`);
}

// Ohm's law
let s = solveDC([
  { kind: 'V', id: 'B', p: 'top', n: 'gnd', v: 5 },
  { kind: 'R', id: 'R', a: 'top', b: 'gnd', r: 1000 },
]);
near('5V/1k current', s.i('R'), 0.005);
near('source delivers', s.i('B'), 0.005);
near('power in R', s.p('R'), 0.025);

// Divider
s = solveDC([
  { kind: 'V', id: 'B', p: 'in', n: 'gnd', v: 10 },
  { kind: 'R', id: 'R1', a: 'in', b: 'mid', r: 8000 },
  { kind: 'R', id: 'R2', a: 'mid', b: 'gnd', r: 2000 },
]);
near('divider 10V 8k/2k', s.v('mid'), 2);

// LED with resistor
s = solveDC([
  { kind: 'V', id: 'B', p: 'top', n: 'gnd', v: 5 },
  { kind: 'R', id: 'R', a: 'top', b: 'a', r: 200 },
  { kind: 'D', id: 'LED', a: 'a', k: 'gnd', vf: 2, rs: 0 },
]);
near('LED current 5V 2V 200R', s.i('LED'), 0.015);
// Reversed LED
s = solveDC([
  { kind: 'V', id: 'B', p: 'top', n: 'gnd', v: 5 },
  { kind: 'R', id: 'R', a: 'top', b: 'a', r: 200 },
  { kind: 'D', id: 'LED', a: 'gnd', k: 'a', vf: 2, rs: 0 },
]);
near('reversed LED current', s.i('LED'), 0, 1e-6);

// Parallel resistors
s = solveDC([
  { kind: 'V', id: 'B', p: 'top', n: 'gnd', v: 5 },
  { kind: 'R', id: 'R1', a: 'top', b: 'gnd', r: 1000 },
  { kind: 'R', id: 'R2', a: 'top', b: 'gnd', r: 1000 },
]);
near('2x1k parallel source current', s.i('B'), 0.01);

// Current-limited supply into a short
s = solveDC([
  { kind: 'SUPPLY', id: 'PS', p: 'out', n: 'gnd', v: 5, ilim: 0.05 },
  { kind: 'R', id: 'short', a: 'out', b: 'gnd', r: 0.05 },
]);
near('CC current', s.i('PS'), 0.05);
near('CC voltage', s.v('out'), 0.0025);
console.log('   supply in CC:', s.on('PS'));

// Supply not limiting
s = solveDC([
  { kind: 'SUPPLY', id: 'PS', p: 'out', n: 'gnd', v: 5, ilim: 0.05 },
  { kind: 'R', id: 'load', a: 'out', b: 'gnd', r: 500 },
]);
near('CV voltage', s.v('out'), 5);

// MOSFET switch
s = solveDC([
  { kind: 'V', id: 'B', p: 'vcc', n: 'gnd', v: 12 },
  { kind: 'V', id: 'G', p: 'gate', n: 'gnd', v: 3.3 },
  { kind: 'R', id: 'load', a: 'vcc', b: 'd', r: 6 },
  { kind: 'M', id: 'Q', d: 'd', g: 'gate', s: 'gnd', vth: 1.5, ron: 0.02 },
]);
near('MOSFET on current', s.i('Q'), 12 / 6.02);

// RC charge: after one time constant ≈ 63.2%
const rc = new Circuit([
  { kind: 'V', id: 'B', p: 'in', n: 'gnd', v: 5 },
  { kind: 'R', id: 'R', a: 'in', b: 'c', r: 10000 },
  { kind: 'C', id: 'C', a: 'c', b: 'gnd', c: 100e-6 },
]);
const tau = 1; // 10k × 100 µF
const steps = 2000;
let sol = rc.step(tau / steps);
for (let i = 1; i < steps; i++) sol = rc.step(tau / steps);
near('RC at tau', sol.v('c') / 5, 1 - Math.exp(-1), 2e-3);

// RL: current rises toward V/R
const rl = new Circuit([
  { kind: 'V', id: 'B', p: 'in', n: 'gnd', v: 10 },
  { kind: 'R', id: 'R', a: 'in', b: 'x', r: 10 },
  { kind: 'L', id: 'L', a: 'x', b: 'gnd', l: 0.1 },
]);
for (let i = 0; i < 5000; i++) sol = rl.step(1e-5); // 0.05 s = 5 tau
near('RL final current', sol.i('L'), 1 * (1 - Math.exp(-5)), 5e-3);

console.log(fails ? `\n${fails} FAILED` : '\nall solver tests passed');
process.exit(fails ? 1 : 0);
