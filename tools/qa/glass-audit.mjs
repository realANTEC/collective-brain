// Systematic audit for the bug classes found in the search field:
//   A. .glass / .glass-deep with backdrop-filter dropped by the CSS pipeline
//   B. position:fixed whose containing block was retargeted by an ancestor
//      transform/filter/backdrop-filter/will-change/contain/perspective
//   C. position:sticky trapped inside a scroll container (overflow != visible)
//   D. translucent overlay panels that let content read through
//   E. z-index trapped in an ancestor stacking context while static
//
// Usage: node glass-audit.mjs <url> <width> <height> <label> [openMenu|openPalette|focusSearch]
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/vansh/OPUS/package.json');
const puppeteer = require('puppeteer-core');

const OUT = 'C:\\Users\\vansh\\AppData\\Local\\Temp\\claude\\C--Users-vansh-OPUS\\d2f0b4af-ca79-44c1-9fe7-1d34f058931a\\scratchpad\\shots';
const [url, w, h, label, action] = process.argv.slice(2);
const W = Number(w), H = Number(h);

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  userDataDir: path.join(OUT, '..', 'pptr-audit'),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--no-first-run', '--hide-scrollbars'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: W < 500, hasTouch: W < 500 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 6000));

if (action === 'openMenu') {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('header button')]
      .find((x) => /menu/i.test(x.getAttribute('aria-label') || ''));
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 1300));
} else if (action === 'openPalette') {
  await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 1300));
} else if (action === 'focusSearch') {
  await page.focus('input[type=search]').catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
}

const report = await page.evaluate(() => {
  const CB_RE = /transform|filter|perspective|backdrop/;
  const cbAncestor = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      const reasons = [];
      if (cs.transform !== 'none') reasons.push('transform:' + cs.transform.slice(0, 24));
      if (cs.filter !== 'none') reasons.push('filter:' + cs.filter.slice(0, 24));
      if (cs.backdropFilter !== 'none') reasons.push('backdrop-filter');
      if (cs.perspective !== 'none') reasons.push('perspective');
      if (cs.willChange !== 'auto' && CB_RE.test(cs.willChange)) reasons.push('will-change:' + cs.willChange);
      if (cs.contain !== 'none' && /paint|layout|strict|content/.test(cs.contain)) reasons.push('contain:' + cs.contain);
      if (reasons.length) {
        return { tag: p.tagName.toLowerCase(), cls: (p.className?.toString?.() || '').slice(0, 60), reasons };
      }
      p = p.parentElement;
    }
    return null;
  };

  const scrollAncestor = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      // `clip` does not create a scroll container; hidden/auto/scroll do.
      for (const axis of ['overflowX', 'overflowY']) {
        if (['hidden', 'auto', 'scroll'].includes(cs[axis])) {
          return { tag: p.tagName.toLowerCase(), cls: (p.className?.toString?.() || '').slice(0, 60), axis, value: cs[axis] };
        }
      }
      p = p.parentElement;
    }
    return null;
  };

  const desc = (el) => ({
    tag: el.tagName.toLowerCase(),
    cls: (el.className?.toString?.() || '').slice(0, 72),
  });

  const A = [], B = [], C = [], D = [];

  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    const cls = el.className?.toString?.() || '';
    const r = el.getBoundingClientRect();

    // A — glass classes that lost their blur
    if (/\bglass(-deep)?\b/.test(cls) && cs.backdropFilter === 'none') {
      A.push({ ...desc(el), backdrop: cs.backdropFilter });
    }

    // B — fixed elements with a retargeted containing block
    if (cs.position === 'fixed' && r.width > 0) {
      const cb = cbAncestor(el);
      if (cb) {
        B.push({
          ...desc(el),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          viewport: { w: window.innerWidth, h: window.innerHeight },
          coversViewport: Math.abs(r.width - window.innerWidth) < 2 && Math.abs(r.height - window.innerHeight) < 2,
          containingBlock: cb,
        });
      }
    }

    // C — sticky trapped in a scroll container
    if (cs.position === 'sticky') {
      const sa = scrollAncestor(el);
      if (sa) C.push({ ...desc(el), scrollAncestor: sa });
    }

    // D — overlay-ish panels that are see-through
    const isOverlayish = (cs.position === 'fixed' || cs.position === 'absolute') &&
      r.width > 180 && r.height > 90 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    if (isOverlayish) {
      const m = cs.backgroundColor.match(/[\d.]+\s*\)$/);
      const alpha = cs.backgroundColor.includes('/') || /rgba|oklab|oklch|color\(/.test(cs.backgroundColor)
        ? parseFloat((cs.backgroundColor.match(/(?:\/\s*|,\s*)([\d.]+)\s*\)/) || [])[1] ?? '1')
        : 1;
      if (alpha < 0.9) {
        D.push({ ...desc(el), bg: cs.backgroundColor.slice(0, 46), alpha, backdrop: cs.backdropFilter.slice(0, 28) });
      }
    }
  });

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    docScrollWidth: document.documentElement.scrollWidth,
    A_glassWithoutBlur: A,
    B_fixedRetargeted: B,
    C_stickyTrapped: C,
    D_seeThroughOverlays: D.slice(0, 10),
  };
});

console.log('### ' + label);
console.log(JSON.stringify(report, null, 2));
if (errors.length) console.log('CONSOLE_ERRORS ' + JSON.stringify(errors.slice(0, 5), null, 2));
await page.screenshot({ path: path.join(OUT, `audit-${label}.png`) });
await browser.close();
