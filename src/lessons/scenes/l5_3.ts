import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { contactShadow, mesh, std, smallBoard, M, chipPassive, qfp, headerPin } from '../../three/lib';
import { gauge, pipe, tank } from '../../three/water';
import { prepCanvas, cssVar } from '../../core/panel';
import { flowAlong, FLOW_COLOR, WATER_FLOW } from '../kit';

const PIN_X = 2.0; // chip VDD pin position
const SRC_X = -3.2; // supply connector
const MM = 0.1; // scene units per mm
const PERIOD = 1.2; // seconds between (slowed-down) current bursts
const RESET_DIP = 0.3;

/** Supply dip at the pin for a given cap distance (mm), or no cap. */
export function dipFor(capMm: number | null): number {
  if (capMm === null) return 0.6;
  return Math.min(0.6, 0.02 + 0.012 * capMm);
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let fitted = false;
  let distMm = 40;
  let resets = 0;
  let t = 0;
  const hist: number[] = [];

  // ---- real view
  const board = smallBoard(7.4, 2.8);
  stage.real.add(board, contactShadow(10, 6));
  stage.part(board, { name: 'Circuit board', job: 'The green mask covers a solid ground plane underneath everything.', symbol: 'pcb' });
  const conn = new THREE.Group();
  conn.position.set(SRC_X - 0.3, 0, 0);
  for (const z of [-0.13, 0.13]) {
    const hp = headerPin();
    hp.position.z = z;
    conn.add(hp);
  }
  stage.real.add(conn);
  stage.part(conn, { name: 'Power connector (3.3 V in)', job: 'Where the supply joins the board, 5 cm away from the chip.', symbol: 'connector' });
  const chip = qfp(1.0, 7);
  chip.group.position.set(PIN_X + 0.7, 0, 0);
  stage.real.add(chip.group);
  stage.part(chip.group, { name: 'Microcontroller', job: 'Gulps a burst of current on every clock tick. If its supply dips too far, it resets.', symbol: 'chip' });
  const trace = mesh(new THREE.BoxGeometry(PIN_X - SRC_X, 0.012, 0.08), M.copper().clone(), [(PIN_X + SRC_X) / 2, 0.006, 0]);
  stage.real.add(trace);
  stage.part(trace, { name: 'Power trace (5 cm)', job: 'A long, thin copper trace. Its inductance stops current from changing quickly.', symbol: 'trace' });
  const cap = chipPassive(0.16, 0.08, 'C');
  cap.scale.setScalar(2.5);
  const capGroup = new THREE.Group();
  capGroup.add(cap);
  cap.rotation.y = Math.PI / 2;
  // Ground via next to the cap.
  capGroup.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), M.tin(), [0, 0.01, 0.35]));
  stage.real.add(capGroup);
  stage.part(capGroup, { name: '100 nF decoupling capacitor', job: 'A tiny local tank of charge. Drag it along the trace: the closer to the pin, the better it works.', symbol: 'capacitor' });
  const resetLabel = stage.label('RESET!', chip.group, new THREE.Vector3(0, 0.9, 0), 'bad');
  resetLabel.show(false);
  const dLabel = stage.label('', capGroup, new THREE.Vector3(0, 0.6, 0));
  const supplyFlow = flowAlong(stage.real, [new THREE.Vector3(SRC_X, 0.05, 0), new THREE.Vector3(PIN_X, 0.05, 0)], FLOW_COLOR, { closed: false, radius: 0.035, spacing: 0.25 });
  const burstFlow = flowAlong(stage.real, [new THREE.Vector3(PIN_X - 0.5, 0.06, 0), new THREE.Vector3(PIN_X, 0.06, 0)], '#7fe0ff', { closed: false, radius: 0.04, spacing: 0.12 });

  stage.draggable(capGroup, {
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    onMove: (p) => setDist((PIN_X - p.x) / MM, true),
    onEnd: (p) => setDist((PIN_X - p.x) / MM, true),
  });

  // ---- water view: far tower, long pipe, local tank, faucet
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(9, 4));
  const tower = tank(2.4, 0.5);
  tower.setLevel(0.9);
  tower.group.position.set(-3.6, 0, 0);
  wg.add(tower.group);
  wg.add(pipe([new THREE.Vector3(-3.1, 0.3, 0), new THREE.Vector3(2.2, 0.3, 0)], 0.08).mesh);
  const local = tank(0.7, 0.25);
  local.setLevel(0.85);
  wg.add(local.group);
  const fg = gauge(0.3);
  fg.group.position.set(2.2, 1.2, 0);
  const faucet = mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), std('#b87333', 0.35, 0.7), [2.4, 0.3, 0]);
  wg.add(fg.group, faucet);
  stage.part(tower.group, { name: 'Water tower (= power supply)', job: 'Plenty of water, but far away down a long pipe.', symbol: 'tank' });
  stage.part(local.group, { name: 'Small local tank (= decoupling cap)', job: 'Supplies sudden demand instantly, then refills slowly.', symbol: 'tank' });
  stage.part(faucet, { name: 'Faucet that bursts open (= chip)', job: 'Suddenly wants a lot of water for an instant.', symbol: 'tap' });
  stage.part(fg.group, { name: 'Pressure at the faucet (= chip supply voltage)', job: 'Dips when the sudden demand cannot be met.', symbol: 'meter' });
  const wflow = flowAlong(wg, [new THREE.Vector3(-3.1, 0.3, 0), new THREE.Vector3(2.2, 0.3, 0)], WATER_FLOW, { closed: false, radius: 0.05 });

  // ---- controls
  const fitBtn = panel.toggle('Fit the 100 nF capacitor', fitted, (v) => { fitted = v; capGroup.visible = v; local.group.visible = v; });
  void fitBtn;
  const dS = panel.slider({ label: 'Capacitor distance from the power pin', min: 1, max: 50, step: 1, value: distMm, nudge: true, format: (v) => `${v.toFixed(0)} mm`, onInput: (v) => setDist(v, false) });
  const scope = panel.chart("Chip's supply voltage (bursts slowed right down)", 130);
  const roDip = panel.readout('Dip during a burst');
  const roR = panel.readout('Chip resets');

  function setDist(mm: number, syncSlider: boolean) {
    distMm = Math.round(Math.max(1, Math.min(50, mm)));
    capGroup.position.set(PIN_X - distMm * MM, 0, 0.25);
    local.group.position.set(2.2 - distMm * MM * 1.05, 0.0, 0.45);
    if (syncSlider) dS.set(distMm);
    dLabel.set(`${distMm} mm from pin`);
  }

  stage.onUpdate((dt) => {
    const prevPhase = t % PERIOD;
    t += dt;
    const phase = t % PERIOD;
    const dip = dipFor(fitted ? distMm : null);
    if (phase < prevPhase && dip > RESET_DIP) {
      resets++;
      resetLabel.show(true);
      setTimeout(() => resetLabel.show(false), 400);
    }
    const v = 3.3 - dip * Math.exp(-phase / 0.12) * (1 + 0.25 * Math.sin(phase * 60) * Math.exp(-phase / 0.05));
    hist.push(v);
    if (hist.length > 360) hist.shift();
    const bursting = phase < 0.25;
    supplyFlow.speed = bursting && (!fitted || dip > 0.15) ? 3 : 0.6;
    supplyFlow.update(dt);
    burstFlow.mesh.visible = fitted && bursting;
    burstFlow.setPath(new THREE.LineCurve3(new THREE.Vector3(PIN_X - distMm * MM, 0.06, 0.2), new THREE.Vector3(PIN_X, 0.06, 0)));
    burstFlow.speed = 4;
    burstFlow.update(dt);
    (chip.body.material as THREE.MeshStandardMaterial).emissive?.set(bursting ? '#331a00' : '#000000');
    wflow.speed = supplyFlow.speed;
    wflow.update(dt);
    fg.set((v - 2.5) / 1.0);
    faucet.scale.y = bursting ? 1.3 : 1;
    roDip.set(`${dip.toFixed(2)} V`, dip > RESET_DIP ? 'bad' : dip < 0.1 ? 'good' : 'warn');
    roR.set(String(resets), resets ? 'bad' : '');
    draw();
  });

  function draw() {
    const { ctx: g, w, h } = prepCanvas(scope);
    const Y = (v: number) => h - 12 - ((v - 2.6) / 0.85) * (h - 22);
    g.fillStyle = cssVar('--bad-soft');
    g.fillRect(40, Y(3.3 - RESET_DIP), w - 40, Y(2.6) - Y(3.3 - RESET_DIP));
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('3.3 V', 2, Y(3.3) + 4);
    g.fillText('reset', 2, Y(3.3 - RESET_DIP) + 12);
    g.strokeStyle = cssVar('--flow');
    g.lineWidth = 2;
    g.beginPath();
    hist.forEach((v, i) => {
      const x = 40 + (i / 359) * (w - 44);
      if (i) g.lineTo(x, Y(v));
      else g.moveTo(x, Y(v));
    });
    g.stroke();
  }

  setDist(distMm, true);
  capGroup.visible = false;
  local.group.visible = false;
  // Keep the same chip mesh material from being shared with other packages.
  chip.body.material = (chip.body.material as THREE.Material).clone();
  stage.enableWater(1.5);
  stage.hint(capGroup, 'Then drag me');
  stage.frame({ dir: new THREE.Vector3(0, 2.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'capClose') return { ok: false };
      if (!fitted) return { ok: false, msg: 'There is no capacitor on the board yet.' };
      const dip = dipFor(distMm);
      if (dip < 0.1) return { ok: true };
      return { ok: false, msg: `At ${distMm} mm the dip is still ${dip.toFixed(2)} V. Move it closer.` };
    },
  };
}
