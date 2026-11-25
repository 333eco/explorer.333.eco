// A B-Mail's files, compared on the check page (client/attachments.ts; founder 2026-11-25, "Attachments: agree"; open spec §3.1, §9.2:
// "the message's attachments, other than the carrier files, are exactly those listed, by SHA-256"). Each case has the reason it must
// hold. The vectors are the mail skill's own (bmail_canonical, 2026-11-25), copied into scripts/attachment-vectors.json. The controls
// run the same cases against careless versions and must see failures, so a passing run means the cases can fail.
//   node scripts/check-attachments.mjs
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const client = new URL("../client/", import.meta.url).pathname;
const bundle = async (src) => (await build({ stdin: { contents: src, loader: "ts", resolveDir: client }, bundle: true, format: "esm", write: false })).outputFiles[0].text;
const load = async (src) => import("data:text/javascript;base64," + Buffer.from(await bundle(src)).toString("base64"));
const real = await load(`export * from "./attachments";`);
const V = JSON.parse(readFileSync(new URL("attachment-vectors.json", import.meta.url), "utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const bytes = (f) => new Uint8Array(Buffer.from(f.b64, "base64"));
const one = (s) => s.split(/\s+/).filter(Boolean).join(" "); // how bmail_canonical writes a name
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

let code = 0;
const must = (ok, why) => { console.log(`${ok ? "ok  " : "FAIL"} ${why}`); if (!ok) code = 1; };
/** Each case: [why, (module) => boolean]. Run on the real module, and on careless ones as controls. */
const CASES = [];
const add = (why, test) => CASES.push([why, test]);

// The vectors: every `want` is parsed to its files, in order, and each file's own bytes match it.
for (const [i, v] of V.entries()) {
    add(`vector ${i + 1}: each attachment line is read as its SHA-256 and name, in order`, async (m) => {
        const got = m.listed(v.want), want = v.files.map((f) => ({ sha256: sha(bytes(f)), name: one(f.name) }));
        return JSON.stringify(got) === JSON.stringify(want);
    });
    add(`vector ${i + 1}: each file's bytes, hashed here, are the one signed`, async (m) => {
        const got = await Promise.all(v.files.map(async (f) => ({ name: f.name, sha256: await m.sha256Hex(bytes(f)) })));
        const c = m.compare(m.listed(v.want), got);
        return c.rows.length === v.files.length && c.rows.every((r) => r.file) && !c.unsigned.length;
    });
    add(`vector ${i + 1}: CONTROL one changed byte in a file and it is not matched, and is said not signed`, async (m) => {
        const changed = v.files.map((f) => bytes(f)), k = changed.findIndex((b) => b.length > 0); changed[k][changed[k].length - 1] ^= 1;
        const got = await Promise.all(changed.map(async (b, j) => ({ name: v.files[j].name, sha256: await m.sha256Hex(b) })));
        const c = m.compare(m.listed(v.want), got);
        return !c.rows[k].file && c.unsigned.some((u) => u.name === v.files[k].name);
    });
}
add("the empty file (vector 2) hashes to the empty input's SHA-256 and matches its line", async (m) => {
    const v = V[1], empty = v.files.find((f) => f.b64 === "");
    if (!empty || (await m.sha256Hex(new Uint8Array())) !== EMPTY) return false;
    const c = m.compare(m.listed(v.want), [{ name: "empty.bin", sha256: EMPTY }]);
    return c.rows.filter((r) => r.file).map((r) => r.item.sha256).join() === EMPTY && c.rows.some((r) => !r.file) && !c.unsigned.length;
});
add("a file not listed is reported as not signed with the message", async (m) => {
    const c = m.compare(m.listed(V[0].want), [{ name: "other.pdf", sha256: sha(Buffer.from("not this one")) }]);
    return c.unsigned.length === 1 && c.unsigned[0].name === "other.pdf" && !c.rows[0].file;
});
add("the name is informative: a renamed file (vector 3, chosen as renamed.pdf) still matches by its SHA-256", async (m) => {
    const v = V[2], c = m.compare(m.listed(v.want), [{ name: "renamed.pdf", sha256: sha(bytes(v.files[0])) }]);
    return !!c.rows[0].file && c.rows[0].file.name === "renamed.pdf" && !c.unsigned.length;
});
add("a file with a listed file's NAME but other bytes is not matched", async (m) => {
    const c = m.compare(m.listed(V[0].want), [{ name: "report.pdf", sha256: sha(Buffer.from("a different report")) }]);
    return !c.rows[0].file && c.unsigned.length === 1;
});
// ⭐ The founder's rule, 2026-11-25 ("3: agree"), one rule in all three checkers: leaving out any file NAMED b-mail.txt or
//    b-mail-proof.json (any case), the files received are exactly the listed fingerprints as a MULTISET, compared in lowercase.
add("the reserved names (B-Mail.txt, b-mail.txt, B-Mail-proof.json, B-MAIL-PROOF.JSON) are left out: neither matched nor said unsigned", async (m) => {
    const got = ["B-Mail.txt", "b-mail.txt", "B-Mail-proof.json", "B-MAIL-PROOF.JSON"].map((name) => ({ name, sha256: sha(Buffer.from(name)) }));
    const c = m.compare(m.listed(V[0].want), got);
    return !c.unsigned.length && c.carriers.length === 4 && !c.rows[0].file;
});
add("a reserved name is left out BY NAME, even when its bytes are a listed file's", async (m) => {
    const c = m.compare(m.listed(V[0].want), [{ name: "B-Mail.txt", sha256: sha(bytes(V[0].files[0])) }]);
    return !c.rows[0].file && c.carriers.length === 1 && !c.unsigned.length;
});
add("a hash listed twice needs two files: one file matches one line, the other stays unmatched", async (m) => {
    const line = V[0].want.match(/^attachment: .*\n/m)[0], c = m.compare(m.listed(V[0].want.replace(line, line + line)), [{ name: "report.pdf", sha256: sha(bytes(V[0].files[0])) }]);
    return c.rows.length === 2 && c.rows.filter((r) => r.file).length === 1 && !c.unsigned.length;
});
add("a hash listed twice, and two copies received: both lines match", async (m) => {
    const line = V[0].want.match(/^attachment: .*\n/m)[0], h = sha(bytes(V[0].files[0]));
    const c = m.compare(m.listed(V[0].want.replace(line, line + line)), [{ name: "report.pdf", sha256: h }, { name: "report copy.pdf", sha256: h }]);
    return c.rows.every((r) => r.file) && c.rows[0].file !== c.rows[1].file && !c.unsigned.length;
});
add("two copies of a file listed once: one matches, the other is one too many and is said not signed", async (m) => {
    const h = sha(bytes(V[0].files[0])), c = m.compare(m.listed(V[0].want), [{ name: "report.pdf", sha256: h }, { name: "report copy.pdf", sha256: h }]);
    return !!c.rows[0].file && c.unsigned.length === 1 && c.unsigned[0].sha256 === h;
});
// The acceptance table (evidence/twin/edges-result.txt): "the files are exactly those signed" must now read as statement.ts reads it.
const exactly = (c) => c.rows.every((r) => r.file) && !c.unsigned.length;
add("acceptance: the four cases where the checkers had disagreed now give statement.ts's answers (differs, differs, differs, all match)", async (m) => {
    const v = V[0], f = bytes(v.files[0]), h = sha(f), line = `attachment: ${h} report.pdf\n`;
    const got = [
        exactly(m.compare(m.listed(v.want.replace(line, line + line)), [{ name: "report.pdf", sha256: h }])),
        exactly(m.compare(m.listed(v.want), [{ name: "report.pdf", sha256: h }, { name: "report copy.pdf", sha256: h }])),
        exactly(m.compare(m.listed(v.want), [{ name: "B-Mail.txt", sha256: h }])),
        exactly(m.compare(m.listed(v.want.replace(h, h.toUpperCase())), [{ name: "report.pdf", sha256: h }])),
    ];
    return JSON.stringify(got) === JSON.stringify([false, false, false, true]);
});
add("a statement with no attachment lines lists no files, so no file box shows", async (m) => {
    const plain = "b-mail/v1\nfrom: A <a@x.test>\nto: b@x.test\nsubject: hi\nsalt: 00112233445566778899aabbccddeeff\n\nHello.\n";
    return m.listed(plain).length === 0 && m.mayShow(plain, true) === false;
});
add("no file box beside a message with no record: nothing was signed to compare with", async (m) => m.mayShow(V[0].want, false) === false && m.mayShow(V[0].want, true) === true);
add("an attachment line in the BODY is the sender's words, not a listed file", async (m) => {
    const t = V[0].want.replace("Attached.\n", `Attached.\nattachment: ${sha(Buffer.from("x"))} x.pdf\n`);
    return m.listed(t).length === 1 && m.listed(t)[0].name === "report.pdf";
});
add("only the head is read: a body after the first blank line, even one holding blank lines itself (vector 1)", async (m) => {
    const t = V[0].want + `\nattachment: ${sha(Buffer.from("y"))} y.pdf\n`;
    return m.listed(t).length === 1;
});
add("a malformed attachment line stays listed and can never be matched", async (m) => {
    const t = V[2].want.replace(/attachment: [0-9a-f]{64} /, "attachment: not-a-hash ");
    const l = m.listed(t), c = m.compare(l, [{ name: "x", sha256: sha(bytes(V[2].files[0])) }]);
    return l.length === 1 && l[0].sha256 === "not-a-hash" && !c.rows[0].file;
});
add("a hash written in capitals is the same SHA-256, and matches", async (m) => {
    const t = V[0].want.replace(/attachment: ([0-9a-f]{64})/, (_, x) => `attachment: ${x.toUpperCase()}`);
    return !!m.compare(m.listed(t), [{ name: "report.pdf", sha256: sha(bytes(V[0].files[0])) }]).rows[0].file;
});
add("not a B-Mail: nothing is listed", async (m) => m.listed(V[0].want.replace("b-mail/v1\n", "b-post/v1\n")).length === 0);

const failed = async (m) => { const out = []; for (const [why, t] of CASES) if (!(await t(m).catch(() => false))) out.push(why); return out; };
const bad = await failed(real);
for (const [why] of CASES) must(!bad.includes(why), why);

// ⛔ Never uploaded, never sent anywhere (a property of the code, checked on what is built): the module and what it imports name no
// way to reach the network. Held again in real Chrome by scripts/drive.mjs (no request while files are read and compared).
const NET = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|postMessage|\bimport\s*\(|new\s+(Image|Worker|SharedWorker)\b|\.src\s*=|\.action\s*=|\.submit\s*\(|location\s*\.\s*(href|assign|replace)|window\.open/;
const shipped = await bundle(`export * from "./attachments";`);
must(!NET.test(shipped), "the file comparison names no way to reach the network (no fetch, beacon, socket, worker, form or navigation)");
must(NET.test(await bundle(`export * from "./attachments"; export const leak = (h: string) => fetch("https://example.test/?" + h);`)), "CONTROL: the same probe sees a fetch when one is added");
// ⛔ Never "verified", never a person (the page says a press shows a passkey, never a person).
const WORDS = /verif|person|human/i;
must(!WORDS.test(shipped), "its words never say verified, never a person");
must(WORDS.test(await bundle(`export * from "./attachments"; export const w = "Verified";`)), "CONTROL: the same probe sees the word when it is there");

// Controls: careless versions must fail the cases above, so the cases can fail.
const careless = {
    "matches by name": await load(`export * from "./attachments"; import * as a from "./attachments";
        export const compare = (l, got) => { const c = a.compare(l, got); for (const r of c.rows) r.file = got.find((f) => f.name.trim() === r.item.name) ?? null; c.unsigned = got.filter((f) => !l.some((x) => x.name === f.name.trim()) && !a.isReserved(f.name)); return c; };`),
    "reads the whole text, body included": await load(`export * from "./attachments";
        export const listed = (t) => t.startsWith("b-mail/v1\\n") ? [...t.matchAll(/^attachment: (\\S+) (.*)$/gm)].map((m) => ({ sha256: m[1], name: m[2] })) : [];`),
    "compares as a set (any file with a listed hash matches every line with it, and is never one too many)": await load(`export * from "./attachments"; import * as a from "./attachments";
        export const compare = (l, got) => { const c = a.compare(l, got); const hs = new Set(got.filter((f) => !a.isReserved(f.name)).map((f) => f.sha256)); for (const r of c.rows) r.file = got.find((f) => !a.isReserved(f.name) && f.sha256 === r.item.sha256.toLowerCase()) ?? null; c.unsigned = got.filter((f) => !a.isReserved(f.name) && !l.some((x) => x.sha256.toLowerCase() === f.sha256)); return c; };`),
    "lets a reserved name through when its bytes are listed, and shows a box with no record": await load(`export * from "./attachments"; import * as a from "./attachments";
        export const compare = (l, got) => { const ok = new Set(l.map((x) => x.sha256.toLowerCase())); const c = a.compare(l, got.map((f) => ok.has(f.sha256) ? { ...f, name: "renamed-" + f.name } : f)); return c; };
        export const mayShow = (t) => a.listed(t).length > 0;`),
    "keeps only well-formed lines": await load(`export * from "./attachments"; import * as a from "./attachments";
        export const listed = (t) => a.listed(t).filter((x) => /^[0-9a-f]{64}$/.test(x.sha256));`),
    "compares hashes as written": await load(`export * from "./attachments"; import * as a from "./attachments";
        export const compare = (l, got) => a.compare(l.map((x) => ({ ...x, sha256: x.sha256 === x.sha256.toLowerCase() ? x.sha256 : "x" + x.sha256 })), got);`),
};
for (const [name, m] of Object.entries(careless)) {
    const miss = await failed(m);
    must(miss.length >= 1, `control: a version that ${name} fails ${miss.length} of ${CASES.length} cases${miss.length ? ` (${miss[0]})` : ""}`);
}
process.exit(code);
