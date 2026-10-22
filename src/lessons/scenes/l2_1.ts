import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { dense, espBench, flowAlong, up } from '../kit';
import { led, mesh, resistor } from '../../three/lib';
import { jumperRoute } from '../../three/iot';
import { currentToSpeed } from '../../three/particles';

// 2.1 Breadboards: tap a strip or rail to see what is joined; move the LED until it lights.
type LedPos = 'same' | 'right' | 'off';
const POS_LABEL: Record<LedPos, string> = {
  same: 'Both legs in column 23 (one strip)',
  right: 'Legs in columns 23 and 24',
  off: 'Legs in columns 25 and 26',
};

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let pos: LedPos = 'same';

  const b = espBench(ctx);
  const H = b.H;
  const P = b.bb.pitch;
  // 3V3 and GND to the rails, then the rail → resistor (columns 19–23).
  b.jumper(b.free('3V3'), H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', "Puts 3.3 V on the whole red rail.", 0.5);
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', 'Puts GND on the whole blue rail.', 0.5);
  b.jumper(H(18, 'bot+'), H(18, 9), 'red', 'Red rail to column 19', 'Brings 3.3 V to the resistor\'s first column.', 0.5);
  const res = resistor(220, H(18, 7).distanceTo(H(22, 7)));
  res.group.position.copy(H(18, 7).lerp(H(22, 7), 0.5));
  b.bb.group.add(res.group);
  stage.part(res.group, { name: 'Resistor, 220 Ω', job: 'Its legs sit in columns 19 and 23, so it joins those two strips.', symbol: 'resistor' });
  // Column 24 is wired to GND.
  b.jumper(H(23, 8), H(23, 'bot-'), 'black', 'Column 24 to the blue rail', 'Connects column 24\'s strip to GND.', 0.5);
  b.tag('3V3');
  b.tag('GND');

  // The LED, rebuilt for each position.
  const ledHolder = new THREE.Group();
  b.bb.group.add(ledHolder);
  let light = led('red');
  stage.part(ledHolder, { name: 'LED', job: 'Its long leg (+) must be on the resistor\'s strip and its short leg (−) on a strip wired to GND. Tap it to move it.', symbol: 'led' });
  stage.onTap(ledHolder, () => setPos(pos === 'same' ? 'right' : pos === 'right' ? 'off' : 'same'));
  const placeLed = () => {
    ledHolder.clear();
    light = led('red', pos === 'same' ? P : P);
    if (pos === 'same') {
      // Turned sideways: both legs in column 23, rows f and g.
      light.group.position.copy(H(22, 5).lerp(H(22, 6), 0.5));
      light.group.rotation.y = Math.PI / 2;
    } else {
      const c = pos === 'right' ? 22 : 24;
      light.group.position.copy(H(c, 5).lerp(H(c + 1, 5), 0.5));
    }
    ledHolder.add(light.group);
    // Generous tap target.
    ledHolder.add(mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), new THREE.MeshBasicMaterial({ visible: false }), [light.group.position.x, 0.6, light.group.position.z]));
  };

  // Flow when lit: rail → resistor → LED → column 24 → rail → back through the ESP32.
  const loop = dense([
    up(H(22, 7), 0.32),
    up(H(22, 5), 0.6),
    up(H(23, 5), 0.6),
    up(H(23, 8), 0.05),
    ...jumperRoute(H(23, 8), H(23, 'bot-'), 0.5),
    up(H(23, 'bot-'), 0.04),
    up(H(2, 'bot-'), 0.04),
    ...jumperRoute(H(2, 'bot-'), b.free('GND'), 0.5),
    up(b.free('3V3'), 0.2),
    ...jumperRoute(b.free('3V3'), H(1, 'bot+'), 0.5),
    up(H(1, 'bot+'), 0.04),
    up(H(18, 'bot+'), 0.04),
    ...jumperRoute(H(18, 'bot+'), H(18, 9), 0.5),
    up(H(18, 7), 0.32),
  ]);
  const flow = flowAlong(stage.real, loop);

  // ---- hole explorer: invisible tap targets over every strip and rail.
  const marks: THREE.Mesh[] = [];
  const markGeo = new THREE.TorusGeometry(0.075, 0.022, 6, 16);
  const markMat = new THREE.MeshBasicMaterial({ color: '#ffb020', depthTest: false, transparent: true });
  const explorer = stage.label('', b.bb.group, new THREE.Vector3(0, 0.3, -3.2), 'big');
  explorer.show(false);
  const showStrip = (holes: THREE.Vector3[], text: string) => {
    for (const m of marks) m.removeFromParent();
    marks.length = 0;
    for (const h of holes) {
      const m = new THREE.Mesh(markGeo, markMat);
      m.rotation.x = -Math.PI / 2;
      m.position.copy(h).setY(0.03);
      m.renderOrder = 6;
      m.raycast = () => {};
      b.bb.group.add(m);
      marks.push(m);
    }
    explorer.set(text);
    explorer.show(true);
    roJ.set(text.replace('Joined: ', ''));
    explorer.obj.position.copy(holes[0]).setY(1.6);
  };
  const cols = b.bb.cols;
  for (let c = 0; c < cols; c++) {
    for (const half of [0, 1]) {
      const rows = half ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
      const holes = rows.map((r) => H(c, r));
      const zc = (holes[0].z + holes[4].z) / 2;
      const t = mesh(new THREE.BoxGeometry(P * 0.9, 0.12, P * 5), new THREE.MeshBasicMaterial({ visible: false }), [holes[0].x, 0.06, zc]);
      b.bb.group.add(t);
      const name = `column ${c + 1}, rows ${half ? 'f–j' : 'a–e'}`;
      const espNote = c >= 1 && c <= 15 ? '. An ESP32 pin sits in it, so only one hole is free' : '';
      stage.onTap(t, () => showStrip(holes, `Joined: ${name} (5 holes)${espNote}`));
    }
  }
  for (const rail of ['top+', 'top-', 'bot+', 'bot-'] as const) {
    const holes: THREE.Vector3[] = [];
    for (let c = 0; c < cols; c++) if (c % 6 !== 5) holes.push(H(c, rail));
    const z = holes[0].z;
    const t = mesh(new THREE.BoxGeometry(cols * P, 0.12, 0.2), new THREE.MeshBasicMaterial({ visible: false }), [0, 0.06, z]);
    b.bb.group.add(t);
    const what = rail.endsWith('+') ? 'red (+) rail: 3.3 V here' : 'blue (−) rail: GND here';
    stage.onTap(t, () => showStrip(holes, `Joined: the whole ${rail.startsWith('top') ? 'back' : 'front'} ${what}`));
  }

  // ---- controls
  const sel = panel.select('LED position', (Object.keys(POS_LABEL) as LedPos[]).map((k) => ({ value: k, label: POS_LABEL[k] })), pos, (v) => setPos(v as LedPos));
  const colSel = panel.select(
    'Show what is joined to',
    [{ value: '', label: 'Pick a strip…' }, ...[19, 23, 24, 25].map((c) => ({ value: String(c), label: `Column ${c}, rows f–j` })), { value: 'rail+', label: 'The front red rail' }, { value: 'rail-', label: 'The front blue rail' }],
    '',
    (v) => {
      if (!v) return;
      if (v === 'rail+' || v === 'rail-') {
        const holes: THREE.Vector3[] = [];
        for (let c = 0; c < cols; c++) if (c % 6 !== 5) holes.push(H(c, v === 'rail+' ? 'bot+' : 'bot-'));
        showStrip(holes, `Joined: the whole front ${v === 'rail+' ? 'red (+) rail: 3.3 V here' : 'blue (−) rail: GND here'}`);
      } else {
        const c = Number(v) - 1;
        showStrip([5, 6, 7, 8, 9].map((r) => H(c, r)), `Joined: column ${v}, rows f–j (5 holes)`);
      }
    },
  );
  void colSel;
  const roL = panel.readout('LED');
  const roJ = panel.readout('Joined underneath');
  roJ.set('tap a hole or pick a strip');
  const note = panel.note('');

  function setPos(p: LedPos) {
    pos = p;
    sel.set(p);
    placeLed();
    update();
  }

  function update() {
    const lit = pos === 'right';
    light.setLight(lit ? 0.55 : 0);
    flow.speed = lit ? currentToSpeed(0.0059, 0.003, 5) : 0;
    flow.mesh.visible = lit;
    roL.set(lit ? 'lit (5.9 mA)' : 'dark', lit ? 'good' : '');
    note.set(
      pos === 'same'
        ? 'Both legs are on the same strip, so the strip bypasses the LED. Current goes straight through the metal.'
        : pos === 'off'
          ? 'Now neither leg shares a strip with the resistor or with GND: the LED is not connected to anything.'
          : 'Each leg has its own strip: + on the resistor\'s column, − on the column wired to GND.',
      lit ? 'note' : 'note warn',
    );
  }

  stage.onUpdate((dt) => flow.update(dt));

  placeLed();
  update();
  stage.hint(ledHolder, 'Tap the LED to move it');
  stage.focusObjects = [b.bb.group];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.5, 1), animate: false });

  return {
    check(task) {
      if (task !== 'ledLit') return { ok: false };
      if (pos === 'right') return { ok: true };
      return { ok: false, msg: pos === 'same' ? 'Both legs are still on one strip.' : 'The LED is not on the resistor\'s strip or the GND strip.' };
    },
  };
}
