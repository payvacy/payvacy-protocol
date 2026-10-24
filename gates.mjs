import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { chromium } from "playwright-core";
import { build, validateRegister, handleOf } from "./build.mjs";
import { serve } from "./tools/serve.mjs";
import { blocks, gramHashes } from "./tools/textgrams.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "payvacy-gates-"));
const REG_PATH = path.join(ROOT, "src", "data", "register.json");
const baseRegister = () => JSON.parse(fs.readFileSync(REG_PATH, "utf8"));
const FIXTURE_CA = "7Hq4cYfN2zWm8LxkTjRb3VdPaUe5GsZy9XoCnAiQ6Mtu"; // 44 base58 chars, test value only
const FIXTURE_URL = { github: "https://github.com/payvacy-fixture/repo", chart: "https://chart.example.test/payvacy", buy: "https://buy.example.test/payvacy", explorer: "https://explorer.example.test/payvacy", x: "https://x.com/payvacy" };

const results = [];
let n = 0;
async function gate(name, fn) {
  n++;
  try { await fn(); results.push([n, name, true]); console.log(`  ok   ${String(n).padStart(2, "0")} ${name}`); }
  catch (e) { results.push([n, name, false, e.message]); console.log(`  FAIL ${String(n).padStart(2, "0")} ${name}\n       ${e.message.split("\n").join("\n       ")}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");
const walk = (d, skip = []) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => skip.includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name), skip) : [path.join(d, e.name)]);

// ---- mutation harness: anchors are read from the live record, never assumed ----
function flip(reg, id) {
  const r = reg.records[id], before = r.state;
  if (r.state === "stated") { r.state = "absent"; delete r.value; delete r.url; }
  else { r.state = "stated"; if (id === "ca") r.value = FIXTURE_CA; else r.url = FIXTURE_URL[id] || "https://example.test/" + id; if (id === "market-source") r.value = "Fixture"; }
  return { before, after: r.state };
}
function variant(name, mutate) {
  const reg = baseRegister(); const info = mutate ? mutate(reg) : null;
  const out = path.join(TMP, name); build({ register: reg, out });
  return { out, html: read(out, "index.html"), reg, info };
}

// ---- helpers over rendered markup ----
const caSlot = (html) => (html.match(/<div class="ca-bar" data-ca-slot>[\s\S]*?<\/div><\/div>/) || [""])[0];
const socialTag = (html, label) => (html.match(new RegExp(`<(?:a|span) class="social[^"]*"[^>]*aria-label="[^"]*${label}[^"]*"[^>]*>`)) || [""])[0];
const visibleStrings = (html) => blocks(html);
const DATE_RE = /\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b|\b\d{1,2}:\d{2}(:\d{2})?\b|\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b\s+\d|\bas of\b|\bchecked\b|\bago\b|\bupdated\b|(?<![\d.,$])(19|20)\d{2}(?![\d.,])|\bUTC\b|\btimestamp\b/i;
const ADDR_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b|\b0x[0-9a-fA-F]{40}\b/g;
function scanAddresses(text, registry) {
  const allowed = new Set(Object.values(registry.records).filter((r) => r.state === "stated" && r.value).map((r) => r.value));
  return (text.match(ADDR_RE) || []).filter((a) => !allowed.has(a));
}
const stripCaSlots = (html) => html.replace(/<div class="ca-bar" data-ca-slot>[\s\S]*?<\/div><\/div>/g, "").replace(/<div class="ca-card"[^>]*>[\s\S]*?(?=\n<div class="row-chips")/g, "");

console.log("payvacy gates");

/* ===== build output ===== */
await gate("build writes dist/index.html", () => { build({ out: DIST }); assert(fs.existsSync(path.join(DIST, "index.html")), "missing"); });
const html = read(DIST, "index.html");
const css = read(DIST, "assets", "app.css");
const js = read(DIST, "assets", "app.js");

await gate("dist holds site files only (no README, docs, LICENSE, agent files)", () => {
  const names = walk(DIST).map((f) => path.relative(DIST, f).replace(/\\/g, "/"));
  const bad = names.filter((f) => /readme|license|whitepaper|\.md$|claude|\.claude/i.test(f));
  assert(!bad.length, "unexpected: " + bad.join(", "));
});
await gate("logo files copied into dist/assets and decode as RGBA PNG", () => {
  for (const f of ["logo-192.png", "logo-512.png"]) {
    const buf = fs.readFileSync(path.join(DIST, "assets", f)); assert(buf[25] === 6, f + " colourtype " + buf[25]); const p = PNG.sync.read(buf); assert(p.width === +f.match(/\d+/)[0], f + " size");
  }
});
await gate("premultiplied resize left no dark fringe on logo edges", () => {
  const p = PNG.sync.read(fs.readFileSync(path.join(DIST, "assets", "logo-512.png"))); let edge = 0, dark = 0;
  for (let i = 0; i < p.data.length; i += 4) { const a = p.data[i + 3]; if (a > 8 && a < 247) { edge++; if ((p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3 < 200) dark++; } }
  assert(edge > 100, "no edge pixels found"); assert(dark / edge < 0.01, `${dark}/${edge} dark edge pixels`);
});
await gate("index.html references the logo by a relative path that exists in dist", () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:)/.test(u));
  assert(refs.some((r) => /^assets\/logo-\d+\.png$/.test(r)), "no logo reference");
  for (const r of refs) { assert(!r.startsWith("/"), "absolute path " + r); assert(fs.existsSync(path.join(DIST, r)), "missing in dist: " + r); }
});
await gate("favicon.svg is 32x32, linked, with no comments and no double hyphens", () => {
  const s = read(DIST, "favicon.svg"); assert(/viewBox="0 0 32 32"/.test(s), "viewBox"); assert(!s.includes("--"), "double hyphen"); assert(!s.includes("<!--"), "comment");
  assert(/rel="icon"[^>]*href="favicon.svg"/.test(html), "not linked"); assert((s.match(/M\d+ \d+h/g) || []).length > 40, "trace looks empty");
});

/* ===== register + five rules ===== */
await gate("register is valid: states in enum, inert records carry no value or url", () => { const e = validateRegister(baseRegister()); assert(!e.length, e.join("; ")); });
await gate("build refuses an inert record that carries a value", () => {
  const reg = baseRegister(); const id = Object.keys(reg.records).find((k) => reg.records[k].state !== "stated"); reg.records[id].value = "x";
  let threw = false; try { build({ register: reg, out: path.join(TMP, "refuse") }); } catch { threw = true; } assert(threw, "build accepted it");
});
await gate("shipped register JSON strips dates and sources, inert records stay bare", () => {
  const j = JSON.parse(html.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/)[1]);
  const s = JSON.stringify(j); assert(!/"checked"|"source"|"scope"/.test(s), "metadata leaked"); assert(!DATE_RE.test(s), "date in register json");
  for (const r of Object.values(j.records)) if (r.state !== "stated") assert(!("value" in r) && !("url" in r), r.label + " inert but carries data");
});
await gate("palette: colour literals live in tokens.css only", () => {
  const files = [...walk(path.join(ROOT, "src")).filter((f) => !f.endsWith("tokens.css") && /\.(css|js|html|json)$/.test(f)), path.join(ROOT, "build.mjs")];
  const hex = /(?<!href=")#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g; const bad = [];
  for (const f of files) { const m = fs.readFileSync(f, "utf8").match(hex); if (m) bad.push(path.basename(f) + ": " + m.join(",")); }
  assert(!bad.length, bad.join("; "));
});
await gate("palette: every token literal carries a pixel-coordinate provenance comment", () => {
  const lines = read(ROOT, "src", "styles", "tokens.css").split("\n").filter((l) => /--c-[a-z0-9-]+:\s*#/.test(l));
  assert(lines.length >= 8, "too few literals"); for (const l of lines) assert(/@ \d+,\d+/.test(l), "no coordinate: " + l.trim());
});
await gate("palette: token literals are real pixels of the supplied banners", async () => {
  const jpeg = (await import("jpeg-js")).default; const imgs = ["SAMPUL PAYVACY PNG.jpg.jpeg", "PAYVACY 1.jpg.jpeg"].map((f) => jpeg.decode(fs.readFileSync(path.join(ROOT, "reference", f)), { useTArray: true }));
  const names = ["SAMPUL PAYVACY PNG", "PAYVACY 1"];
  for (const l of read(ROOT, "src", "styles", "tokens.css").split("\n")) {
    const m = l.match(/(#[0-9a-f]{6});\s*\/\*\s*(.+?) @ (\d+),(\d+)/); if (!m) continue;
    const img = imgs[names.findIndex((nm) => m[2].startsWith(nm))]; const i = (+m[4] * img.width + +m[3]) * 4;
    const got = "#" + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, "0")).join(""); assert(got === m[1], `${m[1]} claims ${m[2]} @ ${m[3]},${m[4]} but pixel is ${got}`);
  }
});
await gate("no ch units in CSS", () => assert(!/\d\s*ch\b/.test(css), "ch unit found"));
await gate("repo hygiene: no agent files, no attribution strings anywhere in the repo", () => {
  const all = walk(ROOT, ["node_modules", "dist", ".git"]);
  const names = all.filter((f) => /(^|[\\/])(CLAUDE\.md|\.claude)([\\/]|$)/i.test(f)); assert(!names.length, "agent files: " + names.join(","));
  const pat = new RegExp(["cla" + "ude", "anthro" + "pic", "co-" + "authored", "generated (by|with)", "\\bA" + "I\\b", "\\bL" + "LM\\b"].join("|"), "i");
  const hits = all.filter((f) => /\.(md|json|html|css|js|mjs|svg|txt)$/.test(f) && !f.endsWith("package-lock.json") && path.basename(f) !== "gates.mjs" && pat.test(fs.readFileSync(f, "utf8")));
  assert(!hits.length, "attribution text in: " + hits.map((f) => path.relative(ROOT, f)).join(", "));
});
await gate("repo content files exist (README, whitepaper, MIT LICENSE) and stay out of dist", () => {
  for (const f of ["README.md", "docs/whitepaper.md", "LICENSE"]) assert(fs.existsSync(path.join(ROOT, f)), "missing " + f);
  const lic = read(ROOT, "LICENSE"); assert(/MIT License/.test(lic) && /Copyright \(c\) 2026 Payvacy/.test(lic), "license text");
  assert(!fs.existsSync(path.join(DIST, "README.md")), "README in dist");
});

/* ===== no dates ===== */
await gate("no dates, timestamps or clock strings in visible text, attributes or tooltips", () => {
  const bad = visibleStrings(html).filter((s) => DATE_RE.test(s)); assert(!bad.length, bad.join(" | "));
});
await gate("no date logic or date strings in shipped JS and CSS", () => {
  assert(!/new Date|Date\.now|toLocale(Date|Time)?String|getHours|getMinutes|Intl\.DateTimeFormat|RelativeTimeFormat/.test(js), "date API in js");
  const strs = [...js.matchAll(/"([^"\\\n]{2,}?)"|'([^'\\\n]{2,}?)'/g)].map((m) => m[1] || m[2]).filter((s) => /[a-z]/i.test(s) && s.includes(" "));
  const bad = strs.filter((s) => DATE_RE.test(s)); assert(!bad.length, bad.join(" | "));
});

/* ===== socials ===== */
await gate("X: href is the stated register URL, handle derived from it, icon only", () => {
  const x = baseRegister().records.x, tag = socialTag(html, "X");
  if (x.state === "stated") { assert(tag.includes(`href="${x.url}"`), "href mismatch: " + tag); assert(handleOf(x.url) === "payvacy", "handle"); assert(html.includes(">@payvacy<"), "derived handle missing in footer"); }
  const full = html.match(/<a class="social"[^>]*aria-label="Payvacy X profile">([\s\S]*?)<\/a>/); assert(full && !/>[^<\s][^<]*</.test(full[1].replace(/<svg[\s\S]*?<\/svg>/, "")), "has text label");
});
await gate("GitHub: icon rendered, inert (no href), absent record", () => {
  const tag = socialTag(html, "GitHub"); assert(tag, "icon missing"); assert(!/href=/.test(tag) && /aria-disabled="true"/.test(tag), "not inert: " + tag);
  assert(baseRegister().records.github.state === "absent", "register no longer absent");
});
await gate("both icons sit in the header top-right block and are never hidden at any breakpoint", () => {
  const head = html.match(/<header[\s\S]*?<\/header>/)[0]; assert(/class="socials"/.test(head) && head.includes("M18.901 1.153") && head.includes("M8 0c4.42"), "icons not in header");
  assert(!/\.social[^{}]*\{[^}]*display:\s*none/.test(css) && !/\.socials[^{}]*\{[^}]*display:\s*none/.test(css), "icons hidden by css");
});
await gate("link rule: unstated records produce no href anywhere", () => {
  const reg = baseRegister().records; const hrefs = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set(Object.values(reg).filter((r) => r.state === "stated" && r.url).map((r) => r.url));
  const bad = hrefs.filter((h) => !allowed.has(h)); assert(!bad.length, "unregistered href: " + bad.join(", "));
});

/* ===== CA gate: both branches ===== */
await gate("CA branch A (absent): slot inert, label + pending only, no value, no copy hook", () => {
  const v = variant("ca-absent", (r) => { const c = r.records.ca; if (c.state === "stated") { c.state = "absent"; delete c.value; delete c.url; } return c.state; });
  const s = caSlot(v.html); assert(/is-inert/.test(s) && /aria-disabled="true"/.test(s), "not inert"); assert(!/data-copy|<button/.test(s), "copy hook present");
  assert(/>Token address</.test(s) && />pending</.test(s), "label/pending missing"); assert((v.html.match(ADDR_RE) || []).length === 0, "address-shaped text on page");
});
await gate("CA branch B (stated): full address visible, one click-to-copy button with feedback hook", () => {
  const v = variant("ca-stated", (r) => { const c = r.records.ca; if (c.state !== "stated") { c.state = "stated"; c.value = FIXTURE_CA; } return c.value; });
  const s = caSlot(v.html), val = v.reg.records.ca.value; assert(s.includes(`data-copy="${val}"`), "data-copy"); assert(s.includes(`>${val}<`), "full address not rendered"); assert(/<button/.test(s) && /data-copy-state/.test(s), "button or feedback hook");
  assert(/\.ca-value\s*\{[^}]*font-size:\s*clamp\([^)]*26px\)/.test(read(v.out, "assets", "app.css")), "ca font not large");
});
await gate("CA slot sits above the first section and outside normal flow (always visible)", () => {
  assert(html.indexOf("data-ca-slot") < html.indexOf("<main>"), "slot after main"); assert(/\.ca-bar\s*\{[^}]*position:\s*fixed/.test(css), "not fixed");
});
await gate("address scanner: 0x hex is not blanket-rejected, matches stated registry only", () => {
  const hex = "0x" + "ab12".repeat(10), reg = { records: { ca: { state: "stated", value: hex } } };
  assert(scanAddresses(`<p>${hex}</p>`, reg).length === 0, "stated 0x was rejected");
  assert(scanAddresses(`<p>${hex}</p>`, { records: { ca: { state: "absent" } } }).length === 1, "unstated 0x passed");
  assert(scanAddresses(`<p>${FIXTURE_CA}</p>`, { records: { ca: { state: "absent" } } }).length === 1, "unstated base58 passed");
});
await gate("address scanner over built pages: every address-shaped string equals a stated record (CA exempt)", () => {
  for (const [nm, v] of [["default", { html, reg: baseRegister() }], ["ca-stated", variant("ca-stated2", (r) => { r.records.ca.state = "stated"; r.records.ca.value = FIXTURE_CA; })]]) {
    const body = stripCaSlots(v.html) + css + read(v.out || DIST, "assets", "app.js"); const bad = scanAddresses(body, v.reg || baseRegister()); assert(!bad.length, nm + ": stray address " + bad[0]);
  }
});

/* ===== mutation harness (anchors read at runtime) ===== */
for (const id of ["ca", "x", "github", "chart", "buy", "explorer"]) {
  await gate(`mutation: flipping "${id}" from its current state flips its render, and only inert records stay bare`, () => {
    const v = variant("mut-" + id, (r) => flip(r, id)); const now = v.reg.records[id]; assert(now.state === v.info.after && v.info.before !== v.info.after, "flip did not happen");
    const probe = { ca: () => /data-copy=/.test(caSlot(v.html)), x: () => /href="[^"]*"/.test(socialTag(v.html, "X")), github: () => /href="[^"]*"/.test(socialTag(v.html, "GitHub")),
      chart: () => v.html.includes(`href="${now.url}"`), buy: () => v.html.includes(`href="${now.url}"`), explorer: () => v.html.includes(`href="${now.url}"`) }[id];
    assert(probe() === (now.state === "stated"), `${id}: render disagrees with state ${now.state}`);
    if (now.state !== "stated") assert(!("value" in now) && !("url" in now), "inert record kept data");
  });
}
await gate("market is independent of CA: flipping CA leaves script, feed record and board markup byte-identical", () => {
  const a = variant("mk-a", (r) => flip(r, "ca")), b = variant("mk-b", null);
  assert(read(a.out, "assets", "app.js") === read(b.out, "assets", "app.js"), "js differs");
  const feed = (h) => JSON.stringify(JSON.parse(h.match(/id="register">([\s\S]*?)<\/script>/)[1]).records["market-source"]);
  assert(feed(a.html) === feed(b.html), "feed record differs");
  const board = (h) => h.match(/<section class="section section--band" id="market">[\s\S]*?<\/section>/)[0]; assert(board(a.html) === board(b.html), "board markup differs");
  assert(!/records\.ca|register\.ca|register\["ca"\]/.test(js), "script reads the CA record");
});
await gate("market follows the market-source record: no hardcoded host, inert path when absent", () => {
  assert(!/dexscreener/i.test(js), "host hardcoded in script"); assert(/rec\.state === "stated"/.test(js) && /Source pending/.test(js), "absent branch missing");
  const v = variant("mk-flip", (r) => flip(r, "market-source")); const j = JSON.parse(v.html.match(/id="register">([\s\S]*?)<\/script>/)[1]).records["market-source"];
  assert(j.state === v.reg.records["market-source"].state, "record not carried to page");
});
await gate("market engine: 60s poll, hidden-tab pause, immediate refetch, exponential backoff, abort timeout", () => {
  for (const [k, re] of Object.entries({ poll: /POLL = 60000/, hidden: /document\.hidden/, vis: /visibilitychange/, backoff: /Math\.pow\(2, fails - 1\)/, abort: /AbortController/, keep: /last good reading/ })) assert(re.test(js), "missing " + k);
});

/* ===== copy: reference separation ===== */
await gate("copy shares zero two-word sequences with the reference page", () => {
  const ref = new Set(JSON.parse(read(ROOT, "tools", "fixtures", "ref-bigrams.json"))), mine = gramHashes(visibleStrings(html)); const shared = [...mine].filter(([k]) => ref.has(k)).map(([, w]) => w);
  assert(!shared.length, "shared: " + shared.join(" | "));
});

/* ===== browser: live behaviour ===== */
const server = await serve(DIST, 4190);
const browser = await chromium.launch({ channel: "msedge" });
const mk = (i, bump, over = {}) => ({ chainId: "solana", dexId: "x", baseToken: { address: "Tok" + String(i).padStart(2, "0") + "A".repeat(36), name: "Name " + i, symbol: "SY" + i }, priceUsd: String(1 / (i + 1)), priceChange: { h24: i % 2 ? -i : i }, volume: { h24: 1000 * (i + 1) * (bump || 1) }, liquidity: { usd: 500 * (i + 1) }, info: i === 3 ? {} : { imageUrl: "https://img.example.test/" + i + ".png" }, ...over });
async function mockFeed(ctx, state) {
  await ctx.route("https://api.dexscreener.com/token-boosts/top/v1", (r) => { state.boost++; if (state.fail) return r.abort(); r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([...Array(14).keys()].map((i) => ({ chainId: i === 13 ? "ethereum" : "solana", tokenAddress: "Tok" + String(i).padStart(2, "0") + "A".repeat(36) }))) }); });
  await ctx.route("https://api.dexscreener.com/tokens/v1/solana/**", (r) => { state.pairs++; r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([...Array(13).keys()].map((i) => mk(i, state.bump))) }); });
  await ctx.route("https://img.example.test/**", (r) => r.fulfill({ status: 404, body: "" }));
}
async function openPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1440, height: opts.h || 900 }, reducedMotion: opts.reduce ? "reduce" : "no-preference", permissions: ["clipboard-read", "clipboard-write"] });
  const state = { boost: 0, pairs: 0, fail: !!opts.fail }; await mockFeed(ctx, state);
  const page = await ctx.newPage(); if (opts.clock) await page.clock.install();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:4190/" + (opts.path || ""), { waitUntil: "load" }); return { ctx, page, state, errs };
}
await gate("browser: logo image is decoded and visible in the header", async () => {
  const { ctx, page } = await openPage(); await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const i = document.querySelector(".brand img"); const b = i.getBoundingClientRect(); return { w: i.naturalWidth, vis: b.width > 0 && b.height > 0, src: i.getAttribute("src") }; });
  assert(r.w > 0 && r.vis, JSON.stringify(r)); await ctx.close();
});
await gate("browser: board shows top 10 Solana tokens by 24h volume, letter tile fallback, copy per row", async () => {
  const { ctx, page, errs } = await openPage(); await page.waitForSelector(".mrow[data-addr]", { timeout: 8000 }); await page.waitForTimeout(500);
  const rows = await page.$$eval(".mrow[data-addr]", (els) => els.map((e) => ({ sym: e.querySelector(".tk-name b").textContent, vol: e.querySelector('[data-f="vol"]').dataset.v, copy: !!e.querySelector("[data-copy]"), letter: e.querySelector(".ph").textContent, img: !!e.querySelector("img") })));
  assert(rows.length === 10, "rows " + rows.length); const vols = rows.map((r) => +r.vol); assert(vols.every((v, i) => !i || vols[i - 1] >= v), "not sorted desc " + vols); assert(rows.every((r) => r.copy && r.letter), "copy/letter missing");
  assert(!rows.some((r) => r.sym === "SY13"), "non-solana leaked"); assert(errs.length === 0, errs.join(";")); await ctx.close();
});
await gate("browser: skeleton shows before data, then fades in staggered rows", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const st = { boost: 0, pairs: 0 }; await mockFeed(ctx, st);
  await ctx.route("https://api.dexscreener.com/token-boosts/top/v1", async (r) => { await new Promise((z) => setTimeout(z, 5000)); r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([{ chainId: "solana", tokenAddress: "Tok01" + "A".repeat(36) }]) }); });
  const page = await ctx.newPage(); await page.goto("http://localhost:4190/"); await page.waitForTimeout(400);
  assert(await page.$$eval("#rows .skel", (e) => e.length) > 10, "no skeleton"); await page.waitForSelector(".mrow.fade-in[data-addr]", { timeout: 15000 });
  const d = await page.$$eval(".mrow.fade-in", (e) => e.map((x) => x.style.getPropertyValue("--d"))); assert(d.length > 1 ? new Set(d).size > 1 : true, "no stagger"); await ctx.close();
});
await gate("browser: ticker is built from the same live data", async () => {
  const { ctx, page } = await openPage(); await page.waitForSelector("#ticker-a .tick b", { timeout: 8000 });
  const t = await page.$$eval("#ticker-a .tick b", (e) => e.map((x) => x.textContent)), r = await page.$$eval("#rows .tk-name b", (e) => e.map((x) => x.textContent)); assert(JSON.stringify(t) === JSON.stringify(r), t + " vs " + r); await ctx.close();
});
await gate("browser: source down at start shows dashes and an error, no crash", async () => {
  const { ctx, page, errs } = await openPage({ fail: true }); await page.waitForTimeout(1500);
  assert((await page.textContent("#s-count")).trim() === "—", "dash missing"); assert(await page.isVisible("#board-err"), "error hidden"); assert(errs.length === 0, errs.join(";")); await ctx.close();
});
await gate("browser: refresh failure keeps the last good data; pill reports the retry", async () => {
  const { ctx, page, state } = await openPage({ clock: true }); await page.waitForSelector(".mrow[data-addr]"); const before = await page.$$eval(".mrow[data-addr]", (e) => e.length);
  state.fail = true; await page.clock.fastForward(61000); await page.waitForTimeout(400);
  assert((await page.$$eval(".mrow[data-addr]", (e) => e.length)) === before, "rows lost"); assert(/retrying/.test(await page.textContent("#pill-text")), "pill state"); assert(await page.isVisible("#board-err"), "no error"); await ctx.close();
});
await gate("browser: polls every 60s, pauses while hidden, fetches immediately when visible again", async () => {
  const { ctx, page, state } = await openPage({ clock: true }); await page.waitForSelector(".mrow[data-addr]"); const n0 = state.boost;
  await page.clock.fastForward(61000); await page.waitForTimeout(300); assert(state.boost === n0 + 1, `no poll: ${n0}->${state.boost}`);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  const n1 = state.boost; await page.clock.fastForward(180000); await page.waitForTimeout(300); assert(state.boost === n1, "polled while hidden");
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); }); await page.waitForTimeout(500); assert(state.boost === n1 + 1, "no immediate fetch"); await ctx.close();
});
await gate("browser: exponential backoff doubles the retry wait while the source stays down", async () => {
  const { ctx, page, state } = await openPage({ clock: true, fail: true }); await page.waitForTimeout(300); const marks = [];
  for (let i = 0; i < 4; i++) { const b = state.boost; let waited = 0; while (state.boost === b && waited < 70000) { await page.clock.fastForward(500); await page.waitForTimeout(25); waited += 500; } marks.push(waited); }
  assert(marks[1] > marks[0] * 1.5 && marks[2] > marks[1] * 1.5, "waits " + marks); await ctx.close();
});
await gate("browser: a changed value counts up and flashes in its cell", async () => {
  const { ctx, page, state } = await openPage({ clock: true }); await page.waitForSelector(".mrow[data-addr]"); const before = await page.$eval('.mrow [data-f="vol"]', (e) => +e.dataset.v);
  state.bump = 2; await page.clock.fastForward(61000); await page.waitForTimeout(300);
  const r = await page.$eval('.mrow [data-f="vol"]', (e) => ({ v: +e.dataset.v, cls: e.className })); assert(r.v > before * 1.5, "value did not move: " + before + " -> " + r.v); assert(/flash-up/.test(r.cls), "no flash: " + r.cls); await ctx.close();
});
await gate("browser: CA stated -> click copies full address and shows Copied feedback", async () => {
  const v = variant("ca-click", (r) => { r.records.ca.state = "stated"; r.records.ca.value = FIXTURE_CA; }); const s2 = await serve(v.out, 4191);
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1440, height: 900 } }); await mockFeed(ctx, { boost: 0, pairs: 0 });
  const page = await ctx.newPage(); await page.goto("http://localhost:4191/"); await page.click(".ca-bar button.ca"); await page.waitForTimeout(250);
  assert((await page.evaluate(() => navigator.clipboard.readText())) === FIXTURE_CA, "clipboard"); assert(/Copied/.test(await page.textContent(".ca-bar [data-copy-state]")), "no feedback"); await ctx.close(); s2.close();
});
await gate("browser: per-row copy button copies that token address", async () => {
  const { ctx, page } = await openPage(); await page.waitForSelector(".mrow[data-addr] .copy-mini"); await page.click(".mrow[data-addr] .copy-mini"); await page.waitForTimeout(200);
  const [clip, addr] = [await page.evaluate(() => navigator.clipboard.readText()), await page.$eval(".mrow[data-addr]", (e) => e.dataset.addr)]; assert(clip === addr, clip + " != " + addr); await ctx.close();
});
await gate("browser: rendered page has no dates anywhere after live data lands (text, aria, title, alt)", async () => {
  const { ctx, page } = await openPage(); await page.waitForSelector(".mrow[data-addr]"); await page.waitForTimeout(900);
  const all = await page.evaluate(() => { const out = [document.body.innerText]; document.querySelectorAll("[aria-label],[title],[alt]").forEach((e) => out.push(e.getAttribute("aria-label") || "", e.title || "", e.getAttribute("alt") || "")); return out; });
  const bad = all.filter((s) => DATE_RE.test(s)); assert(!bad.length, bad.join(" | ")); await ctx.close();
});
await gate("browser: reduced motion leaves zero running animations and everything visible", async () => {
  const { ctx, page } = await openPage({ reduce: true }); await page.waitForSelector(".mrow[data-addr]"); await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ anims: document.getAnimations().filter((a) => a.playState === "running").length, hidden: [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity !== "1").length }));
  assert(r.anims === 0 && r.hidden === 0, JSON.stringify(r)); await ctx.close();
});
await gate("browser: spring reveal runs with motion allowed (elements start hidden, end visible)", async () => {
  const { ctx, page } = await openPage(); const s = await page.evaluate(() => getComputedStyle(document.querySelector("#faq [data-reveal]")).opacity); assert(+s < 1, "faq not pre-hidden: " + s);
  await page.evaluate(() => window.scrollTo({ top: document.querySelector("#faq").offsetTop, behavior: "instant" })); await page.waitForTimeout(1600);
  assert((await page.evaluate(() => getComputedStyle(document.querySelector("#faq [data-reveal]")).opacity)) === "1", "did not settle"); await ctx.close();
});
await gate("browser: scroll progress bar tracks scroll", async () => {
  const { ctx, page } = await openPage(); await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2)); await page.waitForTimeout(300);
  const t = await page.$eval("#progress", (e) => e.style.transform); const v = +t.match(/scaleX\(([\d.]+)/)[1]; assert(v > 0.3 && v < 0.7, t); await ctx.close();
});
const sizes = [[360, 800], [390, 844], [430, 932], [1366, 768], [1440, 900]];
const metrics = [];
for (const [w, h] of sizes) {
  await gate(`browser @${w}: no horizontal scroll, tap targets >= 44x44, both social icons visible top-right, CA slot large and in view`, async () => {
    const { ctx, page } = await openPage({ w, h }); await page.waitForSelector(".mrow[data-addr]"); await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const vis = (e) => { const b = e.getBoundingClientRect(), c = getComputedStyle(e); return b.width > 0 && b.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
      const small = [...document.querySelectorAll("a[href], button, [role=switch]")].filter(vis).map((e) => ({ e, b: e.getBoundingClientRect() })).filter((x) => x.b.height < 43.5 || x.b.width < 43.5).filter((x) => !x.e.closest(".foot-grid") || x.b.height < 43.5).map((x) => (x.e.className || x.e.tagName) + ":" + Math.round(x.b.width) + "x" + Math.round(x.b.height));
      const soc = [...document.querySelectorAll(".social")].map((e) => e.getBoundingClientRect()); const ca = document.querySelector(".ca").getBoundingClientRect(), caV = document.querySelector(".ca-value");
      return { sw: document.documentElement.scrollWidth, vw: innerWidth, small, soc: soc.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]), ca: [Math.round(ca.y), Math.round(ca.height)], rowRight: document.querySelector(".top-row").getBoundingClientRect().right, caFont: getComputedStyle(caV).fontSize, hasLogo: document.querySelector(".brand img").naturalWidth > 0 };
    });
    metrics.push({ w, ...r });
    assert(r.sw <= r.vw, `scrollWidth ${r.sw} > ${r.vw}`); assert(!r.small.length, "small tap targets: " + r.small.join(", ")); assert(r.soc.length === 2 && r.soc.every((b) => b[2] >= 44 && b[3] >= 44 && b[0] + b[2] <= w && b[1] < 64), "socials: " + JSON.stringify(r.soc));
    assert(r.soc[1][0] + r.soc[1][2] >= r.rowRight - 40, "icons not at the right edge of the header row"); assert(r.ca[0] + r.ca[1] < h, "CA slot off screen"); assert(parseFloat(r.caFont) >= 14, "CA font " + r.caFont); assert(r.hasLogo, "logo");
    await ctx.close();
  });
}
await browser.close(); server.close();

fs.rmSync(TMP, { recursive: true, force: true });
const fail = results.filter((r) => !r[2]);
console.log("\nmeasurements:");
for (const m of metrics) console.log(`  ${String(m.w).padStart(4)}px  scrollWidth=${m.sw}  CA font=${m.caFont}  CA box y=${m.ca[0]} h=${m.ca[1]}  socials=${JSON.stringify(m.soc)}`);
console.log(`\ngates: ${results.length - fail.length}/${results.length} passed`);
process.exit(fail.length ? 1 : 0);
