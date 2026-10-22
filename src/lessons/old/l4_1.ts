import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, jumperPts, up } from '../kit';
import { dip, mesh, std, smdLed } from '../../three/lib';

const VMAX = 5.5;

/** Semicircular dial with LOW / undefined / HIGH zones and a needle. */
function zoneGauge(vdd: number) {
  const g = new THREE.Group();
  const lo = 0.3 * vdd;
  const hi = 0.7 * vdd;
  const ang = (v: number) => Math.PI - (v / VMAX) * Math.PI;
  const arc = (a: number, b: number, color: string) => {
    const geo = new THREE.RingGeometry(0.55, 0.8, 32, 1, ang(b), ang(a) - ang(b));
    const m = new THREE.Mesh(geo, std(color, 0.6, 0, { side: THREE.DoubleSide }));
    g.add(m);
  };
  arc(0, lo, '#3d7bd9');
  arc(lo, hi, '#f0b429');
  arc(hi, Math.min(VMAX, vdd + 0.3), '#2f9e44');
  arc(Math.min(VMAX, vdd + 0.3), VMAX, '#c0392b');
  g.add(mesh(new THREE.CircleGeometry(0.9, 32, 0, Math.PI), std('#f5f4ef', 0.7), [0, 0, -0.01]));
  const needle = new THREE.Group();
  needle.add(mesh(new THREE.BoxGeometry(0.8, 0.04, 0.02), std('#222', 0.4), [0.4, 0, 0.02]));
  g.add(needle);
  g.add(mesh(new THREE.CircleGeometry(0.06, 16), std('#222', 0.4), [0, 0, 0.03]));
  return { group: g, set: (v: number) => (needle.rotation.z = ang(Math.max(0, Math.min(VMAX, v)))), lo, hi };
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let vin = 1.0;

  const b = bench(ctx);
  b.batGroup.visible = false; // the signal comes from the generator instead
  const H = b.bb.hole;

  // Signal generator box on the left.
  const gen = new THREE.Group();
  gen.position.set(-3.9, -0.85, 0);
  gen.add(mesh(new THREE.BoxGeometry(1.4, 0.9, 1.1), std('#2e3238', 0.5), [0, 0.45, 0]));
  const knob = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 24), std('#d8d4c8', 0.5), [0.35, 0.92, 0.1]);
  gen.add(knob);
  const screen = mesh(new THREE.BoxGeometry(0.6, 0.02, 0.3), std('#173b26', 0.3, 0, { emissive: new THREE.Color('#2bd16b'), emissiveIntensity: 0.4 }), [-0.3, 0.91, 0.1]);
  gen.add(screen);
  stage.real.add(gen);
  stage.part(gen, { name: 'Signal source', job: 'Puts out any voltage you choose, from 0 to 5 V, measured from ground.', symbol: 'supply' });
  const genLabel = stage.label('', gen, new THREE.Vector3(0, 1.4, 0), 'big');

  const mkChip = (col: number, vdd: number, name: string) => {
    const c = dip(8, [vdd < 4 ? '74LVC1G14' : '74HC1G14']);
    c.group.position.copy(H(col, 4).lerp(H(col, 5), 0.5)).add(new THREE.Vector3(0.381, 0, 0));
    stage.real.add(c.group);
    stage.part(c.group, { name, job: `Reads its input as HIGH above ${(0.7 * vdd).toFixed(2)} V and LOW below ${(0.3 * vdd).toFixed(2)} V (0.7 and 0.3 × its ${vdd} V supply).`, symbol: 'chip' });
    const gg = zoneGauge(vdd);
    gg.group.position.copy(H(col + 1, 9)).add(new THREE.Vector3(0, 1.3, 0.9));
    gg.group.scale.setScalar(1.1);
    stage.real.add(gg.group);
    stage.part(gg.group, { name: `${name} input gauge`, job: 'Blue: reads LOW. Amber: undefined, could go either way. Green: reads HIGH. Red: above the absolute maximum.', symbol: 'meter' });
    const led = smdLed('#ff3020');
    led.group.scale.setScalar(2.4);
    led.group.position.copy(H(col + 1, 8)).setY(0);
    stage.real.add(led.group);
    const label = stage.label(name, gg.group, new THREE.Vector3(0, 1.15, 0), 'big');
    return { gg, led, label, vdd };
  };
  const chipA = mkChip(3, 3.3, '3.3 V chip');
  const chipB = mkChip(10, 5, '5 V chip');
  // Signal wire from the generator to both chip inputs.
  const sigPts = [new THREE.Vector3(-3.2, -0.2, 0.3), new THREE.Vector3(-2.6, 0.7, 0.3), up(H(3, 3), 0.7), H(3, 3)];
  addWire(ctx, sigPts, 'yellow', 'Signal wire');
  addWire(ctx, jumperPts(H(3, 2), H(10, 2), 0.45), 'yellow', 'Signal wire to the 5 V chip');

  // ---- controls
  panel.slider({ label: 'Input voltage', min: 0, max: 5, step: 0.01, value: vin, nudge: true, format: (v) => `${v.toFixed(2)} V`, onInput: (v) => { vin = v; update(); } });
  panel.formula('Thresholds').set('HIGH above 0.7 × V<sub>DD</sub>: 0.7 × 3.3 V = <b>2.31 V</b> · 0.7 × 5 V = <b>3.50 V</b>');
  const roA = panel.readout('3.3 V chip reads');
  const roB = panel.readout('5 V chip reads');
  const note = panel.note('');

  const read = (v: number, vdd: number) => (v >= 0.7 * vdd ? 'HIGH' : v <= 0.3 * vdd ? 'LOW' : 'undefined');
  function update() {
    for (const c of [chipA, chipB]) c.gg.set(vin);
    genLabel.set(`${vin.toFixed(2)} V`);
    const a = read(vin, 3.3);
    const bb = read(vin, 5);
    roA.set(vin > 3.6 ? 'HIGH, but over its 3.6 V limit!' : a, vin > 3.6 ? 'bad' : a === 'HIGH' ? 'good' : a === 'undefined' ? 'warn' : '');
    roB.set(bb, bb === 'HIGH' ? 'good' : bb === 'undefined' ? 'warn' : '');
    chipA.label.set(`3.3 V chip: ${a}`, vin > 3.6 ? 'bad' : a === 'HIGH' ? 'good' : a === 'undefined' ? 'warn' : '');
    chipB.label.set(`5 V chip: ${bb}`, bb === 'HIGH' ? 'good' : bb === 'undefined' ? 'warn' : '');
    note.set(a !== bb ? 'The two chips disagree about this voltage.' : '', 'note warn');
  }

  stage.onUpdate((_, t) => {
    for (const c of [chipA, chipB]) {
      const r = read(vin, c.vdd);
      const on = r === 'HIGH' || (r === 'undefined' && Math.sin(t * 23 + c.vdd * 7) + Math.sin(t * 37) > 0.4);
      c.led.lens.emissiveIntensity = on ? 3 : 0.05;
    }
  });

  update();
  stage.focusObjects = [gen, chipA.gg.group, chipB.gg.group, b.bb.group];
  stage.frame({ dir: new THREE.Vector3(0, 1.0, 1.2), animate: false });

  return {
    check(task) {
      if (task !== 'between') return { ok: false };
      const a = read(vin, 3.3);
      const bb = read(vin, 5);
      if (a === 'HIGH' && bb !== 'HIGH') return { ok: true };
      return { ok: false, msg: `At ${vin.toFixed(2)} V the 3.3 V chip reads ${a} and the 5 V chip reads ${bb}.` };
    },
  };
}
