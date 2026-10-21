import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, jumperPts } from '../kit';
import { button, dip, resistor, contactShadow, mesh, std } from '../../three/lib';
import { gauge, pipe, tank } from '../../three/water';
import { prepCanvas, cssVar } from '../../core/panel';

const SLOW = 100; // slow motion: 1 s on screen = 10 ms in the circuit
// Contact timeline for one press, in circuit milliseconds: [time, closed]
const PRESS: [number, boolean][] = [
  [0, true], [0.35, false], [0.6, true], [1.0, false], [1.3, true], [1.65, false], [1.9, true], [2.3, false], [2.5, true],
  [26, false], [26.3, true], [26.7, false],
];
const DEBOUNCE_MS = 20;

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let pullup = false;
  let debounce = false;
  let pressT = -1; // circuit ms since press started, -1 = idle
  let closed = false;
  let vFloat = 1.6;
  let read = 1;
  let lowFor = 0;
  let armed = true;
  let count = 0;
  let pressesSinceReset = 0;
  const trace: { r: number; c: boolean }[] = [];

  // ---- real view
  const b = bench(ctx);
  const H = b.bb.hole;
  stage.label('3.3 V', b.batGroup, new THREE.Vector3(0.1, 2.15, 0), 'big');
  b.bat.setVoltage(3.3, 5);
  const chip = dip(8);
  chip.group.position.copy(H(4, 4).lerp(H(4, 5), 0.5)).add(new THREE.Vector3(0.381, 0, 0));
  stage.real.add(chip.group);
  stage.part(chip.group, { name: 'Microcontroller', job: 'Reads its input pin (the leg in column 4) and counts presses.', symbol: 'chip' });
  const btn = button();
  btn.group.position.copy(H(12, 4).lerp(H(12, 5), 0.5)).add(new THREE.Vector3(0.127, 0, 0));
  stage.real.add(btn.group);
  stage.part(btn.group, { name: 'Push button', job: 'Connects the input pin to ground while pressed. Its metal contacts bounce for a few milliseconds.', symbol: 'button', actions: () => [{ label: 'Press once', run: () => press() }] });
  stage.onTap(btn.group, () => press());
  const pu = resistor(10000, H(4, 2).distanceTo(H(9, 2)));
  pu.group.position.copy(H(4, 2).lerp(H(9, 2), 0.5));
  pu.group.visible = false;
  stage.real.add(pu.group);
  stage.part(pu.group, { name: 'Pull-up resistor (10 kΩ)', job: 'Gently holds the input HIGH when the button is not pressed.', symbol: 'resistor' });
  const vccPts = batteryPts(b.plus, 1, H(9, 0), 0.9);
  addWire(ctx, vccPts, 'red', '3.3 V wire');
  addWire(ctx, batteryPts(b.minus, -1, H(1, 0), 0.9), 'black', 'Ground wire');
  addWire(ctx, jumperPts(H(4, 1), H(12, 1), 0.6), 'yellow', 'Input pin to button');
  addWire(ctx, jumperPts(H(12, 9), H(1, 3), 0.45), 'black', 'Button to ground');
  const readLabel = stage.label('', chip.group, new THREE.Vector3(0, 1.2, 0), 'big');
  const countLabel = stage.label('', btn.group, new THREE.Vector3(0, 1.2, 0), 'big');

  // ---- water view: supply tank → narrow pull-up pipe → junction gauge; drain valve (button) to the floor
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(6, 5));
  const tk = tank(1.8, 0.45);
  tk.setLevel(0.9);
  tk.group.position.set(-1.8, -0.3, 0);
  wg.add(tk.group);
  const puPipe = pipe([new THREE.Vector3(-1.35, 1.2, 0), new THREE.Vector3(0.3, 1.2, 0)], 0.04);
  wg.add(puPipe.mesh);
  const junction = mesh(new THREE.SphereGeometry(0.2, 16, 12), std('#a9c9ea', 0.2, 0, { transparent: true, opacity: 0.7 }), [0.4, 1.2, 0]);
  wg.add(junction);
  const gg = gauge(0.32);
  gg.group.position.set(0.4, 1.8, 0);
  wg.add(gg.group);
  const drain = pipe([new THREE.Vector3(0.4, 1.0, 0), new THREE.Vector3(0.4, 0.2, 0), new THREE.Vector3(1.6, 0.2, 0)], 0.13);
  wg.add(drain.mesh);
  const flap = mesh(new THREE.BoxGeometry(0.34, 0.04, 0.34), std('#c0281f', 0.5), [0.4, 0.6, 0]);
  wg.add(flap);
  stage.part(tk.group, { name: 'Supply tank (= 3.3 V)', job: 'High pressure, like the supply.', symbol: 'tank' });
  stage.part(puPipe.mesh, { name: 'Thin pipe (= pull-up resistor)', job: 'A thin trickle that keeps the junction at high pressure, but is easily beaten by the big drain.', symbol: 'pipe' });
  stage.part(gg.group, { name: 'Junction gauge (= input pin)', job: 'Without the thin pipe it is connected to nothing and wanders.', symbol: 'meter' });
  stage.part(flap, { name: 'Drain valve (= button)', job: 'Opens a wide path to the floor (ground).', symbol: 'valve' });

  // ---- controls
  const row = panel.row();
  panel.button('Press the button once', () => press(), 'btn primary', row);
  panel.button('Reset counter', () => { count = 0; pressesSinceReset = 0; }, 'btn', row);
  const row2 = panel.row();
  panel.toggle('Pull-up resistor (10 kΩ)', pullup, (v) => { pullup = v; pu.group.visible = v; puPipe.mesh.visible = v; }, row2);
  panel.toggle('Software debounce (20 ms)', debounce, (v) => { debounce = v; }, row2);
  const chart = panel.chart('Logic analyser: what the pin reads (slow motion ×100)', 120);
  const roR = panel.readout('Pin reads');
  const roC = panel.readout('Presses counted');
  const roS = panel.readout('Contact');

  function press() {
    if (pressT >= 0) return;
    pressT = 0;
    pressesSinceReset++;
  }

  puPipe.mesh.visible = false;
  stage.onUpdate((dt) => {
    const steps = 6;
    const cdt = (dt * 1000) / SLOW / steps; // circuit ms per step
    for (let k = 0; k < steps; k++) {
      if (pressT >= 0) {
        pressT += cdt;
        let c = false;
        for (const [t, st] of PRESS) if (pressT >= t) c = st;
        closed = c;
        if (pressT > 30) pressT = -1;
      } else closed = false;
      // Pin voltage.
      let v: number;
      if (closed) v = 0;
      else if (pullup) v = 3.3;
      else {
        vFloat += (Math.random() - 0.5) * 0.9 + (1.65 - vFloat) * 0.01;
        vFloat = Math.max(0, Math.min(3.3, vFloat));
        v = vFloat;
      }
      const prev = read;
      read = v > 2.31 ? 1 : v < 0.99 ? 0 : read;
      // Counting.
      if (!debounce) {
        if (prev === 1 && read === 0) count++;
      } else {
        if (read === 0) {
          lowFor += cdt;
          if (armed && lowFor >= DEBOUNCE_MS) {
            count++;
            armed = false;
          }
        } else {
          lowFor = 0;
          armed = true;
        }
      }
      trace.push({ r: read, c: closed });
    }
    while (trace.length > 900) trace.shift();
    btn.press(closed);
    flap.rotation.z = closed ? -0.9 : 0;
    gg.set(closed ? 0.05 : pullup ? 0.85 : vFloat / 3.6);
    junction.scale.setScalar(1);
    readLabel.set(`reads ${read ? 'HIGH (1)' : 'LOW (0)'}`, !pullup && !closed ? 'warn' : '');
    countLabel.set(`count: ${count}`, debounce && pullup ? 'good' : '');
    roR.set(read ? 'HIGH (1)' : 'LOW (0)', !pullup && !closed ? 'warn' : '');
    roC.set(String(count), count > pressesSinceReset ? 'bad' : '');
    roS.set(closed ? 'closed' : 'open');
    draw();
  });

  function draw() {
    const { ctx: g, w, h } = prepCanvas(chart);
    const n = trace.length;
    const X = (i: number) => 60 + ((i - (n - 900)) / 900) * (w - 66);
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('pin', 6, 30);
    g.fillText('contact', 6, h - 22);
    const lane = (y0: number, y1: number, get: (i: number) => number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const y = get(i) ? y1 : y0;
        if (i === 0) g.moveTo(X(i), y);
        else g.lineTo(X(i), y);
      }
      g.stroke();
    };
    lane(50, 14, (i) => trace[i].r, cssVar('--flow'));
    lane(h - 10, h - 40, (i) => (trace[i].c ? 1 : 0), cssVar('--ink-2'));
    g.fillStyle = cssVar('--ink-3');
    g.fillText('← last 9 ms (slowed down ×100)', w - 190, h / 2 + 4);
  }

  stage.focusObjects = [b.batGroup, chip.group, btn.group, b.bb.group];
  stage.enableWater(2);
  stage.frame({ dir: new THREE.Vector3(0.1, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'onePress') return { ok: false };
      if (!pullup) return { ok: false, msg: 'The pin is still floating: ghost counts will creep in.' };
      if (!debounce) return { ok: false, msg: 'Without debouncing, each bounce counts as a press.' };
      if (pressesSinceReset === 0) return { ok: false, msg: 'Reset the counter, then press the button once.' };
      if (count === 1 && pressesSinceReset === 1) return { ok: true };
      if (pressT >= 0 && count === 0) return { ok: false, msg: 'Wait for the press to finish.' };
      return { ok: false, msg: `${pressesSinceReset} press(es), ${count} counted. Reset the counter and press exactly once.` };
    },
  };
}
