// When the B-Mail check page may invite (client/invite.ts, §b-mail-viral-loop). Each case has the reason it must hold; the control
// runs the same cases against a version with the guards removed and must see failures, so a passing run means the cases can fail.
//   node scripts/check-invite.mjs
import { build } from "esbuild";

const load = async (src) => {
    const out = await build({ stdin: { contents: src, loader: "ts", resolveDir: new URL("../client/", import.meta.url).pathname }, bundle: true, format: "esm", write: false });
    return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
};
const real = await load(`export * from "./invite";`);
const careless = await load(`export const INVITE_HREF = "https://333.eco/?from=b-mail";
export function invitationFor(text) { return /^name: (@[A-Za-z0-9._-]{1,64})$/m.exec(text)?.[1] ?? null; }`);

const MAIL = "b-mail/v1\nfrom: A <a@x.test>\nto: b@x.test\nname: @sokha.keo\nsubject: hi\n\nHello.\n";
const CASES = [
    ["a found record that names an @name invites with that name", [MAIL, true, false], "@sokha.keo"],
    ["no record (never signed, or changed after): no invitation beside a failed check", [MAIL, false, false], null],
    ["withdrawn by its signer: no invitation", [MAIL, true, true], null],
    ["a signed mail that names no @name: nothing to invite with", [MAIL.replace("name: @sokha.keo\n", ""), true, false], null],
    ["a name line written in the BODY is not the signer's name", [MAIL.replace("name: @sokha.keo\n", "").replace("Hello.", "name: @someone.else"), true, false], null],
    ["not a B-Mail at all", ["hello\n\nname: @x\n", true, false], null],
    // v1.10: a mail signed as a free address is checked against that address, but invites no one yet (an address page has no B-Mail thank link).
    ["a mail signed as a free address: no invitation (yet)", [MAIL.replace("name: @sokha.keo", "name: B:7K3M-9XD2-QH4N"), true, false], null],
];
const run = (m) => CASES.filter(([, args, want]) => m.invitationFor(...args) !== want).map(([why]) => why);

// The second line, "Sign your own mail" (P-BM3): beside a found, unwithdrawn B-Mail, with or without an @name.
const SIGN = [
    ["a found record invites its reader to sign their own", [MAIL, true, false], true],
    ["…with no @name too: signing a mail needs none", [MAIL.replace("name: @sokha.keo\n", ""), true, false], true],
    ["no record: nothing beside a failed check", [MAIL, false, false], false],
    ["withdrawn by its signer: nothing", [MAIL, true, true], false],
    ["not a B-Mail at all", ["hello\n\nname: @x\n", true, false], false],
];
let code = 0;
for (const [why, args, want] of SIGN) { const ok = real.maySign(...args) === want; console.log(`${ok ? "ok  " : "FAIL"} sign line: ${why}`); if (!ok) code = 1; }
const sh = new URL(real.SIGN_HREF);
const okSign = sh.origin === "https://sign.333.eco" && sh.pathname === "/b-mail" && sh.searchParams.get("from") === "b-mail" && [...sh.searchParams.keys()].length === 1;
console.log(`${okSign ? "ok  " : "FAIL"} the sign link marks the channel and nothing else`); if (!okSign) code = 1;
const lax = SIGN.filter(([, args, want]) => (args[0].startsWith("b-mail/v1")) !== want).length;
console.log(`${lax >= 2 ? "ok  " : "FAIL"} control: a version that only asks "is it a B-Mail" fails ${lax} of ${SIGN.length} cases`); if (lax < 2) code = 1;
const bad = run(real);
for (const [why] of CASES) console.log(`${bad.includes(why) ? "FAIL" : "ok  "} ${why}`);
if (bad.length) code = 1;
const href = new URL(real.INVITE_HREF);
const okHref = href.origin === "https://333.eco" && href.searchParams.get("from") === "b-mail" && [...href.searchParams.keys()].length === 1;
console.log(`${okHref ? "ok  " : "FAIL"} the link marks the channel and nothing else (no reader, no message)`);
if (!okHref) code = 1;
const missed = run(careless);
console.log(`${missed.length >= 3 ? "ok  " : "FAIL"} control: a version without the guards fails ${missed.length} of ${CASES.length} cases`);
if (missed.length < 3) code = 1;

// The thank back (founder 2026-11-25, B-Mail thanks phase 3 (a); board C1): beside a found, unwithdrawn record whose signer check PASSED
// on this page, to that same @name. The fourth argument is the signer check's result: true passed, null not confirmed, false failed.
const call = (m, f, ...a) => { try { return typeof m[f] === "function" ? m[f](...a) : `(no ${f})`; } catch (e) { return `(threw: ${e.message})`; } };
const THANK = [
    ["a found record whose signer check passed: the thank line, to that @name", [MAIL, true, false, true], "@sokha.keo"],
    ["the name not confirmed (no proof in the link, or a passkey that page doesn't show): none", [MAIL, true, false, null], null],
    ["a proof that doesn't fit the record (the comparison failed): none", [MAIL, true, false, false], null],
    ["no signer check ran at all: none", [MAIL, true, false, undefined], null],
    ["withdrawn by its signer, though its signer check passed: none", [MAIL, true, true, true], null],
    ["no record of this exact message: none", [MAIL, false, false, true], null],
    ["a statement with no name: line: none", [MAIL.replace("name: @sokha.keo\n", ""), true, false, true], null],
    ["a name line written in the BODY is not the signer's name: none", [MAIL.replace("name: @sokha.keo\n", "").replace("Hello.", "name: @someone.else"), true, false, true], null],
    ["not a B-Mail at all: none", ["hello\n\nname: @x\n", true, false, true], null],
];
for (const [why, args, want] of THANK) { const got = call(real, "thankFor", ...args), ok = got === want; console.log(`${ok ? "ok  " : "FAIL"} thank line: ${why}${ok ? "" : ` (got ${JSON.stringify(got)})`}`); if (!ok) code = 1; }
// The link: exactly the ruled address, the @name in its path, ONE query key `thank=b-mail`, `#thank`, and never `from=b-mail`.
const th = call(real, "thankHref", "@sokha.keo");
let okThank = th === "https://333.eco/@sokha.keo?thank=b-mail#thank";
try { const u = new URL(th); okThank &&= u.origin === "https://333.eco" && u.pathname === "/@sokha.keo" && u.hash === "#thank" && [...u.searchParams.keys()].join() === "thank" && u.searchParams.get("thank") === "b-mail" && !/from=/.test(th); } catch { okThank = false; }
console.log(`${okThank ? "ok  " : "FAIL"} the thank link is https://333.eco/@x?thank=b-mail#thank, with no from=b-mail and nothing about the reader (got ${JSON.stringify(th)})`); if (!okThank) code = 1;
// The words, in English and in our Khmer (the board's c_thank, copied byte for byte), each naming the @name; no words are filled in.
const w = call(real, "thankWords", "@sokha.keo");
const okWords = Array.isArray(w) && w[0] === "Thank @sokha.keo for this mail" && w[1] === "អរគុណ @sokha.keo សម្រាប់សំបុត្រនេះ";
console.log(`${okWords ? "ok  " : "FAIL"} the line reads "Thank @x for this mail", and in Khmer "អរគុណ @x សម្រាប់សំបុត្រនេះ" (got ${JSON.stringify(w)})`); if (!okWords) code = 1;
// CONTROL: a careless gate (any truthy signer result, withdrawal ignored) fails cases above, so they can fail.
const sloppy = (text, found, withdrawn, signer) => (signer !== false ? real.invitationFor(text, found, false) : null);
const loose = THANK.filter(([, args, want]) => sloppy(...args) !== want).length;
console.log(`${loose >= 3 ? "ok  " : "FAIL"} control: a gate that takes "not failed" for passed and ignores withdrawal fails ${loose} of ${THANK.length} cases`); if (loose < 3) code = 1;
process.exit(code);
