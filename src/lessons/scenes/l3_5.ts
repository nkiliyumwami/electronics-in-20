import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { mesh, std, M, smallBoard, smdLed, chipPassive, contactShadow } from '../../three/lib';
import { Exploder } from '../../tools/explode';
import { DATASHEET } from '../../content/datasheet';
import { h } from '../../core/dom';

type Mode = 'in' | 'out';
const N = 8; // pins per side

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  const pinState = Array.from({ length: N }, () => ({ mode: 'in' as Mode, high: false }));
  let sel = 5;

  // ---- breakout board
  const board = smallBoard(4.4, 3.4);
  stage.real.add(board, contactShadow(7, 6));
  stage.part(board, { name: 'Breakout board', job: 'A small circuit board that holds the chip and brings its pins out.', symbol: 'pcb' });

  // ---- the chip, built in layers so it can explode
  const size = 1.4;
  const chip = new THREE.Group();
  stage.real.add(chip);
  const moldTop = mesh(new THREE.BoxGeometry(size, 0.1, size), M.plasticDark(), [0, 0.17, 0]);
  const moldBot = mesh(new THREE.BoxGeometry(size, 0.08, size), M.plasticDark(), [0, 0.05, 0]);
  const dot = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12), std('#444', 0.4), [-size / 2 + 0.16, 0.225, -size / 2 + 0.16]);
  moldTop.add(dot);
  dot.position.set(-size / 2 + 0.16, 0.055, -size / 2 + 0.16);
  const die = new THREE.Group();
  die.add(mesh(new THREE.BoxGeometry(0.5, 0.03, 0.5), M.die(), [0, 0.12, 0]));
  // A few "circuit blocks" on the die surface.
  const blocks: [number, number, number, number, string][] = [
    [-0.1, -0.1, 0.22, 0.2, '#6c88b8'],
    [0.12, -0.12, 0.16, 0.16, '#8aa0c4'],
    [0, 0.13, 0.4, 0.12, '#5672a3'],
  ];
  for (const [x, z, w, d, c] of blocks) die.add(mesh(new THREE.BoxGeometry(w, 0.006, d), std(c, 0.3, 0.5), [x, 0.138, z]));
  const frame = new THREE.Group();
  frame.add(mesh(new THREE.BoxGeometry(0.62, 0.02, 0.62), M.tin(), [0, 0.095, 0]));
  const pins: THREE.Mesh[][] = [[], [], [], []];
  const pitch = (size * 0.8) / (N - 1);
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < N; i++) {
      const o = -size * 0.4 + i * pitch;
      const r = (s * Math.PI) / 2;
      const d = size / 2 + 0.12;
      const pin = mesh(new THREE.BoxGeometry(0.3, 0.03, 0.06), M.tin().clone(), [Math.cos(r) * d - Math.sin(r) * o, 0.06, Math.sin(r) * d + Math.cos(r) * o], [0, -r, 0]);
      frame.add(pin);
      pins[s].push(pin);
    }
  }
  const bonds = new THREE.Group();
  const gold = M.gold();
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < N; i++) {
      const pin = pins[s][i];
      const end = pin.position.clone().multiplyScalar(0.8).setY(0.09);
      const start = pin.position.clone().normalize().multiplyScalar(0.2).setY(0.14);
      start.x = Math.max(-0.24, Math.min(0.24, start.x));
      start.z = Math.max(-0.24, Math.min(0.24, start.z));
      const midp = start.clone().lerp(end, 0.5).setY(0.25);
      bonds.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, midp, end), 10, 0.006, 4), gold));
    }
  }
  chip.add(moldBot, frame, die, bonds, moldTop);
  stage.part(moldTop, { name: 'Microcontroller (plastic package)', job: 'A tiny computer: processor, memory and pins. The black plastic protects the silicon inside.', symbol: 'chip' });
  stage.part(die, { name: 'Silicon die', job: 'The actual computer: millions of transistors on a sliver of silicon a few millimetres across.', symbol: 'chip' });
  stage.part(bonds, { name: 'Bond wires', job: 'Gold wires thinner than a hair that join the die to the pins.', symbol: 'wire' });
  stage.part(frame, { name: 'Lead frame (pins)', job: 'The metal skeleton: the pins you solder, plus the pad the die sits on.', symbol: 'pin' });

  // Front-side pins are GPIO PA0..PA7 (left to right).
  const gpio = (k: number) => pins[1][N - 1 - k];
  const pinLabels = Array.from({ length: N }, (_, k) => stage.label(`PA${k}`, chip, gpio(k).position.clone().add(new THREE.Vector3(0, 0.05, 0.38))));
  for (let k = 0; k < N; k++) {
    const pin = gpio(k);
    stage.part(pin, {
      name: `GPIO pin PA${k}`,
      job: 'A general-purpose pin. As an input it reads a voltage; as an output it drives HIGH (3.3 V) or LOW (0 V).',
      symbol: 'pin',
      actions: () => {
        const st = pinState[k];
        const a = [{ label: st.mode === 'in' ? 'Make it an output' : 'Make it an input', run: () => setMode(k, st.mode === 'in' ? 'out' : 'in') }];
        if (st.mode === 'out') a.push({ label: st.high ? 'Set LOW' : 'Set HIGH', run: () => setLevel(k, !st.high) });
        return a;
      },
    });
    // Bigger invisible tap target for fingers.
    const hit = mesh(new THREE.BoxGeometry(0.16, 0.2, 0.4), new THREE.MeshBasicMaterial({ visible: false }), [0, 0, 0]);
    pin.add(hit);
  }

  // LED + resistor on PA5, joined by a copper trace.
  const p5 = gpio(5).position;
  const res = chipPassive(0.2, 0.125, 'R');
  res.scale.setScalar(2);
  res.position.set(p5.x, 0, 1.25);
  res.rotation.y = Math.PI / 2;
  const ledB = smdLed('#ff3020');
  ledB.group.scale.setScalar(2);
  ledB.group.position.set(p5.x, 0, 1.6);
  ledB.group.rotation.y = Math.PI / 2;
  const trace = mesh(new THREE.BoxGeometry(0.06, 0.012, 1.1 - (size / 2 + 0.27)), M.copper(), [p5.x, 0.006, (size / 2 + 0.27 + 1.1) / 2]);
  trace.material = M.copper().clone();
  stage.real.add(res, ledB.group, trace);
  const glow = new THREE.PointLight('#ff4020', 0, 1.2);
  glow.position.set(p5.x, 0.3, 1.6);
  stage.real.add(glow);
  stage.part(ledB.group, { name: 'LED on PA5', job: 'Lights when PA5 is an output driving HIGH.', symbol: 'led' });
  stage.part(res, { name: 'Resistor for the LED', job: 'Limits the LED current to a few milliamps, well inside the pin\'s rating.', symbol: 'resistor' });

  const ex = new Exploder(stage, [
    { obj: moldTop, offset: new THREE.Vector3(0, 1.3, 0) },
    { obj: bonds, offset: new THREE.Vector3(0, 0.85, 0) },
    { obj: die, offset: new THREE.Vector3(0, 0.55, 0) },
    { obj: frame, offset: new THREE.Vector3(0, 0.15, 0) },
    { obj: moldBot, offset: new THREE.Vector3(0, -0.35, 0) },
  ]);
  const exLabels = [
    stage.label('plastic lid', moldTop, new THREE.Vector3(0.95, 0.1, 0)),
    stage.label('gold bond wires', bonds, new THREE.Vector3(0.95, 0.2, 0)),
    stage.label('silicon die', die, new THREE.Vector3(0.95, 0.12, 0)),
    stage.label('lead frame + pins', frame, new THREE.Vector3(1.15, 0.06, 0)),
  ];
  ex.onChange = (f) => {
    exLabels.forEach((l) => l.show(f > 0.5));
    pinLabels.forEach((l) => l.show(f < 0.3 && l.el.dataset.pin === 'show'));
  };
  exLabels.forEach((l) => l.show(false));

  // ---- controls
  ex.controls(panel, 'Explode the chip');
  const pinSel = panel.select('GPIO pin', Array.from({ length: N }, (_, k) => ({ value: String(k), label: `PA${k}${k === 5 ? ' (LED)' : ''}` })), String(sel), (v) => { sel = Number(v); refresh(); ex.set(ex.value); });
  const modeSeg = panel.segmented('Pin mode', [{ value: 'in', label: 'Input (listen)' }, { value: 'out', label: 'Output (drive)' }], 'in', (v) => setMode(sel, v as Mode));
  const levelSeg = panel.segmented('Output level', [{ value: 'low', label: 'LOW (0 V)' }, { value: 'high', label: 'HIGH (3.3 V)' }], 'low', (v) => setLevel(sel, v === 'high'));
  const roPin = panel.readout('Selected pin');
  const roLed = panel.readout('LED on PA5');
  void pinSel;

  // Datasheet viewer.
  const table = (title: string, rows: typeof DATASHEET.absMax, hl: boolean) =>
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'datasheet' },
        h('caption', null, title),
        h('thead', null, h('tr', null, h('th', null, 'Parameter'), h('th', null, 'Min'), h('th', null, 'Max'), h('th', null, 'Unit'), h('th', null, 'Note'))),
        h('tbody', null, rows.map((r) => h('tr', { class: hl ? 'hl' : '' }, h('td', null, r.param), h('td', null, r.min === undefined ? '' : String(r.min)), h('td', null, String(r.max)), h('td', null, r.unit), h('td', null, r.note ?? '')))),
      ),
    );
  const ds = h(
    'details',
    { class: 'ctl', open: true },
    h('summary', { style: { cursor: 'pointer', fontWeight: '700' } }, `Datasheet: ${DATASHEET.part}`),
    table('Absolute maximum ratings: never exceed, even briefly', DATASHEET.absMax, true),
    table('Recommended operating conditions', DATASHEET.operating, false),
  );
  panel.custom(ds);

  function setMode(k: number, m: Mode) {
    pinState[k].mode = m;
    if (m === 'in') pinState[k].high = false;
    sel = k;
    pinSel.set(String(k));
    refresh();
    ex.set(ex.value);
  }
  function setLevel(k: number, high: boolean) {
    if (pinState[k].mode !== 'out') pinState[k].mode = 'out';
    pinState[k].high = high;
    sel = k;
    pinSel.set(String(k));
    refresh();
    ex.set(ex.value);
  }
  function syncControls() {
    const st = pinState[sel];
    modeSeg.set(st.mode);
    levelSeg.set(st.high ? 'high' : 'low');
    levelSeg.el.style.opacity = st.mode === 'out' ? '1' : '0.5';
    roPin.set(`PA${sel}: ${st.mode === 'in' ? 'input (listening)' : st.high ? 'output HIGH (3.3 V)' : 'output LOW (0 V)'}`);
  }
  function refresh() {
    for (let k = 0; k < N; k++) {
      const m = gpio(k).material as THREE.MeshStandardMaterial;
      const st = pinState[k];
      m.emissive.set(st.mode === 'out' ? (st.high ? '#ff8a1f' : '#000000') : '#1f6dff');
      m.emissiveIntensity = st.mode === 'out' ? (st.high ? 1.2 : 0) : 0.5;
      pinLabels[k].set(`PA${k}${k === 5 ? ' → LED' : ''}${st.mode === 'out' ? (st.high ? ' HIGH' : ' LOW') : ''}`, st.mode === 'out' && st.high ? 'warn' : '');
      pinLabels[k].el.dataset.pin = k === sel || k === 5 ? 'show' : 'hide';
    }
    const on = pinState[5].mode === 'out' && pinState[5].high;
    ledB.lens.emissiveIntensity = on ? 3 : 0.05;
    glow.intensity = on ? 1.5 : 0;
    (trace.material as THREE.MeshStandardMaterial).emissive.set(on ? '#ff6a00' : '#000');
    roLed.set(on ? 'lit' : 'off', on ? 'good' : '');
    syncControls();
  }

  refresh();
  ex.set(0);
  stage.frame({ dir: new THREE.Vector3(0.2, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'pinHigh') return { ok: false };
      const st = pinState[5];
      if (st.mode !== 'out') return { ok: false, msg: 'PA5 is still an input: it only listens.' };
      if (!st.high) return { ok: false, msg: 'PA5 is an output, but driving LOW.' };
      return { ok: true };
    },
  };
}
