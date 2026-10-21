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
  await page.goto(`${base}#/lesson/${id}`);
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
  await page.getByRole('button', { name: text, exact: true }).first().click();
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
    await setRange(page, 'Battery voltage', 5);
    await setRange(page, 'Resistor', logPos(250, 10, 10000));
    const out = await page.locator('label:has-text("Resistor") output').innerText();
    let fb = await checkTask(page, 3);
    if (!fb.startsWith('Done')) {
      // nudge until 20 mA (slider steps are discrete)
      for (let i = 0; i < 4 && !fb.startsWith('Done'); i++) {
        await click(page, /Too much/.test(fb) ? 'Increase Resistor' : 'Decrease Resistor');
        fb = await checkTask(page, 3);
      }
    }
    expect(fb.startsWith('Done'), `5 V and ~250 Ω (${out}) → done (${fb.slice(0, 60)})`);
    // Burn it.
    await setRange(page, 'Battery voltage', 12);
    await setRange(page, 'Resistor', logPos(47, 10, 10000));
    const card = await failCard(page, 8000);
    expect(card && /burned open/.test(card), `12 V across 47 Ω burns the resistor (${(card ?? 'no card').slice(0, 70)})`);
    await clickIn(page, '.failcard', 'Undo (fresh resistor)');
    await page.waitForTimeout(300);
    const p = await page.locator('.readout:has-text("Power") .v').innerText();
    expect(!(await page.locator('.failcard').count()), `undo clears the card; power now ${p}`);
    // Numeric question traps.
    const q2 = page.locator('.q').nth(1);
    await q2.locator('input').fill('500');
    await q2.getByRole('button', { name: 'Check' }).click();
    let t = await q2.locator('.fb').innerText();
    expect(/500 mW/.test(t), `500 with unit W → mW hint (${t.replace(/\s+/g, ' ').slice(0, 60)})`);
    await q2.locator('select').selectOption({ label: 'mW' });
    await q2.getByRole('button', { name: 'Check' }).click();
    t = await q2.locator('.fb').innerText();
    expect(/^Right/.test(t.trim()), '500 mW accepted as correct');
  },
  async '1.3'(page) {
    let fb = await checkTask(page, 3);
    expect(fb.startsWith('Not yet'), 'not measured yet → not yet');
    await click(page, 'Amps (A)');
    await select(page, 'red probe position', 'bp');
    await select(page, 'black probe position', 'bm');
    const card = await failCard(page);
    expect(card && /fuse blew/i.test(card), 'amps across the battery blows the fuse');
    await clickIn(page, '.failcard', 'Replace fuse');
    await click(page, 'Break the circuit at the LED');
    await select(page, 'red probe position', 'c9');
    await select(page, 'black probe position', 'c7');
    await page.waitForTimeout(200);
    const m = await page.locator('.readout:has-text("Meter shows") .v').innerText();
    fb = await checkTask(page, 3);
    expect(fb.startsWith('Done') && /13\.6 mA/.test(m), `meter in the gap reads ${m} → done`);
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
