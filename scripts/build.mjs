// Static: every check runs in the reader's browser, so the host holds nothing but this code. Writes dist/, which Cloudflare Pages serves.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname, dist = root + "dist";
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist);
cpSync(root + "public", dist, { recursive: true });
await build({ entryPoints: [root + "client/app.ts"], bundle: true, minify: true, format: "iife", target: "es2020", legalComments: "none", outfile: dist + "/app.js" });
// ⚠️ The 333.eco zone's browser cache setting holds .js and .css for 4 hours on this host, even over no-cache (measured 2026-11-04: a good deploy read as the old site). HTML is left alone, so each asset's address carries a hash of its bytes: fresh HTML always names the current files.
const shell = readFileSync(root + "client/index.html", "utf8").replace(/((?:src|href)=")\/([\w.-]+\.(?:js|css))"/g, (_, attr, file) => `${attr}/${file}?v=${createHash("sha256").update(readFileSync(`${dist}/${file}`)).digest("hex").slice(0, 10)}"`);
writeFileSync(dist + "/index.html", shell);
console.log("built", dist);
