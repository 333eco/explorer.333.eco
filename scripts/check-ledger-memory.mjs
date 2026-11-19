// client/ledger-memory.ts (A662, 2026-11-19): the ledger page's memory of what this device checked. Against the package's own treeRoot for
// every size, and against the REAL ledger read from log.333.eco, with controls: a changed byte in an entry this device already checked
// must break the proof; a memory that isn't exactly one the page wrote is refused.
//   node scripts/check-ledger-memory.mjs
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { checkCheckpoint, hashLeaf, readEntries, treeRoot } from "@333eco/origin-verify";
const out = join(mkdtempSync(join(tmpdir(), "ledger-memory-")), "m.mjs");
await build({ entryPoints: [new URL("../client/ledger-memory.ts", import.meta.url).pathname], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { EMPTY, blocksOf, extend, rootOf, bundleEntries, encodeMemory, decodeMemory } = await import(out);
const { default: ledgerTrust } = await import(await (async () => { const o = join(mkdtempSync(join(tmpdir(), "ledger-trust-")), "t.mjs"); await build({ entryPoints: [new URL("../client/ledger-trust.ts", import.meta.url).pathname], bundle: true, format: "esm", outfile: o, logLevel: "silent" }); return o; })());
let bad = 0; const t = (ok, what) => { console.log(ok ? "✓" : "✗", what); if (!ok) bad++; };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 1. The edge's root is the package's root, at every size, and appending in two steps is appending in one.
const leaves = Array.from({ length: 600 }, () => new Uint8Array(randomBytes(32)));
let allSame = true, split = true;
for (let n = 0; n <= 600; n++) {
    if (!same(rootOf(extend(EMPTY, leaves.slice(0, n))), treeRoot(leaves.slice(0, n)))) allSame = false;
    const k = Math.floor(n / 3);
    if (!same(rootOf(extend(extend(EMPTY, leaves.slice(0, k)), leaves.slice(k, n))), treeRoot(leaves.slice(0, n)))) split = false;
}
t(allSame, "the edge's root equals treeRoot for every size 0–600");
t(split, "an edge extended in two steps equals one extended at once, at every size");
t(blocksOf(3328).join() === "2048,1024,256" && blocksOf(1).join() === "1" && blocksOf(0).length === 0 && blocksOf(2 ** 33 + 5).length === 3, "the blocks of a size are its set bits, past 2^32 too");
t(!same(rootOf(extend(EMPTY, leaves.slice(0, 7))), rootOf(extend(EMPTY, [...leaves.slice(0, 6), leaves[8]]))), "CONTROL: a different leaf gives a different root");

// 2. The REAL ledger.
const LOG = "https://log.333.eco/ledger/", get = async (p) => { const r = await fetch(LOG + p); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; };
const cp = await checkCheckpoint(new TextDecoder().decode(await get("checkpoint")), ledgerTrust);
t(cp.ok, `the real checkpoint verifies (size ${cp.size})`);
const entries = await readEntries(get, cp.size), real = entries.map(hashLeaf);
t(same(rootOf(extend(EMPTY, real)), cp.root), "the whole ledger's edge gives the signed root");
const B = Math.floor((cp.size - 1) / 256) * 256;   // the last tile before today's: what a visit yesterday would have kept
const kept = extend(EMPTY, real.slice(0, B));
t(same(rootOf(extend(kept, real.slice(B))), cp.root), `a return visit: the edge kept at ${B} plus the ${cp.size - B} new entries gives the signed root`);
const firstTile = await get("tile/entries/000");
t(firstTile && bundleEntries(firstTile).length === 256 && bundleEntries(firstTile).every((e, i) => same(e, entries[i])), "an entry tile decodes to the package's own entries");
let truncated = false; try { bundleEntries(firstTile.subarray(0, firstTile.length - 5)); } catch { truncated = true; }
t(truncated, "CONTROL: a truncated tile is refused, never read short");
// CONTROL: the history this device checked is changed by one byte — the kept edge from the TRUE history no longer matches a ledger built
// on the changed one, and the edge built from the changed one doesn't give the true signed root.
const changed = entries.map((e) => new Uint8Array(e)); changed[3][0] ^= 1;
const changedLeaves = changed.map(hashLeaf);
t(!same(rootOf(extend(extend(EMPTY, changedLeaves.slice(0, B)), real.slice(B))), cp.root), "CONTROL: one changed byte in an entry already checked breaks the return visit's proof");

// 3. The memory itself: written by the page, read back only if it is exactly that.
const O = "log.333.eco/ledger", at = new Date().toISOString(), m = { edge: kept, pub: [{ index: 0, t: "season" }], at };
const back = decodeMemory(encodeMemory(O, m), O);
t(back && back.edge.size === B && back.edge.hashes.every((h, i) => same(h, kept.hashes[i])) && back.at === at, "the memory reads back as written");
const wrong = (o) => decodeMemory(JSON.stringify({ ...JSON.parse(encodeMemory(O, m)), ...o }), O) === null;
t(decodeMemory(encodeMemory(O, m), "log.333.eco/origin") === null, "CONTROL: another log's memory is refused");
t(wrong({ size: B + 1 }) && wrong({ hashes: ["AAAA"] }) && wrong({ v: 2 }) && wrong({ pub: [{ index: B }] }) && wrong({ at: "yesterday" }), "CONTROL: a size off a tile, a short hash, another version, a public entry past the edge, a date that isn't one: each refused");
t(decodeMemory("not json", O) === null && decodeMemory(null, O) === null, "CONTROL: nothing, or rubbish, is no memory");
console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
