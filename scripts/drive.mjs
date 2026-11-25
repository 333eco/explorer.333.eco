// The built site in real Chrome against the real log and corpus, served as Cloudflare Pages serves it (its _headers CSP, its fallback). Each check has a control: a tampered log must fail out loud.
//   node scripts/drive.mjs [out-dir]
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { createHash } from "node:crypto";
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
    let id = 0, tamperLedger = false, tamper = false, tamperBlock = false, githubOut = false, tamperDoc = false, forge = null; const wait = new Map(), errors = [], sent = [];
    const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    ws.onmessage = async (m) => {
        const d = JSON.parse(m.data);
        if (d.id) { wait.get(d.id)?.(d); wait.delete(d.id); }
        if (d.method === "Network.requestWillBeSent") sent.push(`${d.params.request.url} ${d.params.request.postData ?? ""}`); // every request the page makes, while Network is on
        if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
        if (d.method === "Log.entryAdded" && d.params.entry.level === "error" && !/analytics|cloudflareinsights|api\/track|favicon|raw\.githubusercontent\.com\/.*(timestamps\/manifests|\.r\d+\.ots)|api\.github\.com|mempool\.space|zenodo\.org|archive\.org|log\.333\.eco\/origin\/stamps/.test(d.params.entry.text + (d.params.entry.url ?? "")) && !tamper) errors.push(`${d.params.entry.text} ${d.params.entry.url ?? ""}`);
        if (d.method === "Fetch.requestPaused") {
            const url = d.params.request.url, forged = forge ? await forge(url) : undefined;
            if (forged !== undefined) { // a check's own forged answer for one address ({ status, body }); every other request goes through
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: forged.status ?? 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from(forged.body ?? "").toString("base64") });
            } else if (tamperBlock && /mempool\.space\/api\/block\/[0-9a-f]+\/header/.test(url)) { // one changed byte in the block's merkle root
                const hx = await (await fetch(url)).text(); const b = Buffer.from(hx.trim(), "hex"); b[40] ^= 1;
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from(b.toString("hex")).toString("base64") });
            } else if (tamperDoc && /raw\.githubusercontent\.com/.test(url)) {
                const b = Buffer.from(await (await fetch(url)).arrayBuffer()); b[b.length - 5] ^= 1;
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: b.toString("base64") });
            } else if (githubOut && /api\.github\.com/.test(url)) {
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 403, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from("{}").toString("base64") });
            } else if (tamperLedger && /log\.333\.eco\/ledger\/tile\/entries/.test(url)) { // one changed byte in a real ledger entry
                const r = await fetch(url), b = Buffer.from(await r.arrayBuffer()); b[b.length - 9] ^= 1;
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: b.toString("base64") });
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

    {   // The zone holds .js and .css for 4 hours, so every local asset's address must carry its own hash.
        const shell = readFileSync(join(root, "index.html"), "utf8"), assets = [...shell.matchAll(/(?:src|href)="\/([\w.-]+\.(?:js|css))\?v=([0-9a-f]{10})"/g)];
        must(assets.length >= 7 && !/(?:src|href)="\/[\w.-]+\.(?:js|css)"/.test(shell), `every script and stylesheet is addressed by its hash (${assets.length})`);
        must(assets.every(([, f, v]) => createHash("sha256").update(readFileSync(join(root, f))).digest("hex").startsWith(v)), "and each hash is of the file served");
    }
    await size(390, 844, true); await go("/");
    await until(`/all checked/.test(document.querySelector('main').innerText)`, "the audited log");
    must(/\/origin$/.test(await ev("location.pathname")), "the root opens the records"); must(await ev(`document.title==='Records · B-Explorer' && document.querySelector('h1').textContent==='Records' && /B-Explorer/.test(document.querySelector('.app-name').textContent) && /B-Origin℠/.test(document.querySelector('.nav').textContent)`), "the names are as ruled");
    must(/Made by hand|Made with AI|Photo or|Edited|Combined/.test(await body()), "record 0 is listed, in plain words");
    await shot("1-origin"); await noSideways("records");
    {   // 2026-11-20 (a /health FAIL): ANY unknown address painted the records list, so the Safari floor run could not tell /origin from
        // a typo. An unknown address must say so and link back; the records page must stay the records page.
        await go("/no-such-page"); let seen = "";
        for (let t = 0; t < 10000 && !/can't open that address|all checked/.test(seen); t += 150) { await sleep(150); seen = await body().catch(() => ""); }
        must(/can't open that address/.test(seen), "an unknown address says so, and is not the records page");
        must(await ev(`[...document.querySelectorAll('main a')].some(a=>new URL(a.href).pathname==='/origin')`), "and it links back to the records");
        must(await ev(`document.title!=='Records · B-Explorer'`), "and its title is not the records'");
        await go("/origin"); await until(`/all checked/.test(document.querySelector('main').innerText)`, "the records again"); // the checks below read the records page
    }
    {   // 2026-11-20 (A597, the explorer review): a B-Mail's own `name:` line is the SENDER's words. It must never read "Signed as" unless
        // the signer check ran here and passed; otherwise anyone could sign `name: @someone` with their own passkey and be shown as them.
        const m = Buffer.from("b-mail/v1\nfrom: A <a@x.test>\nto: b@x.test\nname: @sokha.keo\nsubject: never signed\n\nHello.\n").toString("base64url");
        await go(`/b-mail#m=${m}`); await until(`/No record of this exact message/.test(document.querySelector('main').innerText)`, "an unsigned B-Mail (the name)");
        must(!/Signed as/.test(await body()), "a name nobody checked is never shown as 'Signed as'");
        await go("/origin"); await until(`/all checked/.test(document.querySelector('main').innerText)`, "the records after the B-Mail");
    }
    must(await ev(`[...document.querySelectorAll('.ex-ok')].every(b=>b.closest('.ex-leg').querySelector('a[href]'))`), "every ticked row on the records page links its source");
    must(await ev(`[...document.querySelectorAll('main a')].some(a=>a.href==='https://developers.333.eco/verify#tree')`), "the records page links how the log holds together");
    await ev(`document.querySelector('table a').click()`); await until(`/Checked in your browser/.test(document.querySelector('main').innerText)`, "the record");
    const rec = await body();
    must(/It is in the log/.test(rec) && /Timestamp:/.test(rec), "a record's proof and timestamps are checked here"); must(/Bitcoin/.test(rec), "a record always says where it stands with Bitcoin"); must(await ev(`[...document.querySelectorAll('.ex-leg b')].filter(b=>/Bitcoin/.test(b.textContent)).length`) === 1, "Bitcoin has one row (the found bug: three, for one block)"); must(await ev(`(()=>{const t=[...document.querySelectorAll('.ex-leg b')].map(b=>b.textContent);return t.findIndex(x=>/Bitcoin/.test(x))===t.findIndex(x=>/It is in the log/.test(x))+1})()`), "and it sits right under It is in the log"); must(await ev(`(()=>{const a=[...document.querySelectorAll('.ex-leg a')].find(a=>/Block /.test(a.textContent));return !a||getComputedStyle(a).fontSize===getComputedStyle(a.parentElement).fontSize})()`), "its block reads as ordinary text"); must(await ev(`getComputedStyle([...document.querySelectorAll('.ex-note')].find(p=>/A tick means/.test(p.textContent))).fontStyle==='italic'`), "the tick notice is on the record, in italics"); must(await ev(`(()=>{const p=document.querySelector('.ex-note');return !p.closest('.card')&&/ex-leg/.test(p.previousElementSibling.innerHTML)})()`), "as a footnote under the card that holds the ticks");
    must(await ev(`[...document.querySelectorAll('.ex-ok')].every(b=>b.closest('.ex-leg').querySelector('a[href]'))`), "every ticked row on a record links its source");
    {   // Every source: the file answers, and the viewer says what it holds. Each kind against what the page must show, and an address it must refuse.
        const hrefs = await ev(`[...document.querySelectorAll('.ex-leg a')].filter(a=>/Source/.test(a.textContent)).map(a=>a.pathname+a.search)`), files = hrefs.filter((x) => x.startsWith("/view")).map((x) => new URLSearchParams(x.split("?")[1]).get("src"));
        const codes = await ev(`Promise.all(${JSON.stringify([...files, "https://log.333.eco/origin/stamps/0.no-such-authority.tsr"])}.map(u=>fetch(u).then(r=>r.status)))`);
        must(files.length >= 3 && codes.slice(0, -1).every((c) => c === 200), `every file behind a source answers (${files.length}: ${codes.slice(0, -1).join(" ")})`); must(codes.at(-1) === 404, "CONTROL: a made-up file does not");
        const recordAt = await ev("location.pathname");
        await ev(`[...document.querySelectorAll('.ex-leg a')].find(a=>/Source/.test(a.textContent)&&a.pathname==='/view').click()`); await until(`/A proof file/.test(document.querySelector('h1').textContent) && !/Reading the file/.test(document.querySelector('main').innerText)`, "a clicked source");
        must(!/can.t open that address/.test(await body()) && /[?&]src=/.test(await ev("location.search")), "clicking a source opens it (a click keeps the address's file)");
        await ev(`history.back()`); await until(`/Checked in your browser/.test(document.querySelector('main').innerText)`, "Back to the record"); must(true, "Back returns to the record");
        const open = async (href) => { await go(href); await until(`!/Reading the file/.test(document.querySelector('main').innerText) && document.querySelector('main').innerText.length>40`, href); return body(); };
        { const cp = hrefs.find((x) => /checkpoint/.test(decodeURIComponent(x))), note = await ev(`fetch('https://log.333.eco/origin/checkpoint').then(r=>r.text())`), [, size, root] = note.split("\n");
          must(!!cp, "It is in the log's source opens in the viewer"); const page = await open(cp); must(/The log.s signature/.test(page) && await ev(`!!document.querySelector('.ex-ok')`) && page.includes(root) && page.includes(`${size} entr`), "a checkpoint reads as its signature (checked here), size and root");
          must(/aren.t counted yet/.test(page), "and says the other signatures aren't counted"); const fold = await ev(`(()=>{const outer=[...document.querySelectorAll('main details')].find(d=>/The file itself/.test(d.querySelector('summary').textContent)), inner=outer&&outer.querySelector('details'); return outer&&inner?{outerOpen:outer.open, innerOpen:inner.open, openText:outer.querySelector(':scope > pre').textContent, folded:inner.querySelector('pre').textContent}:null})()`);
          must(fold && fold.outerOpen && !fold.innerOpen && fold.openText.includes("— log.333.eco/origin ") && !/witness/.test(fold.openText) && /witness/.test(fold.folded) && (fold.openText.split("\n").length + fold.folded.split("\n").length) === note.trim().split("\n").length, "the uncounted signatures are folded away, one click down; the file is whole (A542)"); await noSideways("checkpoint"); await shot("16-checkpoint");
          const older = await open(`/view?src=${encodeURIComponent("https://log.333.eco/origin/checkpoints/3")}`); must(/The log.s signature/.test(older), "an earlier checkpoint reads too"); }
        const tsr = hrefs.find((x) => /\.tsr/.test(decodeURIComponent(x))), ots = hrefs.find((x) => /\.ots/.test(decodeURIComponent(x))), tile = hrefs.find((x) => /tile/.test(decodeURIComponent(x)));
        let page = await open(tsr); must(/signed it/.test(page) && /No later than/.test(page) && await ev(`!!document.querySelector('.ex-ok')`), "a .tsr reads as its authority and time, checked here"); await shot("12-tsr");
        // The newest record can be under a day old, with no Bitcoin proof yet (the log is stamped once a day): then read the proof of
        // record 0, which always has one. Without this the drive opened nothing and failed (2026-11-12).
        let otsHref = ots;
        if (!otsHref) { await go("/origin/0"); await until(`/Checked in your browser/.test(document.querySelector('main').innerText)`, "record 0");
            otsHref = (await ev(`[...document.querySelectorAll('.ex-leg a')].filter(a=>/Source/.test(a.textContent)).map(a=>a.pathname+a.search)`)).find((x) => /\.ots/.test(decodeURIComponent(x))); }
        page = await open(otsHref); await until(`/Block \\d|Still waiting/.test(document.querySelector("main").innerText)`, "the proof's state", 30000); page = await body(); must((/Block \d/.test(page) || /Still waiting/.test(page)) && /It covers/.test(page), "a .ots reads as what it covers and its block (or that it waits for one: the newest record's proof takes a few hours)"); await shot("13-ots"); // a waiting proof asks three calendars first. ⚠️ Until 2026-11-20 this check sat inside that comment and never ran.
        page = await open(tile); must(/Entry #/.test(page) && /"claim"|"t":/.test(page) && await ev(`!!document.querySelector('.ex-first details[open]')`), "a tile reads as its entries, this record's opened"); await shot("14-tile");
        {   // 2026-11-20 (the explorer's ticks, 4): what a proof file "covers" is CHECKED before anything is ticked: a .tsr's checkpoint by the
            // log's signature and its size, a .ots's fingerprint against the hash of what it covers. A claim taken from the address says
            // "It says it covers". It was taken from the address, and ticked.
            const tsrUrl = new URLSearchParams(tsr.split("?")[1]).get("src"), at = /stamps\/(\d+)\./.exec(tsrUrl)[1];
            const note = await (await fetch(`https://log.333.eco/origin/checkpoints/${at}`)).text(), forgedNote = note.replace(/^(— log\.333\.eco\/origin \S{20})(\S)/m, (_, a, c) => a + (c === "A" ? "B" : "A"));
            const idx = await (await fetch("https://log.333.eco/origin/stamps/index.json")).json(), a = idx.ots.at(-1), b = idx.ots[0];
            const ownDoc = "https://raw.githubusercontent.com/thonly/publications/main/defensive-publications/zero-point-game.md.ots";
            const otherOts = Buffer.from(await (await fetch(`https://log.333.eco/origin/stamps/${b}.ots`)).arrayBuffer()), otherDoc = Buffer.from(await (await fetch("https://raw.githubusercontent.com/thonly/publications/main/defensive-publications/a-promise-that-cannot-grow.md.r1.ots")).arrayBuffer());
            const proofState = async (href) => { await open(href); await until(`/Block \\d|Still waiting/.test(document.querySelector("main").innerText)`, href); return { page: await body(), ticks: await ev(`document.querySelectorAll('.ex-ok').length`) }; };
            page = await open(`/view?src=${encodeURIComponent(ownDoc)}`); await until(`/Block \\d|Still waiting/.test(document.querySelector("main").innerText)`, "a paper's own proof"); page = await body();
            must(/It covers/.test(page) && !/It says it covers/.test(page), "a paper's own .ots covers its text, hashed here");
            await cdp("Network.setCacheDisabled", { cacheDisabled: true });
            await cdp("Fetch.enable", { patterns: [{ urlPattern: "*log.333.eco/origin/checkpoints/*" }, { urlPattern: "*log.333.eco/origin/stamps/*.ots" }, { urlPattern: "*raw.githubusercontent.com*.ots" }] });
            forge = (url) => (url.endsWith(`/origin/checkpoints/${at}`) ? { body: forgedNote } : undefined); page = await open(tsr);
            must(forgedNote !== note && !(await ev(`!!document.querySelector('.ex-ok')`)) && /didn.t pass its check/.test(page), "CONTROL: a .tsr over a checkpoint the log didn't sign gets no tick");
            forge = (url) => (url.endsWith(`/origin/stamps/${a}.ots`) ? { body: otherOts } : undefined);
            let got = await proofState(`/view?src=${encodeURIComponent(`https://log.333.eco/origin/stamps/${a}.ots`)}`);
            must(a !== b && /Block \d/.test(got.page) && /It says it covers/.test(got.page) && got.ticks === 0, `CONTROL: a .ots naming checkpoint ${b}'s fingerprint, at ${a}'s address, says what it SAYS it covers and ticks no block`);
            forge = (url) => (url === ownDoc ? { body: otherDoc } : undefined); got = await proofState(`/view?src=${encodeURIComponent(ownDoc)}`);
            must(/Block \d/.test(got.page) && /It says it covers/.test(got.page) && got.ticks === 0, "CONTROL: another paper's .ots at this paper's address ticks no block");
            forge = null; await cdp("Fetch.disable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });
        }
        for (const bad of ["https://evil.example/x.ots", "http://log.333.eco/origin/stamps/3.ots", "https://log.333.eco/origin/stamps/index.json", "https://raw.githubusercontent.com/thonly/publications/main/README.md", "https://raw.githubusercontent.com/someone/else/main/x.md.ots", "https://log.333.eco/origin/../../secret.ots"]) { page = await open(`/view?src=${encodeURIComponent(bad)}`); must(/can.t open that address/.test(page), `CONTROL: refuses ${bad}`); }
        page = await open(`/view?src=${encodeURIComponent("https://raw.githubusercontent.com/thonly/publications/main/defensive-publications/zero-point-game.md.r1.ots")}`); must(/Block 959,585/.test(page) && /The document/.test(page), "a paper's older proof reads too, against its known block");
        await go(`${recordAt}/proof`); await until(`/What.s in it/.test(document.querySelector('main').innerText)`, "the record's proof"); page = await body(); must(/The checkpoint/.test(page) && /The path/.test(page) && [...page.matchAll(/Download this record/g)].length === 1, "the record's proof reads as its parts, and can still be downloaded"); must(!/\bnull\b|undefined/.test(page), "no stray null on the proof page"); await noSideways("proof"); await shot("15-proof");
        await go(recordAt); await until(`/Checked in your browser/.test(document.querySelector('main').innerText)`, "the record again");
    } must(/What a record can.t show/.test(rec), "and it says its limit");
    must(!/witness/i.test(rec.replace(/signature on this entry/i, "")), "⛔ no word about outside witnesses");
    must(!/\bnull\b|undefined/.test(rec), "no stray null on the page"); await shot("2-record"); await noSideways("record"); console.log(rec.split("\n").filter((l) => /Timestamp|Bitcoin|block|later/i.test(l)).join(" | ").slice(0, 400));
    await go("/origin/999999"); await until(`/doesn.t have this entry/.test(document.querySelector('main').innerText)`, "a missing record's plain answer"); must(true, "a record that doesn't exist says so");
    await go("/origin"); await until(`document.querySelector('input[type=search]')`, "the search box");
    const sha = await ev(`fetch('https://log.333.eco/origin/tile/entries/000.p/1').then(r=>r.text()).then(t=>JSON.parse(t.slice(t.indexOf('{'))).claim.sha256).catch(()=>null)`);
    if (sha) { await ev(`(()=>{const i=document.querySelector('input[type=search]');i.value=${JSON.stringify(sha)};document.querySelector('.ex-search button').click();})()`); await until(`/\\d+ found/.test(document.querySelector('main').innerText)`, "the fingerprint search"); must(true, "a real fingerprint finds its record"); }
    await ev(`(()=>{const i=document.querySelector('input[type=search]');i.value='${"0".repeat(64)}';document.querySelector('.ex-search button').click();})()`); await until(`/No record matches/.test(document.querySelector('main').innerText)`, "the search control"); must(true, "CONTROL: a fingerprint nobody signed finds nothing");

    must(await ev(`[...document.querySelectorAll('nav [data-nav]')].map(a=>a.dataset.nav).join()==='origin,ledger,corpus'`), "the menu reads B-Origin, Ledger, Corpus (Corpus last)");
    {   // The gratitude ledger (2026-11-06): proofs only, every check here, a receipt checked on the device, and a tampered entry refused.
        await go("/ledger"); await until(`/checked/.test(document.querySelector('main').innerText) && !/Checking the outside clocks/.test(document.querySelector('main').innerText)`, "the ledger page");
        const page = await body();
        must(/Its signature, its tree and every entry, checked/.test(page), "ledger: its signature, tree and every entry are checked here");
        must(/Season 1/.test(page) && /YREfhlIakdpKEn1DeLhFO_WjW-RSPJfh00rS93-umN8/.test(page), "ledger: season 1 and its rule's fingerprint");
        must(/Public entries close their day/.test(page), "ledger: public entries close their day");
        must((page.match(/signed it/g) ?? []).length === 3, `ledger: the three timestamp authorities, each checked here (${(page.match(/signed it/g) ?? []).length})`);
        must(/Bitcoin/.test(page), "ledger: where it stands with Bitcoin");
        must(/Kiitos sums to zero/.test(page) && /Kiitti sums to zero/.test(page) && /no total/.test(page), "ledger: the two invariants are stated, with no total");
        must(await ev(`[...document.querySelectorAll('.ex-leg')].filter(l=>/sums to zero/.test(l.textContent)).every(l=>!l.querySelector('.ex-ok'))`), "ledger: ⛔ no tick on the invariants, which this page cannot check");
        must(/What is never shown here/.test(page) && !/\bnull\b|undefined/.test(page), "ledger: what is never shown, and no stray null");
        must(await ev(`document.querySelector('a[data-nav=ledger]').getAttribute('aria-current')==='page'`), "ledger: its tab is current");
        const check = async (v) => { await ev(`(()=>{const t=document.querySelector('.ex-receipt');t.value=${JSON.stringify(v)};t.form.requestSubmit();})()`); await sleep(500); return ev("document.querySelector('.ex-receipt').form.parentElement.innerText"); };
        must(/isn.t a receipt/.test(await check("not json")), "ledger: something that isn't a receipt is refused");
        must(/another log/.test(await check(JSON.stringify({ index: 0, seal: "AA", at: "x", origin: "log.333.eco/ledger-test2", sig: "MA" }))), "ledger: a receipt from another log is refused");
        const forged = await check(JSON.stringify({ index: 1, seal: Buffer.alloc(32, 7).toString("base64url"), at: "2026-11-26T00:00Z", origin: "log.333.eco/ledger", sig: "MEUCIQCq" + "A".repeat(80) }));
        must(/does not verify/.test(forged) && /NOT at that place/.test(forged), "ledger CONTROL: a forged receipt fails its signature and its place");
        // 2026-11-20 (the explorer's ticks, 5): each check replaces the last one's result whatever happens, and only the newest check paints.
        // A seal that IS in the ledger (the first sealed entry, public in its tile) with a forged signature gets one tick: "It is in the ledger".
        const tile0 = Buffer.from(await (await fetch("https://log.333.eco/ledger/tile/entries/000")).arrayBuffer()); let sealAt = 0, sealed = null;
        for (let o = 0; o < tile0.length && !sealed; sealAt++) { const len = tile0.readUInt16BE(o); if (len === 32) { sealed = tile0.subarray(o + 2, o + 34); break; } o += 2 + len; }
        const placed = JSON.stringify({ index: sealAt, seal: sealed.toString("base64url"), at: "2026-11-26T00:00Z", origin: "log.333.eco/ledger", sig: "MEUCIQCq" + "A".repeat(80) });
        const submit = async (...vs) => { await ev(`(()=>{const t=document.querySelector('.ex-receipt');for(const v of ${JSON.stringify(vs)}){t.value=v;t.form.requestSubmit();}})()`); await sleep(300); await until(`!/Checking…/.test(document.querySelector('.ex-receipt').form.nextElementSibling.innerText)`, "the receipt's check"); await sleep(2500); return ev(`(()=>{const o=document.querySelector('.ex-receipt').form.nextElementSibling;return { text: o.innerText, ticks: o.querySelectorAll('.ex-ok').length }})()`); };
        {
            const got = await submit(placed);
            must(got.ticks === 1 && /It is in the ledger/.test(got.text) && /does not verify/.test(got.text), "ledger: a receipt whose seal is in the ledger is placed there, and its forged signature still fails");
            for (const [what, bad] of [["a seal that isn't base64", { ...JSON.parse(placed), seal: "!!!" }], ["a negative place", { ...JSON.parse(placed), index: -1 }]]) {
                await submit(placed); const after = await submit(JSON.stringify(bad));
                must(after.ticks === 0 && !/It is in the ledger/.test(after.text) && /isn.t a receipt/.test(after.text), `ledger CONTROL: ${what} replaces the last receipt's tick with a failed row`);
            }
        }
        must(await ev(`(()=>{const t=document.querySelector('.ex-receipt'),c=t.closest('.card');const p=parseFloat(getComputedStyle(c).paddingLeft)+parseFloat(getComputedStyle(c).paddingRight);return Math.abs(t.getBoundingClientRect().width-(c.clientWidth-p))<=2})()`), "ledger: the receipt box fills its card's width");
        await shot("20-ledger"); await noSideways("ledger");
        await dark(true); await shot("20-ledger-dark"); await dark(false);
        // ⭐ A662 (2026-11-19): this device remembers the tree's right edge, so a return visit reads only what is new and still proves the rest.
        const mem = await ev(`JSON.parse(localStorage.getItem('explorer.ledger.v1')||'null')`);
        const lsize = Number(/^\S+\n(\d+)/.exec(await (await fetch("https://log.333.eco/ledger/checkpoint")).text())?.[1]);
        must(mem && mem.origin === "log.333.eco/ledger" && mem.size === Math.floor(lsize / 256) * 256 && mem.hashes.length >= 1, `ledger: this device remembers the edge at ${mem?.size} (the last whole tile of ${lsize})`);
        await go("/ledger"); await until(`/since this device last checked it|doesn.t extend|didn.t pass/.test(document.querySelector('main').innerText)`, "the ledger, a return visit");
        const tilesRead = await ev(`performance.getEntriesByType('resource').filter((r) => r.name.includes('/ledger/tile/entries/')).length`);
        must(/since this device last checked it/.test(await body()) && tilesRead === Math.ceil(lsize / 256) - mem.size / 256, `ledger: a return visit reads only the new entry tiles (${tilesRead}) and says what this device checked before`);
        {   // 2026-11-20 (the explorer's ticks, 5): two checks in a row, the first slower (its entry is from before this visit's, so it reads
            // every entry): only the newer one's result shows, however long the older one takes.
            await submit(placed, "not json"); await sleep(5000);
            const got = await ev(`document.querySelector('.ex-receipt').form.nextElementSibling.innerText`);
            must(/isn.t a receipt/.test(got) && !/It is in the ledger/.test(got), "ledger CONTROL: of two checks in a row, only the newer one's result shows");
        }
        // CONTROL: a remembered edge from ANOTHER history (one byte changed) must fail the page out loud, say why, and show nothing from it.
        await ev(`(()=>{const m=JSON.parse(localStorage.getItem('explorer.ledger.v1'));const b=[...atob(m.hashes[0])].map((c)=>c.charCodeAt(0));b[0]^=1;m.hashes[0]=btoa(String.fromCharCode(...b));localStorage.setItem('explorer.ledger.v1',JSON.stringify(m));})()`);
        await go("/ledger"); await until(`/doesn.t extend|didn.t pass|since this device/.test(document.querySelector('main').innerText)`, "the ledger, a changed memory");
        must(/doesn.t extend what this device checked before/.test(await body()) && !/Season 1/.test(await body()), "ledger CONTROL: an edge from another history fails the page, says why, and shows nothing from it");
        await ev(`[...document.querySelectorAll('main button')].find((b) => /check every entry again/i.test(b.textContent)).click()`);
        await until(`/root rebuilt here from all/.test(document.querySelector('main').innerText)`, "every entry checked again");
        must(/Season 1/.test(await body()), "ledger: its button forgets the memory and checks every entry again");
        await size(1440, 900, false); await go("/ledger"); await until(`/Its signature/.test(document.querySelector('main').innerText)`, "the ledger on a desktop"); await shot("21-ledger-desktop"); await size(390, 844, true);
        {   // 2026-11-20 (the explorer's ticks, 2): an outside clock is ticked only when the stamped checkpoint is the ledger's own signed state
            // at exactly the stamped size, with the audited ledger's root there (client/stamped.ts; scripts/check-stamped.mjs holds a root that
            // differs, which the live ledger can't). It was ticked over whatever text checkpoints/<s> served, s read from an unsigned index.
            const idx = await (await fetch("https://log.333.eco/ledger/stamps/index.json")).json(), s = Math.max(...idx.tsa), prev = Math.max(...idx.tsa.filter((x) => x < s));
            const note = await (await fetch(`https://log.333.eco/ledger/checkpoints/${s}`)).text(), forgedNote = note.replace(/^(— log\.333\.eco\/ledger \S{20})(\S)/m, (_, a, c) => a + (c === "A" ? "B" : "A"));
            const clocks = `[...document.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent==='Outside clocks')`;
            const read = async (what) => { await go("/ledger"); await until(`${clocks} && !/Checking the outside clocks/.test(${clocks}.innerText)`, what); return ev(`({ ticks: ${clocks}.querySelectorAll('.ex-ok').length, text: ${clocks}.innerText })`); };
            await cdp("Network.setCacheDisabled", { cacheDisabled: true });
            await cdp("Fetch.enable", { patterns: [{ urlPattern: "*log.333.eco/ledger/checkpoints/*" }, { urlPattern: "*log.333.eco/ledger/stamps/*" }] });
            forge = (url) => (url.endsWith(`/ledger/checkpoints/${s}`) ? { body: forgedNote } : undefined);
            let got = await read("the clocks, a checkpoint the ledger didn't sign");
            must(forgedNote !== note && got.ticks === 0 && /didn.t pass its check/.test(got.text), `ledger CONTROL: a stamped checkpoint the ledger didn't sign gets no tick (${got.ticks})`);
            forge = async (url) => { if (!new RegExp(`/ledger/(checkpoints/${s}$|stamps/${s}\\.)`).test(url)) return undefined; const r = await fetch(url.replace(`/${s}`, `/${prev}`)); return { status: r.status, body: Buffer.from(await r.arrayBuffer()) }; };
            got = await read("the clocks, another state's checkpoint and tokens");
            must(got.ticks === 0 && /didn.t pass its check/.test(got.text), `ledger CONTROL: the state at ${prev} with its own genuine tokens, served as the state at ${s}, gets no tick (${got.ticks})`);
            forge = null; await cdp("Fetch.disable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });
            got = await read("the clocks"); must(got.ticks >= 3 && !/didn.t pass/.test(got.text), `ledger: the real stamps are ticked (${got.ticks})`);
        }
        await ev("localStorage.removeItem('explorer.ledger.v1')");   // A662: the tamper control tests a FIRST visit (a return visit never reads that tile)
        await cdp("Fetch.enable", { patterns: [{ urlPattern: "*log.333.eco/ledger*" }] }); tamperLedger = true;
        await go("/ledger"); await until(`/didn.t pass its check|signature, its tree/.test(document.querySelector('main').innerText)`, "the tampered ledger");
        must(/didn.t pass its check/.test(await body()) && !/Season 1/.test(await body()), "ledger CONTROL: one changed byte in an entry fails the page, and nothing from it is shown");
        tamperLedger = false; await cdp("Fetch.disable");
    }

    await cdp("Fetch.enable", { patterns: [{ urlPattern: "*log.333.eco*" }] }); tamper = true;
    await cdp("Network.setCacheDisabled", { cacheDisabled: true }); await go("/origin");
    await until(`/didn.t pass its check/.test(document.querySelector('main').innerText)`, "the tampered log's failure");
    must(!(await ev(`!!document.querySelector('table')`)), "CONTROL: one changed byte in the log and it fails out loud, and shows nothing from it"); await shot("3-tampered");
    tamper = false; await cdp("Fetch.disable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });

    await go("/corpus"); await until(`/\\d+ documents/.test(document.querySelector('main').innerText)`, "the corpus");
    must(/1\d\d documents/.test(await body()), "the corpus lists every served document"); must(!/\bnull\b/.test(await body()), "no stray null at the end of the list"); must(await ev(`document.querySelectorAll('a.card.ex-doc').length>10 && getComputedStyle(document.querySelector('a.ex-doc')).textDecorationLine==='none'`), "each document is its own card, with no underline"); await shot("4-corpus"); await noSideways("corpus");
    await ev(`(()=>{const i=document.querySelector('input[type=search]');i.value='zzzz-nothing';i.dispatchEvent(new Event('input'));})()`); await until(`/^0 documents/m.test(document.querySelector('main').innerText)`, "the filter"); must(true, "the filter narrows");
    // A541: wait for the history too. A paper re-stamped today has no block on today's leg yet; its earlier versions' blocks come with the history.
    await go("/corpus/a-promise-that-cannot-grow"); await until(`!/Checking…/.test(document.querySelector('main').innerText) && /Its fingerprint/.test(document.querySelector('main').innerText) && [...document.querySelectorAll('.ex-leg a')].some(a=>/Block \\d/.test(a.textContent))`, "the live legs and a block");
    const doc = await body(); console.log(doc.split("\n").filter(Boolean).slice(0, 26).join(" | ").slice(0, 900));
    must(/hashed here just now/.test(doc), "today's text was hashed here and matches"); must(/manifest/.test(doc), "the timestamp manifest was read"); must(/never proves that the text is true/.test(doc), "and it says its limit"); must(!/deposit/i.test(doc), "⛔ never *deposit*");
    must(await ev(`[...document.querySelectorAll('.ex-ok')].every(x=>/fingerprint|authorities|Bitcoin|Version|Earliest proof/.test(x.textContent))`), "⛔ a tick only on what this page really checked"); must(await ev(`[...document.querySelectorAll('.ex-ok')].length>0 && [...document.querySelectorAll('.ex-ok')].every(b=>b.closest('.ex-leg').querySelector('a[href]'))`), "every ticked row on a paper links its source"); must(await ev(`/^https:\\/\\/mempool\\.space\\/block\\/\\d+$/.test([...document.querySelectorAll('.ex-leg a')].find(a=>/Block /.test(a.textContent))?.href)`), "the block is a link to a Bitcoin explorer"); must(await ev(`(()=>{const a=[...document.querySelectorAll('.ex-leg a')].find(a=>/Block /.test(a.textContent));return getComputedStyle(a).fontSize===getComputedStyle(a.parentElement).fontSize&&getComputedStyle(a).fontWeight===getComputedStyle(a.parentElement).fontWeight})()`), "and it reads as ordinary text (ruled 2026-11-04: not prominent)"); await shot("5-doc"); await noSideways("doc");
    await go("/corpus/first-letter-to-miss-aquarius"); await until(`[...document.querySelectorAll('main a')].some(a=>/Read it/.test(a.textContent))`, "a letter");
    must(await ev(`[...document.querySelectorAll('main a')].find(a=>/Read it/.test(a.textContent)).href==='https://missaquarius.org/letters/first.html'`), "a letter's Read it is one good address (the found bug: https://https//)");
    await go("/corpus/a-promise-that-cannot-grow"); await until(`[...document.querySelectorAll('main a')].some(a=>/Read it/.test(a.textContent))`, "a paper"); must(await ev(`[...document.querySelectorAll('main a')].find(a=>/Read it/.test(a.textContent)).href==='https://thonly.org/research/a-promise-that-cannot-grow'`), "CONTROL: a paper's address without a scheme still works");
    {   // 2026-11-20 (the explorer's ticks, 1): "Timestamp authorities" is ticked only when the manifest's OWN tokens verify here. It was
        // ticked on the manifest's text alone, read from raw.githubusercontent.com, with no token read. GitHub's API is refused here (this
        // row doesn't use it) so the hourly limit is kept for the version checks below.
        const slug = "a-promise-that-cannot-grow", row = `[...document.querySelectorAll('.ex-leg')].find(l=>l.querySelector('b')?.textContent==='Timestamp authorities')`;
        const read = async (what) => { await go(`/corpus/${slug}`); await until(`${row} && !/Checking…/.test(${row}.innerText)`, what); return ev(`({ ok: !!${row}.querySelector('.ex-ok'), bad: !!${row}.querySelector('.ex-bad'), text: ${row}.innerText })`); };
        const noApi = (url) => (/api\.github\.com/.test(url) ? { status: 403, body: "{}" } : undefined);
        await cdp("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp("Fetch.enable", { patterns: [{ urlPattern: "*api.github.com*" }, { urlPattern: "*timestamps/manifests/*.tsr" }] });
        forge = noApi; let got = await read("the authorities' row");
        must(got.ok && /signed no later than/.test(got.text), `authorities: the manifest's own tokens are checked here, then ticked (${got.text.replace(/\s+/g, " ").slice(0, 150)})`);
        forge = (url) => noApi(url) ?? (/\.tsr$/.test(url) ? { status: 404, body: "" } : undefined); got = await read("the authorities' row, no token");
        must(!got.ok && !got.bad && /couldn.t be read/.test(got.text), "authorities CONTROL: with no token to read, no tick, and it says it wasn't checked");
        forge = async (url) => { const m = /manifests\/(\d{4}-\d{2}-\d{2})\.sha256\.[a-z-]+\.tsr$/.exec(url); if (!m) return noApi(url); const r = await fetch(url.replace(m[1], "2026-10-07")); return { status: r.status, body: Buffer.from(await r.arrayBuffer()) }; };
        got = await read("the authorities' row, another day's tokens");
        must(!got.ok && got.bad, "authorities CONTROL: another day's genuine tokens fail out loud, and nothing is ticked");
        forge = null; await cdp("Fetch.disable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });
    }
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
        const mirror = join(dir, "submitted/manifest.json");
        if (existsSync(mirror)) { // the date on the page, against the manifest read here; and a paper that was never mirrored says nothing
            const e = JSON.parse(readFileSync(mirror, "utf8")).entries.find((x) => x.slug === slug), first = [e, ...(e?.prior_postings ?? [])].filter((p) => p?.posted).map((p) => p.posted).sort()[0];
            const says = new Date(first).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
            must(first && page.includes(`TDCommons posted it on ${says}`), `TDCommons's first posting is read from the public manifest (${first})`);
        }
        await size(390, 844, true); await shot("10-versions"); await noSideways("versions");
        await cdp("Fetch.enable", { patterns: [{ urlPattern: "*mempool.space*" }, { urlPattern: "*api.github.com*" }] });
        {   // Its fingerprint, through the viewer, on the real text and on the text with one byte changed.
            await go(`/corpus/${slug}`); await until(`[...document.querySelectorAll('.ex-leg')].some(l=>/Its fingerprint/.test(l.textContent)&&/hashed here/.test(l.textContent))`, "the fingerprint leg");
            const href = await ev(`[...document.querySelectorAll('.ex-leg')].find(l=>/Its fingerprint/.test(l.textContent)).querySelector('a').pathname`); must(href === "/view", "Its fingerprint's source opens in the viewer");
            await ev(`[...document.querySelectorAll('.ex-leg')].find(l=>/Its fingerprint/.test(l.textContent)).querySelector('a').click()`); await until(`/matches the index/.test(document.querySelector('main').innerText)`, "the document in the viewer");
            must(await ev(`!!document.querySelector('.ex-ok') && document.querySelector('details[open] code').textContent.length>1000`), "the text shows, and its fingerprint is ticked"); await noSideways("document"); await shot("17-document");
            await cdp("Fetch.enable", { patterns: [{ urlPattern: "*raw.githubusercontent.com*" + slug + ".md" }] }); tamperDoc = true; await ev("location.reload()"); await until(`/differs from it/.test(document.querySelector('main').innerText)`, "a changed text");
            must(await ev(`!document.querySelector('.ex-ok')`), "CONTROL: one changed byte in the text and its fingerprint isn't ticked"); tamperDoc = false; await cdp("Fetch.enable", { patterns: [{ urlPattern: "*mempool.space*" }, { urlPattern: "*api.github.com*" }] });
        }
        tamperBlock = true; await go(`/corpus/${slug}`); await until(`document.querySelector('.ex-ver .ex-bad')`, "a tampered block");
        must(await ev(`/doesn.t hold this proof/.test(document.querySelector('main').innerText) && !document.querySelector('.ex-ver .ex-ok')`), "CONTROL: one changed byte in the block's header and no version is ticked");
        tamperBlock = false; githubOut = true; await go(`/corpus/${slug}`); await until(`/GitHub.s limit/.test(document.querySelector('main').innerText)`, "GitHub's limit");
        must(await ev(`document.querySelectorAll('.ex-ver').length`) === rows, "CONTROL: GitHub refusing keeps every proof's row and says what's missing");
        githubOut = false; await cdp("Fetch.disable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });
    }
    {   // 2026-11-20 (the explorer's ticks, 3): a version's proof is ticked only when its fingerprint is tied to THIS paper: today's text,
        // hashed here, or a commit of this paper whose text hashed here to it. The tick was the block check alone, for whatever fingerprint
        // the .ots file names. CONTROL: another paper's proof served as each of this paper's (GitHub refused, so only today's text can tie).
        const slug = "zero-point-game", other = Buffer.from(await (await fetch("https://raw.githubusercontent.com/thonly/publications/main/defensive-publications/a-promise-that-cannot-grow.md.r1.ots")).arrayBuffer());
        await cdp("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp("Fetch.enable", { patterns: [{ urlPattern: "*api.github.com*" }, { urlPattern: `*${slug}.md*.ots` }] });
        forge = async (url) => { // only the proofs that exist: the page reads .r1, .r2, … until one is missing
            if (/api\.github\.com/.test(url)) return { status: 403, body: "{}" };
            if (!new RegExp(`${slug}\\.md(\\.r\\d+)?\\.ots$`).test(url)) return undefined;
            const r = await fetch(url); return r.ok ? { body: other } : { status: r.status, body: "" }; };
        await go(`/corpus/${slug}`); await until(`/GitHub.s limit/.test(document.querySelector('main').innerText) && /Earliest proof: \\w/.test(document.querySelector('.ex-leg.ex-first b')?.textContent)`, "another paper's proofs, checked to their block");
        const got = await ev(`({ early: document.querySelector('.ex-leg.ex-first b').textContent, ticked: [...document.querySelectorAll('.ex-ok')].map(b=>b.textContent) })`);
        must(!got.ticked.some((t) => /Version|Earliest proof/.test(t)), `CONTROL: another paper's proof, served as this paper's, reaches its block (${got.early}) and gets no tick (${got.ticked.join(" | ")})`);
        must(/wasn.t found in the repository/.test(await body()), "and it says the fingerprint wasn't tied to this paper's text");
        forge = null; await cdp("Fetch.disable"); await cdp("Network.setCacheDisabled", { cacheDisabled: false });
    }
    {   // Newest first, with the index's dates in words among them: the found bug put all of them on top.
        const got = await ev(`fetch('https://corpus.333.eco/provenance.json').then(r=>r.json()).then(j=>j.documents.map(d=>d.date))`), words = got.filter((x) => /^\d{1,2} [A-Z]/.test(x));
        must(words.length > 0, `CONTROL: the index still holds dates in words (${words.length}), so the next check can fail`);
        await size(1280, 800, false); await go("/corpus"); await until(`document.querySelector('.ex-doc')`, "the list");
        const shown = await ev(`[...document.querySelectorAll('a.card.ex-doc > span:first-of-type')].map(s=>s.textContent.split(' · ')[1]).map(t=>+new Date(t+' UTC')).filter(Boolean)`);
        must(shown.length >= 20 && shown.every((t, i) => !i || shown[i - 1] >= t), "the list runs newest first");
        await go("/corpus/third-letter-to-miss-aquarius"); await until(`document.querySelector('.lede')`, "a letter");
        must(/Jun 9, 2026/.test(await ev(`document.querySelector('.lede').textContent`)), "a date in words reads as written, whatever the reader's time zone");
        await size(390, 844, true);
    }
    {   // The filter, by its bytes: the kinds shown, the address, Back, and search inside it.
        await go("/corpus"); await until(`document.querySelector('.ex-kinds button')`, "the filter");
        const genres = () => ev(`[...new Set([...document.querySelectorAll('a.card.ex-doc > span:first-of-type')].map(s=>s.textContent.split(' · ')[0]))]`), press = (t) => ev(`[...document.querySelectorAll('.ex-kinds button')].find(b=>b.textContent===${JSON.stringify(t)}).click()`);
        must((await genres()).length >= 3, "CONTROL: unfiltered, the list shows several kinds");
        await press("Essays"); await sleep(100); must((await genres()).length === 1 && /kind=essays$/.test(await ev("location.search")), "Essays shows one kind, and the address says so");
        await ev(`(()=>{const i=document.querySelector('input[type=search]');i.value='change';i.dispatchEvent(new Event('input'));})()`); await sleep(100); must((await genres()).length === 1 && /change/i.test(await body()), "search stays inside the filter"); await ev(`(()=>{const i=document.querySelector('input[type=search]');i.value='';i.dispatchEvent(new Event('input'));})()`);
        // ⚠️ a SERVED card: held papers (2a197cd) sit in the list by date and link to their own page off this site (A673)
        await ev(`document.querySelector('a.card.ex-doc[href^="/corpus/"]').click()`); await until(`/How early/.test(document.querySelector('main').innerText)`, "a document"); await cdp("Page.navigate", { url: "http://localhost:8798/corpus?kind=essays" }); await until(`document.querySelector('.ex-kinds .pill.on')?.textContent==='Essays'`, "the shared address"); must(true, "a shared address opens filtered");
        await press("Other"); await sleep(100); must((await ev(`document.querySelectorAll('a.card.ex-doc').length`)) === 3, "Other holds the three that fit no kind"); await press("All"); await sleep(100); must(!(await ev("location.search")), "All clears the address");
        must(await ev(`document.querySelector('.ex-kinds').getBoundingClientRect().bottom<=document.querySelector('input[type=search]').getBoundingClientRect().top`), "the filters sit above the search box"); await noSideways("filter"); await shot("11-filter");
    }
    await go("/corpus/how-to-change-the-world"); await until(`/Public by/.test(document.querySelector('main').innerText) && !/Reading…/.test(document.querySelector('main').innerText)`, "an essay's dates");
    must(!/TDCommons/.test(await body()), "CONTROL: an essay was never mirrored, so it names no TDCommons posting");
    await go("/corpus/no-such-paper"); await until(`/no document by that name/.test(document.querySelector('main').innerText)`, "a missing paper"); must(true, "a paper that doesn't exist says so");
    await go("/corpus/a-promise-that-cannot-grow"); await until(`!/Checking…/.test(document.querySelector('main').innerText) && /Today/.test(document.querySelector('main').innerText)`, "again");
    {   // Title and subtitle, against every document the index serves, read from the page's own origin.
        await go("/corpus"); await until(`document.querySelector('.ex-doc')`, "the list");
        const index = await ev(`fetch('https://corpus.333.eco/provenance.json').then(r=>r.json()).then(j=>j.documents)`);
        const expect = (d) => d.genre === "letters" ? [d.title, ""] : d.subtitle ? [d.title, d.subtitle] : d.title.includes(": ") ? [d.title.slice(0, d.title.indexOf(": ")), d.title.slice(d.title.indexOf(": ") + 2)] : [d.title, ""];
        must(index.filter((d) => d.subtitle && d.genre !== "letters").length > 50 && index.some((d) => !d.subtitle && d.title.includes(": ")), "CONTROL: the index holds declared subtitles and colons, so the next check can fail");
        // A541 (2026-11-07): the "neither" case is taken from the index each run, never named by hand; the paper once named here gained a subtitle.
        const neither = index.find((d) => d.genre !== "letters" && !d.subtitle && !d.title.includes(": "));
        if (!neither) console.log("NOT RUN a paper with neither a subtitle nor a colon: the index has none today");
        for (let i = 0; i < 10 && await ev(`!!document.querySelector('.ex-more')`); i++) await ev(`document.querySelector('.ex-more').click()`);
        const cards = new Map((await ev(`[...document.querySelectorAll('a.card.ex-doc[href^="/corpus/"]')].map(a=>[a.getAttribute('href').split('/').pop(),a.querySelector('b').textContent,a.querySelector('.ex-sub')?.textContent??''])`)).map(([slug, b, s]) => [slug, [b, s]]));
        // ⭐ the HELD papers (founder 2026-11-20): every one the index's manifest names is listed, marked "Not yet archived", linking to its
        // own page off this site — never to a /corpus/ page the index cannot serve
        const held = await ev(`fetch('https://corpus.333.eco/manifest.json').then(r=>r.json()).then(j=>j.held_documents.map(d=>d.slug))`);
        const heldCards = await ev(`[...document.querySelectorAll('a.card.ex-doc:not([href^="/corpus/"])')].map(a=>[a.getAttribute('href'),[...a.querySelectorAll('.pill')].map(p=>p.textContent).join('+')])`);
        must(heldCards.length === held.length && heldCards.every(([h, p]) => /^https:\/\//.test(h) && /Not yet archived/.test(p)) && held.every((slug) => heldCards.some(([h]) => h.endsWith("/" + slug))), `every held paper is listed, marked and linking to its own page (${heldCards.length} of ${held.length})`);
        const clean = (s) => s.replace(/\\"/g, '"').replace(/\*/g, ""), wrong = index.filter((d) => { const e = expect(d), c = cards.get(d.slug); return !c || c[0] !== e[0] || c[1] !== clean(e[1]); });
        must(cards.size === index.length && wrong.length === 0, `every card reads its own title and subtitle, word for word (${cards.size}${wrong.length ? `; wrong: ${wrong.slice(0, 4).map((d) => d.slug).join(", ")}` : ""})`);
        const main = () => ev(`[document.querySelector('h1').textContent,document.querySelector('.ex-sub')?.textContent??'']`);
        must(/^What a Vow Must Cost: Vow-Validity/.test((await ev(`document.querySelector('a[href="/corpus/what-a-vow-must-cost"] b').textContent`))), "a declared subtitle leaves the colon in the title");
        must(await ev(`document.querySelector('a[href="/corpus/the-capacity-to-give"] b').textContent==='The Capacity to Give'`), "with none declared, the colon starts the subtitle");
        if (neither) must(await ev(`!document.querySelector('a[href="/corpus/${neither.slug}"] .ex-sub')`), `a paper with no subtitle shows none (${neither.slug})`);
        must(await ev(`!document.querySelector('a[href="/corpus/first-letter-to-miss-aquarius"] .ex-sub')`), "a letter shows no subtitle");
        must(await ev(`document.querySelector('a[href="/corpus/future-kindness-operating-noun"] .ex-sub em')?.textContent==='"Thank Your Future Kindness"' && ![...document.querySelectorAll('.ex-sub')].some(p=>/[\\\\*]/.test(p.textContent))`), "front matter's italics and escapes don't show");
        const clamp = `(()=>{const p=document.querySelector('a[href="/corpus/proof-of-coordinate"] .ex-sub');return p.scrollHeight>p.clientHeight&&p.clientHeight<100})()`;
        must(await ev(clamp), "the list holds a long subtitle to three lines"); await noSideways("the list with subtitles"); await shot("12-subtitles-phone");
        await size(1280, 800, false); await sleep(100); await shot("13-subtitles-desktop"); await size(390, 844, true);
        const search = (q) => ev(`(()=>{const i=document.querySelector('input[type=search]');i.value=${JSON.stringify(q)};i.dispatchEvent(new Event('input'));return [...document.querySelectorAll('a.card.ex-doc')].map(a=>a.getAttribute('href').split('/').pop());})()`);
        must(!index.find((d) => d.slug === "a-vow-you-could-have-refused").title.includes("Doctors Swear") && (await search("doctors swear")).includes("a-vow-you-could-have-refused"), "search reaches words only a subtitle holds"); await search("");
        await go("/corpus/the-capacity-to-give"); await until(`document.querySelector('.lede')`, "a paper"); { const [a, b] = await main(); must(a === "The Capacity to Give" && /^Why People Come/.test(b), "a paper's page shows both lines"); }
        await go("/corpus/proof-of-coordinate"); await until(`document.querySelector('.lede')`, "a long subtitle"); must(await ev(`(()=>{const p=document.querySelector('.ex-sub');return p.scrollHeight<=p.clientHeight+1&&p.textContent.length>400})()`), "and holds nothing back there"); await noSideways("a long subtitle"); await shot("14-subtitle-doc");
        await go("/corpus/first-letter-to-miss-aquarius"); await until(`document.querySelector('.lede')`, "a letter"); must(!(await ev(`!!document.querySelector('.ex-sub')`)), "a letter's page repeats no date");
    }
    await ev(`document.querySelector('button[data-lang=km]').click()`); await until(`document.documentElement.lang==='km' && /ត្រាពេលវេលា/.test(document.querySelector('main').innerText)`, "Khmer"); await sleep(1500); await shot("6-doc-km");
    await go("/origin"); await until(`document.querySelector('table')`, "records in Khmer"); await shot("7-origin-km"); await ev(`document.querySelector('button[data-lang=en]').click()`); await until(`document.querySelector('table')`, "records"); await dark(true); await shot("8-origin-dark"); await dark(false);
    await size(1280, 800, false); await go("/corpus"); await until(`document.querySelector('.ex-doc')`, "desktop corpus"); await shot("9-corpus-desktop");
    {   // The B-Mail check page (§b-mail-viral-loop): a mail that was never signed gets the failed check and NO invitation. The found
        // path is client/invite.ts's own check (scripts/check-invite.mjs): a real record's text would be someone's mail.
        const m = Buffer.from("b-mail/v1\nfrom: A <a@x.test>\nto: b@x.test\nname: @sokha.keo\nsubject: never signed\n\nHello.\n").toString("base64url");
        await go(`/b-mail#m=${m}`); await until(`/No record of this exact message/.test(document.querySelector('main').innerText)`, "an unsigned B-Mail");
        const invites = `[...document.querySelectorAll('main a')].some(a=>a.href.includes('from=b-mail'))`;
        must(!(await ev(invites)), "an unsigned B-Mail gets the failed check and no invitation"); must((await ev("location.hash")) === "", "the message left the address once read");
        await ev(`document.querySelector('main').insertAdjacentHTML('beforeend','<a href="https://333.eco/?from=b-mail">x</a>')`);
        must(await ev(invites), "CONTROL: the same probe sees an invitation when one is there");
    }
    {   // 2026-11-25 (founder: "Attachments: agree"; spec §3.1, §9.2): a B-Mail's files are compared on this device. The vectors are the
        // mail skill's (bmail_canonical), each `want` an exact statement. None is in the log, so the live page must show NO file box
        // beside them (nothing was signed); the box itself is client/attachments.ts, bundled here and driven on this page, under its CSP.
        // ⚠️ The found path (a real record that lists a file) is owed: it needs one real signed B-Mail with an attachment.
        const V = JSON.parse(readFileSync(new URL("attachment-vectors.json", import.meta.url), "utf8"));
        await size(390, 844, true);
        await go(`/b-mail#m=${Buffer.from(V[0].want).toString("base64url")}`); await until(`/No record of this exact message/.test(document.querySelector('main').innerText)`, "an unsigned B-Mail that lists a file");
        const box = `!!document.querySelector('main .ex-files, main input[type=file]')`;
        must(!(await ev(box)), "a statement with no record shows no file box, though it lists a file");
        await ev(`document.querySelector('main').insertAdjacentHTML('beforeend','<input type=file>')`); must(await ev(box), "CONTROL: the same probe sees a file input when one is there");
        const harness = (await build({ entryPoints: [new URL("../client/attachments.ts", import.meta.url).pathname], bundle: true, format: "iife", globalName: "__att", write: false })).outputFiles[0].text;
        await ev(harness);
        const mount = (i) => ev(`(()=>{window.__kept=[];const b=__att.fileBox(${JSON.stringify(V[i].want)},window.__kept);document.getElementById('view').replaceChildren(b);return !!b})()`);
        const file = (name, b64, flip) => `(()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));${flip ? "b[b.length-1]^=1;" : ""}return new File([b],${JSON.stringify(name)})})()`;
        const drop = (files) => ev(`(()=>{const dt=new DataTransfer();for(const f of [${files.join(",")}])dt.items.add(f);document.querySelector('.ex-files').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));})()`);
        const settled = (k) => until(`!/Reading the files/.test(document.querySelector('.ex-files').innerText) && window.__kept.length>=${k}`, "the files read");
        const rows = () => ev(`[...document.querySelectorAll('.ex-files .ex-leg')].map(l=>({t:l.querySelector('b').textContent,ok:l.querySelector('b').className,p:l.querySelector('p').textContent}))`);
        await cdp("Network.enable");
        // Vector 1, through the real file chooser: its file, the same file with one byte changed, a file not listed, and the carrier.
        const dir1 = join(out, "attachments"); mkdirSync(dir1, { recursive: true });
        const changed = Buffer.from(V[0].files[0].b64, "base64"); changed[changed.length - 1] ^= 1;
        writeFileSync(join(dir1, "report.pdf"), Buffer.from(V[0].files[0].b64, "base64")); writeFileSync(join(dir1, "report-changed.pdf"), changed); writeFileSync(join(dir1, "other.txt"), "not signed"); writeFileSync(join(dir1, "B-Mail.txt"), V[0].want);
        must(await mount(0), "the file box shows for a statement that lists a file"); await shot("17-bmail-files-before");
        must((await rows()).length === 1 && /Fingerprint 4c41 3baa 5077/.test((await rows())[0].p), "before any file is chosen, each listed file shows its name and fingerprint, unmarked");
        sent.length = 0;
        const { root: docRoot } = (await cdp("DOM.getDocument", { depth: -1, pierce: true })).result, { nodeId } = (await cdp("DOM.querySelector", { nodeId: docRoot.nodeId, selector: ".ex-files input[type=file]" })).result;
        await cdp("DOM.setFileInputFiles", { nodeId, files: ["report.pdf", "report-changed.pdf", "other.txt", "B-Mail.txt"].map((f) => join(dir1, f)) });
        await settled(4); let r = await rows();
        const of = (t) => r.find((x) => x.t === t);
        must(of("report.pdf")?.ok === "ex-ok" && /This is the file signed with the message/.test(of("report.pdf").p), "the file received is the one signed (ticked, by its SHA-256 hashed here)");
        must(of("report-changed.pdf")?.ok === "ex-bad" && /was not signed with the message/.test(of("report-changed.pdf").p), "CONTROL: the same file with one byte changed is not matched, and is said not signed");
        must(of("other.txt")?.ok === "ex-bad", "a file that is not listed is said not signed with the message");
        must(of("B-Mail.txt")?.ok === "" && /carries the signature/.test(of("B-Mail.txt").p), "the carrier B-Mail.txt is not counted as one of the message's files");
        must(sent.length === 0, `no request while the files were read and compared (${sent.length}${sent.length ? `: ${sent[0].slice(0, 120)}` : ""})`);
        await shot("18-bmail-files-chosen"); await noSideways("the file box");
        // Vector 1 again, the changed file alone: the listed row is not matched, in words, never as a failure.
        await mount(0); await drop([file("report.pdf", V[0].files[0].b64, true)]); await settled(1); r = await rows();
        must(r[0].ok === "" && /None of the files you chose has this fingerprint/.test(r[0].p), "a listed file with no match says so plainly, unmarked");
        // Vector 2, by drop: the Khmer-named file and the EMPTY file (the empty input's SHA-256).
        await mount(1); await drop(V[1].files.map((f) => file(f.name, f.b64))); await settled(2); r = await rows();
        must(r.length === 2 && r.every((x) => x.ok === "ex-ok"), "vector 2: both files match, the Khmer-named one and the empty one");
        await mount(1); await drop([file("empty.bin", "")]); await settled(1); r = await rows();
        must(r.find((x) => x.t === "empty.bin")?.ok === "ex-ok" && r.find((x) => x.t !== "empty.bin")?.ok === "", "the empty file alone matches its own line and nothing else");
        // Vector 3: the name is informative; a renamed file still matches.
        await mount(2); await drop([file("renamed.pdf", V[2].files[0].b64)]); await settled(1); r = await rows();
        must(r[0].ok === "ex-ok" && /You chose it as “renamed\.pdf”/.test(r[0].p), "a file renamed by a mail app still matches by its SHA-256, and the page says the name it came with");
        must(sent.length === 0, `no request while any of the files were read (${sent.length})`);
        // Khmer, and the choice kept through a repaint (the language toggle repaints the page from the same kept files).
        await ev(`document.documentElement.lang='km';document.getElementById('view').replaceChildren(__att.fileBox(${JSON.stringify(V[2].want)},window.__kept))`);
        r = await rows(); must(r[0].ok === "ex-ok" && /នេះគឺជាឯកសារដែលបានចុះហត្ថលេខាជាមួយសារ/.test(r[0].p) && /ឯកសារដែលបានចុះហត្ថលេខាជាមួយវា/.test(await body()), "in Khmer, and the file chosen is kept through a repaint");
        await shot("19-bmail-files-km"); await ev(`document.documentElement.lang='en'`);
        const words = await ev(`document.querySelector('.ex-files').innerText`); must(!/verif|person|human/i.test(words), "its words never say verified, never a person");
        // CONTROL: the request probe sees a request carrying a file's fingerprint when one is made.
        await ev(`fetch('/favicon.svg?f=${V[2].want.match(/[0-9a-f]{64}/)[0]}').catch(()=>{})`); await sleep(300);
        must(sent.some((x) => x.includes(V[2].want.match(/[0-9a-f]{64}/)[0])), "CONTROL: the same probe sees a request when one is made");
        await cdp("Network.disable");
    }
    must(errors.length === 0, `browser errors: ${errors.length ? errors.slice(0, 4).join(" || ").slice(0, 700) : "none"}`);
} catch (e) { console.log("FAILED:", e.message.slice(0, 900)); code = 1; }
finally { chrome.kill(); srv.close(); srv.closeAllConnections(); }
console.log("screenshots:", out);
process.exit(code);
