import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('https://shadowprivacy.tech/', { waitUntil: 'networkidle' });
const r = await p.evaluate(() => {
  const out = [];
  const q = (s) => [...document.querySelectorAll(s)];
  for (const el of q('header, header *, main > *, section, section > div, h1, h2, h3, footer, [class*=rounded]')) {
    const b = el.getBoundingClientRect(); const c = getComputedStyle(el);
    if (b.width < 40 || b.height < 20) continue;
    out.push([el.tagName, (el.className+'').slice(0,50), Math.round(b.x), Math.round(b.y+scrollY), Math.round(b.width), Math.round(b.height), c.fontSize, c.fontWeight, c.padding, c.borderRadius, c.backgroundColor, c.letterSpacing].join('|'));
  }
  return out.slice(0, 140);
});
console.log(r.join('\n'));
await b.close();
