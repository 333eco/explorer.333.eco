/**
 * explorer.333.eco: read-only. ⭐ Everything shown is read from the public log or a public repository and checked here, in the reader's browser, so trusting this host isn't required. A check that can't run says so; it is never shown as passed.
 * ⛔ No ranking, no counters that climb, no rates. ⛔ No word about outside witnesses until they exist (A515). The gratitude ledger shows proofs only (ledger SPEC §4.4). DRAFT Khmer (ours).
 */
// @ts-expect-error the published verifier ships no types
import { auditLog, checkCheckpoint, checkOts, checkpointBody, checkTimestamp, findRecords, hashLeaf, packRecord, readEntries, treeRoot, verifyPack } from "@333eco/origin-verify";
import ledgerTrust from "./ledger-trust";
// @ts-expect-error the same
import { canvasDecoder, hashFile } from "@333eco/origin-verify/media";
// @ts-expect-error the same
import trust from "@333eco/origin-verify/trust";

const LOG = "https://log.333.eco/origin/", INDEX = "https://corpus.333.eco/provenance.json", PAGE = 50;
const isKm = () => document.documentElement.lang === "km";
const say = (en: string, km: string) => (isKm() ? km : en);
const view = { el: document.getElementById("view") as HTMLElement, replaceChildren(...kids: Kid[]) { this.el.replaceChildren(...(kids.filter(Boolean) as (Node | string)[])); } }; // a null handed to the DOM prints "null"
type Kid = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string | boolean | ((e: any) => void)> = {}, ...kids: Kid[]) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (typeof v === "function") n.addEventListener(k.slice(2), v as EventListener);
        else if (v === true) n.setAttribute(k, "");
        else if (v !== false) n.setAttribute(k, v);
    }
    n.append(...(kids.filter(Boolean) as (Node | string)[]));
    return n;
}
const link = (href: string, ...kids: Kid[]) => h("a", { href, ...(href.startsWith("http") ? { rel: "noopener" } : {}) }, ...kids);
const short = (s: string) => `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)} … ${s.slice(-4)}`;
const full = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();
// The index carries a few dates in words ("9 June 2026"). As text they sort above every ISO date, and parsed as local time they read a day early east of UTC.
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const dayOf = (s: string | null | undefined) => {
    const iso = /^\d{4}-\d{2}-\d{2}/.exec(s ?? ""); if (iso) return iso[0];
    const w = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec((s ?? "").trim()), m = w ? MONTHS.indexOf(w[2].toLowerCase()) : -1;
    return w && m >= 0 ? `${w[3]}-${String(m + 1).padStart(2, "0")}-${w[1].padStart(2, "0")}` : "";
};
const date = (raw: string) => { const iso = /^\d{1,2} [A-Za-z]+ \d{4}$/.test(raw.trim()) ? dayOf(raw) || raw : raw; const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleDateString(document.documentElement.lang, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }); };
const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : `${d.toLocaleString(document.documentElement.lang, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC`; };
const n = (x: number) => x.toLocaleString(document.documentElement.lang);
const count = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`;
const SOURCES: Record<string, [string, string]> = {
    digitalCreation: ["Made by hand on a device", "បង្កើតដោយដៃនៅលើឧបករណ៍"], digitalCapture: ["Photo or recording", "រូបថត ឬការថត"], computationalCapture: ["Photo or recording, processed by the camera", "រូបថត ឬការថត ដែលកាមេរ៉ាបានកែ"],
    negativeFilm: ["Scanned film", "ហ្វីលដែលបានស្កេន"], positiveFilm: ["Scanned film", "ហ្វីលដែលបានស្កេន"], print: ["Scanned print", "រូបបោះពុម្ពដែលបានស្កេន"], humanEdits: ["Edited by a person", "កែសម្រួលដោយមនុស្ស"], composite: ["Combined from several works", "ផ្សំពីស្នាដៃច្រើន"],
    compositeSynthetic: ["Combined, partly with AI", "ផ្សំ ដោយប្រើ AI ខ្លះ"], compositeWithTrainedAlgorithmicMedia: ["Combined, partly with AI", "ផ្សំ ដោយប្រើ AI ខ្លះ"], trainedAlgorithmicMedia: ["Made with AI", "បង្កើតដោយ AI"], algorithmicallyEnhanced: ["Enhanced by an algorithm", "កែលម្អដោយក្បួនដោះស្រាយ"], dataDrivenMedia: ["Made from data", "បង្កើតពីទិន្នន័យ"],
};
const label = (s: string) => (SOURCES[s] ? SOURCES[s][isKm() ? 1 : 0] : s);
const logGet = async (p: string) => { const r = await fetch(LOG + p); if (r.status === 404) return null; if (!r.ok) throw new Error(String(r.status)); return new Uint8Array(await r.arrayBuffer()); };
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const head = (title: string, lede?: string) => h("div", {}, h("h1", {}, title), lede ? h("p", { class: "lede" }, lede) : null);
const card = (...kids: Kid[]) => h("div", { class: "card" }, ...kids);
const leg = (ok: boolean | null, title: string, ...body: Kid[]) => h("div", { class: "ex-leg" }, h("b", { class: ok === true ? "ex-ok" : ok === false ? "ex-bad" : "" }, title), h("p", {}, ...body));
const blockLink = (height: number) => link(`https://mempool.space/block/${height}`, say(`Block ${n(height)}`, `ប្លុក ${n(height)}`));
const source = (url: string) => link(url, say("Source", "ប្រភព"));
/** The public tile that holds an entry: 256 entries a tile, the last one partial (C2SP tlog-tiles). */
const entryTile = (index: number, size: number) => {
    const t = Math.floor(index / 256), width = (t + 1) * 256 <= size ? 0 : size % 256;
    let s = "", v = t, first = true;
    do { const part = String(v % 1000).padStart(3, "0"); s = (first ? part : `x${part}/`) + s; first = false; v = Math.floor(v / 1000); } while (v > 0);
    return `${LOG}tile/entries/${s}${width ? `.p/${width}` : ""}`;
};
const viewHref = (url: string, entry?: number) => `/view?src=${encodeURIComponent(url)}${entry === undefined ? "" : `&entry=${entry}`}`;
const tickNote = () => h("p", { class: "fine ex-note" }, say("A tick means it was checked on this page just now. No tick means it's stated, with where to check it.", "សញ្ញាធីកមានន័យថាបានពិនិត្យនៅលើទំព័រនេះមុននេះបន្តិច។ គ្មានសញ្ញាធីកមានន័យថាវាត្រូវបាននិយាយ ជាមួយកន្លែងដែលត្រូវពិនិត្យ។"));
const code = (s: string) => h("pre", { class: "code" }, h("code", {}, s));
/** A block's 80-byte header from mempool.space, read once per height. null when it can't be read: the proof then stays unchecked, never failed. */
const blockHeaders = new Map<number, Promise<Uint8Array | null>>();
const headerOf = (height: number) => {
    let p = blockHeaders.get(height);
    if (!p) {
        p = (async () => {
            try {
                const a = await fetch(`https://mempool.space/api/block-height/${height}`); if (!a.ok) return null;
                const b = await fetch(`https://mempool.space/api/block/${(await a.text()).trim()}/header`); if (!b.ok) return null;
                const x = (await b.text()).trim();
                return x.length === 160 ? Uint8Array.from(x.match(/../g)!.map((c) => parseInt(c, 16))) : null;
            } catch { return null; }
        })();
        blockHeaders.set(height, p);
    }
    return p;
};
interface Anchor { ok: boolean; height?: number; time?: string; checked: boolean | null }
/** A proof names one or more blocks (each calendar adds its own). Only the earliest matters, so only it is checked and shown. */
async function anchorOf(proof: Uint8Array, digest: Uint8Array): Promise<Anchor> {
    const seen = await checkOts(proof, digest);
    if (!seen.ok) return { ok: false, checked: null };
    const heights: number[] = seen.bitcoin.map((a: { height: number }) => a.height);
    if (!heights.length) return { ok: true, checked: null };
    const first = Math.min(...heights);
    const r = await checkOts(proof, digest, { header: (x: number) => (x === first ? headerOf(x) : Promise.resolve(null)) });
    const at: { verified: boolean | null; time?: string }[] = r.bitcoin.filter((a: { height: number }) => a.height === first);
    const good = at.find((a) => a.verified === true);
    return { ok: true, height: first, time: good?.time, checked: good ? true : at.some((a) => a.verified === false) ? false : null };
}

/* ─────────────── B-Origin records ─────────────── */
/** One Bitcoin row, whatever the proof holds: several calendars can name the same block, and one can still be pending after another has confirmed. */
function bitcoinRow(out: { bitcoin: { height: number; time: string }[]; bitcoinUnchecked?: number[]; bitcoinPending?: string[] }, stamped: boolean, proof: string) {
    const earliest = [...out.bitcoin].sort((a, b) => a.height - b.height)[0], unchecked = out.bitcoinUnchecked ?? [];
    if (earliest) return leg(true, "Bitcoin", blockLink(earliest.height), " · ", say(`No later than ${when(earliest.time)} · `, `មិនយឺតជាង ${when(earliest.time)} · `), source(proof));
    if (unchecked.length) return leg(null, "Bitcoin", blockLink(Math.min(...unchecked)), ". ", say("The proof names this block, which couldn't be read just now, so the verifier below checks it.", "ភស្តុតាងដាក់ឈ្មោះប្លុកនេះ ដែលមិនអាចអានបានឥឡូវនេះ ដូច្នេះកម្មវិធីផ្ទៀងផ្ទាត់ខាងក្រោមពិនិត្យវា។"));
    if (out.bitcoinPending?.length) return leg(null, "Bitcoin", say("Waiting for a block. This takes a few hours.", "កំពុងរង់ចាំប្លុក។ វាចំណាយពេលពីរបីម៉ោង។"));
    if (!stamped) return leg(null, "Bitcoin", say("The log is stamped to Bitcoin once a day, and this record joins the next stamp. A few hours later that proof reaches a block.", "កំណត់ហេតុត្រូវបានបោះត្រាទៅ Bitcoin ម្តងក្នុងមួយថ្ងៃ ហើយកំណត់ត្រានេះចូលរួមក្នុងការបោះត្រាបន្ទាប់។ ពីរបីម៉ោងក្រោយមក ភស្តុតាងនោះទៅដល់ប្លុក។"));
    return null;
}
interface Entry { t: string; index: number; witnessedAt?: string; target?: number; claim?: { sha256: string; source: string; rights?: string; tool: string; mime: string; declared: boolean } }
interface Log { ok: boolean; why?: string; size: number; entries: Entry[]; stamps: { tsa?: number[]; ots?: number[] } }
let logCache: Log | null = null, shown = PAGE, found: { how: string; index: number; distance?: number }[] | null = null, searchNote = "";
async function readLog(): Promise<Log> {
    if (logCache) return logCache;
    let out: Log;
    try {
        const note = await logGet("checkpoint");
        if (!note) throw new Error("no checkpoint");
        const audit = await auditLog(logGet, text(note), trust);
        if (!audit.ok) out = { ok: false, why: audit.why, size: 0, entries: [], stamps: {} };
        else {
            const raw: Uint8Array[] = await readEntries(logGet, audit.size), idx = await logGet("stamps/index.json");
            out = { ok: true, size: audit.size, entries: raw.map((e) => JSON.parse(text(e))), stamps: idx ? JSON.parse(text(idx)) : {} };
        }
    } catch (e) { out = { ok: false, why: (e as Error).message, size: 0, entries: [], stamps: {} }; }
    if (out.ok) logCache = out;
    return out;
}
const withdrawnOf = (l: Log) => new Map(l.entries.filter((e) => e.t === "withdraw").map((e) => [e.target!, e.witnessedAt!]));
async function searchFile(file: File, l: Log) {
    searchNote = say("Reading the file on this device…", "កំពុងអានឯកសារនៅលើឧបករណ៍នេះ…"); found = null; paint();
    try {
        const hashes = await hashFile(new Uint8Array(await file.arrayBuffer()), { decode: (b: Uint8Array) => canvasDecoder(b, file.type) });
        found = (await findRecords(logGet, l.size, hashes)).map((m: { how: string; index: number; distance?: number }) => ({ how: m.how, index: m.index, distance: m.distance }));
        searchNote = say("The file was never uploaded. Only its fingerprint was compared.", "ឯកសារមិនត្រូវបានផ្ទុកឡើងទេ។ មានតែស្នាមម្រាមដៃរបស់វាប៉ុណ្ណោះដែលត្រូវបានប្រៀបធៀប។");
    } catch { found = []; searchNote = say("That file couldn't be read.", "មិនអាចអានឯកសារនោះបានទេ។"); }
    paint();
}
function searchBox(l: Log) {
    const input = h("input", { type: "search", "aria-label": say("Record number or file fingerprint", "លេខកំណត់ត្រា ឬស្នាមម្រាមដៃឯកសារ"), placeholder: say("Record number or file fingerprint", "លេខកំណត់ត្រា ឬស្នាមម្រាមដៃឯកសារ"), spellcheck: "false", autocomplete: "off" }) as HTMLInputElement;
    const go = (e: Event) => {
        e.preventDefault();
        const q = input.value.replace(/[\s#]/g, "").toLowerCase();
        if (/^\d{1,12}$/.test(q)) return nav(`/origin/${Number(q)}`);
        if (/^[0-9a-f]{64}$/.test(q)) { found = l.entries.filter((x) => x.claim?.sha256 === q).map((x) => ({ how: "exact", index: x.index })); searchNote = ""; return paint(); }
        found = null; searchNote = say("Type a record number, or a fingerprint of 64 characters.", "វាយលេខកំណត់ត្រា ឬស្នាមម្រាមដៃ 64 តួអក្សរ។"); paint();
    };
    return h("div", {}, h("form", { class: "ex-search", role: "search", onsubmit: go }, input, h("button", { class: "btn", type: "submit" }, say("Find", "រក"))),
        h("label", { class: "ex-file" }, say("or choose a file", "ឬជ្រើសរើសឯកសារ"), h("input", { type: "file", onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void searchFile(f, l); } })));
}
const HOW: Record<string, [string, string]> = { exact: ["This exact file", "ឯកសារនេះផ្ទាល់"], "same pixels": ["The same picture, saved as a different file", "រូបភាពដូចគ្នា រក្សាទុកជាឯកសារផ្សេង"], similar: ["A picture that looks alike. It may be a different one.", "រូបភាពដែលមើលទៅស្រដៀង។ វាអាចជារូបផ្សេង។"] };
function results() {
    if (found === null) return searchNote ? h("p", { class: "fine", role: "status" }, searchNote) : null;
    const certain = [...found].sort((a, b) => (a.how === "similar" ? 1 : 0) - (b.how === "similar" ? 1 : 0) || (a.distance ?? 0) - (b.distance ?? 0));
    return card(h("h2", {}, found.length ? say(`${found.length} found`, `រកឃើញ ${found.length}`) : say("No record matches", "គ្មានកំណត់ត្រាត្រូវគ្នាទេ")),
        ...certain.map((m) => h("a", { class: "ex-row", href: `/origin/${m.index}` }, h("b", {}, `#${n(m.index)}`), h("span", {}, HOW[m.how]?.[isKm() ? 1 : 0] ?? m.how))),
        searchNote ? h("p", { class: "fine" }, searchNote) : null);
}
async function originPage() {
    const title = head(say("Records", "កំណត់ត្រា"), say("A public log of what people chose to sign. It only ever grows, and every entry below was checked in your browser just now.", "កំណត់ហេតុសាធារណៈនៃអ្វីដែលមនុស្សបានជ្រើសរើសចុះហត្ថលេខា។ វាគ្រាន់តែកើនឡើង ហើយកំណត់ត្រានីមួយៗខាងក្រោមត្រូវបានពិនិត្យក្នុងកម្មវិធីរុករករបស់អ្នកមុននេះបន្តិច។"));
    view.replaceChildren(title, card(h("p", { role: "status" }, say("Reading and checking the public log…", "កំពុងអាន និងពិនិត្យកំណត់ហេតុសាធារណៈ…"))));
    const l = await readLog();
    if (route().name !== "origin") return;
    if (!l.ok) { view.replaceChildren(title, card(leg(false, say("This log didn't pass its check", "កំណត់ហេតុនេះមិនបានឆ្លងការពិនិត្យទេ"), say("Or it can't be read right now. So nothing from it is shown. ", "ឬមិនអាចអានបានឥឡូវនេះ។ ដូច្នេះគ្មានអ្វីពីវាត្រូវបានបង្ហាញទេ។ "), h("span", { class: "ex-mono" }, l.why ?? "")))); return; }
    const withdrawn = withdrawnOf(l), recs = l.entries.filter((e) => e.t === "record").reverse(), page = recs.slice(0, shown);
    const stamped = [...new Set([...(l.stamps.tsa ?? []), ...(l.stamps.ots ?? [])])].filter((s) => s > 0).sort((a, b) => b - a).slice(0, 12);
    view.replaceChildren(title, searchBox(l), results() ?? h("span", {}),
        card(leg(true, say(`${count(l.size, "entry", "entries")}, all checked`, `${n(l.size)} ធាតុ បានពិនិត្យទាំងអស់`), say("The log's signature, its tree, and each entry's signature were checked in your browser. ", "ហត្ថលេខារបស់កំណត់ហេតុ មែកធាងរបស់វា និងហត្ថលេខារបស់ធាតុនីមួយៗត្រូវបានពិនិត្យក្នុងកម្មវិធីរុករករបស់អ្នក។ "), source(viewHref(`${LOG}checkpoint`)))),
        card(h("h2", {}, say("Records, newest first", "កំណត់ត្រា ថ្មីបំផុតមុន")), h("div", { class: "ex-scroll" }, h("table", { class: "ex-table" },
            h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, say("Signed (UTC)", "បានចុះហត្ថលេខា (UTC)")), h("th", {}, say("How it was made", "របៀបបង្កើត")), h("th", {}, say("File fingerprint", "ស្នាមម្រាមដៃឯកសារ")))),
            h("tbody", {}, ...page.map((e) => h("tr", {}, h("td", {}, link(`/origin/${e.index}`, n(e.index))), h("td", {}, date(e.witnessedAt ?? "")), h("td", {}, label(e.claim!.source), withdrawn.has(e.index) ? h("div", { class: "fine" }, say("Withdrawn by the signer", "អ្នកចុះហត្ថលេខាបានដកចេញ")) : null), h("td", { class: "ex-mono" }, short(e.claim!.sha256))))))),
            recs.length > shown ? h("button", { type: "button", class: "btn ghost ex-more ex-gap", onclick: () => { shown += PAGE; paint(); } }, say("Show more", "បង្ហាញបន្ថែម")) : null),
        stamped.length ? card(h("h2", {}, say("Sealed by outside clocks", "បានបិទត្រាដោយនាឡិកាខាងក្រៅ")), h("p", {}, say("At these sizes the log's state was also timestamped outside our control. Open a record to check its own.", "នៅទំហំទាំងនេះ ស្ថានភាពកំណត់ហេតុក៏ត្រូវបានបោះត្រាពេលវេលានៅក្រៅការគ្រប់គ្រងរបស់យើង។ បើកកំណត់ត្រាដើម្បីពិនិត្យរបស់វា។")),
            ...stamped.map((s) => h("p", { class: "fine" }, say(`${count(s, "entry", "entries")}: `, `${n(s)} ធាតុ៖ `), [(l.stamps.tsa ?? []).includes(s) ? say("timestamp authorities", "អាជ្ញាធរបោះត្រាពេលវេលា") : "", (l.stamps.ots ?? []).includes(s) ? "Bitcoin" : ""].filter(Boolean).join(" · ")))) : null,
        card(h("h2", {}, say("Check it yourself, without us", "ពិនិត្យដោយខ្លួនឯង ដោយមិនត្រូវការយើង")), h("p", {}, say("This page and the free verifier run the same code. Nothing about it needs this site.", "ទំព័រនេះ និងកម្មវិធីផ្ទៀងផ្ទាត់ឥតគិតថ្លៃដំណើរការកូដដូចគ្នា។ គ្មានអ្វីត្រូវការគេហទំព័រនេះទេ។")), code("npx @333eco/origin-verify record 0"), link("https://origin.333.eco/docs#check", say("How checking works", "របៀបពិនិត្យ")), " · ", link("https://origin.333.eco/docs#tree", say("How the log holds together", "របៀបដែលកំណត់ហេតុរក្សាភាពជាប់គ្នា"))));
}
async function recordPage(index: number) {
    const title = head(`#${n(index)}`);
    view.replaceChildren(title, card(h("p", { role: "status" }, say("Checking this record…", "កំពុងពិនិត្យកំណត់ត្រានេះ…"))));
    const fail = (t: string, why: string) => view.replaceChildren(title, card(leg(false, t, why)), link("/origin", say("All records", "កំណត់ត្រាទាំងអស់")));
    let pack: any, out: any, l: Log;
    try {
        l = await readLog();
        if (!l.ok) return fail(say("The log didn't pass its check", "កំណត់ហេតុមិនបានឆ្លងការពិនិត្យទេ"), l.why ?? "");
        if (index >= l.size) return view.replaceChildren(title, card(h("p", {}, say("The log doesn't have this entry. A new record joins at its next checkpoint, within the hour.", "កំណត់ហេតុមិនមានធាតុនេះទេ។ កំណត់ត្រាថ្មីចូលរួមនៅចំណុចត្រួតពិនិត្យបន្ទាប់ ក្នុងរយៈពេលមួយម៉ោង។"))), link("/origin", say("All records", "កំណត់ត្រាទាំងអស់")));
        pack = await packRecord(logGet, index, trust);
        out = await verifyPack(pack, trust, { header: headerOf });
    } catch (e) { return fail(say("This record couldn't be checked", "មិនអាចពិនិត្យកំណត់ត្រានេះបានទេ"), (e as Error).message); }
    if (route().name !== "record") return;
    if (!out.ok) return fail(say("This record didn't pass its check", "កំណត់ត្រានេះមិនបានឆ្លងការពិនិត្យទេ"), out.why);
    const e: Entry = pack.entry, c = e.claim, gone = withdrawnOf(l).get(index);
    if (e.t !== "record" || !c) return view.replaceChildren(title, card(e.t === "withdraw" ? h("p", {}, say("This entry withdraws record ", "ធាតុនេះដកកំណត់ត្រា "), link(`/origin/${e.target}`, `#${e.target}`)) : h("p", {}, say("This entry holds no record.", "ធាតុនេះមិនមានកំណត់ត្រាទេ។"))));
    const row = (a: string, b: Kid, mono = false) => [h("dt", {}, a), h("dd", mono ? { class: "ex-mono" } : {}, b)];
    view.replaceChildren(head(say(`Record #${n(index)}`, `កំណត់ត្រា #${n(index)}`)),
        gone ? card(h("p", {}, say(`The signer withdrew this on ${date(gone)}. It stays in the log, marked as withdrawn.`, `អ្នកចុះហត្ថលេខាបានដកវាចេញនៅ ${date(gone)}។ វានៅក្នុងកំណត់ហេតុ ដោយមានសម្គាល់ថាបានដកចេញ។`))) : null,
        card(h("dl", { class: "ex-kv" }, ...row(say("Signed with", "បានចុះហត្ថលេខាដោយ"), say("a HeartBank® passkey", "passkey HeartBank®")), ...row(say("When", "ពេលណា"), when(e.witnessedAt!)), ...row(say("How it was made", "របៀបបង្កើត"), label(c.source)),
            ...(c.rights ? row(say("Shared under", "ចែករំលែកក្រោម"), c.rights) : []), ...row(say("Signed through", "ចុះហត្ថលេខាតាមរយៈ"), c.tool, true), ...row(say("File fingerprint", "ស្នាមម្រាមដៃឯកសារ"), full(c.sha256), true))),
        card(h("h2", {}, say("Checked in your browser", "បានពិនិត្យក្នុងកម្មវិធីរុករករបស់អ្នក")),
            leg(true, say("The signature on this entry", "ហត្ថលេខាលើធាតុនេះ"), source(viewHref(entryTile(index, out.size), index))), leg(true, say("It is in the log", "វានៅក្នុងកំណត់ហេតុ"), source(viewHref(`${LOG}checkpoint`)), " · ", pack.inclusion.length ? say(`${count(pack.inclusion.length, "hash leads", "hashes lead")} from this entry to the log's signed root.`, `${n(pack.inclusion.length)} ហាសនាំពីធាតុនេះទៅឫសដែលបានចុះហត្ថលេខារបស់កំណត់ហេតុ។`) : say("It's the only entry so far, so it is the log's signed root.", "វាជាធាតុតែមួយគត់រហូតមកដល់ពេលនេះ ដូច្នេះវាជាឫសដែលបានចុះហត្ថលេខារបស់កំណត់ហេតុ។")),
            bitcoinRow(out, !!pack.stamps?.ots, viewHref(`${LOG}stamps/${pack.stamps?.ots?.size}.ots`)),
            ...out.timestamped.map((t: { authority: string; noLaterThan: string }) => leg(true, say(`Timestamp: ${t.authority}`, `ត្រាពេលវេលា៖ ${t.authority}`), say(`No later than ${when(t.noLaterThan)} · `, `មិនយឺតជាង ${when(t.noLaterThan)} · `), source(viewHref(`${LOG}stamps/${pack.stamps?.tsa?.size}.${t.authority}.tsr`)))),
            ...out.timestampFailures.map((t: { authority: string; why: string }) => leg(false, say(`Timestamp: ${t.authority}`, `ត្រាពេលវេលា៖ ${t.authority}`), t.why))), tickNote(),
        card(h("h2", {}, say("What a record can't show", "អ្វីដែលកំណត់ត្រាមិនអាចបង្ហាញបាន")), h("p", {}, say("Who imagined the work. A record shows only who signed it, and when.", "អ្នកណាបានគិតស្នាដៃនេះ។ កំណត់ត្រាបង្ហាញតែអ្នកណាបានចុះហត្ថលេខា និងពេលណាប៉ុណ្ណោះ។"))),
        card(h("h2", {}, say("Check it yourself", "ពិនិត្យដោយខ្លួនឯង")), h("p", {}, say("A source shows the data a check used. To check it without trusting this page, run:", "ប្រភពបង្ហាញទិន្នន័យដែលការពិនិត្យបានប្រើ។ ដើម្បីពិនិត្យដោយមិនទុកចិត្តទំព័រនេះ សូមដំណើរការ៖")), code(`npx @333eco/origin-verify record ${index}`), h("a", { class: "btn ghost", href: `/origin/${index}/proof` }, say("See this record's proof", "មើលភស្តុតាងនៃកំណត់ត្រានេះ"))),
        link("/origin", say("All records", "កំណត់ត្រាទាំងអស់")));
}

/* ─────────────── Corpus ─────────────── */
interface Doc { slug: string; title: string; subtitle?: string | null; genre: string; date: string; repo: string; path: string; licence: string; sha256: string; doi: string | null; archive_matches_today: boolean | null; opentimestamps: boolean; source_url: string | null; read_at: string | null }
let docs: Doc[] | null = null, filter = "", shownDocs = PAGE;
// One filter, by kind. In the address, so a filtered list can be shared and Back returns to it. No counts on the buttons: this site keeps no counters.
const KINDS: [string, string, string, string[]][] = [
    ["", "All", "ទាំងអស់", []], ["defensive-publications", "Defensive publications", "ការបោះពុម្ពការពារ", ["defensive-publications"]], ["essays", "Essays", "អត្ថបទ", ["essays"]],
    ["positions", "Positions", "ជំហរ", ["positions"]], ["white-papers", "White papers", "ឯកសារស", ["white-papers"]], ["letters", "Letters", "លិខិត", ["letters"]], ["other", "Other", "ផ្សេងៗ", ["program", "about"]],
];
const kindNow = () => { const k = new URLSearchParams(location.search).get("kind") ?? ""; return KINDS.some((x) => x[0] === k) ? k : ""; };
const GENRES: Record<string, [string, string]> = { "defensive-publications": ["Defensive publication", "ការបោះពុម្ពការពារ"], essays: ["Essay", "អត្ថបទ"], positions: ["Position", "ជំហរ"], "white-papers": ["White paper", "ឯកសារស"], letters: ["Letter", "លិខិត"], program: ["Program", "កម្មវិធី"], about: ["About", "អំពី"] };
const genre = (g: string) => GENRES[g]?.[isKm() ? 1 : 0] ?? g;
/** A paper's two lines. A subtitle it declares sits under its whole title, as on the paper's own page; with none declared, a colon marks where one starts. A letter's subtitle is only its date, already on the line below. */
const titleLines = (d: Doc): [string, string | null] => {
    if (d.genre === "letters") return [d.title, null];
    if (d.subtitle) return [d.title, d.subtitle.replace(/\\"/g, '"')];
    const at = d.title.indexOf(": ");
    return at < 0 ? [d.title, null] : [d.title.slice(0, at), d.title.slice(at + 2)];
};
/** The index holds a subtitle as its front matter wrote it, so *these* are italics. */
const subtitleLine = (s: string) => h("p", { class: "ex-sub" }, ...s.split(/\*([^*]+)\*/).map((x, i) => (i % 2 ? h("em", {}, x) : x)));
const cardTitle = (d: Doc) => { const [main, sub] = titleLines(d); return [h("b", {}, main), sub ? subtitleLine(sub) : null]; };
const docHead = (d: Doc, lede: string) => { const [main, sub] = titleLines(d); return h("div", {}, h("h1", {}, main), sub ? subtitleLine(sub) : null, h("p", { class: "lede" }, lede)); };
async function readDocs() {
    if (docs) return docs;
    const r = await fetch(INDEX);
    if (!r.ok) throw new Error(String(r.status));
    docs = ((await r.json()).documents as Doc[]).sort((a, b) => dayOf(b.date).localeCompare(dayOf(a.date)) || a.title.localeCompare(b.title));
    return docs;
}
const cantRead = (title: Node) => view.replaceChildren(title, card(leg(false, say("The corpus index can't be read right now", "មិនអាចអានសន្ទស្សន៍ឯកសារបានឥឡូវនេះទេ"), say("Try again in a little while.", "សូមសាកល្បងម្តងទៀតបន្តិចក្រោយ។"))));
async function corpusPage() {
    const title = head(say("Corpus", "សារពើភ័ណ្ឌឯកសារ"), say("Every paper and essay is timestamped when its text changes, so anyone can check that today's text is the text that was published.", "ឯកសារ និងអត្ថបទនីមួយៗត្រូវបានបោះត្រាពេលវេលានៅពេលអត្ថបទរបស់វាផ្លាស់ប្តូរ ដូច្នេះអ្នកណាក៏អាចពិនិត្យថាអត្ថបទថ្ងៃនេះគឺជាអត្ថបទដែលបានបោះពុម្ព។"));
    if (!docs) view.replaceChildren(title, card(h("p", { role: "status" }, say("Reading the index…", "កំពុងអានសន្ទស្សន៍…"))));
    let list: Doc[];
    try { list = await readDocs(); } catch { return cantRead(title); }
    if (route().name !== "corpus") return;
    let kind = kindNow();
    const kinds = h("div", { class: "ex-kinds", role: "group", "aria-label": say("Kind of document", "ប្រភេទឯកសារ") });
    const box = h("div", {}), input = h("input", { type: "search", value: filter, "aria-label": say("Search by title", "ស្វែងរកតាមចំណងជើង"), placeholder: say("Search by title", "ស្វែងរកតាមចំណងជើង"), oninput: (e: Event) => { filter = (e.target as HTMLInputElement).value; shownDocs = PAGE; fill(); } });
    const fill = () => {
        const genres = KINDS.find((x) => x[0] === kind)![3], kept = genres.length ? list.filter((d) => genres.includes(d.genre)) : list;
        const q = filter.trim().toLowerCase(), hits = q ? kept.filter((d) => `${d.title} ${titleLines(d)[1] ?? ""}`.replace(/\*/g, "").toLowerCase().includes(q) || d.slug.includes(q) || d.sha256.startsWith(q.replace(/\s/g, ""))) : kept;
        kinds.replaceChildren(...KINDS.map(([k, en, km]) => h("button", { type: "button", class: k === kind ? "pill on" : "pill", "aria-pressed": k === kind ? "true" : "false", onclick: () => { kind = k; shownDocs = PAGE; history.replaceState(null, "", k ? `/corpus?kind=${k}` : "/corpus"); fill(); } }, say(en, km))));
        box.replaceChildren(...([h("p", { class: "fine ex-count" }, say(hits.length === 1 ? "1 document" : `${n(hits.length)} documents`, `${n(hits.length)} ឯកសារ`)),
            ...hits.slice(0, shownDocs).map((d) => h("a", { class: "card ex-doc", href: `/corpus/${d.slug}` }, ...cardTitle(d), h("span", {}, `${genre(d.genre)} · ${date(d.date)} · `, h("span", { class: "ex-mono" }, short(d.sha256))),
                h("span", { class: "ex-chips" }, d.opentimestamps ? h("span", { class: "pill on" }, "Bitcoin") : null, d.doi ? h("span", { class: "pill on" }, "DOI") : null))),
            hits.length > shownDocs ? h("button", { type: "button", class: "btn ghost ex-more", onclick: () => { shownDocs += PAGE; fill(); } }, say("Show more", "បង្ហាញបន្ថែម")) : null].filter(Boolean) as Node[]));
    };
    fill();
    view.replaceChildren(title, kinds, h("form", { class: "ex-search", role: "search", onsubmit: (e: Event) => e.preventDefault() }, input), box);
}
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
/** Three checks that run here against the public repository. A failed fetch says "couldn't check", never "failed". */
async function liveLegs(d: Doc, into: HTMLElement) {
    const put = (key: string, node: Node) => into.querySelector(`[data-leg="${key}"]`)?.replaceWith(node);
    if (!d.source_url) { put("today", leg(null, say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា"), say("This one's source isn't in a public repository.", "ប្រភពនេះមិនមាននៅក្នុងឃ្លាំងសាធារណៈទេ។"))); put("btc", leg(d.opentimestamps ? null : false, "Bitcoin", say("The proof lives beside the source.", "ភស្តុតាងនៅជាមួយប្រភព។"))); put("tsa", h("span", {})); return; }
    await Promise.all([
        (async () => {
            try {
                const r = await fetch(d.source_url!); if (!r.ok) throw new Error();
                const got = hex(await sha256(new Uint8Array(await r.arrayBuffer())));
                put("today", got === d.sha256 ? leg(true, say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា"), say("The repository's text has this fingerprint, hashed here just now. ", "អត្ថបទរបស់ឃ្លាំងមានស្នាមម្រាមដៃនេះ ដែលបានហាសនៅទីនេះមុននេះបន្តិច។ "), source(viewHref(d.source_url!))) : leg(null, say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា"), say("The repository's text is newer than this index. The index catches up when the change finishes its chain.", "អត្ថបទរបស់ឃ្លាំងថ្មីជាងសន្ទស្សន៍នេះ។ សន្ទស្សន៍តាមទាន់នៅពេលការផ្លាស់ប្តូរបញ្ចប់ខ្សែសង្វាក់របស់វា។")));
            } catch { put("today", leg(null, say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា"), say("The repository can't be read right now, so this wasn't checked.", "មិនអាចអានឃ្លាំងបានឥឡូវនេះទេ ដូច្នេះនេះមិនត្រូវបានពិនិត្យទេ។"))); }
        })(),
        (async () => {
            const proofUrl = `${d.source_url}.ots`;
            try {
                const r = await fetch(proofUrl); if (!r.ok) throw new Error();
                const digest = Uint8Array.from(d.sha256.match(/../g)!.map((x) => parseInt(x, 16)));
                const a = await anchorOf(new Uint8Array(await r.arrayBuffer()), digest);
                if (!a.ok) return put("btc", leg(null, "Bitcoin", say("The repository's proof is for a newer version of the text than this index.", "ភស្តុតាងរបស់ឃ្លាំងគឺសម្រាប់កំណែថ្មីជាងនៃអត្ថបទជាងសន្ទស្សន៍នេះ។"), " ", link(viewHref(proofUrl), say("The proof", "ភស្តុតាង"))));
                if (a.height === undefined) return put("btc", leg(null, "Bitcoin", say("Waiting for a block. This takes a few hours. ", "កំពុងរង់ចាំប្លុក។ វាចំណាយពេលពីរបីម៉ោង។ "), link(viewHref(proofUrl), say("The proof", "ភស្តុតាង"))));
                put("btc", a.checked === true ? leg(true, "Bitcoin", blockLink(a.height), ". ", say(`The proof leads from this text to this block, whose header was read from mempool.space just now. Mined ${date(a.time!)}. `, `ភស្តុតាងនាំពីអត្ថបទនេះទៅប្លុកនេះ ដែលក្បាលរបស់វាត្រូវបានអានពី mempool.space មុននេះបន្តិច។ បានជីកនៅ ${date(a.time!)}។ `), link(viewHref(proofUrl), say("The proof", "ភស្តុតាង")))
                    : a.checked === false ? leg(false, "Bitcoin", blockLink(a.height), ". ", say("This block's header, as mempool.space serves it, doesn't hold this proof. ", "ក្បាលប្លុកនេះ ដូចដែល mempool.space ផ្តល់ឱ្យ មិនមានភស្តុតាងនេះទេ។ "), link(viewHref(proofUrl), say("The proof", "ភស្តុតាង")))
                    : leg(null, "Bitcoin", blockLink(a.height), ". ", say("The proof commits to this text and names this block, which couldn't be read just now. Confirm it with the OpenTimestamps tool: ", "ភស្តុតាងបញ្ជាក់អត្ថបទនេះ ហើយដាក់ឈ្មោះប្លុកនេះ ដែលមិនអាចអានបានឥឡូវនេះ។ សូមបញ្ជាក់វាដោយឧបករណ៍ OpenTimestamps៖ "), link(viewHref(proofUrl), say("the proof", "ភស្តុតាង"))));
            } catch { put("btc", leg(null, "Bitcoin", say("The proof can't be read right now, so this wasn't checked.", "មិនអាចអានភស្តុតាងបានឥឡូវនេះទេ ដូច្នេះនេះមិនត្រូវបានពិនិត្យទេ។"))); }
        })(),
        (async () => {
            // The repository's manifests are dated, so the newest few can be read without listing anything.
            const m = /^(https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/)/.exec(d.source_url!);
            const base = m?.[1], folder = base ? `${base.replace("raw.githubusercontent.com", "github.com").replace(/\/([^/]+)\/$/, "/tree/$1/")}timestamps/manifests` : "";
            if (!base) return put("tsa", h("span", {}));
            for (let back = 0; back < 10; back++) {
                const day = new Date(Date.now() - back * 864e5 + 864e5).toISOString().slice(0, 10);
                try {
                    const r = await fetch(`${base}timestamps/manifests/${day}.sha256`);
                    if (!r.ok) continue;
                    const has = (await r.text()).includes(`${d.sha256}  `);
                    return put("tsa", has ? leg(true, say("Timestamp authorities", "អាជ្ញាធរបោះត្រាពេលវេលា"), say(`In the ${day} manifest, which outside authorities sign. `, `នៅក្នុងបញ្ជី ${day} ដែលអាជ្ញាធរខាងក្រៅចុះហត្ថលេខា។ `), link(folder, say("The manifests", "បញ្ជី")))
                        : leg(null, say("Timestamp authorities", "អាជ្ញាធរបោះត្រាពេលវេលា"), say(`Not in the ${day} manifest. A change joins the next one. `, `មិននៅក្នុងបញ្ជី ${day} ទេ។ ការផ្លាស់ប្តូរចូលក្នុងបញ្ជីបន្ទាប់។ `), link(folder, say("The manifests", "បញ្ជី"))));
                } catch { /* try an older one */ }
            }
            put("tsa", leg(null, say("Timestamp authorities", "អាជ្ញាធរបោះត្រាពេលវេលា"), say("No recent manifest could be read, so this wasn't checked. ", "មិនអាចអានបញ្ជីថ្មីៗបានទេ ដូច្នេះនេះមិនត្រូវបានពិនិត្យទេ។ "), link(folder, say("The manifests", "បញ្ជី"))));
        })(),
    ]);
}
/* The paper's history. Everything is read from where it lives, in this browser; what can't be read leaves a gap, never a failure. */
interface Version { digest: string; proof: string; anchor: Anchor; commit?: string; day?: string; manifest?: string }
interface History { versions: Version[]; proofsRead: boolean; partial: boolean; repo?: string; branch?: string; path?: string; firstCommit?: string; gitRead: boolean; gitFailed: boolean; zenodo?: { at: string; url: string }; archive?: { at: string; url: string }; tdcommons?: { at: string; url: string }; publicRead: boolean }
/** An OpenTimestamps file names the digest it speaks of: 31 bytes of magic, a version byte, the SHA-256 tag, then 32 bytes. */
const otsDigest = (b: Uint8Array) => (b.length >= 65 && b[32] === 0x08 ? hex(b.subarray(33, 65)) : null);
async function readProofs(d: Doc, x: History) {
    const files: { url: string; bytes: Uint8Array }[] = [];
    for (let r = 1; ; r++) {
        const url = `${d.source_url}.r${r}.ots`;
        try { const res = await fetch(url); if (!res.ok) { if (res.status !== 404) x.partial = true; break; } files.push({ url, bytes: new Uint8Array(await res.arrayBuffer()) }); } catch { x.partial = true; break; }
    }
    try { const url = `${d.source_url}.ots`, res = await fetch(url); if (res.ok) files.push({ url, bytes: new Uint8Array(await res.arrayBuffer()) }); else x.partial = true; } catch { x.partial = true; }
    const read = await Promise.all(files.map(async (f): Promise<Version | null> => {
        const digest = otsDigest(f.bytes); if (!digest) return null;
        return { digest, proof: f.url, anchor: await anchorOf(f.bytes, Uint8Array.from(digest.match(/../g)!.map((c) => parseInt(c, 16)))) };
    }));
    x.versions = read.filter(Boolean) as Version[]; x.proofsRead = true;
}
/** When the public first saw it: Zenodo's own record of the first version, and the Internet Archive's first capture of its page. */
async function readPublic(d: Doc, x: History) {
    const zenodo = (async () => {
        const id = /zenodo\.(\d+)$/.exec(d.doi ?? "")?.[1]; if (!id) return;
        try { const hit = (await (await fetch(`https://zenodo.org/api/records/${id}/versions?size=1&sort=oldest`)).json()).hits.hits[0]; if (hit?.created) x.zenodo = { at: hit.created, url: hit.links?.self_html ?? `https://zenodo.org/records/${hit.id}` }; } catch { /* a gap */ }
    })();
    const addresses = d.read_at ? [d.read_at.replace(/^https?:\/\//, "")] : [];
    if (addresses[0]?.startsWith("thonly.org/")) addresses.push(`thonly.org/research/${d.slug}`); // the address papers had before /publications
    const archive = Promise.all(addresses.map(async (a) => {
        try {
            const c = (await (await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(a)}&timestamp=19960101`)).json()).archived_snapshots?.closest;
            const t = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(c?.timestamp ?? "");
            if (c?.available && t) { const at = `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}Z`; if (!x.archive || at < x.archive.at) x.archive = { at, url: String(c.url).replace(/^http:/, "https:") }; }
        } catch { /* a gap */ }
    }));
    const tdcommons = (async () => {
        if (d.genre !== "defensive-publications" || !x.repo) return;
        try {
            const entry = (await (await fetch(`https://raw.githubusercontent.com/${x.repo}/${x.branch}/defensive-publications/submitted/manifest.json`)).json()).entries.find((e: { slug: string }) => e.slug === d.slug);
            const first = [entry, ...(entry?.prior_postings ?? [])].filter((p) => p?.posted && p.url).sort((a, b) => a.posted.localeCompare(b.posted))[0];
            if (first) x.tdcommons = { at: first.posted, url: first.url };
        } catch { /* a gap */ }
    })();
    await Promise.all([zenodo, archive, tdcommons]); x.publicRead = true;
}
/** Finds each version's text in the repository's history by hashing it, then the first signed manifest that names it. */
async function readRepository(x: History, paint: () => void) {
    const apiBase = `https://api.github.com/repos/${x.repo}`, list = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
    try {
        const commits: { sha: string; commit: { committer: { date: string } } }[] = await list(`${apiBase}/commits?sha=${x.branch}&path=${encodeURIComponent(x.path!)}&per_page=100`);
        if (commits.length && commits.length < 100) x.firstCommit = commits[commits.length - 1].commit.committer.date;
        const want = new Map(x.versions.map((v) => [v.digest, v]));
        let left = want.size;
        for (let i = 0; i < commits.length && left > 0; i += 6) {
            await Promise.all(commits.slice(i, i + 6).map(async (c) => {
                try {
                    const r = await fetch(`https://raw.githubusercontent.com/${x.repo}/${c.sha}/${x.path}`); if (!r.ok) return;
                    const v = want.get(hex(await sha256(new Uint8Array(await r.arrayBuffer()))));
                    if (v && !v.commit) { v.commit = c.sha; v.day = c.commit.committer.date.slice(0, 10); left--; }
                } catch { /* a gap */ }
            }));
            paint();
        }
        const days = ((await list(`${apiBase}/contents/timestamps/manifests?ref=${x.branch}`)) as { name: string }[]).map((f) => f.name).filter((f) => /^\d{4}-\d{2}-\d{2}\.sha256$/.test(f)).map((f) => f.slice(0, 10)).sort();
        const texts = new Map<string, Promise<string>>();
        const manifest = (day: string) => { let t = texts.get(day); if (!t) { t = fetch(`https://raw.githubusercontent.com/${x.repo}/${x.branch}/timestamps/manifests/${day}.sha256`).then((r) => (r.ok ? r.text() : "")).catch(() => ""); texts.set(day, t); } return t; };
        await Promise.all(x.versions.map(async (v) => {
            if (!v.day) return;
            const from = days.findIndex((m) => m >= v.day!); if (from < 0) return;
            for (const m of days.slice(from, from + 2)) if ((await manifest(m)).includes(`${v.digest}  `)) { v.manifest = m; return; } // a same-day manifest can predate the commit
        }));
    } catch { x.gitFailed = true; }
    x.gitRead = true;
}
const histories = new Map<string, { x: History; paint: () => void }>();
function historyOf(d: Doc, paint: () => void) {
    let e = histories.get(d.slug);
    if (e) { e.paint = paint; paint(); return e.x; }
    const x: History = { versions: [], proofsRead: false, partial: false, gitRead: false, gitFailed: false, publicRead: false };
    const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/.exec(d.source_url ?? "");
    if (m) { x.repo = m[1]; x.branch = m[2]; x.path = m[3]; }
    const entry = { x, paint }; e = entry; histories.set(d.slug, entry);
    const again = () => entry.paint();
    (async () => {
        const pub = readPublic(d, x).then(again);
        if (d.source_url) { await readProofs(d, x); again(); if (x.repo && x.versions.length) await readRepository(x, again); }
        x.proofsRead = true; x.gitRead = true; again(); await pub;
    })();
    paint();
    return x;
}
const earliestOf = (x: History) => x.versions.reduce<Version | null>((best, v) => (v.anchor.height !== undefined && (!best || v.anchor.height < best.anchor.height!) ? v : best), null);
function howEarly(x: History) {
    const first = earliestOf(x), n1 = first ? x.versions.indexOf(first) + 1 : 0, reading = say("Reading…", "កំពុងអាន…");
    const proofLink = first ? link(`https://mempool.space/block/${first.anchor.height}`, say(`block ${n(first.anchor.height!)}`, `ប្លុក ${n(first.anchor.height!)}`)) : null;
    const signed = x.versions.filter((v) => v.manifest).map((v) => v.manifest!).sort()[0];
    const existed = !first
        ? leg(null, say("Earliest proof", "ភស្តុតាងដំបូងបំផុត"), x.proofsRead ? say("No proof has reached a block yet.", "មិនទាន់មានភស្តុតាងទៅដល់ប្លុកនៅឡើយទេ។") : reading)
        : leg(first.anchor.checked, first.anchor.time ? say(`Earliest proof: ${date(first.anchor.time)}`, `ភស្តុតាងដំបូងបំផុត៖ ${date(first.anchor.time)}`) : say("Earliest proof", "ភស្តុតាងដំបូងបំផុត"),
            say(`Version ${n(n1)} is in Bitcoin `, `កំណែទី ${n(n1)} នៅក្នុង Bitcoin `), proofLink, say(".", "។"), signed ? say(` Timestamp authorities signed a version in the ${signed} manifest.`, ` អាជ្ញាធរបោះត្រាពេលវេលាបានចុះហត្ថលេខាលើកំណែមួយនៅក្នុងបញ្ជី ${signed}។`) : null);
    existed.classList.add("ex-first");
    const dated = [x.zenodo && { at: x.zenodo.at, node: h("p", {}, say(`Zenodo published its first version on ${date(x.zenodo.at)}. `, `Zenodo បានបោះពុម្ពកំណែដំបូងរបស់វានៅ ${date(x.zenodo.at)}។ `), link(x.zenodo.url, say("The record", "កំណត់ត្រា"))) },
        x.tdcommons && { at: x.tdcommons.at, node: h("p", {}, say(`TDCommons posted it on ${date(x.tdcommons.at)}, by this repository's record. `, `TDCommons បានបង្ហោះវានៅ ${date(x.tdcommons.at)} តាមកំណត់ត្រារបស់ឃ្លាំងនេះ។ `), link(x.tdcommons.url, say("The posting", "ការបង្ហោះ"))) },
        x.archive && { at: x.archive.at, node: h("p", {}, say(`The Internet Archive first captured its page on ${date(x.archive.at)}. `, `Internet Archive បានចាប់យកទំព័ររបស់វាដំបូងនៅ ${date(x.archive.at)}។ `), link(x.archive.url, say("The capture", "ការចាប់យក"))) }]
        .filter(Boolean).sort((a, b) => (a!.at < b!.at ? -1 : 1)) as { at: string; node: HTMLElement }[];
    const history = x.repo && x.branch && x.path ? `https://github.com/${x.repo}/commits/${x.branch}/${x.path}` : null;
    const pub = h("div", { class: "ex-leg" }, h("b", {}, dated.length ? say(`Public by ${date(dated[0].at)}`, `ជាសាធារណៈនៅ ${date(dated[0].at)}`) : say("Public by", "ជាសាធារណៈនៅ")),
        ...(dated.length ? dated.map((v) => v.node) : [h("p", {}, x.publicRead ? say("No public record gave a date just now.", "គ្មានកំណត់ត្រាសាធារណៈណាផ្តល់កាលបរិច្ឆេទឥឡូវនេះទេ។") : reading)]),
        x.firstCommit ? h("p", {}, say(`Its repository's history starts on ${date(x.firstCommit)}. Git dates are written by the author, so this is stated, not proved. `, `ប្រវត្តិឃ្លាំងរបស់វាចាប់ផ្តើមនៅ ${date(x.firstCommit)}។ កាលបរិច្ឆេទ Git ត្រូវបានសរសេរដោយអ្នកនិពន្ធ ដូច្នេះនេះគឺត្រូវបាននិយាយ មិនមែនបានបង្ហាញទេ។ `), history ? link(history, say("The history", "ប្រវត្តិ")) : null) : null);
    return card(h("h2", {}, say("How early", "តាំងពីពេលណា")), existed, pub,
        h("p", { class: "fine ex-gap" }, say("The earliest proof covers only the earliest stamped version, and a capture shows a page as it stood that day. Anything added later dates from the first version that contains it. A proof shows a text existed, not that anyone could read it, so the two dates are kept apart.", "ភស្តុតាងដំបូងបំផុតគ្របដណ្តប់តែកំណែដំបូងបំផុតដែលបានបោះត្រាប៉ុណ្ណោះ ហើយការចាប់យកបង្ហាញទំព័រដូចដែលវាមាននៅថ្ងៃនោះ។ អ្វីដែលបានបន្ថែមក្រោយមក មានកាលបរិច្ឆេទពីកំណែដំបូងដែលមានវា។ ភស្តុតាងបង្ហាញថាអត្ថបទមាន មិនមែនថាអ្នកណាម្នាក់អាចអានវាបានទេ ដូច្នេះកាលបរិច្ឆេទទាំងពីរត្រូវបានបំបែកចេញពីគ្នា។")));
}
function versionsCard(d: Doc, x: History) {
    if (!x.proofsRead) return card(h("h2", {}, say("Versions", "កំណែ")), h("p", { role: "status" }, say("Reading the proofs…", "កំពុងអានភស្តុតាង…")));
    if (!x.versions.length) return null;
    const first = earliestOf(x), history = x.repo ? `https://github.com/${x.repo}/commits/${x.branch}/${x.path}` : null;
    const row = (v: Version, i: number) => {
        const a = v.anchor;
        const title = a.time ? say(`Version ${n(i + 1)} · ${date(a.time)}`, `កំណែទី ${n(i + 1)} · ${date(a.time)}`) : say(`Version ${n(i + 1)}`, `កំណែទី ${n(i + 1)}`);
        const el = h("div", { class: "ex-leg ex-ver" }, h("b", { class: a.checked === true ? "ex-ok" : a.checked === false ? "ex-bad" : "" }, title),
            h("span", { class: "ex-chips" }, v === first ? h("span", { class: "pill on" }, say("Earliest proof", "ភស្តុតាងដំបូងបំផុត")) : null, v.digest === d.sha256 ? h("span", { class: "pill on" }, say("Today's text", "អត្ថបទថ្ងៃនេះ")) : null),
            h("p", {}, a.height !== undefined ? link(`https://mempool.space/block/${a.height}`, say(`Block ${n(a.height)}`, `ប្លុក ${n(a.height)}`)) : say("Waiting for a block", "កំពុងរង់ចាំប្លុក"), " · ", h("span", { class: "ex-mono" }, short(v.digest)), " · ", link(viewHref(v.proof), say("The proof", "ភស្តុតាង"))),
            a.checked === false ? h("p", {}, say("This block's header, as mempool.space serves it, doesn't hold this proof.", "ក្បាលប្លុកនេះ ដូចដែល mempool.space ផ្តល់ឱ្យ មិនមានភស្តុតាងនេះទេ។")) : null,
            v.manifest ? h("p", {}, say(`Signed by timestamp authorities in the ${v.manifest} manifest.`, `បានចុះហត្ថលេខាដោយអាជ្ញាធរបោះត្រាពេលវេលានៅក្នុងបញ្ជី ${v.manifest}។`)) : null,
            v.commit ? h("p", {}, link(`https://github.com/${x.repo}/blob/${v.commit}/${x.path}`, say("Read this version", "អានកំណែនេះ")), " · ", link(`https://github.com/${x.repo}/commit/${v.commit}`, say("What changed", "អ្វីដែលបានផ្លាស់ប្តូរ"))) : null);
        if (v === first) el.classList.add("ex-first");
        return el;
    };
    return card(h("h2", {}, say("Versions", "កំណែ")), ...x.versions.map(row),
        h("p", { class: "fine ex-gap" }, say("Each version here was stamped when it was released. Smaller edits between them have no proof of their own. A version's text is linked only when it was found in the repository and hashed here to the same fingerprint. ", "កំណែនីមួយៗនៅទីនេះត្រូវបានបោះត្រានៅពេលចេញផ្សាយ។ ការកែសម្រួលតូចៗរវាងពួកវាមិនមានភស្តុតាងផ្ទាល់ខ្លួនទេ។ អត្ថបទនៃកំណែមួយមានតំណតែនៅពេលវាត្រូវបានរកឃើញក្នុងឃ្លាំង ហើយបានហាសនៅទីនេះទៅស្នាមម្រាមដៃដូចគ្នា។ "), history ? link(history, say("The full history", "ប្រវត្តិទាំងមូល")) : null),
        x.partial ? h("p", { class: "fine" }, say("Some proofs couldn't be read just now, so this list may be short.", "ភស្តុតាងខ្លះមិនអាចអានបានឥឡូវនេះ ដូច្នេះបញ្ជីនេះអាចខ្លី។")) : null,
        x.gitFailed ? h("p", { class: "fine" }, say("GitHub's limit for one network was reached, so the links to each version's text aren't all here. Try again in an hour.", "ដែនកំណត់របស់ GitHub សម្រាប់បណ្តាញមួយត្រូវបានឈានដល់ ដូច្នេះតំណទៅអត្ថបទនៃកំណែនីមួយៗមិនមានទាំងអស់នៅទីនេះទេ។ សូមសាកល្បងម្តងទៀតក្នុងរយៈពេលមួយម៉ោង។")) : null);
}
async function docPage(slug: string) {
    const title = head(say("Corpus", "សារពើភ័ណ្ឌឯកសារ"));
    view.replaceChildren(title, card(h("p", { role: "status" }, say("Reading the index…", "កំពុងអានសន្ទស្សន៍…"))));
    let list: Doc[];
    try { list = await readDocs(); } catch { return cantRead(title); }
    if (route().name !== "doc") return;
    const d = list.find((x) => x.slug === slug);
    if (!d) return view.replaceChildren(title, card(h("p", {}, say("The index has no document by that name.", "សន្ទស្សន៍មិនមានឯកសារដែលមានឈ្មោះនោះទេ។"))), link("/corpus", say("All documents", "ឯកសារទាំងអស់")));
    const waiting = (key: string, t: string) => { const x = leg(null, t, say("Checking…", "កំពុងពិនិត្យ…")); x.dataset.leg = key; return x; };
    const legs = card(h("h2", {}, say("Today's text", "អត្ថបទថ្ងៃនេះ")), waiting("today", say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា")), waiting("btc", "Bitcoin"), waiting("tsa", say("Timestamp authorities", "អាជ្ញាធរបោះត្រាពេលវេលា")),
        d.doi ? leg(null, "Zenodo", link(`https://doi.org/${d.doi}`, d.doi), " · ", d.archive_matches_today ? say("The corpus index says the archived copy matches this text. Compare it yourself at the link.", "សន្ទស្សន៍ឯកសារនិយាយថាច្បាប់ចម្លងដែលបានរក្សាទុកត្រូវនឹងអត្ថបទនេះ។ សូមប្រៀបធៀបដោយខ្លួនឯងតាមតំណ។") : say("The archived copy is an earlier version.", "ច្បាប់ចម្លងដែលបានរក្សាទុកគឺជាកំណែមុន។")) : null,
        leg(null, say("Corpus index", "សន្ទស្សន៍ឯកសារ"), say("corpus.333.eco serves this fingerprint.", "corpus.333.eco ផ្តល់ស្នាមម្រាមដៃនេះ។")));
    const earlyBox = h("div", {}), versionsBox = h("div", {});
    const paint = () => { const x = histories.get(d.slug)?.x; if (!x || route().name !== "doc") return; earlyBox.replaceChildren(howEarly(x)); const v = versionsCard(d, x); if (v) versionsBox.replaceChildren(v); else versionsBox.replaceChildren(); };
    view.replaceChildren(docHead(d, `${genre(d.genre)} · ${date(d.date)} · ${d.licence}`),
        card(h("dl", { class: "ex-kv" }, h("dt", {}, say("Fingerprint (SHA-256)", "ស្នាមម្រាមដៃ (SHA-256)")), h("dd", { class: "ex-mono" }, full(d.sha256)), h("dt", {}, say("Source", "ប្រភព")), h("dd", {}, d.source_url ? link(viewHref(d.source_url), d.path) : d.path)), d.read_at ? h("p", { class: "ex-gap" }, link(/^https?:\/\//.test(d.read_at) ? d.read_at : `https://${d.read_at}`, say("Read it", "អានវា"))) : null),
        earlyBox, versionsBox, legs, tickNote(), card(h("p", {}, say("A timestamp proves when this text existed. It never proves that the text is true.", "ត្រាពេលវេលាបង្ហាញថាអត្ថបទនេះមាននៅពេលណា។ វាមិនដែលបង្ហាញថាអត្ថបទនេះពិតទេ។")), h("p", { class: "fine ex-gap" }, say("Your browser reads this page's dates directly from mempool.space, GitHub, Zenodo and the Internet Archive.", "កម្មវិធីរុករករបស់អ្នកអានកាលបរិច្ឆេទនៃទំព័រនេះដោយផ្ទាល់ពី mempool.space, GitHub, Zenodo និង Internet Archive។"))), link("/corpus", say("All documents", "ឯកសារទាំងអស់")));
    historyOf(d, paint);
    await liveLegs(d, legs);
}

/* ─────────────── Reading a proof file ───────────────
   Three of the files behind the Source links are binary or served as binary, so a browser only downloads them. This reads the same bytes here and says what they hold, beside the original. */
const hexDump = (b: Uint8Array) => { const lines: string[] = []; for (let i = 0; i < b.length; i += 16) lines.push(`${i.toString(16).padStart(6, "0")}  ${hex(b.subarray(i, i + 16)).replace(/(..)/g, "$1 ").trim()}`); return lines.join("\n"); };
const raw = (body: string, open = false) => h("details", open ? { open: true } : {}, h("summary", {}, say("The file itself", "ឯកសារផ្ទាល់")), h("pre", { class: "code ex-raw" }, h("code", {}, body)));
const openOriginal = (src: string) => h("a", { class: "btn ghost", href: src, rel: "noopener" }, say("Open the original", "បើកឯកសារដើម"));
const original = (src: string) => h("a", { class: "btn ghost", href: src, download: "" }, say("Download the original", "ទាញយកឯកសារដើម"));
/** ⛔ Reads only the log's own proof files and the proofs beside the corpus's documents, so this page can't be made to show anything else under this address. */
async function viewable(src: string) {
    let u: URL; try { u = new URL(src); } catch { return null; }
    if (u.protocol !== "https:" || u.search || u.hash) return null;
    if (u.host === "log.333.eco") {
        const ots = /^\/origin\/stamps\/(\d+)\.ots$/.exec(u.pathname), tsr = /^\/origin\/stamps\/(\d+)\.([a-z0-9-]+)\.tsr$/.exec(u.pathname), tile = /^\/origin\/tile\/entries\/((?:x\d{3}\/)*\d{3})(?:\.p\/\d{1,3})?$/.exec(u.pathname);
        const note = /^\/origin\/checkpoint(?:s\/\d+)?$/.test(u.pathname);
        if (note) return { kind: "checkpoint" as const };
        if (ots) return { kind: "ots" as const, size: Number(ots[1]) };
        if (tsr) return { kind: "tsr" as const, size: Number(tsr[1]), authority: tsr[2] };
        if (tile) return { kind: "tile" as const, first: Number(tile[1].replace(/[x/]/g, "")) * 256 };
        return null;
    }
    if (u.host !== "raw.githubusercontent.com") return null;
    const list = await readDocs(), doc = list.find((d) => d.source_url === u.href);
    if (doc) return { kind: "doc" as const, doc };
    return list.some((d) => d.source_url && u.href.startsWith(d.source_url) && /^\.(?:r\d+\.)?ots$/.test(u.href.slice(d.source_url.length))) ? { kind: "ots" as const, size: null } : null;
}
async function viewPage(src: string, entry: number | null) {
    const back = src.startsWith(LOG) ? link("/origin", say("All records", "កំណត់ត្រាទាំងអស់")) : link("/corpus", say("All documents", "ឯកសារទាំងអស់"));
    const title = (lede?: string) => head(say("A proof file", "ឯកសារភស្តុតាង"), lede);
    view.replaceChildren(title(), card(h("p", { role: "status" }, say("Reading the file…", "កំពុងអានឯកសារ…"))));
    const what = await viewable(src).catch(() => null);
    if (!what) return view.replaceChildren(title(), card(leg(false, say("This page can't open that address", "ទំព័រនេះមិនអាចបើកអាសយដ្ឋាននោះបានទេ"), say("It reads only the log's own files, and the published documents and their proofs.", "វាអានតែឯកសាររបស់កំណត់ហេតុ និងឯកសារដែលបានបោះពុម្ព និងភស្តុតាងរបស់វាប៉ុណ្ណោះ។"))), link("/origin", say("All records", "កំណត់ត្រាទាំងអស់")));
    let bytes: Uint8Array;
    try { const r = await fetch(src); if (!r.ok) throw new Error(String(r.status)); bytes = new Uint8Array(await r.arrayBuffer()); }
    catch { return view.replaceChildren(title(), card(leg(null, say("The file can't be read right now", "មិនអាចអានឯកសារបានឥឡូវនេះទេ"), say("Try again in a little while, or download it.", "សូមសាកល្បងម្តងទៀតបន្តិចក្រោយ ឬទាញយកវា។"))), original(src), back); }
    if (what.kind === "checkpoint") {
        const note = text(bytes), got = await checkCheckpoint(note, trust).catch(() => ({ ok: false, why: say("It couldn't be read.", "មិនអាចអានវាបានទេ។") }) as any), [origin, size, root] = note.split("\n");
        const others = Math.max(0, note.slice(note.indexOf("\n\n") + 2).split("\n").filter(Boolean).length - 1);
        return view.replaceChildren(head(say("A checkpoint", "checkpoint"), say("The log's signed statement of how long it is and what its root hash is. Every record it holds leads to that root.", "សេចក្តីថ្លែងដែលបានចុះហត្ថលេខារបស់កំណត់ហេតុអំពីប្រវែងរបស់វា និងហាសឫសរបស់វា។ កំណត់ត្រានីមួយៗដែលវាផ្ទុកនាំទៅឫសនោះ។")),
            card(got.ok ? leg(true, say("The log's signature", "ហត្ថលេខារបស់កំណត់ហេតុ"), say("Checked here against the log's published key.", "បានពិនិត្យនៅទីនេះធៀបនឹងសោដែលបានបោះពុម្ពរបស់កំណត់ហេតុ។")) : leg(false, say("The log's signature", "ហត្ថលេខារបស់កំណត់ហេតុ"), got.why ?? ""),
                h("dl", { class: "ex-kv ex-gap" }, h("dt", {}, say("The log", "កំណត់ហេតុ")), h("dd", { class: "ex-mono" }, origin), h("dt", {}, say("Its size", "ទំហំរបស់វា")), h("dd", {}, count(Number(size), "entry", "entries")), h("dt", {}, say("Its root", "ឫសរបស់វា")), h("dd", { class: "ex-mono" }, root)),
                others ? h("p", { class: "ex-gap" }, say(`The file holds ${count(others, "other signature", "other signatures")}. They aren't counted yet. `, `ឯកសារមានហត្ថលេខាផ្សេងទៀត ${n(others)}។ ពួកវាមិនទាន់ត្រូវបានរាប់ទេ។ `), link("https://origin.333.eco/docs#tree", say("How the log holds together", "របៀបដែលកំណត់ហេតុរក្សាភាពជាប់គ្នា"))) : null, raw(note, true)), tickNote(), openOriginal(src), back);
    }
    if (what.kind === "doc") {
        const d = what.doc, got = hex(await sha256(bytes));
        return view.replaceChildren(docHead(d, say("This document's text, as its public repository holds it.", "អត្ថបទនៃឯកសារនេះ ដូចដែលឃ្លាំងសាធារណៈរបស់វារក្សាទុក។")),
            card(got === d.sha256 ? leg(true, say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា"), say("This text was hashed here just now, and it matches the index.", "អត្ថបទនេះត្រូវបានហាសនៅទីនេះមុននេះបន្តិច ហើយវាត្រូវនឹងសន្ទស្សន៍។")) : leg(null, say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា"), say("This text is newer than the index, or differs from it. The index catches up when a change finishes its chain.", "អត្ថបទនេះថ្មីជាងសន្ទស្សន៍ ឬខុសពីវា។ សន្ទស្សន៍តាមទាន់នៅពេលការផ្លាស់ប្តូរបញ្ចប់ខ្សែសង្វាក់របស់វា។")),
                h("p", { class: "ex-mono ex-gap" }, full(got)), raw(text(bytes), true)), tickNote(), openOriginal(src), link(`/corpus/${d.slug}`, say("Back to its page", "ត្រឡប់ទៅទំព័ររបស់វា")));
    }
    if (what.kind === "tile") {
        const items: { index: number; body: string }[] = [];
        for (let i = 0, at = 0; at + 2 <= bytes.length; i++) { const len = bytes[at] * 256 + bytes[at + 1], one = text(bytes.subarray(at + 2, at + 2 + len)); at += 2 + len; let body = one; try { body = JSON.stringify(JSON.parse(one), null, 2); } catch { /* shown as it is */ } items.push({ index: what.first + i, body }); }
        return view.replaceChildren(title(say("Entries of the public log, as they are stored. Each is signed, and none of them says who signed it.", "ធាតុនៃកំណត់ហេតុសាធារណៈ ដូចដែលបានរក្សាទុក។ ធាតុនីមួយៗត្រូវបានចុះហត្ថលេខា ហើយគ្មានធាតុណាមួយនិយាយថាអ្នកណាបានចុះហត្ថលេខាទេ។")),
            ...items.map((e) => h("div", { class: e.index === entry ? "card ex-first ex-entry" : "card ex-entry" }, h("details", e.index === entry || items.length <= 5 ? { open: true } : {}, h("summary", {}, say(`Entry #${n(e.index)}`, `ធាតុ #${n(e.index)}`)), h("pre", { class: "code ex-raw" }, h("code", {}, e.body))))), original(src), back);
    }
    if (what.kind === "tsr") {
        let got: { ok: boolean; time?: string; why?: string } = { ok: false, why: say("Its checkpoint couldn't be read.", "មិនអាចអាន checkpoint របស់វាបានទេ។") }, body: Uint8Array | null = null;
        try { const note = await logGet(`checkpoints/${what.size}`); if (note) { body = new TextEncoder().encode(checkpointBody(text(note))); got = await checkTimestamp(bytes, body, ((trust as any).tsaRoots?.[what.authority] ?? []).map((r: string) => Uint8Array.from(atob(r), (c) => c.charCodeAt(0)))); } } catch { /* said below */ }
        return view.replaceChildren(title(say("A timestamp token. An outside authority signed the fingerprint of the log's checkpoint, and the time.", "សញ្ញាពេលវេលា។ អាជ្ញាធរខាងក្រៅបានចុះហត្ថលេខាលើស្នាមម្រាមដៃនៃ checkpoint របស់កំណត់ហេតុ និងពេលវេលា។")),
            card(got.ok ? leg(true, say(`${what.authority} signed it`, `${what.authority} បានចុះហត្ថលេខា`), say(`No later than ${when(got.time!)}`, `មិនយឺតជាង ${when(got.time!)}`)) : leg(false, say(`${what.authority} didn't check out`, `${what.authority} មិនឆ្លងការពិនិត្យទេ`), got.why ?? ""),
                h("dl", { class: "ex-kv ex-gap" }, h("dt", {}, say("It covers", "វាគ្របដណ្តប់")), h("dd", {}, link(viewHref(`${LOG}checkpoints/${what.size}`), say(`The checkpoint at ${n(what.size)} entries`, `checkpoint នៅ ${n(what.size)} ធាតុ`))), ...(body ? [h("dt", {}, say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា")), h("dd", { class: "ex-mono" }, full(hex(await sha256(body))))] : [])), raw(hexDump(bytes))), tickNote(), original(src), back);
    }
    const digest = otsDigest(bytes), digestBytes = digest ? Uint8Array.from(digest.match(/../g)!.map((c) => parseInt(c, 16))) : null;
    const seen = digestBytes ? await checkOts(bytes, digestBytes, { header: headerOf }) : { ok: false, why: say("This isn't an OpenTimestamps proof.", "នេះមិនមែនជាភស្តុតាង OpenTimestamps ទេ។") };
    if (!seen.ok) return view.replaceChildren(title(), card(leg(false, say("This proof can't be read", "មិនអាចអានភស្តុតាងនេះបានទេ"), seen.why ?? "")), original(src), back);
    const blocks = new Map<number, { verified: boolean | null; time?: string }>();
    for (const b of seen.bitcoin as { height: number; verified: boolean | null; time?: string }[]) { const had = blocks.get(b.height); if (!had || b.verified === true) blocks.set(b.height, b); }
    return view.replaceChildren(title(say("An OpenTimestamps proof. It holds no text, only the hash steps from a fingerprint up to a Bitcoin block.", "ភស្តុតាង OpenTimestamps។ វាមិនផ្ទុកអត្ថបទទេ មានតែជំហានហាសពីស្នាមម្រាមដៃទៅប្លុក Bitcoin។")),
        card(h("dl", { class: "ex-kv" }, h("dt", {}, say("It covers", "វាគ្របដណ្តប់")), h("dd", {}, what.size === null ? link(viewHref(src.replace(/\.(?:r\d+\.)?ots$/, "")), say("The document", "ឯកសារ")) : link(viewHref(`${LOG}checkpoints/${what.size}`), say(`The checkpoint at ${n(what.size)} entries`, `checkpoint នៅ ${n(what.size)} ធាតុ`))), h("dt", {}, say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា")), h("dd", { class: "ex-mono" }, full(digest!))),
            ...[...blocks].sort((a, b) => a[0] - b[0]).map(([height, b]) => leg(b.verified, "Bitcoin", blockLink(height), b.verified === true ? say(` · mined ${date(b.time!)}`, ` · បានជីកនៅ ${date(b.time!)}`) : b.verified === false ? say(" · this block doesn't hold this proof", " · ប្លុកនេះមិនមានភស្តុតាងនេះទេ") : say(" · the block couldn't be read just now", " · មិនអាចអានប្លុកបានឥឡូវនេះទេ"))),
            ...(seen.pending as string[]).map((c) => leg(null, say("Still waiting", "នៅតែរង់ចាំ"), say(`${c} hasn't reported a block in this copy.`, `${c} មិនទាន់រាយការណ៍ប្លុកក្នុងច្បាប់ចម្លងនេះទេ។`))),
            raw(hexDump(bytes))), tickNote(), original(src), back);
}
async function proofPage(index: number) {
    const title = head(say(`Proof of record #${n(index)}`, `ភស្តុតាងនៃកំណត់ត្រា #${n(index)}`), say("One file with everything needed to check this record offline, with no network and no help from us.", "ឯកសារមួយដែលមានអ្វីៗទាំងអស់ដែលត្រូវការដើម្បីពិនិត្យកំណត់ត្រានេះក្រៅបណ្តាញ ដោយគ្មានបណ្តាញ និងគ្មានជំនួយពីយើង។"));
    view.replaceChildren(title, card(h("p", { role: "status" }, say("Putting the proof together…", "កំពុងរៀបចំភស្តុតាង…"))));
    const back = link(`/origin/${index}`, say(`Record #${n(index)}`, `កំណត់ត្រា #${n(index)}`));
    let pack: any;
    try { pack = await packRecord(logGet, index, trust); } catch (e) { return view.replaceChildren(title, card(leg(false, say("It couldn't be put together", "មិនអាចរៀបចំវាបានទេ"), (e as Error).message)), back); }
    if (route().name !== "proof") return;
    const json = JSON.stringify(pack, null, 2), tokens = Object.keys(pack.stamps?.tsa?.tokens ?? {});
    const download = () => { const a = h("a", { href: URL.createObjectURL(new Blob([json], { type: "application/json" })), download: `b-origin-record-${index}.json` }) as HTMLAnchorElement; a.click(); URL.revokeObjectURL(a.href); };
    const part = (name: string, what: string, body?: string) => h("div", { class: "ex-leg" }, h("b", {}, name), h("p", {}, what), body ? h("pre", { class: "code ex-raw" }, h("code", {}, body)) : null);
    view.replaceChildren(title, card(h("h2", {}, say("What's in it", "អ្វីដែលមានក្នុងនោះ")),
        part(say("The entry", "ធាតុ"), say("The record itself.", "កំណត់ត្រាផ្ទាល់។"), JSON.stringify(pack.entry, null, 2)),
        part(say("The checkpoint", "checkpoint"), say("The log's signed size and root.", "ទំហំ និងឫសដែលបានចុះហត្ថលេខារបស់កំណត់ហេតុ។"), pack.checkpoint),
        part(say("The path", "ផ្លូវ"), pack.inclusion.length ? say(`${count(pack.inclusion.length, "hash leads", "hashes lead")} from this entry to that root.`, `${n(pack.inclusion.length)} ហាសនាំពីធាតុនេះទៅឫសនោះ។`) : say("It's the only entry so far, so it is the root.", "វាជាធាតុតែមួយគត់រហូតមកដល់ពេលនេះ ដូច្នេះវាជាឫស។"), pack.inclusion.join("\n") || undefined),
        pack.stamps?.tsa ? part(say("Timestamp tokens", "សញ្ញាពេលវេលា"), say(`From ${tokens.join(", ")}, on the checkpoint at ${n(pack.stamps.tsa.size)} entries.`, `ពី ${tokens.join(", ")} លើ checkpoint នៅ ${n(pack.stamps.tsa.size)} ធាតុ។`)) : null,
        pack.stamps?.ots ? part(say("The Bitcoin proof", "ភស្តុតាង Bitcoin"), say(`On the checkpoint at ${n(pack.stamps.ots.size)} entries.`, `លើ checkpoint នៅ ${n(pack.stamps.ots.size)} ធាតុ។`)) : null,
        raw(json)),
        card(h("h2", {}, say("Check it yourself", "ពិនិត្យដោយខ្លួនឯង")), code(`npx @333eco/origin-verify check b-origin-record-${index}.json`), h("button", { type: "button", class: "btn ghost", onclick: download }, say("Download this record's proof", "ទាញយកភស្តុតាងកំណត់ត្រានេះ"))), back);
}

/* ─────────────── The gratitude ledger ───────────────
   ⛔ Proofs only (ledger SPEC §4.4): who thanked whom, what and how much are never here, and nothing on this page can reach a row.
   ⛔ No rate and no count of thanks: the size is padded every day, so it says only that the ledger ran. DRAFT Khmer (ours). */
const LEDGER = "https://log.333.eco/ledger/";
const ledgerGet = async (p: string) => { const r = await fetch(LEDGER + p); if (r.status === 404) return null; if (!r.ok) throw new Error(String(r.status)); return new Uint8Array(await r.arrayBuffer()); };
const enc = (s: string) => new TextEncoder().encode(s);
const join = (...parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((a, b) => a + b.length, 0)); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const hashTile = (t: number, width?: number) => { let s = "", v = t, first = true; do { const part = String(v % 1000).padStart(3, "0"); s = (first ? part : `x${part}/`) + s; first = false; v = Math.floor(v / 1000); } while (v > 0); return `tile/0/${s}${width ? `.p/${width}` : ""}`; };
/** DER ECDSA → the raw r‖s WebCrypto verifies. */
function derToRaw(der: Uint8Array) {
    let i = 2; const part = () => { if (der[i++] !== 0x02) throw new Error("not ECDSA"); const len = der[i++]; let v = der.subarray(i, i + len); i += len; while (v.length > 32 && v[0] === 0) v = v.subarray(1); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
    if (der[0] !== 0x30) throw new Error("not ECDSA"); return join(part(), part());
}
interface PublicEntry { index: number; t: string; n?: number; start?: string; end?: string; rulesHash?: string; day?: string; hash?: string; at?: string }
interface LedgerRead { ok: boolean; why?: string; size: number; body: string; entries: Uint8Array[]; pub: PublicEntry[]; placed: boolean; stamps: { tsa?: number[]; ots?: number[] } }
let ledgerCache: LedgerRead | null = null;
async function readLedger(): Promise<LedgerRead> {
    if (ledgerCache) return ledgerCache;
    const fail = (why: string): LedgerRead => ({ ok: false, why, size: 0, body: "", entries: [], pub: [], placed: false, stamps: {} });
    try {
        const note = await ledgerGet("checkpoint");
        if (!note) return fail(say("No checkpoint has been published yet.", "មិនទាន់មាន checkpoint បោះពុម្ពនៅឡើយទេ។"));
        const cp = await checkCheckpoint(text(note), ledgerTrust);
        if (!cp.ok) return fail(cp.why);
        const entries: Uint8Array[] = await readEntries(ledgerGet, cp.size), leaves: Uint8Array[] = entries.map(hashLeaf);
        if (!same(treeRoot(leaves), cp.root)) return fail(say("The entries do not produce the checkpoint's root.", "ធាតុទាំងនេះមិនបង្កើតឫសរបស់ checkpoint ទេ។"));
        for (let t = 0; t * 256 < cp.size; t++) {
            const width = t * 256 + 256 <= cp.size ? undefined : cp.size % 256, tile = await ledgerGet(hashTile(t, width));
            if (!tile || !same(tile, join(...leaves.slice(t * 256, t * 256 + (width ?? 256))))) return fail(say(`Hash tile ${t} does not match the entries.`, `ក្រឡាហាស ${t} មិនត្រូវនឹងធាតុទេ។`));
        }
        const pub: PublicEntry[] = [];
        for (const [index, e] of entries.entries()) {
            if (e.length === 32) continue;
            const nul = e.indexOf(0), tag = text(e.subarray(0, nul)), m = /^ledger\/(season|jubilee|reads)\/v1$/.exec(tag);
            if (nul < 0 || !m) return fail(say(`Entry ${index} is neither a sealed fingerprint nor a public entry.`, `ធាតុ ${index} មិនមែនជាស្នាមម្រាមដៃបិទត្រា ឬធាតុសាធារណៈទេ។`));
            pub.push({ index, ...JSON.parse(text(e.subarray(nul + 1))) });
        }
        const at = new Set(pub.map((x) => x.index)), placed = pub.every((x) => x.index === 0 || at.has(x.index + 1) || (x.index + 1) % 256 === 0);
        const idx = await ledgerGet("stamps/index.json");
        ledgerCache = { ok: true, size: cp.size, body: cp.body, entries, pub, placed, stamps: idx ? JSON.parse(text(idx)) : {} };
        return ledgerCache;
    } catch (e) { return fail((e as Error).message); }
}
async function checkReceipt(raw: string, l: LedgerRead): Promise<Node> {
    let r: { index: number; seal: string; at: string; origin: string; sig: string };
    try { r = JSON.parse(raw); if (!Number.isSafeInteger(r.index) || typeof r.seal !== "string" || typeof r.sig !== "string" || typeof r.at !== "string") throw 0; }
    catch { return leg(false, say("That isn't a receipt", "នោះមិនមែនជាបង្កាន់ដៃទេ"), say("Paste the receipt exactly as your export gives it.", "សូមបិទភ្ជាប់បង្កាន់ដៃឲ្យដូចដែលការនាំចេញរបស់អ្នកផ្តល់ឲ្យ។")); }
    if (r.origin !== ledgerTrust.origin) return leg(false, say("This receipt is for another log", "បង្កាន់ដៃនេះសម្រាប់កំណត់ហេតុផ្សេង"), String(r.origin ?? ""));
    const seal = unb64(r.seal), idx = new Uint8Array(8); new DataView(idx.buffer).setBigUint64(0, BigInt(r.index));
    let signed = false;
    try {
        const key = await crypto.subtle.importKey("spki", unb64(ledgerTrust.receiptKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        signed = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(unb64(r.sig)), join(enc("ledger/receipt/v1\0"), enc(r.origin), new Uint8Array([0]), idx, seal, enc(r.at)));
    } catch { signed = false; }
    const inTree = r.index < l.size ? same(l.entries[r.index], seal) : null;
    return h("div", {}, leg(signed, signed ? say("The ledger signed this receipt", "បញ្ជីបានចុះហត្ថលេខាលើបង្កាន់ដៃនេះ") : say("This signature does not verify", "ហត្ថលេខានេះមិនត្រឹមត្រូវទេ"), say("Checked here against the ledger's published receipt key.", "បានពិនិត្យនៅទីនេះធៀបនឹងសោបង្កាន់ដៃដែលបានបោះពុម្ពរបស់បញ្ជី។")),
        inTree === null ? leg(null, say("Not in a published checkpoint yet", "មិនទាន់នៅក្នុង checkpoint ដែលបានបោះពុម្ពទេ"), say("The ledger closes once a day. The next close publishes it.", "បញ្ជីបិទម្តងក្នុងមួយថ្ងៃ។ ការបិទបន្ទាប់នឹងបោះពុម្ពវា។"))
            : leg(inTree, inTree ? say("It is in the ledger", "វានៅក្នុងបញ្ជី") : say("It is NOT at that place in the ledger", "វាមិននៅកន្លែងនោះក្នុងបញ្ជីទេ"), say(`Entry ${n(r.index)} was compared with this fingerprint, and the root above was rebuilt from every entry.`, `ធាតុ ${n(r.index)} ត្រូវបានប្រៀបធៀបនឹងស្នាមម្រាមដៃនេះ ហើយឫសខាងលើត្រូវបានសាងសង់ឡើងវិញពីធាតុទាំងអស់។`)));
}
async function ledgerStamps(l: LedgerRead, into: HTMLElement) {
    const s = Math.max(0, ...(l.stamps.tsa ?? []), ...(l.stamps.ots ?? []));
    if (!s) return into.replaceChildren(leg(null, say("Not stamped yet", "មិនទាន់បោះត្រា"), say("The ledger is stamped once a day.", "បញ្ជីត្រូវបានបោះត្រាម្តងក្នុងមួយថ្ងៃ។")));
    const note = await ledgerGet(`checkpoints/${s}`), body = note ? enc(checkpointBody(text(note))) : null, rows: Node[] = [];
    if (!body) return into.replaceChildren(leg(false, say("The stamped checkpoint can't be read", "មិនអាចអាន checkpoint ដែលបានបោះត្រាបានទេ"), ""));
    for (const [name, roots] of Object.entries((trust as any).tsaRoots ?? {})) {
        const tsr = await ledgerGet(`stamps/${s}.${name}.tsr`);
        if (!tsr) continue;
        const got = await checkTimestamp(tsr, body, (roots as string[]).map(unb64)).catch(() => ({ ok: false }));
        rows.push(got.ok ? leg(true, say(`${name} signed it`, `${name} បានចុះហត្ថលេខា`), say(`No later than ${when(got.time)}`, `មិនយឺតជាង ${when(got.time)}`)) : leg(false, say(`${name}'s token does not verify`, `សញ្ញារបស់ ${name} មិនត្រឹមត្រូវទេ`), ""));
    }
    const ots = await ledgerGet(`stamps/${s}.ots`);
    if (ots) {
        const a = await anchorOf(ots, new Uint8Array(await crypto.subtle.digest("SHA-256", body)));
        rows.push(a.height !== undefined ? leg(a.checked, "Bitcoin", blockLink(a.height), a.time ? say(` · no later than ${when(a.time)}`, ` · មិនយឺតជាង ${when(a.time)}`) : "")
            : leg(null, "Bitcoin", say("Waiting for a block. This takes a few hours.", "កំពុងរង់ចាំប្លុក។ វាចំណាយពេលពីរបីម៉ោង។")));
    }
    into.replaceChildren(h("p", {}, say(`The ledger's state at ${count(s, "entry", "entries")} was timestamped outside our control:`, `ស្ថានភាពនៃបញ្ជីនៅ ${n(s)} ធាតុ ត្រូវបានបោះត្រាពេលវេលានៅក្រៅការគ្រប់គ្រងរបស់យើង៖`)), ...rows);
}
async function ledgerPage() {
    const title = head(say("Gratitude ledger", "បញ្ជីការដឹងគុណ"), say("Thanks are private. This page shows only the proofs that the ledger is whole and has never been rewritten, and every check runs in your browser.", "ការអរគុណគឺជាឯកជន។ ទំព័រនេះបង្ហាញតែភស្តុតាងថាបញ្ជីនៅពេញលេញ ហើយមិនដែលត្រូវបានសរសេរឡើងវិញ ហើយការពិនិត្យទាំងអស់ដំណើរការក្នុងកម្មវិធីរុករករបស់អ្នក។"));
    view.replaceChildren(title, card(h("p", { role: "status" }, say("Reading and checking the ledger…", "កំពុងអាន និងពិនិត្យបញ្ជី…"))));
    const l = await readLedger();
    if (route().name !== "ledger") return;
    if (!l.ok) return view.replaceChildren(title, card(leg(false, say("The ledger didn't pass its check", "បញ្ជីមិនបានឆ្លងការពិនិត្យទេ"), say("Or it can't be read right now, so nothing from it is shown. ", "ឬមិនអាចអានបានឥឡូវនេះ ដូច្នេះគ្មានអ្វីពីវាត្រូវបានបង្ហាញទេ។ "), l.why ?? "")));
    const ended = new Map(l.pub.filter((e) => e.t === "jubilee").map((e) => [e.n!, e.at!]));
    const stampsBox = h("div", {}, h("p", { role: "status" }, say("Checking the outside clocks…", "កំពុងពិនិត្យនាឡិកាខាងក្រៅ…")));
    const ta = h("textarea", { rows: "4", class: "ex-receipt", "aria-label": say("A receipt", "បង្កាន់ដៃ"), placeholder: '{"index": …, "seal": "…", "at": "…", "origin": "log.333.eco/ledger", "sig": "…"}' }) as HTMLTextAreaElement, out = h("div", { role: "status" });
    const lastReads = l.pub.filter((e) => e.t === "reads").slice(-1)[0];
    view.replaceChildren(title,
        card(leg(true, say("Its signature, its tree and every entry, checked", "ហត្ថលេខា ដើមឈើ និងធាតុទាំងអស់របស់វា បានពិនិត្យ"), say(`Signed with the ledger's published key, and its root rebuilt here from all ${count(l.size, "entry", "entries")}. Each entry is a sealed 32-byte fingerprint, or one of the few public entries below. The size is padded every day, so it says only that the ledger ran.`, `ចុះហត្ថលេខាដោយសោដែលបានបោះពុម្ពរបស់បញ្ជី ហើយឫសរបស់វាត្រូវបានសាងសង់ឡើងវិញនៅទីនេះពីធាតុទាំង ${n(l.size)}។ ធាតុនីមួយៗជាស្នាមម្រាមដៃ 32 បៃដែលបានបិទត្រា ឬជាធាតុសាធារណៈមួយក្នុងចំណោមធាតុខាងក្រោម។ ទំហំត្រូវបានបំពេញរៀងរាល់ថ្ងៃ ដូច្នេះវាប្រាប់តែថាបញ្ជីបានដំណើរការ។`)),
            leg(l.placed, l.placed ? say("Public entries close their day", "ធាតុសាធារណៈបិទថ្ងៃរបស់វា") : say("A public entry is out of place", "ធាតុសាធារណៈមួយនៅខុសកន្លែង"), say("Each sits at the end of its day's entries, so where it falls says nothing about how many thanks came before it.", "ធាតុនីមួយៗនៅចុងធាតុនៃថ្ងៃរបស់វា ដូច្នេះទីតាំងរបស់វាមិនប្រាប់ពីចំនួនការអរគុណមុនវាទេ។"))),
        card(h("h2", {}, say("Seasons", "រដូវ")), ...l.pub.filter((e) => e.t === "season").map((e) => h("div", { class: "ex-leg" },
            h("b", {}, say(`Season ${e.n}`, `រដូវ ${e.n}`)), h("p", {}, say(`Opens ${when(e.start!)} · ends ${when(e.end!)}`, `បើក ${when(e.start!)} · បញ្ចប់ ${when(e.end!)}`)),
            h("p", {}, say("Its rule was committed here before anyone thanked under it. The rule's fingerprint:", "ច្បាប់របស់វាត្រូវបានប្តេជ្ញានៅទីនេះ មុនពេលនរណាម្នាក់អរគុណក្រោមវា។ ស្នាមម្រាមដៃរបស់ច្បាប់៖")), h("p", { class: "ex-mono" }, e.rulesHash!),
            ended.has(e.n!) ? h("p", {}, say(`It ended and reset on ${when(ended.get(e.n!)!)}. Nothing was deleted: the reset is an entry here.`, `វាបានបញ្ចប់ ហើយកំណត់ឡើងវិញនៅ ${when(ended.get(e.n!)!)}។ គ្មានអ្វីត្រូវបានលុបទេ៖ ការកំណត់ឡើងវិញគឺជាធាតុមួយនៅទីនេះ។`)) : null))),
        card(h("h2", {}, say("Outside clocks", "នាឡិកាខាងក្រៅ")), stampsBox),
        lastReads ? card(h("h2", {}, say("Who opened the rows", "អ្នកណាបានបើកជួរ")), h("p", {}, say(`The ledger keeps a record of every time it opens a private row, and each day that record is locked away and its fingerprint is put here, so it can't be changed later. The latest is for ${date(lastReads.day!)}.`, `បញ្ជីរក្សាកំណត់ត្រារាល់ពេលដែលវាបើកជួរឯកជន ហើយរៀងរាល់ថ្ងៃកំណត់ត្រានោះត្រូវបានចាក់សោ ហើយស្នាមម្រាមដៃរបស់វាត្រូវបានដាក់នៅទីនេះ ដូច្នេះវាមិនអាចផ្លាស់ប្តូរនៅពេលក្រោយបានទេ។ ចុងក្រោយគឺសម្រាប់ ${date(lastReads.day!)}។`))) : null,
        card(h("h2", {}, say("Check a receipt", "ពិនិត្យបង្កាន់ដៃ")), h("p", {}, say("Paste a receipt from your own export. It is checked on this device and never sent anywhere.", "បិទភ្ជាប់បង្កាន់ដៃពីការនាំចេញរបស់អ្នក។ វាត្រូវបានពិនិត្យនៅលើឧបករណ៍នេះ ហើយមិនដែលផ្ញើទៅកន្លែងណាទេ។")),
            h("form", { onsubmit: async (e: Event) => { e.preventDefault(); out.replaceChildren(await checkReceipt(ta.value, l)); } }, ta, h("button", { class: "btn", type: "submit" }, say("Check", "ពិនិត្យ"))), out),
        card(h("h2", {}, say("What is never shown here", "អ្វីដែលមិនដែលបង្ហាញនៅទីនេះ")), h("p", {}, say("Who thanked whom, what was given, or how much, or how often anyone thanks. Each entry is sealed before it is counted, and only its sealed fingerprint enters the tree.", "អ្នកណាអរគុណអ្នកណា អ្វីដែលបានផ្ដល់ ឬចំនួនប៉ុន្មាន ឬញឹកញាប់ប៉ុណ្ណា។ ធាតុនីមួយៗត្រូវបានបិទត្រាមុនពេលរាប់ មានតែស្នាមម្រាមដៃដែលបានបិទត្រាប៉ុណ្ណោះចូលក្នុងដើមឈើ។"))),
        card(h("h2", {}, say("Check it yourself, without us", "ពិនិត្យដោយខ្លួនឯង ដោយមិនត្រូវការយើង")), h("p", {}, say("Everything here is public at ", "អ្វីៗទាំងអស់នៅទីនេះជាសាធារណៈនៅ "), link(LEDGER + "checkpoint", "log.333.eco/ledger"), say(". The ledger's key:", "។ សោរបស់បញ្ជី៖")), h("p", { class: "ex-mono" }, ledgerTrust.logVkey)),
        tickNote());
    await ledgerStamps(l, stampsBox);
}

/* ─────────────── Pages ─────────────── */
function route(): { name: "origin" } | { name: "ledger" } | { name: "record"; index: number } | { name: "proof"; index: number } | { name: "view"; src: string; entry: number | null } | { name: "corpus" } | { name: "doc"; slug: string } {
    const p = location.pathname.replace(/\/+$/, "");
    const rec = /^\/origin\/(\d{1,12})$/.exec(p), doc = /^\/corpus\/([a-z0-9-]+)$/.exec(p);
    const prf = /^\/origin\/(\d{1,12})\/proof$/.exec(p);
    if (prf) return { name: "proof", index: Number(prf[1]) };
    if (p === "/view") { const q = new URLSearchParams(location.search), e = q.get("entry"); return { name: "view", src: q.get("src") ?? "", entry: e && /^\d{1,12}$/.test(e) ? Number(e) : null }; }
    if (rec) return { name: "record", index: Number(rec[1]) };
    if (doc) return { name: "doc", slug: doc[1] };
    if (p === "/ledger") return { name: "ledger" };
    return p === "/corpus" ? { name: "corpus" } : { name: "origin" };
}
function paint() {
    const r = route(), area = r.name === "ledger" ? "ledger" : r.name === "corpus" || r.name === "doc" || (r.name === "view" && !r.src.startsWith(LOG)) ? "corpus" : "origin";
    document.querySelectorAll<HTMLElement>("[data-nav]").forEach((a) => { if (a.dataset.nav === area) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.title = r.name === "ledger" ? `${say("Gratitude ledger", "បញ្ជីការដឹងគុណ")} · explorer.333.eco` : `${r.name === "view" ? say("A source file", "ឯកសារប្រភព") : r.name === "proof" ? say(`Proof of record #${r.index}`, `ភស្តុតាងនៃកំណត់ត្រា #${r.index}`) : r.name === "record" ? say(`Record #${r.index}`, `កំណត់ត្រា #${r.index}`) : area === "corpus" ? say("Corpus", "សារពើភ័ណ្ឌឯកសារ") : say("Records", "កំណត់ត្រា")} · B-Explorer`;
    const run = r.name === "ledger" ? ledgerPage() : r.name === "view" ? viewPage(r.src, r.entry) : r.name === "proof" ? proofPage(r.index) : r.name === "record" ? recordPage(r.index) : r.name === "doc" ? docPage(r.slug) : r.name === "corpus" ? corpusPage() : originPage();
    run.catch((e) => view.replaceChildren(card(leg(false, say("That didn't work", "វាមិនដំណើរការទេ"), String(e.message ?? e)))));
}
function nav(path: string) { history.pushState(null, "", path); window.scrollTo(0, 0); found = null; searchNote = ""; paint(); }
document.addEventListener("click", (e) => {
    const a = (e.target as Element).closest?.("a");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.hasAttribute("download") || a.origin !== location.origin) return;
    e.preventDefault(); nav(a.pathname + a.search);
});
window.addEventListener("popstate", paint);
const langs = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-lang]"));
const showLang = () => langs.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === document.documentElement.lang)));
langs.forEach((x) => x.addEventListener("click", () => { document.documentElement.lang = x.dataset.lang!; try { localStorage.setItem("hb_lang", x.dataset.lang!); } catch { /* the choice just isn't kept */ } showLang(); paint(); }));
showLang();
document.getElementById("share")?.addEventListener("click", async () => {
    const data = { title: document.title, url: location.href };
    try { if (navigator.share) return await navigator.share(data); await navigator.clipboard.writeText(location.href); const b = document.getElementById("share")!; const was = b.innerHTML; b.textContent = say("Copied", "បានចម្លង"); setTimeout(() => { b.innerHTML = was; }, 1500); } catch { /* they closed the sheet */ }
});
paint();
