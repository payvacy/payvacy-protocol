import fs from "node:fs"; import { blocks, gramHashes } from "./textgrams.mjs";
const ref = new Set(JSON.parse(fs.readFileSync("tools/fixtures/ref-bigrams.json", "utf8")));
const mine = gramHashes(blocks(fs.readFileSync("dist/index.html", "utf8")));
const shared = [...mine].filter(([k]) => ref.has(k)).map(([, w]) => w);
console.log(shared.length ? shared.join(" | ") : "no shared two-word sequences");
process.exit(shared.length ? 1 : 0);
