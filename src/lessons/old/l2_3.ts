import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { battery, bulb, contactShadow, mesh, std, wire, M, type WireObj } from '../../three/lib';
import { Flow, currentToSpeed } from '../../three/particles';
import { pipe, pump, narrowing } from '../../three/water';
import { dense, FLOW_COLOR, WATER_FLOW } from '../kit';
import { fmt } from '../../sim/physics';
import { h } from '../../core/dom';

type Mode = 'series' | 'parallel';
const V = 9;
const VALUES = [220, 470, 1000];

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let mode: Mode = 'series';
  const R = [470, 470];
  const inSocket = [true, true];

  // ---- base, battery, sockets
  const base = mesh(new THREE.BoxGeometry(5.6, 0.2, 5), std('#e7d7b8', 0.8), [0, -0.1, 0.2]);
  stage.real.add(base, contactShadow(9, 8));
  stage.part(base, { name: 'Base board', job: 'Just something to mount the parts on.', symbol: 'pcb' });
  const bat = battery();
  bat.group.position.set(0, 0, -1.9);
  stage.real.add(bat.group);
  bat.setVoltage(V, 12);
  stage.part(bat.group, { name: 'Battery (9 V)', job: 'Pushes current around whatever loop you build.', symbol: 'battery' });
  stage.label('9 V', bat.group, new THREE.Vector3(0.1, 2.1, 0), 'big');
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
  const bulbs = [0, 1].map((i) => {
    const b = bulb();
    stage.real.add(b.group);
    stage.part(b.group, {
      name: `Bulb ${i + 1}`,
      job: 'A resistor that glows: the more power it gets, the brighter it shines. Drag it out of its socket, or use the buttons.',
      symbol: 'bulb',
      actions: () => [{ label: inSocket[i] ? 'Take it out' : 'Put it back', run: () => setIn(i, !inSocket[i]) }],
    });
    return b;
  });
  const rLabels = [0, 1].map((i) => stage.label('', bulbs[i].group, new THREE.Vector3(0, 1.45, 0)));
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
  stage.part(pm.group, { name: 'Pump (= battery)', job: 'Sets the pressure.', symbol: 'pump' });
  for (const n of nar) stage.part(n.group, { name: 'Narrow pipe (= bulb)', job: 'Each narrowing resists the flow, like a bulb.', symbol: 'pipe' });
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
  const sockRow = h('div', { class: 'btnrow' });
  const sockBtns = [0, 1].map((i) => {
    const b = h('button', { class: 'btn', type: 'button', onclick: () => setIn(i, !inSocket[i]) }, '') as HTMLButtonElement;
    sockRow.append(b);
    return b;
  });
  panel.custom(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Bulbs (or drag them in 3D)'), sockRow));
  [0, 1].forEach((i) =>
    panel.select(`Bulb ${i + 1} resistance`, VALUES.map((v) => ({ value: String(v), label: fmt(v, 'Ω') })), String(R[i]), (v) => {
      R[i] = Number(v);
      solve();
    }),
  );
  const roT = panel.readout('Total resistance');
  const roI = panel.readout('Battery current');
  const roB = [panel.readout('Bulb 1'), panel.readout('Bulb 2')];

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
      sockBtns[i].textContent = inSocket[i] ? `Take bulb ${i + 1} out` : `Put bulb ${i + 1} back`;
      for (const k of ['series', 'parallel'] as Mode[]) plugs[k][i].visible = k === mode && !inSocket[i];
    }
  }

  let I = [0, 0];
  let total = Infinity;
  function solve() {
    const r = R.map((v, i) => (inSocket[i] ? v : Infinity));
    if (mode === 'series') {
      total = r[0] + r[1];
      const i = isFinite(total) ? V / total : 0;
      I = [i, i];
    } else {
      const g = r.reduce((a, v) => a + (isFinite(v) ? 1 / v : 0), 0);
      total = g > 0 ? 1 / g : Infinity;
      I = r.map((v) => (isFinite(v) ? V / v : 0));
    }
    const Pw = I.map((i, k) => i * i * R[k]);
    const iBat = mode === 'series' ? I[0] : I[0] + I[1];
    bulbs.forEach((b, k) => b.setLight(inSocket[k] ? Math.min(1.3, Pw[k] / 0.12) : 0));
    rLabels.forEach((l, k) => l.set(inSocket[k] ? `${fmt(R[k], 'Ω')} · ${fmt(I[k], 'A')}` : 'out'));
    roT.set(isFinite(total) ? fmt(total, 'Ω') : 'open (∞)');
    roI.set(fmt(iBat, 'A'));
    roB.forEach((ro, k) => ro.set(inSocket[k] ? `${(I[k] * R[k]).toFixed(1)} V, ${fmt(I[k], 'A')}` : 'out of socket', inSocket[k] && I[k] > 0 ? 'good' : 'warn'));
    const s = (i: number) => currentToSpeed(i, 0.006, 6);
    for (const [k, f] of Object.entries(flows)) f.mesh.visible = mode === 'series' ? k === 'series' : k !== 'series';
    for (const [k, f] of Object.entries(wflows)) f.mesh.visible = mode === 'series' ? k === 'series' : k !== 'series';
    flows.series.speed = wflows.series.speed = s(I[0]);
    flows.rightRail.speed = flows.leftRail.speed = wflows.rightRail.speed = wflows.leftRail.speed = s(iBat);
    flows.rung1.speed = wflows.rung1.speed = s(I[0]);
    flows.rung2.speed = wflows.rung2.speed = s(I[1]);
    nar.forEach((n, k) => n.setNarrow(0.25 + (Math.log(R[k % 2] / 220) / Math.log(1000 / 220)) * 0.6));
  }

  stage.onUpdate((dt) => {
    for (const f of Object.values(flows)) f.update(dt);
    for (const f of Object.values(wflows)) f.update(dt);
    pm.spin(dt, flows.rightRail.speed + flows.series.speed);
  });

  void M;
  setMode('series');
  stage.enableWater(1.6);
  stage.frame({ dir: new THREE.Vector3(0, 1.5, 1), animate: false });

  return {
    check(task) {
      if (task !== 'oneBulbParallel') return { ok: false };
      const out = inSocket.filter((v) => !v).length;
      if (out !== 1) return { ok: false, msg: out === 0 ? 'Both bulbs are still in their sockets. Take one out.' : 'Both bulbs are out.' };
      const lit = I.some((i, k) => inSocket[k] && i > 0.001);
      if (!lit) return { ok: false, msg: 'The remaining bulb went dark. In this layout, removing one breaks the only loop.' };
      return { ok: true };
    },
  };
}
