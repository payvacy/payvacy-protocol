import crypto from "node:crypto";
export function blocks(html) {
  const metas = [...html.matchAll(/<meta[^>]+(?:name|property)="(?:description|og:description|og:title)"[^>]+content="([^"]*)"/g)].map((m) => m[1]);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  const body = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ");
  const attrs = [...body.matchAll(/(?:aria-label|title|alt)="([^"]*)"/g)].map((m) => m[1]);
  const text = body.split(/<[^>]+>/).map((s) => s.replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").trim()).filter(Boolean);
  return [title, ...metas, ...attrs, ...text];
}
export const words = (s) => s.toLowerCase().split(/[^a-z0-9$@']+/).filter(Boolean);
export const h = (a, b) => crypto.createHash("sha1").update(a + " " + b).digest("hex").slice(0, 10);
export function gramHashes(blks) { const out = new Map(); for (const b of blks) { const w = words(b); for (let i = 0; i + 1 < w.length; i++) out.set(h(w[i], w[i + 1]), w[i] + " " + w[i + 1]); } return out; }
