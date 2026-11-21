// client/stamped.ts (2026-11-20, the explorer's ticks): when the ledger page may tick an outside clock's stamp. Notes are signed here with a
// key of this test's own, so it holds the case the live ledger can't show: a checkpoint the ledger DID sign whose root isn't the audited one.
// The control runs the same cases against the page's old rule (any text served at checkpoints/<s> was stamped) and must see it accept them.
//   node scripts/check-stamped.mjs
import { build } from "esbuild";
import { randomBytes, createHash } from "node:crypto";
import { treeRoot } from "@333eco/origin-verify";

const load = async (src) => {
    const out = await build({ stdin: { contents: src, loader: "ts", resolveDir: new URL("../client/", import.meta.url).pathname }, bundle: true, format: "esm", write: false, logLevel: "silent" });
    return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
};
const { heldStamp } = await load(`export * from "./stamped";`);
// The page before 2026-11-20: whatever checkpoints/<s> served was the stamped state.
const careless = async (note) => (note === null ? { ok: false, why: "unread" } : { ok: true, body: new TextEncoder().encode(note.slice(0, note.indexOf("\n\n") + 1)) });

const b64 = (b) => Buffer.from(b).toString("base64");
/** A signed-note key (C2SP signed-note, Ed25519), and a checkpoint signed with it. */
async function signer(name) {
    const k = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]), raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
    const id = createHash("sha256").update(Buffer.concat([Buffer.from(name + "\n"), Buffer.from([1]), raw])).digest().subarray(0, 4);
    return {
        vkey: `${name}+${id.toString("hex")}+${b64(Buffer.concat([Buffer.from([1]), raw]))}`,
        note: async (size, root) => { const body = `${name}\n${size}\n${b64(root)}\n`, sig = new Uint8Array(await crypto.subtle.sign("Ed25519", k.privateKey, Buffer.from(body))); return `${body}\n— ${name} ${b64(Buffer.concat([id, sig]))}\n`; },
    };
}
const ORIGIN = "log.example/ledger", log = await signer(ORIGIN), stranger = await signer(ORIGIN), trust = { origin: ORIGIN, logVkey: log.vkey, witnesses: [] };
const leaves = Array.from({ length: 600 }, () => new Uint8Array(randomBytes(32))), forked = [...leaves.slice(0, 300), ...Array.from({ length: 300 }, () => new Uint8Array(randomBytes(32)))];
const rootAt = (x) => (x > leaves.length ? null : treeRoot(leaves.slice(0, x)));
const good = await log.note(384, treeRoot(leaves.slice(0, 384)));
const flipped = good.replace(/^(— \S+ \S{20})(\S)/m, (_, a, c) => a + (c === "A" ? "B" : "A"));

let bad = 0; const t = (ok, what) => { console.log(ok ? "✓" : "✗", what); if (!ok) bad++; };
const CASES = [
    ["the ledger's own checkpoint at the stamped size, with the audited root there: held", [good, 384, rootAt], "ok"],
    ["one changed character in the ledger's signature: not held", [flipped, 384, rootAt], "signature"],
    ["signed by another key under the ledger's name: not held", [await stranger.note(384, treeRoot(leaves.slice(0, 384))), 384, rootAt], "signature"],
    ["not a signed note at all: not held", ["log.example/ledger\n384\n", 384, rootAt], "signature"],
    ["the ledger's own checkpoint at 256, served as the state at 384: not held", [await log.note(256, treeRoot(leaves.slice(0, 256))), 384, rootAt], "size"],
    ["signed by the ledger, at 384, over a history that forks from the audited one at 300: not held", [await log.note(384, treeRoot(forked.slice(0, 384))), 384, rootAt], "root"],
    ["a stamped state longer than the audited ledger: not held", [await log.note(700, treeRoot([...leaves, ...forked.slice(0, 100)])), 700, rootAt], "beyond"],
    ["the stamped file can't be read: nothing checked", [null, 384, rootAt], "unread"],
    ["the audited root at that size can't be read: nothing checked", [good, 384, () => { throw new Error("offline"); }], "unread"],
];
for (const [what, [note, size, at], want] of CASES) {
    const got = await heldStamp(note, size, trust, at);
    t(want === "ok" ? got.ok === true && new TextDecoder().decode(got.body) === good.slice(0, good.indexOf("\n\n") + 1) : got.ok === false && got.why === want, `${what} (${got.ok ? "held" : got.why})`);
}
t((await heldStamp(await log.note(256, treeRoot(leaves.slice(0, 256))), 384, trust, rootAt)).size === 256, "a checkpoint of another size says its own size");
let accepted = 0;
for (const [, [note, size, at], want] of CASES) if (want !== "ok" && want !== "unread" && (await careless(note, size, trust, at)).ok) accepted++;
t(accepted === 6, `control: the old rule accepts all 6 forged stamps (${accepted})`);
console.log(bad ? `${bad} failed` : "all passed");
process.exit(bad ? 1 : 0);
