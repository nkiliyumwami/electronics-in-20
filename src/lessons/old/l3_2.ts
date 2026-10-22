import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, dense, flowAlong, jumperPts, up, WATER_FLOW } from '../kit';
import { resistor, electrolyticCap, contactShadow, mesh, std, M } from '../../three/lib';
import { currentToSpeed } from '../../three/particles';
import { Circuit } from '../../sim/solver';
import { fmt, roundSig } from '../../sim/physics';
import { pipe, pump, narrowing, tank } from '../../three/water';
import { Exploder } from '../../tools/explode';
import { prepCanvas, cssVar } from '../../core/panel';

type Sw = 'charge' | 'hold' | 'discharge';
const VS = 5;

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let R = 10000;
  let C = 100e-6;
  let sw: Sw = 'hold';
  let reversed = false;
  let popped = false;
  let revTime = 0;
  let t0 = 0; // time of the last switch change
  const curve: { t: number; v: number }[] = [];

  const circuit = new Circuit([]);
  const build = () => {
    circuit.elems = [
      { kind: 'V', id: 'B', p: 'vcc', n: 'gnd', v: VS },
      { kind: 'SW', id: 'sc', a: 'vcc', b: 'com', closed: sw === 'charge' },
      { kind: 'SW', id: 'sd', a: 'com', b: 'gnd', closed: sw === 'discharge' },
      { kind: 'R', id: 'R', a: 'com', b: 'c', r: R },
      { kind: 'C', id: 'C', a: 'c', b: 'gnd', c: popped ? 1e-12 : C },
    ];
  };
  build();

  // ---- real view
  const b = bench(ctx);
  const H = b.bb.hole;
  const res = resistor(R, H(14, 1).distanceTo(H(10, 1)));
  res.group.position.copy(H(14, 1).lerp(H(10, 1), 0.5));
  stage.real.add(res.group);
  stage.part(res.group, { name: 'Resistor (the narrow pipe)', job: 'Limits how fast charge can flow into the capacitor.', symbol: 'resistor' });
  const cap = electrolyticCap(0.9, 0.32);
  cap.group.position.copy(H(10, 3).lerp(H(9, 3), 0.5));
  cap.group.rotation.y = Math.PI; // + leg on column 11, stripe (−) on column 10
  stage.real.add(cap.group);
  stage.part(cap.group, {
    name: 'Electrolytic capacitor',
    job: 'Stores charge like a tank. It has polarity: the light stripe marks the − leg.',
    symbol: 'electrolytic',
    actions: () => [{ label: reversed ? 'Fit it the right way round' : 'Fit it backwards', run: () => setReversed(!reversed) }],
  });
  // Slide switch on columns 15–17.
  const swBody = mesh(new THREE.BoxGeometry(0.85, 0.3, 0.32), std('#2f3237', 0.5), [H(15, 2).x, 0.2, H(15, 2).z]);
  const knob = mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), std('#e6e2d6', 0.5), [H(15, 2).x, 0.42, H(15, 2).z]);
  stage.real.add(swBody, knob);
  stage.part(swBody, { name: 'Slide switch', job: 'Left: charge from the battery. Middle: hold. Right: discharge to ground.', symbol: 'switch' });
  const redPts = batteryPts(b.plus, 1, H(15, 0), 0.9);
  const blackPts = batteryPts(b.minus, -1, H(9, 0), 0.9);
  addWire(ctx, redPts, 'red', 'Red wire (+)');
  addWire(ctx, blackPts, 'black', 'Black wire (−)');
  const disPts = jumperPts(H(16, 4), H(9, 4), 0.4);
  addWire(ctx, disPts, 'black', 'Discharge wire (to ground)');
  const s = (p: THREE.Vector3) => up(p, 0.02);
  const chargeFlow = flowAlong(stage.real, dense([...redPts, s(H(15, 2)), s(H(14, 2)), s(H(14, 1)), up(H(14, 1), 0.32), up(H(10, 1), 0.32), s(H(10, 1)), s(H(10, 3)), up(H(10, 3), 0.5), up(H(9, 3), 0.5), s(H(9, 3)), s(H(9, 0)), ...[...blackPts].reverse(), b.minus.clone(), b.plus.clone()]));
  const disFlow = flowAlong(stage.real, dense([up(H(10, 3), 0.5), s(H(10, 3)), s(H(10, 1)), up(H(10, 1), 0.32), up(H(14, 1), 0.32), s(H(14, 1)), s(H(14, 2)), s(H(16, 2)), ...disPts, s(H(9, 3)), up(H(9, 3), 0.5)]), undefined, { closed: false });
  const vcLabel = stage.label('', cap.group, new THREE.Vector3(0, 1.45, 0), 'big');
  const swLabel = stage.label('', swBody, new THREE.Vector3(0, 0.55, 0));

  // Inspection table: exploded ceramic + electrolytic, enlarged.
  const insp = new THREE.Group();
  insp.position.set(4.6, -0.85, -0.6);
  stage.real.add(insp);
  insp.add(contactShadow(3, 4));
  const big = new THREE.Group();
  big.scale.setScalar(1.8);
  insp.add(big);
  // Electrolytic, built from parts.
  const eParts = {
    sleeve: mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.9, 32, 1, true), std('#2a4f8f', 0.45, 0, { side: THREE.DoubleSide }), [0, 0.6, 0]),
    stripe: mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.88, 16, 1, true, Math.PI / 2 - 0.45, 0.9), M.capStripe(), [0, 0.6, 0]),
    roll: mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.78, 32), std('#b8bcc4', 0.35, 0.6), [0, 0.6, 0]),
    bung: mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24), M.rubber(), [0, 0.12, 0]),
    legs: new THREE.Group(),
  };
  eParts.legs.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), M.lead(), [-0.1, -0.15, 0]), mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), M.lead(), [0.1, -0.1, 0]));
  const eGroup = new THREE.Group();
  eGroup.position.set(-0.45, 0.3, 0);
  Object.values(eParts).forEach((p) => eGroup.add(p));
  // Ceramic disc, built from parts.
  const cParts = {
    coatF: mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), M.ceramic(), [0, 0.7, 0.05], [Math.PI / 2, 0, 0]),
    plateF: mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.015, 24), M.tin(), [0, 0.7, 0.02], [Math.PI / 2, 0, 0]),
    dielectric: mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 24), std('#f2efe6', 0.6), [0, 0.7, 0], [Math.PI / 2, 0, 0]),
    plateB: mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.015, 24), M.tin(), [0, 0.7, -0.02], [Math.PI / 2, 0, 0]),
    coatB: mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), M.ceramic(), [0, 0.7, -0.05], [Math.PI / 2, 0, 0]),
  };
  const cGroup = new THREE.Group();
  cGroup.position.set(0.45, 0.3, 0);
  Object.values(cParts).forEach((p) => cGroup.add(p));
  big.add(eGroup, cGroup);
  stage.part(eGroup, { name: 'Electrolytic (cut-away)', job: 'Inside: two long strips of foil with a thin insulating layer, rolled up tight. Huge plate area, so lots of capacitance, but it has a + and a − side.', symbol: 'electrolytic' });
  stage.part(cGroup, { name: 'Ceramic capacitor (cut-away)', job: 'Two metal plates with a ceramic layer between them. Small values, no polarity: either way round works.', symbol: 'capacitor' });
  const ex = new Exploder(stage, [
    { obj: eParts.sleeve, offset: new THREE.Vector3(0, 0.75, 0) },
    { obj: eParts.stripe, offset: new THREE.Vector3(0, 0.75, 0) },
    { obj: eParts.roll, offset: new THREE.Vector3(0, 0.1, 0) },
    { obj: eParts.bung, offset: new THREE.Vector3(0, -0.35, 0) },
    { obj: eParts.legs, offset: new THREE.Vector3(0, -0.6, 0) },
    { obj: cParts.coatF, offset: new THREE.Vector3(0, 0, 0.5) },
    { obj: cParts.plateF, offset: new THREE.Vector3(0, 0, 0.28) },
    { obj: cParts.plateB, offset: new THREE.Vector3(0, 0, -0.28) },
    { obj: cParts.coatB, offset: new THREE.Vector3(0, 0, -0.5) },
  ]);
  const exLabels = [
    stage.label('foil roll', eParts.roll, new THREE.Vector3(0.45, 0, 0)),
    stage.label('− stripe', eParts.stripe, new THREE.Vector3(0, 0.6, 0.35)),
    stage.label('plates', cParts.plateF, new THREE.Vector3(0.35, 0, 0)),
    stage.label('ceramic', cParts.dielectric, new THREE.Vector3(0.4, 0.2, 0)),
  ];
  ex.onChange = (f) => exLabels.forEach((l) => l.show(f > 0.6));
  exLabels.forEach((l) => l.show(false));

  // ---- water view: pump → narrow pipe → tank
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(6, 5));
  const wy = 0.4;
  const pm = pump();
  pm.group.position.set(-1.6, wy, 0);
  wg.add(pm.group);
  wg.add(pipe([new THREE.Vector3(-1.05, wy, 0), new THREE.Vector3(0.9, wy, 0), new THREE.Vector3(0.9, wy, 0.0001)], 0.12).mesh);
  const nar = narrowing(1.2, 0.12);
  nar.group.position.set(0, wy, 0);
  wg.add(nar.group);
  const tk = tank(1.6, 0.55);
  tk.group.position.set(1.5, -0.1, 0);
  wg.add(tk.group);
  stage.part(tk.group, { name: 'Tank (= capacitor)', job: 'Fills up through the narrow pipe. Its water level is the capacitor\'s voltage.', symbol: 'tank' });
  stage.part(nar.group, { name: 'Narrow pipe (= resistor)', job: 'The narrower it is, the slower the tank fills.', symbol: 'pipe' });
  stage.part(pm.group, { name: 'Pump (= battery)', job: 'Fills the tank up to the pump\'s pressure.', symbol: 'pump' });
  const wflow = flowAlong(wg, [new THREE.Vector3(-1.05, wy, 0), new THREE.Vector3(1.05, wy, 0)], WATER_FLOW, { closed: false, radius: 0.06 });
  const wl = stage.label('', tk.group, new THREE.Vector3(0, 2.0, 0), 'big water');

  // ---- controls
  const swSeg = panel.segmented('Switch', [{ value: 'charge', label: 'Charge' }, { value: 'hold', label: 'Hold' }, { value: 'discharge', label: 'Discharge' }], sw, (v) => setSw(v as Sw));
  panel.slider({ label: 'Resistor R', min: 1000, max: 100000, log: true, value: R, nudge: true, snap: (v) => roundSig(v, 2), format: (v) => fmt(v, 'Ω'), onInput: (v) => { R = v; res.setValue(v); build(); updateFormula(); } });
  panel.slider({ label: 'Capacitor C', min: 1e-6, max: 100e-6, log: true, value: C, nudge: true, snap: (v) => roundSig(v, 2), format: (v) => fmt(v, 'F'), onInput: (v) => { C = v; build(); updateFormula(); } });
  const formula = panel.formula('Live formula');
  const chart = panel.chart('Capacitor voltage over time, with the 63% line', 140);
  const roV = panel.readout('Capacitor voltage');
  const roT = panel.readout('Time since switch');
  const exRow = ex.controls(panel, 'Inside a capacitor (explode)');
  panel.button('Fit electrolytic backwards', () => setReversed(!reversed), 'btn danger', exRow);

  function updateFormula() {
    const tau = R * C;
    formula.set(`τ = R × C = ${fmt(R, 'Ω')} × ${fmt(C, 'F')} = <b>${tau < 1 ? (tau * 1000).toFixed(1) + ' ms' : tau.toFixed(2) + ' s'}</b>`);
  }
  function setSw(v: Sw) {
    sw = v;
    swSeg.set(v);
    knob.position.x = H(15, 2).x + (v === 'charge' ? -0.22 : v === 'discharge' ? 0.22 : 0);
    swLabel.set(v === 'charge' ? 'CHARGE' : v === 'discharge' ? 'DISCHARGE' : 'HOLD');
    t0 = stage.time;
    curve.length = 0;
    build();
  }
  function setReversed(v: boolean) {
    reversed = v;
    cap.flip(v);
    revTime = 0;
  }

  let vc = 0;
  let ic = 0;
  stage.onUpdate((dt) => {
    const n = 4;
    let sol = null;
    for (let k = 0; k < n; k++) sol = circuit.step(dt / n);
    vc = sol!.v('c');
    ic = sol!.i('R');
    const t = stage.time - t0;
    if (sw !== 'hold') {
      curve.push({ t, v: vc });
      if (curve.length > 2000) curve.shift();
    }
    // Reversed electrolytic: bulges, then pops.
    if (reversed && !popped && vc > 1) {
      revTime += dt;
      cap.setPop(Math.min(1, revTime / 1.5));
      if (revTime > 1.5) pop();
    }
    chargeFlow.mesh.visible = ic > 0;
    disFlow.mesh.visible = ic < 0;
    chargeFlow.speed = currentToSpeed(Math.abs(ic), 0.0002, 5);
    disFlow.speed = currentToSpeed(Math.abs(ic), 0.0002, 5);
    chargeFlow.update(dt);
    disFlow.update(dt);
    wflow.speed = currentToSpeed(ic, 0.0002, 5);
    wflow.update(dt);
    pm.spin(dt, Math.max(0, wflow.speed));
    pm.setPressure(VS / 6);
    tk.setLevel(vc / VS);
    nar.setNarrow(0.15 + (Math.log(R / 1000) / Math.log(100)) * 0.75);
    vcLabel.set(`${vc.toFixed(2)} V (${Math.round((vc / VS) * 100)}%)`, popped ? 'bad' : '');
    wl.set(`Level ${Math.round((vc / VS) * 100)}%`);
    roV.set(`${vc.toFixed(2)} V`);
    roT.set(sw === 'hold' ? '—' : `${t.toFixed(2)} s`);
    drawChart();
  });

  function pop() {
    popped = true;
    build();
    const p = cap.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    fx.flash(p, '#ffe0a0', 2);
    fx.sparks(p, 40);
    fx.smoke(p, 3, 18, true);
    ctx.fail({
      title: 'What happened? The capacitor popped.',
      text: 'An electrolytic capacitor only works one way round. Backwards, its thin insulating layer breaks down: current flows inside, it heats up, gas builds pressure, and the scored vent on top bursts. Always match the stripe (−) to the lower voltage.',
      undo: () => {
        popped = false;
        reversed = false;
        cap.flip(false);
        cap.setPop(0);
        fx.clear();
        circuit.state.vc.clear();
        build();
      },
      undoLabel: 'Undo (new capacitor)',
    });
  }

  function drawChart() {
    const { ctx: g, w, h } = prepCanvas(chart);
    const tau = R * C;
    const span = Math.max(tau * 5, 0.5);
    const X = (t: number) => 34 + (t / span) * (w - 44);
    const Y = (v: number) => h - 18 - (v / VS) * (h - 30);
    g.strokeStyle = cssVar('--line');
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(34, Y(VS));
    g.lineTo(w - 10, Y(VS));
    g.moveTo(34, Y(0));
    g.lineTo(w - 10, Y(0));
    g.stroke();
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText(`${VS} V`, 2, Y(VS) + 4);
    g.fillText('0', 18, Y(0) + 4);
    // 63% line and τ marker.
    g.setLineDash([4, 4]);
    g.strokeStyle = cssVar('--brand');
    g.beginPath();
    g.moveTo(34, Y(VS * 0.632));
    g.lineTo(w - 10, Y(VS * 0.632));
    g.moveTo(X(tau), Y(0));
    g.lineTo(X(tau), Y(VS));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = cssVar('--brand');
    g.fillText('63%', 2, Y(VS * 0.632) + 4);
    g.fillText(`τ = ${tau < 1 ? (tau * 1000).toFixed(0) + ' ms' : tau.toFixed(2) + ' s'}`, Math.min(w - 70, X(tau) + 4), 12);
    g.strokeStyle = cssVar('--flow');
    g.lineWidth = 2.5;
    g.beginPath();
    curve.forEach((p, i) => {
      if (p.t > span) return;
      if (i) g.lineTo(X(p.t), Y(p.v));
      else g.moveTo(X(p.t), Y(p.v));
    });
    g.stroke();
  }

  updateFormula();
  setSw('hold');
  stage.focusObjects = [b.batGroup, res.group, cap.group, insp];
  stage.enableWater(2);
  stage.frame({ dir: new THREE.Vector3(0.12, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'tau2s') return { ok: false };
      const tau = R * C;
      if (tau >= 1.8 && tau <= 2.2) return { ok: true };
      return { ok: false, msg: `Right now R × C = ${tau.toFixed(2)} s. ${tau < 2 ? 'Make R or C bigger.' : 'Make R or C smaller.'}` };
    },
  };
}
