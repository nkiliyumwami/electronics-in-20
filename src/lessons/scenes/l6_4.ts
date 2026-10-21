import * as THREE from 'three';
import type { SceneCtx, SceneHandle } from '../types';
import { nightLight, PART_INFO, disposeObject, TOP, type NightLight } from '../../three/pcb';
import { contactShadow, mesh } from '../../three/lib';
import { runDrc } from '../../sim/drc';
import { runErc } from '../../sim/erc';
import { nightlightErcPins } from '../../content/nightlight';
import { h, toast } from '../../core/dom';

interface State { badClearance: boolean; missing: string[]; noR1: boolean; c1Offset: boolean }
interface Issue { key: 'clearance' | 'unrouted' | 'c1' | 'erc'; tool: 'DRC' | 'ERC'; msg: string; x: number; y: number }

export default function scene(ctx: SceneCtx): SceneHandle {
  const { stage, panel } = ctx;
  const st: State = { badClearance: true, missing: ['LED_A'], noR1: true, c1Offset: true };
  let nl: NightLight;
  let lastDrc: Issue[] | null = null;
  let lastErc: Issue[] | null = null;
  let drcFresh = false;
  let ercFresh = false;
  const holder = new THREE.Group();
  holder.scale.setScalar(1.6);
  stage.real.add(holder, contactShadow(11, 8));
  const markers = new THREE.Group();
  const ratsnest = new THREE.Group();

  function build() {
    if (nl) {
      nl.board.group.remove(markers, ratsnest);
      holder.remove(nl.board.group);
      disposeObject(nl.board.group);
    }
    nl = nightLight({ badClearance: st.badClearance, missing: st.missing, noR1: st.noR1, c1Offset: st.c1Offset });
    holder.add(nl.board.group);
    nl.board.group.add(markers, ratsnest);
    for (const [ref, obj] of Object.entries(nl.parts)) stage.part(obj, { name: PART_INFO[ref].name, job: PART_INFO[ref].job, symbol: PART_INFO[ref].symbol });
    stage.part(nl.board.layers.maskTop, { name: 'Night-light board', job: 'Almost ready to order: but run the checks first.', symbol: 'pcb' });
    // Ratsnest for unrouted connections.
    for (const c of [...ratsnest.children]) ratsnest.remove(c);
    if (st.missing.includes('LED_A')) {
      const a = nl.board.at(28.95, 22, TOP + 0.03);
      const b = nl.board.at(32.05, 22, TOP + 0.03);
      ratsnest.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: '#ffd23a' })));
    }
  }

  // ---- checks
  function drc(): Issue[] {
    const out: Issue[] = [];
    for (const e of runDrc(nl.design)) out.push({ key: e.kind === 'clearance' ? 'clearance' : 'unrouted', tool: 'DRC', msg: e.msg, x: e.x, y: e.y });
    if (st.c1Offset) out.push({ key: 'c1', tool: 'DRC', msg: 'Placement: C1 is not sitting on its footprint (shifted about 1 mm and rotated). Its pads would be left half empty.', x: 25, y: 14.5 });
    return out;
  }
  function erc(): Issue[] {
    return runErc(nightlightErcPins({ noR1: st.noR1 })).map((e) => ({ key: 'erc' as const, tool: 'ERC' as const, msg: `${e.msg} (U1 pin 2, the button input: when the button is open, nothing holds it HIGH.)`, x: 17.3, y: 17.37 }));
  }
  const FIX_LABEL: Record<Issue['key'], string> = {
    clearance: 'Re-route the IND trace away from the via',
    unrouted: 'Route the LED_A connection',
    c1: 'Snap C1 onto its pads',
    erc: 'Add the 10 kΩ pull-up (R1) to the schematic',
  };
  function fix(k: Issue['key']) {
    if (k === 'clearance') st.badClearance = false;
    if (k === 'unrouted') st.missing = [];
    if (k === 'c1') st.c1Offset = false;
    if (k === 'erc') st.noR1 = false;
    build();
    // Results are now stale until the check is run again.
    if (k === 'erc') {
      lastErc = lastErc?.filter((i) => i.key !== k) ?? null;
      ercFresh = false;
    } else {
      lastDrc = lastDrc?.filter((i) => i.key !== k) ?? null;
      drcFresh = false;
    }
    render(`Fixed. Run ${k === 'erc' ? 'ERC' : 'DRC'} again to confirm.`);
  }

  // ---- controls
  const row = panel.row();
  panel.button('Run DRC (layout)', () => { lastDrc = drc(); drcFresh = true; render(); }, 'btn primary', row);
  panel.button('Run ERC (schematic)', () => { lastErc = erc(); ercFresh = true; render(); }, 'btn primary', row);
  const report = h('div', { class: 'ctl', 'aria-live': 'polite' });
  panel.custom(report);
  const roD = panel.readout('DRC errors');
  const roE = panel.readout('ERC errors');

  function render(note = '') {
    report.innerHTML = '';
    for (const c of [...markers.children]) markers.remove(c);
    const section = (title: string, list: Issue[] | null) => {
      const box = h('div', null, h('strong', null, title));
      if (list === null) box.append(h('p', { class: 'note', style: { margin: '2px 0 8px' } }, 'Not run yet.'));
      else if (!list.length) box.append(h('p', { class: 'note', style: { margin: '2px 0 8px', color: 'var(--good)', fontWeight: '700' } }, '0 errors ✓'));
      else {
        const ul = h('ul', { style: { margin: '4px 0 8px', paddingLeft: '1.1em' } });
        for (const issue of list) {
          ul.append(
            h(
              'li',
              { style: { marginBottom: '6px' } },
              h('span', null, issue.msg),
              h(
                'div',
                { class: 'btnrow', style: { marginTop: '4px' } },
                h('button', { class: 'btn small', type: 'button', onclick: () => show(issue) }, 'Show me'),
                h('button', { class: 'btn small primary', type: 'button', onclick: () => fix(issue.key) }, FIX_LABEL[issue.key]),
                h('button', { class: 'btn small', type: 'button', onclick: () => toast('Only mark an error as reviewed when it is intentional. This one is a real problem: fix it.') }, 'Mark reviewed'),
              ),
            ),
          );
          const m = mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color: '#e03131', depthTest: false }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
          m.position.copy(nl.board.at(issue.x, issue.y, TOP + 0.08));
          m.renderOrder = 10;
          markers.add(m);
        }
        box.append(ul);
      }
      return box;
    };
    report.append(section('DRC: design rule check (the layout)', lastDrc), section('ERC: electrical rule check (the schematic)', lastErc));
    if (note) report.append(h('p', { class: 'note' }, note));
    roD.set(lastDrc === null ? 'not run' : String(lastDrc.length), lastDrc?.length === 0 ? 'good' : lastDrc ? 'bad' : '');
    roE.set(lastErc === null ? 'not run' : String(lastErc.length), lastErc?.length === 0 ? 'good' : lastErc ? 'bad' : '');
  }

  function show(issue: Issue) {
    const tmp = new THREE.Object3D();
    tmp.position.copy(nl.board.at(issue.x, issue.y, TOP));
    nl.board.group.add(tmp);
    stage.focus(tmp, 3);
    nl.board.group.remove(tmp);
  }

  stage.onUpdate((_, t) => {
    const s = 1 + 0.25 * Math.sin(t * 6);
    markers.children.forEach((m) => m.scale.setScalar(s));
  });

  build();
  render();
  stage.frame({ dir: new THREE.Vector3(0, 1.4, 1), animate: false });

  return {
    check(task) {
      if (task !== 'cleanReport') return { ok: false };
      const fixed = !st.badClearance && !st.missing.length && !st.noR1 && !st.c1Offset;
      if (!fixed) {
        const left = [st.badClearance && 'clearance', st.missing.length && 'unrouted net', st.c1Offset && 'C1 placement', st.noR1 && 'floating input'].filter(Boolean);
        return { ok: false, msg: `Still to fix: ${left.join(', ')}.` };
      }
      if (!drcFresh || !ercFresh || lastDrc?.length || lastErc?.length) return { ok: false, msg: 'All fixed: now run DRC and ERC again to prove it.' };
      return { ok: true };
    },
  };
}
