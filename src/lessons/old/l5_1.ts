import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { contactShadow, mesh, std, smallBoard, qfp, smdLed, M } from '../../three/lib';
import { gauge, pipe, tank } from '../../three/water';
import { prepCanvas, cssVar } from '../../core/panel';
import { flowAlong, WATER_FLOW, dense, FLOW_COLOR } from '../kit';
import { currentToSpeed } from '../../three/particles';

// Power budget numbers (also used by scripts/checks.ts → BUDGET).
const CAP = 2000; // mAh
const MCU = { active: 10, sleep: 0.05 };
const LED = 20;
const RADIO = { listen: 15, burst: 800, burstMs: 10, everyS: 60 };
const SENSOR = 1;

type McuMode = 'active' | 'sleep';
type RadioMode = 'off' | 'listen' | 'burst';

/** Li-ion open-circuit voltage vs state of charge (0..1). */
function liion(soc: number): number {
  const pts: [number, number][] = [[0, 3.0], [0.05, 3.4], [0.2, 3.6], [0.5, 3.75], [0.8, 3.95], [0.95, 4.1], [1, 4.2]];
  for (let i = 1; i < pts.length; i++) {
    if (soc <= pts[i][0]) {
      const [a, va] = pts[i - 1];
      const [b, vb] = pts[i];
      return va + ((soc - a) / (b - a)) * (vb - va);
    }
  }
  return 4.2;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let mcu: McuMode = 'active';
  let ledOn = true;
  let radio: RadioMode = 'listen';
  let hoursPerSec = 1;
  let charge = CAP; // mAh left
  let hours = 0;
  let empty = false;
  const hist: { h: number; v: number }[] = [];

  // ---- real view
  const board = smallBoard(4.6, 3.2);
  stage.real.add(board, contactShadow(9, 7));
  stage.part(board, { name: 'Gadget board', job: 'A small battery-powered sensor gadget.', symbol: 'pcb' });
  const cell = new THREE.Group();
  cell.position.set(0, 0.45, -2.4);
  cell.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 3.2, 32), std('#2a8c8c', 0.4, 0.2), [0, 0, 0], [0, 0, Math.PI / 2]));
  cell.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 20), M.steel(), [1.65, 0, 0], [0, 0, Math.PI / 2]));
  const cg = gauge(0.3);
  cg.group.position.set(0, 0.85, 0);
  cell.add(cg.group, mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), M.steel(), [0, 0.55, 0]));
  stage.real.add(cell);
  stage.part(cell, { name: 'Li-ion cell, 2000 mAh', job: 'Stores 2000 milliamp-hours. Its voltage slides from 4.2 V (full) to 3.0 V (empty).', symbol: 'battery' });
  const vLabel = stage.label('', cell, new THREE.Vector3(0, 1.45, 0), 'big');
  const chip = qfp(0.9, 6);
  chip.group.position.set(-1.2, 0, 0.2);
  stage.real.add(chip.group);
  stage.part(chip.group, { name: 'Microcontroller', job: 'Uses 10 mA when active, but only 0.05 mA asleep.', symbol: 'chip' });
  const led = smdLed('#3dff6a');
  led.group.scale.setScalar(3);
  led.group.position.set(1.6, 0, 1.0);
  stage.real.add(led.group);
  stage.part(led.group, { name: 'Status LED', job: 'Uses 20 mA whenever it is on: the hungriest part here.', symbol: 'led' });
  const radioG = new THREE.Group();
  radioG.position.set(1.2, 0, -0.5);
  radioG.add(mesh(new THREE.BoxGeometry(1.2, 0.12, 0.9), std('#1d4f91', 0.5), [0, 0.06, 0]));
  radioG.add(mesh(new THREE.BoxGeometry(0.6, 0.1, 0.5), M.steel(), [-0.15, 0.17, 0]));
  radioG.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), std('#222', 0.5), [0.45, 0.6, 0]));
  const radioLight = mesh(new THREE.SphereGeometry(0.07, 12, 8), std('#ff9a1f', 0.3, 0, { emissive: new THREE.Color('#ff9a1f'), emissiveIntensity: 0 }), [0.45, 1.12, 0]);
  radioG.add(radioLight);
  stage.real.add(radioG);
  stage.part(radioG, { name: 'Radio module', job: 'Listening all the time costs 15 mA. Waking once a minute for a 10 ms burst costs 800 mA, but only briefly.', symbol: 'sensor' });
  const sensor = mesh(new THREE.BoxGeometry(0.35, 0.1, 0.35), std('#333', 0.5), [-1.2, 0.05, 1.1]);
  stage.real.add(sensor);
  stage.part(sensor, { name: 'Temperature sensor', job: 'Always on at 1 mA.', symbol: 'sensor' });
  const flow = flowAlong(stage.real, dense([new THREE.Vector3(1.65, 0.45, -2.4), new THREE.Vector3(2.1, 0.2, -1.6), new THREE.Vector3(2.1, 0.12, 0.2), new THREE.Vector3(-0.5, 0.12, 0.2), new THREE.Vector3(-2.1, 0.12, 0.2), new THREE.Vector3(-2.1, 0.2, -1.6), new THREE.Vector3(-1.65, 0.45, -2.4)]), FLOW_COLOR, { closed: false });

  // ---- water view: a draining tank
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(5, 5));
  const tk = tank(2.2, 0.8);
  tk.group.position.set(-1, -0.3, 0);
  wg.add(tk.group);
  wg.add(pipe([new THREE.Vector3(-0.2, -0.1, 0), new THREE.Vector3(1.6, -0.1, 0)], 0.1).mesh);
  const wflow = flowAlong(wg, [new THREE.Vector3(-0.2, -0.1, 0), new THREE.Vector3(1.6, -0.1, 0)], WATER_FLOW, { closed: false, radius: 0.06 });
  stage.part(tk.group, { name: 'Tank (= battery)', job: 'Holds a fixed amount of water. How long it lasts depends on the average outflow.', symbol: 'tank' });
  const wl = stage.label('', tk.group, new THREE.Vector3(0, 2.6, 0), 'big water');

  // ---- controls
  panel.segmented('Microcontroller', [{ value: 'active', label: 'Active (10 mA)' }, { value: 'sleep', label: 'Sleep (0.05 mA)' }], mcu, (v) => { mcu = v as McuMode; update(); });
  panel.toggle('Status LED on (20 mA)', ledOn, (v) => { ledOn = v; update(); });
  panel.segmented('Radio', [{ value: 'off', label: 'Off' }, { value: 'listen', label: 'Always listening (15 mA)' }, { value: 'burst', label: 'Burst once a minute' }], radio, (v) => { radio = v as RadioMode; update(); });
  panel.segmented('Time speed', [{ value: '1', label: '1 s = 1 hour' }, { value: '24', label: '1 s = 1 day' }], '1', (v) => { hoursPerSec = Number(v); });
  const row = panel.row();
  panel.button('Fresh battery', () => { charge = CAP; hours = 0; empty = false; hist.length = 0; ctx.clearFail(); }, 'btn', row);
  const formula = panel.formula('Live formula');
  const chart = panel.chart('Battery voltage over time', 120);
  const roAvg = panel.readout('Average current');
  const roPeak = panel.readout('Peak current');
  const roLife = panel.readout('Estimated life');
  const roT = panel.readout('Time so far');

  const avgCurrent = () =>
    (mcu === 'active' ? MCU.active : MCU.sleep) + (ledOn ? LED : 0) + SENSOR + (radio === 'listen' ? RADIO.listen : radio === 'burst' ? (RADIO.burst * RADIO.burstMs) / 1000 / RADIO.everyS : 0);
  const peakCurrent = () => (mcu === 'active' ? MCU.active : MCU.sleep) + (ledOn ? LED : 0) + SENSOR + (radio === 'listen' ? RADIO.listen : radio === 'burst' ? RADIO.burst : 0);

  function update() {
    const avg = avgCurrent();
    const life = CAP / avg;
    formula.set(`life = ${CAP} mAh ÷ ${avg < 1 ? avg.toFixed(2) : avg.toFixed(1)} mA = <b>${life.toFixed(0)} h</b> (${(life / 24).toFixed(1)} days)`);
    roAvg.set(`${avg < 1 ? avg.toFixed(2) : avg.toFixed(1)} mA`);
    roPeak.set(`${peakCurrent().toFixed(0)} mA`, peakCurrent() >= 500 ? 'warn' : '');
    roLife.set(`${life.toFixed(0)} h`, life > 168 ? 'good' : '');
    led.lens.emissiveIntensity = ledOn && !empty ? 3 : 0.05;
  }

  let burstPhase = 0;
  stage.onUpdate((dt) => {
    const avg = avgCurrent();
    if (!empty) {
      hours += dt * hoursPerSec;
      charge -= avg * dt * hoursPerSec;
      if (charge <= 0) {
        charge = 0;
        empty = true;
        ctx.fail({ title: 'Battery empty', text: `It lasted ${hours.toFixed(0)} hours (${(hours / 24).toFixed(1)} days) at an average of ${avg.toFixed(1)} mA. Tap "Fresh battery" and try a leaner setup.`, good: true });
        update();
      }
    }
    const soc = charge / CAP;
    const v = empty ? 3.0 : liion(soc);
    if (!hist.length || hours - hist[hist.length - 1].h > 0.25) hist.push({ h: hours, v });
    cg.set(soc);
    tk.setLevel(soc);
    vLabel.set(`${v.toFixed(2)} V · ${Math.round(soc * 100)}%`, soc < 0.1 ? 'bad' : '');
    wl.set(`${Math.round(soc * 100)}% left`);
    roT.set(`${hours.toFixed(1)} h`);
    flow.speed = empty ? 0 : currentToSpeed(avg, 4, 6);
    flow.update(dt);
    wflow.speed = flow.speed;
    wflow.update(dt);
    // Radio burst flashes (shown slowed down so you can see them).
    burstPhase += dt;
    const flashOn = !empty && (radio === 'listen' || (radio === 'burst' && burstPhase % 1.2 < 0.12));
    (radioLight.material as THREE.MeshStandardMaterial).emissiveIntensity = flashOn ? (radio === 'burst' ? 4 : 1) : 0;
    drawChart();
  });

  function drawChart() {
    const { ctx: g, w, h } = prepCanvas(chart);
    const span = Math.max(48, Math.ceil(hours / 24) * 24);
    const X = (t: number) => 36 + (t / span) * (w - 46);
    const Y = (v: number) => h - 18 - ((v - 2.9) / 1.4) * (h - 28);
    g.strokeStyle = cssVar('--line');
    g.beginPath();
    for (const v of [3.0, 4.2]) {
      g.moveTo(36, Y(v));
      g.lineTo(w - 10, Y(v));
    }
    g.stroke();
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('4.2 V', 2, Y(4.2) + 4);
    g.fillText('3.0 V', 2, Y(3.0) + 4);
    g.fillText(`${span} h`, w - 40, h - 4);
    // One-week marker.
    if (span >= 168) {
      g.strokeStyle = cssVar('--brand');
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(X(168), Y(2.95));
      g.lineTo(X(168), Y(4.3));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = cssVar('--brand');
      g.fillText('1 week', X(168) + 3, 12);
    }
    g.strokeStyle = cssVar('--flow');
    g.lineWidth = 2;
    g.beginPath();
    hist.forEach((p, i) => (i ? g.lineTo(X(p.h), Y(p.v)) : g.moveTo(X(p.h), Y(p.v))));
    g.stroke();
  }

  update();
  stage.enableWater(1.8);
  stage.frame({ dir: new THREE.Vector3(0.1, 1.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'week') return { ok: false };
      const life = CAP / avgCurrent();
      if (life > 168) return { ok: true };
      return { ok: false, msg: `Right now the average is ${avgCurrent().toFixed(1)} mA, which lasts about ${life.toFixed(0)} hours.` };
    },
  };
}
