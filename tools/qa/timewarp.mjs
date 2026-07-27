// Reproduce long-session drift without sitting there for an hour.
//
// three's Clock reads performance.now(), so patching that before any app code
// runs makes the scene's own clock advance N times faster while rAF still ticks
// at real 60fps. Nothing in the app needs a test hook.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/vansh/OPUS/package.json');
const puppeteer = require('puppeteer-core');

const OUT = 'C:\\Users\\vansh\\AppData\\Local\\Temp\\claude\\C--Users-vansh-OPUS\\d2f0b4af-ca79-44c1-9fe7-1d34f058931a\\scratchpad\\shots';
mkdirSync(OUT, { recursive: true });

const SPEED = Number(process.argv[2] || 60);
const REAL_SECONDS = Number(process.argv[3] || 14);
const TAG = process.argv[4] || 'warp';
const SECTION = process.argv[5] || 'core';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  userDataDir: path.join(OUT, '..', 'pptr-warp'),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--no-first-run', '--hide-scrollbars'],
  defaultViewport: { width: 1100, height: 800, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
await page.evaluateOnNewDocument((speed) => {
  const orig = performance.now.bind(performance);
  const t0 = orig();
  Object.defineProperty(performance, 'now', {
    configurable: true,
    writable: true,
    value: () => t0 + (orig() - t0) * speed,
  });
  // rAF hands its callback an unpatched timestamp. Code that seeds a previous
  // time from performance.now() and then advances it from the frame argument
  // would see the two clocks disagree by the whole warp factor, producing
  // negative deltas — an artefact of the instrument, not of the app.
  const rafOrig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => rafOrig(() => cb(performance.now()));
}, SPEED);

const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

const QUALITY = process.argv[6] || 'high';
await page.goto(`http://localhost:3000/?quality=${QUALITY}`, { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));

// Park on the section where the connection network is fully drawn.
await page.evaluate((sid) => {
  const el = document.querySelector(`[data-section="${sid}"]`);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
}, SECTION);

await new Promise((r) => setTimeout(r, REAL_SECONDS * 1000));

const t = await page.evaluate(() => performance.now() / 1000);
console.log(`SCENE_TIME ~${Math.round(t)}s (${(t / 60).toFixed(1)} min) quality=${QUALITY}`);

// Mean luminance of the canvas centre: a number to compare runs by, rather
// than eyeballing two screenshots.
console.log('LUMA ' + JSON.stringify(await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const off = document.createElement('canvas');
  off.width = 240; off.height = 240;
  const ctx = off.getContext('2d');
  ctx.drawImage(c, c.width / 2 - 120, c.height / 2 - 120, 240, 240, 0, 0, 240, 240);
  const d = ctx.getImageData(0, 0, 240, 240).data;
  let sum = 0, sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += v;
    if (v > 250) sat++;
  }
  return { meanLuma: +(sum / (d.length / 4)).toFixed(1), pctSaturated: +((sat / (d.length / 4)) * 100).toFixed(1) };
})));

// Hide the DOM so only the WebGL layer is judged.
await page.evaluate(() => {
  document.querySelectorAll('body > *').forEach((el) => {
    if (!el.querySelector('canvas') && el.tagName !== 'SCRIPT') el.style.display = 'none';
  });
  document.body.style.background = '#05050a';
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: path.join(OUT, `warp-${TAG}.png`) });

console.log('ERRORS ' + JSON.stringify(errors.slice(0, 4)));
await browser.close();
