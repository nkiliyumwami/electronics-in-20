import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, dense, flowAlong, up, FLOW_COLOR, WATER_FLOW } from '../kit';
import { mosfetTO220, motor, mesh, std, M, smallBoard, qfp, contactShadow, setHeat } from '../../three/lib';
import { Flow, currentToSpeed } from '../../three/particles';
import { mosfetR } from '../../sim/solver';
import { fmt } from '../../sim/physics';
import { pipe, pump, tapValve, checkValve } from '../../three/water';

type Load = 'strip' | 'motor';
const VCC = 12;
const VTH = 1.5;
const RON = 0.03;
const THETA = 62; // °C per W, TO-220 without a heatsink
const LOADS: Record<Load, { r: number; name: string }> = {
  strip: { r: 6, name: 'LED strip (12 V, 2 A)' },
  motor: { r: 12, name: 'Motor (12 V, 1 A)' },
};

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let vg = 0;
  let load: Load = 'strip';
  let diode = false;
  let temp = 25;
  let cooked = false;
  let smokeStop: (() => void) | null = null;
  let freewheel = 0; // visual flyback current after switch-off (A)
  let wasOn = false;
  let cleanOffs = 0;
  let sparks = 0;

  // ---- real view
  const b = bench(ctx);
  const H = b.bb.hole;
  const q = mosfetTO220();
  q.group.position.copy(H(9, 2));
  stage.real.add(q.group);
  stage.part(q.body, {
    name: 'MOSFET (N-channel)',
    job: 'A voltage-controlled switch. Gate (left leg) controls the big current from drain (middle) to source (right).',
    symbol: 'mosfet',
  });
  stage.label('G · D · S', q.group, new THREE.Vector3(0, -0.15, 0.35));
  const tLabel = stage.label('', q.group, new THREE.Vector3(0, 2.4, 0), 'big');

  // Microcontroller board on the left.
  const mcu = new THREE.Group();
  mcu.position.set(-4.3, -0.6, 0.4);
  mcu.add(smallBoard(1.8, 1.4, '#1d4f91'));
  const chip = qfp(0.6, 5);
  mcu.add(chip.group);
  const pinPad = mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), M.gold(), [0.75, 0.03, 0.45]);
  mcu.add(pinPad);
  stage.real.add(mcu);
  stage.part(mcu, { name: 'Microcontroller board', job: 'Its pin can give 3.3 V but only a few milliamps: plenty for a gate, far too little for the load.', symbol: 'chip', actions: () => [{ label: vg > 2 ? 'Set pin LOW' : 'Set pin HIGH', run: () => setGate(vg > 2 ? 0 : 3.3) }] });
  const pinLabel = stage.label('', mcu, new THREE.Vector3(0.75, 0.55, 0.45));
  const gatePts = [new THREE.Vector3(-4.3 + 0.75, -0.55, 0.85), new THREE.Vector3(-3.2, 0.5, 0.85), up(H(8, 4), 0.5), H(8, 4)];
  addWire(ctx, gatePts, 'yellow', 'Gate wire (3.3 V signal)');

  // Loads in front of the board.
  const loadGroup = new THREE.Group();
  loadGroup.position.set(0.8, -0.85, 2.8);
  stage.real.add(loadGroup);
  const strip = new THREE.Group();
  strip.add(mesh(new THREE.BoxGeometry(4.2, 0.03, 0.32), std('#f4f4f0', 0.6), [0, 0.02, 0]));
  const ledMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 12; i++) {
    const m = std('#fff8e6', 0.3, 0, { emissive: new THREE.Color('#ffe9b0'), emissiveIntensity: 0 });
    ledMats.push(m);
    strip.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), m, [-1.9 + i * 0.345, 0.06, 0]));
  }
  const stripLight = new THREE.PointLight('#ffe9b0', 0, 4);
  stripLight.position.set(0, 0.6, 0);
  strip.add(stripLight);
  loadGroup.add(strip);
  const mot = motor();
  mot.group.position.set(0, 0, 0);
  loadGroup.add(mot.group);
  stage.part(strip, { name: 'LED strip (12 V, 2 A)', job: 'A big load: far more current than any chip pin can supply.', symbol: 'led' });
  stage.part(mot.group, { name: 'Motor (12 V, 1 A)', job: 'A big load that is also a coil, so it kicks back when switched off.', symbol: 'motor' });
  // Flyback diode (axial, black body + silver band) across the load.
  const fd = new THREE.Group();
  fd.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.45, 16), std('#1d1d1f', 0.4), [0, 0.12, 0], [0, 0, Math.PI / 2]));
  fd.add(mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.06, 16), std('#d6d9de', 0.3, 0.6), [0.17, 0.12, 0], [0, 0, Math.PI / 2]));
  fd.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 6), M.lead(), [0, 0.12, 0], [0, 0, Math.PI / 2]));
  fd.position.set(0.8, -0.85, 3.7);
  fd.visible = false;
  stage.real.add(fd);
  stage.part(fd, { name: 'Flyback diode', job: 'Sits across the coil, pointing back to +. It does nothing while the motor runs, then catches the coil\'s current at switch-off.', symbol: 'diode' });

  // Wiring: battery + → load → drain; source → battery −.
  const loadL = new THREE.Vector3(-1.4, -0.75, 2.8);
  const loadR = new THREE.Vector3(3.0, -0.75, 2.8);
  const pPts = [b.plus.clone(), b.plus.clone().add(new THREE.Vector3(0.4, 0, 0)), new THREE.Vector3(3.6, -0.2, b.plus.z), new THREE.Vector3(3.6, -0.2, 2.8), loadR];
  const dPts = [loadL, new THREE.Vector3(-1.8, 0.4, 2.8), up(H(9, 4), 0.4), H(9, 4)];
  const sPts = [H(10, 0), up(H(10, 0), 0.8), new THREE.Vector3(b.minus.x - 0.4, 0.8, b.minus.z), new THREE.Vector3(b.minus.x - 0.4, b.minus.y, b.minus.z), b.minus.clone()];
  addWire(ctx, pPts, 'red', '12 V wire to the load');
  addWire(ctx, dPts, 'blue', 'Load to drain');
  addWire(ctx, sPts, 'black', 'Source to battery −');
  const s = (p: THREE.Vector3) => up(p, 0.02);
  const mainFlow = flowAlong(stage.real, dense([...pPts, new THREE.Vector3(0.8, -0.6, 2.8), ...dPts, s(H(9, 2)), up(H(9, 2), 0.6), up(H(10, 2), 0.6), s(H(10, 2)), ...sPts.slice(0)]), FLOW_COLOR, { closed: false });
  const fwFlow = new Flow(new THREE.CatmullRomCurve3(dense([loadL, new THREE.Vector3(-1.4, -0.75, 3.7), new THREE.Vector3(3.0, -0.75, 3.7), loadR, new THREE.Vector3(0.8, -0.6, 2.8), loadL]), true, 'catmullrom', 0.05), { color: '#7fe0ff', spacing: 0.3, radius: 0.05 });
  stage.real.add(fwFlow.mesh);
  fwFlow.mesh.visible = false;
  const iLabel = stage.label('', stage.real, new THREE.Vector3(0.8, 0.4, 2.8), 'big');
  stage.label('12 V', b.batGroup, new THREE.Vector3(0.1, 2.15, 0), 'big');
  b.bat.setVoltage(VCC, 12);

  // ---- water view: pump → water wheel (load) → tap (MOSFET) worked by a small hand
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(7, 6));
  const wy = 0.5;
  const pm = pump();
  pm.group.position.set(-2, wy, -1.5);
  wg.add(pm.group);
  const loop = [new THREE.Vector3(-1.45, wy, -1.5), new THREE.Vector3(2, wy, -1.5), new THREE.Vector3(2, wy, 1.6), new THREE.Vector3(-2, wy, 1.6), new THREE.Vector3(-2, wy, -0.95)];
  wg.add(pipe(loop, 0.16).mesh);
  const wheel = new THREE.Group();
  wheel.position.set(2, wy, 0);
  for (let i = 0; i < 8; i++) {
    const paddle = new THREE.Group();
    paddle.rotation.x = (i * Math.PI) / 4;
    paddle.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.18), std('#e05a2a', 0.5), [0, 0.3, 0]));
    wheel.add(paddle);
  }
  wg.add(wheel);
  const tap = tapValve(0.16);
  tap.group.position.set(0, wy, 1.6);
  wg.add(tap.group);
  const wBypass = pipe([new THREE.Vector3(2, wy, -0.9), new THREE.Vector3(2.8, wy, -0.9), new THREE.Vector3(2.8, wy, 0.9), new THREE.Vector3(2, wy, 0.9)], 0.1);
  const wcv = checkValve(0.1);
  wcv.group.position.set(2.8, wy, 0);
  wcv.group.rotation.y = Math.PI / 2;
  wg.add(wBypass.mesh, wcv.group);
  stage.part(tap.group, { name: 'Tap with a small hand (= MOSFET)', job: 'A small effort at the handle (the gate) controls a big flow. Half-open, the tap gets hot from the rushing water.', symbol: 'tap' });
  stage.part(wheel, { name: 'Water wheel (= load)', job: 'The big thing being powered.', symbol: 'motor' });
  stage.part(wBypass.mesh, { name: 'Bypass loop (= flyback diode)', job: 'When the tap slams shut, the spinning wheel keeps pushing water. This loop lets it circle safely instead of hammering the pipes.', symbol: 'valve' });
  const wflow = flowAlong(wg, dense([...loop, new THREE.Vector3(-1.45, wy, -1.5)]), WATER_FLOW, { radius: 0.08 });
  const wl = stage.label('', tap.group, new THREE.Vector3(0, 1.3, 0), 'big water');

  // ---- controls
  const row = panel.row();
  const pinBtn = panel.button('Set the pin HIGH (3.3 V)', () => setGate(vg > 2 ? 0 : 3.3), 'btn primary', row);
  const gS = panel.slider({ label: 'Gate voltage', min: 0, max: 3.3, step: 0.05, value: vg, nudge: true, format: (v) => `${v.toFixed(2)} V`, onInput: (v) => setGate(v, false) });
  panel.segmented('Load', [{ value: 'strip', label: 'LED strip (2 A)' }, { value: 'motor', label: 'Motor (1 A)' }], load, (v) => setLoad(v as Load));
  const dBtn = panel.toggle('Flyback diode fitted', diode, (v) => { diode = v; fd.visible = v; wBypass.mesh.visible = v; wcv.group.visible = v; });
  void dBtn;
  const roI = panel.readout('Load current');
  const roR = panel.readout('MOSFET resistance');
  const roP = panel.readout('Heat in MOSFET');
  const roT = panel.readout('MOSFET temperature');
  const roG = panel.readout('Gate current');

  function setGate(v: number, syncSlider = true) {
    vg = v;
    if (syncSlider) gS.set(v);
    pinBtn.textContent = vg > 2 ? 'Set the pin LOW (0 V)' : 'Set the pin HIGH (3.3 V)';
    solve();
  }
  function setLoad(l: Load) {
    load = l;
    strip.visible = l === 'strip';
    mot.group.visible = l === 'motor';
    solve();
  }

  let I = 0;
  let Rds = 1e12;
  let P = 0;
  function solve() {
    Rds = cooked ? 1e12 : mosfetR(vg, VTH, RON);
    I = VCC / (LOADS[load].r + Rds);
    P = I * I * Rds;
    const on = vg >= VTH + 1.3 && !cooked;
    const gateOff = vg <= VTH;
    if (wasOn && gateOff) switchedOff();
    if (on) wasOn = true;
    if (gateOff) wasOn = false;
    const off = I < 1e-6;
    roI.set(off ? '0 A (off)' : fmt(I, 'A'));
    roR.set(Rds > 1e9 ? 'open (off)' : fmt(Rds, 'Ω'));
    roP.set(`${P.toFixed(2)} W`, P > 2 ? 'bad' : P > 0.5 ? 'warn' : '');
    roG.set('≈ 0 mA (gates draw almost nothing)');
    pinLabel.set(vg > 2.9 ? 'pin HIGH' : vg < 0.1 ? 'pin LOW' : `pin ${vg.toFixed(1)} V`);
    iLabel.set(off ? 'load off' : `${fmt(I, 'A')} through the load`);
  }

  function switchedOff() {
    if (load !== 'motor') return;
    const iWas = VCC / (LOADS.motor.r + RON);
    if (diode) {
      freewheel = iWas;
      cleanOffs++;
    } else {
      sparks++;
      const p = q.group.position.clone().add(new THREE.Vector3(0, 0.4, 0.2));
      fx.flash(p, '#bfe3ff', 2.2);
      fx.sparks(p, 45, '#cfe8ff');
      ctx.fxWater.sparks(tap.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 25, '#9fd4ff');
      ctx.fail({
        title: 'Spark! What happened?',
        text: "The motor is a coil, and a coil's current cannot stop instantly. When the MOSFET snapped off, that current had nowhere to go, so the voltage at the drain shot far above 12 V until it arced. Every spark like that wears the MOSFET down.",
        undo: () => {
          diode = true;
          fd.visible = true;
          wBypass.mesh.visible = true;
          wcv.group.visible = true;
          dBtn.set(true);
        },
        undoLabel: 'Fit a flyback diode',
      });
    }
  }

  stage.onUpdate((dt) => {
    // Thermal: first-order lag towards 25 °C + P·θ.
    const tgt = 25 + P * THETA;
    temp += (tgt - temp) * Math.min(1, dt / 2.5);
    setHeat(q.bodyMat, (temp - 60) / 160);
    tLabel.set(`${temp.toFixed(0)} °C`, temp > 125 ? 'bad' : temp > 70 ? 'warn' : '');
    roT.set(`${temp.toFixed(0)} °C`, temp > 125 ? 'bad' : temp > 70 ? 'warn' : '');
    if (temp > 150 && !smokeStop && !cooked) smokeStop = fx.smoke(q.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), Infinity, 8);
    if (temp < 140 && smokeStop) {
      smokeStop();
      smokeStop = null;
    }
    if (temp > 175 && !cooked) cook();
    // Flows.
    freewheel *= Math.exp(-dt / 0.5);
    if (freewheel < 0.01) freewheel = 0;
    mainFlow.speed = currentToSpeed(I, 0.25, 7);
    mainFlow.update(dt);
    fwFlow.mesh.visible = freewheel > 0;
    fwFlow.speed = currentToSpeed(freewheel, 0.25, 7);
    fwFlow.update(dt);
    const lit = load === 'strip' ? Math.min(1, I / 2) : 0;
    ledMats.forEach((m) => (m.emissiveIntensity = lit * 3));
    stripLight.intensity = lit * 3;
    if (load === 'motor') mot.shaft.rotation.x += dt * (I + freewheel) * 30;
    // Water twin.
    const open = Rds > 1e9 ? 0 : Math.min(1, Math.max(0, (vg - VTH) / 1.3));
    tap.setOpen(open);
    wflow.speed = mainFlow.speed;
    wflow.update(dt);
    pm.spin(dt, wflow.speed);
    pm.setPressure(VCC / 14);
    wheel.rotation.x += dt * (I + freewheel) * 6;
    wcv.setOpen(freewheel > 0 ? 1 : 0);
    wl.set(open >= 1 ? 'tap fully open: cool' : open <= 0 ? 'tap shut' : 'half open: getting hot!', open > 0 && open < 1 ? 'bad' : 'water');
  });

  function cook() {
    cooked = true;
    smokeStop?.();
    smokeStop = null;
    fx.smoke(q.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 4, 20, true);
    solve();
    ctx.fail({
      title: 'What happened? The MOSFET cooked.',
      text: `Half-on, the MOSFET acted like a resistor of about ${fmt(mosfetR(vg, VTH, RON), 'Ω')} carrying ${fmt(VCC / (LOADS[load].r + mosfetR(vg, VTH, RON)), 'A')}. That turned several watts into heat in a tiny package, and it passed 175 °C. Drive the gate fully on (3.3 V) or fully off (0 V).`,
      undo: () => {
        cooked = false;
        temp = 25;
        fx.clear();
        setGate(0);
      },
      undoLabel: 'Undo (new MOSFET, gate off)',
    });
  }

  setLoad('strip');
  setGate(0);
  wBypass.mesh.visible = false;
  wcv.group.visible = false;
  stage.focusObjects = [b.batGroup, q.group, mcu, loadGroup];
  stage.enableWater(2.2);
  stage.hint(mcu, 'Tap the board');
  stage.frame({ dir: new THREE.Vector3(0.1, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'motorOffSafe') return { ok: false };
      if (cleanOffs > 0) return { ok: true };
      if (load !== 'motor') return { ok: false, msg: 'Choose the motor as the load first.' };
      if (!diode) return { ok: false, msg: 'There is no flyback diode yet.' };
      return { ok: false, msg: 'Now switch the motor on, then off.' };
    },
  };
}
