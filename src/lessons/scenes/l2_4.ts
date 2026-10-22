import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { battery, contactShadow, led, mesh, std, wire, M, type LedObj, type WireObj } from '../../three/lib';
import { Flow, currentToSpeed } from '../../three/particles';
import { pipe, pump, narrowing } from '../../three/water';
import { dense, FLOW_COLOR, WATER_FLOW } from '../kit';
import { fmt } from '../../sim/physics';
import { h } from '../../core/dom';

// 2.4 Series and parallel: two LED branches (each with its resistor) sharing a supply.
type Mode = 'series' | 'parallel';
const VF = 2.0; // red LED
const VALUES = [100, 220, 470];

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let mode: Mode = 'series';
  let V = 3.3;
  const R = [220, 220];
  const inSocket = [true, true];

  // ---- base, battery, sockets
  const base = mesh(new THREE.BoxGeometry(5.6, 0.2, 5), std('#e7d7b8', 0.8), [0, -0.1, 0.2]);
  stage.real.add(base, contactShadow(9, 8));
  stage.part(base, { name: 'Base board', job: 'Just something to mount the parts on.', symbol: 'pcb' });
  const bat = battery('SUPPLY');
  bat.group.position.set(0, 0, -1.9);
  stage.real.add(bat.group);
  stage.part(bat.group, { name: 'Supply (the ESP32\'s 3V3, or 5 V)', job: 'Pushes current around whatever you connect. Switch between the 3.3 V rail and 5 V in the controls.', symbol: 'battery' });
  const vLabel = stage.label('', bat.group, new THREE.Vector3(0.1, 2.1, 0), 'big');
  const plus = bat.plus.clone().add(bat.group.position);
  const minus = bat.minus.clone().add(bat.group.position);
  const y = 0.08;

  // Socket positions per layout.
  const SOCK: Record<Mode, THREE.Vector3[]> = {
    series: [new THREE.Vector3(0.95, y, 1.6), new THREE.Vector3(-0.95, y, 1.6)],
    parallel: [new THREE.Vector3(0, y, 1.6), new THREE.Vector3(0, y, 0.25)],
  };
  const socketMeshes = [0, 1].map(() => {
    const s = mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.16, 24), std('#3b3e42', 0.5), [0, 0, 0]);
    stage.real.add(s);
    return s;
  });
  const bulbs: (LedObj & { group: THREE.Group })[] = [0, 1].map((i) => {
    const holder = new THREE.Group();
    const l = led('red', 0.3);
    l.group.scale.setScalar(1.4);
    holder.add(l.group);
    stage.real.add(holder);
    stage.part(holder, {
      name: `LED ${i + 1} (with its resistor)`,
      job: 'A red LED (2.0 V) and its resistor, like a small module. Drag it out of its holder, or use the buttons.',
      symbol: 'led',
      actions: () => [{ label: inSocket[i] ? 'Pull it out' : 'Put it back', run: () => setIn(i, !inSocket[i]) }],
    });
    return { ...l, group: holder };
  });
  const rLabels = [0, 1].map((i) => stage.label('', bulbs[i].group, new THREE.Vector3(0, 1.6, 0)));
  const parked = [new THREE.Vector3(2.3, y, 2.1), new THREE.Vector3(-2.3, y, 2.1)];
  bulbs.forEach((b, i) => {
    stage.draggable(b.group, {
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -y - 0.4),
      onStart: () => {},
      onMove: (p) => b.group.position.set(p.x, y + 0.4, p.z),
      onEnd: (p) => {
        const s = SOCK[mode][i];
        setIn(i, Math.hypot(p.x - s.x, p.z - s.z) < 0.7);
      },
    });
  });

  // ---- wires for both layouts
  const wireSets: Record<Mode, WireObj[]> = { series: [], parallel: [] };
  const W = (m: Mode, pts: THREE.Vector3[], c: 'red' | 'black' | 'yellow') => {
    const w = wire(pts, c, 0.05, 0.25);
    stage.real.add(w.mesh);
    wireSets[m].push(w);
    stage.part(w.mesh, { name: 'Wire', job: 'Joins the parts with almost no resistance.', symbol: 'wire' });
  };
  const xR = 2.2, xL = -2.2, zF = 1.6, zM = 0.25, wy = 0.15;
  const P = (x: number, z: number) => new THREE.Vector3(x, wy, z);
  // Series: + → right side → front: bulb1 → bulb2 → left side → −
  W('series', [plus, P(xR, plus.z), P(xR, zF), P(1.3, zF)], 'red');
  W('series', [P(0.6, zF), P(-0.6, zF)], 'yellow');
  W('series', [P(-1.3, zF), P(xL, zF), P(xL, minus.z), minus], 'black');
  // Parallel: two rails with two rungs
  W('parallel', [plus, P(xR, plus.z), P(xR, zF), P(0.35, zF)], 'red');
  W('parallel', [P(xR, zM), P(0.35, zM)], 'red');
  W('parallel', [P(-0.35, zF), P(xL, zF), P(xL, minus.z), minus], 'black');
  W('parallel', [P(-0.35, zM), P(xL, zM)], 'black');

  // ---- particles
  const mkFlow = (pts: THREE.Vector3[]) => {
    const f = new Flow(new THREE.CatmullRomCurve3(dense(pts), false, 'catmullrom', 0.05), { color: FLOW_COLOR, spacing: 0.32, radius: 0.05, closed: false });
    stage.real.add(f.mesh);
    return f;
  };
  const flows = {
    series: mkFlow([plus, P(xR, plus.z), P(xR, zF), P(xL, zF), P(xL, minus.z), minus]),
    rightRail: mkFlow([plus, P(xR, plus.z), P(xR, zM)]),
    rung1: mkFlow([P(xR, zM), P(xR, zF), P(xL, zF), P(xL, zM)]),
    rung2: mkFlow([P(xR, zM), P(xL, zM)]),
    leftRail: mkFlow([P(xL, zM), P(xL, minus.z), minus]),
  };

  // ---- water view
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(7, 7));
  const pm = pump();
  pm.group.position.set(0, 0.4, -1.9);
  wg.add(pm.group);
  const wy2 = 0.4;
  const Q = (x: number, z: number) => new THREE.Vector3(x, wy2, z);
  const wSeries = new THREE.Group();
  const wPar = new THREE.Group();
  wg.add(wSeries, wPar);
  wSeries.add(pipe([Q(0.55, -1.9), Q(xR, -1.9), Q(xR, zF), Q(xL, zF), Q(xL, -1.9), Q(-0.55, -1.9)], 0.13).mesh);
  wPar.add(pipe([Q(0.55, -1.9), Q(xR, -1.9), Q(xR, zF), Q(xL, zF), Q(xL, -1.9), Q(-0.55, -1.9)], 0.13).mesh);
  wPar.add(pipe([Q(xR, zM), Q(xL, zM)], 0.13).mesh);
  const nar = [narrowing(1.0, 0.13), narrowing(1.0, 0.13), narrowing(1.0, 0.13), narrowing(1.0, 0.13)];
  nar[0].group.position.copy(Q(0.95, zF));
  nar[1].group.position.copy(Q(-0.95, zF));
  wSeries.add(nar[0].group, nar[1].group);
  nar[2].group.position.copy(Q(0, zF));
  nar[3].group.position.copy(Q(0, zM));
  wPar.add(nar[2].group, nar[3].group);
  stage.part(pm.group, { name: 'Pump (= the supply)', job: 'Sets the pressure.', symbol: 'pump' });
  for (const n of nar) stage.part(n.group, { name: 'Narrow pipe (= LED and resistor)', job: 'Each narrowing resists the flow, like an LED branch.', symbol: 'pipe' });
  const plug = (pos: THREE.Vector3) => {
    const m = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), std('#c0281f', 0.5), [pos.x, pos.y, pos.z], [0, 0, Math.PI / 2]);
    wg.add(m);
    return m;
  };
  const plugs = { series: [plug(Q(0.95, zF)), plug(Q(-0.95, zF))], parallel: [plug(Q(0, zF)), plug(Q(0, zM))] };
  const wf = (pts: THREE.Vector3[]) => {
    const f = new Flow(new THREE.CatmullRomCurve3(dense(pts), false, 'catmullrom', 0.05), { color: WATER_FLOW, spacing: 0.32, radius: 0.07, closed: false });
    wg.add(f.mesh);
    return f;
  };
  const wflows = {
    series: wf([Q(0.55, -1.9), Q(xR, -1.9), Q(xR, zF), Q(xL, zF), Q(xL, -1.9), Q(-0.55, -1.9)]),
    rightRail: wf([Q(0.55, -1.9), Q(xR, -1.9), Q(xR, zM)]),
    rung1: wf([Q(xR, zM), Q(xR, zF), Q(xL, zF), Q(xL, zM)]),
    rung2: wf([Q(xR, zM), Q(xL, zM)]),
    leftRail: wf([Q(xL, zM), Q(xL, -1.9), Q(-0.55, -1.9)]),
  };

  // ---- controls
  panel.segmented('Layout', [{ value: 'series', label: 'Series (one loop)' }, { value: 'parallel', label: 'Parallel (side by side)' }], mode, (m) => setMode(m as Mode));
  panel.segmented('Supply', [{ value: '3.3', label: '3.3 V (3V3 rail)' }, { value: '5', label: '5 V (VIN)' }], '3.3', (v) => {
    V = Number(v);
    solve();
  });
  const sockRow = h('div', { class: 'btnrow' });
  const sockBtns = [0, 1].map((i) => {
    const b = h('button', { class: 'btn', type: 'button', onclick: () => setIn(i, !inSocket[i]) }, '') as HTMLButtonElement;
    sockRow.append(b);
    return b;
  });
  panel.custom(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'LEDs (or drag them in 3D)'), sockRow));
  [0, 1].forEach((i) =>
    panel.select(`LED ${i + 1} resistor`, VALUES.map((v) => ({ value: String(v), label: fmt(v, 'Ω') })), String(R[i]), (v) => {
      R[i] = Number(v);
      solve();
    }),
  );
  const roI = panel.readout('Supply current');
  const roB = [panel.readout('LED 1'), panel.readout('LED 2')];
  const note = panel.note('');

  function setMode(m: Mode) {
    mode = m;
    for (const k of ['series', 'parallel'] as Mode[]) for (const w of wireSets[k]) w.mesh.visible = k === m;
    wSeries.visible = m === 'series';
    wPar.visible = m === 'parallel';
    place();
    solve();
  }
  function setIn(i: number, v: boolean) {
    inSocket[i] = v;
    place();
    solve();
  }
  function place() {
    for (let i = 0; i < 2; i++) {
      const s = SOCK[mode][i];
      socketMeshes[i].position.copy(s);
      bulbs[i].group.position.copy(inSocket[i] ? s.clone().setY(s.y + 0.06) : parked[i]);
      sockBtns[i].textContent = inSocket[i] ? `Pull LED ${i + 1} out` : `Put LED ${i + 1} back`;
      for (const k of ['series', 'parallel'] as Mode[]) plugs[k][i].visible = k === mode && !inSocket[i];
    }
  }

  let I = [0, 0];
  function solve() {
    if (mode === 'series') {
      // One loop: both LEDs (2.0 V each) and both resistors share the supply.
      const i = inSocket[0] && inSocket[1] ? Math.max(0, (V - 2 * VF) / (R[0] + R[1])) : 0;
      I = [i, i];
    } else {
      I = R.map((r, k) => (inSocket[k] ? Math.max(0, (V - VF) / r) : 0));
    }
    const iBat = mode === 'series' ? I[0] : I[0] + I[1];
    bulbs.forEach((b, k) => b.setLight(inSocket[k] ? Math.min(1.3, I[k] / 0.008) : 0));
    rLabels.forEach((l, k) => l.set(inSocket[k] ? `${fmt(R[k], 'Ω')} · ${(I[k] * 1000).toFixed(1)} mA` : 'out'));
    vLabel.set(V === 5 ? '5 V' : '3.3 V');
    bat.setVoltage(V, 5);
    roI.set(`${(iBat * 1000).toFixed(1)} mA`);
    roB.forEach((ro, k) => ro.set(inSocket[k] ? (I[k] > 0 ? `lit, ${(I[k] * 1000).toFixed(1)} mA` : 'dark') : 'pulled out', inSocket[k] && I[k] > 0 ? 'good' : 'warn'));
    note.set(
      mode === 'series' && V < 2 * VF && inSocket[0] && inSocket[1]
        ? 'In series the two LEDs need 2.0 + 2.0 = 4.0 V. The 3.3 V rail is not enough, so nothing flows.'
        : mode === 'series' && (!inSocket[0] || !inSocket[1])
          ? 'In series there is only one loop. Pull one LED out and the loop is broken for both.'
          : mode === 'parallel'
            ? 'In parallel each LED has its own path across the rail, and the supply current is the sum of both.'
            : '',
      mode === 'series' ? 'note warn' : 'note',
    );
    const s = (i: number) => currentToSpeed(i, 0.006, 6);
    for (const [k, f] of Object.entries(flows)) f.mesh.visible = mode === 'series' ? k === 'series' : k !== 'series';
    for (const [k, f] of Object.entries(wflows)) f.mesh.visible = mode === 'series' ? k === 'series' : k !== 'series';
    flows.series.speed = wflows.series.speed = s(I[0]);
    flows.rightRail.speed = flows.leftRail.speed = wflows.rightRail.speed = wflows.leftRail.speed = s(iBat);
    flows.rung1.speed = wflows.rung1.speed = s(I[0]);
    flows.rung2.speed = wflows.rung2.speed = s(I[1]);
    nar.forEach((n, k) => n.setNarrow(0.25 + (Math.log(R[k % 2] / 100) / Math.log(470 / 100)) * 0.6));
  }

  stage.onUpdate((dt) => {
    for (const f of Object.values(flows)) f.update(dt);
    for (const f of Object.values(wflows)) f.update(dt);
    pm.spin(dt, flows.rightRail.speed + flows.series.speed);
  });

  void M;
  setMode('series');
  stage.enableWater(1.6);
  stage.hint(bulbs[0].group, 'Drag me out');
  stage.frame({ dir: new THREE.Vector3(0, 1.5, 1), animate: false });

  return {
    check(task) {
      if (task !== 'oneOutOtherLit') return { ok: false };
      const out = inSocket.filter((v) => !v).length;
      if (out !== 1) return { ok: false, msg: out === 0 ? 'Both LEDs are still in. Pull one out.' : 'Both LEDs are out.' };
      const lit = I.some((i, k) => inSocket[k] && i > 0.0005);
      if (!lit) return { ok: false, msg: 'The remaining LED is dark. In this layout, removing one breaks the only loop.' };
      return { ok: true };
    },
  };
}
