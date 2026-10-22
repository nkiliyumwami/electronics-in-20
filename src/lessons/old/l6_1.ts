import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { PcbBoard, TOP, jst2, tactSmd } from '../../three/pcb';
import { chipPassive, contactShadow, smdLed, sot23 } from '../../three/lib';
import { SchematicEditor, type SchPart } from '../../tools/schematic';
import { h } from '../../core/dom';

// Schematic parts (SVG coordinates).
const SCH: SchPart[] = [
  { ref: 'BT1', sym: 'battery', x: 60, y: 170, vertical: true, value: '5 V battery', pins: [{ id: 'BT1.+', x: 60, y: 130, label: '+' }, { id: 'BT1.-', x: 60, y: 210, label: '−' }] },
  { ref: 'SW1', sym: 'button', x: 180, y: 70, value: 'button', pins: [{ id: 'SW1.1', x: 140, y: 70 }, { id: 'SW1.2', x: 220, y: 70 }] },
  { ref: 'R1', sym: 'resistor', x: 280, y: 230, vertical: true, value: '10 kΩ', pins: [{ id: 'R1.1', x: 280, y: 190 }, { id: 'R1.2', x: 280, y: 270 }] },
  { ref: 'R2', sym: 'resistor', x: 380, y: 50, value: '220 Ω', pins: [{ id: 'R2.1', x: 340, y: 50 }, { id: 'R2.2', x: 420, y: 50 }] },
  { ref: 'D1', sym: 'led', x: 520, y: 50, value: 'LED', pins: [{ id: 'D1.A', x: 480, y: 50, label: 'A' }, { id: 'D1.K', x: 560, y: 50, label: 'K' }] },
  { ref: 'Q1', sym: 'mosfet', x: 560, y: 190, value: 'MOSFET', pins: [{ id: 'Q1.G', x: 525, y: 200, label: 'G' }, { id: 'Q1.D', x: 570, y: 150, label: 'D' }, { id: 'Q1.S', x: 570, y: 230, label: 'S' }] },
];
export const GOAL_6_1: Record<string, string[]> = {
  '+5V': ['BT1.+', 'SW1.1', 'R2.1'],
  GATE: ['SW1.2', 'R1.1', 'Q1.G'],
  LED_A: ['R2.2', 'D1.A'],
  DRAIN: ['D1.K', 'Q1.D'],
  GND: ['Q1.S', 'R1.2', 'BT1.-'],
};

// Where each schematic pin lands on the board (mm).
const PADS: Record<string, [number, number, number, number, boolean?]> = {
  'BT1.+': [4, 7, 1.4, 1.4, true],
  'BT1.-': [4, 9, 1.4, 1.4, true],
  'SW1.1': [8.75, 18, 1.4, 1.0],
  'SW1.2': [15.25, 18, 1.4, 1.0],
  'R1.1': [20, 19.05, 1.3, 1.0],
  'R1.2': [20, 20.95, 1.3, 1.0],
  'R2.1': [21.05, 7, 1.0, 1.3],
  'R2.2': [22.95, 7, 1.0, 1.3],
  'D1.A': [27.05, 7, 1.0, 1.3],
  'D1.K': [28.95, 7, 1.0, 1.3],
  'Q1.G': [31.05, 17.1, 0.8, 0.9],
  'Q1.S': [32.95, 17.1, 0.8, 0.9],
  'Q1.D': [32, 14.9, 0.8, 0.9],
};

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let pressed = false;

  // ---- 3D board: pads and parts, no copper yet; nets show as ratsnest lines.
  const b = new PcbBoard(38, 26);
  for (const [id, [x, y, w, hh, round]] of Object.entries(PADS)) b.pad(id, '?', x, y, w, hh, round ? { round: true, drill: 0.8 } : {});
  b.silkDraw = (g, px) => {
    g.font = `bold ${px(1.4)}px system-ui`;
    const t = (s: string, x: number, y: number) => g.fillText(s, px(x), px(y));
    t('BT1', 1.2, 12);
    t('SW1', 10.5, 23.5);
    t('R1', 21.6, 21);
    t('R2', 21, 5);
    t('D1', 27, 5);
    t('Q1', 30.2, 13.4);
  };
  b.finish();
  stage.real.add(b.group, contactShadow(6, 4.5));
  const place = (obj: THREE.Object3D, x: number, y: number, rot = 0) => {
    obj.position.copy(b.at(x, y));
    obj.rotation.y = rot;
    b.group.add(obj);
    return obj;
  };
  stage.part(place(jst2(2.0), 4, 8), { name: 'BT1 battery connector', job: 'Where the 5 V battery plugs in.', symbol: 'connector' });
  const sw = tactSmd();
  stage.part(place(sw.group, 12, 18), { name: 'SW1 button', job: 'Connects its two sides while pressed.', symbol: 'button', actions: () => [{ label: pressed ? 'Release' : 'Press', run: () => setPressed(!pressed) }] });
  stage.part(place(chipPassive(0.2, 0.125, 'R', '103'), 20, 20, Math.PI / 2), { name: 'R1 10 kΩ', job: 'Pull-down: keeps the gate at 0 V when the button is not pressed.', symbol: 'resistor' });
  stage.part(place(chipPassive(0.2, 0.125, 'R', '221'), 22, 7), { name: 'R2 220 Ω', job: 'Sets the LED current.', symbol: 'resistor' });
  const led = smdLed('#ff3020');
  stage.part(place(led.group, 28, 7), { name: 'D1 LED', job: 'Lights when Q1 switches on.', symbol: 'led' });
  stage.part(place(sot23('A09T'), 32, 16), { name: 'Q1 MOSFET', job: 'The switch: gate controls drain-to-source.', symbol: 'mosfet' });
  stage.part(b.layers.maskTop, { name: 'Bare board', job: 'Pads but no copper traces yet: the layout comes after the schematic.', symbol: 'pcb' });
  const rats = new THREE.Group();
  b.group.add(rats);
  const ledLabel = stage.label('', led.group, new THREE.Vector3(0, 0.4, 0), 'big');
  ledLabel.show(false);

  // ---- schematic editor in the panel
  const ed = new SchematicEditor(SCH, GOAL_6_1);
  panel.custom(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Schematic: tap a pin, then another pin'), ed.el));
  panel.custom(ed.controls());
  const row = panel.row();
  const pressBtn = panel.button('Press SW1 (simulate)', () => setPressed(!pressed), 'btn primary', row);
  const roN = panel.readout('Goal nets complete');
  const roS = panel.readout('Simulation');

  function setPressed(v: boolean) {
    pressed = v;
    sw.press(v);
    pressBtn.textContent = v ? 'Release SW1' : 'Press SW1 (simulate)';
    update();
  }

  function update() {
    // Ratsnest + pad colours from the schematic's nets.
    for (const c of [...rats.children]) {
      rats.remove(c);
      (c as THREE.Line).geometry.dispose();
    }
    for (const p of b.pads) (p.mesh.children[0] as THREE.Mesh).material && ((p.mesh.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.set('#000');
    for (const g of ed.nets()) {
      const color = new THREE.Color(ed.colorOf(g));
      const pts = g.map((id) => PADS[id]).filter(Boolean).map(([x, y]) => b.at(x, y, TOP + 0.03)).sort((a, c) => a.x - c.x);
      for (let i = 0; i < pts.length - 1; i++) {
        const geo = new THREE.BufferGeometry().setFromPoints([pts[i], pts[i + 1]]);
        rats.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
      }
      for (const id of g) {
        const pad = b.pads.find((p) => p.id === id);
        const m = pad?.mesh.children[0] as THREE.Mesh | undefined;
        if (m) {
          (m.material as THREE.MeshStandardMaterial).emissive.copy(color);
          (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
        }
      }
    }
    const st = ed.status();
    roN.set(`${st.complete.length} / ${st.total}${st.shorts.length ? ' · short!' : ''}`, st.ok ? 'good' : st.shorts.length ? 'bad' : '');
    const on = st.ok && pressed;
    led.lens.emissiveIntensity = on ? 3 : 0.05;
    ledLabel.show(st.ok);
    ledLabel.set(on ? 'LED on' : 'LED off', on ? 'good' : '');
    roS.set(st.ok ? (on ? 'Button pressed → MOSFET on → LED on' : 'Circuit complete: press the button') : 'Finish the nets to simulate', st.ok ? 'good' : '');
  }
  ed.onChange = update;

  update();
  stage.frame({ dir: new THREE.Vector3(0, 1.5, 1), animate: false });

  return {
    check(task) {
      if (task !== 'allNets') return { ok: false };
      const st = ed.status();
      if (st.ok) return { ok: true };
      if (st.shorts.length) return { ok: false, msg: 'Two different nets are joined together (a short). Remove the wire that merges them.' };
      const missing = Object.keys(GOAL_6_1).filter((n) => !st.complete.includes(n));
      return { ok: false, msg: `Still to finish: ${missing.join(', ')}.` };
    },
  };
}
