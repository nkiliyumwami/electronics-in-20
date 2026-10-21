import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { nightLight, PART_INFO, TOP } from '../../three/pcb';
import { contactShadow, mesh, std, wire } from '../../three/lib';
import { Circuit, type Elem } from '../../sim/solver';
import { Multimeter } from '../../tools/multimeter';
import { h } from '../../core/dom';

const R_BOARD = 250; // Ω: the board's normal load at 5 V (20 mA)
const BURN_A = 0.5;

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let vset = 5;
  let ilim = 3;
  let on = false;
  let bridge = true;
  let burnt = false;
  let over = 0;
  let pressed = false;
  const done = { inspect: false, shorts: false, limited: false, rails: false, signals: false };
  let warnedCC = false;

  // ---- board
  const nl = nightLight({ withParts: true });
  const b = nl.board;
  const holder = new THREE.Group();
  holder.scale.setScalar(1.6);
  holder.position.set(0.6, 0, 0.4);
  holder.add(b.group);
  stage.real.add(holder, contactShadow(14, 10));
  for (const [ref, obj] of Object.entries(nl.parts)) stage.part(obj, { name: PART_INFO[ref].name, job: PART_INFO[ref].job, symbol: PART_INFO[ref].symbol, actions: ref === 'SW1' ? () => [{ label: 'Press', run: () => press() }] : undefined });
  stage.part(b.layers.maskTop, { name: 'Freshly assembled board', job: 'Guilty until proven innocent.', symbol: 'pcb' });
  // Solder bridge across C1's pads.
  const bridgeMesh = mesh(new THREE.CapsuleGeometry(0.045, 0.16, 6, 12), std('#e3e7ea', 0.12, 1), [0, 0, 0], [0, 0, Math.PI / 2]);
  bridgeMesh.position.copy(b.at(25, 14.5, TOP + 0.04));
  b.group.add(bridgeMesh);
  stage.part(bridgeMesh, {
    name: 'Solder bridge',
    job: 'A blob of solder joining C1\'s two pads: +5V straight to GND. A short circuit.',
    symbol: 'wire',
    actions: () => [{ label: 'Remove it (solder wick)', run: () => removeBridge() }],
  });
  const ring = mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 24), new THREE.MeshBasicMaterial({ color: '#ffb000', transparent: true, opacity: 0 }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
  ring.position.copy(b.at(25, 14.5, TOP + 0.05));
  b.group.add(ring);

  // ---- bench supply
  const ps = new THREE.Group();
  ps.position.set(-6.3, -0.2, -1.4);
  ps.rotation.y = 0.45;
  ps.add(mesh(new THREE.BoxGeometry(3, 1.6, 2.2), std('#d9dbd6', 0.6), [0, 0.8, 0]));
  ps.add(mesh(new THREE.BoxGeometry(2.9, 1.5, 0.05), std('#2f3237', 0.5), [0, 0.8, 1.11]));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  ps.add(mesh(new THREE.PlaneGeometry(2.4, 0.75), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [0, 1.15, 1.14]));
  const knobV = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), std('#222', 0.4), [-0.6, 0.45, 1.18], [Math.PI / 2, 0, 0]);
  const knobI = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), std('#222', 0.4), [0, 0.45, 1.18], [Math.PI / 2, 0, 0]);
  const btnOut = mesh(new THREE.BoxGeometry(0.35, 0.22, 0.08), std('#3a3d42', 0.4, 0, { emissive: new THREE.Color('#2bd16b'), emissiveIntensity: 0 }), [0.75, 0.45, 1.16]);
  const termR = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.15, 16), std('#c0281f', 0.4), [1.1, 0.75, 1.18], [Math.PI / 2, 0, 0]);
  const termB = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.15, 16), std('#151515', 0.4), [1.1, 0.4, 1.18], [Math.PI / 2, 0, 0]);
  ps.add(knobV, knobI, btnOut, termR, termB);
  stage.real.add(ps);
  stage.part(ps, { name: 'Bench power supply', job: 'Sets a voltage AND a current limit. If the board tries to draw more than the limit, the supply holds the current there (CC mode) and lets the voltage drop.', symbol: 'supply', actions: () => [{ label: on ? 'Output OFF' : 'Output ON', run: () => setOn(!on) }] });
  stage.real.updateMatrixWorld(true);
  const tR = ps.localToWorld(new THREE.Vector3(1.1, 0.75, 1.3));
  const tB = ps.localToWorld(new THREE.Vector3(1.1, 0.4, 1.3));
  const j1p = holder.localToWorld(b.at(4, 6, TOP + 0.4));
  const j1g = holder.localToWorld(b.at(4, 8, TOP + 0.4));
  stage.real.add(wire([tR, tR.clone().add(new THREE.Vector3(0.3, 0, 0.5)), new THREE.Vector3(j1p.x - 0.6, 0.6, j1p.z), j1p], 'red', 0.04).mesh);
  stage.real.add(wire([tB, tB.clone().add(new THREE.Vector3(0.3, 0, 0.7)), new THREE.Vector3(j1g.x - 0.6, 0.4, j1g.z), j1g], 'black', 0.04).mesh);

  // ---- meter
  const pt = (x: number, y: number) => stage.real.worldToLocal(holder.localToWorld(b.at(x, y, TOP)));
  const meter = new Multimeter(
    stage,
    stage.real,
    [
      { id: 'tp5', label: '+5V test point (J1 pin 1)', node: 'rail', pos: pt(4, 6) },
      { id: 'tpg', label: 'GND test point (J1 pin 2)', node: 'gnd', pos: pt(4, 8) },
      { id: 'c1a', label: 'C1 left pad (+5V)', node: 'rail', pos: pt(24.05, 14.5) },
      { id: 'c1b', label: 'C1 right pad (GND)', node: 'gnd', pos: pt(25.95, 14.5) },
      { id: 'u18', label: 'U1 pin 8 (VCC)', node: 'rail', pos: pt(22.7, 16.1) },
    ],
    { modes: ['V', 'OHM', 'BEEP'], mode: 'BEEP', at: new THREE.Vector3(4.6, 0, 2.6), rotY: -0.6, probeY: 0.02, scale: 0.9 },
  );

  // ---- controls
  const checklist = h('ol', { class: 'note', style: { margin: 0, paddingLeft: '1.3em' } });
  panel.custom(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Bring-up checklist'), checklist));
  const row0 = panel.row();
  panel.button('1. Inspect with a magnifier', () => inspect(), 'btn', row0);
  const rmBtn = panel.button('Remove the solder bridge', () => removeBridge(), 'btn', row0);
  panel.slider({ label: 'Supply voltage', min: 0, max: 12, step: 0.1, value: vset, nudge: true, format: (v) => `${v.toFixed(1)} V`, onInput: (v) => { vset = v; } });
  panel.slider({ label: 'Current limit', min: 0.01, max: 3, log: true, value: ilim, nudge: true, snap: (v) => (v < 0.1 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100), format: (v) => (v < 1 ? `${(v * 1000).toFixed(0)} mA` : `${v.toFixed(2)} A`), onInput: (v) => { ilim = v; } });
  const row = panel.row();
  const outBtn = panel.button('Output ON', () => setOn(!on), 'btn primary', row);
  panel.button('Press SW1 (test the signal)', () => press(), 'btn', row);
  meter.controls(panel);
  const roV = panel.readout('Supply shows V');
  const roI = panel.readout('Supply shows A');
  const roM = panel.readout('Mode');

  function renderChecklist() {
    checklist.innerHTML = '';
    const items: [keyof typeof done, string][] = [
      ['inspect', 'Inspect for bridges, missing or rotated parts'],
      ['shorts', 'Power off: measure +5V to GND (should not be near 0 Ω)'],
      ['limited', 'Power on with a current limit (100 mA or less)'],
      ['rails', 'Measure the rail: about 5 V'],
      ['signals', 'Test a signal: press SW1, the indicator lights'],
    ];
    for (const [k, t] of items) checklist.append(h('li', { style: { color: done[k] ? 'var(--good)' : '' } }, `${done[k] ? '✓ ' : ''}${t}`));
  }
  function inspect() {
    done.inspect = true;
    (ring.material as THREE.MeshBasicMaterial).opacity = 1;
    stage.focus(bridgeMesh, 2.2);
    renderChecklist();
  }
  function removeBridge() {
    if (on) {
      ctx.fail({ title: 'Switch off first', text: 'Never rework a board while it is powered.' });
      return;
    }
    bridge = false;
    bridgeMesh.visible = false;
    (ring.material as THREE.MeshBasicMaterial).opacity = 0;
    rmBtn.setAttribute('disabled', '');
    rmBtn.textContent = 'Bridge removed ✓';
  }
  function setOn(v: boolean) {
    on = v;
    outBtn.textContent = v ? 'Output OFF' : 'Output ON';
    (btnOut.material as THREE.MeshStandardMaterial).emissiveIntensity = v ? 1.5 : 0;
    warnedCC = false;
  }
  function press() {
    pressed = true;
    nl.button.press(true);
    setTimeout(() => {
      pressed = false;
      nl.button.press(false);
    }, 900);
  }

  let sol: ReturnType<Circuit['dc']> | null = null;
  function solve() {
    const elems: Elem[] = [
      { kind: 'R', id: 'lead', a: 'sp', b: 'rail', r: 0.05 },
      { kind: 'R', id: 'load', a: 'rail', b: 'gnd', r: burnt ? 1e9 : R_BOARD },
      ...meter.elements(),
    ];
    if (bridge && !burnt) elems.push({ kind: 'R', id: 'bridge', a: 'rail', b: 'gnd', r: 0.02 });
    if (on) elems.push({ kind: 'SUPPLY', id: 'PS', p: 'sp', n: 'gnd', v: vset, ilim });
    sol = new Circuit(elems).dc();
    meter.read(sol, on);
  }

  stage.onUpdate((dt, t) => {
    solve();
    const I = on && sol ? sol.i('PS') : 0;
    const V = on && sol ? sol.v('sp') : 0;
    const cc = on && sol ? sol.on('PS') : false;
    drawDisplay(V, I, cc);
    roV.set(`${V.toFixed(2)} V`);
    roI.set(I < 1 ? `${(I * 1000).toFixed(0)} mA` : `${I.toFixed(2)} A`, cc ? 'warn' : '');
    roM.set(!on ? 'output off' : cc ? 'CC: current limit!' : 'CV: normal', cc ? 'bad' : on ? 'good' : '');
    (ring.material as THREE.MeshBasicMaterial).opacity = done.inspect && bridge ? 0.6 + 0.4 * Math.sin(t * 6) : 0;
    // Checklist progress.
    const rail = (meter.nodeOf('red') === 'rail' && meter.nodeOf('black') === 'gnd') || (meter.nodeOf('red') === 'gnd' && meter.nodeOf('black') === 'rail');
    if (!on && rail && (meter.mode === 'OHM' || meter.mode === 'BEEP') && isFinite(meter.value)) done.shorts = true;
    if (on && ilim <= 0.1 + 1e-9) done.limited = true;
    if (on && rail && meter.mode === 'V' && Math.abs(meter.value) > 4.9) done.rails = true;
    const working = on && !cc && V > 4.9 && !bridge && !burnt;
    if (working && pressed) done.signals = true;
    nl.led.emissiveIntensity = working && (pressed || done.signals) ? 3 : 0.05;
    renderChecklistThrottled();
    // Danger: big current through the bridge.
    if (on && bridge && !burnt && I > BURN_A) {
      over += dt;
      if (over > 0.6) burn(I);
    } else over = 0;
    if (on && bridge && cc && I <= BURN_A && !warnedCC) {
      warnedCC = true;
      ctx.fail({
        title: 'The current limit saved the board',
        text: `The supply hit its ${(ilim * 1000).toFixed(0)} mA limit and the voltage collapsed to ${V.toFixed(2)} V: the signature of a short. Nothing got hot. Switch off and find the short with the meter.`,
        good: true,
      });
    }
  });
  let lastList = '';
  function renderChecklistThrottled() {
    const key = JSON.stringify(done);
    if (key !== lastList) {
      lastList = key;
      renderChecklist();
    }
  }

  function burn(I: number) {
    burnt = true;
    const p = stage.real.worldToLocal(holder.localToWorld(b.at(25, 14.5, TOP + 0.2)));
    fx.flash(p, '#fff0b0', 2);
    fx.sparks(p, 40);
    fx.smoke(p, 3, 16, true);
    setOn(false);
    ctx.fail({
      title: 'What happened? The short burned the board.',
      text: `With a ${ilim.toFixed(2)} A limit, the supply happily pushed ${I.toFixed(2)} A through the solder bridge. The bridge and the thin traces next to it overheated and burned. A 100 mA limit would have turned this into a harmless "CC" warning.`,
      undo: () => {
        burnt = false;
        over = 0;
        fx.clear();
      },
      undoLabel: 'Undo (fresh board, output off)',
    });
  }

  function drawDisplay(V: number, I: number, cc: boolean) {
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#0d1410';
    g.fillRect(0, 0, 512, 160);
    g.font = 'bold 64px ui-monospace, Consolas, monospace';
    g.fillStyle = '#ff5a3c';
    g.fillText(`${V.toFixed(2)}V`, 18, 78);
    g.fillStyle = '#ffc93c';
    g.fillText(I < 1 ? `${(I * 1000).toFixed(0)}mA` : `${I.toFixed(2)}A`, 270, 78);
    g.font = 'bold 26px system-ui';
    g.fillStyle = '#7f8c84';
    g.fillText(`set ${vset.toFixed(1)}V`, 22, 130);
    g.fillText(`limit ${ilim < 1 ? (ilim * 1000).toFixed(0) + 'mA' : ilim.toFixed(2) + 'A'}`, 272, 130);
    g.fillStyle = cc ? '#ff3b30' : '#2a3b30';
    g.fillText('CC', 452, 130);
    g.fillStyle = on && !cc ? '#2bd16b' : '#2a3b30';
    g.fillText('CV', 452, 40);
    tex.needsUpdate = true;
  }

  renderChecklist();
  stage.focusObjects = [holder, ps, meter.group];
  stage.frame({ dir: new THREE.Vector3(0.1, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'bringUp') return { ok: false };
      if (burnt) return { ok: false, msg: 'The board burned. Tap Undo first.' };
      if (bridge) return { ok: false, msg: 'The short is still there.' };
      if (!on) return { ok: false, msg: 'Switch the output on.' };
      if (ilim > 0.1 + 1e-9) return { ok: false, msg: `The current limit is ${ilim < 1 ? (ilim * 1000).toFixed(0) + ' mA' : ilim.toFixed(2) + ' A'}. Set it to 100 mA or less for a first power-up.` };
      const V = sol ? sol.v('sp') : 0;
      if (V < 4.9) return { ok: false, msg: `The rail is at ${V.toFixed(2)} V.` };
      return { ok: true };
    },
  };
}
