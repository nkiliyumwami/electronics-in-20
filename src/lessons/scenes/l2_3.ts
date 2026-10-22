import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { dense, espBench, flowAlong, up, waterLoop, WATER_FLOW } from '../kit';
import { resistor, led, mesh, std } from '../../three/lib';
import { jumperRoute, type JumperObj } from '../../three/iot';
import { currentToSpeed } from '../../three/particles';
import { Circuit, type Elem } from '../../sim/solver';
import { pipe } from '../../three/water';
import { Multimeter } from '../../tools/multimeter';
import { h } from '../../core/dom';

// 2.3 Opens and shorts on the ESP32 bench: pull jumpers, bridge the rails, hunt a broken wire.
type WireId = 'w1' | 'w2' | 'w3';
const WIRE_NAMES: Record<WireId, string> = { w1: 'red jumper', w2: 'yellow link', w3: 'black jumper' };
const USB_LIMIT = 0.5; // A: a computer's USB port cuts out above this

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let connected = true;
  let usbOff = false;
  let bridged = false;
  const cut: Record<WireId, boolean> = { w1: false, w2: false, w3: false };
  let hidden: WireId | null = null; // secretly broken wire during the hunt
  let huntSolved = false;
  let solvedWire: WireId | null = null;
  const testedOpen = new Set<WireId>();
  let over = 0;

  // ---- real view: 3V3 rail → red jumper → 220 Ω → yellow link → LED → black jumper → GND rail
  const b = espBench(ctx);
  const H = b.H;
  const v33 = b.free('3V3'), gndPin = b.free('GND');
  b.jumper(v33, H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', 'Puts 3.3 V on the red rail.', 0.5);
  b.jumper(gndPin, H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', 'Puts GND on the blue rail.', 0.5);
  const res = resistor(220, H(17, 6).distanceTo(H(21, 6)));
  res.group.position.copy(H(17, 6).lerp(H(21, 6), 0.5));
  b.bb.group.add(res.group);
  stage.part(res.group, { name: 'Resistor, 220 Ω', job: 'Limits the current through the LED.', symbol: 'resistor' });
  const ledObj = led('red');
  ledObj.group.position.copy(H(23, 6).lerp(H(24, 6), 0.5));
  b.bb.group.add(ledObj.group);
  stage.part(ledObj.group, { name: 'LED', job: 'Lights when current flows through it.', symbol: 'led' });
  const ends: Record<WireId, [THREE.Vector3, THREE.Vector3, number]> = {
    w1: [H(17, 'bot+'), H(17, 9), 0.5],
    w2: [H(21, 8), H(23, 8), 0.45],
    w3: [H(24, 8), H(24, 'bot-'), 0.5],
  };
  const colors: Record<WireId, 'red' | 'yellow' | 'black'> = { w1: 'red', w2: 'yellow', w3: 'black' };
  const wires = {} as Record<WireId, JumperObj>;
  const cutLabels = {} as Record<WireId, ReturnType<typeof stage.label>>;
  for (const id of ['w1', 'w2', 'w3'] as WireId[]) {
    const [a, c, hh] = ends[id];
    wires[id] = b.jumper(a, c, colors[id], `The ${WIRE_NAMES[id]}`, 'A jumper wire in the LED\'s loop.', hh);
    wires[id].group.userData.part.actions = () => [{ label: cut[id] ? 'Push it back in' : 'Pull it out', run: () => setCut(id, !cut[id]) }];
    cutLabels[id] = stage.label('pulled out', b.bb.group, a.clone().lerp(c, 0.5).setY(1.0), 'bad');
    cutLabels[id].show(false);
  }
  const bridge = b.jumper(H(26, 'bot+'), H(26, 'bot-'), 'white', 'Stray wire (3V3 to GND)', 'A stray jumper joining the red and blue rails: a short circuit.', 0.35);
  bridge.group.visible = false;
  b.tag('3V3');
  b.tag('GND');

  // Particles: the LED loop and the short.
  const loopPts = dense([
    ...jumperRoute(H(17, 'bot+'), H(17, 9), 0.5),
    up(H(17, 6), 0.32),
    up(H(21, 6), 0.32),
    up(H(21, 8), 0.05),
    ...jumperRoute(H(21, 8), H(23, 8), 0.45),
    up(H(23, 6), 0.6),
    up(H(24, 6), 0.6),
    up(H(24, 8), 0.05),
    ...jumperRoute(H(24, 8), H(24, 'bot-'), 0.5),
    up(H(24, 'bot-'), 0.04),
    up(H(2, 'bot-'), 0.04),
    ...jumperRoute(H(2, 'bot-'), gndPin, 0.5),
    up(v33, 0.2),
    ...jumperRoute(v33, H(1, 'bot+'), 0.5),
    up(H(1, 'bot+'), 0.04),
  ]);
  const flow = flowAlong(stage.real, loopPts);
  const bflow = flowAlong(stage.real, dense([up(H(25, 'bot+'), 0.04), ...jumperRoute(H(26, 'bot+'), H(26, 'bot-'), 0.35), up(H(25, 'bot-'), 0.04)]), undefined, { closed: false });
  bflow.mesh.visible = false;
  const iLabel = stage.label('', b.bb.group, new THREE.Vector3(2.6, 1.6, 2.2), 'big');

  // ---- water view
  const w = waterLoop(ctx);
  w.narrowing.setNarrow(0.6);
  const bypass = pipe([new THREE.Vector3(w.x1, w.y, w.zb + 0.6), new THREE.Vector3(w.x1 - 0.8, w.y + 0.5, 0), new THREE.Vector3(w.x0 + 0.8, w.y + 0.5, 0), new THREE.Vector3(w.x0, w.y, w.zb + 0.6)], 0.13);
  bypass.mesh.visible = false;
  w.group.add(bypass.mesh);
  const bypassFlow = flowAlong(w.group, dense([new THREE.Vector3(w.x1, w.y, w.zb + 0.6), new THREE.Vector3(w.x1 - 0.8, w.y + 0.5, 0), new THREE.Vector3(w.x0 + 0.8, w.y + 0.5, 0), new THREE.Vector3(w.x0, w.y, w.zb + 0.6)]), WATER_FLOW, { closed: false, radius: 0.07 });
  bypassFlow.mesh.visible = false;
  const wcaps = mesh(new THREE.BoxGeometry(0.06, 0.36, 0.36), std('#c0281f', 0.5), [-0.9, w.y, w.zf]);
  wcaps.visible = false;
  w.group.add(wcaps);
  stage.part(bypass.mesh, { name: 'Bypass pipe (= short)', job: 'A shortcut around the narrow pipe. Almost nothing limits the flow, so it rushes through.', symbol: 'pipe' });

  // ---- meter for the hunt (points sit next to each jumper end, on the same strip)
  const points = () => [
    { id: 'w1a', label: 'Red jumper: rail end', node: 'rp', pos: H(16, 'bot+') },
    { id: 'w1b', label: 'Red jumper: column 18 end', node: 'a', pos: H(17, 8) },
    { id: 'w2a', label: 'Yellow link: column 22 end', node: 'r', pos: H(21, 7) },
    { id: 'w2b', label: 'Yellow link: column 24 end', node: 'la', pos: H(23, 7) },
    { id: 'w3a', label: 'Black jumper: column 25 end', node: 'c', pos: H(24, 7) },
    { id: 'w3b', label: 'Black jumper: rail end', node: 'gm', pos: H(25, 'bot-') },
  ];
  const meter = new Multimeter(stage, stage.real, points(), { modes: ['V', 'BEEP'], mode: 'BEEP', at: new THREE.Vector3(2.4, -0.85, 4.6), rotY: -0.25, probeY: 0 });

  // ---- controls
  const r1 = panel.row();
  const powerBtn = panel.button('Unplug USB', () => setConnected(!connected), 'btn', r1);
  const bridgeBtn = panel.button('Bridge 3V3 to GND (short)', () => setBridge(!bridged), 'btn danger', r1);
  const cutRow = h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Pull out a jumper (open)'));
  const cutBtns = h('div', { class: 'btnrow' });
  const cutButtons = {} as Record<WireId, HTMLButtonElement>;
  for (const id of ['w1', 'w2', 'w3'] as WireId[]) {
    cutButtons[id] = h('button', { class: 'btn small', type: 'button', onclick: () => setCut(id, !cut[id]) }, `Pull out the ${WIRE_NAMES[id]}`) as HTMLButtonElement;
    cutBtns.append(cutButtons[id]);
  }
  cutRow.append(cutBtns);
  panel.custom(cutRow);
  meter.controls(panel);
  const huntRow = h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Fault hunt'));
  const huntBtns = h('div', { class: 'btnrow' });
  const startBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => startHunt() }, 'Start the fault hunt');
  huntBtns.append(startBtn);
  for (const id of ['w1', 'w2', 'w3'] as WireId[]) huntBtns.append(h('button', { class: 'btn small', type: 'button', onclick: () => replace(id) }, `Replace the ${WIRE_NAMES[id]}`));
  huntRow.append(huntBtns);
  panel.custom(huntRow);
  const roI = panel.readout('Current from 3V3');
  const roL = panel.readout('LED');
  const roU = panel.readout('ESP32');
  const note = panel.note('');

  function setConnected(v: boolean) {
    connected = v;
    usbOff = false;
    powerBtn.textContent = v ? 'Unplug USB' : 'Plug USB back in';
    solve();
  }
  function setBridge(v: boolean) {
    bridged = v;
    bridge.group.visible = v;
    bridgeBtn.textContent = v ? 'Remove the stray wire' : 'Bridge 3V3 to GND (short)';
    if (!v) bridge.wire.setGlow(0);
    solve();
  }
  function setCut(id: WireId, v: boolean) {
    cut[id] = v;
    wires[id].group.visible = !v;
    cutLabels[id].show(v);
    cutButtons[id].textContent = v ? `Push the ${WIRE_NAMES[id]} back in` : `Pull out the ${WIRE_NAMES[id]}`;
    solve();
  }
  function startHunt() {
    for (const id of ['w1', 'w2', 'w3'] as WireId[]) setCut(id, false);
    setBridge(false);
    usbOff = false;
    const ids: WireId[] = ['w1', 'w2', 'w3'];
    hidden = ids[Math.floor(Math.random() * 3)];
    huntSolved = false;
    solvedWire = null;
    testedOpen.clear();
    startBtn.textContent = 'Restart the hunt';
    note.set('Fault hunt on: one jumper looks fine but is broken inside. The LED is dark. Find it with the beeper.', 'note warn');
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
    note.set(connected ? 'Fault fixed.' : 'Fault fixed. Plug the USB back in to see the LED again.', 'note');
    solve();
  }

  const wireOpen = (id: WireId) => cut[id] || hidden === id;
  let I = 0;
  let iBridge = 0;
  let iSupply = 0;
  function solve() {
    const powered = connected && !usbOff;
    const elems: Elem[] = [
      { kind: 'R', id: 'w1', a: 'rp', b: 'a', r: wireOpen('w1') ? 1e12 : 0.02 },
      { kind: 'R', id: 'R1', a: 'a', b: 'r', r: 220 },
      { kind: 'R', id: 'w2', a: 'r', b: 'la', r: wireOpen('w2') ? 1e12 : 0.02 },
      { kind: 'D', id: 'LED', a: 'la', k: 'c', vf: 2.0, rs: 2 },
      { kind: 'R', id: 'w3', a: 'c', b: 'gm', r: wireOpen('w3') ? 1e12 : 0.02 },
      ...meter.elements(),
    ];
    if (bridged) elems.push({ kind: 'R', id: 'bridge', a: 'rp', b: 'gm', r: 0.02 });
    // USB 5 V → the board's regulator → 3.3 V. The regulator and cable add a little resistance.
    if (powered) elems.push({ kind: 'V', id: 'S', p: 'rp', n: 'gm', v: 3.3, rs: 0.6 });
    const sol = new Circuit(elems).dc();
    meter.read(sol, powered);
    I = Math.max(0, sol.i('LED'));
    iBridge = bridged ? Math.abs(sol.i('bridge')) : 0;
    iSupply = powered ? I + iBridge : 0;
    b.esp.setPower(powered && iSupply < USB_LIMIT);
    if (hidden && meter.mode === 'BEEP' && meter.text === 'OL') {
      const pair = [meter.red, meter.black].sort().join('|');
      const map: Record<string, WireId> = { 'w1a|w1b': 'w1', 'w2a|w2b': 'w2', 'w3a|w3b': 'w3' };
      if (map[pair]) testedOpen.add(map[pair]);
    }
    ledObj.setLight(I / 0.01);
    flow.speed = currentToSpeed(I, 0.003, 5);
    bflow.mesh.visible = bridged && iBridge > 0.001;
    bflow.speed = currentToSpeed(iBridge, 0.003, 9);
    w.flow.speed = flow.speed;
    bypass.mesh.visible = bridged;
    bypassFlow.mesh.visible = bridged && iBridge > 0.001;
    bypassFlow.speed = bflow.speed;
    wcaps.visible = cut.w1 || cut.w2 || cut.w3 || !!hidden;
    const big = iSupply >= 1;
    roI.set(big ? `${iSupply.toFixed(1)} A` : `${(iSupply * 1000).toFixed(1)} mA`, iSupply > USB_LIMIT ? 'bad' : '');
    roL.set(I > 0.001 ? 'lit' : 'dark', I > 0.001 ? 'good' : 'warn');
    roU.set(!connected ? 'unplugged' : usbOff ? 'USB port switched off' : iSupply > USB_LIMIT ? 'browning out!' : 'running', !connected ? '' : usbOff || iSupply > USB_LIMIT ? 'bad' : 'good');
    iLabel.set(big ? `I = ${iSupply.toFixed(1)} A!` : `I = ${(iSupply * 1000).toFixed(1)} mA`, iSupply > USB_LIMIT ? 'bad' : '');
    if (meter.mode === 'BEEP' && connected && meter.red && meter.black) note.set('Continuity needs the power off: tap "Unplug USB".', 'note warn');
  }
  meter.onChange = solve;

  stage.onUpdate((dt) => {
    flow.update(dt);
    bflow.update(dt);
    w.flow.update(dt);
    bypassFlow.update(dt);
    w.pump.spin(dt, w.flow.speed + bypassFlow.speed);
    const hot = iSupply > USB_LIMIT && connected && !usbOff;
    bridge.wire.setGlow(bridged && hot ? Math.min(1, 0.4 + over * 2) : 0);
    if (hot) {
      over += dt;
      if (over > 0.35) shortOut();
    } else over = 0;
  });

  function shortOut() {
    const amps = iSupply;
    usbOff = true;
    const p = H(26, 'bot+').lerp(H(26, 'bot-'), 0.5).setY(0.8);
    fx.flash(p, '#fff0b0', 2.0);
    fx.sparks(p, 40);
    solve();
    ctx.fail({
      title: 'What happened? A short: the USB port switched off.',
      text: `The stray wire joined 3V3 straight to GND, skipping the resistor and LED. Almost nothing limited the current, so about ${amps.toFixed(0)} A tried to flow. The 3.3 V rail collapsed, the ESP32 browned out, and your computer cut the USB port off to protect itself.`,
      undo: () => {
        setBridge(false);
        usbOff = false;
        fx.clear();
        solve();
      },
      undoLabel: 'Undo (remove the stray wire)',
    });
  }

  solve();
  stage.focusObjects = [b.bb.group, meter.group];
  stage.enableWater(2.2, 'real');
  stage.frame({ dir: new THREE.Vector3(0.05, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'faultHunt') return { ok: false };
      if (huntSolved) {
        return solvedWire && testedOpen.has(solvedWire) ? { ok: true } : { ok: false, msg: 'You fixed it, but without testing. Restart the hunt and prove the broken jumper with the beeper (no beep) before replacing it.' };
      }
      if (!hidden) return { ok: false, msg: 'Tap "Start the fault hunt" first.' };
      return { ok: false, msg: 'The fault is still there: the LED is dark.' };
    },
  };
}
