import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, dense, flowAlong, up, WATER_FLOW } from '../kit';
import { resistor, contactShadow, M } from '../../three/lib';
import { currentToSpeed } from '../../three/particles';
import { Circuit, type Elem } from '../../sim/solver';
import { fmt, roundSig } from '../../sim/physics';
import { gauge, pipe, pump, narrowing } from '../../three/water';
import { Multimeter } from '../../tools/multimeter';

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let Vin = 10;
  let R1 = 8000;
  let R2 = 2000;
  let RL = 1000;
  let loaded = false;

  // ---- real view
  const b = bench(ctx);
  const H = b.bb.hole;
  const r1 = resistor(R1, H(13, 1).distanceTo(H(9, 1)));
  r1.group.position.copy(H(13, 1).lerp(H(9, 1), 0.5));
  const r2 = resistor(R2, H(9, 3).distanceTo(H(5, 3)));
  r2.group.position.copy(H(9, 3).lerp(H(5, 3), 0.5));
  const load = resistor(RL, H(9, 2).distanceTo(H(5, 2)));
  load.group.position.copy(H(9, 2).lerp(H(5, 2), 0.5)).setY(0.25);
  (load.body.material as THREE.MeshStandardMaterial).color.set('#5d8fd6');
  load.group.visible = false;
  stage.real.add(r1.group, r2.group, load.group);
  stage.part(r1.group, { name: 'R1 (top resistor)', job: 'The upper half of the divider. A bigger R1 pulls the middle point down.', symbol: 'resistor' });
  stage.part(r2.group, { name: 'R2 (bottom resistor)', job: 'The lower half. The output is measured across R2.', symbol: 'resistor' });
  stage.part(load.group, { name: 'Load', job: 'Something drawing current from the middle point. It sits in parallel with R2.', symbol: 'resistor' });
  const redPts = batteryPts(b.plus, 1, H(13, 0), 0.9);
  const blackPts = batteryPts(b.minus, -1, H(5, 0), 0.9);
  addWire(ctx, redPts, 'red', 'Red wire (+)');
  addWire(ctx, blackPts, 'black', 'Black wire (−)');
  const s = (p: THREE.Vector3) => up(p, 0.02);
  const flow = flowAlong(stage.real, dense([...redPts, s(H(13, 1)), up(H(13, 1), 0.32), up(H(9, 1), 0.32), s(H(9, 1)), s(H(9, 3)), up(H(9, 3), 0.32), up(H(5, 3), 0.32), s(H(5, 3)), s(H(5, 0)), ...[...blackPts].reverse(), b.minus.clone(), b.plus.clone()]));
  const lflow = flowAlong(stage.real, dense([s(H(9, 2)), up(H(9, 2), 0.57), up(H(5, 2), 0.57), s(H(5, 2))]), undefined, { closed: false });
  const l1 = stage.label('', r1.group, new THREE.Vector3(0, 0.7, -0.15));
  const l2 = stage.label('', r2.group, new THREE.Vector3(0, 0.7, 0.25));
  const vLabel = stage.label('', b.batGroup, new THREE.Vector3(0.1, 2.15, 0), 'big');

  const meter = new Multimeter(
    stage,
    stage.real,
    [
      { id: 'mid', label: 'Middle point (column 9)', node: 'mid', pos: H(9, 4) },
      { id: 'gnd', label: 'Bottom / ground (column 5)', node: 'gnd', pos: H(5, 4) },
      { id: 'top', label: 'Top / input (column 13)', node: 'top', pos: H(13, 4) },
    ],
    { modes: ['V'], at: new THREE.Vector3(3.9, -0.85, 1.4), rotY: -0.5, probeY: 0 },
  );
  meter.setProbe('red', 'mid');
  meter.setProbe('black', 'gnd');

  // ---- water view: two narrowings in series, a gauge tapped between them, optional leak (load)
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(6, 6));
  const y = 0.4, x0 = -1.8, x1 = 1.8, zb = -1.8, zf = 1.8;
  wg.add(pipe([new THREE.Vector3(x0, y, zf), new THREE.Vector3(x0, y, zb), new THREE.Vector3(x1, y, zb), new THREE.Vector3(x1, y, zf), new THREE.Vector3(x0, y, zf)], 0.13).mesh);
  const pm = pump();
  pm.group.position.set(0, y, zb);
  wg.add(pm.group);
  const n1 = narrowing(1.0, 0.13);
  n1.group.position.set(x1, y, 0);
  n1.group.rotation.y = Math.PI / 2;
  const n2 = narrowing(1.0, 0.13);
  n2.group.position.set(0.6, y, zf);
  wg.add(n1.group, n2.group);
  const g = gauge(0.32);
  g.group.position.set(x1 - 0.1, y + 0.9, zf - 0.2);
  wg.add(g.group, pipe([new THREE.Vector3(x1, y, zf - 0.6), new THREE.Vector3(x1, y + 0.6, zf - 0.6)], 0.04).mesh);
  const leak = pipe([new THREE.Vector3(x1 - 0.05, y, zf - 0.9), new THREE.Vector3(-0.2, y, zf - 0.9), new THREE.Vector3(-0.2, y, zf)], 0.1);
  leak.mesh.visible = false;
  wg.add(leak.mesh);
  stage.part(n1.group, { name: 'First narrowing (= R1)', job: 'Pressure drops across it.', symbol: 'pipe' });
  stage.part(n2.group, { name: 'Second narrowing (= R2)', job: 'The rest of the pressure drops here.', symbol: 'pipe' });
  stage.part(g.group, { name: 'Middle gauge (= Vout)', job: 'Reads the pressure between the two narrowings.', symbol: 'meter' });
  stage.part(leak.mesh, { name: 'Leak pipe (= load)', job: 'Draws water from the middle, so the middle pressure drops.', symbol: 'pipe' });
  const wflow = flowAlong(wg, dense([new THREE.Vector3(0, y, zb), new THREE.Vector3(x1, y, zb), new THREE.Vector3(x1, y, zf), new THREE.Vector3(x0, y, zf), new THREE.Vector3(x0, y, zb), new THREE.Vector3(-0.01, y, zb)]), WATER_FLOW, { radius: 0.07 });
  const wleak = flowAlong(wg, dense([new THREE.Vector3(x1 - 0.05, y, zf - 0.9), new THREE.Vector3(-0.2, y, zf - 0.9), new THREE.Vector3(-0.2, y, zf)]), WATER_FLOW, { closed: false, radius: 0.06 });
  const wl = stage.label('', g.group, new THREE.Vector3(0, 0.55, 0), 'big water');

  // ---- controls
  panel.slider({ label: 'Input voltage (Vin)', min: 0, max: 12, step: 0.1, value: Vin, nudge: true, format: (v) => `${v.toFixed(1)} V`, onInput: (v) => { Vin = v; solve(); } });
  const rOpts = (label: string, val: number, set: (v: number) => void) =>
    panel.slider({ label, min: 100, max: 100000, log: true, value: val, nudge: true, snap: (v) => roundSig(v, 2), format: (v) => fmt(v, 'Ω'), onInput: (v) => { set(v); solve(); } });
  rOpts('R1 (top)', R1, (v) => { R1 = v; r1.setValue(v); });
  rOpts('R2 (bottom)', R2, (v) => { R2 = v; r2.setValue(v); });
  const row = panel.row();
  const loadBtn = panel.toggle('Connect the load', loaded, (v) => { loaded = v; load.group.visible = v; leak.mesh.visible = v; solve(); }, row);
  void loadBtn;
  panel.slider({ label: 'Load resistance', min: 100, max: 1000000, log: true, value: RL, nudge: true, snap: (v) => roundSig(v, 2), format: (v) => fmt(v, 'Ω'), onInput: (v) => { RL = v; load.setValue(v); solve(); } });
  const formula = panel.formula('Live formula');
  const roOut = panel.readout('Vout (middle)');
  const roI = panel.readout('Current');

  let Vout = 0;
  function solve() {
    const elems: Elem[] = [
      { kind: 'V', id: 'B', p: 'top', n: 'gnd', v: Vin },
      { kind: 'R', id: 'R1', a: 'top', b: 'mid', r: R1 },
      { kind: 'R', id: 'R2', a: 'mid', b: 'gnd', r: R2 },
      ...meter.elements(),
    ];
    if (loaded) elems.push({ kind: 'R', id: 'RL', a: 'mid', b: 'gnd', r: RL });
    const sol = new Circuit(elems).dc();
    meter.read(sol, true);
    Vout = sol.v('mid');
    const i1 = sol.i('R1');
    const iL = loaded ? sol.i('RL') : 0;
    flow.speed = currentToSpeed(i1, 0.002, 6);
    lflow.speed = currentToSpeed(iL, 0.002, 6);
    lflow.mesh.visible = loaded;
    wflow.speed = flow.speed;
    wleak.speed = lflow.speed;
    wleak.mesh.visible = loaded;
    pm.setPressure(Vin / 12);
    g.set(Vout / 12);
    const nf = (r: number) => 0.15 + (Math.log(r / 100) / Math.log(1000)) * 0.7;
    n1.setNarrow(nf(R1));
    n2.setNarrow(nf(R2));
    b.bat.setVoltage(Vin, 12);
    const ideal = (Vin * R2) / (R1 + R2);
    if (loaded) {
      const rb = 1 / (1 / R2 + 1 / RL);
      formula.set(`R2 ∥ load = ${fmt(rb, 'Ω')} → Vout = ${Vin.toFixed(2)} V × ${fmt(rb, 'Ω')} ÷ (${fmt(R1, 'Ω')} + ${fmt(rb, 'Ω')}) = <b>${Vout.toFixed(2)} V</b> <span style="color:var(--bad)">(${ideal.toFixed(2)} V without load)</span>`);
    } else {
      formula.set(`Vout = ${Vin.toFixed(2)} V × ${fmt(R2, 'Ω')} ÷ (${fmt(R1, 'Ω')} + ${fmt(R2, 'Ω')}) = <b>${ideal.toFixed(2)} V</b>`);
    }
    roOut.set(`${Vout.toFixed(2)} V`, loaded && Vout < ideal * 0.9 ? 'warn' : '');
    roI.set(fmt(i1, 'A'));
    l1.set(`R1 ${fmt(R1, 'Ω')}`);
    l2.set(`R2 ${fmt(R2, 'Ω')}`);
    vLabel.set(`${Vin.toFixed(1)} V`);
    wl.set(`Middle: ${Vout.toFixed(2)}`);
  }
  meter.onChange = solve;

  stage.onUpdate((dt) => {
    flow.update(dt);
    lflow.update(dt);
    wflow.update(dt);
    wleak.update(dt);
    pm.spin(dt, wflow.speed);
  });

  void M;
  solve();
  stage.focusObjects = [b.batGroup, r1.group, r2.group, meter.group];
  stage.enableWater(2.2);
  stage.frame({ dir: new THREE.Vector3(0.12, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'make33') return { ok: false };
      if (loaded) return { ok: false, msg: 'Disconnect the load first.' };
      if (Math.abs(Vin - 5) > 0.051) return { ok: false, msg: `The input is ${Vin.toFixed(1)} V. Set it to 5.0 V.` };
      if (Math.abs(Vout - 3.3) <= 0.1) return { ok: true };
      return { ok: false, msg: `The middle point reads ${Vout.toFixed(2)} V. ${Vout > 3.3 ? 'Too high: make R1 bigger or R2 smaller.' : 'Too low: make R2 bigger or R1 smaller.'}` };
    },
  };
}
