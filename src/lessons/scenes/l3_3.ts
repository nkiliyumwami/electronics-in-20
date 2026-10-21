import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, dense, flowAlong, up, waterLoop } from '../kit';
import { resistor, led, LED_COLORS, wire } from '../../three/lib';
import { currentToSpeed } from '../../three/particles';
import { Circuit } from '../../sim/solver';
import { fmt, nearestE12, roundSig } from '../../sim/physics';
import { checkValve } from '../../three/water';

type Color = 'red' | 'green' | 'blue';
const RS = 8; // LED internal resistance, Ω

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let Vs = 5;
  let R = 1000;
  let hasR = true;
  let flipped = false;
  let dead = false;
  let color: Color = 'red';
  let over = 0;
  let target = 0.015;

  // ---- real view
  const b = bench(ctx);
  const H = b.bb.hole;
  const res = resistor(R, H(13, 1).distanceTo(H(9, 1)));
  res.group.position.copy(H(13, 1).lerp(H(9, 1), 0.5));
  stage.real.add(res.group);
  stage.part(res.group, {
    name: 'Series resistor',
    job: 'Takes the leftover voltage and so sets the LED current.',
    symbol: 'resistor',
    actions: () => [{ label: 'Take it out', run: () => setHasR(false) }],
  });
  const plain = wire([H(13, 1), up(H(13, 1), 0.3), up(H(9, 1), 0.3), H(9, 1)], 'green');
  plain.mesh.visible = false;
  stage.real.add(plain.mesh);
  stage.part(plain.mesh, { name: 'Plain wire (no resistor!)', job: 'Nothing is limiting the LED current now.', symbol: 'wire', actions: () => [{ label: 'Put the resistor back', run: () => setHasR(true) }] });
  let ledObj = led(color, 0.254);
  const ledHolder = new THREE.Group();
  ledHolder.position.copy(H(9, 3).lerp(H(8, 3), 0.5));
  ledHolder.rotation.y = Math.PI; // anode on column 9
  stage.real.add(ledHolder);
  ledHolder.add(ledObj.group);
  stage.part(ledHolder, {
    name: 'LED',
    job: 'A diode that glows. Current flows from the long leg (+) to the short leg by the flat edge (−), never backwards.',
    symbol: 'led',
    actions: () => [{ label: 'Flip it around', run: () => setFlipped(!flipped) }],
  });
  const redPts = batteryPts(b.plus, 1, H(13, 0), 0.9);
  const blackPts = batteryPts(b.minus, -1, H(8, 0), 0.9);
  addWire(ctx, redPts, 'red', 'Red wire (+)');
  addWire(ctx, blackPts, 'black', 'Black wire (−)');
  const s = (p: THREE.Vector3) => up(p, 0.02);
  const flow = flowAlong(stage.real, dense([...redPts, s(H(13, 1)), up(H(13, 1), 0.32), up(H(9, 1), 0.32), s(H(9, 1)), s(H(9, 3)), up(H(9, 3), 0.6), up(H(8, 3), 0.6), s(H(8, 3)), s(H(8, 0)), ...[...blackPts].reverse(), b.minus.clone(), b.plus.clone()]));
  const iLabel = stage.label('', ledHolder, new THREE.Vector3(0, 1.45, 0), 'big');
  const vLabel = stage.label('', b.batGroup, new THREE.Vector3(0.1, 2.15, 0), 'big');

  // ---- water view
  const w = waterLoop(ctx);
  w.narrowing.group.position.x = 0.8;
  const valve = checkValve(0.13);
  valve.group.position.set(-0.8, w.y, w.zf);
  valve.group.rotation.y = Math.PI;
  w.group.add(valve.group);
  stage.part(valve.group, { name: 'One-way valve (= LED)', job: 'Opens for flow in one direction only. Turn it around and nothing gets through.', symbol: 'valve' });
  const wl = stage.label('', valve.group, new THREE.Vector3(0, 0.75, 0), 'water');

  // ---- controls
  panel.slider({ label: 'Supply voltage', min: 3, max: 12, step: 0.1, value: Vs, nudge: true, format: (v) => `${v.toFixed(1)} V`, onInput: (v) => { Vs = v; solve(); } });
  const rS = panel.slider({ label: 'Series resistor', min: 47, max: 2200, log: true, value: R, nudge: true, snap: (v) => roundSig(v, 2), format: (v) => fmt(v, 'Ω'), onInput: (v) => { R = v; res.setValue(v); solve(); } });
  panel.segmented('LED colour', [{ value: 'red', label: 'Red (2.0 V)' }, { value: 'green', label: 'Green (2.2 V)' }, { value: 'blue', label: 'Blue (3.0 V)' }], color, (c) => setColor(c as Color));
  const row = panel.row();
  const flipBtn = panel.button('Flip the LED', () => setFlipped(!flipped), 'btn', row);
  const rBtn = panel.button('Take out the resistor', () => setHasR(!hasR), 'btn danger', row);
  panel.slider({ label: 'Calculator: target current', min: 0.005, max: 0.02, step: 0.001, value: target, format: (v) => `${(v * 1000).toFixed(0)} mA`, onInput: (v) => { target = v; solve(); } });
  const formula = panel.formula('Resistor calculator');
  const useRow = panel.row();
  const useBtn = panel.button('Use the nearest standard value', () => {
    const need = (Vs - LED_COLORS[color].vf) / target;
    if (need > 0) {
      R = Math.min(2200, Math.max(47, nearestE12(need)));
      rS.set(R);
      res.setValue(R);
      if (!hasR) setHasR(true);
      solve();
    }
  }, 'btn primary', useRow);
  void useBtn;
  const roI = panel.readout('LED current');
  const roV = panel.readout('Voltage across LED');
  const roR = panel.readout('Across resistor');

  function setFlipped(v: boolean) {
    flipped = v;
    ledObj.flip(v);
    flipBtn.textContent = v ? 'Flip the LED back' : 'Flip the LED';
    valve.group.rotation.y = v ? 0 : Math.PI;
    solve();
  }
  function setHasR(v: boolean) {
    hasR = v;
    res.group.visible = v;
    plain.mesh.visible = !v;
    rBtn.textContent = v ? 'Take out the resistor' : 'Put the resistor back';
    solve();
  }
  function setColor(c: Color) {
    color = c;
    ledHolder.remove(ledObj.group);
    ledObj = led(c, 0.254);
    ledObj.flip(flipped);
    ledObj.setDead(dead);
    ledHolder.add(ledObj.group);
    solve();
  }

  let I = 0;
  let Vled = 0;
  function solve() {
    const vf = LED_COLORS[color].vf;
    const sol = new Circuit([
      { kind: 'V', id: 'B', p: 'top', n: 'gnd', v: Vs, rs: 0.2 },
      { kind: 'R', id: 'R', a: 'top', b: 'a', r: hasR ? R : 0.02 },
      flipped || dead ? { kind: 'R', id: 'LED', a: 'a', b: 'gnd', r: 1e12 } : { kind: 'D', id: 'LED', a: 'a', k: 'gnd', vf, rs: RS },
    ]).dc();
    I = Math.max(0, sol.i('LED'));
    Vled = sol.v('a');
    ledObj.setLight(dead ? 0 : I / 0.015);
    flow.speed = currentToSpeed(I, 0.004, 7);
    w.flow.speed = flow.speed;
    valve.setOpen(I > 1e-5 ? 1 : 0);
    w.narrowing.setNarrow(hasR ? 0.2 + (Math.log(R / 47) / Math.log(2200 / 47)) * 0.7 : 0);
    w.pump.setPressure(Vs / 12);
    b.bat.setVoltage(Vs, 12);
    const need = (Vs - vf) / target;
    formula.set(need > 0
      ? `R = (V<sub>supply</sub> − V<sub>LED</sub>) ÷ I = (${Vs.toFixed(1)} − ${vf.toFixed(1)}) V ÷ ${(target * 1000).toFixed(0)} mA = <b>${fmt(need, 'Ω')}</b> → buy ${fmt(nearestE12(need), 'Ω')}`
      : `The supply (${Vs.toFixed(1)} V) is below the LED's ${vf.toFixed(1)} V: it cannot light.`);
    const state = dead ? 'bad' : I > 0.03 ? 'bad' : I >= 0.01 && I <= 0.02 ? 'good' : I > 0.02 ? 'warn' : '';
    roI.set(dead ? 'dead' : `${(I * 1000).toFixed(1)} mA`, state);
    roV.set(`${Vled.toFixed(2)} V`);
    roR.set(`${(Vs - Vled).toFixed(2)} V`);
    iLabel.set(dead ? 'burnt out' : flipped ? 'backwards: blocked' : `${(I * 1000).toFixed(1)} mA`, state || (flipped ? 'warn' : ''));
    vLabel.set(`${Vs.toFixed(1)} V`);
    wl.set(flipped ? 'valve shut' : dead ? 'broken' : 'valve open');
  }

  stage.onUpdate((dt) => {
    flow.update(dt);
    w.flow.update(dt);
    w.pump.spin(dt, flow.speed);
    if (dead) return;
    if (I > 0.1) over += dt * 4;
    else if (I > 0.05) over += dt;
    else over = Math.max(0, over - dt);
    if (over > 0.3) burn();
  });

  function burn() {
    const amps = I;
    dead = true;
    ledObj.setDead(true);
    const p = ledHolder.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    fx.flash(p, LED_COLORS[color].hex, 3);
    fx.smoke(p, 2, 10);
    solve();
    ctx.fail({
      title: 'What happened? The LED burned out.',
      text: `About ${(amps * 1000).toFixed(0)} mA rushed through it. Once an LED reaches its threshold voltage, a little more voltage makes the current shoot up, and ${hasR ? 'this resistor was too small to hold it back' : 'with no resistor, nothing held it back'}. It flashed bright and the tiny chip inside overheated. Most small LEDs want 20 mA or less.`,
      undo: () => {
        dead = false;
        over = 0;
        ledObj.setDead(false);
        fx.clear();
        if (!hasR) setHasR(true);
        if (I > 0.02 || !hasR) {
          R = Math.max(R, nearestE12((Vs - LED_COLORS[color].vf) / 0.015));
          rS.set(R);
          res.setValue(R);
        }
        solve();
      },
      undoLabel: 'Undo (new LED)',
    });
  }

  solve();
  stage.focusObjects = [b.batGroup, res.group, ledHolder];
  stage.enableWater(2.2);
  stage.frame({ dir: new THREE.Vector3(0.12, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'ledSafe') return { ok: false };
      if (dead) return { ok: false, msg: 'The LED is burnt out. Tap Undo first.' };
      if (flipped) return { ok: false, msg: 'The LED is in backwards, so no current flows.' };
      if (!hasR) return { ok: false, msg: 'There is no resistor, so nothing limits the current.' };
      const mA = I * 1000;
      if (mA >= 10 && mA <= 20) return { ok: true };
      return { ok: false, msg: `The LED gets ${mA.toFixed(1)} mA. ${mA < 10 ? 'Make the resistor smaller.' : 'Make the resistor bigger.'}` };
    },
  };
}
