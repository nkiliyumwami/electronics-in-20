import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { contactShadow, wire } from '../../three/lib';
import { cell18650 } from '../../three/iot';
import { pipe, tank, tapValve } from '../../three/water';
import { prepCanvas, cssVar } from '../../core/panel';

// 6.3 Battery life: deep sleep, wake interval, awake time, and what the board itself draws.
export const CAP = 2500; // mAh
export const I_AWAKE = 100; // mA with Wi-Fi on
export const SLEEP = { devkit: 5, lowpower: 0.01 }; // mA while the ESP32 sleeps
export type Board = keyof typeof SLEEP;

/** Average current (mA). */
export function avgCurrent(sleep: boolean, board: Board, everyMin: number, awakeS: number): number {
  if (!sleep) return I_AWAKE;
  const period = everyMin * 60;
  return (awakeS * I_AWAKE + (period - awakeS) * SLEEP[board]) / period;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let sleep = false;
  let board: Board = 'devkit';
  let every = 1;
  let awake = 10;
  let charge = CAP;
  let days = 0;

  const b = espBench(ctx, { usb: false });
  b.esp.setPower(true);
  const cell = cell18650();
  cell.group.scale.setScalar(0.55);
  cell.group.position.set(1.2, -0.85, -4.6);
  b.bb.group.add(cell.group);
  stage.part(cell.group, { name: '18650 cell, 2500 mAh', job: 'Can supply 2500 mA for one hour, or 25 mA for 100 hours. Its gauge shows what is left.', symbol: 'battery' });
  const cp = cell.plus.clone().multiplyScalar(0.55).add(cell.group.position);
  const cm = cell.minus.clone().multiplyScalar(0.55).add(cell.group.position);
  const lead = (a: THREE.Vector3, to: THREE.Vector3, c: 'red' | 'black', name: string) => {
    const w = wire(b.around(a, to, c === 'red' ? 0.9 : 1.1), c, 0.04, 0.25);
    b.bb.group.add(w.mesh);
    stage.part(w.mesh, { name, job: 'From the battery (through a 3.3 V regulator, not shown) to the board.', symbol: 'wire' });
  };
  lead(cp, b.free('3V3'), 'red', 'Battery + (via a regulator)');
  lead(cm, b.free('GND'), 'black', 'Battery −');
  const zLabel = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.2, -0.6), 'big');
  const cLabel = stage.label('', cell.group, new THREE.Vector3(0, 3.4, 0), 'big');
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: '#3d7bd9', transparent: true, opacity: 0 }));
    r.rotation.x = -Math.PI / 2;
    r.position.copy(b.esp.group.position).add(new THREE.Vector3(2.3, 1.2, 0));
    r.userData.noFrame = true;
    b.bb.group.add(r);
    rings.push(r);
  }

  // ---- water view: the battery is a tank; awake opens the tap wide, asleep it only drips
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(6, 5));
  const tk = tank(2.4, 0.8);
  tk.group.position.set(-1.4, -0.4, 0);
  wg.add(tk.group);
  wg.add(pipe([new THREE.Vector3(-0.6, 0.2, 0), new THREE.Vector3(1.6, 0.2, 0), new THREE.Vector3(1.6, -0.3, 0)], 0.08).mesh);
  const tap = tapValve(0.1);
  tap.group.position.set(0.7, 0.2, 0);
  wg.add(tap.group);
  stage.part(tk.group, { name: 'Tank (= the battery)', job: 'Its water is the battery\'s charge (mAh).', symbol: 'tank' });
  stage.part(tap.group, { name: 'Tap (= how much the board draws)', job: 'Wide open while awake, a slow drip while asleep. The average flow decides how long the tank lasts.', symbol: 'tap' });
  const wl = stage.label('', tk.group, new THREE.Vector3(0, 3.0, 0), 'big water');

  // ---- controls
  panel.toggle('Deep sleep between readings', sleep, (v) => { sleep = v; update(); });
  panel.segmented('Board', [{ value: 'devkit', label: 'DevKit (5 mA asleep)' }, { value: 'lowpower', label: 'Low-power board (10 µA asleep)' }], board, (v) => { board = v as Board; update(); });
  panel.select('Wake up every', [1, 5, 10, 30, 60].map((m) => ({ value: String(m), label: `${m} min` })), String(every), (v) => { every = Number(v); update(); });
  panel.select('Awake for', [2, 5, 10].map((s) => ({ value: String(s), label: `${s} s` })), String(awake), (v) => { awake = Number(v); update(); });
  const row = panel.row();
  panel.button('Fresh battery', () => { charge = CAP; days = 0; }, 'btn', row);
  const chart = panel.chart('Current during one wake-up cycle', 100);
  const roA = panel.readout('Average current');
  const roL = panel.readout('Battery life');
  const roD = panel.readout('Time-lapse (1 s = 1 day)');
  const note = panel.note('');

  const avg = () => avgCurrent(sleep, board, every, awake);
  const lifeDays = () => CAP / avg() / 24;

  function update() {
    const a = avg();
    const life = lifeDays();
    roA.set(a >= 1 ? `${a.toFixed(1)} mA` : `${(a * 1000).toFixed(0)} µA`);
    roL.set(life < 2 ? `${(life * 24).toFixed(0)} hours` : `${life.toFixed(0)} days`, life > 90 ? 'good' : life < 7 ? 'bad' : 'warn');
    note.set(
      !sleep
        ? 'Always awake with Wi-Fi on: about 100 mA, so the battery is flat in about a day.'
        : board === 'devkit'
          ? 'The ESP32 sleeps, but the DevKit\'s USB chip, regulator and power LED keep drawing 5 mA.'
          : life > 90
            ? 'Asleep almost all the time on a low-power board: months on one charge.'
            : 'Try waking less often, or for a shorter time.',
      !sleep || board === 'devkit' ? 'note warn' : 'note',
    );
    drawCycle();
  }

  function drawCycle() {
    const { ctx: g, w, h } = prepCanvas(chart);
    const period = sleep ? every * 60 : 1;
    const awakeFrac = sleep ? Math.max(0.02, awake / period) : 1;
    const yA = 16, yS = h - 14 - (sleep ? (board === 'devkit' ? 10 : 2) : 0);
    g.strokeStyle = cssVar('--flow');
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(40, sleep ? yS : yA);
    if (sleep) {
      g.lineTo(40, yA);
      g.lineTo(40 + (w - 50) * awakeFrac, yA);
      g.lineTo(40 + (w - 50) * awakeFrac, yS);
    }
    g.lineTo(w - 10, sleep ? yS : yA);
    g.stroke();
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('100 mA', 2, yA + 4);
    g.fillText(sleep ? (board === 'devkit' ? '5 mA' : '10 µA') : '', 2, yS + 4);
    g.fillText(sleep ? `awake ${awake} s, then asleep until ${every} min` : 'always awake', w - 200, h - 2);
  }

  stage.onUpdate((dt, t) => {
    // Time-lapse: 1 s on screen = 1 day.
    const a = avg();
    charge = Math.max(0, charge - a * 24 * dt);
    days += charge > 0 ? dt : 0;
    const v = 3.0 + 1.2 * (charge / CAP);
    cell.setVoltage(v);
    cLabel.set(`${Math.round(charge)} mAh left`, charge < CAP * 0.2 ? 'bad' : '');
    roD.set(charge > 0 ? `day ${Math.floor(days)}` : `flat after ${days.toFixed(1)} days`, charge > 0 ? '' : 'bad');
    // The visible wake cycle runs in real time: up for a moment, asleep the rest.
    const awakeNow = !sleep || (t % 4) < 0.8;
    b.esp.setPower(charge > 0 && (awakeNow || board === 'devkit'));
    zLabel.set(charge <= 0 ? 'battery flat' : awakeNow ? 'awake: measuring, sending' : 'deep sleep… zzz', charge <= 0 ? 'bad' : awakeNow ? 'good' : '');
    rings.forEach((r, i) => {
      const k = awakeNow && charge > 0 ? (t * 2 + i / 3) % 1 : 0;
      (r.material as THREE.MeshBasicMaterial).opacity = awakeNow && charge > 0 ? 0.7 * (1 - k) : 0;
      r.scale.setScalar(0.5 + k * 1.6);
    });
    tk.setLevel(charge / CAP);
    tap.setOpen(awakeNow ? 1 : sleep && board === 'lowpower' ? 0.02 : 0.15);
    wl.set(`${Math.round(charge)} mAh`, 'big water');
  });

  update();
  stage.focusObjects = [b.bb.group, cell.group];
  stage.enableWater(2, 'real');
  stage.frame({ dir: new THREE.Vector3(0.05, 1.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'over90days') return { ok: false };
      const life = lifeDays();
      if (life > 90) return { ok: true };
      return { ok: false, msg: `That gives about ${life < 2 ? `${(life * 24).toFixed(0)} hours` : `${life.toFixed(0)} days`}. Aim for more than 90 days.` };
    },
  };
}
