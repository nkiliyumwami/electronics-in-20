import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { marking, mesh, resistor, std, M } from '../../three/lib';

// 3.4 A 5 V module's output into a 3.3 V ESP32 pin, with and without a 1 kΩ / 2 kΩ divider.
const VMAX = 5.5;
export const HI = 0.75 * 3.3; // reads HIGH above this
export const LO = 0.25 * 3.3; // reads LOW below this
export const ABS_MAX = 3.6;

/** Semicircular dial with LOW / either / HIGH / DAMAGE zones and a needle. */
function zoneGauge() {
  const g = new THREE.Group();
  const ang = (v: number) => Math.PI - (v / VMAX) * Math.PI;
  const arc = (a: number, b: number, color: string) => {
    const geo = new THREE.RingGeometry(0.55, 0.8, 32, 1, ang(b), ang(a) - ang(b));
    g.add(new THREE.Mesh(geo, std(color, 0.6, 0, { side: THREE.DoubleSide })));
  };
  arc(0, LO, '#3d7bd9');
  arc(LO, HI, '#f0b429');
  arc(HI, ABS_MAX, '#2f9e44');
  arc(ABS_MAX, VMAX, '#c0392b');
  g.add(mesh(new THREE.CircleGeometry(0.9, 32, 0, Math.PI), std('#f5f4ef', 0.7), [0, 0, -0.01]));
  const needle = new THREE.Group();
  needle.add(mesh(new THREE.BoxGeometry(0.8, 0.04, 0.02), std('#222', 0.4), [0.4, 0, 0.02]));
  g.add(needle);
  g.add(mesh(new THREE.CircleGeometry(0.06, 16), std('#222', 0.4), [0, 0, 0.03]));
  return { group: g, set: (v: number) => (needle.rotation.z = ang(Math.max(0, Math.min(VMAX, v)))) };
}

/** A blue HC-SR04-style ultrasonic module (5 V), standing up, with its two "eyes". */
function ultrasonic() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(4.5, 2.0, 0.16), std('#1f5fb0', 0.45), [0, 1.5, 0]));
  for (const x of [-1.3, 1.3]) {
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.6, 28), M.steel(), [x, 1.5, 0.38], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.62, 28), std('#2b2d30', 0.9), [x, 1.5, 0.39], [Math.PI / 2, 0, 0]));
  }
  const t = marking(2.0, 0.4, ['5 V sensor'], '#ffffff');
  t.rotation.set(0, 0, 0);
  t.position.set(0, 2.3, 0.09);
  g.add(t);
  const p = marking(2.2, 0.3, ['VCC TRIG ECHO GND'], '#ffffff');
  p.rotation.set(0, 0, 0);
  p.position.set(0, 0.7, 0.09);
  g.add(p);
  return g;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let vOut = 1.0;
  let divider = false;
  let damaged = false;

  const b = espBench(ctx);
  const H = b.H;
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', 'Puts GND on the blue rail.', 0.5);
  const sensor = ultrasonic();
  sensor.position.set(6.5, -0.85, -1.2);
  sensor.rotation.y = -0.35;
  b.bb.group.add(sensor);
  stage.part(sensor, { name: '5 V ultrasonic sensor', job: 'Runs on 5 V, so its ECHO output swings all the way to 5 V: too much for an ESP32 pin.', symbol: 'sensor' });
  const echoAt = new THREE.Vector3(0.1, 0.3, 0.1).applyEuler(sensor.rotation).add(sensor.position);
  const gndAt = new THREE.Vector3(0.8, 0.3, 0.1).applyEuler(sensor.rotation).add(sensor.position);
  // Divider: 1 kΩ (columns 21–25, row h) then 2 kΩ (columns 25–29, row i) to GND.
  const rTop = resistor(1000, H(20, 7).distanceTo(H(24, 7)));
  rTop.group.position.copy(H(20, 7).lerp(H(24, 7), 0.5));
  const rBot = resistor(2000, H(24, 8).distanceTo(H(28, 8)));
  rBot.group.position.copy(H(24, 8).lerp(H(28, 8), 0.5));
  const div = new THREE.Group();
  div.add(rTop.group, rBot.group);
  b.bb.group.add(div);
  stage.part(rTop.group, { name: '1 kΩ (top of the divider)', job: 'Drops a third of the sensor\'s voltage.', symbol: 'resistor' });
  stage.part(rBot.group, { name: '2 kΩ (bottom of the divider)', job: 'The pin reads the voltage across this one: two thirds of the input.', symbol: 'resistor' });
  const gndDiv = b.jumper(H(28, 9), H(28, 'bot-'), 'black', 'Divider to GND', 'The bottom of the divider goes to GND.', 0.5);
  div.add(gndDiv.group);
  const echoLead = b.jumper(H(20, 9), H(20, 'bot-').add(new THREE.Vector3(0, 0, 0)), 'yellow', 'ECHO wire', 'Carries the sensor\'s ECHO signal.', 0.6);
  echoLead.set(echoAt, H(20, 9), 0.4);
  const gndLead = b.jumper(gndAt, H(27, 'bot-'), 'black', 'Sensor GND', 'The sensor shares GND with the ESP32.', 0.4);
  void gndLead;
  const toPin = b.jumper(H(24, 9), b.free('D4'), 'yellow', 'Divider middle to D4', 'Brings the divided signal to GPIO 4.', 0.8);
  const direct = b.jumper(H(20, 6), b.free('D4').clone().add(new THREE.Vector3(0, 0, 0)), 'yellow', 'ECHO straight to D4 (no divider)', 'The full 5 V signal goes straight onto the pin.', 1.0);
  const pinTag = b.tag('D4');
  const gg = zoneGauge();
  gg.group.position.copy(H(9, 9)).add(new THREE.Vector3(0, 2.4, 1.0));
  gg.group.scale.setScalar(1.3);
  b.bb.group.add(gg.group);
  stage.part(gg.group, { name: 'D4 input gauge', job: 'Blue: reads LOW. Amber: could go either way. Green: reads HIGH. Red: above the 3.6 V absolute maximum.', symbol: 'meter' });
  const gLabel = stage.label('', gg.group, new THREE.Vector3(0, 1.15, 0), 'big');
  const sLabel = stage.label('', sensor, new THREE.Vector3(0, 3.2, 0), 'big');

  // ---- controls
  panel.slider({ label: 'Sensor output voltage', min: 0, max: 5, step: 0.05, value: vOut, nudge: true, format: (v) => `${v.toFixed(2)} V`, onInput: (v) => { vOut = v; update(); } });
  const dBtn = panel.toggle('1 kΩ / 2 kΩ divider', divider, (v) => setDivider(v));
  const roP = panel.readout('Voltage at D4');
  const roR = panel.readout('ESP32 reads');
  const note = panel.note('');

  function setDivider(v: boolean) {
    divider = v;
    dBtn.set(v);
    div.visible = toPin.group.visible = v;
    direct.group.visible = !v;
    update();
  }
  const pinV = () => (divider ? (vOut * 2000) / 3000 : vOut);
  const reads = (v: number) => (v >= HI ? 'HIGH' : v <= LO ? 'LOW' : 'either (undefined)');

  function update() {
    const v = pinV();
    gg.set(v);
    const r = reads(v);
    const over = v > ABS_MAX;
    gLabel.set(over ? `${v.toFixed(2)} V: over the limit!` : `${v.toFixed(2)} V: ${r}`, over ? 'bad' : r === 'HIGH' ? 'good' : r === 'LOW' ? '' : 'warn');
    sLabel.set(`ECHO: ${vOut.toFixed(2)} V`);
    pinTag.set(`D4: ${v.toFixed(2)} V`, over ? 'pin bad' : 'pin');
    roP.set(`${v.toFixed(2)} V`, over ? 'bad' : '');
    roR.set(damaged ? 'pin damaged' : r, over || damaged ? 'bad' : r === 'HIGH' ? 'good' : r === 'LOW' ? '' : 'warn');
    note.set(divider ? 'Through the divider the pin gets two thirds of the sensor\'s voltage: 5 V becomes 3.33 V.' : vOut > ABS_MAX ? '' : 'Straight wire: the pin sees exactly what the sensor puts out.', 'note');
    if (over && !damaged) burn(v);
  }

  function burn(v: number) {
    damaged = true;
    const p = b.esp.pin('D4').add(b.esp.group.position).setY(0.9);
    fx.flash(p, '#ffe0a0', 1.6);
    fx.sparks(p, 20);
    ctx.fail({
      title: 'Over the ESP32\'s limit',
      text: `The pin now sees ${v.toFixed(2)} V, more than the 3.6 V absolute maximum. It may work for a while, but this slowly destroys the pin. **Put a divider (or a level shifter) between a 5 V module and the ESP32.**`,
      undo: () => {
        damaged = false;
        vOut = Math.min(vOut, 3.3);
        setDivider(true);
      },
      undoLabel: 'Undo (fit the divider)',
    });
  }

  update();
  setDivider(false);
  stage.focusObjects = [b.bb.group, sensor, gg.group];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.2, 1.2), animate: false });

  return {
    check(task) {
      if (task !== 'safeHigh') return { ok: false };
      const v = pinV();
      if (damaged) return { ok: false, msg: 'The pin is damaged. Undo first.' };
      if (v > ABS_MAX) return { ok: false, msg: `${v.toFixed(2)} V is over the 3.6 V limit.` };
      if (vOut < 4.9) return { ok: false, msg: 'Set the sensor\'s output to its HIGH level, 5 V.' };
      if (reads(v) !== 'HIGH') return { ok: false, msg: `The ESP32 reads ${reads(v)} at ${v.toFixed(2)} V.` };
      return { ok: true };
    },
  };
}
