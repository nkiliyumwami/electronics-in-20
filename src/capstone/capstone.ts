import * as THREE from 'three';
import { h, rich, toast } from '../core/dom';
import { Panel } from '../core/panel';
import { load, setCapstone, setName } from '../core/store';
import { LESSONS } from '../content/index';
import { BOM, STRIP_AMPS, nightlightDesign, nightlightErcPins } from '../content/nightlight';
import { runDrc } from '../sim/drc';
import { runErc } from '../sim/erc';
import { traceRise } from '../sim/physics';
import { SchematicEditor, type SchPart } from '../tools/schematic';
import { Exploder } from '../tools/explode';

const STEPS = [
  { key: 'schematic', title: 'Schematic' },
  { key: 'footprints', title: 'Footprints' },
  { key: 'place', title: 'Placement' },
  { key: 'route', title: 'Routing' },
  { key: 'drc', title: 'Checks' },
  { key: 'view', title: '3D view' },
  { key: 'power', title: 'Power-up' },
  { key: 'cert', title: 'Certificate' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const SCH: SchPart[] = [
  { ref: 'J1', sym: 'connector', x: 60, y: 140, value: 'battery 5 V', pins: [{ id: 'J1.1', x: 74, y: 120, label: '+' }, { id: 'J1.2', x: 74, y: 160, label: '−' }] },
  {
    ref: 'U1', sym: 'chip', x: 300, y: 200, value: 'ATtiny85',
    pins: [
      { id: 'U1.2', x: 260, y: 175, label: 'PB3' },
      { id: 'U1.3', x: 260, y: 200, label: 'PB4' },
      { id: 'U1.4', x: 260, y: 225, label: 'GND' },
      { id: 'U1.8', x: 340, y: 165, label: 'VCC' },
      { id: 'U1.5', x: 340, y: 235, label: 'PB0' },
    ],
  },
  { ref: 'C1', sym: 'capacitor', x: 420, y: 120, vertical: true, value: '100 nF', pins: [{ id: 'C1.1', x: 420, y: 80 }, { id: 'C1.2', x: 420, y: 160 }] },
  { ref: 'R1', sym: 'resistor', x: 170, y: 250, vertical: true, value: '10 kΩ', pins: [{ id: 'R1.1', x: 170, y: 210 }, { id: 'R1.2', x: 170, y: 290 }] },
  { ref: 'SW1', sym: 'button', x: 110, y: 350, value: 'button', pins: [{ id: 'SW1.1', x: 70, y: 350 }, { id: 'SW1.2', x: 150, y: 350 }] },
  { ref: 'R2', sym: 'resistor', x: 440, y: 300, value: '220 Ω', pins: [{ id: 'R2.1', x: 400, y: 300 }, { id: 'R2.2', x: 480, y: 300 }] },
  { ref: 'D1', sym: 'led', x: 580, y: 300, value: 'LED', pins: [{ id: 'D1.A', x: 540, y: 300, label: 'A' }, { id: 'D1.K', x: 620, y: 300, label: 'K' }] },
  { ref: 'Q1', sym: 'mosfet', x: 560, y: 180, value: 'MOSFET', pins: [{ id: 'Q1.G', x: 525, y: 190, label: 'G' }, { id: 'Q1.D', x: 570, y: 140, label: 'D' }, { id: 'Q1.S', x: 570, y: 220, label: 'S' }] },
  { ref: 'J2', sym: 'connector', x: 650, y: 80, value: 'LED strip', pins: [{ id: 'J2.1', x: 636, y: 60, label: '+' }, { id: 'J2.2', x: 636, y: 100, label: '−' }] },
];
const GOAL: Record<string, string[]> = {
  '+5V': ['J1.1', 'U1.8', 'C1.1', 'R1.1', 'J2.1'],
  GND: ['J1.2', 'U1.4', 'C1.2', 'SW1.2', 'Q1.S', 'D1.K'],
  BTN: ['U1.2', 'R1.2', 'SW1.1'],
  GATE: ['U1.5', 'Q1.G'],
  IND: ['U1.3', 'R2.1'],
  LED_A: ['R2.2', 'D1.A'],
  DRAIN: ['J2.2', 'Q1.D'],
};
const FP_CHOICES: Record<string, string[]> = {
  U1: ['DIP-8', 'SOIC-8', 'QFN-20'],
  Q1: ['SOT-23', 'SOT-223', 'TO-220'],
  C1: ['0603', '0805', '1206'],
  R1: ['0603', '0805', 'Axial (through-hole)'],
  R2: ['0603', '0805', 'Axial (through-hole)'],
  D1: ['0805', '5 mm through-hole'],
  SW1: ['SMD 6x6', '12 × 12 mm through-hole'],
  J1: ['JST-PH 2.0 mm', 'JST-XH 2.5 mm'],
  J2: ['JST-PH 2.0 mm', 'JST-XH 2.5 mm'],
};
const WIDTHS = [0.25, 0.5, 0.9, 1.2];

export async function capstonePage(main: HTMLElement): Promise<() => void> {
  const { Stage } = await import('../three/stage');
  const { Effects } = await import('../three/effects');
  const { nightLight, PcbBoard, PART_INFO, disposeObject } = await import('../three/pcb');
  const { contactShadow, mesh, std } = await import('../three/lib');

  const prog = load();
  const done = new Set<StepKey>(Object.keys(prog.capstone) as StepKey[]);
  let cur: StepKey = STEPS.find((s) => !done.has(s.key))?.key ?? 'cert';
  const st = {
    fp: {} as Record<string, string>,
    c1Near: '' as string,
    placed: done.has('place'),
    routed: done.has('route'),
    width: done.has('route') ? 0.9 : 0.5,
    psOn: false,
    limit: 3.0,
    strip: false,
    safeFirst: false,
    stripLit: false,
  };

  // ---- page layout
  main.append(h('div', { class: 'lesson-head' }, h('span', { class: 'kicker' }, 'Capstone · 15 min'), h('h1', null, 'Build the night-light board')));
  const left = h('div', { class: 'left' });
  const right = h('div', { class: 'right' });
  main.append(h('div', { class: 'lesson' }, left, right));
  left.append(h('div', { class: 'prompt-box' }, 'Design a real board from start to finish: schematic, footprints, layout, checks, and a virtual power-up.'));
  const wrap = h('div', { class: 'stage-wrap' });
  left.append(wrap);
  const panelHost = h('div');
  left.append(panelHost);
  const stepsNav = h('div', { class: 'steps', 'aria-label': 'Capstone steps' });
  const info = h('section', { class: 'card explain' });
  right.append(h('section', { class: 'card' }, h('h2', null, 'Your project'), h('p', { class: 'note' }, `A 5 V night-light: a microcontroller (U1) reads a button (SW1) and switches a ${STRIP_AMPS} A LED strip through a MOSFET (Q1). An indicator LED (D1) shows it is on.`), stepsNav), info);

  const stage = new Stage(wrap);
  const fx = new Effects(stage.real);
  stage.onUpdate((dt) => fx.update(dt));
  let panel = new Panel(panelHost);
  let boardObj: THREE.Object3D | null = null;
  let exploder: Exploder | null = null;
  const extras = new THREE.Group();
  stage.real.add(extras, contactShadow(12, 9));

  // ---- 3D board for the current stage of the design
  function showBoard() {
    if (boardObj) {
      stage.real.remove(boardObj);
      disposeObject(boardObj);
      boardObj = null;
    }
    exploder = null;
    const holder = new THREE.Group();
    holder.scale.setScalar(1.6);
    if (!done.has('footprints')) {
      const blank = new PcbBoard(50, 30);
      blank.silkDraw = (g, px) => {
        g.font = `bold ${px(2)}px system-ui`;
        g.fillText('NIGHT-LIGHT v1', px(14), px(16));
      };
      blank.finish();
      holder.add(blank.group);
      stage.part(blank.layers.maskTop, { name: 'Blank board', job: 'Pads, parts and copper appear as you design.', symbol: 'pcb' });
    } else {
      const routed = st.routed;
      const nl = nightLight({ withParts: st.placed, powerWidth: st.width, missing: routed ? [] : nightlightDesign().traces.map((t) => t.id) });
      holder.add(nl.board.group);
      for (const [ref, obj] of Object.entries(nl.parts)) stage.part(obj, { name: PART_INFO[ref].name, job: PART_INFO[ref].job, symbol: PART_INFO[ref].symbol });
      stage.part(nl.board.layers.maskTop, { name: 'Night-light board', job: routed ? 'Routed: every net is joined by copper.' : 'Pads placed; copper not routed yet.', symbol: 'pcb' });
      const parts = new THREE.Group();
      for (const p of Object.values(nl.parts)) parts.add(p);
      nl.board.group.add(parts);
      exploder = new Exploder(stage, [...nl.board.explodeItems(0.45).map((i, k) => ({ ...i, offset: i.offset.clone().add(new THREE.Vector3(0, 0, -(k - 2) * 0.5)) })), { obj: parts, offset: new THREE.Vector3(0, 2.0, -2.0) }]);
      ledMat = nl.led;
    }
    stage.real.add(holder);
    boardObj = holder;
    stage.frame({ dir: new THREE.Vector3(0, 1.4, 1), animate: false });
  }
  let ledMat: THREE.MeshStandardMaterial | null = null;
  // Per-step frame listener (removed when switching steps).
  let cleanupStep: (() => void) | null = null;

  // LED strip + supply (power step).
  const stripG = new THREE.Group();
  stripG.position.set(0, -0.05, 3.4);
  stripG.add(mesh(new THREE.BoxGeometry(7, 0.04, 0.4), std('#f4f4f0', 0.6), [0, 0, 0]));
  const stripMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 18; i++) {
    const m = std('#fff8e6', 0.3, 0, { emissive: new THREE.Color('#ffe9b0'), emissiveIntensity: 0 });
    stripMats.push(m);
    stripG.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.2), m, [-3.3 + i * 0.39, 0.05, 0]));
  }
  stripG.visible = false;
  extras.add(stripG);
  stage.part(stripG, { name: `LED strip (${STRIP_AMPS} A)`, job: 'The big load, switched by Q1.', symbol: 'led' });

  // ---- step rendering
  function renderNav() {
    stepsNav.innerHTML = '';
    STEPS.forEach((s, i) => {
      const reachable = i === 0 || done.has(STEPS[i - 1].key) || done.has(s.key);
      const b = h('button', { class: `st ${done.has(s.key) ? 'done' : s.key === cur ? 'cur' : ''}`, type: 'button', disabled: !reachable, 'aria-current': s.key === cur ? 'step' : undefined }, `${i + 1}. ${s.title}${done.has(s.key) ? ' ✓' : ''}`);
      b.style.cursor = reachable ? 'pointer' : 'not-allowed';
      b.addEventListener('click', () => go(s.key));
      stepsNav.append(b);
    });
  }
  function complete(k: StepKey, msg: string) {
    done.add(k);
    setCapstone(k);
    toast(msg);
    renderNav();
    const i = STEPS.findIndex((s) => s.key === k);
    if (i < STEPS.length - 1) {
      const nxt = h('button', { class: 'btn primary', type: 'button', onclick: () => go(STEPS[i + 1].key) }, `Next: ${STEPS[i + 1].title} →`);
      panel.custom(nxt);
      nxt.focus();
    }
  }
  function setInfo(title: string, paras: string[]) {
    info.innerHTML = '';
    info.append(h('h2', null, title), ...paras.map((p) => h('p', { html: rich(p) })));
  }

  function go(k: StepKey) {
    cleanupStep?.();
    cleanupStep = null;
    cur = k;
    panelHost.innerHTML = '';
    panel = new Panel(panelHost);
    stripG.visible = false;
    fx.clear();
    renderNav();
    showBoard();
    ({ schematic: stepSchematic, footprints: stepFootprints, place: stepPlace, route: stepRoute, drc: stepDrc, view: stepView, power: stepPower, cert: stepCert })[k]();
    // Without WebGL: show the parts diagram and keep the simulation ticking.
    stage.renderFallback();
    stage.startFallbackLoop();
  }

  // 1. Schematic
  function stepSchematic() {
    setInfo('1. Draw the schematic', [
      'Connect the pins so that the nets match the goal list. Tap one pin, then another (or use the keyboard controls).',
      'Tip: **+5V** joins J1 +, U1 VCC, C1, R1 and J2 +. **GND** joins everything that returns to the battery\'s −.',
    ]);
    const ed = new SchematicEditor(SCH, GOAL, { width: 700, height: 390 });
    panel.custom(ed.el);
    panel.custom(ed.controls());
    const row = panel.row();
    panel.button('Check my schematic', () => {
      const s = ed.status();
      if (s.ok) complete('schematic', 'Schematic complete: 7 nets.');
      else toast(s.shorts.length ? 'Two nets are shorted together.' : `Still to finish: ${Object.keys(GOAL).filter((n) => !s.complete.includes(n)).join(', ')}`);
    }, 'btn primary', row);
    panel.button('Show me one net', () => {
      const s = ed.status();
      const missing = Object.keys(GOAL).find((n) => !s.complete.includes(n));
      if (!missing) return;
      const pins = GOAL[missing];
      for (let i = 1; i < pins.length; i++) ed.connect(pins[0], pins[i]);
    }, 'btn', row);
    if (done.has('schematic')) for (const pins of Object.values(GOAL)) for (let i = 1; i < pins.length; i++) ed.connect(pins[0], pins[i]);
  }

  // 2. Footprints
  function stepFootprints() {
    setInfo('2. Choose footprints', ['Each part number tells you its package. Pick the matching footprint for every part.', 'Careful with J2: it carries the 3 A strip current, and JST-PH contacts are rated for 2 A. JST-XH handles 3 A.']);
    const body = h('tbody');
    const table = h('table', { class: 'datasheet' }, h('thead', null, h('tr', null, h('th', null, 'Ref'), h('th', null, 'Part'), h('th', null, 'Footprint'))), body);
    for (const r of BOM) {
      const sel = h('select', { 'aria-label': `Footprint for ${r.ref}` }, h('option', { value: '' }, '— choose —'), FP_CHOICES[r.ref].map((c) => h('option', { value: c }, c))) as HTMLSelectElement;
      sel.value = st.fp[r.ref] ?? (done.has('footprints') ? r.footprint : '');
      sel.addEventListener('change', () => (st.fp[r.ref] = sel.value));
      if (sel.value) st.fp[r.ref] = sel.value;
      body.append(h('tr', null, h('td', null, r.ref), h('td', null, `${r.mpn} (${r.value})`), h('td', null, sel)));
    }
    panel.custom(h('div', { class: 'table-wrap' }, table));
    const fb = panel.note('');
    panel.button('Check footprints', () => {
      const wrong = BOM.filter((r) => st.fp[r.ref] !== r.footprint);
      if (!wrong.length) {
        fb.set('All nine match their datasheets ✓');
        complete('footprints', 'Footprints assigned: pads appear on the board.');
        showBoard();
      } else fb.set(`Not yet: check ${wrong.map((r) => r.ref).join(', ')}. ${wrong.some((r) => r.ref === 'J2') ? 'J2 must handle 3 A.' : ''}`, 'note warn');
    }, 'btn primary');
  }

  // 3. Placement
  function stepPlace() {
    setInfo('3. Place the parts', ['Placement matters before any routing. Big rule: decoupling capacitors go right at the pin they serve.']);
    const q = panel.segmented('Where should C1 (100 nF) go?', [{ value: 'u1', label: "Right at U1's VCC pin" }, { value: 'j1', label: 'Next to the battery connector J1' }, { value: 'any', label: 'Anywhere on the +5V net' }], st.c1Near || 'any', (v) => (st.c1Near = v));
    void q;
    const fb = panel.note('');
    panel.button('Place all parts', () => {
      if (st.c1Near !== 'u1') {
        fb.set('C1 only works when it is millimetres from U1\'s VCC pin (lesson 5.3). Pick that option.', 'note warn');
        return;
      }
      st.placed = true;
      showBoard();
      complete('place', 'Parts placed.');
    }, 'btn primary');
  }

  // 4. Routing
  function stepRoute() {
    setInfo('4. Route the copper', [`Signals can use thin 0.25 mm traces. The two power traces carry the strip's ${STRIP_AMPS} A: pick a width that keeps them within +20 °C.`]);
    const sel = panel.select('Power trace width', WIDTHS.map((w) => ({ value: String(w), label: `${w} mm → +${traceRise(w, STRIP_AMPS).toFixed(0)} °C at ${STRIP_AMPS} A` })), String(st.width), (v) => (st.width = Number(v)));
    void sel;
    panel.button('Route the board', () => {
      st.routed = true;
      showBoard();
      complete('route', 'Routed. Now run the checks.');
    }, 'btn primary');
  }

  // 5. Checks
  function stepDrc() {
    setInfo('5. Run the checks', ['DRC checks the layout against the factory rules, ERC checks the schematic, and a current check makes sure no trace overheats.']);
    const out = h('div', { class: 'note', 'aria-live': 'polite' });
    panel.custom(out);
    panel.button('Run DRC + ERC + current check', () => {
      const drc = runDrc(nightlightDesign({ powerWidth: st.width }));
      const erc = runErc(nightlightErcPins());
      const rise = traceRise(st.width, STRIP_AMPS);
      const cur = rise > 20 ? [`Current: the ${st.width} mm power traces would heat +${rise.toFixed(0)} °C at ${STRIP_AMPS} A (limit +20 °C). Go back to Routing and widen them.`] : [];
      const all = [...drc.map((e) => e.msg), ...erc.map((e) => e.msg), ...cur];
      out.innerHTML = '';
      if (!all.length) {
        out.append(h('p', { style: { color: 'var(--good)', fontWeight: '700', margin: 0 } }, 'DRC: 0 errors · ERC: 0 errors · current: OK ✓'));
        complete('drc', 'Zero unexplained errors. Ready to view.');
      } else {
        out.append(h('ul', null, all.map((m) => h('li', null, m))));
        if (cur.length) panel.button('← Back to routing', () => go('route'), 'btn');
      }
    }, 'btn primary');
  }

  // 6. View
  function stepView() {
    setInfo('6. Admire it in 3D', ['Pull it apart to see every layer you designed: silkscreen, mask, copper, core and the ground plane.']);
    exploder?.controls(panel, 'Explode the board');
    panel.button('Looks good →', () => complete('view', 'Time to switch it on.'), 'btn primary');
  }

  // 7. Power-up
  function stepPower() {
    setInfo('7. Bring it up', ['First power-up: limit the current to 100 mA or less with the strip **disconnected**, and check that the board draws only its normal current.', `Then connect the strip, raise the limit above ${STRIP_AMPS} A, and press the button.`]);
    stripG.visible = true;
    const lim = panel.slider({ label: 'Current limit', min: 0.01, max: 4, log: true, value: st.limit, nudge: true, snap: (v) => (v < 0.1 ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10), format: (v) => (v < 1 ? `${(v * 1000).toFixed(0)} mA` : `${v.toFixed(1)} A`), onInput: (v) => { st.limit = v; } });
    void lim;
    const row = panel.row();
    const onBtn = panel.button(st.psOn ? 'Output OFF' : 'Output ON', () => {
      st.psOn = !st.psOn;
      onBtn.textContent = st.psOn ? 'Output OFF' : 'Output ON';
      if (st.psOn && !st.strip && st.limit <= 0.1 + 1e-9) st.safeFirst = true;
      if (st.psOn && !st.safeFirst) toast('No short this time, but always limit the current on a first power-up. Switch off and try with 100 mA.');
    }, 'btn primary', row);
    const stripBtn = panel.button(st.strip ? 'Disconnect the strip' : 'Connect the LED strip', () => {
      st.strip = !st.strip;
      stripBtn.textContent = st.strip ? 'Disconnect the strip' : 'Connect the LED strip';
    }, 'btn', row);
    let lit = false;
    panel.button('Press SW1', () => {
      lit = !lit;
    }, 'btn', row);
    const roI = panel.readout('Board current');
    const roS = panel.readout('Status');
    const stop = stage.onUpdate(() => {
      const want = (st.psOn ? 0.02 : 0) + (st.psOn && st.strip && lit ? STRIP_AMPS : 0);
      const I = Math.min(want, st.limit);
      const cc = st.psOn && want > st.limit + 1e-9;
      roI.set(I < 1 ? `${(I * 1000).toFixed(0)} mA` : `${I.toFixed(2)} A`, cc ? 'warn' : '');
      const stripOn = st.psOn && st.strip && lit;
      const level = stripOn ? Math.min(1, (st.limit - 0.02) / STRIP_AMPS) : 0;
      stripMats.forEach((m) => (m.emissiveIntensity = level * 3));
      if (ledMat) ledMat.emissiveIntensity = st.psOn && lit ? 3 : 0.05;
      roS.set(!st.psOn ? 'off' : cc ? `current limit (${st.limit < 1 ? (st.limit * 1000).toFixed(0) + ' mA' : st.limit.toFixed(1) + ' A'}): raise it for the strip` : stripOn ? `strip on at ${STRIP_AMPS} A ✓` : 'board on, 20 mA: healthy', cc ? 'warn' : 'good');
      if (stripOn && !cc && st.safeFirst && !done.has('power')) {
        st.stripLit = true;
        complete('power', 'It works! Your night-light is on.');
      }
    });
    cleanupStep = stop;
  }

  // 8. Certificate
  function stepCert() {
    setInfo('8. Your certificate', ['You designed a board end to end. Add your name and download your certificate.']);
    const name = h('input', { type: 'text', value: prog.name ?? '', placeholder: 'Your name', 'aria-label': 'Your name', style: { minHeight: '42px', padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface)', width: '100%' } }) as HTMLInputElement;
    panel.custom(h('div', { class: 'ctl' }, h('label', null, 'Name on the certificate'), name));
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1130;
    canvas.className = 'chart';
    canvas.style.height = 'auto';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Certificate preview');
    panel.custom(canvas);
    const dl = h('a', { class: 'btn primary', download: 'electronics-in-20-certificate.png', href: '#' }, 'Download certificate (PNG)');
    panel.custom(dl);
    const allDone = STEPS.slice(0, 7).every((s) => done.has(s.key));
    const draw = () => {
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#f6f5f1';
      g.fillRect(0, 0, 1600, 1130);
      g.strokeStyle = '#1f7a4d';
      g.lineWidth = 14;
      g.strokeRect(30, 30, 1540, 1070);
      g.lineWidth = 3;
      g.strokeRect(56, 56, 1488, 1018);
      g.fillStyle = '#1f7a4d';
      g.font = 'bold 40px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('ELECTRONICS IN 20%', 800, 150);
      g.fillStyle = '#1d1f1e';
      g.font = '32px system-ui, sans-serif';
      g.fillText('This certifies that', 800, 240);
      g.font = 'bold 76px Georgia, serif';
      g.fillText(name.value.trim() || 'Your name', 800, 340);
      g.font = '30px system-ui, sans-serif';
      g.fillText(allDone ? 'designed, checked and brought up the night-light board, and can now:' : 'is working through the course and can now:', 800, 420);
      const skills = LESSONS.filter((l) => load().done[l.id]).flatMap((l) => l.skills);
      const list = skills.length ? skills : ['(complete lessons to add skills here)'];
      g.textAlign = 'left';
      g.font = '22px system-ui, sans-serif';
      const cols = 2;
      const perCol = Math.ceil(list.length / cols);
      list.forEach((s, i) => {
        const c = Math.floor(i / perCol);
        const r = i % perCol;
        g.fillStyle = '#1f7a4d';
        g.fillText('✓', 140 + c * 700, 490 + r * 30);
        g.fillStyle = '#1d1f1e';
        g.fillText(s.length > 58 ? s.slice(0, 57) + '…' : s, 172 + c * 700, 490 + r * 30);
      });
      g.textAlign = 'center';
      g.fillStyle = '#6e736f';
      g.font = '22px system-ui, sans-serif';
      g.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 800, 1040);
      dl.setAttribute('href', canvas.toDataURL('image/png'));
    };
    name.addEventListener('input', () => {
      setName(name.value);
      draw();
    });
    draw();
    if (!allDone) panel.note('Finish steps 1–7 to complete the capstone. You can still download a progress certificate.', 'note warn');
    if (allDone && !done.has('cert')) {
      done.add('cert');
      setCapstone('cert');
      renderNav();
    }
  }

  go(cur);

  return () => {
    cleanupStep?.();
    stage.dispose();
  };
}
