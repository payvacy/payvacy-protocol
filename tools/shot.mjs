import { chromium } from "playwright-core"; import { serve } from "./serve.mjs"; import path from "node:path";
const [w, h, name, scrollTo] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const s = await serve(path.resolve("dist"), 4180);
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
await p.goto("http://localhost:4180/", { waitUntil: "load" });
await p.waitForTimeout(3500);
if (scrollTo) { await p.evaluate((y) => window.scrollTo(0, y), +scrollTo); await p.waitForTimeout(1800); }
await p.screenshot({ path: name });
console.log("errors:", errs.join(" | ") || "none");
await b.close(); s.close();
