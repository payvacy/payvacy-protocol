import { chromium } from "playwright-core"; import { serve } from "./serve.mjs"; import path from "node:path";
const [w, h, prefix] = [+process.argv[2], +process.argv[3], process.argv[4]];
const s = await serve(path.resolve("dist"), 4181);
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:4181/", { waitUntil: "load" }); await p.waitForTimeout(3000);
const H = await p.evaluate(() => document.documentElement.scrollHeight); console.log("height", H);
let i = 0; for (let y = h; y < H; y += h - 100) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(1500); await p.screenshot({ path: `${prefix}${i++}.png` }); }
await b.close(); s.close(); console.log("shots", i);
