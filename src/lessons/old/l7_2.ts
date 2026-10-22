import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { nightLight, PART_INFO, TOP } from '../../three/pcb';
import { contactShadow, mesh, std, M } from '../../three/lib';
import { prepCanvas, cssVar } from '../../core/panel';
import { h } from '../../core/dom';

const STAGES = ['Stencil', 'Solder paste', 'Pick and place', 'Reflow'];
const MELT = 217; // °C, lead-free solder

/** Reflow profile: time (s, on the real oven's clock) → °C. */
function profile(t: number): number {
  const pts: [number, number][] = [[0, 25], [90, 150], [180, 180], [215, 245], [235, 245], [300, 60]];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      return v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
    }
  }
  return 60;
}

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  let stageIdx = -1; // -1 = bare board
  let uneven = false;
  let ovenT = -1; // seconds on the oven clock, -1 = not running
  let tombstoned = false;
  let lastRun: { uneven: boolean; tombstones: number } | null = null;
  let auto = false;

  const nl = nightLight({ withParts: true });
  const b = nl.board;
  const holder = new THREE.Group();
  holder.scale.setScalar(1.6);
  holder.add(b.group);
  stage.real.add(holder, contactShadow(12, 9));
  stage.part(b.layers.maskTop, { name: 'Bare board', job: 'Fresh from the factory, waiting for parts.', symbol: 'pcb' });

  // Parts: remember their final pose; they start hidden above the board.
  const parts = Object.entries(nl.parts).map(([ref, obj]) => {
    stage.part(obj, { name: PART_INFO[ref].name, job: PART_INFO[ref].job, symbol: PART_INFO[ref].symbol });
    const smd = !['J1', 'J2'].includes(ref);
    return { ref, obj, home: obj.position.clone(), rot: obj.rotation.y, off: new THREE.Vector3((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.04), roff: (Math.random() - 0.5) * 0.25, smd };
  });

  // Stencil: a thin steel sheet with openings over SMD pads.
  const stencil = mesh(new THREE.BoxGeometry(5.4, 0.012, 3.4), std('#b8bcc2', 0.25, 0.9, { transparent: true, opacity: 0.85 }), [0, TOP + 0.01, 0]);
  b.group.add(stencil);
  stage.part(stencil, { name: 'Stencil', job: 'A thin steel sheet with a hole over each pad. Paste is wiped through it.', symbol: 'stencil' });
  const squeegee = mesh(new THREE.BoxGeometry(0.08, 0.3, 3.4), std('#6b6f75', 0.3, 0.6), [-2.8, TOP + 0.16, 0]);
  b.group.add(squeegee);
  // Paste blobs on every SMD pad (grey, matt; shiny once melted).
  const pasteMat = std('#9da1a6', 0.85, 0.3);
  const pastes: { m: THREE.Mesh; pad: string }[] = [];
  for (const p of b.pads) {
    if (p.drill) continue;
    const m = mesh(new THREE.BoxGeometry(p.w * 0.08, 0.012, p.h * 0.08), pasteMat, [0, 0, 0]);
    m.position.copy(b.at(p.x, p.y, TOP + 0.006));
    b.group.add(m);
    pastes.push({ m, pad: p.id });
  }
  stage.part(pastes[0].m, { name: 'Solder paste', job: 'Tiny solder balls in sticky flux. It holds parts in place, then melts in the oven.', symbol: 'stencil' });
  // Pick-and-place nozzle.
  const head = new THREE.Group();
  head.add(mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.6, 12), M.steel(), [0, 0.3, 0]));
  head.add(mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), std('#2e6fb8', 0.4), [0, 0.7, 0]));
  head.visible = false;
  b.group.add(head);
  stage.part(head, { name: 'Pick-and-place head', job: 'Sucks each part up with a vacuum nozzle and sets it on its paste, thousands per hour.', symbol: 'probe' });
  // Oven tunnel.
  const oven = new THREE.Group();
  oven.add(mesh(new THREE.BoxGeometry(7, 0.12, 4.2), std('#3a3d42', 0.5, 0.4), [0, 1.3, 0]));
  oven.add(mesh(new THREE.BoxGeometry(7, 1.3, 0.12), std('#3a3d42', 0.5, 0.4), [0, 0.65, -2.05]));
  const ovenGlow = new THREE.PointLight('#ff5a1f', 0, 8);
  ovenGlow.position.set(0, 1.0, 0);
  oven.add(ovenGlow);
  oven.visible = false;
  holder.add(oven);
  stage.part(oven, { name: 'Reflow oven', job: 'Heats the board along a set temperature curve so all the solder melts at once.', symbol: 'oven' });
  const label = stage.label('', holder, new THREE.Vector3(0, 1.8, 0), 'big');

  // ---- controls
  const steps = h('div', { class: 'steps' });
  panel.custom(steps);
  panel.segmented('Solder paste', [{ value: 'even', label: 'Even on both pads' }, { value: 'uneven', label: 'Uneven on C1' }], 'even', (v) => { uneven = v === 'uneven'; });
  const row = panel.row();
  panel.button('Next step →', () => advance(), 'btn primary', row);
  panel.button('Run the whole line', () => { reset(); auto = true; advance(); }, 'btn', row);
  panel.button('Start over', () => reset(), 'btn', row);
  const chart = panel.chart('Reflow temperature profile (lead-free solder melts at 217 °C)', 130);
  const roT = panel.readout('Oven temperature');
  const roR = panel.readout('Result');

  function setSteps() {
    steps.innerHTML = '';
    STAGES.forEach((s, k) => steps.append(h('span', { class: `st ${k < stageIdx ? 'done' : k === stageIdx ? 'cur' : ''}` }, `${k + 1}. ${s}`)));
  }

  function reset() {
    stageIdx = -1;
    ovenT = -1;
    tombstoned = false;
    auto = false;
    stencil.visible = false;
    squeegee.visible = false;
    head.visible = false;
    oven.visible = false;
    pasteMat.color.set('#9da1a6');
    pasteMat.roughness = 0.85;
    for (const p of pastes) {
      p.m.visible = false;
      p.m.scale.set(1, 1, 1);
    }
    for (const p of parts) {
      p.obj.visible = !p.smd; // through-hole connectors are fitted separately
      p.obj.position.copy(p.home);
      p.obj.rotation.set(0, p.rot, 0);
    }
    label.set('Bare board');
    roR.set('—');
    setSteps();
    anim = null;
  }

  type Anim = { t: number; dur: number; tick: (k: number) => void; done?: () => void };
  let anim: Anim | null = null;
  const play = (dur: number, tick: (k: number) => void, done?: () => void) => {
    anim = { t: 0, dur, tick, done };
  };

  function advance() {
    if (anim || ovenT >= 0) return;
    stageIdx++;
    setSteps();
    if (stageIdx === 0) {
      stencil.visible = true;
      label.set('1. Stencil laid on the board');
      play(0.8, (k) => (stencil.position.y = TOP + 0.01 + (1 - k) * 0.6), next);
    } else if (stageIdx === 1) {
      squeegee.visible = true;
      label.set('2. Paste wiped through the stencil');
      play(1.4, (k) => {
        squeegee.position.x = -2.8 + k * 5.6;
        for (const p of pastes) p.m.visible = p.m.position.x < squeegee.position.x;
      }, () => {
        squeegee.visible = false;
        stencil.visible = false;
        // Uneven paste: one C1 pad gets a big blob, the other almost none.
        for (const p of pastes) {
          if (p.pad === 'C1.1') p.m.scale.set(1, uneven ? 2.6 : 1, 1);
          if (p.pad === 'C1.2') p.m.scale.set(uneven ? 0.35 : 1, uneven ? 0.4 : 1, uneven ? 0.35 : 1);
        }
        next();
      });
    } else if (stageIdx === 2) {
      head.visible = true;
      label.set('3. Pick-and-place drops each part (a little crooked)');
      const smd = parts.filter((p) => p.smd);
      play(smd.length * 0.45, (k) => {
        const i = Math.min(smd.length - 1, Math.floor(k * smd.length));
        const local = k * smd.length - i;
        smd.forEach((p, j) => {
          if (j < i) {
            p.obj.visible = true;
            p.obj.position.copy(p.home).add(p.off);
            p.obj.rotation.y = p.rot + p.roff;
          }
        });
        const p = smd[i];
        p.obj.visible = true;
        const drop = Math.max(0, 1 - local * 1.6);
        p.obj.position.copy(p.home).add(p.off).setY(p.home.y + drop * 0.6);
        p.obj.rotation.y = p.rot + p.roff;
        head.position.set(p.home.x, p.home.y + drop * 0.6 + 0.05, p.home.z);
      }, () => {
        head.visible = false;
        next();
      });
    } else if (stageIdx === 3) {
      oven.visible = true;
      label.set('4. Reflow oven: warm, soak, melt, cool');
      ovenT = 0;
    } else {
      stageIdx = 3;
    }
  }
  const next = () => {
    if (auto) setTimeout(advance, 300);
  };

  stage.onUpdate((dt) => {
    if (anim) {
      anim.t += dt;
      const k = Math.min(1, anim.t / anim.dur);
      anim.tick(k);
      if (k >= 1) {
        const d = anim.done;
        anim = null;
        d?.();
      }
    }
    if (ovenT >= 0) {
      ovenT += dt * 50; // 300 s of oven in 6 s
      const T = profile(ovenT);
      roT.set(`${T.toFixed(0)} °C`, T > MELT ? 'warn' : '');
      ovenGlow.intensity = Math.max(0, (T - 100) / 40);
      if (T > MELT) {
        // Molten: paste goes shiny, parts snap to their pads (or tombstone).
        pasteMat.color.set('#d9dde1');
        pasteMat.roughness = 0.15;
        for (const p of parts.filter((x) => x.smd)) {
          p.obj.position.lerp(p.home, Math.min(1, dt * 6));
          p.obj.rotation.y += (p.rot - p.obj.rotation.y) * Math.min(1, dt * 6);
          if (p.ref === 'C1' && uneven) {
            tombstoned = true;
            p.obj.rotation.z = Math.min(1.35, p.obj.rotation.z + dt * 3);
            p.obj.position.x = p.home.x - 0.07 * Math.sin(p.obj.rotation.z);
            p.obj.position.y = p.home.y + 0.08 * Math.sin(p.obj.rotation.z);
          }
        }
      }
      if (ovenT >= 300) {
        ovenT = -1;
        oven.visible = false;
        ovenGlow.intensity = 0;
        lastRun = { uneven, tombstones: tombstoned ? 1 : 0 };
        auto = false;
        label.set(tombstoned ? 'Done: C1 is standing on its end (tombstone)!' : 'Done: every part soldered flat and centred', tombstoned ? 'bad' : 'good');
        roR.set(tombstoned ? '1 tombstone (C1)' : 'all parts flat ✓', tombstoned ? 'bad' : 'good');
        if (tombstoned) {
          ctx.fail({
            title: 'What happened? C1 tombstoned.',
            text: "One of C1's pads had a big blob of paste and the other almost none. When the solder melted, the big side pulled harder and stood the part up on its end. Now one end is not connected at all. Even paste on both pads prevents this.",
            undo: () => reset(),
            undoLabel: 'Start over',
          });
        }
      }
    }
    drawChart();
  });

  function drawChart() {
    const { ctx: g, w, h: hh } = prepCanvas(chart);
    const X = (t: number) => 34 + (t / 300) * (w - 44);
    const Y = (v: number) => hh - 16 - (v / 260) * (hh - 26);
    g.strokeStyle = cssVar('--bad');
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(34, Y(MELT));
    g.lineTo(w - 10, Y(MELT));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = cssVar('--ink-3');
    g.font = '11px system-ui';
    g.fillText('217 °C melt', w - 90, Y(MELT) - 4);
    g.fillText('250', 4, Y(250) + 4);
    g.fillText('0', 18, Y(0) + 4);
    g.strokeStyle = cssVar('--line');
    g.lineWidth = 2;
    g.beginPath();
    for (let t = 0; t <= 300; t += 5) (t ? g.lineTo(X(t), Y(profile(t))) : g.moveTo(X(t), Y(profile(t))));
    g.stroke();
    if (ovenT >= 0 || lastRun) {
      const end = ovenT >= 0 ? ovenT : 300;
      g.strokeStyle = cssVar('--flow');
      g.lineWidth = 3;
      g.beginPath();
      for (let t = 0; t <= end; t += 5) (t ? g.lineTo(X(t), Y(profile(t))) : g.moveTo(X(t), Y(profile(t))));
      g.stroke();
    }
  }

  reset();
  stage.frame({ dir: new THREE.Vector3(0, 1.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'noTombstone') return { ok: false };
      if (!lastRun) return { ok: false, msg: 'Run the line all the way through the oven first.' };
      if (lastRun.uneven) return { ok: false, msg: 'The last run used uneven paste. Choose even paste and run again.' };
      if (lastRun.tombstones) return { ok: false, msg: 'There was a tombstone in the last run.' };
      return { ok: true };
    },
  };
}
