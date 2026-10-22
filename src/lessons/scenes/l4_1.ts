import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { dense, espBench, flowAlong, up } from '../kit';
import { led, mesh, resistor } from '../../three/lib';
import { jumperRoute } from '../../three/iot';
import { currentToSpeed } from '../../three/particles';
import { prepCanvas, cssVar } from '../../core/panel';

// 4.1 PWM on the status LED (D16 → 220 Ω → LED → GND), plus LED polarity.
const I_ON = (3.3 - 2.0) / 220;

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let duty = 1.0;
  let flipped = false;
  let slow = true;

  const b = espBench(ctx);
  const H = b.H;
  const pinHole = b.free('D16');
  const gndHole = b.free('GND');
  const rA = H(18, 9), rB = H(22, 9);
  const res = resistor(220, rA.distanceTo(rB));
  res.group.position.copy(rA.clone().lerp(rB, 0.5));
  b.bb.group.add(res.group);
  stage.part(res.group, { name: 'Resistor, 220 Ω', job: 'Still needed with PWM: while the pin is on, it limits the current to about 5.9 mA.', symbol: 'resistor' });
  const holder = new THREE.Group();
  holder.position.copy(H(22, 7).lerp(H(23, 7), 0.5));
  const light = led('red');
  holder.add(light.group);
  holder.add(mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), new THREE.MeshBasicMaterial({ visible: false }), [0, 0.6, 0]));
  b.bb.group.add(holder);
  stage.part(holder, { name: 'Status LED', job: 'Long leg (+) towards the pin, flat edge (−) towards GND. Tap it to flip it around.', symbol: 'led', actions: () => [{ label: 'Flip it around', run: () => setFlip(!flipped) }] });
  stage.onTap(holder, () => setFlip(!flipped));
  b.jumper(pinHole, H(18, 6), 'yellow', 'Signal wire from D16', 'Carries the PWM signal.');
  b.jumper(H(23, 8), H(23, 'bot-'), 'black', 'Wire to the GND rail', '', 0.5);
  b.jumper(gndHole, H(2, 'bot-'), 'black', 'ESP32 GND to the rail', '', 0.5);
  const pinTag = b.tag('D16');
  const loop = dense([
    ...jumperRoute(pinHole, H(18, 6)),
    up(rA, 0.32),
    up(rB, 0.32),
    up(H(22, 7), 0.3),
    up(H(23, 7), 0.3),
    ...jumperRoute(H(23, 8), H(23, 'bot-'), 0.5),
    up(H(2, 'bot-'), 0.05),
    ...jumperRoute(H(2, 'bot-'), gndHole, 0.5),
    up(pinHole, 0.2),
  ]);
  const flow = flowAlong(stage.real, loop);
  const ledLabel = stage.label('', holder, new THREE.Vector3(0, 1.5, 0));

  // ---- controls
  const dS = panel.slider({ label: 'Duty cycle', min: 0, max: 100, step: 1, value: duty * 100, nudge: true, format: (v) => `${Math.round(v)}% (analogWrite ${Math.round((v / 100) * 255)})`, onInput: (v) => { duty = v / 100; update(); } });
  void dS;
  const row = panel.row();
  panel.toggle('Slow motion (see the switching)', slow, (v) => { slow = v; }, row);
  panel.button('Flip the LED around', () => setFlip(!flipped), 'btn', row);
  const chart = panel.chart('The pin over time: on (3.3 V) and off (0 V)', 110);
  const roA = panel.readout('Average voltage');
  const roL = panel.readout('LED');
  const note = panel.note('');

  function setFlip(f: boolean) {
    flipped = f;
    light.flip(f);
    update();
  }

  function update() {
    roA.set(`${(duty * 3.3 + 1e-9).toFixed(2)} V`);
    roL.set(flipped ? 'dark: fitted backwards' : duty <= 0 ? 'off' : `${Math.round(duty * 100)}% brightness`, flipped ? 'warn' : duty > 0 ? 'good' : '');
    note.set(flipped ? 'The LED is backwards: flat edge towards the pin. It blocks the current, so it stays dark (no harm at 3.3 V).' : '', 'note warn');
    drawChart();
  }

  function drawChart() {
    const { ctx: g, w, h } = prepCanvas(chart);
    const y0 = h - 16, y1 = 18;
    const period = (w - 50) / 4;
    g.strokeStyle = cssVar('--flow');
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const x = 40 + k * period;
      const on = period * duty;
      g.moveTo(x, y0);
      g.lineTo(x, on > 0 ? y1 : y0);
      g.lineTo(x + on, on > 0 ? y1 : y0);
      g.lineTo(x + on, y0);
      g.lineTo(x + period, y0);
    }
    g.stroke();
    const ya = y0 - (y0 - y1) * duty;
    g.setLineDash([5, 4]);
    g.strokeStyle = cssVar('--good');
    g.beginPath();
    g.moveTo(40, ya);
    g.lineTo(w - 10, ya);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('3.3 V', 4, y1 + 4);
    g.fillText('0 V', 10, y0 + 4);
    g.fillStyle = cssVar('--good');
    g.fillText(`average ${(duty * 3.3 + 1e-9).toFixed(2)} V`, w - 110, Math.max(12, ya - 5));
  }

  let t = 0;
  stage.onUpdate((dt) => {
    t += dt;
    // Slow motion: one PWM cycle every 1.2 s, so you can see the pin switching.
    const on = slow ? (t / 1.2) % 1 < duty : duty > 0;
    const level = flipped ? 0 : slow ? (on ? 1 : 0) : duty;
    light.setLight(level * 0.7);
    flow.speed = flipped ? 0 : slow ? (on ? currentToSpeed(I_ON, 0.003, 5) : 0) : currentToSpeed(I_ON * duty, 0.003, 5);
    flow.update(dt);
    pinTag.set(slow ? `D16 ${on ? 'ON 3.3 V' : 'OFF 0 V'}` : `D16 PWM ${Math.round(duty * 100)}%`, slow && on ? 'pin good' : 'pin');
    ledLabel.set(flipped ? 'backwards' : `${Math.round(duty * 100)}%`);
  });

  update();
  stage.focusObjects = [b.bb.group];
  stage.frame({ dir: new THREE.Vector3(0.05, 1.25, 1), animate: false });

  return {
    check(task) {
      if (task !== 'dim2030') return { ok: false };
      if (flipped) return { ok: false, msg: 'The LED is fitted backwards, so it stays dark. Flip it.' };
      if (duty < 0.2 || duty > 0.3) return { ok: false, msg: `The duty cycle is ${Math.round(duty * 100)}%. Aim for 20–30%.` };
      return { ok: true };
    },
  };
}
