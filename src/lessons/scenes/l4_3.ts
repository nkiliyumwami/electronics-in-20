import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { pumpRig } from '../pumpRig';

// 4.3 Switching the pump off: the coil's kickback, the flyback diode, and relays.
export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  const rig = pumpRig(ctx, { relay: true });
  const st = rig.state;
  let spikes = 0;

  rig.setDirect(false);
  const row = panel.row();
  const pinBtn = panel.button('Pump ON (D26 HIGH)', () => setOn(st.vg < 2), 'btn primary', row);
  const dBtn = panel.toggle('Flyback diode fitted', st.diode, (v) => rig.setDiode(v), row);
  const roI = panel.readout('Pump current');
  const roS = panel.readout('Switch-offs');
  const note = panel.note('Coils (pumps, motors, valves, relays) keep their current flowing for a moment after you switch them off.');

  function setOn(on: boolean) {
    rig.setGate(on ? 3.3 : 0);
    pinBtn.textContent = on ? 'Pump OFF (D26 LOW)' : 'Pump ON (D26 HIGH)';
  }

  rig.onSwitchOff = (withDiode, amps) => {
    if (withDiode) {
      note.set(`Clean switch-off: the coil's ${(amps * 1000).toFixed(0)} mA circled through the diode and faded away.`, 'note');
      return;
    }
    spikes++;
    ctx.fail({
      title: 'Spike! What happened?',
      text: 'The pump is a coil, and a coil\'s current cannot stop instantly. When the MOSFET snapped off, that current had nowhere to go, so the drain voltage shot far above 5 V. Every spike like that wears the MOSFET down, and it can reset the ESP32.',
      undo: () => {
        rig.setDiode(true);
        dBtn.set(true);
      },
      undoLabel: 'Fit the flyback diode',
    });
  };

  stage.onUpdate((dt) => {
    rig.update(dt);
    roI.set(st.I < 1e-6 ? '0 mA (off)' : `${(st.I * 1000).toFixed(0)} mA`);
    roS.set(`${st.cleanOffs} clean, ${spikes} with a spike`, spikes ? 'warn' : st.cleanOffs ? 'good' : '');
  });

  stage.focusObjects = [rig.bench.bb.group, rig.relay];
  stage.enableWater(2.2, 'real');
  stage.frame({ dir: new THREE.Vector3(0.1, 1.3, 1), animate: false });

  return {
    check(task) {
      if (task !== 'offNoSpark') return { ok: false };
      if (st.cleanOffs > 0) return { ok: true };
      if (!st.diode) return { ok: false, msg: 'There is no flyback diode yet.' };
      return { ok: false, msg: 'Now switch the pump on, then off.' };
    },
  };
}
