import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = path.resolve(process.argv[2] || "dist"), port = +(process.argv[3] || 4173);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
export function serve(dir = root, p = port) {
  return new Promise((res) => {
    const s = http.createServer((req, rsp) => {
      let f = path.join(dir, decodeURIComponent(req.url.split("?")[0])); if (f.endsWith(path.sep) || !path.extname(f)) f = path.join(f, "index.html");
      if (!f.startsWith(dir) || !fs.existsSync(f)) { rsp.writeHead(404).end("nf"); return; }
      rsp.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(rsp);
    }).listen(p, () => res(s));
  });
}
if (import.meta.url.endsWith(path.basename(process.argv[1]))) { await serve(); console.log("serving", root, port); }
