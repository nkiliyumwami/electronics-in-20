import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { mesh, wire, M } from '../../three/lib';
import { benchSupply } from '../../three/benchSupply';
import { Circuit, type Elem } from '../../sim/solver';
import { Multimeter } from '../../tools/multimeter';
import { h } from '../../core/dom';

// 7.1 Bringing up a rewired Plant Buddy: a hidden short, a current-limited supply, the meter.
const R_BOARD = 66; // Ω: the ESP32 at 3.3 V draws about 50 mA
const BURN_A = 0.5;
const ABS_MAX = 3.6;

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let vset = 3.3;
  let ilim = 3;
  let on = false;
  let short = true;
  let burnt = false;
  let over = 0;
  let blinkT = -1;
  const done = { inspect: false, shorts: false, limited: false, rails: false, signals: false };
  let warnedCC = false;
  let warnedOV = false;

  const b = espBench(ctx, { usb: false });
  const H = b.H;
  b.esp.setPower(false);
  b.jumper(b.free('3V3'), H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', '', 0.5);
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', '', 0.5);
  stage.part(b.bb.group, { name: 'Rewired Plant Buddy', job: 'Just rebuilt on a fresh breadboard. Guilty until proven innocent.', symbol: 'breadboard' });
  // The hidden short: a snipped-off resistor leg lying across the two front rails.
  const stray = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), M.lead(), [0, 0, 0], [Math.PI / 2 - 0.25, 0.4, 0]);
  stray.position.copy(H(19, 'bot+').lerp(H(19, 'bot-'), 0.5)).setY(0.04);
  b.bb.group.add(stray);
  stage.part(stray, {
    name: 'Snipped resistor leg',
    job: 'A cut-off leg that fell across the red and blue rails: 3.3 V straight to GND. A short circuit.',
    symbol: 'wire',
    actions: () => [{ label: 'Pick it out (tweezers)', run: () => removeShort() }],
  });
  const ring = mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color: '#ffb000', transparent: true, opacity: 0 }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
  ring.position.copy(stray.position).setY(0.06);
  b.bb.group.add(ring);

  // ---- bench supply, wired to the rails at the right-hand end
  const ps = benchSupply();
  ps.group.position.set(7.4, -0.85, 1.6);
  ps.group.rotation.y = -0.6;
  b.bb.group.add(ps.group);
  stage.part(ps.group, { name: 'Bench power supply', job: 'Sets a voltage AND a current limit. If the board tries to draw more than the limit, the supply holds the current there (CC mode) and lets the voltage drop.', symbol: 'supply', actions: () => [{ label: on ? 'Output OFF' : 'Output ON', run: () => setOn(!on) }] });
  b.bb.group.updateMatrixWorld(true);
  const tR = ps.plus.clone().applyMatrix4(ps.group.matrix);
  const tB = ps.minus.clone().applyMatrix4(ps.group.matrix);
  const rp = H(28, 'bot+'), rn = H(28, 'bot-');
  b.bb.group.add(wire([tR, tR.clone().add(new THREE.Vector3(-0.4, 0.4, 0.2)), rp.clone().setY(0.8), rp.clone().setY(0.5), rp], 'red', 0.04).mesh);
  b.bb.group.add(wire([tB, tB.clone().add(new THREE.Vector3(-0.4, 0.2, 0.4)), rn.clone().setY(0.6), rn.clone().setY(0.4), rn], 'black', 0.04).mesh);
  b.tag('3V3');
  const espLabel = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.2, -0.6), 'big');

  // ---- meter
  const meter = new Multimeter(
    stage,
    stage.real,
    [
      { id: 'tp33', label: '3.3 V rail (red, column 10)', node: 'rail', pos: H(9, 'bot+') },
      { id: 'tpg', label: 'GND rail (blue, column 10)', node: 'gnd', pos: H(9, 'bot-') },
      { id: 'tp33b', label: '3.3 V rail (red, column 25)', node: 'rail', pos: H(24, 'bot+') },
      { id: 'tpgb', label: 'GND rail (blue, column 25)', node: 'gnd', pos: H(24, 'bot-') },
    ],
    { modes: ['V', 'OHM', 'BEEP'], mode: 'BEEP', at: new THREE.Vector3(1.4, -0.85, 4.8), rotY: -0.2, probeY: 0 },
  );

  // ---- controls
  const checklist = h('ol', { class: 'note', style: { margin: 0, paddingLeft: '1.3em' } });
  panel.custom(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Bring-up checklist'), checklist));
  const row0 = panel.row();
  panel.button('1. Look closely (magnifier)', () => inspect(), 'btn', row0);
  const rmBtn = panel.button('Pick out the stray leg', () => removeShort(), 'btn', row0);
  panel.slider({ label: 'Supply voltage', min: 0, max: 5, step: 0.1, value: vset, nudge: true, format: (v) => `${v.toFixed(1)} V`, onInput: (v) => { vset = v; } });
  panel.slider({ label: 'Current limit', min: 0.01, max: 3, log: true, value: ilim, nudge: true, snap: (v) => (v < 0.1 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100), format: (v) => (v < 1 ? `${(v * 1000).toFixed(0)} mA` : `${v.toFixed(2)} A`), onInput: (v) => { ilim = v; } });
  const row = panel.row();
  const outBtn = panel.button('Output ON', () => setOn(!on), 'btn primary', row);
  panel.button('Run the blink test (GPIO 2)', () => (blinkT = 0), 'btn', row);
  meter.controls(panel);
  const roV = panel.readout('Supply shows V');
  const roI = panel.readout('Supply shows A');
  const roM = panel.readout('Mode');

  function renderChecklist() {
    checklist.innerHTML = '';
    const items: [keyof typeof done, string][] = [
      ['inspect', 'Look for stray wire ends, bent legs and solder blobs'],
      ['shorts', 'Power off: measure 3.3 V rail to GND (should not be near 0 Ω)'],
      ['limited', 'Power on with a current limit (100 mA or less)'],
      ['rails', 'Measure the rail: about 3.3 V'],
      ['signals', 'Run a test: the blink sketch flashes the blue LED'],
    ];
    for (const [k, t] of items) checklist.append(h('li', { style: { color: done[k] ? 'var(--good)' : '' } }, `${done[k] ? '✓ ' : ''}${t}`));
  }
  function inspect() {
    done.inspect = true;
    stage.focus(stray, 3.0);
    renderChecklist();
  }
  function removeShort() {
    if (on) {
      ctx.fail({ title: 'Switch off first', text: 'Never rework a board while it is powered.' });
      return;
    }
    short = false;
    stray.visible = false;
    rmBtn.setAttribute('disabled', '');
    rmBtn.textContent = 'Stray leg removed ✓';
  }
  function setOn(v: boolean) {
    on = v;
    outBtn.textContent = v ? 'Output OFF' : 'Output ON';
    warnedCC = false;
    warnedOV = false;
  }

  let sol: ReturnType<Circuit['dc']> | null = null;
  function solve() {
    const elems: Elem[] = [
      { kind: 'R', id: 'lead', a: 'sp', b: 'rail', r: 0.05 },
      { kind: 'R', id: 'load', a: 'rail', b: 'gnd', r: burnt ? 1e9 : R_BOARD },
      ...meter.elements(),
    ];
    if (short && !burnt) elems.push({ kind: 'R', id: 'short', a: 'rail', b: 'gnd', r: 0.02 });
    if (on) elems.push({ kind: 'SUPPLY', id: 'PS', p: 'sp', n: 'gnd', v: vset, ilim });
    sol = new Circuit(elems).dc();
    meter.read(sol, on);
  }

  let lastList = '';
  stage.onUpdate((dt, t) => {
    solve();
    const I = on && sol ? sol.i('PS') : 0;
    const V = on && sol ? sol.v('sp') : 0;
    const cc = on && sol ? sol.on('PS') : false;
    ps.show({ v: V, i: I, cc, vset, vmax: 5, ilim, on });
    roV.set(`${V.toFixed(2)} V`);
    roI.set(I < 1 ? `${(I * 1000).toFixed(0)} mA` : `${I.toFixed(2)} A`, cc ? 'warn' : '');
    roM.set(!on ? 'output off' : cc ? 'CC: current limit!' : 'CV: normal', cc ? 'bad' : on ? 'good' : '');
    (ring.material as THREE.MeshBasicMaterial).opacity = done.inspect && short ? 0.6 + 0.4 * Math.sin(t * 6) : 0;
    const rail = (meter.nodeOf('red') === 'rail' && meter.nodeOf('black') === 'gnd') || (meter.nodeOf('red') === 'gnd' && meter.nodeOf('black') === 'rail');
    if (!on && rail && (meter.mode === 'OHM' || meter.mode === 'BEEP') && isFinite(meter.value)) done.shorts = true;
    if (on && ilim <= 0.1 + 1e-9) done.limited = true;
    if (on && rail && meter.mode === 'V' && Math.abs(meter.value) > 3.2) done.rails = true;
    const working = on && !cc && V > 3.0 && V <= ABS_MAX && !short && !burnt;
    b.esp.setPower(on && V > 2.5 && !burnt);
    if (blinkT >= 0) {
      blinkT += dt;
      if (working) done.signals = true;
      if (blinkT > 6) blinkT = -1;
    }
    b.esp.setBlueLed(working && blinkT >= 0 && Math.floor(blinkT * 2) % 2 === 0);
    espLabel.set(!on ? 'no power' : burnt ? 'damaged' : cc ? 'no power (supply in CC)' : working ? (blinkT >= 0 ? 'blink sketch running' : 'booted: 3.3 V OK') : 'no power', working ? 'good' : on ? 'warn' : '');
    const key = JSON.stringify(done);
    if (key !== lastList) {
      lastList = key;
      renderChecklist();
    }
    // Danger: big current through the short.
    if (on && short && !burnt && I > BURN_A) {
      over += dt;
      if (over > 0.6) burn(I);
    } else over = 0;
    if (on && short && cc && I <= BURN_A && !warnedCC) {
      warnedCC = true;
      ctx.fail({
        title: 'The current limit saved the board',
        text: `The supply hit its ${(ilim * 1000).toFixed(0)} mA limit and the voltage collapsed to ${V.toFixed(2)} V: the signature of a short. Nothing got hot. Switch off and find the short with the meter.`,
        good: true,
      });
    }
    if (on && !short && V > ABS_MAX && !warnedOV) {
      warnedOV = true;
      ctx.fail({ title: 'Too much voltage for the 3.3 V rail', text: `${V.toFixed(1)} V on the ESP32's 3V3 pin is over its 3.6 V maximum. Set the supply to 3.3 V.`, undo: () => setOn(false), undoLabel: 'Switch off' });
    }
  });

  function burn(I: number) {
    burnt = true;
    const p = stray.position.clone().setY(0.4);
    fx.flash(p, '#fff0b0', 2);
    fx.sparks(p, 40);
    fx.smoke(p, 3, 16, true);
    setOn(false);
    ctx.fail({
      title: 'What happened? The short burned the board.',
      text: `With a ${ilim.toFixed(2)} A limit, the supply happily pushed ${I.toFixed(2)} A through the stray leg. It glowed, melted the breadboard plastic under it and cooked the rails. A 100 mA limit would have turned this into a harmless "CC" warning.`,
      undo: () => {
        burnt = false;
        over = 0;
        fx.clear();
      },
      undoLabel: 'Undo (fresh breadboard, output off)',
    });
  }

  renderChecklist();
  stage.focusObjects = [b.bb.group, ps.group, meter.group];
  stage.frame({ dir: new THREE.Vector3(0.1, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'bringUp') return { ok: false };
      if (burnt) return { ok: false, msg: 'The board burned. Tap Undo first.' };
      if (short) return { ok: false, msg: 'The short is still there.' };
      if (!on) return { ok: false, msg: 'Switch the output on.' };
      if (ilim > 0.1 + 1e-9) return { ok: false, msg: `The current limit is ${ilim < 1 ? (ilim * 1000).toFixed(0) + ' mA' : ilim.toFixed(2) + ' A'}. Set it to 100 mA or less for a first power-up.` };
      const V = sol ? sol.v('sp') : 0;
      if (V < 3.2 || V > ABS_MAX) return { ok: false, msg: `The rail is at ${V.toFixed(2)} V. It should be 3.3 V.` };
      return { ok: true };
    },
  };
}
