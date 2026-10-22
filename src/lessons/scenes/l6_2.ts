import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { espBench } from '../kit';
import { contactShadow, electrolyticCap } from '../../three/lib';
import { gauge, pipe, tank, tapValve } from '../../three/water';
import { prepCanvas, cssVar } from '../../core/panel';

// 6.2 Wi-Fi bursts dip the 3.3 V rail; a big capacitor at the pins stops brownout resets.
export const I_BURST = 0.25; // A while Wi-Fi transmits
export const R_SUPPLY = 3.6; // Ω: a long thin USB cable, jumpers and a weak supply
export const R_FAR = 0.8; // Ω: the extra wiring between a far capacitor and the ESP32
export const T_BURST = 0.3e-3; // s
export const BROWNOUT = 2.43; // V: the ESP32's brownout detector
export const CAPS = [0, 10e-6, 100e-6, 470e-6, 1000e-6];

/** Lowest rail voltage during a burst. */
export function railMin(c: number, far: boolean): number {
  const dip = c > 0 ? I_BURST * R_SUPPLY * (1 - Math.exp(-T_BURST / (R_SUPPLY * c))) + (far ? I_BURST * R_FAR : 0) : I_BURST * R_SUPPLY;
  return 3.3 - dip;
}

const capLabel = (c: number) => (c === 0 ? 'none' : `${Math.round(c * 1e6)} µF`);

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let wifi = false;
  let C = 0;
  let far = false;
  let resets = 0;
  let burstT = -1; // time since the last burst started (s, screen time)
  let rail = 3.3;
  let rebooting = 0;
  const hist: number[] = [];

  const b = espBench(ctx);
  const H = b.H;
  const railJ = [
    b.jumper(b.free('3V3'), H(1, 'bot+'), 'red', 'ESP32 3V3 to the red rail', '', 0.5),
    b.jumper(b.free('GND'), H(2, 'bot-'), 'black', 'ESP32 GND to the blue rail', '', 0.5),
  ];
  const capHolder = new THREE.Group();
  b.bb.group.add(capHolder);
  let cap = electrolyticCap();
  stage.part(capHolder, { name: 'Capacitor (electrolytic)', job: 'A small energy store. During each Wi-Fi burst it supplies the current, then refills. Stripe = − side, to GND.', symbol: 'electrolytic' });
  b.tag('3V3');
  b.tag('GND');
  // Wi-Fi rings above the module's antenna.
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: '#3d7bd9', transparent: true, opacity: 0 }));
    r.rotation.x = -Math.PI / 2;
    r.position.copy(b.esp.group.position).add(new THREE.Vector3(2.3, 1.2, 0));
    r.userData.noFrame = true;
    b.bb.group.add(r);
    rings.push(r);
  }
  const serial = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.2, -0.6), 'big');

  // ---- water view: far reservoir → long thin pipe → tap (the ESP32) with a local tank (the capacitor)
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(9, 5));
  const res = tank(2.2, 0.6);
  res.group.position.set(-3.6, -0.4, 0);
  res.setLevel(0.85);
  wg.add(res.group);
  wg.add(pipe([new THREE.Vector3(-3.0, 0.3, 0), new THREE.Vector3(1.9, 0.3, 0)], 0.05).mesh);
  const local = tank(1.0, 0.45);
  local.group.position.set(1.0, -0.4, 0.9);
  wg.add(local.group);
  wg.add(pipe([new THREE.Vector3(1.0, 0.3, 0), new THREE.Vector3(1.0, 0.3, 0.5)], 0.05).mesh);
  const tap = tapValve(0.12);
  tap.group.position.set(2.2, 0.3, 0);
  wg.add(tap.group);
  const wg2 = gauge(0.32);
  wg2.group.position.set(2.2, 1.0, 0);
  wg.add(wg2.group);
  stage.part(res.group, { name: 'Far reservoir (= the USB supply)', job: 'Plenty of water, but far away down a thin pipe.', symbol: 'tank' });
  stage.part(local.group, { name: 'Local tank (= the capacitor)', job: 'A small store right at the tap. It covers each sudden gulp.', symbol: 'tank' });
  stage.part(tap.group, { name: 'Tap (= the ESP32)', job: 'Opens wide in short bursts when Wi-Fi transmits.', symbol: 'tap' });
  stage.part(wg2.group, { name: 'Pressure gauge (= the 3.3 V rail)', job: 'Dips when the tap gulps faster than the thin pipe can deliver.', symbol: 'meter' });
  const wl = stage.label('', wg2.group, new THREE.Vector3(0, 0.6, 0), 'big water');

  // ---- controls
  panel.toggle('Wi-Fi on (bursts of 250 mA)', wifi, (v) => { wifi = v; burstT = v ? 0 : -1; });
  panel.select('Capacitor', CAPS.map((c) => ({ value: String(c), label: capLabel(c) })), '0', (v) => { C = Number(v); place(); });
  panel.segmented('Capacitor position', [{ value: 'close', label: 'Right at 3V3 and GND' }, { value: 'far', label: 'Far end of the breadboard' }], 'close', (v) => { far = v === 'far'; place(); });
  const chart = panel.chart('3.3 V rail during Wi-Fi bursts (the dashed line is the brownout level)', 120);
  const roMin = panel.readout('Lowest rail voltage');
  const roR = panel.readout('Brownout resets');
  const note = panel.note('');

  function place() {
    capHolder.clear();
    if (C === 0) {
      update();
      return;
    }
    const s = Math.cbrt(C / 100e-6);
    cap = electrolyticCap(0.6 * s + 0.3, 0.2 * s + 0.12);
    if (far) {
      cap.group.position.copy(H(26, 'bot+').lerp(H(26, 'bot-'), 0.5));
      cap.group.rotation.y = -Math.PI / 2; // + leg on the red rail, − on the blue
    } else {
      cap.group.position.copy(b.free('3V3').lerp(b.free('GND'), 0.5)).add(new THREE.Vector3(0, 0, 0.4));
    }
    capHolder.add(cap.group);
    for (const j of railJ) j.group.visible = far;
    update();
  }

  function update() {
    const m = railMin(C, far);
    roMin.set(wifi ? `${m.toFixed(2)} V` : '3.30 V (Wi-Fi off)', !wifi ? '' : m < BROWNOUT ? 'bad' : m < 3.0 ? 'warn' : 'good');
    note.set(
      C === 0
        ? 'No capacitor: every burst must come all the way down the thin cable.'
        : far
          ? 'Far away, the jumpers between the capacitor and the ESP32 still get in the way.'
          : m < 3.0
            ? 'Better, but this capacitor is too small to cover a whole burst.'
            : 'The capacitor covers each burst: the rail barely dips.',
      C > 0 && !far && m >= 3.0 ? 'note' : 'note warn',
    );
  }

  stage.onUpdate((dt, t) => {
    // A burst every 1.5 s while Wi-Fi is on; the dip shape is shown over 0.25 s of screen time.
    const m = railMin(C, far);
    if (wifi && rebooting <= 0) {
      burstT += dt;
      if (burstT > 1.5) burstT = 0;
    }
    const inBurst = wifi && rebooting <= 0 && burstT >= 0 && burstT < 0.25;
    const target = inBurst ? m : 3.3;
    rail += (target - rail) * Math.min(1, dt * 30);
    if (inBurst && m < BROWNOUT && rebooting <= 0) {
      resets++;
      rebooting = 1.2;
      roR.set(String(resets), 'bad');
    }
    if (rebooting > 0) {
      rebooting -= dt;
      b.esp.setPower(Math.sin(t * 30) > 0);
      serial.set('Brownout detector was triggered', 'bad');
      if (rebooting <= 0) b.esp.setPower(true);
    } else {
      serial.set(wifi ? (inBurst ? 'Wi-Fi: sending…' : 'Wi-Fi: connected') : 'Wi-Fi: off', wifi ? 'good' : '');
    }
    rings.forEach((r, i) => {
      const k = inBurst ? ((t * 3 + i / 3) % 1) : 0;
      (r.material as THREE.MeshBasicMaterial).opacity = inBurst ? 0.8 * (1 - k) : 0;
      r.scale.setScalar(0.5 + k * 1.6);
    });
    hist.push(rail);
    if (hist.length > 240) hist.shift();
    draw();
    // Water twin.
    tap.setOpen(inBurst ? 1 : 0.1);
    wg2.set(rail / 3.6);
    local.setLevel(C === 0 ? 0 : 0.8 - (inBurst ? 0.25 : 0));
    local.group.visible = C > 0;
    wl.set(`${rail.toFixed(2)}`, rail < BROWNOUT ? 'bad water' : 'big water');
  });

  function draw() {
    const { ctx: g, w, h } = prepCanvas(chart);
    const y = (v: number) => h - 8 - ((v - 2.0) / 1.5) * (h - 16);
    g.strokeStyle = cssVar('--bad');
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(0, y(BROWNOUT));
    g.lineTo(w, y(BROWNOUT));
    g.stroke();
    g.strokeStyle = cssVar('--warn');
    g.beginPath();
    g.moveTo(0, y(3.0));
    g.lineTo(w, y(3.0));
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = cssVar('--flow');
    g.lineWidth = 2;
    g.beginPath();
    hist.forEach((v, i) => {
      const x = (i / 239) * w;
      if (i) g.lineTo(x, y(v));
      else g.moveTo(x, y(v));
    });
    g.stroke();
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('3.3 V', 4, y(3.3) - 3);
    g.fillText('3.0 V', 4, y(3.0) - 3);
    g.fillText('brownout 2.43 V', 4, y(BROWNOUT) + 12);
  }

  place();
  roR.set('0');
  stage.focusObjects = [b.bb.group];
  stage.enableWater(2, 'real');
  stage.frame({ dir: new THREE.Vector3(0.05, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'noBrownout') return { ok: false };
      if (!wifi) return { ok: false, msg: 'Turn Wi-Fi on first: the problem only shows during bursts.' };
      const m = railMin(C, far);
      if (m < 3.0) return { ok: false, msg: `The rail still dips to ${m.toFixed(2)} V. Keep it above 3.0 V.` };
      return { ok: true };
    },
  };
}
