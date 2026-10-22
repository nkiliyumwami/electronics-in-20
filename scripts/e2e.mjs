// End-to-end checks of each lesson's "do it in 3D" task and failure states,
// driven through the real UI (keyboard-accessible controls).
// Usage: npm run build && node scripts/e2e.mjs [lessonIds...]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const base = pathToFileURL(resolve('dist/index.html')).href;
const only = process.argv.slice(2);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

// ------------------------------------------------------------- helpers
async function open(id) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // QUERY=nowebgl runs every scenario on the 2D fallback. By default the tests use
  // ?lowq: shadows only cost time in the software renderer and never change task logic.
  const q = `?${process.env.QUERY ?? 'lowq'}`;
  await page.goto(id === 'capstone' ? `${base}${q}#/capstone` : `${base}${q}#/lesson/${id === 'progress' ? '1.1' : id}`);
  await page.waitForSelector('.panel .ctl, .panel .btn', { timeout: 15000 });
  await page.waitForTimeout(600);
  page.errors = errors;
  return page;
}
/** Set a range input (by aria-label) to a raw slider position and fire input. */
async function setRange(page, label, pos) {
  await page.evaluate(
    ([label, pos]) => {
      const el = [...document.querySelectorAll('input[type=range]')].find((i) => i.getAttribute('aria-label') === label);
      if (!el) throw new Error(`no slider ${label}`);
      el.value = String(pos);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    [label, pos],
  );
}
/** Log-slider position for a value. */
const logPos = (v, min, max) => Math.round((Math.log(v / min) / Math.log(max / min)) * 1000);
async function select(page, label, value) {
  await page.selectOption(`select[aria-label="${label}"]`, value);
}
async function click(page, text) {
  // Controls live in the panel; the parts list can contain buttons with the same names.
  await page.locator('.panel').getByRole('button', { name: text, exact: true }).first().click();
}
async function clickIn(page, scope, text) {
  await page.locator(scope).getByRole('button', { name: text, exact: true }).first().click();
}
/** Click "Check my scene" on question n (1-based) and return the feedback text. */
async function checkTask(page, n) {
  const q = page.locator('.q').nth(n - 1);
  await q.getByRole('button', { name: /Check/ }).click();
  await page.waitForTimeout(150);
  return (await q.locator('.fb').innerText()).replace(/\s+/g, ' ');
}
/** Wait until a readout shows the given text (polling). */
async function waitReadout(page, label, re, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await page.locator(`.readout:has-text("${label}") .v`).innerText();
    if (re.test(v)) return v;
    await page.waitForTimeout(200);
  }
  return null;
}
async function failCard(page, ms = 4000) {
  try {
    await page.waitForSelector('.failcard', { timeout: ms });
    return (await page.locator('.failcard').innerText()).replace(/\s+/g, ' ');
  } catch {
    return null;
  }
}

let failures = 0;
function expect(cond, msg) {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
}

// ------------------------------------------------------------- scenarios
const SCENARIOS = {
  async '1.1'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), `default probes across the resistor → not yet (${fb.slice(0, 60)})`);
    await select(page, 'black probe position', 'c11');
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), `both probes on the + wire → done (${fb.slice(0, 50)})`);
  },
  async '1.2'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet') && /LOW/.test(fb), `pin LOW → not yet (${fb.slice(0, 60)})`);
    await click(page, 'D16 (GPIO 16) is LOW');
    fb = await checkTask(page, 3);
    const i = await page.locator('.readout:has-text("LED current") .v').innerText();
    expect(fb.startsWith('Done') && /5\.9 mA/.test(i), `HIGH with 220 Ω → ${i} → done`);
    // 47 Ω: over 20 mA, warning but no failure.
    await setRange(page, 'Resistor', 2);
    fb = await checkTask(page, 3);
    const w = await page.locator('.readout:has-text("LED current") .v').innerText();
    expect(/27\.7 mA/.test(w) && /more than 15 mA/.test(fb) && !(await page.locator('.failcard').count()), `47 Ω → ${w}, warned, not burned`);
    // 22 Ω: over the pin's 40 mA maximum → the LED burns.
    await setRange(page, 'Resistor', 1);
    const card = await failCard(page);
    expect(card && /59 mA/.test(card) && /40 mA/.test(card), `22 Ω burns the LED (${(card ?? 'no card').slice(0, 70)})`);
    await clickIn(page, '.failcard', 'Undo (new LED, 220 Ω)');
    await page.waitForTimeout(200);
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), 'undo restores 220 Ω and a working LED');
    // Numeric question traps.
    const q1 = page.locator('.q').nth(0);
    await q1.locator('input').fill('10');
    await q1.getByRole('button', { name: 'Check' }).click();
    let t = await q1.locator('.fb').innerText();
    expect(/full 3\.3 V/.test(t), 'q1: 10 mA → "you used the full 3.3 V"');
    await q1.locator('input').fill('3.94');
    await q1.getByRole('button', { name: 'Check' }).click();
    t = await q1.locator('.fb').innerText();
    expect(/^Right/.test(t), 'q1: 3.94 mA → right');
  },
  async '1.3'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'not measured yet → not yet');
    let m = await page.locator('.readout:has-text("Meter shows") .v').innerText();
    expect(/3\.30 V/.test(m), `first check: 3V3 to GND reads ${m}`);
    await click(page, 'Amps (A)');
    const card = await failCard(page);
    expect(card && /fuse blew/i.test(card), 'amps across 3V3 and GND blows the fuse');
    await clickIn(page, '.failcard', 'Replace fuse');
    await click(page, 'Pull out the link wire');
    await select(page, 'red probe position', 'c22');
    await select(page, 'black probe position', 'c24');
    await page.waitForTimeout(200);
    m = await page.locator('.readout:has-text("Meter shows") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && /5\.9 mA/.test(m), `meter in the gap reads ${m} → done`);
  },
  async '2.1'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet') && /one strip/.test(fb), `both legs on one strip → not yet (${fb.slice(0, 60)})`);
    await select(page, 'LED position', 'off');
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'legs in 25/26 → not connected → not yet');
    await select(page, 'LED position', 'right');
    const led = await page.locator('.readout:has-text("LED") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && /lit/.test(led), `legs in 23/24 → ${led} → done`);
    await select(page, 'Show what is joined to', '24');
    const lbl = await page.locator('.lbl', { hasText: 'Joined: column 24' }).first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
    expect(lbl, 'strip explorer labels column 24');
  },
  async '2.2'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'signal wire only → not yet');
    await select(page, 'Wire from', 'aGnd');
    await select(page, 'Wire to', 'bSig');
    await click(page, 'Add wire');
    await click(page, "Press the sensor's test button");
    const card = await failCard(page);
    expect(card && /shorted/.test(card), 'sensor GND to ESP32 input while pressed → short warning');
    await clickIn(page, '.failcard', 'Undo (remove that wire)');
    await select(page, 'Wire from', 'aGnd');
    await select(page, 'Wire to', 'bGnd');
    await click(page, 'Add wire');
    await page.waitForTimeout(300);
    const reads = await page.locator('.readout:has-text("ESP32 reads") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && reads === 'HIGH', `GND wire added, button pressed, ESP32 reads ${reads} → done`);
  },
  async '2.3'(page) {
    await click(page, 'Bridge 3V3 to GND (short)');
    const card = await failCard(page, 4000);
    expect(card && /USB port switched off/.test(card), `bridge → USB port cuts out (${(card ?? '').slice(0, 80)})`);
    await clickIn(page, '.failcard', 'Undo (remove the stray wire)');
    let esp = await page.locator('.readout:has-text("ESP32") .v').first().innerText();
    expect(esp === 'running', `after undo the ESP32 is ${esp}`);
    await click(page, 'Pull out the red jumper');
    const led = await page.locator('.readout:has-text("LED") .v').innerText();
    expect(led === 'dark', 'red jumper pulled → LED dark');
    await click(page, 'Push the red jumper back in');
    await click(page, 'Start the fault hunt');
    await click(page, 'Unplug USB');
    let broken = null;
    for (const w of ['w1', 'w2', 'w3']) {
      await select(page, 'red probe position', `${w}a`);
      await select(page, 'black probe position', `${w}b`);
      await page.waitForTimeout(100);
      const m = await page.locator('.note[aria-live]').first().innerText();
      if (/OL/.test(m)) broken = w;
    }
    expect(!!broken, `beeper found the open jumper: ${broken}`);
    const names = { w1: 'red jumper', w2: 'yellow link', w3: 'black jumper' };
    await click(page, `Replace the ${names[broken ?? 'w1']}`);
    await page.waitForTimeout(200);
    const fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), `replaced the proven jumper → done (${fb.slice(0, 50)})`);
  },
  async '2.4'(page) {
    let l1 = await page.locator('.readout:has-text("LED 1") .v').innerText();
    expect(l1 === 'dark', `series on 3.3 V: LED 1 is ${l1} (needs 4.0 V)`);
    await click(page, '5 V (VIN)');
    l1 = await page.locator('.readout:has-text("LED 1") .v').innerText();
    expect(/lit/.test(l1), `series on 5 V: LED 1 ${l1}`);
    await click(page, 'Pull LED 1 out');
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet') && /dark/.test(fb), 'series with one LED out → the other is dark');
    await click(page, '3.3 V (3V3 rail)');
    await click(page, 'Parallel (side by side)');
    fb = await checkTask(page, 3);
    const i = await page.locator('.readout:has-text("Supply current") .v').innerText();
    expect(fb.startsWith('Done'), `parallel with one out → done (supply ${i})`);
    await click(page, 'Put LED 1 back');
    const both = await page.locator('.readout:has-text("Supply current") .v').innerText();
    expect(/11\.8 mA/.test(both), `both in parallel: ${both} (5.9 + 5.9 mA)`);
  },
  async '3.1'(page) {
    await page.waitForTimeout(1500);
    const ghost = await page.locator('.readout:has-text("Presses counted") .v').innerText();
    expect(Number(ghost) > 0, `floating pin counts ghost presses while idle (${ghost})`);
    // GPIO 34: INPUT_PULLUP does nothing there.
    await click(page, 'D34 (GPIO 34, input-only)');
    await click(page, 'INPUT_PULLUP in code');
    let fb = await checkTask(page, 3);
    expect(/no effect on GPIO 34/.test(fb), 'INPUT_PULLUP on GPIO 34 → still floating');
    await click(page, 'External 10 kΩ pull-up');
    await click(page, 'Reset counter');
    await click(page, 'Press the button once');
    await page.waitForTimeout(5000); // one slow-motion press lasts about 3 s
    const bounced = await page.locator('.readout:has-text("Presses counted") .v').innerText();
    expect(Number(bounced) > 1, `pull-up but no debounce: one press counted ${bounced} times`);
    await click(page, 'Software debounce (20 ms)');
    await click(page, 'Reset counter');
    await click(page, 'Press the button once');
    await page.waitForTimeout(5000);
    const one = await page.locator('.readout:has-text("Presses counted") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && one === '1', `external pull-up + debounce: counted ${one} → done (${fb.slice(0, 80)})`);
  },
  async '3.2'(page) {
    const raw = await page.locator('.readout:has-text("analogRead(34)") .v').innerText();
    const v = await page.locator('.readout:has-text("Voltage at D34") .v').innerText();
    expect(raw === '2606' && v === '2.10 V', `full battery through 100k/100k: ${v}, raw ${raw}`);
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), '100k/100k → done');
    await select(page, 'R1 (top)', '10000');
    await select(page, 'R2 (bottom)', '10000');
    fb = await checkTask(page, 3);
    expect(/210 µA/.test(fb), `10k/10k → drains 210 µA (${fb.slice(0, 70)})`);
    await click(page, 'Remove the divider (wire the battery straight in)');
    const card = await failCard(page);
    expect(card && /3\.6 V/.test(card), 'no divider at 4.2 V → over the pin\'s limit');
    await clickIn(page, '.failcard', 'Undo (put the divider back)');
    const q1 = page.locator('.q').nth(0);
    await q1.locator('input').fill('3.40');
    await q1.getByRole('button', { name: 'Check' }).click();
    const t = await q1.locator('.fb').innerText();
    expect(/top resistor/.test(t), 'q1: 3.40 V → "that is across R1"');
  },
  async '3.3'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet') && /Record both/.test(fb), 'uncalibrated → not yet');
    await setRange(page, 'Soil moisture (time-lapse)', 0);
    await click(page, 'Record DRY (now)');
    await setRange(page, 'Soil moisture (time-lapse)', 100);
    await click(page, 'Record WET (now)');
    await page.waitForTimeout(800);
    const cal = await page.locator('.readout:has-text("Recorded points") .v').innerText();
    expect(/DRY 29\d\d · WET 12\d\d/.test(cal), `calibration recorded: ${cal}`);
    await setRange(page, 'Soil moisture (time-lapse)', 52);
    fb = await checkTask(page, 3);
    const p = await page.locator('.readout:has-text("Code says") .v').innerText();
    expect(fb.startsWith('Done'), `calibrated, soil ~50% → ${p} → done`);
  },
  async '3.4'(page) {
    await setRange(page, 'Sensor output voltage', 5);
    const card = await failCard(page);
    expect(card && /3\.6 V/.test(card), '5 V straight into D4 → over the limit');
    await clickIn(page, '.failcard', 'Undo (fit the divider)');
    await setRange(page, 'Sensor output voltage', 5);
    const v = await page.locator('.readout:has-text("Voltage at D4") .v').innerText();
    const r = await page.locator('.readout:has-text("ESP32 reads") .v').innerText();
    const fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && v === '3.33 V' && r === 'HIGH', `divider: 5 V → ${v}, reads ${r} → done`);
  },
  async '3.5'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'PA5 starts as input');
    await page.selectOption('select:has(option[value="5"])', '5');
    await click(page, 'Output (drive)');
    await click(page, 'HIGH (3.3 V)');
    const led = await page.locator('.readout:has-text("LED on PA5") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && led === 'lit', `PA5 output HIGH → LED ${led} → done`);
    await setRange(page, 'Explode the chip', 1);
  },
  async '4.1'(page) {
    await setRange(page, 'Input voltage', 2.0);
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), '2.0 V → both disagree? no → not yet');
    await setRange(page, 'Input voltage', 3.0);
    const a = await page.locator('.readout:has-text("3.3 V chip reads") .v').innerText();
    const b = await page.locator('.readout:has-text("5 V chip reads") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && a === 'HIGH' && b === 'undefined', `3.0 V → 3.3 V chip ${a}, 5 V chip ${b} → done`);
  },
  async '4.2'(page) {
    await page.waitForTimeout(1500);
    const ghost = await page.locator('.readout:has-text("Presses counted") .v').innerText();
    expect(Number(ghost) > 0, `floating pin counts ghost presses while idle (${ghost})`);
    await click(page, 'Pull-up resistor (10 kΩ)');
    await click(page, 'Reset counter');
    await click(page, 'Press the button once');
    await page.waitForTimeout(5000); // one slow-motion press lasts about 3 s
    const bounced = await page.locator('.readout:has-text("Presses counted") .v').innerText();
    expect(Number(bounced) > 1, `pull-up but no debounce: one press counted ${bounced} times`);
    await click(page, 'Software debounce (20 ms)');
    await click(page, 'Reset counter');
    await click(page, 'Press the button once');
    await page.waitForTimeout(5000);
    const one = await page.locator('.readout:has-text("Presses counted") .v').innerText();
    const fb = await checkTask(page, 3);
    expect(fb.startsWith("Done") && one === "1", `pull-up + debounce: counted ${one} → done (${fb.slice(0, 140)})`);
  },
  async '4.3'(page) {
    await click(page, 'SPI (fast)');
    await click(page, 'Send');
    await page.waitForTimeout(3500);
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'SPI send does not satisfy the I2C task');
    await click(page, 'UART (2 devices)');
    await click(page, 'Send');
    await page.waitForTimeout(3500);
    await click(page, 'I2C (2 wires)');
    await click(page, 'Send');
    await page.waitForTimeout(3500);
    const log = await page.locator('ol').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && /Temp sensor answered/.test(log), 'I2C to 0x48 → answered → done');
  },
  async '5.1'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'default budget lasts under a week');
    await click(page, 'Status LED on (20 mA)');
    await click(page, 'Burst once a minute');
    await click(page, 'Sleep (0.05 mA)');
    const life = await page.locator('.readout:has-text("Estimated life") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), `lean setup → ${life} → done`);
    const peak = await page.locator('.readout:has-text("Peak current") .v').innerText();
    expect(/801 mA/.test(peak), `peak still includes the 800 mA burst (${peak})`);
  },
  async '5.2'(page) {
    const card = await failCard(page, 9000);
    expect(card && /Thermal shutdown/.test(card), 'LDO at 12 V / 500 mA → thermal shutdown');
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'LDO setup fails the task');
    await clickIn(page, '.failcard', 'Switch to the buck regulator');
    await page.waitForTimeout(500);
    fb = await checkTask(page, 3);
    const heat = await page.locator('.readout:has-text("Heat in regulator") .v').innerText();
    expect(fb.startsWith('Done'), `buck regulator, heat ${heat} → done`);
  },
  async '5.3'(page) {
    await page.waitForTimeout(1500);
    const r = await page.locator('.readout:has-text("Chip resets") .v').innerText();
    expect(Number(r) > 0, `no cap → chip resets (${r})`);
    await click(page, 'Fit the 100 nF capacitor');
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'cap 40 mm away → not yet');
    await setRange(page, 'Capacitor distance from the power pin', 4);
    await page.waitForTimeout(300);
    const dip = await page.locator('.readout:has-text("Dip during") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), `cap at 4 mm → dip ${dip} → done`);
  },
  async '6.1'(page) {
    const wire = async (a, b) => {
      await select(page, 'Connect from pin', a);
      await select(page, 'Connect to pin', b);
      await click(page, 'Connect');
    };
    await wire('BT1.+', 'BT1.-');
    let fb = await checkTask(page, 3);
    expect(/short/i.test(fb), 'battery + to − flagged as a short');
    await page.locator('.panel').getByRole('button', { name: /Remove wire BT1/ }).first().click();
    const goal = [['BT1.+', 'SW1.1'], ['SW1.1', 'R2.1'], ['SW1.2', 'R1.1'], ['R1.1', 'Q1.G'], ['R2.2', 'D1.A'], ['D1.K', 'Q1.D'], ['Q1.S', 'R1.2'], ['R1.2', 'BT1.-']];
    for (const [a, b] of goal) await wire(a, b);
    const n = await page.locator('.readout:has-text("Goal nets") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), `all nets (${n}) → done`);
    await click(page, 'Press SW1 (simulate)');
    const sim = await page.locator('.readout:has-text("Simulation") .v').innerText();
    expect(/LED on/.test(sim), `button press lights the LED (${sim})`);
  },
  async '6.2'(page) {
    const place = async (part, fp) => {
      await select(page, 'Part', part);
      await select(page, 'Footprint', fp);
      await click(page, 'Place it');
      await page.waitForTimeout(150);
    };
    await place('R', 'm0603');
    const card = await failCard(page, 2000);
    expect(card && /imperial 0201/.test(card), 'metric/imperial trap explained');
    await page.waitForTimeout(1800);
    await place('J', 'tht254');
    const card2 = await failCard(page, 2000);
    expect(card2 && /2\.0 mm/.test(card2), 'JST pitch mismatch explained');
    await page.waitForTimeout(1800);
    for (const [p, f] of [['R', 'r0805'], ['Q', 'sot23'], ['LED', 'tht254'], ['J', 'jstph']]) await place(p, f);
    const fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), 'all four parts on their footprints → done');
  },
  async '6.3'(page) {
    let fb = await checkTask(page, 2);
    expect(fb.startsWith('Not yet') && /\+76/.test(fb), `starts at 0.4 mm, +76 °C → not yet (${fb.slice(0, 60)})`);
    await setRange(page, 'Power trace width (3 A)', 0.9);
    const r = await page.locator('.readout:has-text("Temperature rise") .v').innerText();
    fb = await checkTask(page, 2);
    expect(fb.startsWith('Done') && r === '+20 °C', `0.9 mm → ${r} → done`);
    await setRange(page, 'Power trace width (3 A)', 0.2);
    const card = await failCard(page, 9000);
    expect(card && /burned/.test(card), '0.2 mm at 3 A → trace burns');
    await clickIn(page, '.failcard', 'Undo (new board, 0.9 mm trace)');
    await click(page, 'Cut a slot in the ground plane');
    const ret = await page.locator('.readout:has-text("Return current") .v').innerText();
    expect(/detours/.test(ret), 'slot → return current detours');
    await click(page, 'Show me the via');
  },
  async '6.4'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'four problems → not yet');
    await click(page, 'Run DRC (layout)');
    await click(page, 'Run ERC (schematic)');
    const d = await page.locator('.readout:has-text("DRC errors") .v').innerText();
    const e = await page.locator('.readout:has-text("ERC errors") .v').innerText();
    expect(d === '3' && e === '1', `DRC finds ${d}, ERC finds ${e}`);
    for (const label of ['Re-route the IND trace away from the via', 'Route the LED_A connection', 'Snap C1 onto its pads', 'Add the 10 kΩ pull-up (R1) to the schematic']) {
      await page.locator('.panel').getByRole('button', { name: label }).first().click();
    }
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet') && /again/.test(fb), 'fixed but not re-run → asks to re-run');
    await click(page, 'Run DRC (layout)');
    await click(page, 'Run ERC (schematic)');
    fb = await checkTask(page, 3);
    const d2 = await page.locator('.readout:has-text("DRC errors") .v').innerText();
    expect(fb.startsWith('Done') && d2 === '0', 'clean re-run → done');
  },
  async '7.1'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'vague BOM line → not yet');
    await select(page, 'C1 manufacturer part number', 'CL10B104KB8NNNC');
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet') && /0603/.test(fb), 'right value, wrong package → explained');
    await select(page, 'C1 manufacturer part number', 'CL21B104KBCNNNC');
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done'), 'exact 0805 part → done');
    for (let i = 0; i < 7; i++) await click(page, 'Next step →');
    const step = await page.locator('.readout:has-text("Step") .v').innerText();
    expect(/Cut out/.test(step), `stepped through the factory (${step})`);
  },
  async '7.2'(page) {
    await click(page, 'Uneven on C1');
    await click(page, 'Run the whole line');
    const r1 = await waitReadout(page, 'Result', /tombstone|flat/, 60000);
    expect(r1 && /tombstone/.test(r1), `uneven paste → ${r1}`);
    await clickIn(page, '.failcard', 'Start over');
    await click(page, 'Even on both pads');
    await click(page, 'Run the whole line');
    const r2 = await waitReadout(page, 'Result', /tombstone|flat/, 60000);
    const fb = await checkTask(page, 3);
    expect(r2 && /flat/.test(r2) && fb.startsWith('Done'), `even paste → ${r2} → done`);
  },
  async '7.3'(page) {
    await click(page, 'Output ON');
    let card = await failCard(page, 6000);
    expect(card && /burned/.test(card), 'full power into the short at 3 A → burns');
    await clickIn(page, '.failcard', 'Undo (fresh board, output off)');
    await setRange(page, 'Current limit', logPos(0.1, 0.01, 3));
    await click(page, 'Output ON');
    card = await failCard(page, 4000);
    expect(card && /saved the board/.test(card), '100 mA limit → supply reports CC, nothing burns');
    await click(page, 'Output OFF');
    await click(page, '1. Inspect with a magnifier');
    await click(page, 'Ohms (Ω)');
    await select(page, 'red probe position', 'tp5');
    await select(page, 'black probe position', 'tpg');
    await page.waitForTimeout(300);
    const m = await page.locator('.note[aria-live]').filter({ hasText: 'Meter:' }).first().innerText();
    expect(/0\.0\d Ω/.test(m), `meter shows the short: ${m}`);
    await click(page, 'Remove the solder bridge');
    await click(page, 'Volts (V)');
    await click(page, 'Output ON');
    await page.waitForTimeout(500);
    const fb = await checkTask(page, 3);
    const v = await page.locator('.readout:has-text("Supply shows V") .v').innerText();
    expect(fb.startsWith('Done'), `bridge removed, 100 mA limit, rail ${v} → done`);
    await click(page, 'Press SW1 (test the signal)');
  },
  async capstone(page) {
    const btn = (name) => page.getByRole('button', { name, exact: true }).first().click();
    for (let i = 0; i < 7; i++) await btn('Show me one net');
    await btn('Check my schematic');
    await btn('Next: Footprints →');
    const fps = { U1: 'SOIC-8', Q1: 'SOT-23', C1: '0805', R1: '0805', R2: '0805', D1: '0805', SW1: 'SMD 6x6', J1: 'JST-PH 2.0 mm', J2: 'JST-PH 2.0 mm' };
    for (const [r, f] of Object.entries(fps)) await page.selectOption(`select[aria-label="Footprint for ${r}"]`, f);
    await btn('Check footprints');
    let note = await page.locator('.panel .note').first().innerText();
    expect(/J2/.test(note), `J2 on a 2 A connector is rejected (${note.slice(0, 60)})`);
    await page.selectOption('select[aria-label="Footprint for J2"]', 'JST-XH 2.5 mm');
    await btn('Check footprints');
    await btn('Next: Placement →');
    await btn('Next to the battery connector J1');
    await btn('Place all parts');
    note = await page.locator('.panel .note').first().innerText();
    expect(/VCC/.test(note), 'C1 far from U1 is rejected');
    await btn("Right at U1's VCC pin");
    await btn('Place all parts');
    await btn('Next: Routing →');
    await page.selectOption('select[aria-label="Power trace width"]', '0.5');
    await btn('Route the board');
    await btn('Next: Checks →');
    await btn('Run DRC + ERC + current check');
    const out = await page.locator('.panel [aria-live]').first().innerText();
    expect(/\+52 °C/.test(out), `0.5 mm power trace fails the current check (${out.slice(0, 90)})`);
    await btn('← Back to routing');
    await page.selectOption('select[aria-label="Power trace width"]', '0.9');
    await btn('Route the board');
    await btn('Next: Checks →');
    await btn('Run DRC + ERC + current check');
    const ok = await page.locator('.panel [aria-live]').first().innerText();
    expect(/0 errors/.test(ok), `0.9 mm: ${ok}`);
    await btn('Next: 3D view →');
    await setRange(page, 'Explode the board', 1);
    await btn('Looks good →');
    await btn('Next: Power-up →');
    await setRange(page, 'Current limit', logPos(0.1, 0.01, 4));
    await btn('Output ON');
    await btn('Connect the LED strip');
    await setRange(page, 'Current limit', 1000);
    await btn('Press SW1');
    const stt = await waitReadout(page, 'Status', /strip on/, 5000);
    expect(!!stt, `safe first power-up, then strip at full current: ${stt}`);
    await btn('Next: Certificate →');
    await page.fill('input[aria-label="Your name"]', 'Test Learner');
    const href = await page.locator('a[download]').getAttribute('href');
    expect(href && href.startsWith('data:image/png'), 'certificate PNG ready to download');
    const navDone = await page.locator('.steps .st.done').count();
    expect(navDone === 8, `all 8 capstone steps ticked (${navDone})`);
  },
  async progress(page) {
    // Fresh lesson: Next is locked until all three questions are attempted.
    const next = page.locator('nav .btn.primary');
    expect((await next.getAttribute('aria-disabled')) === 'true', 'Next starts locked');
    await page.locator('.q').nth(0).getByRole('button', { name: /second point/ }).click();
    await page.locator('.q').nth(1).getByRole('button', { name: 'Current', exact: true }).click();
    const fb = await page.locator('.q').nth(1).locator('.fb').innerText();
    expect(/Hint/.test(fb), 'wrong answer shows a hint, no penalty');
    await page.locator('.q').nth(1).getByRole('button', { name: 'Voltage', exact: true }).click();
    await checkTask(page, 3);
    expect((await next.getAttribute('aria-disabled')) === 'false', 'Next unlocks after all three attempts');
    await page.goto(page.url().replace(/#.*$/, '#/'));
    await page.waitForTimeout(800);
    const ticks = await page.locator('.lesson-link .tick.done').count();
    const skills = await page.locator('.cando p.note').innerText();
    expect(ticks === 1 && /2 of \d+ skills/.test(skills), `course map: ${ticks} lesson done, ${skills}`);
    await page.reload();
    await page.waitForTimeout(800);
    expect((await page.locator('.lesson-link .tick.done').count()) === 1, 'progress survives a reload (localStorage)');
  },
};

for (const [id, run] of Object.entries(SCENARIOS)) {
  if (only.length && !only.includes(id)) continue;
  console.log(`Lesson ${id}`);
  const page = await open(id);
  try {
    await run(page);
  } catch (e) {
    expect(false, `scenario crashed: ${e.message.split('\n')[0]}`);
  }
  expect(page.errors.length === 0, `no page errors${page.errors.length ? ': ' + page.errors.join(' | ') : ''}`);
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nAll e2e checks passed.');
process.exit(failures ? 1 : 0);
