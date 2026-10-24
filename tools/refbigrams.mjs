import fs from "node:fs"; import { blocks, gramHashes } from "./textgrams.mjs";
const html = fs.readFileSync(process.argv[2], "utf8");
const extra = ["PAY ANYONE. LEAVE NO TRAIL.", "Shield your SOL or USDC once. Send payments through a shared pool designed to keep your wallet out of the transaction trail.", "Built on SOLANA"];
const g = gramHashes([...blocks(html), ...extra]);
fs.writeFileSync("tools/fixtures/ref-bigrams.json", JSON.stringify([...g.keys()]));
console.log("reference bigram hashes:", g.size);
