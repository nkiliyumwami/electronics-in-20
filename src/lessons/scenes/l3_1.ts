import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { button, resistor, contactShadow, mesh, std } from '../../three/lib';
import { gauge, pipe, tank } from '../../three/water';
import { prepCanvas, cssVar } from '../../core/panel';

// 3.1 Buttons: floating pins, INPUT_PULLUP (not on GPIO 34–39), external pull-up, debouncing.
const SLOW = 100; // slow motion: 1 s on screen = 10 ms in the circuit
// Contact timeline for one press, in circuit milliseconds: [time, closed]
const PRESS: [number, boolean][] = [
  [0, true], [0.35, false], [0.6, true], [1.0, false], [1.3, true], [1.65, false], [1.9, true], [2.3, false], [2.5, true],
  [26, false], [26.3, true], [26.7, false],
];
const DEBOUNCE_MS = 20;
type Pin = 'D18' | 'D34';

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let pin: Pin = 'D18';
  let internal = false;
  let external = false;
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
  const pulled = () => external || (internal && pin === 'D18');

  // ---- real view
  const b = espBench(ctx);
  const H = b.H;
  b.jumper(b.free('3V3'), H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', 'Puts 3.3 V on the red rail (for the external pull-up).', 0.5);
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', 'Puts GND on the blue rail.', 0.5);
  const btn = button();
  btn.group.position.copy(H(21, 7));
  b.bb.group.add(btn.group);
  stage.part(btn.group, { name: 'Push button', job: 'Connects the input pin to GND while pressed. Its metal contacts bounce for a few milliseconds.', symbol: 'button', actions: () => [{ label: 'Press once', run: () => press() }] });
  stage.onTap(btn.group, () => press());
  b.jumper(H(22, 9), H(22, 'bot-'), 'black', 'Button to GND', 'The other side of the button goes to GND.', 0.5);
  const sig18 = b.jumper(b.free('D18'), H(20, 9), 'yellow', 'Input wire (D18)', 'Joins the input pin to one side of the button.', 0.7);
  const sig34 = b.jumper(b.free('D34'), H(20, 9), 'yellow', 'Input wire (D34)', 'Joins input-only pin GPIO 34 to the button.', 1.6);
  sig34.group.visible = false;
  // External pull-up: red rail → column 17, then 10 kΩ across columns 17–21.
  const pu = new THREE.Group();
  const res = resistor(10000, H(16, 5).distanceTo(H(20, 5)));
  res.group.position.copy(H(16, 5).lerp(H(20, 5), 0.5));
  pu.add(res.group);
  b.bb.group.add(pu);
  const puWire = b.jumper(H(16, 'bot+'), H(16, 8), 'red', 'Red rail to the pull-up', 'Feeds 3.3 V to the external pull-up resistor.', 0.5);
  pu.add(puWire.group);
  pu.visible = false;
  stage.part(res.group, { name: 'External pull-up (10 kΩ)', job: 'Gently holds the input HIGH when the button is not pressed. Needed on GPIO 34–39, which have no internal pull-up.', symbol: 'resistor' });
  const pinTag = b.tag('D18');
  const pinTag34 = b.tag('D34');
  pinTag34.show(false);
  const countLabel = stage.label('', btn.group, new THREE.Vector3(0, 1.4, 0), 'big');

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
  stage.part(tk.group, { name: 'Supply tank (= 3.3 V)', job: 'High pressure, like the 3V3 rail.', symbol: 'tank' });
  stage.part(puPipe.mesh, { name: 'Thin pipe (= pull-up resistor)', job: 'A thin trickle that keeps the junction at high pressure, but is easily beaten by the big drain.', symbol: 'pipe' });
  stage.part(gg.group, { name: 'Junction gauge (= input pin)', job: 'Without the thin pipe it is connected to nothing and wanders.', symbol: 'meter' });
  stage.part(flap, { name: 'Drain valve (= button)', job: 'Opens a wide path to the floor (GND).', symbol: 'valve' });

  // ---- controls
  const row = panel.row();
  panel.button('Press the button once', () => press(), 'btn primary', row);
  panel.button('Reset counter', () => { count = 0; pressesSinceReset = 0; }, 'btn', row);
  panel.segmented('Input pin', [{ value: 'D18', label: 'D18 (GPIO 18)' }, { value: 'D34', label: 'D34 (GPIO 34, input-only)' }], pin, (v) => setPin(v as Pin));
  const row2 = panel.row();
  panel.toggle('INPUT_PULLUP in code', internal, (v) => { internal = v; refresh(); }, row2);
  panel.toggle('External 10 kΩ pull-up', external, (v) => { external = v; refresh(); }, row2);
  panel.toggle('Software debounce (20 ms)', debounce, (v) => { debounce = v; }, row2);
  const chart = panel.chart('Logic analyser: what the pin reads (slow motion ×100)', 120);
  const roR = panel.readout('Pin reads');
  const roC = panel.readout('Presses counted');
  const roS = panel.readout('Contact');
  const note = panel.note('');

  function setPin(p: Pin) {
    pin = p;
    sig18.group.visible = p === 'D18';
    sig34.group.visible = p === 'D34';
    pinTag.show(p === 'D18');
    pinTag34.show(p === 'D34');
    refresh();
  }
  function refresh() {
    pu.visible = external;
    puPipe.mesh.visible = pulled();
    note.set(
      pin === 'D34' && internal && !external
        ? 'INPUT_PULLUP does nothing on GPIO 34–39: they have no internal pull-up. The pin still floats. Add the external 10 kΩ resistor.'
        : !pulled()
          ? 'No pull-up: while the button is open, the pin floats and the counter picks up ghost presses.'
          : '',
      pin === 'D34' && internal && !external ? 'note warn' : 'note',
    );
  }

  function press() {
    if (pressT >= 0) return;
    pressT = 0;
    pressesSinceReset++;
  }

  stage.onUpdate((dt) => {
    const steps = 6;
    const cdt = (dt * 1000) / SLOW / steps; // circuit ms per step
    const up = pulled();
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
      else if (up) v = 3.3;
      else {
        vFloat += (Math.random() - 0.5) * 0.9 + (1.65 - vFloat) * 0.01;
        vFloat = Math.max(0, Math.min(3.3, vFloat));
        v = vFloat;
      }
      const prev = read;
      read = v > 2.475 ? 1 : v < 0.825 ? 0 : read;
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
    gg.set(closed ? 0.05 : up ? 0.85 : vFloat / 3.6);
    const tag = pin === 'D18' ? pinTag : pinTag34;
    tag.set(`${pin} reads ${read ? 'HIGH' : 'LOW'}`, !up && !closed ? 'pin warn' : 'pin');
    countLabel.set(`count: ${count}`, debounce && up ? 'good' : '');
    roR.set(read ? 'HIGH (1)' : 'LOW (0)', !up && !closed ? 'warn' : '');
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

  refresh();
  stage.focusObjects = [b.bb.group];
  stage.enableWater(2, 'real');
  stage.frame({ dir: new THREE.Vector3(0.05, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'countOnce') return { ok: false };
      if (!pulled()) return { ok: false, msg: pin === 'D34' && internal ? 'INPUT_PULLUP has no effect on GPIO 34: the pin still floats.' : 'The pin is still floating: ghost counts will creep in.' };
      if (!debounce) return { ok: false, msg: 'Without debouncing, each bounce counts as a press.' };
      if (pressesSinceReset === 0) return { ok: false, msg: 'Reset the counter, then press the button once.' };
      if (count === 1 && pressesSinceReset === 1) return { ok: true };
      if (pressT >= 0 && count === 0) return { ok: false, msg: 'Wait for the press to finish.' };
      return { ok: false, msg: `${pressesSinceReset} press(es), ${count} counted. Reset the counter and press exactly once.` };
    },
  };
}
