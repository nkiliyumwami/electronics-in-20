// Close-up screenshots: node scripts/closeup.mjs <route> <x,y,z camera> <x,y,z target> <name>
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [route, cam, tgt, name] = process.argv.slice(2);
const base = pathToFileURL(resolve('dist/index.html')).href;
const b = await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
await p.goto(`${base}?debug&hq#${route}`);
await p.waitForTimeout(2500);
await p.evaluate(([c, t]) => {
  const s = window.__stage;
  if (s.view !== 'real' && s.setView) s.setView('real', false);
  const [cx, cy, cz] = c.split(',').map(Number);
  const [tx, ty, tz] = t.split(',').map(Number);
  s.camera.position.set(cx, cy, cz);
  s.controls.target.set(tx, ty, tz);
  s.controls.update();
}, [cam, tgt]);
await p.waitForTimeout(1500);
await (await p.$('.stage')).screenshot({ path: `scripts/shots/${name}.png` });
await b.close();
console.log(`scripts/shots/${name}.png`);
