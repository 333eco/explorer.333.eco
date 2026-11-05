// The built site in real Chrome against the real log and corpus, served as Cloudflare Pages serves it (its _headers CSP, its fallback). Each check has a control: a tampered log must fail out loud.
//   node scripts/drive.mjs [out-dir]
import { spawn } from "node:child_process";
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
    let id = 0, tamper = false, tamperBlock = false, githubOut = false, tamperDoc = false; const wait = new Map(), errors = [];
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
            } else if (tamperDoc && /raw\.githubusercontent\.com/.test(url)) {
                const b = Buffer.from(await (await fetch(url)).arrayBuffer()); b[b.length - 5] ^= 1;
                cdp("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: b.toString("base64") });
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
    must(await ev(`[...document.querySelectorAll('.ex-ok')].every(b=>b.closest('.ex-leg').querySelector('a[href]'))`), "every ticked row on the records page links its source");
    must(await ev(`[...document.querySelectorAll('main a')].some(a=>a.href==='https://origin.333.eco/docs#tree')`), "the records page links how the log holds together");
    await ev(`document.querySelector('table a').click()`); await until(`/Checked in your browser/.test(document.querySelector('main').innerText)`, "the record");
    const rec = await body();
    must(/It is in the log/.test(rec) && /Timestamp:/.test(rec), "a record's proof and timestamps are checked here"); must(/Bitcoin/.test(rec), "a record always says where it stands with Bitcoin"); must(await ev(`[...document.querySelectorAll('.ex-leg b')].filter(b=>/Bitcoin/.test(b.textContent)).length`) === 1, "Bitcoin has one row (the found bug: three, for one block)"); must(await ev(`(()=>{const t=[...document.querySelectorAll('.ex-leg b')].map(b=>b.textContent);return t.findIndex(x=>/Bitcoin/.test(x))===t.findIndex(x=>/It is in the log/.test(x))+1})()`), "and it sits right under It is in the log"); must(await ev(`(()=>{const a=[...document.querySelectorAll('.ex-leg a')].find(a=>/Block /.test(a.textContent));return !a||getComputedStyle(a).fontSize===getComputedStyle(a.parentElement).fontSize})()`), "its block reads as ordinary text"); must(await ev(`getComputedStyle([...document.querySelectorAll('.ex-note')].find(p=>/A tick means/.test(p.textContent))).fontStyle==='italic'`), "the tick notice is on the record, in italics");
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
          must(/aren.t counted yet/.test(page), "and says the other signatures aren't counted"); await noSideways("checkpoint"); await shot("16-checkpoint");
          const older = await open(`/view?src=${encodeURIComponent("https://log.333.eco/origin/checkpoints/3")}`); must(/The log.s signature/.test(older), "an earlier checkpoint reads too"); }
        const tsr = hrefs.find((x) => /\.tsr/.test(decodeURIComponent(x))), ots = hrefs.find((x) => /\.ots/.test(decodeURIComponent(x))), tile = hrefs.find((x) => /tile/.test(decodeURIComponent(x)));
        let page = await open(tsr); must(/signed it/.test(page) && /No later than/.test(page) && await ev(`!!document.querySelector('.ex-ok')`), "a .tsr reads as its authority and time, checked here"); await shot("12-tsr");
        page = await open(ots); must(/Block \d/.test(page) && /It covers/.test(page), "a .ots reads as what it covers and its block"); await shot("13-ots");
        page = await open(tile); must(/Entry #/.test(page) && /"claim"|"t":/.test(page) && await ev(`!!document.querySelector('.ex-first details[open]')`), "a tile reads as its entries, this record's opened"); await shot("14-tile");
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
    must(await ev(`[...document.querySelectorAll('.ex-ok')].every(x=>/fingerprint|authorities|Bitcoin|Version|Earliest proof/.test(x.textContent))`), "⛔ a tick only on what this page really checked"); must(await ev(`[...document.querySelectorAll('.ex-ok')].length>0 && [...document.querySelectorAll('.ex-ok')].every(b=>b.closest('.ex-leg').querySelector('a[href]'))`), "every ticked row on a paper links its source"); must(await ev(`/^https:\\/\\/mempool\\.space\\/block\\/\\d+$/.test([...document.querySelectorAll('.ex-leg a')].find(a=>/Block /.test(a.textContent))?.href)`), "the block is a link to a Bitcoin explorer"); must(await ev(`(()=>{const a=[...document.querySelectorAll('.ex-leg a')].find(a=>/Block /.test(a.textContent));return getComputedStyle(a).fontSize===getComputedStyle(a.parentElement).fontSize&&getComputedStyle(a).fontWeight===getComputedStyle(a.parentElement).fontWeight})()`), "and it reads as ordinary text (ruled 2026-11-04: not prominent)"); await shot("5-doc"); await noSideways("doc");
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
        await ev(`document.querySelector('a.card.ex-doc').click()`); await until(`/How early/.test(document.querySelector('main').innerText)`, "a document"); await cdp("Page.navigate", { url: "http://localhost:8798/corpus?kind=essays" }); await until(`document.querySelector('.ex-kinds .pill.on')?.textContent==='Essays'`, "the shared address"); must(true, "a shared address opens filtered");
        await press("Other"); await sleep(100); must((await ev(`document.querySelectorAll('a.card.ex-doc').length`)) === 3, "Other holds the three that fit no kind"); await press("All"); await sleep(100); must(!(await ev("location.search")), "All clears the address");
        must(await ev(`document.querySelector('.ex-kinds').getBoundingClientRect().bottom<=document.querySelector('input[type=search]').getBoundingClientRect().top`), "the filters sit above the search box"); await noSideways("filter"); await shot("11-filter");
    }
    await go("/corpus/how-to-change-the-world"); await until(`/Public by/.test(document.querySelector('main').innerText) && !/Reading…/.test(document.querySelector('main').innerText)`, "an essay's dates");
    must(!/TDCommons/.test(await body()), "CONTROL: an essay was never mirrored, so it names no TDCommons posting");
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
