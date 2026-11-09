import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const [productionRootArg, previewRootArg] = process.argv.slice(2);
if (!productionRootArg || !previewRootArg) {
  throw new Error("Usage: node tests/browser/serve.js <production-site-root> <dev-preview-root>");
}
const roots = {
  production: resolve(productionRootArg),
  preview: resolve(previewRootArg),
};
const previewPrefix = "/FD-Calculator/dev";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const isPreview = pathname === previewPrefix || pathname.startsWith(previewPrefix + "/");
    const root = isPreview ? roots.preview : roots.production;
    let relative = isPreview ? pathname.slice(previewPrefix.length) : pathname;
    if (!relative || relative === "/") relative = "/index.html";
    if (relative.endsWith("/")) relative += "index.html";
    const target = resolve(root, "." + relative);
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(target);
    response.writeHead(200, {
      "content-type": types[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, {
      "content-type": "text/plain; charset=utf-8",
    });
    response.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
}).listen(4173, "127.0.0.1");
