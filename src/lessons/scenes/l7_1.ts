import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { nightLight, T, type LayerName } from '../../three/pcb';
import { contactShadow, mesh, std, M } from '../../three/lib';
import { BOM } from '../../content/nightlight';
import { h } from '../../core/dom';

const STEPS = [
  { name: 'Copper-clad panel', file: 'Material: 1.6 mm FR-4, 1 oz copper on both sides', what: 'The raw material: fibreglass with copper foil bonded to both faces.' },
  { name: 'Drill', file: 'Drill file (Excellon): every hole position and size', what: 'A CNC drill makes every via and through-hole.' },
  { name: 'Plate the holes', file: 'Drill file (plated holes)', what: 'Copper is plated inside each hole, joining the two copper layers: holes become vias.' },
  { name: 'Image and etch', file: 'Gerbers: top copper, bottom copper', what: 'Your trace pattern is printed as a mask, and all the unprotected copper is etched away.' },
  { name: 'Solder mask', file: 'Gerbers: top and bottom solder mask', what: 'The green coating goes on, with openings only over the pads.' },
  { name: 'Silkscreen', file: 'Gerber: top silkscreen', what: 'White ink prints the part outlines and names.' },
  { name: 'Surface finish', file: 'Order option: ENIG (gold) or HASL (tin)', what: 'Exposed pads get a thin protective coating, so they stay solderable.' },
  { name: 'Cut out the board', file: 'Gerber: board outline', what: 'The board is routed out of the production panel.' },
];

const MPN_OPTIONS = [
  { value: '', label: '— choose —' },
  { value: 'vague', label: '"100nF cap" (no part number)' },
  { value: 'CL10B104KB8NNNC', label: 'CL10B104KB8NNNC: 100 nF, 0603' },
  { value: 'CL21B104KBCNNNC', label: 'CL21B104KBCNNNC: 100 nF, 0805' },
  { value: 'GRM31CR71H475KA12L', label: 'GRM31CR71H475KA12L: 4.7 µF, 1206' },
];

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let step = 0;
  let c1Choice = 'vague';

  const nl = nightLight({ withParts: false });
  const b = nl.board;
  const holder = new THREE.Group();
  holder.scale.setScalar(1.6);
  holder.add(b.group);
  stage.real.add(holder, contactShadow(12, 9));
  const L = b.layers;

  // Full copper sheets that get etched away, and a production-panel frame.
  const yTop = T.mask + T.cu + T.core;
  const sheetTop = mesh(new THREE.BoxGeometry(5, T.cu, 3), M.copper().clone(), [0, yTop + T.cu / 2 + 0.003, 0]);
  const sheetBot = mesh(new THREE.BoxGeometry(5, T.cu, 3), M.copper().clone(), [0, T.mask + T.cu / 2 - 0.003, 0]);
  const sheetMats = [sheetTop.material as THREE.MeshStandardMaterial, sheetBot.material as THREE.MeshStandardMaterial];
  sheetMats.forEach((m) => {
    m.transparent = true;
  });
  b.group.add(sheetTop, sheetBot);
  const frame = new THREE.Group();
  const fr = (w: number, d: number, x: number, z: number) => frame.add(mesh(new THREE.BoxGeometry(w, T.core + 2 * T.cu, d), std('#c9a46a', 0.5, 0.4), [x, T.mask + (T.core + 2 * T.cu) / 2, z]));
  fr(6.4, 0.6, 0, -1.85);
  fr(6.4, 0.6, 0, 1.85);
  fr(0.6, 3.1, -2.85, 0);
  fr(0.6, 3.1, 2.85, 0);
  b.group.add(frame);
  stage.part(frame, { name: 'Production panel', job: 'Boards are made several at a time in a bigger panel, then cut out.', symbol: 'pcb' });
  // Drill holes at every via and through-hole (dark cylinders).
  const holes = new THREE.Group();
  for (const v of b.vias) holes.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, T.core + 2 * T.cu + 0.01, 10), std('#151515', 0.9), [b.at(v.x, v.y, 0).x, T.mask + (T.core + 2 * T.cu) / 2, b.at(v.x, v.y, 0).z]));
  for (const p of b.pads) if (p.drill) holes.add(mesh(new THREE.CylinderGeometry((p.drill * 0.1) / 2, (p.drill * 0.1) / 2, T.core + 2 * T.cu + 0.01, 14), std('#151515', 0.9), [b.at(p.x, p.y, 0).x, T.mask + (T.core + 2 * T.cu) / 2, b.at(p.x, p.y, 0).z]));
  b.group.add(holes);
  // Drill bit.
  const bit = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 10), M.steel(), [0, 1.0, 0]);
  b.group.add(bit);
  const padMats = b.pads.map((p) => (p.mesh.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial);
  const barrels = b.vias.map((v) => v.barrel).concat(L.core.children.filter((c) => (c as THREE.Mesh).geometry instanceof THREE.CylinderGeometry) as THREE.Mesh[]);
  const fileLabel = stage.label('', holder, new THREE.Vector3(0, 1.0, -2.0), 'big');

  // ---- controls
  const steps = h('div', { class: 'steps', 'aria-label': 'Factory steps' });
  panel.custom(steps);
  const row = panel.row();
  const prev = panel.button('← Previous step', () => go(step - 1), 'btn', row);
  const next = panel.button('Next step →', () => go(step + 1), 'btn primary', row);
  const roStep = panel.readout('Step');
  const roFile = panel.readout('Driven by');
  const what = panel.note('');

  // BOM table.
  const bomBody = h('tbody');
  const bomTable = h('table', { class: 'datasheet' }, h('caption', null, 'Bill of materials (BOM)'), h('thead', null, h('tr', null, h('th', null, 'Ref'), h('th', null, 'Value'), h('th', null, 'Footprint'), h('th', null, 'Manufacturer part number'))), bomBody);
  const c1Sel = h('select', { 'aria-label': 'C1 manufacturer part number' }, MPN_OPTIONS.map((o) => h('option', { value: o.value }, o.label))) as HTMLSelectElement;
  c1Sel.value = 'vague';
  c1Sel.addEventListener('change', () => {
    c1Choice = c1Sel.value;
    renderBom();
  });
  const bomNote = h('p', { class: 'note', 'aria-live': 'polite', style: { margin: 0 } });
  panel.custom(h('div', { class: 'ctl' }, h('div', { class: 'table-wrap' }, bomTable), bomNote));
  function renderBom() {
    bomBody.innerHTML = '';
    for (const r of BOM) {
      const isC1 = r.ref === 'C1';
      const ok = !isC1 || c1Choice === 'CL21B104KBCNNNC';
      bomBody.append(h('tr', { class: ok ? '' : 'hl' }, h('td', null, r.ref), h('td', null, r.value), h('td', null, r.footprint), h('td', null, isC1 ? c1Sel : r.mpn)));
    }
    const msg: Record<string, string> = {
      vague: '⚠ C1 says "100nF cap": which one? Size, voltage and material all matter. This line blocks the order.',
      '': '⚠ C1 has no part number yet.',
      CL10B104KB8NNNC: '✗ Right value, wrong size: this part is 0603, but the footprint on the board is 0805.',
      GRM31CR71H475KA12L: '✗ Wrong part: 4.7 µF in a 1206 package. C1 must be 100 nF in 0805.',
      CL21B104KBCNNNC: '✓ C1 now names one exact part: 100 nF, 0805, as on the board.',
    };
    bomNote.textContent = msg[c1Choice];
    bomNote.className = c1Choice === 'CL21B104KBCNNNC' ? 'note' : 'note warn';
  }

  let etch = 1; // 1 = full copper sheets, 0 = etched
  let bitT = -1;
  function go(i: number) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    prev.toggleAttribute('disabled', step === 0);
    next.toggleAttribute('disabled', step === STEPS.length - 1);
    const s = STEPS[step];
    steps.innerHTML = '';
    STEPS.forEach((x, k) => steps.append(h('span', { class: `st ${k < step ? 'done' : k === step ? 'cur' : ''}` }, `${k + 1}. ${x.name}`)));
    roStep.set(`${step + 1}. ${s.name}`);
    roFile.set(s.file);
    what.set(s.what);
    fileLabel.set(`📄 ${s.file}`);
    const vis = (k: LayerName, v: boolean) => (L[k].visible = v);
    vis('maskTop', step >= 4);
    vis('maskBot', step >= 4);
    vis('silkTop', step >= 5);
    // Copper patterns appear once etched; the solid sheets cover them before.
    vis('cuTop', step >= 3);
    vis('cuBot', step >= 3);
    sheetTop.visible = sheetBot.visible = step <= 3;
    if (step < 3) etch = 1;
    holes.visible = step >= 1 && step < 3;
    for (const br of barrels) br.visible = step >= 2;
    frame.visible = step < 7;
    bitT = step === 1 ? 0 : -1;
    bit.visible = step === 1;
    const finish = step >= 6;
    padMats.forEach((m) => m.color.set(finish ? '#e8c35a' : '#d98a46'));
  }

  stage.onUpdate((dt) => {
    if (step === 3 && etch > 0) etch = Math.max(0, etch - dt / 1.8);
    sheetMats.forEach((m) => (m.opacity = step >= 3 ? etch : 1));
    if (step >= 3 && etch <= 0) sheetTop.visible = sheetBot.visible = false;
    if (bitT >= 0) {
      bitT += dt;
      const i = Math.floor(bitT / 0.35) % (b.vias.length + 4);
      const target = i < b.vias.length ? b.vias[i] : b.pads.filter((p) => p.drill)[i - b.vias.length];
      if (target) {
        const p = b.at(target.x, target.y, 0);
        bit.position.set(p.x, 0.75 + Math.abs(Math.sin((bitT / 0.35) * Math.PI)) * 0.4, p.z);
      }
    }
  });

  renderBom();
  go(0);
  stage.frame({ dir: new THREE.Vector3(0, 1.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'fixBom') return { ok: false };
      if (c1Choice === 'CL21B104KBCNNNC') return { ok: true };
      return { ok: false, msg: bomNote.textContent ?? '' };
    },
  };
}
