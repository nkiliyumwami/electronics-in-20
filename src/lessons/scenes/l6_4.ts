import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { contactShadow, mesh, std, smallBoard, M, setHeat, wire, marking } from '../../three/lib';
import { pipe, tank } from '../../three/water';
import { prepCanvas, cssVar } from '../../core/panel';
import { dense, flowAlong, FLOW_COLOR, WATER_FLOW } from '../kit';
import { currentToSpeed } from '../../three/particles';

type Reg = 'ldo' | 'buck';
const VOUT = 5;
const LDO_DROPOUT = 0.3;
const LDO_THETA = 50; // °C/W, TO-220 without heatsink
const BUCK_THETA = 60;
const BUCK_EFF = 0.9;
const SHUTDOWN = 150;

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel, fx } = ctx;
  let reg: Reg = 'ldo';
  let vin = 12;
  let iLoad = 0.5;
  let temp = 25;
  let shutdown = false;
  let smoking: (() => void) | null = null;

  // ---- real view: 12 V solar battery → regulator → 5 V grow light (Plant Buddy outdoors)
  const base = smallBoard(7, 3.2);
  stage.real.add(base, contactShadow(11, 7));
  const adapter = new THREE.Group();
  adapter.position.set(-4.6, -0.5, 0);
  adapter.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 1.2), std('#1c1d1f', 0.6), [0, 0.5, 0]));
  const solar = mesh(new THREE.BoxGeometry(1.5, 0.05, 1.0), std('#1d3b6e', 0.3, 0.3), [0, 1.35, -0.2], [-0.5, 0, 0]);
  adapter.add(solar);
  stage.real.add(adapter);
  stage.part(adapter, { name: '12 V solar battery', job: 'A garden solar panel charges this 12 V battery. Its voltage is adjustable here.', symbol: 'supply' });
  const inLabel = stage.label('', adapter, new THREE.Vector3(0, 1.4, 0), 'big');
  // LDO in TO-220.
  const ldo = new THREE.Group();
  ldo.position.set(-0.6, 0, 0);
  const ldoMat = M.plasticBlack().clone();
  ldo.add(mesh(new THREE.BoxGeometry(1.0, 0.9, 0.45), ldoMat, [0, 0.9, 0]));
  ldo.add(mesh(new THREE.BoxGeometry(1.0, 0.65, 0.12), M.steel(), [0, 1.65, -0.17]));
  for (let i = -1; i <= 1; i++) ldo.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.04), M.tin(), [i * 0.254, 0.25, 0]));
  const ldoText = marking(0.85, 0.45, ['LM1117T', '-5.0']);
  ldoText.rotation.set(0, 0, 0);
  ldoText.position.set(0, 0.9, 0.227);
  ldo.add(ldoText);
  stage.real.add(ldo);
  stage.part(ldo, { name: 'Linear regulator (LDO)', job: 'Throttles the input down to 5 V, burning the extra voltage as heat.', symbol: 'regulator' });
  // Buck module.
  const buck = new THREE.Group();
  buck.position.set(-0.6, 0, 0);
  const buckMat = std('#1d4f91', 0.5);
  buck.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 1.2), buckMat, [0, 0.05, 0]));
  const coil = mesh(new THREE.TorusGeometry(0.28, 0.12, 12, 24), std('#5a5a5a', 0.4, 0.5), [-0.35, 0.22, 0], [Math.PI / 2, 0, 0]);
  buck.add(coil, mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), M.plasticDark(), [0.35, 0.14, -0.2]));
  const buckText = marking(0.26, 0.12, ['MP1584']);
  buckText.position.set(0.35, 0.181, -0.2);
  buck.add(buckText);
  for (const x of [0.35, 0.65]) buck.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 16), M.capBlue(), [x, 0.27, 0.3]));
  stage.real.add(buck);
  stage.part(buck, { name: 'Switching regulator (buck)', job: 'Switches fully on and off very fast and smooths the result with an inductor (the coil) and capacitors. About 90% efficient.', symbol: 'regulator' });
  const tLabel = stage.label('', stage.real, new THREE.Vector3(-0.6, 2.4, 0), 'big');
  // Load: a 5 V LED panel.
  const panelG = new THREE.Group();
  panelG.position.set(2.6, 0, 0);
  panelG.add(mesh(new THREE.BoxGeometry(2.0, 0.12, 2.0), std('#e8e8e2', 0.6), [0, 0.06, 0]));
  const cells: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const m = std('#fffbe8', 0.3, 0, { emissive: new THREE.Color('#fff2c0'), emissiveIntensity: 0 });
      cells.push(m);
      panelG.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), m, [-0.66 + i * 0.44, 0.15, -0.66 + j * 0.44]));
    }
  stage.real.add(panelG);
  stage.part(panelG, { name: '5 V grow light (the load)', job: 'Plant Buddy\'s grow light: needs a steady 5 V and draws the current you set.', symbol: 'led' });
  const outLabel = stage.label('', panelG, new THREE.Vector3(0, 0.9, 0), 'big');
  const wIn = wire([new THREE.Vector3(-3.8, 0.2, 0), new THREE.Vector3(-1.6, 0.2, 0)], 'red');
  const wOut = wire([new THREE.Vector3(0.4, 0.2, 0), new THREE.Vector3(1.6, 0.2, 0)], 'red');
  stage.real.add(wIn.mesh, wOut.mesh);
  const flowIn = flowAlong(stage.real, dense([new THREE.Vector3(-3.8, 0.28, 0), new THREE.Vector3(-1.6, 0.28, 0)]), FLOW_COLOR, { closed: false });
  const flowOut = flowAlong(stage.real, dense([new THREE.Vector3(0.4, 0.28, 0), new THREE.Vector3(1.6, 0.28, 0)]), FLOW_COLOR, { closed: false });

  // ---- water view: high tank → regulator valve → low tank → outflow
  const wg = new THREE.Group();
  stage.water.add(wg);
  wg.add(contactShadow(7, 5));
  const hi = tank(2.4, 0.6);
  hi.setLevel(0.9);
  hi.group.position.set(-2.4, -0.3, 0);
  const lo = tank(1.0, 0.6);
  lo.group.position.set(1.6, -0.3, 0);
  wg.add(hi.group, lo.group);
  wg.add(pipe([new THREE.Vector3(-1.8, 0.0, 0), new THREE.Vector3(1.0, 0.0, 0)], 0.11).mesh);
  const valve = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), std('#b87333', 0.35, 0.7), [-0.4, 0.0, 0]);
  const valveMat = valve.material as THREE.MeshStandardMaterial;
  wg.add(valve);
  stage.part(valve, { name: 'Valve (= regulator)', job: 'LDO: a valve throttling high pressure down, turning the difference into heat. Buck: a valve snapping fully open and shut, very fast.', symbol: 'valve' });
  stage.part(hi.group, { name: 'High tank (= 12 V battery)', job: 'High pressure in.', symbol: 'tank' });
  stage.part(lo.group, { name: 'Low tank (= 5 V output)', job: 'The steady lower pressure the load needs.', symbol: 'tank' });
  const wflow = flowAlong(wg, [new THREE.Vector3(-1.8, 0.0, 0), new THREE.Vector3(1.0, 0.0, 0)], WATER_FLOW, { closed: false, radius: 0.06 });
  const wl = stage.label('', valve, new THREE.Vector3(0, 0.75, 0), 'big water');

  // ---- controls
  panel.segmented('Regulator', [{ value: 'ldo', label: 'Linear (LDO)' }, { value: 'buck', label: 'Switching (buck)' }], reg, (v) => setReg(v as Reg));
  panel.slider({ label: 'Battery voltage', min: 5, max: 15, step: 0.1, value: vin, nudge: true, format: (v) => `${v.toFixed(1)} V`, onInput: (v) => { vin = v; } });
  panel.slider({ label: 'Load current', min: 0, max: 1, step: 0.01, value: iLoad, nudge: true, format: (v) => `${(v * 1000).toFixed(0)} mA`, onInput: (v) => { iLoad = v; } });
  const formula = panel.formula('Live formula');
  const scope = panel.chart('Output voltage, zoomed in (a few microseconds)', 110);
  const roOut = panel.readout('Output');
  const roHeat = panel.readout('Heat in regulator');
  const roTemp = panel.readout('Regulator temperature');
  const roEff = panel.readout('Efficiency');

  function setReg(r: Reg) {
    reg = r;
    ldo.visible = r === 'ldo';
    buck.visible = r === 'buck';
    temp = 25;
    shutdown = false;
    smoking?.();
    smoking = null;
    fx.clear();
    ctx.clearFail();
  }

  const state = () => {
    let vout: number;
    let heat: number;
    if (reg === 'ldo') {
      vout = shutdown ? 0 : Math.min(VOUT, Math.max(0, vin - LDO_DROPOUT));
      heat = shutdown ? 0 : (vin - vout) * iLoad;
    } else {
      vout = vin > VOUT + 0.5 ? VOUT : Math.max(0, vin - 0.5);
      heat = vout * iLoad * (1 / BUCK_EFF - 1);
    }
    const pout = vout * iLoad;
    return { vout, heat, pout, eff: pout + heat > 0 ? pout / (pout + heat) : 0, theta: reg === 'ldo' ? LDO_THETA : BUCK_THETA };
  };

  let t = 0;
  stage.onUpdate((dt) => {
    t += dt;
    const s = state();
    const target = 25 + s.heat * s.theta;
    temp += (target - temp) * Math.min(1, dt / 2.0);
    if (reg === 'ldo' && !shutdown && temp > SHUTDOWN) thermalShutdown(s.heat);
    if (reg === 'ldo' && shutdown && temp < 90) shutdown = false; // it recovers once cool
    const mat = reg === 'ldo' ? ldoMat : buckMat;
    setHeat(mat, (temp - 60) / 140);
    if (temp > 120 && !smoking) smoking = fx.smoke(new THREE.Vector3(-0.6, 1.5, 0), Infinity, 5);
    if (temp < 110 && smoking) {
      smoking();
      smoking = null;
    }
    formula.set(
      reg === 'ldo'
        ? `Heat = (V<sub>in</sub> − V<sub>out</sub>) × I = (${vin.toFixed(1)} − ${s.vout.toFixed(1)}) V × ${iLoad.toFixed(2)} A = <b>${s.heat.toFixed(2)} W</b>`
        : `Buck: about ${Math.round(BUCK_EFF * 100)}% efficient, so heat ≈ <b>${s.heat.toFixed(2)} W</b> (the formula above is for linear regulators)`,
    );
    roOut.set(`${s.vout.toFixed(2)} V`, s.vout < 4.8 ? 'bad' : 'good');
    roHeat.set(`${s.heat.toFixed(2)} W`, s.heat > 2 ? 'bad' : s.heat > 1 ? 'warn' : '');
    roTemp.set(`${temp.toFixed(0)} °C${shutdown ? ' (shut down)' : ''}`, temp > 100 ? 'bad' : temp > 60 ? 'warn' : '');
    roEff.set(`${Math.round(s.eff * 100)}%`);
    inLabel.set(`${vin.toFixed(1)} V in`);
    outLabel.set(`${s.vout.toFixed(2)} V · ${(iLoad * 1000).toFixed(0)} mA`, s.vout < 4.8 ? 'bad' : '');
    tLabel.set(`${temp.toFixed(0)} °C`, temp > 100 ? 'bad' : temp > 60 ? 'warn' : '');
    cells.forEach((m) => (m.emissiveIntensity = s.vout > 4.5 ? 0.5 + iLoad * 2.5 : 0));
    const iIn = s.vout > 0 ? (s.pout + s.heat) / vin : 0;
    flowIn.speed = currentToSpeed(iIn, 0.15, 6);
    flowOut.speed = currentToSpeed(s.vout > 0 ? iLoad : 0, 0.15, 6);
    flowIn.update(dt);
    flowOut.update(dt);
    // Water twin.
    wflow.speed = flowOut.speed;
    wflow.update(dt);
    lo.setLevel(s.vout / 12 + (reg === 'buck' ? Math.sin(t * 40) * 0.015 : 0));
    valve.scale.y = reg === 'buck' ? (Math.sin(t * 40) > 0 ? 1 : 0.6) : 1;
    setHeat(valveMat, (temp - 60) / 140);
    wl.set(reg === 'ldo' ? `throttling: ${s.heat.toFixed(1)} W of heat` : 'snapping open/shut: cool', s.heat > 1 ? 'bad' : 'water');
    drawScope(s.vout);
  });

  function drawScope(vout: number) {
    const { ctx: g, w, h } = prepCanvas(scope);
    const lo2 = 4.85, hi2 = 5.15;
    const Y = (v: number) => h - 14 - ((v - lo2) / (hi2 - lo2)) * (h - 24);
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('5.10 V', 2, Y(5.1) + 4);
    g.fillText('4.90 V', 2, Y(4.9) + 4);
    g.strokeStyle = cssVar('--line');
    g.beginPath();
    g.moveTo(44, Y(5.1));
    g.lineTo(w, Y(5.1));
    g.moveTo(44, Y(4.9));
    g.lineTo(w, Y(4.9));
    g.stroke();
    g.strokeStyle = cssVar('--flow');
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 44; x < w; x += 2) {
      const ripple = reg === 'buck' && vout > 4 ? 0.02 * (((x - 44 + t * 120) % 40) / 20 - 1) * Math.min(1, iLoad * 2 + 0.2) : 0;
      const v = Math.max(lo2, Math.min(hi2, vout + ripple));
      if (x === 44) g.moveTo(x, Y(v));
      else g.lineTo(x, Y(v));
    }
    g.stroke();
    g.fillStyle = cssVar('--ink-2');
    g.fillText(reg === 'buck' ? 'ripple ≈ 40 mV peak-to-peak' : vout < 4.85 ? 'output collapsed' : 'flat: linear regulators are quiet', w - 200, 12);
  }

  function thermalShutdown(heat: number) {
    shutdown = true;
    ctx.fail({
      title: 'What happened? Thermal shutdown.',
      text: `The LDO was burning ${heat.toFixed(1)} W and passed ${SHUTDOWN} °C, so its built-in protection switched the output off. It will try again once it cools, and shut down again. Lower the input voltage, reduce the current, or use the switcher.`,
      undo: () => setReg('buck'),
      undoLabel: 'Switch to the buck regulator',
    });
  }

  setReg('ldo');
  stage.enableWater(2);
  stage.frame({ dir: new THREE.Vector3(0, 1.2, 1), animate: false });

  return {
    check(task) {
      if (task !== 'cool5V') return { ok: false };
      const s = state();
      if (Math.abs(vin - 12) > 0.3) return { ok: false, msg: `The battery is at ${vin.toFixed(1)} V. The task is to start from 12 V.` };
      if (iLoad < 0.49) return { ok: false, msg: 'Set the load current to 500 mA.' };
      if (s.vout < 4.9) return { ok: false, msg: 'The output is not giving a proper 5 V.' };
      const steady = 25 + s.heat * s.theta;
      if (steady >= 100) return { ok: false, msg: `This setup heads for about ${steady.toFixed(0)} °C. Too hot.` };
      return { ok: true };
    },
  };
}
