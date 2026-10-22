import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { pumpRig, LOADS, PIN_MAX, type LoadKey } from '../pumpRig';
import { fmt } from '../../sim/physics';

// 4.2 A MOSFET switch for the pump: first try the pin alone, then the MOSFET, then half-on.
export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  const rig = pumpRig(ctx);
  const st = rig.state;
  let mode: 'direct' | 'mosfet' = 'direct';

  // ---- controls
  panel.segmented('Wiring', [{ value: 'direct', label: 'Pump straight on D26' }, { value: 'mosfet', label: 'Through the MOSFET' }], mode, (v) => setMode(v as 'direct' | 'mosfet'));
  const row = panel.row();
  const pinBtn = panel.button('Set D26 HIGH (3.3 V)', () => setGate(st.vg > 2 ? 0 : 3.3), 'btn primary', row);
  const gS = panel.slider({ label: 'Gate voltage', min: 0, max: 3.3, step: 0.05, value: 0, nudge: true, format: (v) => `${v.toFixed(2)} V`, onInput: (v) => setGate(v, false) });
  panel.segmented('Load', [{ value: 'small', label: 'Plant Buddy pump (150 mA)' }, { value: 'big', label: 'Bigger 12 V pump (1 A)' }], 'small', (v) => {
    rig.setLoad(v as LoadKey);
    refresh();
  });
  const roI = panel.readout('Pump current');
  const roPin = panel.readout('Current from the pin');
  const roR = panel.readout('MOSFET resistance');
  const roT = panel.readout('MOSFET temperature');
  const note = panel.note('');

  function setMode(m: 'direct' | 'mosfet') {
    mode = m;
    rig.setDirect(m === 'direct');
    gS.disable(m === 'direct');
    refresh();
  }
  function setGate(v: number, sync = true) {
    if (sync) gS.set(v);
    rig.setGate(v);
    pinBtn.textContent = v > 2 ? 'Set D26 LOW (0 V)' : 'Set D26 HIGH (3.3 V)';
    refresh();
  }
  function refresh() {
    const off = st.I < 1e-6;
    roI.set(off ? '0 mA (off)' : fmt(st.I, 'A'));
    roPin.set(mode === 'direct' ? fmt(st.pinI, 'A') : '≈ 0 mA (the gate takes almost nothing)', st.pinI > PIN_MAX ? 'bad' : '');
    roR.set(mode === 'direct' ? '—' : st.Rds > 1e9 ? 'open (off)' : fmt(st.Rds, 'Ω'));
    note.set(
      mode === 'direct'
        ? 'The pump hangs straight off the pin. Switch D26 HIGH and see what happens.'
        : st.vg > 1.5 && st.vg < 2.8
          ? `Half-on: the MOSFET is acting like a ${fmt(st.Rds, 'Ω')} resistor and heats up.${st.load === 'small' ? ' With the small pump only a little; try the bigger pump.' : ''}`
          : '',
      st.vg > 1.5 && st.vg < 2.8 ? 'note warn' : 'note',
    );
  }

  rig.onPinOverload = (amps) => {
    const p = rig.bench.esp.pin('D26').add(rig.bench.esp.group.position).setY(0.9);
    ctx.fx.flash(p, '#ffe0a0', 1.4);
    ctx.fx.sparks(p, 18);
    ctx.fail({
      title: 'The pin can\'t power a pump',
      text: `The pump needs about 150 mA at 5 V. Straight on the pin it gets only 3.3 V, and it still pulls about ${(amps * 1000).toFixed(0)} mA, over the pin's 40 mA maximum: the pump barely twitches and the pin is overloaded. **Let the pin drive a MOSFET's gate instead.**`,
      undo: () => {
        setGate(0);
        setMode('mosfet');
        segSet('mosfet');
      },
      undoLabel: 'Use the MOSFET',
    });
  };
  const segSet = (v: string) => panel.el.querySelectorAll<HTMLButtonElement>('.seg[aria-label="Wiring"] button').forEach((b, i) => b.setAttribute('aria-pressed', String(['direct', 'mosfet'][i] === v)));
  rig.onCook = () => {
    ctx.fail({
      title: 'What happened? The MOSFET cooked.',
      text: `Half-on, the MOSFET acted like a resistor and turned several watts into heat in a tiny package. It passed 175 °C. Drive the gate fully on (3.3 V) or fully off (0 V).`,
      undo: () => {
        rig.reset();
        setGate(0);
      },
      undoLabel: 'Undo (new MOSFET, gate off)',
    });
  };

  stage.onUpdate((dt) => {
    rig.update(dt);
    roT.set(mode === 'direct' ? '—' : `${st.temp.toFixed(0)} °C`, st.temp > 125 ? 'bad' : st.temp > 70 ? 'warn' : '');
  });

  setMode('direct');
  stage.focusObjects = [rig.bench.bb.group];
  stage.enableWater(2.2, 'real');
  stage.frame({ dir: new THREE.Vector3(0.1, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'pumpOn') return { ok: false };
      if (mode !== 'mosfet') return { ok: false, msg: 'The pump is still wired straight to the pin. Choose "Through the MOSFET".' };
      if (st.cooked) return { ok: false, msg: 'The MOSFET is cooked. Undo first.' };
      if (st.vg < 3.2) return { ok: false, msg: 'The gate is not fully on. Set D26 HIGH (3.3 V).' };
      if (st.load !== 'small') return { ok: false, msg: `Choose Plant Buddy's own pump (${LOADS.small.name}).` };
      if (st.temp > 70) return { ok: false, msg: 'Let the MOSFET cool down first.' };
      return { ok: true };
    },
  };
}
