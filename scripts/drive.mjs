// The built site in real Chrome against the real log and corpus, served as Cloudflare Pages serves it (its _headers CSP, its fallback). Each check has a control: a tampered log must fail out loud.
//   node scripts/drive.mjs [out-dir]
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
const root = new URL("../dist/", import.meta.url).pathname, out = process.argv[2] ?? mkdtempSync(join(tmpdir(), "explorer-")); mkdirSync(out, { recursive: true });
const csp = /Content-Security-Policy: (.*)/.exec(readFileSync(join(root, "_headers"), "utf8"))[1];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain" };
const srv = createServer((req, res) => {
    let p = new URL(req.url, "http://x").pathname;
    if (p === "/") { res.writeHead(302, { Location: "/origin" }); return res.end(); }
    let f = join(root, p);
    if (!existsSync(f) || statSync(f).isDirectory()) f = join(root, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream", "Content-Security-Policy": csp });
    res.end(readFileSync(f));
}).listen(8798);
const dir = mkdtempSync(join(tmpdir(), "explorer-p-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9336", `--user-data-dir=${dir}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
const must = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) code = 1; };
try {
    let target;
    for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch("http://127.0.0.1:9336/json")).json()).find((t) => t.type === "page"); } catch {} }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let id = 0, tamper = false, tamperBlock = false, githubOut = false; const wait = new Map(), errors = [];
    const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    ws.onmessage = async (m) => {
        const d = JSON.parse(m.data);
        if (d.id) { wait.get(d.id)?.(d); wait.delete(d.id); }
        if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
        if (d.method === "Log.entryAdded" && d.params.entry.level === "error" && !/analytics|cloudflareinsights|api\/track|favicon|raw\.githubusercontent\.com\/.*(timestamps\/manifests|\.r\d+\.ots)|api\.github\.com|mempool\.space|zenodo\.org|archive\.org|log\.333\.eco\/origin\/stamps/.test(d.params.entry.text + (d.params.entry.url ?? "")) && !tamper) errors.push(`${d.params.entry.text} ${d.params.entry.url ?? ""}`);
        if (d.method === "Fetch.requestPaused") {
            const url = d.params.request.url;
            if (tamperBlock && /mempool\.space\/api\/block\/[0-9a-f]+\/header/.test(url)) { // one changed byte in the block's merkle root
                const hx = await (await fetch(url)).text(); const b = Buffer.from(hx.trim(), "hex"); b[40] ^= 1;
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from(b.toString("hex")).toString("base64") });
            } else if (githubOut && /api\.github\.com/.test(url)) {
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 403, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from("{}").toString("base64") });
            } else if (tamper && /log\.333\.eco\/origin\/tile\/entries/.test(url)) { // one changed byte in a real entry
                const r = await fetch(url), b = Buffer.from(await r.arrayBuffer()); b[b.length - 20] ^= 1;
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: b.toString("base64") });
            } else cdp("Fetch.continueRequest", { requestId: d.params.requestId });
        }
    };
    const ev = async (expression) => { const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
    for (const d of ["Page", "Runtime", "Log", "DOM"]) await cdp(`${d}.enable`);
    const until = async (expr, what) => { for (let t = 0; t < 25000; t += 150) { if (await ev(expr).catch(() => false)) return; await sleep(150); } throw new Error(`timed out waiting for ${what}: ${await ev("document.querySelector('main').innerText")}`); };
    const shot = async (name) => { await sleep(250); const { data } = (await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })).result; writeFileSync(join(out, name + ".png"), Buffer.from(data, "base64")); };
    const size = (w, h, mobile) => cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
    const dark = (on) => cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: on ? "dark" : "light" }] });
    const go = (p) => cdp("Page.navigate", { url: `http://localhost:8798${p}` });
    const body = () => ev("document.querySelector('main').innerText");
    const noSideways = async (what) => must(await ev("document.documentElement.scrollWidth <= window.innerWidth + 1"), `${what}: nothing pushes the page sideways`);

    await size(390, 844, true); await go("/");
    await until(`/all checked/.test(document.querySelector('main').innerText)`, "the audited log");
    must(/\/origin$/.test(await ev("location.pathname")), "the root opens the records"); must(await ev(`document.title==='Records · B-Explorer' && document.querySelector('h1').textContent==='Records' && /B-Explorer/.test(document.querySelector('.app-name').textContent) && /B-Origin℠/.test(document.querySelector('.nav').textContent)`), "the names are as ruled");
    must(/Made by hand|Made with AI|Photo or|Edited|Combined/.test(await body()), "record 0 is listed, in plain words");
    await shot("1-origin"); await noSideways("records");
    await ev(`document.querySelector('table a').click()`); await until(`/Checked in your browser/.test(document.querySelector('main').innerText)`, "the record");
    const rec = await body();
    must(/It is in the log/.test(rec) && /Timestamp:/.test(rec), "a record's proof and timestamps are checked here"); must(/Bitcoin/.test(rec), "a record always says where it stands with Bitcoin"); must(await ev(`[...document.querySelectorAll('.ex-leg b')].filter(b=>/Bitcoin/.test(b.textContent)).length`) === 1, "Bitcoin has one row (the found bug: three, for one block)"); must(/What a record can.t show/.test(rec), "and it says its limit");
    must(!/witness/i.test(rec.replace(/signature on this entry/i, "")), "⛔ no word about outside witnesses");
    must(!/\bnull\b|undefined/.test(rec), "no stray null on the page"); await shot("2-record"); await noSideways("record"); console.log(rec.split("\n").filter((l) => /Timestamp|Bitcoin|block|later/i.test(l)).join(" | ").slice(0, 400));
    await go("/origin/999999"); await until(`/doesn.t have this entry/.test(document.querySelector('main').innerText)`, "a missing record's plain answer"); must(true, "a record that doesn't exist says so");
    await go("/origin"); await until(`document.querySelector('input[type=search]')`, "the search box");
    const sha = await ev(`fetch('https://log.333.eco/origin/tile/entries/000.p/1').then(r=>r.text()).then(t=>JSON.parse(t.slice(t.indexOf('{'))).claim.sha256).catch(()=>null)`);
    if (sha) { await ev(`(()=>{const i=document.querySelector('input[type=search]');i.value=${JSON.stringify(sha)};document.querySelector('.ex-search button').click();})()`); await until(`/\\d+ found/.test(document.querySelector('main').innerText)`, "the fingerprint search"); must(true, "a real fingerprint finds its record"); }
    await ev(`(()=>{const i=document.querySelector('input[type=search]');i.value='${"0".repeat(64)}';document.querySelector('.ex-search button').click();})()`); await until(`/No record matches/.test(document.querySelector('main').innerText)`, "the search control"); must(true, "CONTROL: a fingerprint nobody signed finds nothing");

    await cdp("Fetch.enable", { patterns: [{ urlPattern: "*log.333.eco*" }] }); tamper = true;
    await cdp("Network.setCacheDisabled", { cacheDisabled: true }); await go("/origin");
    await until(`/didn.t pass its check/.test(document.querySelector('main').innerText)`, "the tampered log's failure");
    must(!(await ev(`!!document.querySelector('table')`)), "CONTROL: one changed byte in the log and it fails out loud, and shows nothing from it"); await shot("3-tampered");
    tamper = false; await cdp("Fetch.disable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });

    await go("/corpus"); await until(`/\\d+ documents/.test(document.querySelector('main').innerText)`, "the corpus");
    must(/1\d\d documents/.test(await body()), "the corpus lists every served document"); must(!/\bnull\b/.test(await body()), "no stray null at the end of the list"); must(await ev(`document.querySelectorAll('a.card.ex-doc').length>10 && getComputedStyle(document.querySelector('a.ex-doc')).textDecorationLine==='none'`), "each document is its own card, with no underline"); await shot("4-corpus"); await noSideways("corpus");
    await ev(`(()=>{const i=document.querySelector('input[type=search]');i.value='zzzz-nothing';i.dispatchEvent(new Event('input'));})()`); await until(`/^0 documents/m.test(document.querySelector('main').innerText)`, "the filter"); must(true, "the filter narrows");
    await go("/corpus/a-promise-that-cannot-grow"); await until(`!/Checking…/.test(document.querySelector('main').innerText) && /Its fingerprint/.test(document.querySelector('main').innerText)`, "the live legs");
    const doc = await body(); console.log(doc.split("\n").filter(Boolean).slice(0, 26).join(" | ").slice(0, 900));
    must(/hashed here just now/.test(doc), "today's text was hashed here and matches"); must(/manifest/.test(doc), "the timestamp manifest was read"); must(/never proves that the text is true/.test(doc), "and it says its limit"); must(!/deposit/i.test(doc), "⛔ never *deposit*");
    must(await ev(`[...document.querySelectorAll('.ex-ok')].every(x=>/fingerprint|authorities|Bitcoin|Version|Earliest proof/.test(x.textContent))`), "⛔ a tick only on what this page really checked"); must(await ev(`/^https:\\/\\/mempool\\.space\\/block\\/\\d+$/.test(document.querySelector('a.ex-block')?.href)`), "the block is a link to a Bitcoin explorer"); must(await ev(`parseFloat(getComputedStyle(document.querySelector('a.ex-block')).fontSize)>=22`), "and it's prominent"); await shot("5-doc"); await noSideways("doc");
    await go("/corpus/first-letter-to-miss-aquarius"); await until(`[...document.querySelectorAll('main a')].some(a=>/Read it/.test(a.textContent))`, "a letter");
    must(await ev(`[...document.querySelectorAll('main a')].find(a=>/Read it/.test(a.textContent)).href==='https://missaquarius.org/letters/first.html'`), "a letter's Read it is one good address (the found bug: https://https//)");
    await go("/corpus/a-promise-that-cannot-grow"); await until(`[...document.querySelectorAll('main a')].some(a=>/Read it/.test(a.textContent))`, "a paper"); must(await ev(`[...document.querySelectorAll('main a')].find(a=>/Read it/.test(a.textContent)).href==='https://thonly.org/research/a-promise-that-cannot-grow'`), "CONTROL: a paper's address without a scheme still works");
    {   // A paper with many versions, against what its repository's files say (the sibling checkout), and an independent reading of the earliest block.
        const dir = new URL("../../../../TH/publications/defensive-publications/", import.meta.url).pathname, slug = "zero-point-game";
        const proofs = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${slug}.md.`) && f.endsWith(".ots")).length : 0;
        await cdp("Network.setCacheDisabled", { cacheDisabled: true });
        await go(`/corpus/${slug}`); await until(`[...document.querySelectorAll('main a')].some(a=>/Read this version/.test(a.textContent)) && /Public by \\w/.test(document.querySelector('main').innerText)`, "the version timeline");
        await sleep(2500);
        const rows = await ev(`document.querySelectorAll('.ex-ver').length`);
        must(rows >= 2 && (!proofs || rows === proofs), `every proof has a row (${rows}, the checkout holds ${proofs})`);
        must(await ev(`[...document.querySelectorAll('.pill')].filter(p=>/Earliest proof/.test(p.textContent)).length`) === 1, "one version carries Earliest proof");
        must(await ev(`/959,?585/.test(document.querySelector('.ex-ver.ex-first').innerText) && document.querySelector('.ex-ver').classList.contains('ex-first')`), "and it is the earliest block, read independently from the files: 959585");
        must(await ev(`/Today.s text/.test([...document.querySelectorAll('.ex-ver')].at(-1).innerText)`), "the newest version is today's text");
        must(await ev(`document.querySelector('.ex-ver .ex-ok') !== null && /Earliest proof: \\w/.test(document.querySelector('.ex-leg.ex-first .ex-ok').textContent)`), "the earliest block is checked against its header, and dated");
        const page = await body(); console.log(page.split("\n").filter((l) => /Earliest proof:|Public by|first captured|first version on|history starts/.test(l)).join(" | ").slice(0, 500));
        must(/Public by/.test(page) && /kept apart/.test(page), "the proof and the public date are kept apart"); must(!/prior art/i.test(page), "⛔ the page never says prior art");
        must(await ev(`[...document.querySelectorAll('.ex-ver a')].filter(a=>/Read this version/.test(a.textContent)).every(a=>/github\\.com\\/thonly\\/publications\\/blob\\/[0-9a-f]{40}\\//.test(a.href))`), "a version's text links to its own commit");
        await size(390, 844, true); await shot("10-versions"); await noSideways("versions");
        await cdp("Fetch.enable", { patterns: [{ urlPattern: "*mempool.space*" }, { urlPattern: "*api.github.com*" }] });
        tamperBlock = true; await go(`/corpus/${slug}`); await until(`document.querySelector('.ex-ver .ex-bad')`, "a tampered block");
        must(await ev(`/doesn.t hold this proof/.test(document.querySelector('main').innerText) && !document.querySelector('.ex-ver .ex-ok')`), "CONTROL: one changed byte in the block's header and no version is ticked");
        tamperBlock = false; githubOut = true; await go(`/corpus/${slug}`); await until(`/GitHub.s limit/.test(document.querySelector('main').innerText)`, "GitHub's limit");
        must(await ev(`document.querySelectorAll('.ex-ver').length`) === rows, "CONTROL: GitHub refusing keeps every proof's row and says what's missing");
        githubOut = false; await cdp("Fetch.disable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });
    }
    await go("/corpus/no-such-paper"); await until(`/no document by that name/.test(document.querySelector('main').innerText)`, "a missing paper"); must(true, "a paper that doesn't exist says so");
    await go("/corpus/a-promise-that-cannot-grow"); await until(`!/Checking…/.test(document.querySelector('main').innerText) && /Today/.test(document.querySelector('main').innerText)`, "again");
    await ev(`document.querySelector('button[data-lang=km]').click()`); await until(`document.documentElement.lang==='km' && /ត្រាពេលវេលា/.test(document.querySelector('main').innerText)`, "Khmer"); await sleep(1500); await shot("6-doc-km");
    await go("/origin"); await until(`document.querySelector('table')`, "records in Khmer"); await shot("7-origin-km"); await ev(`document.querySelector('button[data-lang=en]').click()`); await until(`document.querySelector('table')`, "records"); await dark(true); await shot("8-origin-dark"); await dark(false);
    await size(1280, 800, false); await go("/corpus"); await until(`document.querySelector('.ex-doc')`, "desktop corpus"); await shot("9-corpus-desktop");
    must(errors.length === 0, `browser errors: ${errors.length ? errors.slice(0, 4).join(" || ").slice(0, 700) : "none"}`);
} catch (e) { console.log("FAILED:", e.message.slice(0, 900)); code = 1; }
finally { chrome.kill(); srv.close(); srv.closeAllConnections(); }
console.log("screenshots:", out);
process.exit(code);
