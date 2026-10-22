import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { wire } from '../../three/lib';
import { pottedPlant, soilSensor } from '../../three/iot';

// 3.3 Calibrating the capacitive soil sensor on GPIO 32 (ADC1).
// This particular sensor reads 2950 bone dry and 1250 soaked (wetter = lower).
export const TRUE_DRY = 2950;
export const TRUE_WET = 1250;
const TUTORIAL = { dry: 3500, wet: 1000 }; // numbers copied from "some tutorial"

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let m = 0.55; // true moisture 0..1
  let watering = 0;
  let dry: number | null = null;
  let wet: number | null = null;
  let dryOk = false;
  let wetOk = false;
  let raw = 0;
  let jitter = 0;

  // ---- real view
  const b = espBench(ctx);
  const H = b.H;
  b.jumper(b.free('3V3'), H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', 'Puts 3.3 V on the red rail.', 0.5);
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', 'Puts GND on the blue rail.', 0.5);
  const plant = pottedPlant();
  plant.group.position.set(6.4, -0.85, -0.6);
  plant.group.scale.setScalar(0.85);
  b.bb.group.add(plant.group);
  stage.part(plant.group, { name: 'Plant pot', job: 'Plant Buddy\'s plant. The soil darkens when wet; the leaves droop when it is dry.', symbol: 'sensor' });
  const sensor = soilSensor();
  sensor.group.scale.setScalar(0.6);
  sensor.group.position.copy(plant.soilTop).multiplyScalar(0.85).add(plant.group.position).add(new THREE.Vector3(-0.35, -1.6, 0.4));
  b.bb.group.add(sensor.group);
  stage.part(sensor.group, { name: 'Capacitive soil-moisture sensor', job: 'Measures how wet the soil is and puts out a voltage (wetter = lower). Pins: GND, VCC (3.3 V), AOUT.', symbol: 'sensor' });
  const pinAt = (k: 'GND' | 'VCC' | 'AOUT') => sensor.pins[k].clone().multiplyScalar(0.6).add(sensor.group.position);
  const lead = (k: 'GND' | 'VCC' | 'AOUT', to: THREE.Vector3, color: 'black' | 'red' | 'yellow', name: string, job: string) => {
    const a = pinAt(k);
    const w = wire([a, a.clone().add(new THREE.Vector3(0, 0.5, 0.3)), to.clone().setY(1.2), to.clone().setY(0.7), to.clone()], color, 0.04, 0.3);
    b.bb.group.add(w.mesh);
    stage.part(w.mesh, { name, job, symbol: 'wire' });
  };
  lead('GND', H(27, 'bot-'), 'black', 'Sensor GND', 'The sensor shares GND with the ESP32.');
  lead('VCC', H(26, 'bot+'), 'red', 'Sensor VCC (3.3 V)', 'Powers the sensor from the 3V3 rail.');
  lead('AOUT', b.free('D32'), 'yellow', 'Sensor AOUT to D32', 'The sensor\'s voltage goes to GPIO 32, an ADC1 pin that works with Wi-Fi on.');
  const pinTag = b.tag('D32');
  const bubble = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.2, -0.6), 'big');
  const potLabel = stage.label('', plant.group, new THREE.Vector3(0, 5.2, 0), 'big');

  // ---- controls
  const row = panel.row();
  const waterBtn = panel.button('Water the plant', () => (watering = 1.5), 'btn primary', row);
  void waterBtn;
  const mS = panel.slider({ label: 'Soil moisture (time-lapse)', min: 0, max: 100, step: 1, value: Math.round(m * 100), nudge: true, format: (v) => `${Math.round(v)}% (true)`, onInput: (v) => { m = v / 100; } });
  const row2 = panel.row();
  panel.button('Record DRY (now)', () => record('dry'), 'btn', row2);
  panel.button('Record WET (now)', () => record('wet'), 'btn', row2);
  panel.button('Clear calibration', () => { dry = wet = null; dryOk = wetOk = false; }, 'btn small', row2);
  const formula = panel.formula();
  const roR = panel.readout('analogRead(32)');
  const roC = panel.readout('Recorded points');
  const roP = panel.readout('Code says');
  const note = panel.note('');

  const readRaw = () => Math.round(TRUE_DRY - m * (TRUE_DRY - TRUE_WET) + jitter);
  function record(which: 'dry' | 'wet') {
    const r = readRaw();
    if (which === 'dry') {
      dry = r;
      dryOk = m <= 0.05;
    } else {
      wet = r;
      wetOk = m >= 0.95;
    }
    note.set(
      which === 'dry' && !dryOk
        ? 'That soil was not fully dry, so this "DRY" point is off. Let it dry to 0% and record again.'
        : which === 'wet' && !wetOk
          ? 'That soil was not soaked, so this "WET" point is off. Water it to 100% and record again.'
          : `Recorded ${which.toUpperCase()} = ${r}.`,
      (which === 'dry' && !dryOk) || (which === 'wet' && !wetOk) ? 'note warn' : 'note',
    );
  }
  const calibrated = () => dry !== null && wet !== null && dryOk && wetOk;
  const percent = () => {
    const d = dry ?? TUTORIAL.dry;
    const w = wet ?? TUTORIAL.wet;
    return Math.max(0, Math.min(100, ((d - raw) / (d - w)) * 100));
  };

  let t = 0;
  stage.onUpdate((dt) => {
    t += dt;
    if (watering > 0) {
      watering -= dt;
      m = Math.min(1, m + dt * 0.8);
    } else {
      m = Math.max(0, m - dt * 0.006); // the soil slowly dries
    }
    jitter = Math.sin(t * 7.1) * 6 + Math.sin(t * 3.3) * 4;
    raw = readRaw();
    plant.setMoisture(m);
    if (Math.abs(mS.get() / 100 - m) > 0.005) mS.set(Math.round(m * 100));
    const p = percent();
    const src = calibrated() ? 'your calibration' : dry !== null || wet !== null ? 'half a calibration' : 'tutorial numbers';
    bubble.set(`analogRead(32) = ${raw} → ${Math.round(p)}% wet`, calibrated() ? 'good' : 'warn');
    pinTag.set(`D32: ${((raw / 4095) * 3.3).toFixed(2)} V`, 'pin');
    potLabel.set(`Really: ${Math.round(m * 100)}% wet`);
    roR.set(String(raw));
    roC.set(`DRY ${dry ?? '—'} · WET ${wet ?? '—'}`, calibrated() ? 'good' : '');
    roP.set(`${Math.round(p)}% wet (using ${src})`, calibrated() ? 'good' : 'warn');
    const d = dry ?? TUTORIAL.dry;
    const w = wet ?? TUTORIAL.wet;
    formula.set(`% wet = (DRY − reading) ÷ (DRY − WET) × 100 → <b>${Math.round(p)}%</b> = (${d} − ${raw}) ÷ (${d} − ${w}) × 100`);
  });

  stage.focusObjects = [b.bb.group, plant.group];
  stage.frame({ dir: new THREE.Vector3(0.1, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'calibrated4060') return { ok: false };
      if (!calibrated()) return { ok: false, msg: dry === null || wet === null ? 'Record both a DRY and a WET reading first.' : 'One calibration point was not taken at fully dry (0%) or soaked (100%) soil. Record it again.' };
      const p = percent();
      if (p < 40 || p > 60) return { ok: false, msg: `The code says ${Math.round(p)}% wet. Bring it to 40–60%.` };
      return { ok: true };
    },
  };
}
