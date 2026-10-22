import * as THREE from 'three';
import { h, rich, toast } from '../core/dom';
import { Panel } from '../core/panel';
import { load, setCapstone, setName } from '../core/store';
import { LESSONS } from '../content/index';
import { CAPSTONE, budgetDays } from '../content/capstone';

// Capstone: build Plant Buddy step by step on one breadboard, check the power
// budget, diagnose a friend's faulty build, then watch it water the plant.
const STEPS = [
  { key: 'power', title: 'Power rails' },
  { key: 'led', title: 'Status LED' },
  { key: 'sensors', title: 'Sensors' },
  { key: 'pump', title: 'Pump driver' },
  { key: 'budget', title: 'Power budget' },
  { key: 'faults', title: 'Fix 3 faults' },
  { key: 'run', title: 'Run it' },
  { key: 'cert', title: 'Certificate' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

export async function capstonePage(main: HTMLElement): Promise<() => void> {
  const { Stage } = await import('../three/stage');
  const { Effects } = await import('../three/effects');
  const lib = await import('../three/lib');
  const iot = await import('../three/iot');
  const { espBench } = await import('../lessons/kit');

  const prog = load();
  const done = new Set<StepKey>(Object.keys(prog.capstone).filter((k) => STEPS.some((s) => s.key === k)) as StepKey[]);
  let cur: StepKey = STEPS.find((s) => !done.has(s.key))?.key ?? 'cert';

  // ---- page layout
  main.append(h('div', { class: 'lesson-head' }, h('span', { class: 'kicker' }, 'Capstone · 15 min'), h('h1', null, 'Build Plant Buddy')));
  const left = h('div', { class: 'left' });
  const right = h('div', { class: 'right' });
  main.append(h('div', { class: 'lesson' }, left, right));
  left.append(h('div', { class: 'prompt-box' }, 'Wire up the whole Plant Buddy, check it can run for months on its battery, fix a friend\'s faulty build, and watch it water the plant.'));
  const wrap = h('div', { class: 'stage-wrap' });
  left.append(wrap);
  const panelHost = h('div');
  left.append(panelHost);
  const stepsNav = h('div', { class: 'steps', 'aria-label': 'Capstone steps' });
  const info = h('section', { class: 'card explain' });
  right.append(h('section', { class: 'card' }, h('h2', null, 'Your project'), h('p', { class: 'note' }, 'Plant Buddy: an ESP32 reads a soil-moisture sensor and a BME280, shows its status on an LED, and switches a small pump through a MOSFET when the soil gets dry.'), stepsNav), info);

  const stage = new Stage(wrap);
  const fx = new Effects(stage.real);
  stage.onUpdate((dt) => fx.update(dt));
  let panel = new Panel(panelHost);

  // ---- the build (everything exists from the start; steps reveal it)
  const ctxLike = { stage, panel, fx, fxWater: fx, lesson: LESSONS[0], fail: () => {}, clearFail: () => {} };
  const b = espBench(ctxLike, { cols: 40 });
  const H = b.H;
  const groups = { power: new THREE.Group(), led: new THREE.Group(), sensors: new THREE.Group(), pump: new THREE.Group() };
  for (const g of Object.values(groups)) b.bb.group.add(g);
  const J = (g: THREE.Group, a: THREE.Vector3, c: THREE.Vector3, color: Parameters<typeof b.jumper>[2], name: string, hh = 0.6) => {
    const j = b.jumper(a, c, color, name, '', hh);
    g.add(j.group);
    return j;
  };
  // 1. Power: 3V3 and GND to the front rails, VIN (5 V) and GND to the back rails.
  J(groups.power, b.free('3V3'), H(1, 'bot+'), 'red', '3V3 to the front red rail', 0.5);
  J(groups.power, b.free('GND'), H(2, 'bot-'), 'black', 'GND to the front blue rail', 0.5);
  J(groups.power, b.free('VIN'), H(1, 'top+'), 'red', 'VIN (5 V) to the back red rail', 0.5);
  J(groups.power, b.free('GND2'), H(2, 'top-'), 'black', 'GND to the back blue rail', 0.5);
  // 2. Status LED on D16 through 220 Ω.
  const res = lib.resistor(220, H(18, 9).distanceTo(H(22, 9)));
  res.group.position.copy(H(18, 9).lerp(H(22, 9), 0.5));
  const led = lib.led('red');
  led.group.position.copy(H(22, 7).lerp(H(23, 7), 0.5));
  groups.led.add(res.group, led.group);
  J(groups.led, b.free('D16'), H(18, 6), 'yellow', 'Status LED signal (D16)');
  J(groups.led, H(23, 8), H(23, 'bot-'), 'black', '', 0.5);
  stage.part(led.group, { name: 'Status LED', job: 'Blinks each time Plant Buddy reports over Wi-Fi.', symbol: 'led' });
  // 3. Sensors: BME280 on I2C, soil sensor in the pot on D32.
  const bme = iot.bme280();
  bme.group.position.copy(H(26, 8)).add(new THREE.Vector3(1.5 * b.bb.pitch, 0, 0));
  groups.sensors.add(bme.group);
  stage.part(bme.group, { name: 'BME280 (I2C 0x76)', job: 'Temperature, humidity and pressure, on SDA D21 and SCL D22.', symbol: 'sensor' });
  J(groups.sensors, H(26, 9), H(26, 'bot+'), 'red', '', 0.4);
  J(groups.sensors, H(27, 9), H(27, 'bot-'), 'black', '', 0.5);
  J(groups.sensors, H(28, 6), b.free('D22'), 'yellow', 'BME280 SCL to D22', 1.4);
  J(groups.sensors, H(29, 7), b.free('D21'), 'blue', 'BME280 SDA to D21', 1.7);
  const plant = iot.pottedPlant();
  plant.group.scale.setScalar(0.8);
  plant.group.position.set(9.4, -0.85, -2.4);
  b.bb.group.add(plant.group);
  stage.part(plant.group, { name: 'The plant', job: 'What Plant Buddy looks after.', symbol: 'sensor' });
  const soil = iot.soilSensor();
  soil.group.scale.setScalar(0.6);
  soil.group.position.copy(plant.group.position).add(new THREE.Vector3(-0.35, 0.3, 0.3));
  groups.sensors.add(soil.group);
  stage.part(soil.group, { name: 'Soil-moisture sensor (on D32)', job: 'Wetter soil gives a lower reading. Read on GPIO 32, an ADC1 pin that works with Wi-Fi on.', symbol: 'sensor' });
  const soilPin = (k: 'GND' | 'VCC' | 'AOUT') => soil.pins[k].clone().multiplyScalar(0.6).add(soil.group.position);
  const soilLead = (k: 'GND' | 'VCC' | 'AOUT', to: THREE.Vector3, c: 'black' | 'red' | 'yellow') => {
    const a = soilPin(k);
    const w = lib.wire([a, a.clone().add(new THREE.Vector3(0, 0.5, 0.3)), to.clone().setY(1.4), to.clone().setY(0.7), to.clone()], c, 0.04, 0.3);
    groups.sensors.add(w.mesh);
  };
  soilLead('GND', H(37, 'bot-'), 'black');
  soilLead('VCC', H(36, 'bot+'), 'red');
  soilLead('AOUT', b.free('D32'), 'yellow');
  // 4. Pump driver: IRLZ44N on D26 with 220 Ω gate resistor, 10 kΩ pull-down, flyback diode, pump in a cup.
  const q = lib.mosfetTO220();
  q.group.position.copy(H(33, 2));
  groups.pump.add(q.group);
  stage.part(q.body, { name: 'MOSFET (IRLZ44N)', job: 'Switches the pump from D26.', symbol: 'mosfet' });
  const rg = lib.resistor(220, H(28, 1).distanceTo(H(32, 1)));
  rg.group.position.copy(H(28, 1).lerp(H(32, 1), 0.5));
  const rpd = lib.resistor(10000, H(32, 4).distanceTo(H(36, 4)));
  rpd.group.position.copy(H(32, 4).lerp(H(36, 4), 0.5));
  const dio = iot.axialDiode(H(33, 3).distanceTo(H(37, 3)));
  dio.group.position.copy(H(33, 3).lerp(H(37, 3), 0.5));
  groups.pump.add(rg.group, rpd.group, dio.group);
  J(groups.pump, b.free('D26'), H(28, 0), 'yellow', 'Pump control (D26)', 0.9);
  J(groups.pump, H(36, 0), H(36, 'top-'), 'black', '', 0.5);
  J(groups.pump, H(34, 0), H(34, 'top-'), 'black', '', 0.5);
  J(groups.pump, H(37, 1), H(37, 'top+'), 'red', '', 0.5);
  const cup = iot.pumpInCup();
  cup.group.scale.setScalar(0.7);
  cup.group.position.set(6.6, -0.85, -4.9);
  groups.pump.add(cup.group);
  stage.part(cup.group, { name: 'Pump', job: '5 V, about 150 mA. Waters the plant.', symbol: 'motor' });
  const leadTop = cup.leads.clone().multiplyScalar(0.7).add(cup.group.position);
  groups.pump.add(lib.wire([leadTop, leadTop.clone().setY(1.6), H(39, 'top+').setY(1.2), H(39, 'top+')], 'red', 0.04, 0.3).mesh);
  groups.pump.add(lib.wire([leadTop, leadTop.clone().setY(1.4), H(33, 0).setY(1.0), H(33, 0)], 'blue', 0.04, 0.3).mesh);
  const statusLabel = stage.label('', b.esp.group, new THREE.Vector3(0.8, 2.3, -0.6), 'big');
  statusLabel.show(false);

  function showBuild() {
    const idx = STEPS.findIndex((s) => s.key === cur);
    const upto = (k: StepKey) => done.has(k) || STEPS.findIndex((s) => s.key === k) < idx;
    groups.power.visible = upto('power') || cur === 'power';
    groups.led.visible = upto('led') || cur === 'led';
    groups.sensors.visible = upto('sensors') || cur === 'sensors';
    groups.pump.visible = upto('pump') || cur === 'pump';
  }
  // Steps show parts only once they are wired correctly.
  const reveal = (g: THREE.Group, on: boolean) => (g.visible = on);

  // ---- step rendering
  function renderNav() {
    stepsNav.innerHTML = '';
    STEPS.forEach((s, i) => {
      const reachable = i === 0 || done.has(STEPS[i - 1].key) || done.has(s.key);
      const btn = h('button', { class: `st ${done.has(s.key) ? 'done' : s.key === cur ? 'cur' : ''}`, type: 'button', disabled: !reachable, 'aria-current': s.key === cur ? 'step' : undefined }, `${i + 1}. ${s.title}${done.has(s.key) ? ' ✓' : ''}`);
      btn.style.cursor = reachable ? 'pointer' : 'not-allowed';
      btn.addEventListener('click', () => go(s.key));
      stepsNav.append(btn);
    });
  }
  function complete(k: StepKey, msg: string) {
    const first = !done.has(k);
    done.add(k);
    setCapstone(k);
    if (first) toast(msg);
    renderNav();
    const i = STEPS.findIndex((s) => s.key === k);
    if (i < STEPS.length - 1 && !panelHost.querySelector('.next-step')) {
      const nxt = h('button', { class: 'btn primary next-step', type: 'button', onclick: () => go(STEPS[i + 1].key) }, `Next: ${STEPS[i + 1].title} →`);
      panel.custom(nxt);
      nxt.focus();
    }
  }
  function setInfo(title: string, paras: string[]) {
    info.innerHTML = '';
    info.append(h('h2', null, title), ...paras.map((p) => h('p', { html: rich(p) })));
  }
  let cleanupStep: (() => void) | null = null;

  function go(k: StepKey) {
    cleanupStep?.();
    cleanupStep = null;
    cur = k;
    panelHost.innerHTML = '';
    panel = new Panel(panelHost);
    fx.clear();
    statusLabel.show(false);
    renderNav();
    showBuild();
    ({ power: stepPower, led: stepLed, sensors: stepSensors, pump: stepPump, budget: stepBudget, faults: stepFaults, run: stepRun, cert: stepCert })[k]();
    stage.frame({ dir: new THREE.Vector3(0.05, 1.35, 1), animate: true });
    stage.renderFallback();
    stage.startFallbackLoop();
  }

  /** A row of "X goes to …" selects; calls back with the full mapping on every change. */
  function wiringStep(rows: { key: string; label: string; options: { value: string; label: string }[] }[], onChange: (m: Record<string, string>) => void) {
    const m: Record<string, string> = {};
    for (const r of rows) {
      m[r.key] = '';
      panel.select(r.label, [{ value: '', label: 'Choose…' }, ...r.options], '', (v) => {
        m[r.key] = v;
        onChange(m);
      });
    }
    return m;
  }

  // 1. Power rails
  function stepPower() {
    setInfo('1. Power rails', ['Give the breadboard its power rails. The front rails carry **3.3 V** for the logic and sensors; the back rails carry **5 V** from VIN for the pump. Every rail pair needs GND too.']);
    const pins = [
      { value: '3V3', label: '3V3' },
      { value: 'VIN', label: 'VIN (5 V from USB)' },
      { value: 'GND', label: 'GND' },
    ];
    const note = panel.note('');
    reveal(groups.power, done.has('power'));
    wiringStep(
      [
        { key: 'frontRed', label: 'Front red rail (logic) ← ESP32 pin', options: pins },
        { key: 'frontBlue', label: 'Front blue rail ← ESP32 pin', options: pins },
        { key: 'backRed', label: 'Back red rail (pump) ← ESP32 pin', options: pins },
        { key: 'backBlue', label: 'Back blue rail ← ESP32 pin', options: pins },
      ],
      (m) => {
        const ok = m.frontRed === '3V3' && m.frontBlue === 'GND' && m.backRed === 'VIN' && m.backBlue === 'GND';
        const wrong = m.frontRed === 'VIN' ? 'The front rail feeds the 3.3 V sensors: 5 V would damage them.' : m.frontRed === 'GND' || m.backRed === 'GND' ? 'A red rail on GND, and a blue rail on GND too, means no power at all.' : m.backRed === '3V3' ? 'The pump needs 5 V: use VIN for the back rail.' : '';
        note.set(ok ? 'Rails ready: 3.3 V front, 5 V back, GND on both blue rails.' : wrong, ok ? 'note' : 'note warn');
        reveal(groups.power, ok);
        if (ok) complete('power', 'Power rails done');
      },
    );
  }

  // 2. Status LED
  function stepLed() {
    setInfo('2. Status LED', ['Plant Buddy blinks an LED each time it reports. Put a red LED (2.0 V) on **GPIO 16** with a resistor that keeps it between **5 and 15 mA**.']);
    const note = panel.note('');
    reveal(groups.led, done.has('led'));
    wiringStep(
      [
        { key: 'pin', label: 'LED signal pin', options: [{ value: 'D16', label: 'D16 (GPIO 16)' }, { value: 'D34', label: 'D34 (GPIO 34)' }, { value: '3V3', label: '3V3 (always on)' }] },
        { key: 'r', label: 'Resistor', options: [{ value: '0', label: 'none' }, { value: '47', label: '47 Ω' }, { value: '220', label: '220 Ω' }, { value: '10000', label: '10 kΩ' }] },
      ],
      (m) => {
        const r = Number(m.r);
        const I = r > 0 ? (3.3 - 2.0) / r : Infinity;
        let msg = '';
        if (m.pin === 'D34') msg = 'GPIO 34 is input-only: it cannot drive an LED.';
        else if (m.pin === '3V3') msg = 'On 3V3 the LED would always be on: the code could never blink it.';
        else if (m.r === '0') msg = 'No resistor: nothing limits the current, and the LED (and the pin) burn out.';
        else if (m.r && I > 0.015) msg = `${(I * 1000).toFixed(1)} mA: too much for a status LED (and over 20 mA).`;
        else if (m.r && I < 0.005) msg = `${(I * 1000).toFixed(2)} mA: far too dim to see.`;
        const ok = m.pin === 'D16' && I >= 0.005 && I <= 0.015;
        note.set(ok ? `D16 → 220 Ω → LED: ${(I * 1000).toFixed(1)} mA. Bright enough, gentle on the pin.` : msg, ok ? 'note' : 'note warn');
        reveal(groups.led, ok);
        led.setLight(ok ? 0.5 : 0);
        if (ok) complete('led', 'Status LED done');
      },
    );
  }

  // 3. Sensors
  function stepSensors() {
    setInfo('3. Sensors', ['Wire the soil sensor\'s analog output to an **ADC1** pin (it has to work with Wi-Fi on), and the BME280 to the ESP32\'s default **I2C** pins. Both run on 3.3 V.']);
    const note = panel.note('');
    reveal(groups.sensors, done.has('sensors'));
    const gp = (ids: string[]) => ids.map((v) => ({ value: v, label: v }));
    wiringStep(
      [
        { key: 'aout', label: 'Soil sensor AOUT → ESP32 pin', options: gp(['D4', 'D32', 'D21']) },
        { key: 'svcc', label: 'Soil sensor VCC → rail', options: [{ value: '3V3', label: 'front red rail (3.3 V)' }, { value: '5V', label: 'back red rail (5 V)' }] },
        { key: 'sda', label: 'BME280 SDA → ESP32 pin', options: gp(['D21', 'D22', 'D32']) },
        { key: 'scl', label: 'BME280 SCL → ESP32 pin', options: gp(['D21', 'D22', 'D4']) },
      ],
      (m) => {
        let msg = '';
        if (m.aout === 'D4') msg = 'D4 is an ADC2 pin: its readings stop working while Wi-Fi is on.';
        else if (m.aout === 'D21') msg = 'D21 is the I2C data pin; the soil sensor needs an ADC pin.';
        else if (m.svcc === '5V') msg = 'At 5 V the sensor\'s output could go over 3.3 V. Power it from 3.3 V.';
        else if (m.sda && m.scl && m.sda === m.scl) msg = 'SDA and SCL need two different pins.';
        else if (m.sda === 'D22' && m.scl === 'D21') msg = 'SDA and SCL are swapped.';
        const ok = m.aout === 'D32' && m.svcc === '3V3' && m.sda === 'D21' && m.scl === 'D22';
        note.set(ok ? 'Soil sensor on ADC1 (D32), BME280 on I2C (D21/D22): an I2C scan finds 0x76.' : msg, ok ? 'note' : 'note warn');
        reveal(groups.sensors, ok);
        if (ok) complete('sensors', 'Sensors done');
      },
    );
  }

  // 4. Pump driver
  function stepPump() {
    setInfo('4. Pump driver', ['The pump needs about 150 mA at 5 V, far more than a pin can give. Build the switch: pick the parts a safe pump driver needs.']);
    const note = panel.note('');
    reveal(groups.pump, done.has('pump'));
    const parts = { mosfet: false, pulldown: false, diode: false, direct: false };
    const row = panel.row();
    const tg = (k: keyof typeof parts, label: string) =>
      panel.toggle(label, false, (v) => {
        parts[k] = v;
        update();
      }, row);
    tg('direct', 'Pump straight on D26');
    tg('mosfet', 'Logic-level MOSFET (IRLZ44N)');
    tg('pulldown', '10 kΩ gate pull-down');
    tg('diode', 'Flyback diode across the pump');
    function update() {
      const ok = parts.mosfet && parts.pulldown && parts.diode && !parts.direct;
      const msg = parts.direct ? 'A pin cannot power a pump: about 150 mA needed, the pin gives about 20 mA.' : !parts.mosfet ? 'Something has to carry the pump\'s current: a logic-level MOSFET.' : !parts.diode ? 'Without a flyback diode, every switch-off sends a spike into the MOSFET.' : !parts.pulldown ? 'Without a pull-down, the pump could twitch on while the ESP32 boots.' : '';
      note.set(ok ? 'D26 → 220 Ω → MOSFET gate, 10 kΩ pull-down, flyback diode across the pump: safe and cool.' : msg, ok ? 'note' : 'note warn');
      reveal(groups.pump, ok);
      if (ok) complete('pump', 'Pump driver done');
    }
    update();
  }

  // 5. Power budget
  function stepBudget() {
    setInfo('5. Power budget', [`Plant Buddy runs on a **${CAPSTONE.capacity} mAh** cell. Choose a board and a wake-up plan so it lasts **more than ${CAPSTONE.targetDays} days**. Awake (measuring and sending) it draws about ${CAPSTONE.awakeMa} mA for ${CAPSTONE.awakeS} s.`]);
    const s = { board: 'devkit' as 'devkit' | 'lowpower', every: 1 };
    panel.segmented('Board', [{ value: 'devkit', label: 'DevKit (5 mA asleep)' }, { value: 'lowpower', label: 'Low-power board (10 µA asleep)' }], s.board, (v) => { s.board = v as 'devkit' | 'lowpower'; upd(); });
    panel.select('Wake up every', CAPSTONE.intervals.map((m) => ({ value: String(m), label: `${m} min` })), '1', (v) => { s.every = Number(v); upd(); });
    const ro = panel.readout('Battery life');
    function upd() {
      const d = budgetDays(s.board, s.every);
      ro.set(`${d.toFixed(0)} days`, d > CAPSTONE.targetDays ? 'good' : 'warn');
      if (d > CAPSTONE.targetDays) complete('budget', 'Power budget done');
    }
    upd();
  }

  // 6. Fix three faults
  function stepFaults() {
    setInfo('6. Fix three faults', ['A friend built a second Plant Buddy and it misbehaves in three ways. For each symptom, choose the fix.']);
    const results: Record<string, boolean> = {};
    for (const f of CAPSTONE.faults) {
      results[f.id] = false;
      panel.select(f.symptom, [{ value: '', label: 'Choose a fix…' }, ...f.fixes.map((x, i) => ({ value: String(i), label: x.text }))], '', (v) => {
        const fix = f.fixes[Number(v)];
        results[f.id] = !!fix?.correct;
        note.set(fix ? fix.why : '', fix?.correct ? 'note' : 'note warn');
        if (fix?.correct) stage.spotlight(f.id === 'adc' ? soil.group : f.id === 'led' ? led.group : q.group);
        const n = Object.values(results).filter(Boolean).length;
        ro.set(`${n} of ${CAPSTONE.faults.length}`, n === CAPSTONE.faults.length ? 'good' : '');
        if (n === CAPSTONE.faults.length) complete('faults', 'All three faults fixed');
      });
    }
    const note = panel.note('');
    const ro = panel.readout('Faults fixed');
    ro.set(`0 of ${CAPSTONE.faults.length}`);
  }

  // 7. Run it
  function stepRun() {
    setInfo('7. Run it', ['Switch Plant Buddy on and speed up time. When the soil drops below **30%**, it switches the pump on until the soil is wet again, and reports each reading over Wi-Fi (the status LED blinks).']);
    let running = false;
    let m = 0.45; // true moisture
    let pumping = false;
    let watered = 0;
    let t = 0;
    const row = panel.row();
    const btn = panel.button('Switch on (time-lapse)', () => {
      running = !running;
      btn.textContent = running ? 'Pause' : 'Switch on (time-lapse)';
    }, 'btn primary', row);
    const roM = panel.readout('Soil moisture');
    const roP = panel.readout('Pump');
    const roW = panel.readout('Waterings');
    statusLabel.show(true);
    const stop = stage.onUpdate((dt) => {
      if (running) {
        t += dt;
        m += pumping ? dt * 0.25 : -dt * 0.06;
        m = Math.max(0, Math.min(1, m));
        if (!pumping && m < 0.3) pumping = true;
        if (pumping && m > 0.8) {
          pumping = false;
          watered++;
          if (watered === 1) {
            fx.confetti?.(plant.group.position.clone().setY(3));
            complete('run', 'Plant Buddy watered the plant!');
          }
        }
      }
      plant.setMoisture(m);
      cup.setRunning(pumping, stage.time);
      led.setLight(running && Math.floor(t * 2) % 4 === 0 ? 0.6 : 0);
      b.esp.setBlueLed(false);
      roM.set(`${Math.round(m * 100)}%`, m < 0.3 ? 'warn' : 'good');
      roP.set(pumping ? 'ON (watering)' : 'off', pumping ? 'good' : '');
      roW.set(String(watered), watered ? 'good' : '');
      statusLabel.set(running ? `soil ${Math.round(m * 100)}% · 23.4 °C · ${pumping ? 'pump ON' : 'pump off'}` : 'switched off', running ? 'good' : '');
    });
    cleanupStep = () => {
      stop();
      cup.setRunning(false, 0);
    };
  }

  // 8. Certificate
  function stepCert() {
    setInfo('8. Your certificate', ['You built a complete IoT device. Add your name and download your certificate.']);
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
      g.fillText('ELECTRONICS IN 20% · FOR IoT', 800, 150);
      g.fillStyle = '#1d1f1e';
      g.font = '32px system-ui, sans-serif';
      g.fillText('This certifies that', 800, 240);
      g.font = 'bold 76px Georgia, serif';
      g.fillText(name.value.trim() || 'Your name', 800, 340);
      g.font = '30px system-ui, sans-serif';
      g.fillText(allDone ? 'built Plant Buddy, an ESP32 plant monitor, and can now:' : 'is working through the course and can now:', 800, 420);
      const skills = LESSONS.filter((l) => load().done[l.id]).flatMap((l) => l.skills);
      const list = skills.length ? skills : ['(complete lessons to add skills here)'];
      g.textAlign = 'left';
      g.font = '20px system-ui, sans-serif';
      const cols = 2;
      const perCol = Math.ceil(list.length / cols);
      list.forEach((s, i) => {
        const c = Math.floor(i / perCol);
        const r = i % perCol;
        g.fillStyle = '#1f7a4d';
        g.fillText('✓', 120 + c * 720, 480 + r * 27);
        g.fillStyle = '#1d1f1e';
        g.fillText(s.length > 60 ? s.slice(0, 59) + '…' : s, 150 + c * 720, 480 + r * 27);
      });
      g.textAlign = 'center';
      g.fillStyle = '#6e736f';
      g.font = '22px system-ui, sans-serif';
      g.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 800, 1050);
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

  stage.focusObjects = [b.bb.group, plant.group];
  go(cur);

  return () => {
    cleanupStep?.();
    stage.dispose();
  };
}
