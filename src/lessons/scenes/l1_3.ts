import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { dense, espBench, flowAlong, up, WATER_FLOW } from '../kit';
import { resistor, led, contactShadow, mesh, std } from '../../three/lib';
import { jumperRoute } from '../../three/iot';
import { currentToSpeed } from '../../three/particles';
import { Circuit, type Elem } from '../../sim/solver';
import { pipe, pump, narrowing, checkValve } from '../../three/water';
import { Multimeter } from '../../tools/multimeter';

// 1.3 Using a multimeter: ESP32 3V3 → 220 Ω → link wire → red LED → GND.
export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let broken = false;
  let connected = true;

  // ---- real view
  const b = espBench(ctx);
  const H = b.H;
  const v33 = b.free('3V3'), gndPin = b.free('GND');
  const railP = (c: number) => H(c, 'bot+');
  const railN = (c: number) => H(c, 'bot-');
  b.jumper(v33, railP(1), 'red', 'ESP32 3V3 to the red rail', 'Puts the ESP32\'s 3.3 V on the red (+) rail.', 0.5);
  b.jumper(gndPin, railN(2), 'black', 'ESP32 GND to the blue rail', 'Puts GND on the blue (−) rail.', 0.5);
  b.jumper(railP(17), H(17, 9), 'red', 'Red rail to the resistor', 'Brings 3.3 V from the rail to the resistor\'s column.', 0.5);
  const res = resistor(220, H(17, 6).distanceTo(H(21, 6)));
  res.group.position.copy(H(17, 6).lerp(H(21, 6), 0.5));
  b.bb.group.add(res.group);
  stage.part(res.group, { name: 'Resistor, 220 Ω', job: 'Limits the current so the LED does not burn out.', symbol: 'resistor' });
  const link = b.jumper(H(21, 8), H(23, 8), 'yellow', 'Link wire (the gap for current measurement)', 'Joins the resistor to the LED. Pull it out to measure current through the gap.', 0.45);
  const ledObj = led('red');
  ledObj.group.position.copy(H(23, 6).lerp(H(24, 6), 0.5));
  b.bb.group.add(ledObj.group);
  stage.part(ledObj.group, { name: 'LED (red)', job: 'Lights when current flows through it the right way. Its long leg (+) is on the left.', symbol: 'led' });
  b.jumper(H(24, 8), railN(24), 'black', 'LED to the blue rail', 'Takes the current back to GND.', 0.5);
  b.tag('3V3');
  b.tag('GND');

  // Particles: the main path (open at the gap) plus the link section.
  const main = dense([
    up(H(23, 8), 0.05),
    up(H(23, 6), 0.6),
    up(H(24, 6), 0.6),
    up(H(24, 8), 0.05),
    ...jumperRoute(H(24, 8), railN(24), 0.5),
    up(railN(24), 0.04),
    up(railN(2), 0.04),
    ...jumperRoute(railN(2), gndPin, 0.5),
    up(gndPin, 0.2),
    up(v33, 0.2),
    ...jumperRoute(v33, railP(1), 0.5),
    up(railP(1), 0.04),
    up(railP(17), 0.04),
    ...jumperRoute(railP(17), H(17, 9), 0.5),
    up(H(17, 6), 0.32),
    up(H(21, 6), 0.32),
    up(H(21, 8), 0.05),
  ]);
  const flowMain = flowAlong(stage.real, main, undefined, { closed: false });
  const flowLink = flowAlong(stage.real, dense(jumperRoute(H(21, 8), H(23, 8), 0.45)), undefined, { closed: false });
  const gapLabel = stage.label('gap here', b.bb.group, up(H(22, 8), 0.3), 'warn');
  gapLabel.show(false);

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
  stage.part(pm.group, { name: 'Pump (= the 3V3 pin)', job: 'Creates the pressure (3.3) that drives the flow.', symbol: 'pump' });
  stage.part(nar.group, { name: 'Narrow pipe (= resistor)', job: 'Limits how much water flows.', symbol: 'pipe' });
  stage.part(valve.group, { name: 'One-way valve (= LED)', job: 'Lets water through in one direction only. An LED is a diode: a one-way valve for current that also glows.', symbol: 'valve' });
  stage.part(turbine, { name: 'Flow meter (= meter on amps)', job: 'Water has to pass through it to be measured, just as current must pass through the meter.', symbol: 'ammeter' });
  const wPath = dense([new THREE.Vector3(0, y, zb), new THREE.Vector3(x1, y, zb), new THREE.Vector3(x1, y, zf), new THREE.Vector3(x0, y, zf), new THREE.Vector3(x0, y, zb), new THREE.Vector3(-0.01, y, zb)]);
  const wFlow = flowAlong(wg, wPath, WATER_FLOW, { radius: 0.06 });
  const wLabel = stage.label('', wg, new THREE.Vector3(0, 1.6, 0), 'big water');

  // ---- meter
  const points = () => [
    { id: 'p33', label: '3V3 (red rail)', node: connected ? 'top' : 'esp33', pos: railP(9) },
    { id: 'c18', label: 'Resistor, top leg (column 18)', node: 'top', pos: H(17, 5) },
    { id: 'c22', label: 'Resistor, other leg (column 22)', node: 'rL', pos: H(21, 5) },
    { id: 'c24', label: 'LED + leg (column 24)', node: 'ledA', pos: H(23, 5) },
    { id: 'c25', label: 'LED − leg (column 25)', node: 'gnd', pos: H(24, 5) },
    { id: 'gnd', label: 'GND (blue rail)', node: connected ? 'gnd' : 'espgnd', pos: railN(9) },
  ];
  const meter = new Multimeter(stage, stage.real, points(), { modes: ['V', 'A', 'OHM'], at: new THREE.Vector3(2.4, -0.85, 4.6), rotY: -0.25, probeY: 0 });
  meter.setProbe('red', 'p33');
  meter.setProbe('black', 'gnd');

  // ---- controls
  meter.controls(panel);
  const row = panel.row();
  const breakBtn = panel.button('Pull out the link wire', () => setBroken(!broken), 'btn', row);
  const powerBtn = panel.button('Unplug USB', () => setConnected(!connected), 'btn', row);
  const roI = panel.readout('Actual LED current');
  const roM = panel.readout('Meter shows');
  const note = panel.note('');

  function setBroken(v: boolean) {
    broken = v;
    link.group.visible = !v;
    breakBtn.textContent = v ? 'Put the link wire back' : 'Pull out the link wire';
    gapLabel.show(v);
    solve();
  }
  function setConnected(v: boolean) {
    connected = v;
    powerBtn.textContent = v ? 'Unplug USB' : 'Plug USB back in';
    b.esp.setPower(v);
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
    if (connected) elems.push({ kind: 'V', id: 'USB', p: 'top', n: 'gnd', v: 3.3 });
    const sol = new Circuit(elems).dc();
    meter.read(sol, connected);
    ledI = Math.max(0, sol.i('LED'));
    meterI = meter.mode === 'A' && !meter.fuseBlown ? sol.i('__meter') : 0;
    ledObj.setLight(ledI / 0.01);
    flowMain.speed = currentToSpeed(ledI, 0.003, 5);
    flowLink.speed = broken ? 0 : flowMain.speed;
    wFlow.speed = flowMain.speed;
    valve.setOpen(ledI > 1e-4 ? 1 : 0);
    linkPipe.visible = !broken;
    caps.visible = broken && !(meter.mode === 'A' && bridgesGap());
    turbine.visible = broken && meter.mode === 'A' && bridgesGap() && !meter.fuseBlown;
    pm.setPressure(connected ? 0.66 : 0);
    roI.set(`${(ledI * 1000).toFixed(1)} mA`);
    roM.set(meter.text);
    wLabel.set(meter.mode === 'A' ? `Flow meter: ${meter.text}` : meter.mode === 'V' ? `Pressure gauge: ${meter.text}` : `Meter: ${meter.text}`);
    if (meter.mode === 'OHM' && connected) note.set('Ohms mode needs the power off. Tap "Unplug USB" first.', 'note warn');
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
    b.esp.setPower(false);
    ctx.fail({
      title: "What happened? The meter's fuse blew.",
      text: 'In amps mode the meter is nearly a plain wire (0.5 Ω). Across 3V3 and GND, or across parts, it gave the current a shortcut. A big current rushed through, so the meter\'s 400 mA fuse blew, and the ESP32 browned out. To measure current, pull out the link and put the meter *in the gap*.',
      undo: () => {
        // Lift the probes first, or the new fuse blows straight away.
        meter.setProbe('red', null);
        meter.setProbe('black', null);
        meter.replaceFuse();
        b.esp.setPower(connected);
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
  stage.focusObjects = [b.bb.group, meter.group];
  stage.enableWater(2.2, 'real');
  stage.hint(meter.probe('red'), 'Drag me onto the circuit');
  stage.frame({ dir: new THREE.Vector3(0.05, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'measureLedCurrent') return { ok: false };
      if (meter.fuseBlown) return { ok: false, msg: 'The meter\'s fuse is blown. Tap "Replace fuse" first.' };
      if (!connected) return { ok: false, msg: 'Plug the USB back in so current flows.' };
      if (meter.mode !== 'A') return { ok: false, msg: 'The dial is not on amps yet.' };
      if (!broken) return { ok: false, msg: 'The circuit is still closed. Pull out the link first, so the current has to go through the meter.' };
      if (!bridgesGap()) return { ok: false, msg: 'The probes are not on the two sides of the gap (columns 22 and 24).' };
      if (Math.abs(meter.value) > 0.004) return { ok: true };
      return { ok: false, msg: `The meter shows ${meter.text}.` };
    },
  };
}
