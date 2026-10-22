import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { dense, espBench, flowAlong, up, waterLoop } from '../kit';
import { led, mesh, resistor } from '../../three/lib';
import { jumperRoute } from '../../three/iot';
import { checkValve } from '../../three/water';
import { currentToSpeed } from '../../three/particles';

// 1.2 Ohm's law: the resistor for Plant Buddy's status LED on GPIO 16.
export const PIN_V = 3.3;
export const LED_VF = 2.0;
export const R_VALUES = [0, 22, 47, 68, 100, 150, 220, 330, 470, 680, 1000];
export const PIN_MAX = 0.04; // A, the pin's absolute maximum
export const DESIGN_MAX = 0.02; // A, what to design for (and the LED's rating)

/** LED current with the pin HIGH. Infinity with no resistor (nothing limits it). */
export function ledCurrent(r: number): number {
  return r === 0 ? Infinity : (PIN_V - LED_VF) / r;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let R = 220;
  let high = false;
  let dead = false;

  // ---- real view: ESP32 on the breadboard, GPIO 16 → resistor → LED → GND
  const b = espBench(ctx);
  const H = b.H;
  const pinHole = b.free('D16');
  const gndHole = b.free('GND');
  const rA = H(18, 9), rB = H(22, 9); // resistor across columns 19–23 (row j)
  const ledA = H(22, 7), ledK = H(23, 7); // LED anode in column 23, cathode in 24 (row h)
  const res = resistor(R, rA.distanceTo(rB));
  res.group.position.copy(rA.clone().lerp(rB, 0.5));
  b.bb.group.add(res.group);
  stage.part(res.group, { name: 'Resistor', job: 'Takes the voltage the LED does not use (1.3 V) and, by its size, sets how much current flows.', symbol: 'resistor' });
  const light = led('red');
  light.group.position.copy(ledA.clone().lerp(ledK, 0.5));
  b.bb.group.add(light.group);
  stage.part(light.group, { name: 'Red LED (2.0 V)', job: 'Lights up when current flows from its long leg (+) to its short leg (−). It always uses about 2.0 V.', symbol: 'led' });
  // Jumpers: pin → resistor column, LED cathode column → GND rail, ESP32 GND → GND rail.
  const sigA = pinHole, sigB = H(18, 6);
  b.jumper(sigA, sigB, 'yellow', 'Signal wire from D16', 'Carries GPIO 16\'s 3.3 V to the resistor.');
  const k1 = H(23, 8), k2 = H(23, 'bot-');
  b.jumper(k1, k2, 'black', 'Wire to the GND rail', 'Brings the current back to the ESP32 through the blue (−) rail.', 0.5);
  const g1 = gndHole, g2 = H(2, 'bot-');
  b.jumper(g1, g2, 'black', 'ESP32 GND to the rail', 'Connects the ESP32\'s GND pin to the blue rail, so the loop is closed.', 0.5);
  b.esp.markPin('D16', '#efc22a');
  b.esp.markPin('GND', '#26282a');
  // A big tap target on the D16 pin.
  const tap = mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), new THREE.MeshBasicMaterial({ visible: false }), [0, 0.6, 0]);
  tap.position.copy(b.esp.pin('D16')).add(b.esp.group.position).setY(0.6);
  b.bb.group.add(tap);
  stage.onTap(tap, () => setHigh(!high));
  stage.part(tap, { name: 'Pin D16 (GPIO 16)', job: 'Set HIGH by your code, it puts out 3.3 V. Tap it to switch.', symbol: 'chip' });

  // Charges flow out of D16, through the resistor and LED, back via GND.
  const loop = dense([
    ...jumperRoute(sigA, sigB),
    up(sigB, 0.05),
    up(rA, 0.05),
    up(rA, 0.32),
    up(rB, 0.32),
    up(ledA, 0.3),
    up(ledK, 0.3),
    up(k1, 0.05),
    ...jumperRoute(k1, k2, 0.5),
    up(k2, 0.05),
    up(g2, 0.05),
    ...jumperRoute(g2, g1, 0.5),
    up(g1, 0.2),
    up(pinHole, 0.2),
  ]);
  const flow = flowAlong(stage.real, loop, '#ff9a1f', { radius: 0.045, spacing: 0.3 });
  const split = stage.label('', stage.real, new THREE.Vector3(H(20, 5).x, 2.4, 0.9), 'big');
  const iLabel = stage.label('', light.group, new THREE.Vector3(0, 1.5, 0));
  const pinLabel = b.tag('D16');
  b.tag('GND');

  // ---- water view: pump (the pin) → narrow pipe (resistor) → one-way valve (LED)
  const w = waterLoop(ctx);
  const valve = checkValve();
  valve.group.position.set(w.x1 - 0.7, w.y, w.zf);
  valve.group.rotation.y = Math.PI;
  w.group.add(valve.group);
  stage.part(valve.group, { name: 'One-way valve (= LED)', job: 'Needs about 2.0 of the pump\'s 3.3 pressure before anything gets through, then lets water flow one way only.', symbol: 'diode' });
  const wLabel = stage.label('', w.pump.group, new THREE.Vector3(0, 1.4, 0), 'big water');
  stage.enableWater(1.5, 'real');

  // ---- controls
  const pinBtn = panel.toggle('D16 (GPIO 16) is LOW', false, (v) => setHigh(v));
  const rS = panel.slider({
    label: 'Resistor',
    min: 0,
    max: R_VALUES.length - 1,
    step: 1,
    value: R_VALUES.indexOf(R),
    nudge: true,
    format: (i) => (R_VALUES[i] === 0 ? 'none (0 Ω)' : R_VALUES[i] >= 1000 ? `${R_VALUES[i] / 1000} kΩ` : `${R_VALUES[i]} Ω`),
    onInput: (i) => {
      R = R_VALUES[Math.round(i)];
      if (R > 0) res.setValue(R);
      res.group.visible = R > 0;
      update();
    },
  });
  const formula = panel.formula();
  const load = panel.bar('Pin load (design for 20 mA, absolute max 40 mA)');
  const roI = panel.readout('LED current');
  const roP = panel.readout('Resistor heat');
  const note = panel.note('');

  function setHigh(v: boolean) {
    high = v;
    pinBtn.set(v);
    pinBtn.el.textContent = v ? 'D16 (GPIO 16) is HIGH' : 'D16 (GPIO 16) is LOW';
    update();
  }

  function update() {
    const I = high && !dead ? ledCurrent(R) : 0;
    const shown = Number.isFinite(I) ? I : 0;
    const mA = (shown * 1000).toFixed(1);
    if (high && !dead && I > PIN_MAX) return burn(I);
    light.setLight(dead ? 0 : Math.min(1.4, shown / 0.012));
    flow.speed = currentToSpeed(shown, 0.006, 5);
    w.flow.speed = flow.speed;
    w.pump.setPressure(high ? PIN_V / 5 : 0);
    w.narrowing.setNarrow(R === 0 ? 0 : Math.min(0.95, 0.35 + Math.log10(R / 22) * 0.3));
    valve.setOpen(shown > 0 ? 0.4 + Math.min(0.6, shown / 0.02) : 0);
    split.set(high ? '3.3 V = 2.0 V (LED) + 1.3 V (resistor)' : 'Pin LOW: 0 V, nothing flows', high ? '' : '');
    iLabel.set(high ? `${mA} mA` : '0 mA', shown > DESIGN_MAX ? 'warn' : shown > 0 ? 'good' : '');
    pinLabel.set(high ? 'D16 HIGH 3.3 V' : 'D16 LOW 0 V', high ? 'pin good' : 'pin');
    wLabel.set(high ? 'Pressure 3.3' : 'Pump off', 'big water');
    roI.set(high ? `${mA} mA` : '0 mA', shown > DESIGN_MAX ? 'warn' : shown > 0 ? 'good' : '');
    roP.set(high && R > 0 ? `${((PIN_V - LED_VF) * shown * 1000).toFixed(1)} mW` : '0 mW');
    load.set(shown / PIN_MAX, shown > DESIGN_MAX ? 'var(--warn)' : 'var(--good)', `${mA} mA`);
    formula.set(
      R === 0
        ? 'V = I × R → with R = 0 Ω, nothing limits I'
        : `V = I × R → <b>1.3 V</b> = <b>${high ? mA : (1.3 / R * 1000).toFixed(1)} mA</b> × <b>${R} Ω</b>${high ? '' : ' (when HIGH)'}`,
    );
    note.set(
      dead ? 'The LED is burned out. Use Undo, or pick a bigger resistor.' : shown > DESIGN_MAX ? 'Over 20 mA: it works, but the LED and the pin are overworked and wear out early.' : !high ? 'Switch D16 HIGH to light the LED.' : '',
      shown > DESIGN_MAX ? 'note warn' : 'note',
    );
  }

  function burn(I: number) {
    dead = true;
    light.setDead(true);
    light.setLight(0);
    flow.speed = 0;
    w.flow.speed = 0;
    const p = light.group.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    fx.flash(p, '#ffe0a0', 2.2);
    fx.sparks(p, 30);
    fx.smoke(p, 3, 14, true);
    const what = R === 0 ? 'With no resistor, nothing limits the current' : `${(I * 1000).toFixed(0)} mA would flow`;
    ctx.fail({
      title: 'Pop! The LED burned out',
      text: `${what}. That is over the pin's 40 mA maximum and the LED's 20 mA rating. The LED died, and on a real board the ESP32 pin can be damaged too. **Always fit a resistor.**`,
      undo: () => {
        dead = false;
        light.setDead(false);
        R = 220;
        rS.set(R_VALUES.indexOf(R));
        res.setValue(R);
        res.group.visible = true;
        update();
      },
      undoLabel: 'Undo (new LED, 220 Ω)',
    });
    update();
  }

  stage.onUpdate((dt) => {
    flow.update(dt);
    w.flow.update(dt);
    w.pump.spin(dt, w.flow.speed);
  });

  update();
  stage.hint(tap, 'Tap D16 to switch it HIGH');
  stage.focusObjects = [b.bb.group];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.25, 1), animate: false });

  return {
    check(task) {
      if (task !== 'led5to15') return { ok: false };
      const I = ledCurrent(R);
      if (!high) return { ok: false, msg: 'D16 is LOW. Switch it HIGH first.' };
      if (dead) return { ok: false, msg: 'The LED is burned out. Undo first.' };
      if (I < 0.005) return { ok: false, msg: `${(I * 1000).toFixed(1)} mA is too dim. Pick a smaller resistor.` };
      if (I > 0.015) return { ok: false, msg: `${(I * 1000).toFixed(1)} mA is more than 15 mA. Pick a bigger resistor.` };
      return { ok: true };
    },
  };
}
