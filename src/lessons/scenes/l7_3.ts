import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { contactShadow, marking, mesh, std, M } from '../../three/lib';
import { cell18650, esp32, relayModule } from '../../three/iot';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 7.3 Safety: sort what is fine to experiment with, what needs care, and what must be certified.
type Group = '' | 'low' | 'care' | 'mains';
interface Item {
  id: string;
  /** Short tag shown in 3D. */
  short: string;
  name: string;
  job: string;
  answer: Exclude<Group, ''>;
  why: string;
  make(): THREE.Object3D;
  at: [number, number];
}

const GROUPS: { value: Group; label: string }[] = [
  { value: '', label: 'Choose…' },
  { value: 'low', label: 'Fine to experiment with (5 V or less)' },
  { value: 'care', label: 'Handle with care (Li-ion)' },
  { value: 'mains', label: 'Mains: certified products only' },
];

const ITEMS: Item[] = [
  {
    id: 'esp', short: 'ESP32', name: 'ESP32 DevKit', answer: 'low', at: [-5, -1.5],
    job: 'The brain of Plant Buddy. Runs on 5 V USB, works at 3.3 V.',
    why: 'Everything on the board is 5 V or less: safe to experiment with.',
    make: () => esp32().group,
  },
  {
    id: 'relay', short: 'Relay module', name: 'Relay module (low-voltage side)', answer: 'low', at: [-2.0, -1.5],
    job: 'Switches a separate low-voltage load from the ESP32.',
    why: 'Fine while it only switches low voltages, as in this course. Its contacts could switch mains, but that wiring is not for hobby boards.',
    make: () => relayModule().group,
  },
  {
    id: 'bank', short: 'Power bank', name: 'USB power bank', answer: 'low', at: [5.0, -1.5],
    job: 'A sealed Li-ion battery with its own protection and a 5 V USB output.',
    why: 'The Li-ion cell inside is sealed and protected, and you only meet its 5 V output: fine to use.',
    make: () => {
      const g = new THREE.Group();
      g.add(mesh(new RoundedBoxGeometry(2.4, 0.5, 1.3, 3, 0.15), std('#e8eaed', 0.5), [0, 0.25, 0]));
      const t = marking(1.6, 0.4, ['5 V USB'], '#5f6368');
      t.position.y = 0.51;
      g.add(t);
      return g;
    },
  },
  {
    id: 'cell', short: '18650 cell', name: '18650 Li-ion cell', answer: 'care', at: [-5, 2.5],
    job: 'Stores a lot of energy in a small can.',
    why: 'Shorted or crushed, it can overheat and catch fire. Use a holder, protection, and never solder to it.',
    make: () => {
      const c = cell18650();
      c.group.scale.setScalar(0.4);
      return c.group;
    },
  },
  {
    id: 'charger', short: 'Charger board', name: 'Li-ion charger board (with protection)', answer: 'care', at: [-1.2, 2.5],
    job: 'Charges a Li-ion cell safely from USB, and cuts off on overcharge, over-discharge and shorts.',
    why: 'The right tool, but it handles a Li-ion cell: wire it carefully and watch the first charges.',
    make: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(1.7, 0.12, 1.1), std('#1f5fb0', 0.45), [0, 0.06, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), M.steel(), [-0.65, 0.18, 0]));
      const t = marking(1.0, 0.4, ['LiPo charger', 'protected'], '#ffffff');
      t.position.set(0.25, 0.125, 0);
      g.add(t);
      return g;
    },
  },
  {
    id: 'lamp', short: 'Mains cable', name: 'Mains lamp cable and wall socket', answer: 'mains', at: [2.4, 2.5],
    job: 'Carries mains electricity (230 V or 120 V).',
    why: 'Mains can kill. Never open it up or wire it to a hobby board.',
    make: () => {
      const g = new THREE.Group();
      g.add(mesh(new RoundedBoxGeometry(1.4, 0.4, 1.4, 3, 0.12), std('#f4f4f0', 0.5), [0, 0.2, 0]));
      for (const x of [-0.25, 0.25]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), std('#222', 0.8), [x, 0.41, 0]));
      const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.7, 0.15, 0), new THREE.Vector3(1.4, 0.1, 0.4), new THREE.Vector3(1.9, 0.1, -0.3)]), 20, 0.06, 8, false), std('#f4f4f0', 0.6));
      g.add(cable);
      const t = marking(0.9, 0.3, ['230 V'], '#c0392b');
      t.position.set(0, 0.42, 0.5);
      g.add(t);
      return g;
    },
  },
  {
    id: 'plug', short: 'Smart plug', name: 'Smart plug (certified)', answer: 'mains', at: [5.8, 2.5],
    job: 'A tested, sealed product that switches mains when your ESP32 sends it a message over Wi-Fi.',
    why: 'This is how Plant Buddy should switch a mains lamp: buy it certified and use it as it is, never open it.',
    make: () => {
      const g = new THREE.Group();
      g.add(mesh(new RoundedBoxGeometry(1.2, 1.0, 1.2, 4, 0.25), std('#f7f7f5', 0.4), [0, 0.5, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16), std('#2bd16b', 0.3, 0, { emissive: new THREE.Color('#2bd16b'), emissiveIntensity: 0.8 }), [0, 1.0, 0.2]));
      return g;
    },
  },
];

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  const sorted: Record<string, Group> = {};
  const tags: Record<string, ReturnType<typeof stage.label>> = {};
  let first: THREE.Group | null = null;

  const bench = mesh(new THREE.BoxGeometry(15, 0.3, 8), std('#c8a77a', 0.8), [0.4, -0.15, 0.5]);
  stage.real.add(bench, contactShadow(18, 11));
  stage.part(bench, { name: 'Workbench', job: 'Everything here is something a Plant Buddy maker might meet.', symbol: 'pcb' });
  for (const it of ITEMS) {
    const obj = it.make();
    const g = new THREE.Group();
    g.add(obj);
    g.position.set(it.at[0], 0, it.at[1]);
    stage.real.add(g);
    stage.part(g, { name: it.name, job: it.job, symbol: it.answer === 'mains' ? 'supply' : it.answer === 'care' ? 'battery' : 'chip' });
    tags[it.id] = stage.label(it.short, g, new THREE.Vector3(0, 1.9, 0));
    if (!first) first = g;
    sorted[it.id] = '';
  }

  // ---- controls
  for (const it of ITEMS) panel.select(it.name, GROUPS, '', (v) => { sorted[it.id] = v as Group; update(); });
  const roS = panel.readout('Sorted correctly');
  const note = panel.note('');

  function update() {
    let right = 0;
    let lastWrong: Item | null = null;
    for (const it of ITEMS) {
      const s = sorted[it.id];
      const ok = s === it.answer;
      if (ok) right++;
      else if (s) lastWrong = it;
      tags[it.id].set(it.short, s ? (ok ? 'good' : 'bad') : '');
    }
    roS.set(`${right} of ${ITEMS.length}`, right === ITEMS.length ? 'good' : '');
    note.set(lastWrong ? `${lastWrong.name}: not quite. ${lastWrong.why}` : right === ITEMS.length ? 'All sorted. Stay at 5 V and below, treat Li-ion with care, and leave mains to certified products.' : '', lastWrong ? 'note warn' : 'note');
  }

  update();
  if (first) stage.hint(first, 'Tap an item');
  stage.frame({ dir: new THREE.Vector3(0, 1.6, 1), animate: false });

  return {
    check(task) {
      if (task !== 'sorted') return { ok: false };
      const wrong = ITEMS.filter((it) => sorted[it.id] !== it.answer);
      if (!wrong.length) return { ok: true };
      const missing = wrong.filter((it) => !sorted[it.id]).length;
      return { ok: false, msg: missing ? `${missing} item(s) not sorted yet.` : `${wrong.length} item(s) in the wrong group: ${wrong.map((w) => w.name).join(', ')}.` };
    },
  };
}
