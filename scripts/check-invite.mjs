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
];
const run = (m) => CASES.filter(([, args, want]) => m.invitationFor(...args) !== want).map(([why]) => why);

let code = 0;
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
process.exit(code);
