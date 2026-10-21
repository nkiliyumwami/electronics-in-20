import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { nightLight, LAYER_INFO, PART_INFO, STRIP_AMPS, T, type LayerName } from '../../three/pcb';
import { contactShadow, mesh, std, setHeatMap } from '../../three/lib';
import { Flow } from '../../three/particles';
import { Exploder } from '../../tools/explode';
import { traceRise } from '../../sim/physics';
import { dense, FLOW_COLOR, WATER_FLOW } from '../kit';
import { h } from '../../core/dom';

const START_W = 0.4;
const BURN_RISE = 120;
// Ground-plane slot under the GATE trace, and the return paths (board mm).
const SLOT = { x: 28, y: 10, w: 1.2, h: 19.5 };
const SIG: [number, number][] = [[22.7, 19.91], [32, 19.91], [36, 15.1], [39.05, 15.1]];
const RET_DIRECT: [number, number][] = [[42.3, 16.4], [39.05, 15.1], [36, 15.1], [32, 19.91], [22.7, 19.91], [16.2, 21.2]];
const RET_DETOUR: [number, number][] = [[42.3, 16.4], [39.05, 15.1], [36, 15.1], [32, 19.91], [29.8, 19.91], [29.8, 9.2], [27.4, 9.2], [27.4, 19.91], [22.7, 19.91], [16.2, 21.2]];

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let width = START_W;
  let slot = false;
  let over = 0;
  let burnt = false;
  let viaTapped = false;
  const beats = ['Explode', 'Via', 'Trace width', 'Ground slot'];
  let beat = 0;

  // ---- the board (real view)
  const nl = nightLight({ powerWidth: width });
  const b = nl.board;
  const holder = new THREE.Group();
  holder.add(b.group);
  holder.scale.setScalar(1.6);
  stage.real.add(holder, contactShadow(11, 8));
  const L = b.layers;
  // A thinner, see-through mask here, so the trace's heat colours show through.
  const maskMesh = L.maskTop.children[0] as THREE.Mesh;
  const thinMask = (maskMesh.material as THREE.MeshStandardMaterial).clone();
  thinMask.opacity = 0.55;
  maskMesh.material = thinMask;
  for (const k of Object.keys(L) as LayerName[]) stage.part(L[k], { name: LAYER_INFO[k].name, job: LAYER_INFO[k].job, symbol: k === 'cuBot' ? 'plane' : k === 'core' ? 'pcb' : k.startsWith('cu') ? 'trace' : 'pcb' });
  for (const [ref, obj] of Object.entries(nl.parts)) stage.part(obj, { name: PART_INFO[ref].name, job: PART_INFO[ref].job, symbol: PART_INFO[ref].symbol });
  // Parts ride above the silkscreen when exploded.
  const partsGroup = new THREE.Group();
  for (const p of Object.values(nl.parts)) partsGroup.add(p);
  b.group.add(partsGroup);
  for (const t of nl.power) stage.part(t.group, { name: 'Power trace (3 A to the LED strip)', job: 'Carries the LED strip current. Too thin and it heats up like a fuse wire.', symbol: 'trace' });

  // Exploded "staircase": each layer up and back, so every layer stays visible.
  const order: LayerName[] = ['maskBot', 'cuBot', 'core', 'cuTop', 'maskTop', 'silkTop'];
  const ex = new Exploder(stage, [
    ...order.map((k, i) => ({ obj: L[k], offset: new THREE.Vector3(0, (i - 1.5) * 0.42, -(i - 1.5) * 0.55) })),
    { obj: partsGroup, offset: new THREE.Vector3(0, 6 * 0.42 - 0.2, -6 * 0.55 + 0.5) },
  ]);
  const layerLabels = order.map((k) => stage.label(LAYER_INFO[k].name, L[k], b.at(50.5, 2, 0.05), ''));
  layerLabels.forEach((l) => l.show(false));

  // Via to highlight (Q1's ground via): a pulsing marker; tap to light the barrel.
  const via = nl.vias.Q1;
  const viaMarker = mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 24), new THREE.MeshBasicMaterial({ color: '#ffb000' }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
  viaMarker.position.copy(b.at(via.x, via.y, T.mask + T.cu + T.core + T.cu + T.mask + 0.02));
  L.silkTop.add(viaMarker);
  const viaHit = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 12), new THREE.MeshBasicMaterial({ visible: false }), [0, 0, 0]);
  viaHit.position.copy(b.at(via.x, via.y, 0.1));
  b.group.add(viaHit);
  const viaLabel = stage.label('via: a plated hole joining top and bottom copper', L.cuTop, b.at(via.x, via.y - 3, 0.3), 'warn');
  viaLabel.show(false);
  const tapVia = () => {
    viaTapped = true;
    viaLabel.show(true);
    const m = via.barrel.material as THREE.MeshStandardMaterial;
    m.emissive.set('#ff8a00');
    m.emissiveIntensity = 1.5;
    if (ex.value < 0.5) ex.animateTo(1);
    stage.focus(viaHit, 4.5);
    if (beat < 2) setBeat(2);
  };
  stage.onTap(viaHit, tapVia);

  // Return-current particles on the bottom copper; signal particles on top.
  const mm = (pts: [number, number][], y: number) => pts.map(([x, z]) => b.at(x, z, y));
  const yTop = T.mask + T.cu + T.core + T.cu + 0.01;
  const yBot = T.mask - 0.01; // just under the plane, visible from below / when exploded
  const yBotTop = T.mask + T.cu + 0.005; // on top of the plane
  const sigFlow = new Flow(new THREE.CatmullRomCurve3(dense(mm(SIG, yTop), 0.05), false, 'catmullrom', 0.01), { color: FLOW_COLOR, spacing: 0.12, radius: 0.025, closed: false });
  L.cuTop.add(sigFlow.mesh);
  const retFlow = new Flow(new THREE.CatmullRomCurve3(dense(mm(RET_DIRECT, yBotTop), 0.05), false, 'catmullrom', 0.01), { color: '#5fb4ff', spacing: 0.12, radius: 0.025, closed: false });
  L.cuBot.add(retFlow.mesh);
  void yBot;
  sigFlow.speed = 0.6;
  retFlow.speed = 0.6;
  // Loop area (between signal and return) and radiating rings.
  const loopMat = new THREE.MeshBasicMaterial({ color: '#e03131', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const loopShape = new THREE.Shape(RET_DETOUR.slice(3, 9).map(([x, y]) => new THREE.Vector2((x - b.w / 2) * 0.1, (y - b.h / 2) * 0.1)));
  const loopMesh = new THREE.Mesh(new THREE.ShapeGeometry(loopShape), loopMat);
  loopMesh.rotation.x = Math.PI / 2;
  loopMesh.position.y = yBotTop + 0.004;
  loopMesh.visible = false;
  L.cuBot.add(loopMesh);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.01, 6, 48), new THREE.MeshBasicMaterial({ color: '#e03131', transparent: true, opacity: 0.6 }));
    r.rotation.x = Math.PI / 2;
    r.position.copy(b.at(28.6, 14.5, yBotTop + 0.01));
    r.visible = false;
    L.cuBot.add(r);
    rings.push(r);
  }
  const slotLabel = stage.label('', L.cuBot, b.at(28.6, 27, 0.05), 'bad');
  slotLabel.show(false);
  const tempLabel = stage.label('', L.cuTop, b.at(25, 3.6, 0.1), 'big');

  // ---- water view: a three-storey building
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(9, 7));
  const W = 5.2, D = 3.2;
  const floor = (y: number, color: string, opacity: number) => {
    const m = mesh(new THREE.BoxGeometry(W, 0.06, D), std(color, 0.7, 0, { transparent: true, opacity }), [0, y, 0]);
    wg.add(m);
    return m;
  };
  floor(0.0, '#9fb8cc', 0.9);
  floor(0.9, '#cdbf86', 0.55);
  floor(1.8, '#e5e7ea', 0.4);
  const river = mesh(new THREE.BoxGeometry(W - 0.3, 0.04, D - 0.3), std('#3c8fe0', 0.2, 0, { transparent: true, opacity: 0.45 }), [0, 0.06, 0]);
  wg.add(river);
  stage.part(river, { name: 'River on the ground floor (= ground plane)', job: 'A wide, shallow river: all the water flows back home through it, right under the pipe that sent it.', symbol: 'plane' });
  const dam = mesh(new THREE.BoxGeometry(0.12, 0.35, D - 0.9), std('#c0281f', 0.5), [0.3, 0.2, 0.25]);
  dam.visible = false;
  wg.add(dam);
  stage.part(dam, { name: 'Dam (= slot in the ground plane)', job: 'Forces the returning water to detour around it.', symbol: 'plane' });
  const wPipeMat = std('#a9c9ea', 0.2, 0, { transparent: true, opacity: 0.8 });
  const wPower = mesh(new THREE.BoxGeometry(W - 0.6, 0.08, 0.1), wPipeMat, [0, 1.9, -1.0]);
  wg.add(wPower);
  stage.part(wPower, { name: 'Main pipe on the top floor (= power trace)', job: 'A narrow pipe carrying a big flow heats up from friction. Widen it to keep it cool.', symbol: 'pipe' });
  const vpipe = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 12), std('#a9c9ea', 0.2, 0, { transparent: true, opacity: 0.8 }), [1.9, 0.95, 0.3]);
  wg.add(vpipe);
  stage.part(vpipe, { name: 'Vertical pipe (= via)', job: 'Joins the top floor to the ground floor.', symbol: 'via' });
  const wsig = new Flow(new THREE.CatmullRomCurve3(dense([new THREE.Vector3(-1.4, 1.9, 0.3), new THREE.Vector3(1.9, 1.9, 0.3), new THREE.Vector3(1.9, 0.1, 0.3)]), false), { color: WATER_FLOW, spacing: 0.15, radius: 0.04, closed: false });
  const directPath = [new THREE.Vector3(1.9, 0.1, 0.3), new THREE.Vector3(-1.4, 0.1, 0.3)];
  const detourPath = [new THREE.Vector3(1.9, 0.1, 0.3), new THREE.Vector3(0.6, 0.1, 0.3), new THREE.Vector3(0.6, 0.1, -1.3), new THREE.Vector3(0, 0.1, -1.3), new THREE.Vector3(0, 0.1, 0.3), new THREE.Vector3(-1.4, 0.1, 0.3)];
  const wret = new Flow(new THREE.CatmullRomCurve3(dense(directPath), false), { color: '#5fb4ff', spacing: 0.15, radius: 0.04, closed: false });
  wg.add(wsig.mesh, wret.mesh);
  wsig.speed = 0.6;
  wret.speed = 0.6;
  const wl = stage.label('', wg, new THREE.Vector3(0, 2.4, 0), 'big water');

  // ---- controls
  const steps = h('div', { class: 'steps', 'aria-label': 'Lesson steps' });
  panel.custom(steps);
  const exRow = ex.controls(panel, 'Explode the board');
  const layerRow = h('div', { class: 'btnrow' });
  for (const k of order.slice().reverse()) {
    layerRow.append(h('button', { class: 'btn small', type: 'button', onclick: () => isolate(k) }, LAYER_INFO[k].name.split(':')[0]));
  }
  layerRow.append(h('button', { class: 'btn small', type: 'button', onclick: () => isolate(null) }, 'Show all'));
  panel.custom(h('div', { class: 'ctl' }, h('span', { class: 'lab' }, 'Show one layer'), layerRow));
  panel.button('Show me the via', tapVia, 'btn', exRow);
  const wS = panel.slider({ label: `Power trace width (${STRIP_AMPS} A)`, min: 0.2, max: 1.6, step: 0.05, value: width, nudge: true, format: (v) => `${v.toFixed(2)} mm`, onInput: (v) => setWidth(v) });
  const roRise = panel.readout('Temperature rise (IPC-2221, 1 oz outer)');
  const slotBtn = panel.toggle('Cut a slot in the ground plane', slot, (v) => setSlot(v));
  const roLoop = panel.readout('Return current');

  function setBeat(i: number) {
    beat = Math.max(beat, i);
    steps.innerHTML = '';
    beats.forEach((s, k) => steps.append(h('span', { class: `st ${k < beat ? 'done' : k === beat ? 'cur' : ''}` }, `${k + 1}. ${s}`)));
  }
  let reframe = 0;
  ex.onChange = (f) => {
    layerLabels.forEach((l) => l.show(f > 0.6));
    if (f > 0.6 && beat < 1) setBeat(1);
    // Re-frame once the stack stops moving, so nothing is cut off.
    clearTimeout(reframe);
    reframe = window.setTimeout(() => stage.frame({ animate: true }), 350);
  };
  function isolate(k: LayerName | null) {
    for (const key of order) L[key].visible = k === null || key === k;
    partsGroup.visible = k === null;
    if (k && ex.value < 0.5) ex.animateTo(1);
  }
  function setWidth(v: number) {
    width = v;
    for (const t of nl.power) t.setWidth(v);
    wPower.scale.z = v / 0.4;
    if (beat < 3 && beat >= 2) setBeat(3);
    update();
  }
  function setSlot(v: boolean) {
    slot = v;
    b.setSlots(v ? [SLOT] : []);
    retFlow.setPath(new THREE.CatmullRomCurve3(dense(mm(v ? RET_DETOUR : RET_DIRECT, yBotTop), 0.05), false, 'catmullrom', 0.01));
    loopMesh.visible = v;
    rings.forEach((r) => (r.visible = v));
    slotLabel.show(v);
    slotLabel.set('slot: the return current detours, and the loop radiates');
    dam.visible = v;
    wret.setPath(new THREE.CatmullRomCurve3(dense(v ? detourPath : directPath), false));
    roLoop.set(v ? 'detours around the slot: big loop!' : 'flows right under the signal', v ? 'bad' : 'good');
    if (v && ex.value < 0.5) ex.animateTo(1);
    update();
  }
  function rise() {
    return traceRise(width, STRIP_AMPS);
  }
  function update() {
    const r = rise();
    roRise.set(`+${r.toFixed(0)} °C`, r > 20 ? (r > 60 ? 'bad' : 'warn') : 'good');
    tempLabel.set(burnt ? 'trace burnt!' : `power trace: +${r.toFixed(0)} °C at ${STRIP_AMPS} A`, burnt || r > 60 ? 'bad' : r > 20 ? 'warn' : 'good');
    if (!burnt) for (const t of nl.power) setHeatMap(t.material, Math.min(1, r / 80));
    setHeatMap(wPipeMat, Math.min(1, r / 80));
    wl.set(slot ? 'dam: the return flow detours' : `top pipe: +${r.toFixed(0)} °C`, slot || r > 20 ? 'bad' : 'water');
  }

  stage.onUpdate((dt, t) => {
    sigFlow.update(dt);
    retFlow.update(dt);
    wsig.update(dt);
    wret.update(dt);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    viaMarker.scale.setScalar(1 + pulse * 0.4);
    (viaMarker.material as THREE.MeshBasicMaterial).opacity = viaTapped ? 0 : 1;
    rings.forEach((r, i) => {
      const k = ((t * 0.6 + i / 3) % 1);
      r.scale.setScalar(1 + k * 6);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
    });
    if (burnt) return;
    const r = rise();
    if (r > BURN_RISE) {
      over += dt;
      if (over > 2.5) burn();
    } else over = 0;
  });

  function burn() {
    burnt = true;
    for (const t of nl.power) {
      t.material.color.set('#2b2420');
      t.material.emissive.set('#000');
    }
    const p = holder.localToWorld(b.at(30, 6, 0.4));
    fx.smoke(stage.real.worldToLocal(p), 3, 16, true);
    fx.flash(stage.real.worldToLocal(p.clone()), '#ffb070', 2);
    update();
    ctx.fail({
      title: 'What happened? The trace burned.',
      text: `At ${width.toFixed(2)} mm, ${STRIP_AMPS} A heats the copper by about ${rise().toFixed(0)} °C. The thin copper got so hot that it lifted off the board and burned through, just like a fuse wire. Power traces need width.`,
      undo: () => {
        burnt = false;
        over = 0;
        fx.clear();
        wS.set(0.9);
        setWidth(0.9);
      },
      undoLabel: 'Undo (new board, 0.9 mm trace)',
    });
  }

  void slotBtn;
  setBeat(0);
  update();
  stage.focusObjects = [holder];
  stage.enableWater(2.2);
  stage.frame({ dir: new THREE.Vector3(0.25, 1.1, 1), animate: false });

  return {
    check(task) {
      if (task !== 'traceCool') return { ok: false };
      if (burnt) return { ok: false, msg: 'The trace has burned. Tap Undo first.' };
      const r = rise();
      if (r <= 20) return { ok: true };
      return { ok: false, msg: `At ${width.toFixed(2)} mm the trace runs at +${r.toFixed(0)} °C.` };
    },
  };
}
