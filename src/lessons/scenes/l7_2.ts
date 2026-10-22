import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { breadboard, contactShadow, marking, mesh, std, M } from '../../three/lib';
import { esp32, jumper, pottedPlant } from '../../three/iot';

// 7.2 Making it permanent: build type, connectors and enclosure, then a year in the garden.
type Build = 'breadboard' | 'perfboard' | 'pcb';
type Conn = 'dupont' | 'jst' | 'screw';
type Box = 'none' | 'box' | 'sealed';

function perfboardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c99a5b';
  g.fillRect(0, 0, 640, 400);
  for (let x = 10; x < 640; x += 20)
    for (let y = 10; y < 400; y += 20) {
      g.fillStyle = '#d98a46';
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a2a1a';
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let build: Build = 'breadboard';
  let conn: Conn = 'dupont';
  let box: Box = 'none';
  let lastYear: string[] = [];

  const table = new THREE.Group();
  stage.real.add(table, contactShadow(16, 10));
  const plant = pottedPlant();
  plant.group.scale.setScalar(0.8);
  plant.group.position.set(6.2, -0.85, -0.6);
  plant.setMoisture(0.6);
  table.add(plant.group);
  stage.part(plant.group, { name: 'The plant', job: 'Plant Buddy\'s reason to exist. The sensors plug in from the box.', symbol: 'sensor' });

  // Three builds; only the chosen one is shown.
  const builds: Record<Build, THREE.Group> = { breadboard: new THREE.Group(), perfboard: new THREE.Group(), pcb: new THREE.Group() };
  {
    const bb = breadboard(26, true);
    builds.breadboard.add(bb.group);
    const e = esp32();
    e.group.position.set(bb.hole(1, 1).x + 1.95, 0, 0);
    bb.group.add(e.group);
    for (let i = 0; i < 4; i++) {
      const j = jumper(bb.hole(18 + i, 9), bb.hole(18 + i + 2, 'bot+'), (['red', 'black', 'yellow', 'blue'] as const)[i], 0.5 + i * 0.15);
      bb.group.add(j.group);
    }
  }
  {
    const pb = mesh(new THREE.BoxGeometry(7.2, 0.16, 4.4), [M.fr4(), M.fr4(), new THREE.MeshStandardMaterial({ map: perfboardTexture(), roughness: 0.7 }), M.fr4(), M.fr4(), M.fr4()] as unknown as THREE.Material, [0, -0.08, 0]);
    builds.perfboard.add(pb);
    const e = esp32();
    e.group.position.set(-1.0, -0.42 + 0.16, 0);
    builds.perfboard.add(e.group);
    for (let i = 0; i < 10; i++) builds.perfboard.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), M.solder(), [1.7 + (i % 5) * 0.3, 0.02, -0.6 + Math.floor(i / 5) * 0.6]));
  }
  {
    const pcb = mesh(new THREE.BoxGeometry(6.2, 0.16, 3.6), std('#0a4a23', 0.35), [0, -0.08, 0]);
    builds.pcb.add(pcb);
    const silk = marking(3.0, 0.6, ['PLANT BUDDY v1'], '#fbfbf7');
    silk.position.set(1.3, 0.002, 1.3);
    builds.pcb.add(silk);
    const e = esp32();
    e.group.position.set(-0.6, -0.42 + 0.16, -0.2);
    builds.pcb.add(e.group);
  }
  for (const [k, g] of Object.entries(builds)) {
    table.add(g);
    stage.part(g, {
      name: k === 'breadboard' ? 'Breadboard build' : k === 'perfboard' ? 'Perfboard build (soldered)' : 'Custom PCB build',
      job: k === 'breadboard' ? 'Perfect for experimenting, but jumpers can wiggle loose.' : k === 'perfboard' ? 'Parts and wires soldered onto a board full of holes: robust, and good for a one-off.' : 'A board made to your design (for example in KiCad) by a factory: small, robust, identical copies.',
      symbol: k === 'breadboard' ? 'breadboard' : 'pcb',
    });
  }
  // Connectors to the sensors (on the right edge).
  const conns: Record<Conn, THREE.Group> = { dupont: new THREE.Group(), jst: new THREE.Group(), screw: new THREE.Group() };
  for (let i = 0; i < 3; i++) {
    conns.dupont.add(mesh(new THREE.BoxGeometry(0.24, 0.6, 0.24), M.plasticBlack(), [3.0, 0.3, -0.5 + i * 0.5]));
    conns.jst.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.8), std('#f1ede0', 0.6), [3.0, 0.18, -0.6 + i * 0.6]));
    conns.screw.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.9), std('#2a8f4a', 0.5), [3.0, 0.3, -0.6 + i * 0.6]));
    conns.screw.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 14), M.steel(), [3.0, 0.62, -0.6 + i * 0.6]));
  }
  for (const [k, g] of Object.entries(conns)) {
    table.add(g);
    stage.part(g, { name: k === 'dupont' ? 'Dupont jumpers to the sensors' : k === 'jst' ? 'JST plugs (lock in place)' : 'Screw terminals', job: k === 'dupont' ? 'Slide on and off easily, and slide off by themselves too.' : k === 'jst' ? 'Click in, can\'t vibrate loose, and can still be unplugged.' : 'Wires clamped under a screw: very secure.', symbol: 'connector' });
  }
  // Enclosures.
  const boxes: Record<Box, THREE.Group> = { none: new THREE.Group(), box: new THREE.Group(), sealed: new THREE.Group() };
  boxes.box.add(mesh(new THREE.BoxGeometry(8.4, 2.4, 5.4), std('#cfd3d8', 0.4, 0, { transparent: true, opacity: 0.28, depthWrite: false }), [0, 0.6, 0]));
  boxes.sealed.add(mesh(new THREE.BoxGeometry(8.4, 2.4, 5.4), std('#9fb8d0', 0.3, 0, { transparent: true, opacity: 0.3, depthWrite: false }), [0, 0.6, 0]));
  boxes.sealed.add(mesh(new THREE.BoxGeometry(8.5, 0.08, 5.5), std('#2c2f33', 0.8), [0, 1.8, 0]));
  boxes.sealed.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16), std('#2c2f33', 0.6), [4.4, 0.4, 0], [0, 0, Math.PI / 2]));
  const ipLabel = marking(1.4, 0.4, ['IP65'], '#2c2f33');
  ipLabel.position.set(-3.2, 1.86, 2.2);
  boxes.sealed.add(ipLabel);
  for (const [k, g] of Object.entries(boxes)) {
    if (k === 'none') continue;
    table.add(g);
    stage.part(g, { name: k === 'box' ? 'Plastic box' : 'Sealed IP65 box with a cable gland', job: k === 'box' ? 'Keeps knocks off, but rain gets in at the seams.' : 'A gasket under the lid and a cable gland for the wires: rain and dust stay out.', symbol: 'pcb' });
  }
  const verdict = stage.label('', table, new THREE.Vector3(0, 3.0, 0), 'big');

  // ---- controls
  panel.segmented('Build', [{ value: 'breadboard', label: 'Breadboard' }, { value: 'perfboard', label: 'Perfboard (soldered)' }, { value: 'pcb', label: 'Custom PCB' }], build, (v) => { build = v as Build; show(); });
  panel.segmented('Connectors to the sensors', [{ value: 'dupont', label: 'Dupont jumpers' }, { value: 'jst', label: 'JST plugs' }, { value: 'screw', label: 'Screw terminals' }], conn, (v) => { conn = v as Conn; show(); });
  panel.segmented('Enclosure', [{ value: 'none', label: 'None' }, { value: 'box', label: 'Plastic box' }, { value: 'sealed', label: 'Sealed IP65 box' }], box, (v) => { box = v as Box; show(); });
  panel.button('Simulate a year in the garden', () => year(), 'btn primary');
  const roY = panel.readout('A year outdoors');
  const log = panel.note('');

  function show() {
    for (const [k, g] of Object.entries(builds)) g.visible = k === build;
    for (const [k, g] of Object.entries(conns)) g.visible = k === conn;
    for (const [k, g] of Object.entries(boxes)) g.visible = k === box;
    lastYear = [];
    roY.set('not tested yet');
    log.set('');
    verdict.set('');
    verdict.show(false);
  }

  function year() {
    const events: string[] = [];
    if (build === 'breadboard') events.push('Week 3: the box got bumped and a jumper slid half out of the breadboard (an open). Readings stopped.');
    if (conn === 'dupont') events.push('Month 2: a Dupont plug on the soil sensor vibrated loose in the wind.');
    if (box === 'none') events.push('Month 1: rain soaked the board. Corrosion and short circuits.');
    if (box === 'box') events.push('Month 4: a storm drove water in at the lid seam. The pins corroded.');
    lastYear = events;
    const ok = events.length === 0;
    roY.set(ok ? 'still working after 12 months' : `${events.length} failure${events.length > 1 ? 's' : ''}`, ok ? 'good' : 'bad');
    log.set(ok ? 'Soldered joints, locking connectors and a sealed box: nothing came loose, nothing got wet.' : events.join(' '), ok ? 'note' : 'note warn');
    verdict.show(true);
    verdict.set(ok ? '12 months: still working ✓' : 'Failed outdoors', ok ? 'good' : 'bad');
    if (ok) ctx.fx.confetti?.(new THREE.Vector3(0, 2, 0));
  }

  show();
  stage.focusObjects = [table];
  stage.frame({ dir: new THREE.Vector3(0.1, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'outdoorReady') return { ok: false };
      if (build === 'breadboard') return { ok: false, msg: 'A breadboard build will shake loose outdoors. Solder it.' };
      if (conn === 'dupont') return { ok: false, msg: 'Dupont jumpers slide off. Use connectors that lock.' };
      if (box !== 'sealed') return { ok: false, msg: 'Rain will get in. Use a sealed enclosure.' };
      if (lastYear.length || roY.el.querySelector('.v')?.textContent === 'not tested yet') return { ok: false, msg: 'Now press "Simulate a year in the garden" to prove it.' };
      return { ok: true };
    },
  };
}
