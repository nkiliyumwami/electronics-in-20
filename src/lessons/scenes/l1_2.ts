import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { bench, addWire, batteryPts, dense, flowAlong, up, waterLoop } from '../kit';
import { resistor } from '../../three/lib';
import { currentToSpeed } from '../../three/particles';
import { fmt, roundSig } from '../../sim/physics';
import { h } from '../../core/dom';

const RATING = 0.25; // W

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let V = 3;
  let R = 470;
  let heat = 0; // smoothed P / rating
  let over = 0; // seconds spent overloaded
  let burnt = false;
  let smoking: (() => void) | null = null;
  let lastSafe = { V, R };
  let find: 'V' | 'I' | 'R' = 'I';

  // ---- real view
  const b = bench(ctx);
  const H = b.bb.hole;
  const hTop = H(11, 0), hResR = H(11, 2), hResL = H(5, 2), hGnd = H(5, 0);
  const res = resistor(R, hResR.distanceTo(hResL));
  res.group.position.copy(hResR.clone().lerp(hResL, 0.5));
  stage.real.add(res.group);
  stage.part(res.group, { name: 'Resistor (¼ W)', job: 'Turns electrical energy into heat as it resists the current. This one is rated for 0.25 W.', symbol: 'resistor' });
  const redPts = batteryPts(b.plus, 1, hTop, 0.9);
  const blackPts = batteryPts(b.minus, -1, hGnd, 0.9);
  addWire(ctx, redPts, 'red', 'Red wire (+ side)');
  addWire(ctx, blackPts, 'black', 'Black wire (− side)');
  const loop = dense([...redPts, up(hResR, 0.02), up(hResR, 0.32), up(hResL, 0.32), up(hResL, 0.02), up(hGnd, 0.02), ...[...blackPts].reverse(), b.minus.clone(), b.plus.clone()]);
  const flow = flowAlong(stage.real, loop);
  const vLabel = stage.label('', b.batGroup, new THREE.Vector3(0.1, 2.15, 0), 'big');
  const rLabel = stage.label('', res.group, new THREE.Vector3(0, 0.8, 0));
  const iLabel = stage.label('', stage.real, new THREE.Vector3(2.3, 0.6, -1.7));

  // ---- water view
  const w = waterLoop(ctx);
  const wpLabel = stage.label('', w.pump.group, new THREE.Vector3(0, 1.4, 0), 'big water');
  const wnLabel = stage.label('', w.narrowing.group, new THREE.Vector3(0, 0.6, 0), 'water');
  const wfLabel = stage.label('', w.group, new THREE.Vector3(w.x1 + 0.2, w.y + 0.5, 0), 'water');

  // ---- controls
  const vS = panel.slider({ label: 'Battery voltage', min: 0, max: 12, step: 0.1, value: V, nudge: true, format: (v) => `${v.toFixed(1)} V`, onInput: (v) => { V = v; solve(); } });
  const rS = panel.slider({
    label: 'Resistor', min: 10, max: 10000, log: true, value: R, nudge: true, snap: (v) => roundSig(v, 3), format: (v) => fmt(v, 'Ω'),
    onInput: (v) => { R = v; res.setValue(R); solve(); },
  });

  // Live V–I–R triangle: tap the letter you want to find.
  const tri = h('div', { class: 'ctl' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 120');
  svg.setAttribute('width', '170');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Ohm\'s law triangle. Choose which quantity to find.');
  svg.innerHTML = `<path d="M100 6 L194 114 L6 114 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <path d="M40 74 H160 M100 74 V114" stroke="currentColor" stroke-width="2"/>`;
  const letters: Record<'V' | 'I' | 'R', SVGTextElement> = {} as never;
  const pos = { V: [100, 60], I: [62, 104], R: [138, 104] } as const;
  for (const k of ['V', 'I', 'R'] as const) {
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', String(pos[k][0]));
    t.setAttribute('y', String(pos[k][1]));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '30');
    t.setAttribute('font-weight', '700');
    t.setAttribute('tabindex', '0');
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', `Find ${k === 'V' ? 'voltage' : k === 'I' ? 'current' : 'resistance'}`);
    t.style.cursor = 'pointer';
    t.textContent = k;
    t.addEventListener('click', () => setFind(k));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setFind(k);
      }
    });
    letters[k] = t;
    svg.append(t);
  }
  const times = document.createElementNS(svgNS, 'text');
  times.setAttribute('x', '100');
  times.setAttribute('y', '104');
  times.setAttribute('text-anchor', 'middle');
  times.setAttribute('font-size', '22');
  times.textContent = '×';
  svg.append(times);
  const triHelp = h('span', { class: 'note' }, 'Tap a letter to cover it. The rest of the triangle tells you how to work it out.');
  tri.append(h('span', { class: 'lab' }, "Ohm's law triangle"), h('div', { class: 'row', style: { gap: '14px', flexWrap: 'wrap' } }, svg, triHelp));
  svg.style.color = 'var(--ink)';
  panel.custom(tri);
  const formula = panel.formula('Live formula');
  const heatBar = panel.bar('Heat (power vs the ¼ W rating)');
  const roI = panel.readout('Current');
  const roP = panel.readout('Power (heat)');

  function setFind(k: 'V' | 'I' | 'R') {
    find = k;
    for (const key of ['V', 'I', 'R'] as const) {
      letters[key].setAttribute('fill', key === k ? 'var(--flow)' : 'currentColor');
      letters[key].setAttribute('text-decoration', key === k ? 'underline' : 'none');
    }
    solve();
  }

  let I = 0;
  let P = 0;
  function solve() {
    I = burnt ? 0 : V / R;
    P = I * I * R;
    b.bat.setVoltage(V, 12);
    w.pump.setPressure(V / 12);
    w.narrowing.setNarrow(burnt ? 1 : (Math.log(R / 10) / Math.log(1000)) * 0.85 + 0.05);
    flow.speed = currentToSpeed(I, 0.02, 7);
    w.flow.speed = flow.speed;
    const iTxt = fmt(I, 'A');
    const vTxt = `${V.toFixed(2)} V`;
    const rTxt = fmt(R, 'Ω');
    if (find === 'I') formula.set(`I = V ÷ R = ${vTxt} ÷ ${rTxt} = <b>${iTxt}</b>`);
    else if (find === 'V') formula.set(`V = I × R = ${iTxt} × ${rTxt} = <b>${vTxt}</b>`);
    else formula.set(I > 0 ? `R = V ÷ I = ${vTxt} ÷ ${iTxt} = <b>${rTxt}</b>` : `R = V ÷ I (no current flowing)`);
    vLabel.set(`${V.toFixed(1)} V`);
    iLabel.set(`I = ${iTxt}`);
    wpLabel.set(`Pressure ${V.toFixed(1)}`);
    wnLabel.set(`Narrowness ${rTxt}`);
    wfLabel.set(`Flow ${iTxt}`);
    roI.set(iTxt);
    const pTxt = P < 1 ? `${(P * 1000).toFixed(0)} mW` : `${P.toFixed(2)} W`;
    roP.set(pTxt, P > RATING ? 'bad' : P > RATING * 0.7 ? 'warn' : '');
    rLabel.set(burnt ? `${rTxt} · burnt open` : `${rTxt} · ${pTxt} heat`, burnt || P > RATING ? 'bad' : P > RATING * 0.7 ? 'warn' : '');
    const frac = P / RATING;
    heatBar.set(Math.min(1, frac / 2), frac > 1 ? 'var(--bad)' : frac > 0.7 ? 'var(--warn)' : 'var(--good)', `${Math.round(frac * 100)}% of rating`);
    if (!burnt && P <= RATING) lastSafe = { V, R };
  }

  function burn() {
    burnt = true;
    res.setBurnt(true);
    res.setHeat(0);
    smoking?.();
    const wp = res.group.position.clone().add(new THREE.Vector3(0, 0.4, 0));
    fx.flash(wp, '#ffb070', 2);
    fx.smoke(wp, 4, 20, true);
    ctx.fxWater.smoke(w.narrowing.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 3, 12, true);
    const pNow = (V / R) * (V / R) * R;
    solve();
    ctx.fail({
      title: 'What happened?',
      text: `The resistor was turning about ${pNow.toFixed(2)} W into heat, but it is only rated for 0.25 W. It overheated and burned open, so now no current can flow at all.`,
      undo: () => {
        burnt = false;
        heat = 0;
        over = 0;
        res.setBurnt(false);
        fx.clear();
        ctx.fxWater.clear();
        V = lastSafe.V;
        R = lastSafe.R;
        vS.set(V);
        rS.set(R);
        res.setValue(R);
        solve();
      },
      undoLabel: 'Undo (fresh resistor)',
    });
  }

  stage.onUpdate((dt) => {
    flow.update(dt);
    w.flow.update(dt);
    w.pump.spin(dt, flow.speed);
    if (burnt) return;
    const target = P / RATING;
    heat += (target - heat) * Math.min(1, dt / 0.6);
    const glow = Math.min(1, heat / 2.2);
    res.setHeat(glow);
    w.narrowing.setHeat(glow);
    if (heat > 1.05) {
      over += dt * Math.min(4, heat);
      if (!smoking) smoking = fx.smoke(res.group.position.clone().add(new THREE.Vector3(0, 0.45, 0)), Infinity, 6);
    } else {
      over = Math.max(0, over - dt);
      if (smoking) {
        smoking();
        smoking = null;
      }
    }
    if (over > 2.2) {
      smoking?.();
      smoking = null;
      burn();
    }
  });

  setFind('I');
  stage.focusObjects = [b.batGroup, res.group];
  stage.enableWater(2.2);
  stage.frame({ dir: new THREE.Vector3(0.12, 1.35, 1), animate: false });

  return {
    check(task) {
      if (task !== 'set20mA') return { ok: false };
      if (burnt) return { ok: false, msg: 'The resistor is burnt. Tap Undo first.' };
      if (Math.abs(V - 5) > 0.051) return { ok: false, msg: `The battery is at ${V.toFixed(1)} V. Set it to 5.0 V.` };
      const mA = I * 1000;
      if (Math.abs(mA - 20) <= 0.4) return { ok: true };
      return { ok: false, msg: `Right now ${mA.toFixed(1)} mA flows through ${fmt(R, 'Ω')}. ${mA > 20 ? 'Too much: make the resistor bigger.' : 'Too little: make the resistor smaller.'}` };
    },
  };
}
