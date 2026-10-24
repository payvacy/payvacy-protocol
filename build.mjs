import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const BRAND_ALPHA = path.join(ROOT, "brand", "LOGO PAYVACY PNG...png"); // rgba, transparent field
const BRAND_SOLID = path.join(ROOT, "brand", "LOGO PAYVACY PNG.png"); // rgba, opaque white on black
const OG_SOURCE = path.join(ROOT, "reference", "SAMPUL PAYVACY PNG.jpg.jpeg");

const X_PATH = "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z";
const GH_PATH = "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";
const X_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${X_PATH}"/></svg>`;
const GH_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${GH_PATH}"/></svg>`;
const COPY_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------- register ---------- */
export function validateRegister(reg) {
  const errs = [];
  for (const [id, r] of Object.entries(reg.records)) {
    if (!["stated", "absent", "unconfirmed"].includes(r.state)) errs.push(`${id}: bad state ${r.state}`);
    if (r.state !== "stated" && ("value" in r || "url" in r)) errs.push(`${id}: inert record carries value or url`);
    if (r.state === "stated" && !(r.value || r.url)) errs.push(`${id}: stated record has neither value nor url`);
  }
  return errs;
}
const stated = (r) => r && r.state === "stated";
export const handleOf = (url) => new URL(url).pathname.split("/").filter(Boolean)[0] || "";

/* ---------- image helpers ---------- */
function bbox(png, test) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4;
    if (test(png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3])) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1 };
}
// Area-weighted box resample of a square window, in premultiplied space.
function resizePremultiplied(png, win, size) {
  const out = new PNG({ width: size, height: size });
  const s = win.size / size;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
    const sx0 = win.x + dx * s, sx1 = sx0 + s, sy0 = win.y + dy * s, sy1 = sy0 + s;
    let r = 0, g = 0, b = 0, a = 0, wsum = 0;
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
      const w = (Math.min(x + 1, sx1) - Math.max(x, sx0)) * (Math.min(y + 1, sy1) - Math.max(y, sy0));
      wsum += w;
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      const i = (y * png.width + x) * 4, al = png.data[i + 3] / 255;
      r += png.data[i] * al * w; g += png.data[i + 1] * al * w; b += png.data[i + 2] * al * w; a += al * w;
    }
    const o = (dy * size + dx) * 4;
    if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
    out.data[o + 3] = Math.round((a / wsum) * 255);
  }
  return PNG.sync.write(out);
}
function squareWindow(bb, pad) {
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1, size = Math.max(w, h) * (1 + pad * 2);
  return { x: bb.x0 + w / 2 - size / 2, y: bb.y0 + h / 2 - size / 2, size };
}
function traceFavicon(solid, tokens) {
  const bb = bbox(solid, (r, g, b) => (r + g + b) / 3 > 128);
  const N = 32, M = 2, inner = N - M * 2, win = squareWindow(bb, 0), cell = win.size / inner;
  const on = Array.from({ length: N }, () => new Array(N).fill(false));
  for (let gy = 0; gy < inner; gy++) for (let gx = 0; gx < inner; gx++) {
    let sum = 0, n = 0;
    for (let y = Math.floor(win.y + gy * cell); y < Math.ceil(win.y + (gy + 1) * cell); y++) for (let x = Math.floor(win.x + gx * cell); x < Math.ceil(win.x + (gx + 1) * cell); x++) {
      if (x < 0 || y < 0 || x >= solid.width || y >= solid.height) continue;
      const i = (y * solid.width + x) * 4; sum += (solid.data[i] + solid.data[i + 1] + solid.data[i + 2]) / 3; n++;
    }
    on[gy + M][gx + M] = n > 0 && sum / n > 128;
  }
  let d = "";
  for (let y = 0; y < N; y++) { let x = 0; while (x < N) { if (!on[y][x]) { x++; continue; } let e = x; while (e < N && on[y][e]) e++; d += `M${x} ${y}h${e - x}v1h-${e - x}z`; x = e; } }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" rx="7" fill="${tokens.void}"/><path fill="${tokens.accent}" d="${d}"/></svg>\n`;
}

function readTokens() {
  const css = fs.readFileSync(path.join(SRC, "styles", "tokens.css"), "utf8");
  const pick = (n) => css.match(new RegExp(`--c-${n}:\\s*(#[0-9a-fA-F]{6})`))[1];
  return { void: pick("void"), accent: pick("accent"), css };
}

/* ---------- renderers ---------- */
function renderCaSlot(r, cls = "") {
  if (stated(r)) {
    return `<button class="ca ${cls}" type="button" data-copy="${esc(r.value)}" aria-label="Copy contract address"><span class="ca-label">${esc(r.label)}</span><span class="ca-value" data-ca-value>${esc(r.value)}</span><span class="ca-action">${COPY_SVG}<span data-copy-state>Copy</span></span></button>`;
  }
  return `<div class="ca is-inert ${cls}" aria-disabled="true"><span class="ca-label">${esc(r.label)}</span><span class="ca-value">pending</span></div>`;
}
function renderSocial(r, svg, name) {
  if (stated(r)) return `<a class="social" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="Payvacy ${name} profile">${svg}</a>`;
  return `<span class="social is-inert" role="img" aria-disabled="true" aria-label="${name}, pending">${svg}</span>`;
}
function renderChip(r) {
  if (stated(r)) return `<a class="chip-live" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label)}<span aria-hidden="true">↗</span></a>`;
  return `<span class="chip-inert" aria-disabled="true">${esc(r.label)} <em>pending</em></span>`;
}

let imageCache = null;
function imageAssets(tokens) {
  if (imageCache) return imageCache;
  // logo: transparent master, resized in premultiplied space (field is pure black at alpha 0)
  const alpha = PNG.sync.read(fs.readFileSync(BRAND_ALPHA));
  const win = squareWindow(bbox(alpha, (_r, _g, _b, a) => a > 8), 0.08);
  const logos = {}; for (const size of [512, 192]) logos[size] = resizePremultiplied(alpha, win, size);
  // favicon traced from the opaque master's pixel grid
  const favicon = traceFavicon(PNG.sync.read(fs.readFileSync(BRAND_SOLID)), tokens);
  return (imageCache = { logos, favicon });
}

/* ---------- build ---------- */
export function build({ register, out = path.join(ROOT, "dist") } = {}) {
  const reg = register || JSON.parse(fs.readFileSync(path.join(SRC, "data", "register.json"), "utf8"));
  const errs = validateRegister(reg);
  if (errs.length) throw new Error("register invalid:\n" + errs.join("\n"));
  const R = reg.records, tokens = readTokens();

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "assets", "fonts"), { recursive: true });

  const img = imageAssets(tokens);
  for (const size of [512, 192]) fs.writeFileSync(path.join(out, "assets", `logo-${size}.png`), img.logos[size]);
  fs.writeFileSync(path.join(out, "favicon.svg"), img.favicon);

  fs.copyFileSync(OG_SOURCE, path.join(out, "assets", "og.jpg"));
  for (const f of fs.readdirSync(path.join(SRC, "assets", "fonts"))) fs.copyFileSync(path.join(SRC, "assets", "fonts", f), path.join(out, "assets", "fonts", f));
  fs.writeFileSync(path.join(out, "assets", "app.css"), tokens.css + "\n" + fs.readFileSync(path.join(SRC, "styles", "main.css"), "utf8"));
  fs.copyFileSync(path.join(SRC, "js", "app.js"), path.join(out, "assets", "app.js"));

  const pub = {};
  for (const [id, r] of Object.entries(R)) { pub[id] = { label: r.label, state: r.state }; if (r.state === "stated") { if (r.value) pub[id].value = r.value; if (r.url) pub[id].url = r.url; } }
  const registerJson = JSON.stringify({ records: pub }).replace(/</g, "\\u003c");

  const xHandle = stated(R.x) ? handleOf(R.x.url) : "";
  const rec = (label, r, text) => `<li><span>${label} <em>${stated(r) ? esc(text ?? "stated") : "pending"}</em></span></li>`;
  const slots = {
    theme_color: tokens.void,
    ca_slot: renderCaSlot(R.ca),
    ca_card: renderCaSlot(R.ca, "ca--card"),
    social_x: renderSocial(R.x, X_SVG, "X"),
    social_github: renderSocial(R.github, GH_SVG, "GitHub"),
    chip_chart: renderChip(R.chart), chip_buy: renderChip(R.buy), chip_explorer: renderChip(R.explorer),
    chain_label: stated(R.chain) ? esc(R.chain.value) : "Chain",
    market_source_label: stated(R["market-source"]) ? esc(R["market-source"].value) : "its market source",
    site_value: stated(R.site) ? esc(R.site.value) : "This site",
    footer_handle: xHandle ? `<p class="mono"><a href="${esc(R.x.url)}" target="_blank" rel="noopener noreferrer">@${esc(xHandle)}</a></p>` : "",
    footer_records: rec("Chain", R.chain, R.chain.value) + rec("Contract", R.ca, "stated") + rec("Feed", R["market-source"], R["market-source"].value) + rec("GitHub", R.github, "stated"),
    register_json: registerJson,
  };
  let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
  html = html.replace(/\{\{pending_or:[a-z_]+\}\}/g, "pending");
  html = html.replace(/\{\{([a-z_]+)\}\}/g, (_m, k) => { if (!(k in slots)) throw new Error("unknown slot " + k); return slots[k]; });
  fs.writeFileSync(path.join(out, "index.html"), html);

  // the logo must be in dist and referenced by a correct relative path
  const refs = [...html.matchAll(/(?:src|href)="(assets\/logo-\d+\.png)"/g)].map((m) => m[1]);
  if (!refs.length) throw new Error("index.html does not reference the logo");
  for (const r of new Set(refs)) if (!fs.existsSync(path.join(out, r))) throw new Error("logo missing from dist: " + r);
  return { out, logoRefs: [...new Set(refs)] };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = build();
  console.log("built ->", path.relative(ROOT, r.out) || r.out, "| logo:", r.logoRefs.join(", "));
}
