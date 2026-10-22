import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { dense, espBench, flowAlong, WATER_FLOW } from '../kit';
import { contactShadow, resistor, wire } from '../../three/lib';
import { cell18650 } from '../../three/iot';
import { gauge, narrowing, pipe, tank } from '../../three/water';
import { fmt } from '../../sim/physics';

// 3.2 Reading the battery on GPIO 34 (ADC1) through a voltage divider.
export const R_OPTIONS = [10e3, 22e3, 47e3, 100e3, 220e3];
export const ABS_MAX = 3.6;
export const adcRaw = (v: number) => Math.max(0, Math.min(4095, Math.round((v / 3.3) * 4095)));
export const divOut = (vin: number, r1: number, r2: number) => (vin * r2) / (r1 + r2);

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let vBat = 4.2;
  let R1 = 100e3;
  let R2 = 100e3;
  let divider = true;
  let damaged = false;

  // ---- real view
  const b = espBench(ctx);
  const H = b.H;
  b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', 'Puts GND on the front blue rail.', 0.5);
  b.jumper(H(28, 'top-'), H(28, 'bot-'), 'black', 'Back GND rail to front GND rail', 'Joins the two blue rails, so the battery shares GND with the ESP32.', 1.0);
  const cell = cell18650();
  cell.group.scale.setScalar(0.55);
  cell.group.position.set(1.8, -0.85, -4.6);
  b.bb.group.add(cell.group);
  stage.part(cell.group, { name: '18650 Li-ion cell', job: '4.2 V when full, about 3.0 V when empty. Too much for an ESP32 pin, so it is read through the divider.', symbol: 'battery' });
  const cellPlus = cell.plus.clone().multiplyScalar(0.55).add(cell.group.position);
  const cellMinus = cell.minus.clone().multiplyScalar(0.55).add(cell.group.position);
  const route = (from: THREE.Vector3, to: THREE.Vector3) => [from, from.clone().setY(0.6), to.clone().setY(0.6).setZ(to.z - 0.6), to.clone().setY(0.6), to.clone()];
  const plusLead = wire(route(cellPlus, H(18, 0)), 'red', 0.04, 0.2);
  const minusLead = wire(route(cellMinus, H(10, 'top-')), 'black', 0.04, 0.2);
  b.bb.group.add(plusLead.mesh, minusLead.mesh);
  stage.part(plusLead.mesh, { name: 'Battery + lead', job: 'Brings the battery voltage to the top of the divider.', symbol: 'wire' });
  stage.part(minusLead.mesh, { name: 'Battery − lead', job: 'Joins the battery\'s − to GND.', symbol: 'wire' });
  // R1 across columns 19–23 (row c), R2 across columns 23–27 (row d), then GND.
  const r1 = resistor(R1, H(18, 2).distanceTo(H(22, 2)));
  r1.group.position.copy(H(18, 2).lerp(H(22, 2), 0.5));
  const r2 = resistor(R2, H(22, 3).distanceTo(H(26, 3)));
  r2.group.position.copy(H(22, 3).lerp(H(26, 3), 0.5));
  b.bb.group.add(r1.group, r2.group);
  stage.part(r1.group, { name: 'R1 (top resistor)', job: 'Takes the part of the battery voltage the pin must not see.', symbol: 'resistor' });
  stage.part(r2.group, { name: 'R2 (bottom resistor)', job: 'The pin reads the voltage across this one.', symbol: 'resistor' });
  const gndJ = b.jumper(H(26, 0), H(26, 'top-'), 'black', 'R2 to GND', 'The bottom of the divider goes to GND.', 0.5);
  const sig = b.jumper(H(22, 0), b.free('D34'), 'yellow', 'Divider middle to D34', 'Carries the divided voltage to GPIO 34, an ADC1 pin.', 0.6);
  // "No divider": a straight wire from the battery's column to D34.
  const direct = b.jumper(H(18, 1), b.free('D34').clone().add(new THREE.Vector3(0.254, 0, 0)), 'red', 'Battery straight to D34 (no divider!)', 'Puts the full battery voltage on the pin.', 0.9);
  direct.group.visible = false;
  const pinTag = b.tag('D34');
  const bubble = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.2, -0.6), 'big');
  const vLabel = stage.label('', cell.group, new THREE.Vector3(0, 3.4, 0), 'big');
  const midLabel = stage.label('', b.bb.group, H(22, 2).setY(1.5));

  // ---- water view: a tall tank (battery) → two narrowings in series → a gauge between them
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(7, 5));
  const tk = tank(2.4, 0.5);
  tk.group.position.set(-2.4, -0.4, 0);
  wg.add(tk.group);
  const y = 0.3;
  const p1 = pipe([new THREE.Vector3(-1.9, y, 0), new THREE.Vector3(2.6, y, 0), new THREE.Vector3(2.6, -0.2, 0)], 0.12);
  wg.add(p1.mesh);
  const n1 = narrowing(1.1, 0.12);
  n1.group.position.set(-0.8, y, 0);
  const n2 = narrowing(1.1, 0.12);
  n2.group.position.set(1.5, y, 0);
  wg.add(n1.group, n2.group);
  const gg = gauge(0.34);
  gg.group.position.set(0.35, y + 0.75, 0);
  wg.add(gg.group);
  wg.add(pipe([new THREE.Vector3(0.35, y, 0), new THREE.Vector3(0.35, y + 0.42, 0)], 0.05).mesh);
  const wflow = flowAlong(wg, dense([new THREE.Vector3(-1.9, y, 0), new THREE.Vector3(2.6, y, 0), new THREE.Vector3(2.6, -0.2, 0)]), WATER_FLOW, { closed: false, radius: 0.05, spacing: 0.3 });
  stage.part(tk.group, { name: 'Tall tank (= battery)', job: 'Its pressure is the battery voltage: higher than the gauge can take.', symbol: 'tank' });
  stage.part(n1.group, { name: 'First narrowing (= R1)', job: 'Drops part of the pressure.', symbol: 'pipe' });
  stage.part(n2.group, { name: 'Second narrowing (= R2)', job: 'Drops the rest. The pressure between the two is what the gauge reads.', symbol: 'pipe' });
  stage.part(gg.group, { name: 'Gauge (= the ADC pin)', job: 'Reads the pressure between the two narrowings: a share of the tank\'s pressure.', symbol: 'meter' });
  const wLabel = stage.label('', wg, new THREE.Vector3(0.35, 1.8, 0), 'big water');

  // ---- controls
  panel.slider({ label: 'Battery voltage', min: 3.0, max: 4.2, step: 0.05, value: vBat, nudge: true, format: (v) => `${v.toFixed(2)} V`, onInput: (v) => { vBat = v; update(); } });
  const opts = R_OPTIONS.map((r) => ({ value: String(r), label: fmt(r, 'Ω') }));
  panel.select('R1 (top)', opts, String(R1), (v) => { R1 = Number(v); r1.setValue(R1); update(); });
  panel.select('R2 (bottom)', opts, String(R2), (v) => { R2 = Number(v); r2.setValue(R2); update(); });
  const divBtn = panel.button('Remove the divider (wire the battery straight in)', () => setDivider(!divider), 'btn danger');
  const formula = panel.formula();
  const roV = panel.readout('Voltage at D34');
  const roA = panel.readout('analogRead(34)');
  const roB = panel.readout('Battery, as the code works it out');
  const roI = panel.readout('Divider drain');
  const note = panel.note('');

  function setDivider(v: boolean) {
    divider = v;
    r1.group.visible = r2.group.visible = gndJ.group.visible = sig.group.visible = v;
    direct.group.visible = !v;
    divBtn.textContent = v ? 'Remove the divider (wire the battery straight in)' : 'Put the divider back';
    update();
  }

  function update() {
    const vPin = divider ? divOut(vBat, R1, R2) : vBat;
    const raw = adcRaw(vPin);
    const scale = (R1 + R2) / R2;
    const iDiv = divider ? vBat / (R1 + R2) : 0;
    cell.setVoltage(vBat);
    tk.setLevel((vBat - 2.6) / 1.8);
    vLabel.set(`${vBat.toFixed(2)} V`);
    midLabel.set(divider ? `${vPin.toFixed(2)} V` : '');
    midLabel.show(divider);
    const over = vPin > ABS_MAX;
    pinTag.set(`D34: ${vPin.toFixed(2)} V`, over ? 'pin bad' : 'pin');
    bubble.set(damaged ? 'analogRead(34) = ??? (pin damaged)' : `analogRead(34) = ${raw} → battery ${divider ? ((raw / 4095) * 3.3 * scale).toFixed(2) : '?'} V`, over || damaged ? 'bad' : 'good');
    formula.set(divider ? `V<sub>out</sub> = V<sub>in</sub> × R2 ÷ (R1 + R2) → <b>${vPin.toFixed(2)} V</b> = ${vBat.toFixed(2)} V × ${fmt(R2, 'Ω')} ÷ ${fmt(R1 + R2, 'Ω')}` : 'No divider: the pin sees the full battery voltage.');
    roV.set(`${vPin.toFixed(2)} V`, over ? 'bad' : vPin > 2.5 ? 'warn' : 'good');
    roA.set(damaged ? '—' : `${raw}${raw >= 4095 ? ' (maxed out)' : ''}`, raw >= 4095 ? 'warn' : '');
    roB.set(divider && !damaged ? `${((raw / 4095) * 3.3 * scale).toFixed(2)} V` : '—');
    roI.set(divider ? `${(iDiv * 1e6).toFixed(1)} µA` : '—', iDiv * 1e6 > 50 ? 'warn' : '');
    note.set(
      !divider ? '' : vPin > 2.5 ? 'Above about 2.5 V the ESP32\'s ADC gets less accurate. Make R2 smaller or R1 bigger.' : iDiv > 50e-6 ? 'The divider drains the battery all day. Bigger resistors waste less.' : '',
      'note warn',
    );
    n1.setNarrow(0.3 + (Math.log10(R1 / 10e3) / Math.log10(22)) * 0.6);
    n2.setNarrow(0.3 + (Math.log10(R2 / 10e3) / Math.log10(22)) * 0.6);
    n1.group.visible = n2.group.visible = divider;
    gg.set(Math.min(1, vPin / 4.2));
    wLabel.set(`Gauge: ${vPin.toFixed(2)}`, over ? 'bad water' : 'big water');
    wflow.speed = divider ? Math.min(4, iDiv * 4e4) : 4;
    if (over && !damaged) burn(vPin);
  }

  function burn(v: number) {
    damaged = true;
    const p = b.esp.pin('D34').add(b.esp.group.position).setY(0.9);
    fx.flash(p, '#ffe0a0', 1.6);
    fx.sparks(p, 24);
    ctx.fail({
      title: 'Too much for the pin!',
      text: `The pin now sees ${v.toFixed(2)} V, over the ESP32's 3.6 V absolute maximum. On a real board this pin can be damaged for good, and the ADC reads 4095 no matter what. **Always scale a battery down with a divider.**`,
      undo: () => {
        damaged = false;
        setDivider(true);
      },
      undoLabel: 'Undo (put the divider back)',
    });
    update();
  }

  stage.onUpdate((dt) => wflow.update(dt));

  update();
  stage.focusObjects = [b.bb.group, cell.group];
  stage.enableWater(2, 'real');
  stage.frame({ dir: new THREE.Vector3(0.05, 1.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'dividerSafe') return { ok: false };
      if (!divider) return { ok: false, msg: 'Put the divider back first.' };
      const v = divOut(4.2, R1, R2);
      const i = 4.2 / (R1 + R2);
      if (v < 1.8 || v > 2.5) return { ok: false, msg: `A full battery gives ${v.toFixed(2)} V at the pin. Aim for 1.8–2.5 V.` };
      if (i >= 50e-6) return { ok: false, msg: `The divider draws ${(i * 1e6).toFixed(0)} µA. Use bigger resistors to get under 50 µA.` };
      return { ok: true };
    },
  };
}
