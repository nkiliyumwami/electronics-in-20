import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, dense, flowAlong, up, waterLoop } from '../kit';
import { resistor } from '../../three/lib';
import { currentToSpeed } from '../../three/particles';
import { Circuit } from '../../sim/solver';
import { fmt, roundSig } from '../../sim/physics';
import { Multimeter } from '../../tools/multimeter';

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let V = 5;
  let R = 1000;

  // ---- real view
  const b = bench(ctx);
  const H = b.bb.hole;
  const hTop = H(11, 0), hResR = H(11, 2), hResL = H(5, 2), hGnd = H(5, 0);
  const res = resistor(R, hResR.distanceTo(hResL));
  res.group.position.copy(hResR.clone().lerp(hResL, 0.5));
  stage.real.add(res.group);
  stage.part(res.group, { name: 'Resistor', job: 'Resists the flow of current, like a narrow section of pipe. Its colour bands encode its value.', symbol: 'resistor' });
  const redPts = batteryPts(b.plus, 1, hTop, 0.9);
  const blackPts = batteryPts(b.minus, -1, hGnd, 0.9);
  addWire(ctx, redPts, 'red', 'Red wire (+ side)');
  addWire(ctx, blackPts, 'black', 'Black wire (− side)');

  const loop = dense([
    ...redPts,
    up(hResR, 0.02),
    up(hResR, 0.32),
    up(hResL, 0.32),
    up(hResL, 0.02),
    up(hGnd, 0.02),
    ...[...blackPts].reverse(),
    b.minus.clone(),
    b.plus.clone(),
  ]);
  const flow = flowAlong(stage.real, loop);

  const vLabel = stage.label('', b.batGroup, new THREE.Vector3(0.1, 2.15, 0), 'big');
  const rLabel = stage.label('', res.group, new THREE.Vector3(0, 0.75, 0));
  const iLabel = stage.label('', stage.real, new THREE.Vector3(2.3, 0.6, -1.7));

  // ---- water view
  const w = waterLoop(ctx);
  const pLabel = stage.label('', w.pump.group, new THREE.Vector3(0, 1.4, 0), 'big water');
  const nLabel = stage.label('', w.narrowing.group, new THREE.Vector3(0, 0.6, 0), 'water');
  const fLabel = stage.label('', w.group, new THREE.Vector3(w.x1 + 0.2, w.y + 0.5, 0), 'water');

  // ---- meter (voltage only in this lesson)
  const meter = new Multimeter(
    stage,
    stage.real,
    [
      { id: 'bp', label: 'Battery + terminal', node: 'top', pos: b.plus.clone().add(new THREE.Vector3(0.05, 0, 0)) },
      { id: 'c11', label: 'Board, column 12 (right of resistor)', node: 'top', pos: H(11, 4) },
      { id: 'c5', label: 'Board, column 6 (left of resistor)', node: 'gnd', pos: H(5, 4) },
      { id: 'bm', label: 'Battery − terminal', node: 'gnd', pos: b.minus.clone().add(new THREE.Vector3(-0.05, 0, 0)) },
    ],
    { modes: ['V'], at: new THREE.Vector3(3.9, -0.85, 1.3), rotY: -0.5, probeY: 0 },
  );
  meter.setProbe('red', 'c11');
  meter.setProbe('black', 'c5');

  // ---- controls
  panel.slider({ label: 'Battery voltage (pressure)', min: 0, max: 12, step: 0.1, value: V, nudge: true, format: (v) => `${v.toFixed(1)} V`, onInput: (v) => { V = v; solve(); } });
  panel.slider({
    label: 'Resistor (narrowness)', min: 680, max: 10000, log: true, value: R, nudge: true, snap: (v) => roundSig(v, 2), format: (v) => fmt(v, 'Ω'),
    onInput: (v) => { R = v; res.setValue(R); solve(); },
  });
  const roV = panel.readout('Voltage');
  const roI = panel.readout('Current');
  const roR = panel.readout('Resistance');
  meter.controls(panel);
  meter.onChange = () => solve();

  let I = 0;
  function solve() {
    const sol = new Circuit([
      { kind: 'V', id: 'B', p: 'top', n: 'gnd', v: V },
      { kind: 'R', id: 'R', a: 'top', b: 'gnd', r: R },
      ...meter.elements(),
    ]).dc();
    I = sol.i('R');
    meter.read(sol, true);
    b.bat.setVoltage(V, 12);
    w.pump.setPressure(V / 12);
    w.narrowing.setNarrow(Math.log(R / 680) / Math.log(10000 / 680) * 0.8 + 0.1);
    flow.speed = currentToSpeed(I, 0.004, 5);
    w.flow.speed = flow.speed;
    vLabel.set(`${V.toFixed(1)} V`);
    rLabel.set(fmt(R, 'Ω'));
    iLabel.set(`I = ${fmt(I, 'A')}`);
    pLabel.set(`Pressure ${V.toFixed(1)}`);
    nLabel.set(`Narrowness ${fmt(R, 'Ω')}`);
    fLabel.set(`Flow ${fmt(I, 'A')}`);
    roV.set(`${V.toFixed(1)} V`);
    roI.set(fmt(I, 'A'));
    roR.set(fmt(R, 'Ω'));
  }

  stage.onUpdate((dt) => {
    flow.update(dt);
    w.flow.update(dt);
    w.pump.spin(dt, flow.speed);
  });

  solve();
  stage.focusObjects = [b.batGroup, res.group, meter.group];
  stage.enableWater(2.2);
  stage.frame({ dir: new THREE.Vector3(0.12, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'zeroVolts') return { ok: false };
      if (V < 1) return { ok: false, msg: 'Turn the battery up above 1 V first, so there is a real push in the circuit.' };
      if (!meter.red || !meter.black) return { ok: false, msg: 'Place both probes first.' };
      if (Math.abs(meter.value) < 0.01) return { ok: true };
      return { ok: false, msg: `The meter shows ${meter.text}. Right now the probes are on opposite sides of the resistor.` };
    },
  };
}
