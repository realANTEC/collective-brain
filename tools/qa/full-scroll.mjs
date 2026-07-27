// Walk the landing page top to bottom the way a visitor would, capturing each
// section at its composed anchor plus the footer.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/vansh/OPUS/package.json');
const puppeteer = require('puppeteer-core');

const OUT = process.argv[3];
const BASE = process.argv[2];
const W = Number(process.argv[4] || 1440);
const H = Number(process.argv[5] || 900);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  userDataDir: path.join(OUT, '..', 'pptr-full'),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--no-first-run', '--hide-scrollbars'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: W < 500, hasTouch: W < 500 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)); });

await page.goto(BASE + '?quality=high', { waitUntil: 'networkidle2', timeout: 120000 });
// Let the preloader hand off and the core finish assembling.
await new Promise((r) => setTimeout(r, 8000));

const order = ['hero', 'core', 'connections', 'convergence', 'graph', 'memory', 'validation', 'pricing', 'cta'];
let n = 0;
const pad = (i) => String(i).padStart(2, '0');

for (const id of order) {
  const ok = await page.evaluate((sid) => {
    const el = document.querySelector(`[data-section="${sid}"]`);
    if (!el) return false;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
    return true;
  }, id);
  if (!ok) { console.log('MISSING ' + id); continue; }
  // Long settle: the camera damps toward its anchor and reveals must finish.
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT, `scroll-${pad(++n)}-${id}.png`) });
}

// Footer
await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: path.join(OUT, `scroll-${pad(++n)}-footer.png`) });

console.log('FRAMES ' + n);
console.log('ERRORS ' + JSON.stringify(errors.slice(0, 6)));
await browser.close();
