// Static: every check runs in the reader's browser, so the host holds nothing but this code. Writes dist/, which Cloudflare Pages serves.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname, dist = root + "dist";
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist);
cpSync(root + "public", dist, { recursive: true });
await build({ entryPoints: [root + "client/app.ts"], bundle: true, minify: true, format: "iife", target: "es2020", legalComments: "none", outfile: dist + "/app.js" });
const shell = readFileSync(root + "client/index.html", "utf8");
writeFileSync(dist + "/index.html", shell);
console.log("built", dist);
