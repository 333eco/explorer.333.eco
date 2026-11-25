// client/legal.ts (roadmap A709, 2026-11-25): when the Legal tab may tick a version. No network: the fixtures in legal-fixtures/ are public
// files copied byte for byte (333eco/legal-versions on 2026-11-25: the earth.333.eco terms, their pending proof, the 2026-11-25 manifest
// and its three tokens; thonly/publications: the-founder.md, its proof confirmed in block 967728, and that block's header from mempool.space).
// The control runs the same cases against a careless rule (a proof's block or a manifest line ticks, whatever text was served) and must
// see it tick a changed text.
//   node scripts/check-legal.mjs
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const load = async (src) => {
    const out = await build({ stdin: { contents: src, loader: "ts", resolveDir: new URL("../client/", import.meta.url).pathname }, bundle: true, format: "esm", write: false, logLevel: "silent" });
    return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
};
const L = await load(`export * from "./legal"; export { anchorOf, otsDigest } from "./proofs";`);
const fx = (f) => new Uint8Array(readFileSync(new URL(`legal-fixtures/${f}`, import.meta.url)));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const flip = (b, at = b.length - 5) => { const c = Uint8Array.from(b); c[at] ^= 1; return c; };

let bad = 0; const t = (ok, what) => { console.log(ok ? "✓" : "✗", what); if (!ok) bad++; };

const docs = L.readIndex(JSON.parse(new TextDecoder().decode(fx("index.json"))));
const terms = docs.find((d) => d.host === "earth.333.eco" && d.doc === "terms"), tv = terms.versions[0];
const M = (day) => `${L.RAW}timestamps/manifests/${day}.sha256`;
/** The repository as a map of address → bytes; any other address answers 404 (null). `seen` records every address asked for. */
const repo = (files, seen = []) => async (url) => { seen.push(url); return url in files ? files[url] : null; };
const real = () => ({
    [L.RAW + tv.path]: fx("terms.md"), [`${L.RAW}${tv.path}.ots`]: fx("terms.md.ots"), [M("2026-11-25")]: fx("2026-11-25.sha256"),
    ...Object.fromEntries(["aped-gr", "accv-es", "freetsa-de"].map((a) => [`${M("2026-11-25")}.${a}.tsr`, fx(`2026-11-25.sha256.${a}.tsr`)])),
});
const header = fx("header-967728.hex"), headerOf = async (h) => (h === 967728 ? Uint8Array.from(Buffer.from(new TextDecoder().decode(header), "hex")) : null);
const run = (d, v, files, o = {}) => L.checkVersion(d, v, { get: repo(files, o.seen), header: o.header ?? headerOf, today: o.today ?? "2026-11-25" });
/** A tick, as the page draws one: on the text, the authorities or Bitcoin. */
const ticks = (c) => [c.text.state === "match" && "text", c.tsa.state === "signed" && "tsa", c.bitcoin.state === "block" && c.bitcoin.checked === true && "bitcoin"].filter(Boolean);
/** The careless rule, run on the same files: the manifest's line alone ticks the authorities, and the proof's block alone ticks Bitcoin,
 *  whatever text was served (the papers' TSA leg reads the line alone; a .ots names its own fingerprint, so its block says nothing of a text). */
const careless = async (v, files) => {
    const m = files[M("2026-11-25")], out = [];
    if (m && new TextDecoder().decode(m).split("\n").includes(`${v.sha256}  ${v.path}`)) out.push("tsa");
    const proof = files[`${L.RAW}${v.path}.ots`];
    if (proof && (await L.anchorOf(proof, Uint8Array.from(Buffer.from(v.sha256, "hex")), headerOf)).checked === true) out.push("bitcoin");
    return out;
};

t(sha(fx("terms.md")) === tv.sha256 && L.sound(terms, tv), "fixture: the earth.333.eco terms hash to the index's fingerprint, and the entry's address follows from it");

{   // The live state on 2026-11-25: the text matches, three authorities signed the manifest, the proof waits for a block.
    const c = await run(terms, tv, real());
    t(c.text.state === "match", "the real text is ticked (hashed here to the index's fingerprint)");
    t(c.tsa.state === "signed" && c.tsa.day === "2026-11-25" && c.tsa.names.length === 3, `the 2026-11-25 manifest lists it and its three tokens check (${c.tsa.names?.join(", ")})`);
    t(c.bitcoin.state === "pending", "the proof is pending: \"Waiting for a block\", no tick");
    t(c.existedBy === c.tsa.first && /^2026-11-25T22:24/.test(c.existedBy), `"existed by" is the authorities' earliest time, checked here (${c.existedBy})`);
}
{   // ⛔ One byte changed in the text: no tick anywhere, and no date.
    const files = real(); files[L.RAW + tv.path] = flip(files[L.RAW + tv.path]);
    const c = await run(terms, tv, files);
    t(c.text.state === "differs" && ticks(c).length === 0, `a text with one byte changed gets no tick (${ticks(c).join(",") || "none"})`);
    t(c.existedBy === null, "and no \"existed by\" date");
    t((await careless(tv, files)).includes("tsa"), "CONTROL: the careless rule ticks that changed text's authorities (it reads the manifest line alone)");
}
{   // The text can't be read: nothing ticked, said as unread.
    const files = real(); delete files[L.RAW + tv.path];
    const c = await run(terms, tv, files);
    t(c.text.state === "unread" && ticks(c).length === 0 && c.existedBy === null, "a text that can't be read: no tick, no date");
}
{   // The manifest: the line must be exact, and the tokens must be over the bytes served.
    const files = real(); const m = new TextDecoder().decode(files[M("2026-11-25")]); files[M("2026-11-25")] = new TextEncoder().encode(m.replace(tv.sha256, tv.sha256.replace(/.$/, (x) => (x === "0" ? "1" : "0"))));
    let c = await run(terms, tv, files);
    t(c.tsa.state === "absent" && !ticks(c).includes("tsa"), "a manifest whose line for it names another fingerprint doesn't count it");
    const f2 = real(); f2[M("2026-11-25")] = flip(f2[M("2026-11-25")], 3);
    c = await run(terms, tv, f2);
    t(c.tsa.state === "bad" && c.existedBy === null, "a manifest with one byte changed elsewhere: its tokens fail, no tick, no date");
    const f3 = real(); for (const a of ["aped-gr", "accv-es", "freetsa-de"]) delete f3[`${M("2026-11-25")}.${a}.tsr`];
    c = await run(terms, tv, f3);
    t(c.tsa.state === "tokens-unread" && c.existedBy === null, "a manifest with no tokens to read: said, not ticked");
}
{   // ⭐ The earliest manifest that lists it gives the date, never the newest (the weekly re-attestation would move it later each week).
    const files = real(); files[M("2026-12-02")] = files[M("2026-11-25")];
    for (const a of ["aped-gr", "accv-es", "freetsa-de"]) files[`${M("2026-12-02")}.${a}.tsr`] = files[`${M("2026-11-25")}.${a}.tsr`];
    const c = await run(terms, tv, files, { today: "2026-12-05" });
    t(c.tsa.state === "signed" && c.tsa.day === "2026-11-25", `with a later manifest too, the earliest one is read (${c.tsa.day})`);
    t(L.manifestDays(tv, "2026-12-05")[0] === "2026-11-24" && L.manifestDays(tv, "2026-11-25").at(-1) === "2026-11-26", "the days read run from the day before it was first served, never past tomorrow");
}
{   // A proof confirmed in a block (the-founder.md, block 967728), served as a legal version: the block path the live record can't show yet.
    const text = fx("founder.md"), s = sha(text), d = { host: "earth.333.eco", body: "", doc: "terms", title: "Terms of service" };
    const v = { id: `2026-09-01-${s.slice(0, 6)}`, dateLine: "Draft of 1 September 2026.", date: "2026-09-01", sha256: s, path: `earth.333.eco/terms/2026-09-01-${s.slice(0, 6)}.md`, operator: null, firstServed: "2026-09-01", review: null };
    const files = { [L.RAW + v.path]: text, [`${L.RAW}${v.path}.ots`]: fx("founder.md.ots") };
    let c = await run(d, v, files);
    t(c.bitcoin.state === "block" && c.bitcoin.height === 967728 && c.bitcoin.checked === true, "a confirmed proof is checked against its block's header and ticked");
    t(c.existedBy === c.bitcoin.time && !!c.existedBy, `"existed by" is the block's time (${c.existedBy})`);
    c = await run(d, v, { ...files, [L.RAW + v.path]: flip(text) });
    t(!ticks(c).length && c.bitcoin.state === "untied" && c.existedBy === null, "⛔ the same proof beside a text with one byte changed: no tick, no date");
    t((await careless(v, { ...files, [L.RAW + v.path]: flip(text) })).includes("bitcoin"), "CONTROL: the careless rule ticks Bitcoin for that changed text");
    c = await run(d, v, files, { header: async () => flip(Uint8Array.from(Buffer.from(new TextDecoder().decode(header), "hex")), 40) });
    t(c.bitcoin.state === "block" && c.bitcoin.checked === false && !ticks(c).includes("bitcoin"), "a block header with one byte changed doesn't hold the proof: failed, no tick");
    c = await run(d, v, files, { header: async () => null });
    t(c.bitcoin.state === "block" && c.bitcoin.checked === null && c.existedBy === null, "a block that can't be read: named, not ticked, no date");
    c = await run(d, v, { ...files, [`${L.RAW}${v.path}.ots`]: fx("terms.md.ots") });
    t(c.bitcoin.state === "other" && !ticks(c).includes("bitcoin"), "another text's proof served beside it: \"another fingerprint\", no tick");
}
{   // An entry whose address doesn't follow from its fingerprint is never read, let alone ticked.
    const seen = [], wrongId = { ...tv, id: "2026-11-09-000000", path: "earth.333.eco/terms/2026-11-09-000000.md" };
    let c = await run(terms, wrongId, real(), { seen });
    t(!c.sound && !ticks(c).length && seen.length === 0, "an id that isn't its fingerprint's: refused, nothing fetched");
    c = await run(terms, { ...tv, path: "../../thonly/notes/main/x.md" }, real(), { seen });
    t(!c.sound && seen.length === 0, "a path outside <host>/<doc>/<id>.md: refused, nothing fetched");
    t(L.sound(terms, tv) && !L.sound({ ...terms, host: "evil.example/x" }, tv), "CONTROL: the same rule accepts the real entry");
}
{   // The review record (E10): shown only when the index has one; its date only from the record.
    t(L.reviewDate(tv) === null && tv.review === null, "today's versions have no review record (none exists on 2026-11-25), so the page shows nothing for it");
    t(L.reviewDate({ ...tv, review: { date: "2027-01-12" } }) === "2027-01-12" && L.reviewDate({ ...tv, review: { date: "soon" } }) === null, "a review record's date is read only when it is a date");
}
t(L.currentOf({ versions: [{ id: "2026-11-09-ab4e2e" }, { id: "2027-01-12-7c19d0" }, { id: "2026-12-01-111111" }] }).id === "2027-01-12-7c19d0", "the current version is the newest by its id, whatever the index's order");

console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
