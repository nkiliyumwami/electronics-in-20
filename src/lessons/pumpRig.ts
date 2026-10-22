import * as THREE from 'three';
import type { SceneCtx } from './types';
import { dense, espBench, flowAlong, WATER_FLOW } from './kit';
import { contactShadow, mesh, mosfetTO220, resistor, setHeat, std, wire } from '../three/lib';
import { axialDiode, jumperRoute, pottedPlant, pumpInCup, relayModule } from '../three/iot';
import { currentToSpeed, Flow } from '../three/particles';
import { mosfetR } from '../sim/solver';
import { pipe, pump, tapValve, checkValve } from '../three/water';

// Shared by 4.2 and 4.3: the ESP32 switches Plant Buddy's pump through a
// logic-level MOSFET (IRLZ44N). Gate on D26 via 220 Ω, 10 kΩ pull-down,
// pump on the 5 V (VIN) rail, optional flyback diode across the pump.
export const VTH = 1.5;
export const RON = 0.03;
export const THETA = 62; // °C per W, TO-220 without a heatsink
export const LOADS = {
  small: { v: 5, r: 5 / 0.15, name: 'Plant Buddy pump (5 V, 150 mA)' },
  big: { v: 12, r: 12, name: 'Bigger pump (12 V, 1 A)' },
} as const;
export type LoadKey = keyof typeof LOADS;
export const PIN_R = 25; // Ω, a GPIO pin's own resistance when driving hard
export const PIN_MAX = 0.04;

export interface PumpRig {
  /** Gate voltage (0–3.3 V). */
  setGate(v: number): void;
  setLoad(l: LoadKey): void;
  setDiode(on: boolean): void;
  /** true: the pump hangs straight off D26 (no MOSFET). */
  setDirect(on: boolean): void;
  readonly state: { vg: number; load: LoadKey; diode: boolean; direct: boolean; temp: number; cooked: boolean; I: number; P: number; Rds: number; cleanOffs: number; pinI: number };
  onSwitchOff: ((withDiode: boolean, amps: number) => void) | null;
  onCook: (() => void) | null;
  onPinOverload: ((amps: number) => void) | null;
  mosfet: THREE.Object3D;
  bench: ReturnType<typeof espBench>;
  readouts(): void;
  update(dt: number): void;
  reset(): void;
  relay: THREE.Group;
}

export function pumpRig(ctx: SceneCtx, opts: { relay?: boolean } = {}): PumpRig {
  const { stage, fx } = ctx;
  const st = { vg: 0, load: 'small' as LoadKey, diode: false, direct: false, temp: 25, cooked: false, I: 0, P: 0, Rds: 1e12, cleanOffs: 0, pinI: 0 };
  let wasOn = false;
  let freewheel = 0;
  let smokeStop: (() => void) | null = null;

  const b = espBench(ctx);
  const H = b.H;
  // Power: VIN (5 V from USB) to the back red rail, GND to the back blue rail.
  b.jumper(b.free('VIN'), H(1, 'top+'), 'red', 'VIN (5 V) to the back red rail', 'On USB power, VIN carries 5 V. This rail feeds the pump.', 0.5);
  b.jumper(b.free('GND2'), H(2, 'top-'), 'black', 'GND to the back blue rail', 'Puts GND on the back blue rail.', 0.5);
  const railTag = stage.label('5 V rail', b.bb.group, H(9, 'top+').setY(0.5), 'pin');
  void railTag;
  // MOSFET with G, D, S in columns 21, 22, 23.
  const q = mosfetTO220();
  q.group.position.copy(H(21, 2));
  b.bb.group.add(q.group);
  stage.part(q.body, { name: 'MOSFET (IRLZ44N, logic-level)', job: 'An electronic switch. The gate (left leg) takes almost no current; the pump\'s current flows drain (middle) → source (right).', symbol: 'mosfet' });
  stage.label('G · D · S', q.group, new THREE.Vector3(0, -0.15, 0.4), 'pin');
  const tLabel = stage.label('', q.group, new THREE.Vector3(0, 2.5, 0), 'big');
  const gateParts = new THREE.Group();
  b.bb.group.add(gateParts);
  const rg = resistor(220, H(16, 1).distanceTo(H(20, 1)));
  rg.group.position.copy(H(16, 1).lerp(H(20, 1), 0.5));
  const rpd = resistor(10000, H(20, 4).distanceTo(H(24, 4)));
  rpd.group.position.copy(H(20, 4).lerp(H(24, 4), 0.5));
  gateParts.add(rg.group, rpd.group);
  stage.part(rg.group, { name: 'Gate resistor (220 Ω)', job: 'Softens the current spike as the gate charges.', symbol: 'resistor' });
  stage.part(rpd.group, { name: 'Pull-down (10 kΩ)', job: 'Holds the gate at 0 V while the ESP32 boots, so the pump never starts by accident.', symbol: 'resistor' });
  const sigJ = b.jumper(b.free('D26'), H(16, 0), 'yellow', 'D26 to the gate resistor', 'Carries the 3.3 V control signal.', 0.6);
  const pdJ = b.jumper(H(24, 0), H(24, 'top-'), 'black', 'Pull-down to GND', '', 0.5);
  const srcJ = b.jumper(H(22, 0), H(22, 'top-'), 'black', 'Source to GND', 'The pump\'s current returns to GND through here.', 0.5);
  gateParts.add(sigJ.group, pdJ.group, srcJ.group);
  b.tag('D26');
  b.tag('VIN');

  // Pump in its cup behind the board, watering the plant.
  const cup = pumpInCup();
  cup.group.scale.setScalar(0.7);
  cup.group.position.set(5.6, -0.85, -4.6);
  b.bb.group.add(cup.group);
  stage.part(cup.group, { name: 'Pump (in a cup of water)', job: 'A small DC pump: about 150 mA at 5 V. A coil inside spins the impeller.', symbol: 'motor' });
  const plant = pottedPlant();
  plant.group.scale.setScalar(0.7);
  plant.group.position.set(8.4, -0.85, -4.6);
  plant.setMoisture(0.25);
  b.bb.group.add(plant.group);
  stage.part(plant.group, { name: 'Plant', job: 'Gets watered when the pump runs.', symbol: 'sensor' });
  const leadTop = cup.leads.clone().multiplyScalar(0.7).add(cup.group.position);
  const routeTo = (to: THREE.Vector3) => [leadTop, leadTop.clone().setY(1.6), to.clone().setY(1.4), to.clone().setY(0.6), to.clone()];
  const plusLead = wire(routeTo(H(27, 'top+')), 'red', 0.04, 0.3);
  const minusLead = wire(routeTo(H(21, 0)), 'blue', 0.04, 0.3);
  b.bb.group.add(plusLead.mesh, minusLead.mesh);
  stage.part(plusLead.mesh, { name: 'Pump + lead (from 5 V)', job: 'Brings 5 V from the rail to the pump.', symbol: 'wire' });
  stage.part(minusLead.mesh, { name: 'Pump − lead (to the drain)', job: 'The MOSFET switches this side of the pump to GND.', symbol: 'wire' });
  const direct = wire(routeTo(b.free('D26').clone().add(new THREE.Vector3(0, 0, -0.01))), 'yellow', 0.04, 0.3);
  direct.mesh.visible = false;
  b.bb.group.add(direct.mesh);
  // Flyback diode: anode on the drain column (22), cathode (band) on column 26 → 5 V rail.
  const fd = new THREE.Group();
  const dio = axialDiode(H(21, 3).distanceTo(H(25, 3)));
  dio.group.position.copy(H(21, 3).lerp(H(25, 3), 0.5));
  const dJ = b.jumper(H(25, 1), H(25, 'top+'), 'red', 'Diode to 5 V', '', 0.5);
  fd.add(dio.group, dJ.group);
  fd.visible = false;
  b.bb.group.add(fd);
  stage.part(dio.group, { name: 'Flyback diode (1N5819)', job: 'Across the pump, band towards +5 V. It does nothing while the pump runs, then catches the coil\'s current at switch-off.', symbol: 'diode' });
  const relay = new THREE.Group();
  if (opts.relay) {
    const r = relayModule();
    r.group.scale.setScalar(0.8);
    relay.add(r.group);
    relay.position.set(-6.4, -0.85, 3.6);
    b.bb.group.add(relay);
    stage.part(relay, { name: 'Relay module (for comparison)', job: 'A switch flipped by an electromagnet, with the ESP32 side and the load side kept apart. Its coil needs a flyback diode too; modules have one built in. Low voltages only in this course.', symbol: 'switch' });
  }

  // Current paths: rail → pump → drain → MOSFET → source → GND.
  const s = (p: THREE.Vector3) => p.clone().setY(p.y + 0.04);
  const mainPts = dense([s(H(27, 'top+')), ...routeTo(H(27, 'top+')).reverse(), ...routeTo(H(21, 0)), s(H(21, 2)).setY(0.6), s(H(22, 2)).setY(0.6), ...jumperRoute(H(22, 0), H(22, 'top-'), 0.5)]);
  const mainFlow = flowAlong(stage.real, mainPts.map((p) => p.clone().add(b.bb.group.position)), undefined, { closed: false });
  const fwPts = dense([s(H(21, 3)).setY(0.3), s(H(25, 3)).setY(0.3), ...jumperRoute(H(25, 1), H(25, 'top+'), 0.5), s(H(27, 'top+')), ...routeTo(H(27, 'top+')).reverse(), ...routeTo(H(21, 0)), s(H(21, 3)).setY(0.3)]);
  const fwFlow = new Flow(new THREE.CatmullRomCurve3(fwPts, true, 'catmullrom', 0.05), { color: '#7fe0ff', spacing: 0.3, radius: 0.05 });
  b.bb.group.add(fwFlow.mesh);
  fwFlow.mesh.visible = false;
  const iLabel = stage.label('', cup.group, new THREE.Vector3(0, 6.5, 0), 'big');

  // ---- water view: pump → water wheel (load) → tap (MOSFET); bypass loop = flyback diode
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
  wBypass.mesh.visible = wcv.group.visible = false;
  stage.part(tap.group, { name: 'Tap with a small hand (= MOSFET)', job: 'A small effort at the handle (the gate) controls a big flow. Half-open, the tap gets hot from the rushing water.', symbol: 'tap' });
  stage.part(wheel, { name: 'Water wheel (= pump)', job: 'The big thing being powered. It is heavy: once spinning, it keeps pushing.', symbol: 'motor' });
  stage.part(wBypass.mesh, { name: 'Bypass loop (= flyback diode)', job: 'When the tap slams shut, the spinning wheel keeps pushing water. This loop lets it circle safely instead of hammering the pipes.', symbol: 'valve' });
  const wflow = flowAlong(wg, dense([...loop, new THREE.Vector3(-1.45, wy, -1.5)]), WATER_FLOW, { radius: 0.08 });
  const wl = stage.label('', tap.group, new THREE.Vector3(0, 1.3, 0), 'big water');

  const rig: PumpRig = {
    state: st,
    onSwitchOff: null,
    onCook: null,
    onPinOverload: null,
    mosfet: q.group,
    bench: b,
    relay,
    setGate(v) {
      st.vg = v;
      solve();
    },
    setLoad(l) {
      st.load = l;
      solve();
    },
    setDiode(on) {
      st.diode = on;
      fd.visible = on;
      wBypass.mesh.visible = wcv.group.visible = on;
    },
    setDirect(on) {
      st.direct = on;
      q.group.visible = gateParts.visible = !on;
      minusLead.mesh.visible = !on;
      direct.mesh.visible = on;
      solve();
    },
    readouts() {},
    update(dt) {
      const tgt = 25 + st.P * THETA;
      st.temp += (tgt - st.temp) * Math.min(1, dt / 2.5);
      setHeat(q.bodyMat, (st.temp - 60) / 160);
      tLabel.set(st.direct ? '' : `${st.temp.toFixed(0)} °C`, st.temp > 125 ? 'bad' : st.temp > 70 ? 'warn' : '');
      if (st.temp > 150 && !smokeStop && !st.cooked) smokeStop = fx.smoke(q.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), Infinity, 8);
      if (st.temp < 140 && smokeStop) {
        smokeStop();
        smokeStop = null;
      }
      if (st.temp > 175 && !st.cooked) {
        st.cooked = true;
        smokeStop?.();
        smokeStop = null;
        fx.smoke(q.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 4, 20, true);
        solve();
        rig.onCook?.();
      }
      freewheel *= Math.exp(-dt / 0.5);
      if (freewheel < 0.005) freewheel = 0;
      const ref = LOADS[st.load].v / LOADS[st.load].r / 2;
      mainFlow.speed = currentToSpeed(st.I, ref, 7);
      mainFlow.update(dt);
      fwFlow.mesh.visible = freewheel > 0;
      fwFlow.speed = currentToSpeed(freewheel, ref, 7);
      fwFlow.update(dt);
      const running = st.I > 0.6 * (LOADS[st.load].v / LOADS[st.load].r);
      cup.setRunning(running, stage.time);
      if (running) plant.setMoisture(Math.min(1, 0.25 + ((stage.time * 0.05) % 0.75)));
      iLabel.set(st.I < 1e-4 ? 'pump off' : running ? `pumping: ${(st.I * 1000).toFixed(0)} mA` : `${(st.I * 1000).toFixed(0)} mA: too weak to start`, running ? 'good' : st.I > 1e-4 ? 'warn' : '');
      const open = st.direct ? 0.2 : st.Rds > 1e9 ? 0 : Math.min(1, Math.max(0, (st.vg - VTH) / 1.3));
      tap.setOpen(open);
      wflow.speed = mainFlow.speed;
      wflow.update(dt);
      pm.spin(dt, wflow.speed);
      pm.setPressure(LOADS[st.load].v / 14);
      wheel.rotation.x += dt * (st.I / ref + freewheel / ref) * 3;
      wcv.setOpen(freewheel > 0 ? 1 : 0);
      wl.set(open >= 1 ? 'tap fully open: cool' : open <= 0 ? 'tap shut' : 'half open: getting hot!', open > 0 && open < 1 ? 'bad' : 'water');
    },
    reset() {
      st.cooked = false;
      st.temp = 25;
      fx.clear();
      st.vg = 0;
      solve();
    },
  };

  function solve() {
    const L = LOADS[st.load];
    if (st.direct) {
      // The pin itself has to supply the pump: 3.3 V through its own resistance.
      st.Rds = 1e12;
      st.I = st.vg > 2 ? 3.3 / (L.r + PIN_R) : 0;
      st.pinI = st.I;
      st.P = 0;
      if (st.pinI > PIN_MAX) rig.onPinOverload?.(st.pinI);
      return;
    }
    st.pinI = 0;
    st.Rds = st.cooked ? 1e12 : mosfetR(st.vg, VTH, RON);
    st.I = L.v / (L.r + st.Rds);
    if (st.I < 1e-6) st.I = 0;
    st.P = st.I * st.I * st.Rds;
    const on = st.vg >= VTH + 1.3 && !st.cooked;
    const gateOff = st.vg <= VTH;
    if (wasOn && gateOff) {
      const amps = L.v / (L.r + RON);
      if (st.diode) {
        freewheel = amps;
        st.cleanOffs++;
      } else {
        const p = q.group.position.clone().add(b.bb.group.position).add(new THREE.Vector3(0, 0.6, 0.2));
        fx.flash(p, '#bfe3ff', 2.2);
        fx.sparks(p, 45, '#cfe8ff');
        ctx.fxWater.sparks(tap.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 25, '#9fd4ff');
      }
      rig.onSwitchOff?.(st.diode, amps);
    }
    if (on) wasOn = true;
    if (gateOff) wasOn = false;
  }

  solve();
  return rig;
}
