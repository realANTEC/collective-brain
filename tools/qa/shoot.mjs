// Headless capture + diagnostics for the Collective Brain site.
// Uses the locally installed Chrome via puppeteer-core (no browser download),
// with an isolated temp profile so the user's real Chrome is never touched.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// This script lives in the scratchpad, outside the project tree, so resolve
// puppeteer-core against the project's node_modules rather than its own.
const require = createRequire('C:/Users/vansh/OPUS/package.json');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = process.argv[3] || 'C:\\Users\\vansh\\AppData\\Local\\Temp\\claude\\C--Users-vansh-OPUS\\d2f0b4af-ca79-44c1-9fe7-1d34f058931a\\scratchpad\\shots';
const BASE = process.argv[2] || 'http://localhost:3000';
const WIDTH = Number(process.argv[4] || 1440);
const HEIGHT = Number(process.argv[5] || 900);

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: path.join(OUT, '..', 'pptr-profile'),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--window-size=${WIDTH},${HEIGHT}`,
  ],
  defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300));
});

await page.goto(BASE + (BASE.includes('?') ? '&' : '?') + 'quality=high', {
  waitUntil: 'networkidle2',
  timeout: 90000,
});

// Let the preloader finish and the assembly animation settle.
await new Promise((r) => setTimeout(r, 7000));

const diag = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  let gl = null;
  let renderer = '';
  let pixels = null;
  if (c) {
    gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'n/a';
    }
  }
  const s = window.__cbScene;
  return {
    canvas: c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null,
    hasGL: !!gl,
    contextLost: gl ? gl.isContextLost() : null,
    renderer,
    scene: s
      ? {
          ready: s.ready,
          quality: s.quality,
          scrollProgress: Number(s.scrollProgress?.toFixed(3)),
          reducedMotion: s.reducedMotion,
          searchFocus: Number(s.searchFocus?.toFixed(2)),
        }
      : null,
    sections: [...document.querySelectorAll('[data-section]')].map((e) => e.dataset.section),
    docHeight: document.documentElement.scrollHeight,
  };
});

console.log('DIAG ' + JSON.stringify(diag, null, 2));

// Sample the canvas centre to prove the core is actually rasterising.
const lum = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  // Re-render into a 2D canvas: reading the WebGL buffer directly fails once
  // it has been presented (preserveDrawingBuffer is off).
  const off = document.createElement('canvas');
  off.width = 200;
  off.height = 200;
  const ctx = off.getContext('2d');
  try {
    ctx.drawImage(c, c.width / 2 - 100, c.height / 2 - 100, 200, 200, 0, 0, 200, 200);
    const d = ctx.getImageData(0, 0, 200, 200).data;
    let sum = 0;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + d[i + 1] + d[i + 2];
      sum += v;
      if (v > max) max = v;
    }
    return { avg: +(sum / (d.length / 4) / 3).toFixed(2), max };
  } catch (e) {
    return { error: String(e) };
  }
});
console.log('CANVAS_LUMA ' + JSON.stringify(lum));

const shots = JSON.parse(process.env.CB_SHOTS || '["hero","core","connections","convergence","graph","memory","validation","pricing","cta"]');

for (const id of shots) {
  const ok = await page.evaluate((sid) => {
    const el = document.querySelector(`[data-section="${sid}"]`);
    if (!el) return false;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
    return true;
  }, id);
  if (!ok) {
    console.log('MISSING SECTION ' + id);
    continue;
  }
  await new Promise((r) => setTimeout(r, 2200));
  await page.screenshot({ path: path.join(OUT, `${id}.png`) });
}

console.log('ERRORS ' + JSON.stringify(errors.slice(0, 12), null, 2));
await browser.close();
