// client/waiting.ts against a REAL entry signed by the log's own key (read from log.333.eco), with controls: an edited entry, a
// slot already in the log, a body that isn't the list, and a fetch that fails are all "nothing waiting", never an error or a match.
//   node scripts/check-waiting.mjs
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkWitnessSignature, readEntries } from "@333eco/origin-verify";
import trust from "@333eco/origin-verify/trust";
const out = join(mkdtempSync(join(tmpdir(), "waiting-")), "w.mjs");
await build({ entryPoints: [new URL("../client/waiting.ts", import.meta.url).pathname], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { readWaiting, matchWaiting } = await import(out);
const LOG = "https://log.333.eco/origin/", get = async (p) => { const r = await fetch(LOG + p); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; };
const size = Number(new TextDecoder().decode(await get("checkpoint")).split("\n")[1]);
const raw = (await readEntries(get, size)).map((b) => new TextDecoder().decode(b)), last = raw[size - 1], e = JSON.parse(last);
const listOf = (entries) => async () => new Response(JSON.stringify({ size: e.index, entries }), { status: 200 });
const one = { index: e.index, entry: Buffer.from(last).toString("base64") };
let bad = 0; const t = (ok, what) => { console.log(ok ? "✓" : "✗", what); if (!ok) bad++; };
console.log(`the log has ${size} entries; using #${e.index} (${e.t}), signed by the log's own key`);
const w = await readWaiting(e.index, trust, checkWitnessSignature, listOf([one]));
t(w.length === 1 && w[0].index === e.index, "a real signed entry ahead of the log's size is accepted");
t(e.t !== "record" || matchWaiting({ sha256: e.claim.sha256 }, w).length === 1, "… and a file with its fingerprint is found, marked waiting");
t(matchWaiting({ sha256: "0".repeat(64) }, w).length === 0, "CONTROL: another fingerprint is not found");
const edited = JSON.parse(last); if (edited.claim) edited.claim.sha256 = "1".repeat(64); else edited.index += 0, edited.witnessedAt = "2000-01-01T00:00:00Z";
t((await readWaiting(e.index, trust, checkWitnessSignature, listOf([{ index: e.index, entry: Buffer.from(JSON.stringify(edited)).toString("base64") }]))).length === 0, "CONTROL: an edited entry fails the key check and is dropped");
t((await readWaiting(e.index + 1, trust, checkWitnessSignature, listOf([one]))).length === 0, "CONTROL: an entry already inside the log's size is not 'waiting'");
t((await readWaiting(e.index, trust, checkWitnessSignature, listOf([{ index: e.index + 1, entry: one.entry }]))).length === 0, "CONTROL: a slot number that disagrees with the signed entry is dropped");
t((await readWaiting(e.index, trust, checkWitnessSignature, async () => new Response("<html>", { status: 200 }))).length === 0, "CONTROL: a body that isn't the list is nothing waiting");
t((await readWaiting(e.index, trust, checkWitnessSignature, async () => { throw new Error("offline"); })).length === 0, "CONTROL: a failed fetch is nothing waiting");
process.exit(bad ? 1 : 0);
