import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { bme280, type JumperObj } from '../../three/iot';
import type { WireColor } from '../../three/lib';
import { h } from '../../core/dom';

// 5.1 Reading a module's facts, then wiring the BME280 to the ESP32.
export const BME_FACTS = [
  ['Supply (VIN)', '3.3 V only: this board has no regulator'],
  ['Logic level', '3.3 V'],
  ['Interface', 'I2C, address 0x76 (0x77 with the address jumper)'],
  ['Current', 'about 3.6 µA, measuring once a second'],
  ['Pins', 'VIN, GND, SCL (clock), SDA (data)'],
] as const;

type ModPin = 'VIN' | 'GND' | 'SCL' | 'SDA';
type Target = '' | '3V3' | 'VIN5' | 'GND' | 'D21' | 'D22' | 'D4';
const TARGETS: { value: Target; label: string }[] = [
  { value: '', label: 'not connected' },
  { value: '3V3', label: 'ESP32 3V3 (red rail)' },
  { value: 'VIN5', label: 'ESP32 VIN (5 V from USB)' },
  { value: 'GND', label: 'GND (blue rail)' },
  { value: 'D21', label: 'D21 (GPIO 21, SDA)' },
  { value: 'D22', label: 'D22 (GPIO 22, SCL)' },
  { value: 'D4', label: 'D4 (GPIO 4)' },
];
const CORRECT: Record<ModPin, Target> = { VIN: '3V3', GND: 'GND', SCL: 'D22', SDA: 'D21' };
const COLORS: Record<ModPin, WireColor> = { VIN: 'red', GND: 'black', SCL: 'yellow', SDA: 'blue' };
const JOBS: Record<ModPin, string> = {
  VIN: 'Power in. This board wants 3.3 V only.',
  GND: 'The 0 V reference, shared with the ESP32.',
  SCL: 'I2C clock: the ESP32 sets the pace on this wire.',
  SDA: 'I2C data: the bits travel both ways on this wire.',
};

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  const wiring: Record<ModPin, Target> = { VIN: '', GND: '', SCL: '', SDA: '' };
  let fried = false;

  const b = espBench(ctx);
  const H = b.H;
  b.jumper(b.free('3V3'), H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', 'Puts 3.3 V on the red rail.', 0.5);
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', 'Puts GND on the blue rail.', 0.5);
  const mod = bme280();
  const pinCol: Record<ModPin, number> = { VIN: 21, GND: 22, SCL: 23, SDA: 24 };
  mod.group.position.copy(H(22, 8).lerp(H(23, 8), 0.5));
  b.bb.group.add(mod.group);
  stage.part(mod.group, { name: 'BME280 module', job: 'Temperature, humidity and air pressure sensor. Tap its pins, or read the facts sheet below the scene.', symbol: 'sensor' });
  // Pin tap targets with their own tooltips.
  for (const [i, p] of (['VIN', 'GND', 'SCL', 'SDA'] as ModPin[]).entries()) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    t.position.copy(H(pinCol[p], 8)).setY(1.0);
    b.bb.group.add(t);
    stage.part(t, { name: `BME280 pin ${p}`, job: JOBS[p], symbol: 'pin' });
    stage.label(p, b.bb.group, H(pinCol[p], 8).setY(1.3 + (i % 2) * 0.45), 'pin');
  }
  const targetHole = (p: ModPin, tg: Target): THREE.Vector3 | null => {
    const c = pinCol[p];
    switch (tg) {
      case '3V3': return H(c, 'bot+');
      case 'GND': return H(c, 'bot-');
      case 'VIN5': return b.free('VIN');
      case 'D21': return b.free('D21');
      case 'D22': return b.free('D22');
      case 'D4': return b.free('D4');
      default: return null;
    }
  };
  const jumpers = {} as Record<ModPin, JumperObj>;
  for (const p of ['VIN', 'GND', 'SCL', 'SDA'] as ModPin[]) {
    jumpers[p] = b.jumper(H(pinCol[p], 9), H(pinCol[p], 'bot+'), COLORS[p], `${p} wire`, `Joins the BME280's ${p} pin to the ESP32.`, 0.6);
    jumpers[p].group.visible = false;
  }
  const scanLabel = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.2, -0.6), 'big');
  b.tag('D21');
  b.tag('D22');

  // ---- facts sheet + controls
  panel.custom(
    h(
      'div',
      { class: 'ctl' },
      h('span', { class: 'lab' }, 'Facts sheet: BME280 board (from its product page)'),
      h('table', { class: 'facts' }, BME_FACTS.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)))),
    ),
  );
  const sels = {} as Record<ModPin, { set(v: Target): void }>;
  for (const p of ['VIN', 'GND', 'SCL', 'SDA'] as ModPin[]) {
    sels[p] = panel.select<Target>(`BME280 ${p} goes to`, TARGETS, '', (v) => setWire(p, v));
  }
  const roS = panel.readout('I2C scanner says');
  const note = panel.note('');

  function setWire(p: ModPin, tg: Target) {
    wiring[p] = tg;
    const to = targetHole(p, tg);
    jumpers[p].group.visible = !!to;
    if (to) jumpers[p].set(H(pinCol[p], 9), to, tg === 'VIN5' || tg.startsWith('D') ? 1.5 : 0.6);
    update();
  }

  function update() {
    if (wiring.VIN === 'VIN5' && wiring.GND === 'GND' && !fried) {
      fried = true;
      const p = mod.group.position.clone().setY(1.4);
      fx.flash(p, '#ffe0a0', 1.6);
      fx.smoke(p, 3, 10, true);
      ctx.fail({
        title: '5 V on a 3.3 V-only board',
        text: 'On USB power the ESP32\'s VIN pin carries 5 V. This BME280 board has no regulator and is rated for 3.3 V only, so 5 V can damage it. The facts sheet said so: **always check the supply voltage before wiring**.',
        undo: () => {
          fried = false;
          sels.VIN.set('3V3');
          setWire('VIN', '3V3');
        },
        undoLabel: 'Undo (VIN to 3V3)',
      });
    }
    const powered = wiring.VIN === '3V3' && wiring.GND === 'GND' && !fried;
    const bus = wiring.SDA === 'D21' && wiring.SCL === 'D22';
    const swapped = wiring.SDA === 'D22' && wiring.SCL === 'D21';
    const found = powered && bus;
    roS.set(found ? 'Found a device at 0x76' : 'No I2C devices found', found ? 'good' : 'warn');
    scanLabel.set(found ? 'I2C scan: 0x76 ✓ (BME280)' : 'I2C scan: nothing found', found ? 'good' : 'warn');
    note.set(
      fried
        ? 'The module is damaged.'
        : swapped
          ? 'SDA and SCL are swapped: the ESP32 sends its clock on the data wire, so nothing answers.'
          : !powered && (wiring.VIN || wiring.GND)
            ? 'The module needs both power (VIN to 3.3 V) and GND before it can answer.'
            : powered && !bus && (wiring.SDA || wiring.SCL)
              ? 'Power is fine. Now the two I2C wires: SDA to D21, SCL to D22.'
              : '',
      swapped ? 'note warn' : 'note',
    );
  }

  update();
  stage.hint(mod.group, 'Tap the pins');
  stage.focusObjects = [b.bb.group];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'wireBme') return { ok: false };
      if (fried) return { ok: false, msg: 'The module is damaged. Undo first.' };
      const wrong = (Object.keys(CORRECT) as ModPin[]).filter((p) => wiring[p] !== CORRECT[p]);
      if (!wrong.length) return { ok: true };
      return { ok: false, msg: `Not right yet: ${wrong.join(', ')}.` };
    },
  };
}
