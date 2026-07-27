// End-to-end: does a real query produce a real answer page?
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/vansh/OPUS/package.json');
const puppeteer = require('puppeteer-core');
const OUT = 'C:\\Users\\vansh\\AppData\\Local\\Temp\\claude\\C--Users-vansh-OPUS\\d2f0b4af-ca79-44c1-9fe7-1d34f058931a\\scratchpad\\shots';

const Q = process.argv[2] || 'How does photosynthesis work?';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  userDataDir: path.join(OUT, '..', 'pptr-live'),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--no-first-run', '--hide-scrollbars'],
  defaultViewport: { width: 1200, height: 950, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
const calls = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('response', (r) => {
  if (r.url().includes('modal.run')) calls.push(`${r.status()} ${r.request().method()} ${r.url().split('modal.run')[1]}`);
});

await page.goto(`http://localhost:3000/answer?q=${encodeURIComponent(Q)}`, {
  waitUntil: 'domcontentloaded',
  timeout: 120000,
});

// Wait for either the answer or the error panel.
await page.waitForFunction(
  () => /Retrieved sources|Answer unavailable/.test(document.body.innerText),
  { timeout: 180000, polling: 500 },
).catch(() => {});

await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: path.join(OUT, 'live-answer.png') });

const info = await page.evaluate(() => {
  const text = document.body.innerText;
  const grab = (re) => (text.match(re) || [])[0] || null;
  return {
    heading: document.querySelector('h1')?.innerText,
    hasSources: /Retrieved sources/.test(text),
    hasError: /Answer unavailable/.test(text),
    sourceLinks: [...document.querySelectorAll('a[href*="simple.wikipedia.org"]')].map(
      (a) => a.textContent.trim().split('\n')[0],
    ),
    meta: grab(/Qwen[^\n]*/i),
    notice: (text.match(/How to read this\n([\s\S]{0,240})/) || [])[1]?.trim(),
  };
});

console.log('MODAL_CALLS ' + JSON.stringify(calls));
console.log('PAGE ' + JSON.stringify(info, null, 2));
console.log('ERRORS ' + JSON.stringify(errors.slice(0, 5)));
await browser.close();
