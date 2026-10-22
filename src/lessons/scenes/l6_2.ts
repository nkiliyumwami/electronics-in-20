import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { PcbBoard, TOP, jst2 } from '../../three/pcb';
import { chipPassive, contactShadow, led, sot23, mesh } from '../../three/lib';

type PartId = 'R' | 'Q' | 'LED' | 'J';
interface Fp { id: string; name: string; x: number; y: number; w: number; h: number }

// Footprints on the board (mm). Pads are added from these definitions below.
const FPS: Fp[] = [
  { id: 'r0805', name: '0805 / 2012 metric', x: 8, y: 8, w: 6, h: 5 },
  { id: 'r0603', name: '0603 / 1608 metric', x: 20, y: 8, w: 6, h: 5 },
  { id: 'm0603', name: 'metric 0603 (= imperial 0201)', x: 32, y: 8, w: 6, h: 5 },
  { id: 'sot23', name: 'SOT-23 (3 pins)', x: 44, y: 8, w: 7, h: 6 },
  { id: 'sot223', name: 'SOT-223 (4 pads)', x: 8, y: 23, w: 9, h: 9 },
  { id: 'tht254', name: '2 holes, 2.54 mm pitch', x: 22, y: 23, w: 7, h: 6 },
  { id: 'jstph', name: 'JST-PH 2-pin, 2.0 mm pitch', x: 34, y: 23, w: 8, h: 8 },
  { id: 'hdr254', name: '2-pin header, 2.54 mm, square pads', x: 46, y: 23, w: 8, h: 8 },
];
const CORRECT: Record<PartId, string> = { R: 'r0805', Q: 'sot23', LED: 'tht254', J: 'jstph' };
const SHORT: Record<PartId, string> = { R: '0805 resistor', Q: 'SOT-23 MOSFET', LED: '5 mm LED', J: 'JST-PH connector' };
const PART_NAMES: Record<PartId, string> = {
  R: '0805 resistor (2.0 × 1.25 mm)',
  Q: 'SOT-23 MOSFET (2.9 × 1.3 mm, 3 pins)',
  LED: '5 mm LED (legs 2.54 mm apart)',
  J: 'JST-PH connector (pins 2.0 mm apart)',
};

/** Why a part does not fit a footprint. */
function why(part: PartId, fp: string): string {
  const smd = ['r0805', 'r0603', 'm0603', 'sot23', 'sot223'];
  const tht = ['tht254', 'jstph', 'hdr254'];
  if ((part === 'R' || part === 'Q') && tht.includes(fp)) return 'These are holes for through-hole legs. This part is surface-mount: it sits flat on pads.';
  if ((part === 'LED' || part === 'J') && smd.includes(fp)) return 'This part has legs that go through holes, but this footprint only has flat surface pads.';
  if (part === 'R') {
    if (fp === 'r0603') return 'Pads too small: these are for a 1.6 × 0.8 mm (0603) part. The 0805 is 2.0 × 1.25 mm, so its ends overhang the pads.';
    if (fp === 'm0603') return 'Far too small! "Metric 0603" means 0.6 × 0.3 mm, which is imperial 0201. Same digits, different system.';
    return `Pin count: the resistor has 2 ends, this footprint has ${fp === 'sot23' ? 3 : 4} pads.`;
  }
  if (part === 'Q') {
    if (fp === 'sot223') return 'SOT-223 is a much bigger package (6.5 × 3.5 mm, 4 pads). SOT-23 is 2.9 × 1.3 mm with 3 pins.';
    return 'Pin count: the MOSFET has 3 pins, but this footprint has only 2 pads.';
  }
  if (part === 'LED') {
    if (fp === 'jstph') return "Pitch: the LED's legs are 2.54 mm apart, and these holes are 2.0 mm apart.";
    return 'Right spacing, but these square pads mark a header footprint with a different outline and hole size. Use the LED footprint (round pads, 2.54 mm).';
  }
  if (fp === 'tht254' || fp === 'hdr254') return 'Pitch: JST-PH pins are 2.0 mm apart and these holes are 2.54 mm apart. Close, but it will not fit.';
  return 'Wrong pattern.';
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  const placed: Partial<Record<PartId, string>> = {};
  let selPart: PartId | null = null;

  // ---- the board, at 3× scale so small parts are visible
  const SCALE = 3;
  const b = new PcbBoard(56, 32);
  const pad = (id: string, x: number, y: number, w: number, h: number, o: { round?: boolean; drill?: number } = {}) => b.pad(id, '-', x, y, w, h, o);
  // Pad patterns (centres in mm).
  pad('a1', 7.05, 8, 1.0, 1.3); pad('a2', 8.95, 8, 1.0, 1.3);
  pad('b1', 19.25, 8, 0.8, 0.9); pad('b2', 20.75, 8, 0.8, 0.9);
  pad('c1', 31.7, 8, 0.3, 0.3); pad('c2', 32.3, 8, 0.3, 0.3);
  pad('d1', 43.05, 9.1, 0.8, 0.9); pad('d2', 44.95, 9.1, 0.8, 0.9); pad('d3', 44, 6.9, 0.8, 0.9);
  pad('e1', 5.7, 26, 1.0, 1.8); pad('e2', 8, 26, 1.0, 1.8); pad('e3', 10.3, 26, 1.0, 1.8); pad('e4', 8, 20, 3.4, 1.8);
  pad('f1', 20.73, 23, 1.6, 1.6, { round: true, drill: 0.9 }); pad('f2', 23.27, 23, 1.6, 1.6, { round: true, drill: 0.9 });
  pad('g1', 34, 22, 1.4, 1.4, { round: true, drill: 0.8 }); pad('g2', 34, 24, 1.4, 1.4, { round: true, drill: 0.8 });
  pad('h1', 46, 21.73, 1.7, 1.7, { drill: 1.0 }); pad('h2', 46, 24.27, 1.7, 1.7, { round: true, drill: 1.0 });
  b.silkDraw = (g, px) => {
    g.font = `bold ${px(1.25)}px system-ui`;
    for (const f of FPS) {
      g.strokeRect(px(f.x - f.w / 2), px(f.y - f.h / 2), px(f.w), px(f.h));
      g.fillText(f.name.split(' (')[0].split(',')[0], px(f.x - f.w / 2), px(f.y + f.h / 2 + 1.6));
    }
  };
  b.finish();
  b.group.scale.setScalar(SCALE);
  stage.real.add(b.group, contactShadow(20, 13));
  stage.part(b.layers.maskTop, { name: 'Board with footprints', job: 'Eight pad patterns. Each fits exactly one kind of part.', symbol: 'pcb' });

  // Footprint hit areas + labels + highlight overlays.
  const overlays: Record<string, THREE.Mesh> = {};
  for (const f of FPS) {
    const hit = mesh(new THREE.BoxGeometry(f.w * 0.1, 0.05, f.h * 0.1), new THREE.MeshBasicMaterial({ visible: false }), [0, 0, 0]);
    hit.position.copy(b.at(f.x, f.y, TOP + 0.02));
    b.group.add(hit);
    stage.onTap(hit, () => tryPlace(f.id));
    const ov = mesh(new THREE.PlaneGeometry(f.w * 0.1, f.h * 0.1), new THREE.MeshBasicMaterial({ color: '#2f9e44', transparent: true, opacity: 0.0, depthWrite: false }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
    ov.position.copy(b.at(f.x, f.y, TOP + 0.01));
    b.group.add(ov);
    overlays[f.id] = ov;
    stage.part(hit, { name: `Footprint: ${f.name}`, job: 'A pad pattern. Tap a part first, then tap here to try it.', symbol: 'pcb' });
  }

  // ---- parts tray in front of the board
  const tray = new THREE.Group();
  tray.position.set(0, 0, 7.2);
  stage.real.add(tray, mesh(new THREE.BoxGeometry(12, 0.1, 2.6), new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.8 }), [0, -0.06, 7.2]));
  const models: Record<PartId, THREE.Object3D> = {
    R: chipPassive(0.2, 0.125, 'R', '103'),
    Q: sot23('A09T'),
    LED: led('red', 0.254).group,
    J: jst2(2.0),
  };
  const trayPos: Record<PartId, THREE.Vector3> = {
    R: new THREE.Vector3(-4.2, 0, 0),
    Q: new THREE.Vector3(-1.4, 0, 0),
    LED: new THREE.Vector3(1.4, 0, 0),
    J: new THREE.Vector3(4.2, 0, 0),
  };
  const holders: Record<PartId, THREE.Group> = {} as never;
  const partLabels: Record<PartId, ReturnType<typeof stage.label>> = {} as never;
  for (const id of Object.keys(models) as PartId[]) {
    const hg = new THREE.Group();
    const m = models[id];
    m.scale.setScalar(SCALE);
    hg.add(m);
    hg.position.copy(trayPos[id]);
    tray.add(hg);
    holders[id] = hg;
    // Big invisible tap target.
    hg.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), new THREE.MeshBasicMaterial({ visible: false }), [0, 0.5, 0]));
    stage.onTap(hg, () => selectPart(id));
    partLabels[id] = stage.label(SHORT[id], hg, new THREE.Vector3(0, id === 'LED' ? 3.4 : 1.4, 0));
  }
  const status = stage.label('Tap a part, then the pads where it belongs', stage.real, new THREE.Vector3(0, 0.5, 9), 'big');

  // ---- controls (keyboard path)
  const partSel = panel.select('Part', (Object.keys(PART_NAMES) as PartId[]).map((id) => ({ value: id, label: PART_NAMES[id] })), 'R', (v) => selectPart(v as PartId));
  const fpSel = panel.select('Footprint', FPS.map((f) => ({ value: f.id, label: f.name })), FPS[0].id, () => {});
  const row = panel.row();
  panel.button('Place it', () => {
    selectPart(partSel.get() as PartId);
    tryPlace(fpSel.get());
  }, 'btn primary', row);
  panel.button('Back to the tray', () => reset(), 'btn', row);
  const roP = panel.readout('Correctly placed');

  function selectPart(id: PartId) {
    if (placed[id]) return;
    selPart = id;
    partSel.set(id);
    for (const k of Object.keys(holders) as PartId[]) holders[k].position.y = k === id ? 0.5 : 0;
    status.set(`${PART_NAMES[id]} selected: now tap a footprint`);
  }

  function tryPlace(fp: string) {
    if (!selPart) {
      status.set('Pick a part first', 'warn');
      return;
    }
    if (Object.values(placed).includes(fp)) {
      status.set('That footprint is already taken', 'warn');
      return;
    }
    const part = selPart;
    const f = FPS.find((x) => x.id === fp)!;
    const hg = holders[part];
    const target = b.group.localToWorld(b.at(f.x, f.y, TOP)).sub(tray.position);
    if (CORRECT[part] === fp) {
      hg.position.copy(target);
      placed[part] = fp;
      (overlays[fp].material as THREE.MeshBasicMaterial).color.set('#2f9e44');
      (overlays[fp].material as THREE.MeshBasicMaterial).opacity = 0.35;
      status.set(`${PART_NAMES[part].split(' (')[0]} fits ✓`, 'good');
      partLabels[part].show(false);
      selPart = null;
      ctx.clearFail();
    } else {
      hg.position.copy(target).setY(target.y + 0.6);
      (overlays[fp].material as THREE.MeshBasicMaterial).color.set('#e03131');
      (overlays[fp].material as THREE.MeshBasicMaterial).opacity = 0.45;
      ctx.fail({ title: "It doesn't fit", text: why(part, fp) });
      setTimeout(() => {
        if (placed[part]) return;
        hg.position.copy(trayPos[part]).setY(0.5);
        (overlays[fp].material as THREE.MeshBasicMaterial).opacity = 0;
      }, 1600);
    }
    roP.set(`${Object.keys(placed).length} / 4`, Object.keys(placed).length === 4 ? 'good' : '');
  }

  function reset() {
    for (const id of Object.keys(holders) as PartId[]) {
      holders[id].position.copy(trayPos[id]);
      partLabels[id].show(true);
    }
    for (const k of Object.keys(placed) as PartId[]) delete placed[k];
    for (const o of Object.values(overlays)) (o.material as THREE.MeshBasicMaterial).opacity = 0;
    selPart = null;
    roP.set('0 / 4');
  }

  roP.set('0 / 4');
  stage.frame({ dir: new THREE.Vector3(0, 1.9, 1), animate: false });

  return {
    check(task) {
      if (task !== 'matchAll') return { ok: false };
      const n = Object.keys(placed).length;
      if (n === 4) return { ok: true };
      const left = (Object.keys(PART_NAMES) as PartId[]).filter((id) => !placed[id]).map((id) => PART_NAMES[id].split(' (')[0]);
      return { ok: false, msg: `${n} of 4 placed. Still in the tray: ${left.join(', ')}.` };
    },
  };
}
