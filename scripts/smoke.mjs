// Headless smoke test: opens pages in installed Chrome, reports console errors,
// saves screenshots to scripts/shots/. Usage:
//   node scripts/smoke.mjs [routes...]   e.g. node scripts/smoke.mjs /lesson/1.1 /
//   BASE=http://localhost:5173 WIDTH=360 node scripts/smoke.mjs /lesson/1.2
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
// Default: the production build on disk (run `npm run build` first). File URLs avoid
// local web filters that intercept http://localhost.
const base = process.env.BASE ?? pathToFileURL(resolve('dist/index.html')).href;
const width = Number(process.env.WIDTH ?? 1280);
const height = Number(process.env.HEIGHT ?? (width < 600 ? 780 : 860));
const wait = Number(process.env.WAIT ?? 2500);
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];
const actions = process.env.ACTIONS ?? ''; // JS run in the page after load

mkdirSync('scripts/shots', { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failures = 0;
for (const r of routes) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(1, 6).join('\n')}`));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`[http ${res.status()}] ${res.url()}`);
  });
  const t0 = Date.now();
  await page.goto(base.endsWith('.html') ? `${base}#${r}` : `${base}/#${r}`, { waitUntil: 'load' });
  await page.waitForTimeout(wait);
  if (actions) {
    try {
      await page.evaluate(actions);
      await page.waitForTimeout(Number(process.env.AFTER ?? 1500));
    } catch (e) {
      errors.push(`[action] ${e.message}`);
    }
  }
  const fps = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t < 1000) requestAnimationFrame(f);
          else res(n);
        };
        requestAnimationFrame(f);
      }),
  );
  const name = `${r.replace(/[^\w.]+/g, '_') || 'home'}_${width}`;
  const shot = `scripts/shots/${name}.png`;
  await page.screenshot({ path: shot, fullPage: process.env.FULL === '1' });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const bad = errors.filter((e) => !/GPU stall|swiftshader|WebGL: |GL Driver Message|Automatic fallback to software/i.test(e));
  if (bad.length) failures++;
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${r} (${Date.now() - t0} ms, ~${fps} fps headless, scrollWidth ${scrollW}/${width}) → ${shot}`);
  for (const e of bad) console.log('     ', e.slice(0, 400));
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
