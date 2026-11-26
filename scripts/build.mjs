// Static: every check runs in the reader's browser, so the host holds nothing but this code. Writes dist/, which Cloudflare Pages serves.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname, dist = root + "dist";
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist);
cpSync(root + "public", dist, { recursive: true });
// ⭐ A662 (2026-11-19): the ledger page's hashing runs in a worker. Built first, so app.js is told the worker's address WITH its hash (the
// zone's 4-hour browser cache, below): a new app.js never starts last week's worker.
await build({ entryPoints: [root + "client/ledger-worker.ts"], bundle: true, minify: true, format: "iife", target: "es2020", legalComments: "none", outfile: dist + "/ledger-worker.js" });
const worker = `/ledger-worker.js?v=${createHash("sha256").update(readFileSync(dist + "/ledger-worker.js")).digest("hex").slice(0, 10)}`;
// ⭐ 2026-11-25 (founder: fix the "known, not urgent" list; the first load stood at 70.8 KB gzip against its 71.1 KB budget): the Legal tab's
// pages and words are their own chunk, an ES module app.js imports only when /legal opens, its address hashed the same way. Its "./proofs"
// is the page's own copy, handed over at load (client/proofs-bound.ts), so the verifier isn't downloaded twice; each guard below fails
// the build if the split comes undone.
const bound = { name: "proofs-bound", setup(b) { b.onResolve({ filter: /^\.\/proofs$/ }, () => ({ path: root + "client/proofs-bound.ts" })); } };
const tab = await build({ entryPoints: [root + "client/legal-page.ts"], bundle: true, minify: true, format: "esm", target: "es2020", legalComments: "none", outfile: dist + "/legal-tab.js", plugins: [bound], metafile: true });
if (Object.keys(tab.metafile.inputs).some((p) => /origin-verify|client\/(proofs|app)\.ts$/.test(p))) throw new Error("legal-tab.js would carry its own copy of the verifier or the page");
const legalTab = `/legal-tab.js?v=${createHash("sha256").update(readFileSync(dist + "/legal-tab.js")).digest("hex").slice(0, 10)}`;
const app = await build({ entryPoints: [root + "client/app.ts"], bundle: true, minify: true, format: "iife", target: "es2020", legalComments: "none", outfile: dist + "/app.js", define: { LEDGER_WORKER: JSON.stringify(worker), LEGAL_CHUNK: JSON.stringify(legalTab) }, external: ["/legal-tab.js*"], metafile: true });
if (Object.keys(app.metafile.inputs).some((p) => /client\/legal(-page)?\.ts$/.test(p))) throw new Error("app.js would carry the Legal tab: the first load grows by it");
// ⚠️ The 333.eco zone's browser cache setting holds .js and .css for 4 hours on this host, even over no-cache (measured 2026-11-04: a good deploy read as the old site). HTML is left alone, so each asset's address carries a hash of its bytes: fresh HTML always names the current files.
const shell = readFileSync(root + "client/index.html", "utf8").replace(/((?:src|href)=")\/([\w.-]+\.(?:js|css))"/g, (_, attr, file) => `${attr}/${file}?v=${createHash("sha256").update(readFileSync(`${dist}/${file}`)).digest("hex").slice(0, 10)}"`);
writeFileSync(dist + "/index.html", shell);
console.log("built", dist);
