import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, dense, flowAlong, jumperPts, up, waterLoop, WATER_FLOW } from '../kit';
import { resistor, led, fuse, mesh, std, type WireObj } from '../../three/lib';
import { currentToSpeed } from '../../three/particles';
import { Circuit, type Elem } from '../../sim/solver';
import { pipe } from '../../three/water';
import { Multimeter } from '../../tools/multimeter';
import { h } from '../../core/dom';

type WireId = 'w1' | 'w2' | 'w3';
const WIRE_NAMES: Record<WireId, string> = { w1: 'red wire', w2: 'yellow link wire', w3: 'black wire' };
const FUSE_A = 0.5;

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let connected = true;
  let bridged = false;
  let fuseBlown = false;
  const cut: Record<WireId, boolean> = { w1: false, w2: false, w3: false };
  let hidden: WireId | null = null; // secretly broken wire during the hunt
  let huntSolved = false;
  let solvedWire: WireId | null = null;
  const testedOpen = new Set<WireId>();
  let over = 0;

  // ---- real view
  const b = bench(ctx);
  const H = b.bb.hole;
  const res = resistor(330, H(13, 2).distanceTo(H(9, 2)));
  res.group.position.copy(H(13, 2).lerp(H(9, 2), 0.5));
  stage.real.add(res.group);
  stage.part(res.group, { name: 'Resistor, 330 Ω', job: 'Limits the current through the LED.', symbol: 'resistor' });
  const ledObj = led('red', 0.254);
  ledObj.group.position.copy(H(7, 2).lerp(H(6, 2), 0.5));
  ledObj.group.rotation.y = Math.PI; // anode (+, long leg) on column 8
  stage.real.add(ledObj.group);
  stage.part(ledObj.group, { name: 'LED', job: 'Lights when current flows through it.', symbol: 'led' });
  const fz = b.plus.z;
  const fu = fuse();
  fu.group.position.set(b.plus.x + 0.9, -0.85, fz + 0.9);
  stage.real.add(fu.group);
  stage.part(fu.group, { name: 'Fuse (500 mA)', job: 'A deliberately weak link. If current goes far above 500 mA, its thin wire melts and opens the circuit before anything else burns.', symbol: 'fuse' });
  const fuseL = fu.group.position.clone().add(new THREE.Vector3(-0.5, 0.3, 0));
  const fuseR = fu.group.position.clone().add(new THREE.Vector3(0.5, 0.3, 0));
  const lead = addWire(ctx, [b.plus.clone(), b.plus.clone().add(new THREE.Vector3(0.2, 0, 0)), new THREE.Vector3(b.plus.x + 0.2, fuseL.y, fuseL.z), fuseL], 'red', 'Battery lead');
  void lead;
  const w1Pts = [fuseR, fuseR.clone().add(new THREE.Vector3(0.3, 0, 0)), new THREE.Vector3(fuseR.x + 0.3, 0.7, fuseR.z), up(H(13, 0), 0.7), H(13, 0)];
  const w2Pts = jumperPts(H(9, 4), H(7, 4), 0.45);
  const w3Pts = batteryPts(b.minus, -1, H(6, 0), 0.9);
  const wires: Record<WireId, WireObj> = {
    w1: addWire(ctx, w1Pts, 'red', 'Red wire'),
    w2: addWire(ctx, w2Pts, 'yellow', 'Yellow link wire'),
    w3: addWire(ctx, w3Pts, 'black', 'Black wire'),
  };
  const cutLabels = {} as Record<WireId, ReturnType<typeof stage.label>>;
  const mid = (pts: THREE.Vector3[]) => pts[Math.floor(pts.length / 2)].clone().lerp(pts[Math.floor(pts.length / 2) - 1], 0.5);
  for (const id of ['w1', 'w2', 'w3'] as WireId[]) {
    const pts = id === 'w1' ? w1Pts : id === 'w2' ? w2Pts : w3Pts;
    cutLabels[id] = stage.label('✂ cut', stage.real, up(mid(pts), 0.15), 'bad');
    cutLabels[id].show(false);
    wires[id].mesh.userData.part.actions = () => [{ label: cut[id] ? 'Reconnect' : 'Cut this wire', run: () => setCut(id, !cut[id]) }];
  }
  const bridgePts = jumperPts(H(13, 4), H(6, 4), 0.35);
  const bridge = addWire(ctx, bridgePts, 'white', 'Bridge wire (+ to −)');
  bridge.mesh.visible = false;

  // Particles: main loop and the bridge path.
  const loopPts = dense([
    b.plus.clone(), fuseL, fuseR, ...w1Pts.slice(1),
    H(13, 2), up(H(13, 2), 0.32), up(H(9, 2), 0.32), H(9, 2), H(9, 4), ...w2Pts.slice(1), H(7, 2), up(H(7, 2), 0.6), up(H(6, 2), 0.6), H(6, 2), H(6, 0),
    ...[...w3Pts].reverse().slice(1), b.minus.clone(),
  ].map((p) => (p.y < 0.02 && p.y > -0.1 ? up(p, 0.02) : p)));
  const flow = flowAlong(stage.real, loopPts);
  const bflow = flowAlong(stage.real, dense([H(13, 0), H(13, 4), ...bridgePts.slice(1), H(6, 0)].map((p) => (p.y < 0.02 ? up(p, 0.02) : p))), undefined, { closed: false });
  bflow.mesh.visible = false;
  const iLabel = stage.label('', stage.real, new THREE.Vector3(2.7, 0.7, -1.3), 'big');

  // ---- water view
  const w = waterLoop(ctx);
  w.narrowing.setNarrow(0.6);
  const bypass = pipe([new THREE.Vector3(w.x1, w.y, w.zb + 0.6), new THREE.Vector3(w.x1 - 0.8, w.y + 0.5, 0), new THREE.Vector3(w.x0 + 0.8, w.y + 0.5, 0), new THREE.Vector3(w.x0, w.y, w.zb + 0.6)], 0.13);
  bypass.mesh.visible = false;
  w.group.add(bypass.mesh);
  const bypassFlow = flowAlong(w.group, dense([new THREE.Vector3(w.x1, w.y, w.zb + 0.6), new THREE.Vector3(w.x1 - 0.8, w.y + 0.5, 0), new THREE.Vector3(w.x0 + 0.8, w.y + 0.5, 0), new THREE.Vector3(w.x0, w.y, w.zb + 0.6)]), WATER_FLOW, { closed: false, radius: 0.07 });
  bypassFlow.mesh.visible = false;
  const disc = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), std('#d33', 0.5), [w.x0 + 0.9, w.y, w.zb], [0, 0, Math.PI / 2]);
  w.group.add(disc);
  stage.part(disc, { name: 'Burst disc (= fuse)', job: 'A weak spot that breaks first when the flow gets dangerously high.', symbol: 'fuse' });
  const wcaps = mesh(new THREE.BoxGeometry(0.06, 0.36, 0.36), std('#c0281f', 0.5), [-0.9, w.y, w.zf]);
  wcaps.visible = false;
  w.group.add(wcaps);
  stage.part(bypass.mesh, { name: 'Bypass pipe (= short)', job: 'A shortcut around the narrow pipe. Almost nothing limits the flow, so it rushes through.', symbol: 'pipe' });

  // ---- meter for the hunt
  const points = () => [
    { id: 'w1a', label: 'Red wire: fuse end', node: 'f', pos: fuseR.clone().setY(-0.55) },
    { id: 'w1b', label: 'Red wire: board end (col 14)', node: 'a', pos: H(13, 1) },
    { id: 'w2a', label: 'Yellow wire: col 10 end', node: 'r', pos: H(9, 3) },
    { id: 'w2b', label: 'Yellow wire: col 8 end', node: 'la', pos: H(7, 3) },
    { id: 'w3a', label: 'Black wire: board end (col 7)', node: 'c', pos: H(6, 1) },
    { id: 'w3b', label: 'Black wire: battery end', node: 'bm', pos: b.minus.clone().add(new THREE.Vector3(-0.05, 0, 0)) },
  ];
  const meter = new Multimeter(stage, stage.real, points(), { modes: ['V', 'BEEP'], mode: 'BEEP', at: new THREE.Vector3(3.9, -0.85, 1.4), rotY: -0.5, probeY: 0 });

  // ---- controls
  const r1 = panel.row();
  const powerBtn = panel.button('Disconnect battery', () => setConnected(!connected), 'btn', r1);
  const bridgeBtn = panel.button('Bridge + to − (short)', () => setBridge(!bridged), 'btn danger', r1);
  const cutRow = h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Cut a wire (open)'));
  const cutBtns = h('div', { class: 'btnrow' });
  const cutButtons = {} as Record<WireId, HTMLButtonElement>;
  for (const id of ['w1', 'w2', 'w3'] as WireId[]) {
    cutButtons[id] = h('button', { class: 'btn small', type: 'button', onclick: () => setCut(id, !cut[id]) }, `Cut ${WIRE_NAMES[id]}`) as HTMLButtonElement;
    cutBtns.append(cutButtons[id]);
  }
  cutRow.append(cutBtns);
  panel.custom(cutRow);
  meter.controls(panel);
  const huntRow = h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Fault hunt'));
  const huntBtns = h('div', { class: 'btnrow' });
  const startBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => startHunt() }, 'Start the fault hunt');
  huntBtns.append(startBtn);
  for (const id of ['w1', 'w2', 'w3'] as WireId[]) huntBtns.append(h('button', { class: 'btn small', type: 'button', onclick: () => replace(id) }, `Replace ${WIRE_NAMES[id]}`));
  huntRow.append(huntBtns);
  panel.custom(huntRow);
  const roI = panel.readout('Current');
  const roL = panel.readout('LED');
  const roF = panel.readout('Fuse');
  const note = panel.note('');

  function setConnected(v: boolean) {
    connected = v;
    powerBtn.textContent = v ? 'Disconnect battery' : 'Reconnect battery';
    solve();
  }
  function setBridge(v: boolean) {
    bridged = v;
    bridge.mesh.visible = v;
    bridgeBtn.textContent = v ? 'Remove the bridge' : 'Bridge + to − (short)';
    if (!v) bridge.setGlow(0);
    solve();
  }
  function setCut(id: WireId, v: boolean) {
    cut[id] = v;
    wires[id].mesh.visible = !v;
    cutLabels[id].show(v);
    cutButtons[id].textContent = v ? `Reconnect ${WIRE_NAMES[id]}` : `Cut ${WIRE_NAMES[id]}`;
    solve();
  }
  function startHunt() {
    for (const id of ['w1', 'w2', 'w3'] as WireId[]) setCut(id, false);
    setBridge(false);
    fuseBlown = false;
    fu.setBlown(false);
    const ids: WireId[] = ['w1', 'w2', 'w3'];
    hidden = ids[Math.floor(Math.random() * 3)];
    huntSolved = false;
    solvedWire = null;
    testedOpen.clear();
    startBtn.textContent = 'Restart the hunt';
    note.set('Fault hunt on: one wire looks fine but is broken inside. The LED is dark. Find it with the beeper.', 'note warn');
    solve();
  }
  function replace(id: WireId) {
    if (!hidden && !huntSolved) {
      note.set('Start the fault hunt first.', 'note');
      return;
    }
    if (huntSolved) {
      note.set('Already fixed. Restart the hunt for a new fault.', 'note');
      return;
    }
    if (id !== hidden) {
      note.set(`The ${WIRE_NAMES[id]} was fine: it beeps from end to end. Keep testing.`, 'note warn');
      return;
    }
    hidden = null;
    huntSolved = true;
    solvedWire = id;
    ctx.fail({ title: 'Fixed!', text: `The ${WIRE_NAMES[id]} was the open one. ${testedOpen.has(id) ? 'You proved it with the beeper first: no beep across it.' : 'Next time, prove it with the beeper before replacing anything.'}`, good: true });
    note.set(connected ? 'Fault fixed.' : 'Fault fixed. Reconnect the battery to see the LED again.', 'note');
    solve();
  }

  const wireOpen = (id: WireId) => cut[id] || hidden === id;
  let I = 0;
  let iBridge = 0;
  let iFuse = 0;
  function solve() {
    const elems: Elem[] = [
      { kind: 'R', id: 'fuse', a: 'bp', b: 'f', r: fuseBlown ? 1e12 : 0.1 },
      { kind: 'R', id: 'w1', a: 'f', b: 'a', r: wireOpen('w1') ? 1e12 : 0.02 },
      { kind: 'R', id: 'R1', a: 'a', b: 'r', r: 330 },
      { kind: 'R', id: 'w2', a: 'r', b: 'la', r: wireOpen('w2') ? 1e12 : 0.02 },
      { kind: 'D', id: 'LED', a: 'la', k: 'c', vf: 2.0, rs: 2 },
      { kind: 'R', id: 'w3', a: 'c', b: 'bm', r: wireOpen('w3') ? 1e12 : 0.02 },
      ...meter.elements(),
    ];
    if (bridged) elems.push({ kind: 'R', id: 'bridge', a: 'a', b: 'c', r: 0.02 });
    if (connected) elems.push({ kind: 'V', id: 'B', p: 'bp', n: 'bm', v: 9, rs: 0.3 });
    const sol = new Circuit(elems).dc();
    meter.read(sol, connected);
    I = Math.max(0, sol.i('LED'));
    iBridge = bridged ? Math.abs(sol.i('bridge')) : 0;
    iFuse = Math.abs(sol.i('fuse'));
    // Remember which wires were proven open with the beeper.
    if (hidden && meter.mode === 'BEEP' && meter.text === 'OL') {
      const pair = [meter.red, meter.black].sort().join('|');
      const map: Record<string, WireId> = { 'w1a|w1b': 'w1', 'w2a|w2b': 'w2', 'w3a|w3b': 'w3' };
      if (map[pair]) testedOpen.add(map[pair]);
    }
    ledObj.setLight(I / 0.02);
    flow.speed = currentToSpeed(iFuse - iBridge, 0.004, 5);
    bflow.mesh.visible = bridged && iBridge > 0.001;
    bflow.speed = currentToSpeed(iBridge, 0.004, 9);
    // Water twin.
    w.flow.speed = currentToSpeed(I, 0.004, 5);
    bypass.mesh.visible = bridged;
    bypassFlow.mesh.visible = bridged && iBridge > 0.001;
    bypassFlow.speed = bflow.speed;
    disc.visible = !fuseBlown;
    wcaps.visible = cut.w1 || cut.w2 || cut.w3 || !!hidden;
    roI.set(iFuse > 1 ? `${iFuse.toFixed(1)} A` : `${(iFuse * 1000).toFixed(1)} mA`, iFuse > FUSE_A ? 'bad' : '');
    roL.set(I > 0.001 ? 'lit' : 'dark', I > 0.001 ? 'good' : 'warn');
    roF.set(fuseBlown ? 'blown' : 'OK', fuseBlown ? 'bad' : 'good');
    iLabel.set(iFuse > 1 ? `I = ${iFuse.toFixed(1)} A!` : `I = ${(iFuse * 1000).toFixed(1)} mA`, iFuse > FUSE_A ? 'bad' : '');
    if (meter.mode === 'BEEP' && connected && meter.red && meter.black) note.set('Continuity needs the power off: tap "Disconnect battery".', 'note warn');
  }
  meter.onChange = solve;

  stage.onUpdate((dt) => {
    flow.update(dt);
    bflow.update(dt);
    w.flow.update(dt);
    bypassFlow.update(dt);
    w.pump.spin(dt, w.flow.speed + bypassFlow.speed);
    const hot = iFuse > FUSE_A;
    bridge.setGlow(bridged && hot ? Math.min(1, 0.4 + over * 2) : 0);
    wires.w1.setGlow(hot ? Math.min(0.8, over * 2) : 0);
    if (hot && !fuseBlown) {
      over += dt;
      if (over > 0.35) blow();
    } else over = 0;
  });

  function blow() {
    const amps = iFuse;
    fuseBlown = true;
    fu.setBlown(true);
    const p = fu.group.position.clone().add(new THREE.Vector3(0, 0.35, 0));
    fx.flash(p, '#fff0b0', 2.4);
    fx.sparks(p, 50);
    fx.smoke(p, 2, 10);
    ctx.fxWater.sparks(disc.position.clone().add(w.group.position), 30, '#9fd4ff');
    solve();
    ctx.fail({
      title: 'What happened? A short, and the fuse blew.',
      text: `The bridge wire joined + straight to −, skipping the resistor and LED. Almost nothing was left to limit the current, so about ${amps.toFixed(0)} A tried to flow. The wires started to glow, and the 500 mA fuse melted first, opening the circuit.`,
      undo: () => {
        setBridge(false);
        fuseBlown = false;
        fu.setBlown(false);
        fx.clear();
        ctx.fxWater.clear();
        solve();
      },
      undoLabel: 'Undo (remove bridge, new fuse)',
    });
  }

  solve();
  stage.focusObjects = [b.batGroup, res.group, ledObj.group, fu.group, meter.group];
  stage.enableWater(2.2);
  stage.frame({ dir: new THREE.Vector3(0.12, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'repairFault') return { ok: false };
      if (huntSolved) {
        return solvedWire && testedOpen.has(solvedWire) ? { ok: true } : { ok: false, msg: 'You fixed it, but without testing. Restart the hunt and prove the broken wire with the beeper (no beep) before replacing it.' };
      }
      if (!hidden) return { ok: false, msg: 'Tap "Start the fault hunt" first.' };
      return { ok: false, msg: 'The fault is still there: the LED is dark.' };
    },
  };
}
