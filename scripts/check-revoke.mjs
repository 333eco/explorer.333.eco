// The page in real Chrome over a log that holds every kind of entry: records, a withdrawal, a void, a revoke entry by its holder, one by
// the operator, a kind this page doesn't know ("future"), and a revoke still waiting for its checkpoint (2026-11-26: `t: "revoke"`,
// b-poh-statements v1.7 §6.1). ⭐ No network: the log is built here, signed with keys made for this run (a log key and a record key
// standing in for K1), and every request the page makes is answered here. The only difference from the shipped build is that
// `@333eco/origin-verify/trust` names those test keys. Each page must render with no exception and no failure mark, in English and Khmer.
// CONTROL: the same log with its revoke entry signed under a RECORD's label must fail the page's audit, out loud, so a passing run means
// the audit really ran. Run against BASE's client (a path to that tree) it must fail: there, a revoke entry read as a failed check.
//   node scripts/check-revoke.mjs [tree] [screenshot-dir]
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { build } from "esbuild";
import { canonical, hashLeaf, treeRoot } from "@333eco/origin-verify";

const tree = resolve(process.argv[2] ?? new URL("..", import.meta.url).pathname), shots = process.argv[3] ?? null, work = mkdtempSync(join(tmpdir(), "revoke-"));
if (shots) mkdirSync(shots, { recursive: true });
const b64 = (b) => Buffer.from(b).toString("base64"), b64u = (b) => Buffer.from(b).toString("base64url");
const sha = (...p) => createHash("sha256").update(Buffer.concat(p.map((x) => Buffer.from(x)))).digest();

// ── the keys and the log ──────────────────────────────────────────────────────────────────────────────────────────────
const ORIGIN = "log.333.eco/origin", log = generateKeyPairSync("ed25519"), rec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const raw = Buffer.from(log.publicKey.export({ format: "jwk" }).x, "base64url"), id = sha(ORIGIN + "\n", [1], raw).subarray(0, 4);
const trust = { origin: ORIGIN, logVkey: `${ORIGIN}+${id.toString("hex")}+${b64(Buffer.concat([Buffer.from([1]), raw]))}`, recordKeys: { "k1-test": b64(rec.publicKey.export({ type: "spki", format: "der" })) },
    rpId: "sign.333.eco", webOrigin: "https://sign.333.eco", witnessQuorum: 4, witnessLabel: "test witnesses", witnesses: [], tsaRoots: {} };
const signed = (e, label = `b-origin/${e.t}/v${e.v}`) => ({ ...e, kid: "k1-test", witnessSig: b64u(sign("sha256", Buffer.concat([Buffer.from(label + "\0"), Buffer.from(canonical({ ...e, kid: "k1-test" }))]), { key: rec.privateKey, dsaEncoding: "ieee-p1363" })) });
const c32 = (s) => b64u(sha(s)), keyId = (s) => b64u(sha("cose " + s));
const record = (index, at) => signed({ t: "record", v: 3, index, claim: { sha256: sha(`file ${index}`).toString("hex"), source: "digitalCreation", tool: "sign.333.eco", mime: "image/png", declared: true },
    claimCommitment: c32(`c${index}`), assertionCommitment: c32(`a${index}`), ownerTag: c32(`o${index}`), handlePointer: c32(`h${index}`), press: { key: "passkey" }, witnessedAt: at });
const HOLDER = { t: "revoke", v: 1, index: 4, keys: [keyId("app"), keyId("pin")], compromised: "2026-11-25T10:00Z", by: "holder", claimCommitment: c32("rc"), assertionCommitment: c32("ra"), witnessedAt: "2026-11-26T09:00Z" };
const entriesWith = (label) => [record(0, "2026-11-20T08:15Z"), record(1, "2026-11-21T09:30Z"), signed({ t: "withdraw", v: 1, index: 2, target: 1, claimCommitment: c32("wc"), assertionCommitment: c32("wa"), ownerTag: c32("wo"), witnessedAt: "2026-11-22T10:00Z" }),
    { t: "void", v: 1, index: 3 }, signed(HOLDER, label),
    signed({ t: "revoke", v: 1, index: 5, keys: [keyId("batch")], compromised: "2026-10-02T07:41Z", by: "operator", witnessedAt: "2026-11-26T11:20Z" }),
    signed({ t: "future", v: 1, index: 6, what: "a kind of entry this page has never seen", witnessedAt: "2026-11-26T12:00Z" }), record(7, "2026-11-26T13:00Z")];
const WAITING = signed({ t: "revoke", v: 1, index: 8, keys: [keyId("w1"), keyId("w2"), keyId("w3")], compromised: "2026-11-26T13:30Z", by: "holder", claimCommitment: c32("wrc"), assertionCommitment: c32("wra"), witnessedAt: "2026-11-26T14:00Z" });
function files(entries) {
    const bytes = entries.map((e) => Buffer.from(canonical(e))), leaves = bytes.map((b) => Buffer.from(hashLeaf(new Uint8Array(b)))), size = entries.length;
    const body = `${ORIGIN}\n${size}\n${b64(treeRoot(leaves.map((l) => new Uint8Array(l))))}\n`, sig = sign(null, Buffer.from(body), log.privateKey);
    return { checkpoint: Buffer.from(`${body}\n— ${ORIGIN} ${b64(Buffer.concat([id, sig]))}\n`), [`tile/entries/000.p/${size}`]: Buffer.concat(bytes.flatMap((b) => [Buffer.from([b.length >> 8, b.length & 255]), b])), [`tile/0/000.p/${size}`]: Buffer.concat(leaves) };
}
const good = files(entriesWith()), bad = files(entriesWith("b-origin/record/v3"));
let served = good;

// ── the page, built from `tree` with only the trust swapped ──────────────────────────────────────────────────────────
const dist = join(work, "dist"); cpSync(join(tree, "public"), dist, { recursive: true }); cpSync(join(tree, "client/index.html"), join(dist, "index.html"));
writeFileSync(join(work, "trust.mjs"), `export default ${JSON.stringify(trust)};`);
await build({ entryPoints: [join(tree, "client/app.ts")], bundle: true, format: "iife", target: "es2020", outfile: join(dist, "app.js"), logLevel: "silent", define: { LEDGER_WORKER: '""', LEGAL_CHUNK: '"/legal-tab.js"' }, external: ["/legal-tab.js*"],
    plugins: [{ name: "test-trust", setup(b) { b.onResolve({ filter: /^@333eco\/origin-verify\/trust$/ }, () => ({ path: join(work, "trust.mjs") })); } }] });
const csp = /Content-Security-Policy: (.*)/.exec(readFileSync(join(dist, "_headers"), "utf8"))[1];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const PORT = 8811, DEBUG = 9351;
const srv = createServer((req, res) => {
    let f = join(dist, new URL(req.url, "http://x").pathname);
    if (!existsSync(f) || statSync(f).isDirectory()) f = join(dist, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream", "Content-Security-Policy": csp }); res.end(readFileSync(f));
}).listen(PORT, "127.0.0.1");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${join(work, "chrome")}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0; const must = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) code = 1; };
try {
    let target;
    for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find((t) => t.type === "page"); } catch {} }
    const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
    let n = 0; const wait = new Map(), errors = [], outside = [];
    const cdp = (method, params = {}) => new Promise((r) => { const k = ++n; wait.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
    const answer = (requestId, status, body, type = "application/octet-stream") => cdp("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Content-Type", value: type }], body: b64(body ?? "") });
    ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id) { wait.get(d.id)?.(d); wait.delete(d.id); }
        if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
        if (d.method === "Fetch.requestPaused") {
            const u = new URL(d.params.request.url), rid = d.params.requestId;
            if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return cdp("Fetch.continueRequest", { requestId: rid });
            if (u.host === "log.333.eco" && u.pathname.startsWith("/origin/")) { const f = served[u.pathname.slice(8)]; return answer(rid, f ? 200 : 404, f ?? ""); }
            if (u.href === "https://sign.333.eco/log/waiting") return answer(rid, 200, JSON.stringify({ entries: [{ index: 8, entry: b64(canonical(WAITING)) }] }), "application/json");
            outside.push(u.href); return answer(rid, 404, ""); // nothing leaves this machine
        }
    };
    for (const d of ["Page", "Runtime"]) await cdp(`${d}.enable`);
    await cdp("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const ev = async (expression) => { const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
    const main = () => ev("document.querySelector('main').innerText");
    const settled = async (what) => { for (let t = 0; t < 20000; t += 150) { await sleep(150); if (await ev(`!!document.querySelector('main h1') && !document.querySelector('main [role=status]')`).catch(() => false)) return; } throw new Error(`timed out: ${what}: ${await main()}`); };
    const open = async (p) => { await cdp("Page.navigate", { url: `http://127.0.0.1:${PORT}${p}` }); await sleep(300); await settled(p); };
    const shot = async (name) => { if (!shots) return; await sleep(250); const { data } = (await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })).result; writeFileSync(join(shots, name + ".png"), Buffer.from(data, "base64")); };
    const lang = async (l) => { await ev(`document.querySelector('button[data-lang=${l}]').click()`); await sleep(300); await settled(`language ${l}`); };
    const marks = () => ev(`({ ok: document.querySelectorAll('main .ex-ok').length, bad: document.querySelectorAll('main .ex-bad').length })`);
    const BARRED = /verified|fraud|deleted|ក្លែងបន្លំ|បានផ្ទៀងផ្ទាត់/i;
    const clean = async (what) => { const m = await marks(), t = await main(); must(m.bad === 0 && errors.length === 0 && !BARRED.test(t), `${what}: no failure mark, no exception, no barred word${errors.length ? ` (${errors.join(" | ")})` : ""}${m.bad ? ` (${m.bad} failure marks: ${t.slice(0, 160)})` : ""}`); };

    for (const L of ["en", "km"]) {
        const km = L === "km", w = (en, k) => (km ? k : en);
        await open("/origin"); if (km) await lang("km"); else await lang("en");
        let t = await main();
        must(t.includes(w("8 entries, all checked", "8 ធាតុ បានពិនិត្យទាំងអស់")), `[${L}] /origin: the log of 8 entries passes its audit, revoke entries counted as entries`);
        must(await ev(`[...document.querySelectorAll('main table tbody tr')].map(r=>r.querySelector('a').textContent).join()`) === "7,1,0", `[${L}] /origin: the records table lists the 3 records and nothing else`);
        const rows = await ev(`[...document.querySelectorAll('main a.ex-row')].map(a=>[a.getAttribute('href'),a.innerText.replace(/\\s+/g,' ')])`);
        must(rows.length === 2 && rows[0][0] === "/origin/5" && rows[1][0] === "/origin/4", `[${L}] /origin: the two revoke entries are listed, newest first (${JSON.stringify(rows)})`);
        must(rows[0]?.[1].includes(w("A batch of phone keys revoked", "កូនសោទូរស័ព្ទមួយក្រុមត្រូវបានដកហូត")) && rows[0][1].includes(w("1 key", "1 កូនសោ")) && rows[1]?.[1].includes(w("A phone's keys reported", "កូនសោរបស់ទូរស័ព្ទមួយត្រូវបានរាយការណ៍")) && rows[1][1].includes(w("2 keys", "2 កូនសោ")), `[${L}] /origin: each in its own words, with its number of keys`);
        must(t.includes(w("Each removes nothing: every record stays in the log and still checks.", "នីមួយៗមិនលុបអ្វីទេ៖ កំណត់ត្រានីមួយៗនៅក្នុងកំណត់ហេតុ ហើយនៅតែពិនិត្យបាន។")), `[${L}] /origin: the list says each removes nothing`);
        await clean(`[${L}] /origin`); await shot(`origin-${L}`);

        await open("/origin/4"); t = await main();
        must(await ev(`document.querySelector('main h1').textContent`) === w("Entry #4", "ធាតុ #4"), `[${L}] /origin/4: headed as an entry`);
        must(t.includes(w("A phone's keys reported", "កូនសោរបស់ទូរស័ព្ទមួយត្រូវបានរាយការណ៍")) && t.includes(w("Their holder reported the phone lost or stolen, with their own passkey.", "អ្នកកាន់បានរាយការណ៍ថាទូរស័ព្ទបាត់ ឬត្រូវបានលួច ដោយប្រើ passkey ផ្ទាល់ខ្លួន។")), `[${L}] /origin/4: the holder's kind, in its words`);
        const from = await ev(`new Date("2026-11-25T10:00Z").toLocaleString(document.documentElement.lang,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"UTC"})+" UTC"`), known = await ev(`new Date("2026-11-26T09:00Z").toLocaleString(document.documentElement.lang,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"UTC"})+" UTC"`);
        must(t.includes(w(`A press made with these keys from ${from} on is no longer backed by what the phone's chip showed. This was known ${known}.`, `ការចុចដែលធ្វើដោយកូនសោទាំងនេះ ចាប់ពី ${from} តទៅ លែងត្រូវបានគាំទ្រដោយអ្វីដែលបន្ទះឈីបរបស់ទូរស័ព្ទបានបង្ហាញទៀតហើយ។ គេបានដឹងរឿងនេះនៅ ${known}។`)), `[${L}] /origin/4: both dates, from (${from}) and known (${known})`);
        must(t.includes(w("2 keys", "2 កូនសោ")) && HOLDER.keys.every((k) => t.includes(`${k.slice(0, 4)} ${k.slice(4, 8)} ${k.slice(8, 12)} … ${k.slice(-4)}`)), `[${L}] /origin/4: 2 keys, each ID shortened like other hashes`);
        must(t.includes(w("Nothing was removed. Every record stays in the log and still checks.", "គ្មានអ្វីត្រូវបានលុបទេ។ កំណត់ត្រានីមួយៗនៅក្នុងកំណត់ហេតុ ហើយនៅតែពិនិត្យបាន។")) && !t.includes(w("For a revoked batch", "សម្រាប់ក្រុមដែលត្រូវបានដកហូត")), `[${L}] /origin/4: it says nothing was removed, and no batch line for a holder`);
        must((await marks()).ok === 2, `[${L}] /origin/4: its signature and its place in the log are ticked, checked here`);
        await clean(`[${L}] /origin/4`); await shot(`revoke-holder-${L}`);

        await open("/origin/5"); t = await main();
        must(t.includes(w("A batch of phone keys revoked", "កូនសោទូរស័ព្ទមួយក្រុមត្រូវបានដកហូត")) && t.includes(w("sign.333.eco found that Google revoked the batch of phone chips these keys came from.", "sign.333.eco បានរកឃើញថា Google បានដកហូតក្រុមបន្ទះឈីបទូរស័ព្ទ ដែលកូនសោទាំងនេះមកពី។")) && t.includes(w("For a revoked batch, that is the minute the key was enrolled", "សម្រាប់ក្រុមដែលត្រូវបានដកហូត នោះគឺជានាទីដែលកូនសោត្រូវបានចុះឈ្មោះ")) && t.includes(w("1 key", "1 កូនសោ")), `[${L}] /origin/5: the operator's kind, its enrollment line, 1 key`);
        await clean(`[${L}] /origin/5`); await shot(`revoke-operator-${L}`);

        for (const [i, what] of [[6, "a kind this page doesn't know"], [3, "a void"]]) {
            await open(`/origin/${i}`); t = await main();
            must(t.includes(w("This entry holds no record.", "ធាតុនេះមិនមានកំណត់ត្រាទេ។")), `[${L}] /origin/${i} (${what}): shown plainly as an entry that holds no record`);
            await clean(`[${L}] /origin/${i}`);
        }
        await open("/origin/2"); must((await main()).includes(w("This entry withdraws record", "ធាតុនេះដកកំណត់ត្រា")), `[${L}] /origin/2: the withdrawal reads as before`); await clean(`[${L}] /origin/2`);
        await open("/origin/0"); must((await main()).includes(w("Record #0", "កំណត់ត្រា #0")) && (await marks()).ok >= 2, `[${L}] /origin/0: a record still checks`); await clean(`[${L}] /origin/0`);
        await open("/origin/8"); t = await main();
        must(t.includes(w("A phone's keys reported", "កូនសោរបស់ទូរស័ព្ទមួយត្រូវបានរាយការណ៍")) && t.includes(w("Signed, waiting for the next checkpoint", "បានចុះហត្ថលេខា កំពុងរង់ចាំចំណុចត្រួតពិនិត្យបន្ទាប់")) && t.includes(w("3 keys", "3 កូនសោ")), `[${L}] /origin/8: a revoke entry still waiting reads as one, waiting`);
        await clean(`[${L}] /origin/8`);
        await open("/origin/4/proof"); must((await main()).includes(w("This entry holds no record, so there is no record's proof to put together.", "ធាតុនេះមិនមានកំណត់ត្រាទេ ដូច្នេះគ្មានភស្តុតាងកំណត់ត្រាដើម្បីរៀបចំទេ។")), `[${L}] /origin/4/proof: no record's proof, said plainly`); await clean(`[${L}] /origin/4/proof`);
        await open(`/view?src=${encodeURIComponent("https://log.333.eco/origin/tile/entries/000.p/8")}&entry=4`); t = await main();
        must(t.includes('"t": "revoke"') && (await ev(`[...document.querySelectorAll('main summary')].map(s=>s.textContent).join()`)) === [...Array(8).keys()].map((i) => w(`Entry #${i}`, `ធាតុ #${i}`)).join(), `[${L}] the stored entries: all 8 listed, the revoke entry open as it is stored`); await clean(`[${L}] the stored entries`);
    }
    await lang("en");
    // CONTROL: one revoke entry signed under a record's label. The audit must refuse the whole log, out loud.
    served = bad; await open("/origin");
    must((await marks()).bad === 1 && (await main()).includes("This log didn't pass its check"), "CONTROL: a revoke entry signed under a record's label fails the page's audit, out loud");
    must(errors.length === 0, `no exception anywhere${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    must(!outside.some((u) => !/analytics|cloudflareinsights|api\/track/.test(u)) , `nothing but the beacon was asked of any other host${outside.length ? ` (${[...new Set(outside)].join(", ")})` : ""}`);
} catch (e) { console.log(`FAIL ${e.message}`); code = 1; }
finally { chrome.kill(); srv.close(); }
process.exit(code);
