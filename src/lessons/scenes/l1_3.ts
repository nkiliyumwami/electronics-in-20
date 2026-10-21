import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, dense, flowAlong, jumperPts, up, WATER_FLOW } from '../kit';
import { resistor, led, contactShadow, mesh, std } from '../../three/lib';
import { currentToSpeed } from '../../three/particles';
import { Circuit, type Elem } from '../../sim/solver';
import { pipe, pump, narrowing, checkValve } from '../../three/water';
import { Multimeter } from '../../tools/multimeter';

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let broken = false;
  let connected = true;

  // ---- real view: battery → R (220 Ω) → link → red LED → back
  const b = bench(ctx);
  const H = b.bb.hole;
  const res = resistor(220, H(13, 2).distanceTo(H(9, 2)));
  res.group.position.copy(H(13, 2).lerp(H(9, 2), 0.5));
  stage.real.add(res.group);
  stage.part(res.group, { name: 'Resistor, 220 Ω', job: 'Limits the current so the LED does not burn out.', symbol: 'resistor' });
  const ledObj = led('red', 0.254);
  ledObj.group.position.copy(H(7, 2).lerp(H(6, 2), 0.5));
  ledObj.group.rotation.y = Math.PI; // anode (+, long leg) on column 7
  stage.real.add(ledObj.group);
  stage.part(ledObj.group, { name: 'LED (red)', job: 'Lights up when current flows through it the right way. Its long leg (+) is on the left.', symbol: 'led' });
  const redPts = batteryPts(b.plus, 1, H(13, 0), 0.9);
  const blackPts = batteryPts(b.minus, -1, H(6, 0), 0.9);
  addWire(ctx, redPts, 'red', 'Red wire (+ side)');
  addWire(ctx, blackPts, 'black', 'Black wire (− side)');
  const linkPts = jumperPts(H(9, 4), H(7, 4), 0.45);
  const link = addWire(ctx, linkPts, 'yellow', 'Link wire (the gap for current measurement)');

  // Particle paths: main path (open) plus the link section.
  const main = dense([
    H(7, 4), H(7, 2), up(H(7, 2), 0.6), up(H(6, 2), 0.6), H(6, 2), H(6, 0),
    ...[...blackPts].reverse(), b.minus.clone(), b.plus.clone(), ...redPts,
    H(13, 2), up(H(13, 2), 0.32), up(H(9, 2), 0.32), H(9, 2), H(9, 4),
  ].map((p) => (p.y < 0.02 ? up(p, 0.02) : p)));
  const flowMain = flowAlong(stage.real, main, undefined, { closed: false });
  const flowLink = flowAlong(stage.real, dense(linkPts), undefined, { closed: false });

  const breakBtnLabel = stage.label('gap here', stage.real, up(H(8, 4), 0.25), 'warn');
  breakBtnLabel.show(false);

  // ---- water view: pump → narrowing → (link pipe / gap) → one-way valve → back
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(6.5, 6.5));
  const y = 0.4, x0 = -1.9, x1 = 1.9, zb = -1.9, zf = 1.9;
  const gapL = -0.45, gapR = 0.05;
  const mainPipe = pipe([new THREE.Vector3(gapR, y, zf), new THREE.Vector3(x1, y, zf), new THREE.Vector3(x1, y, zb), new THREE.Vector3(x0, y, zb), new THREE.Vector3(x0, y, zf), new THREE.Vector3(gapL, y, zf)], 0.13);
  wg.add(mainPipe.mesh);
  const linkPipe = mesh(new THREE.CylinderGeometry(0.13, 0.13, gapR - gapL, 14, 1, true), mainPipe.mesh.material as THREE.Material, [(gapL + gapR) / 2, y, zf], [0, 0, Math.PI / 2]);
  wg.add(linkPipe);
  const caps = new THREE.Group();
  for (const x of [gapL, gapR]) caps.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 16), std('#c0281f', 0.5), [x, y, zf], [0, 0, Math.PI / 2]));
  caps.visible = false;
  wg.add(caps);
  const turbine = new THREE.Group();
  turbine.position.set((gapL + gapR) / 2, y, zf);
  turbine.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 20), std('#f2b51f', 0.5), [0, 0, 0], [0, 0, Math.PI / 2]));
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) blades.add(mesh(new THREE.BoxGeometry(0.04, 0.5, 0.08), std('#333', 0.5), [0.28, 0, 0], [(i * Math.PI) / 4, 0, 0]));
  turbine.add(blades);
  turbine.visible = false;
  wg.add(turbine);
  const pm = pump();
  pm.group.position.set(0, y, zb);
  wg.add(pm.group);
  const nar = narrowing(1.3, 0.13);
  nar.group.position.set(1.0, y, zf);
  nar.setNarrow(0.55);
  wg.add(nar.group);
  const valve = checkValve(0.13);
  valve.group.position.set(-1.15, y, zf);
  valve.group.rotation.y = Math.PI; // forward flow runs toward −X here
  wg.add(valve.group);
  stage.part(pm.group, { name: 'Pump (= battery)', job: 'Creates the pressure that drives the flow.', symbol: 'pump' });
  stage.part(nar.group, { name: 'Narrow pipe (= resistor)', job: 'Limits how much water flows.', symbol: 'pipe' });
  stage.part(valve.group, { name: 'One-way valve (= LED)', job: 'Lets water through in one direction only. An LED is a diode: a one-way valve for current that also glows.', symbol: 'valve' });
  stage.part(turbine, { name: 'Flow meter (= meter on amps)', job: 'Water has to pass through it to be measured, just as current must pass through an ammeter.', symbol: 'ammeter' });
  const wPath = dense([new THREE.Vector3(0, y, zb), new THREE.Vector3(x1, y, zb), new THREE.Vector3(x1, y, zf), new THREE.Vector3(x0, y, zf), new THREE.Vector3(x0, y, zb), new THREE.Vector3(-0.01, y, zb)]);
  const wFlow = flowAlong(wg, wPath, WATER_FLOW, { radius: 0.06 });
  const wLabel = stage.label('', wg, new THREE.Vector3(0, 1.6, 0), 'big water');

  // ---- meter
  const points = () => [
    { id: 'bp', label: 'Battery +', node: connected ? 'top' : 'bplus', pos: b.plus.clone().add(new THREE.Vector3(0.05, 0, 0)) },
    { id: 'c13', label: 'Resistor right leg (column 13)', node: 'top', pos: H(13, 3) },
    { id: 'c9', label: 'Resistor left leg (column 9)', node: 'rL', pos: H(9, 3) },
    { id: 'c7', label: 'LED + leg (column 7)', node: 'ledA', pos: H(7, 3) },
    { id: 'c6', label: 'LED − leg (column 6)', node: 'gnd', pos: H(6, 3) },
    { id: 'bm', label: 'Battery −', node: connected ? 'gnd' : 'bminus', pos: b.minus.clone().add(new THREE.Vector3(-0.05, 0, 0)) },
  ];
  const meter = new Multimeter(stage, stage.real, points(), { modes: ['V', 'A', 'OHM'], at: new THREE.Vector3(3.9, -0.85, 1.3), rotY: -0.5, probeY: 0 });
  meter.setProbe('red', 'c7');
  meter.setProbe('black', 'c6');

  // ---- controls
  meter.controls(panel);
  const row = panel.row();
  const breakBtn = panel.button('Break the circuit at the LED', () => setBroken(!broken), 'btn', row);
  const powerBtn = panel.button('Disconnect battery', () => setConnected(!connected), 'btn', row);
  const roI = panel.readout('Actual LED current');
  const roM = panel.readout('Meter shows');
  const note = panel.note('');

  function setBroken(v: boolean) {
    broken = v;
    link.mesh.visible = !v;
    breakBtn.textContent = v ? 'Reconnect the link' : 'Break the circuit at the LED';
    breakBtnLabel.show(v);
    solve();
  }
  function setConnected(v: boolean) {
    connected = v;
    powerBtn.textContent = v ? 'Disconnect battery' : 'Reconnect battery';
    meter.setPoints(points());
    solve();
  }

  let ledI = 0;
  let meterI = 0;
  function solve() {
    const elems: Elem[] = [
      { kind: 'R', id: 'R1', a: 'top', b: 'rL', r: 220 },
      { kind: 'SW', id: 'link', a: 'rL', b: 'ledA', closed: !broken },
      { kind: 'D', id: 'LED', a: 'ledA', k: 'gnd', vf: 2.0, rs: 0 },
      ...meter.elements(),
    ];
    if (connected) elems.push({ kind: 'V', id: 'B', p: 'top', n: 'gnd', v: 5 });
    const sol = new Circuit(elems).dc();
    meter.read(sol, connected);
    ledI = Math.max(0, sol.i('LED'));
    meterI = meter.mode === 'A' && !meter.fuseBlown ? sol.i('__meter') : 0;
    ledObj.setLight(ledI / 0.02);
    flowMain.speed = currentToSpeed(ledI, 0.004, 5);
    flowLink.speed = broken ? 0 : flowMain.speed;
    wFlow.speed = flowMain.speed;
    valve.setOpen(ledI > 1e-4 ? 1 : 0);
    linkPipe.visible = !broken;
    caps.visible = broken && !(meter.mode === 'A' && bridgesGap());
    turbine.visible = broken && meter.mode === 'A' && bridgesGap() && !meter.fuseBlown;
    roI.set(`${(ledI * 1000).toFixed(1)} mA`);
    roM.set(meter.text);
    wLabel.set(meter.mode === 'A' ? `Flow meter: ${meter.text}` : meter.mode === 'V' ? `Pressure gauge: ${meter.text}` : `Meter: ${meter.text}`);
    if (meter.mode === 'OHM' && connected) note.set('Ohms mode needs the power off. Tap "Disconnect battery" first.', 'note warn');
    else if (meter.mode === 'A' && !broken && meter.red && meter.black) note.set('Careful: in amps mode the meter is almost a wire. It belongs inside a gap, not across parts.', 'note warn');
    else note.set('', 'note');
  }
  const bridgesGap = () => {
    const a = meter.nodeOf('red');
    const c = meter.nodeOf('black');
    return (a === 'rL' && c === 'ledA') || (a === 'ledA' && c === 'rL');
  };

  meter.onChange = () => solve();
  meter.onFuseBlown = () => {
    ctx.fx.sparks(meter.group.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 30);
    ctx.fx.smoke(meter.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 1.5, 10);
    ctx.fail({
      title: "What happened? The meter's fuse blew.",
      text: 'In amps mode the meter is nearly a plain wire (0.5 Ω). Connected across parts like that, it gave the current a shortcut. Several amps rushed through, so the meter\'s 400 mA fuse blew to protect it. To measure current, break the circuit and put the meter *in the gap*.',
      undo: () => {
        // Lift the probes first, or the new fuse blows straight away.
        meter.setProbe('red', null);
        meter.setProbe('black', null);
        meter.replaceFuse();
        ctx.fx.clear();
        solve();
      },
      undoLabel: 'Replace fuse',
    });
  };

  stage.onUpdate((dt) => {
    flowMain.update(dt);
    flowLink.update(dt);
    wFlow.update(dt);
    pm.spin(dt, wFlow.speed);
    blades.rotation.x += dt * meterI * 300;
  });

  solve();
  stage.focusObjects = [b.batGroup, res.group, ledObj.group, meter.group];
  stage.enableWater(2.2);
  stage.frame({ dir: new THREE.Vector3(0.12, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'measureLedCurrent') return { ok: false };
      if (meter.fuseBlown) return { ok: false, msg: 'The meter\'s fuse is blown. Tap "Replace fuse" first.' };
      if (!connected) return { ok: false, msg: 'Reconnect the battery so current flows.' };
      if (meter.mode !== 'A') return { ok: false, msg: 'The dial is not on amps yet.' };
      if (!broken) return { ok: false, msg: 'The circuit is still closed. Break it first, so the current has to go through the meter.' };
      if (!bridgesGap()) return { ok: false, msg: 'The probes are not on the two sides of the gap (columns 9 and 7).' };
      if (Math.abs(meter.value) > 0.005) return { ok: true };
      return { ok: false, msg: `The meter shows ${meter.text}.` };
    },
  };
}
