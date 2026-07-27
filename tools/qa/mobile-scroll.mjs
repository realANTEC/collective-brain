// Full mobile coverage: tile the document into viewport-sized frames.
//
// Two passes are required. Scroll reveals are `once: true`, so a frame captured
// without ever having been scrolled past would show its content in the hidden
// state. Pass 1 walks the page slowly to trigger every reveal; pass 2 goes back
// and captures. Viewport slices rather than tall clips on purpose — the WebGL
// canvas is fixed and full-viewport, so a beyond-viewport capture would render
// the core at an aspect ratio no real device ever sees.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/vansh/OPUS/package.json');
const puppeteer = require('puppeteer-core');

const BASE = process.argv[2];
const OUT = process.argv[3];
const W = Number(process.argv[4] || 390);
const H = Number(process.argv[5] || 844);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  userDataDir: path.join(OUT, '..', 'pptr-mob'),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--no-first-run', '--hide-scrollbars'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)); });

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 8000));

const docH = await page.evaluate(() => document.documentElement.scrollHeight);
console.log('DOC_HEIGHT ' + docH);

// Pass 1 — prime every scroll reveal.
for (let y = 0; y < docH; y += Math.round(H * 0.6)) {
  await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
  await new Promise((r) => setTimeout(r, 260));
}
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await new Promise((r) => setTimeout(r, 1500));

// Pass 2 — tile and capture.
const pad = (i) => String(i).padStart(2, '0');
const maxY = Math.max(0, docH - H);
let n = 0;
for (let y = 0; ; y += H) {
  const top = Math.min(y, maxY);
  await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), top);
  // Long enough for the camera to damp to its anchor at this position.
  await new Promise((r) => setTimeout(r, 1700));
  const label = await page.evaluate(() => {
    const mid = window.innerHeight / 2;
    const spans = (el) => {
      const r = el.getBoundingClientRect();
      return r.top <= mid && r.bottom >= mid;
    };
    // Landing page marks sections with data-section; the answer page uses
    // plain <section id> per layer.
    const tagged = [...document.querySelectorAll('[data-section]')].find(spans);
    if (tagged) return tagged.dataset.section;
    const layer = [...document.querySelectorAll('main section[id]')].find(spans);
    return layer?.id ?? 'page';
  });
  await page.screenshot({ path: path.join(OUT, `mob-${pad(++n)}-${label}.png`) });
  if (top >= maxY) break;
}

console.log('FRAMES ' + n);
console.log('ERRORS ' + JSON.stringify(errors.slice(0, 6)));
await browser.close();
