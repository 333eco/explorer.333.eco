/**
 * explorer.333.eco: read-only. ⭐ Everything shown is read from the public log or a public repository and checked here, in the reader's browser, so trusting this host isn't required. A check that can't run says so; it is never shown as passed.
 * ⛔ No ranking, no counters that climb, no rates. ⛔ No word about outside witnesses until they exist (A515). The gratitude ledger's page waits for the ledger. DRAFT Khmer (ours).
 */
// @ts-expect-error the published verifier ships no types
import { auditLog, checkOts, findRecords, packRecord, readEntries, verifyPack } from "@333eco/origin-verify";
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
const date = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleDateString(document.documentElement.lang, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }); };
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
const blockLink = (height: number) => h("a", { class: "ex-block", href: `https://mempool.space/block/${height}`, rel: "noopener" }, say(`Block ${n(height)}`, `ប្លុក ${n(height)}`));
const code = (s: string) => h("pre", { class: "code" }, h("code", {}, s));

/* ─────────────── B-Origin records ─────────────── */
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
        card(leg(true, say(`${count(l.size, "entry", "entries")}, all checked`, `${n(l.size)} ធាតុ បានពិនិត្យទាំងអស់`), say("The log's signature, its tree, and each entry's signature were checked in your browser.", "ហត្ថលេខារបស់កំណត់ហេតុ មែកធាងរបស់វា និងហត្ថលេខារបស់ធាតុនីមួយៗត្រូវបានពិនិត្យក្នុងកម្មវិធីរុករករបស់អ្នក។"))),
        card(h("h2", {}, say("Records, newest first", "កំណត់ត្រា ថ្មីបំផុតមុន")), h("div", { class: "ex-scroll" }, h("table", { class: "ex-table" },
            h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, say("Signed (UTC)", "បានចុះហត្ថលេខា (UTC)")), h("th", {}, say("How it was made", "របៀបបង្កើត")), h("th", {}, say("File fingerprint", "ស្នាមម្រាមដៃឯកសារ")))),
            h("tbody", {}, ...page.map((e) => h("tr", {}, h("td", {}, link(`/origin/${e.index}`, n(e.index))), h("td", {}, date(e.witnessedAt ?? "")), h("td", {}, label(e.claim!.source), withdrawn.has(e.index) ? h("div", { class: "fine" }, say("Withdrawn by the signer", "អ្នកចុះហត្ថលេខាបានដកចេញ")) : null), h("td", { class: "ex-mono" }, short(e.claim!.sha256))))))),
            recs.length > shown ? h("button", { type: "button", class: "btn ghost ex-more ex-gap", onclick: () => { shown += PAGE; paint(); } }, say("Show more", "បង្ហាញបន្ថែម")) : null),
        stamped.length ? card(h("h2", {}, say("Sealed by outside clocks", "បានបិទត្រាដោយនាឡិកាខាងក្រៅ")), h("p", {}, say("At these sizes the log's state was also timestamped outside our control. Open a record to check its own.", "នៅទំហំទាំងនេះ ស្ថានភាពកំណត់ហេតុក៏ត្រូវបានបោះត្រាពេលវេលានៅក្រៅការគ្រប់គ្រងរបស់យើង។ បើកកំណត់ត្រាដើម្បីពិនិត្យរបស់វា។")),
            ...stamped.map((s) => h("p", { class: "fine" }, say(`${count(s, "entry", "entries")}: `, `${n(s)} ធាតុ៖ `), [(l.stamps.tsa ?? []).includes(s) ? say("timestamp authorities", "អាជ្ញាធរបោះត្រាពេលវេលា") : "", (l.stamps.ots ?? []).includes(s) ? "Bitcoin" : ""].filter(Boolean).join(" · ")))) : null,
        card(h("h2", {}, say("Check it yourself, without us", "ពិនិត្យដោយខ្លួនឯង ដោយមិនត្រូវការយើង")), h("p", {}, say("This page and the free verifier run the same code. Nothing about it needs this site.", "ទំព័រនេះ និងកម្មវិធីផ្ទៀងផ្ទាត់ឥតគិតថ្លៃដំណើរការកូដដូចគ្នា។ គ្មានអ្វីត្រូវការគេហទំព័រនេះទេ។")), code("npx @333eco/origin-verify record 0"), link("https://origin.333.eco/docs#check", say("How checking works", "របៀបពិនិត្យ"))));
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
        out = await verifyPack(pack, trust);
    } catch (e) { return fail(say("This record couldn't be checked", "មិនអាចពិនិត្យកំណត់ត្រានេះបានទេ"), (e as Error).message); }
    if (route().name !== "record") return;
    if (!out.ok) return fail(say("This record didn't pass its check", "កំណត់ត្រានេះមិនបានឆ្លងការពិនិត្យទេ"), out.why);
    const e: Entry = pack.entry, c = e.claim, gone = withdrawnOf(l).get(index);
    if (e.t !== "record" || !c) return view.replaceChildren(title, card(e.t === "withdraw" ? h("p", {}, say("This entry withdraws record ", "ធាតុនេះដកកំណត់ត្រា "), link(`/origin/${e.target}`, `#${e.target}`)) : h("p", {}, say("This entry holds no record.", "ធាតុនេះមិនមានកំណត់ត្រាទេ។"))));
    const row = (a: string, b: Kid, mono = false) => [h("dt", {}, a), h("dd", mono ? { class: "ex-mono" } : {}, b)];
    const download = () => { const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" })), download: `b-origin-record-${index}.json` }) as HTMLAnchorElement; a.click(); URL.revokeObjectURL(a.href); };
    view.replaceChildren(head(say(`Record #${n(index)}`, `កំណត់ត្រា #${n(index)}`)),
        gone ? card(h("p", {}, say(`The signer withdrew this on ${date(gone)}. It stays in the log, marked as withdrawn.`, `អ្នកចុះហត្ថលេខាបានដកវាចេញនៅ ${date(gone)}។ វានៅក្នុងកំណត់ហេតុ ដោយមានសម្គាល់ថាបានដកចេញ។`))) : null,
        card(h("dl", { class: "ex-kv" }, ...row(say("Signed with", "បានចុះហត្ថលេខាដោយ"), say("a HeartBank® passkey", "passkey HeartBank®")), ...row(say("When", "ពេលណា"), when(e.witnessedAt!)), ...row(say("How it was made", "របៀបបង្កើត"), label(c.source)),
            ...(c.rights ? row(say("Shared under", "ចែករំលែកក្រោម"), c.rights) : []), ...row(say("Signed through", "ចុះហត្ថលេខាតាមរយៈ"), c.tool, true), ...row(say("File fingerprint", "ស្នាមម្រាមដៃឯកសារ"), full(c.sha256), true))),
        card(h("h2", {}, say("Checked in your browser", "បានពិនិត្យក្នុងកម្មវិធីរុករករបស់អ្នក")),
            leg(true, say("The signature on this entry", "ហត្ថលេខាលើធាតុនេះ")), leg(true, say("It is in the log", "វានៅក្នុងកំណត់ហេតុ"), pack.inclusion.length ? say(`${count(pack.inclusion.length, "hash leads", "hashes lead")} from this entry to the log's signed root.`, `${n(pack.inclusion.length)} ហាសនាំពីធាតុនេះទៅឫសដែលបានចុះហត្ថលេខារបស់កំណត់ហេតុ។`) : say("It's the only entry so far, so it is the log's signed root.", "វាជាធាតុតែមួយគត់រហូតមកដល់ពេលនេះ ដូច្នេះវាជាឫសដែលបានចុះហត្ថលេខារបស់កំណត់ហេតុ។")),
            ...out.timestamped.map((t: { authority: string; noLaterThan: string }) => leg(true, say(`Timestamp: ${t.authority}`, `ត្រាពេលវេលា៖ ${t.authority}`), say(`No later than ${when(t.noLaterThan)}`, `មិនយឺតជាង ${when(t.noLaterThan)}`))),
            ...out.timestampFailures.map((t: { authority: string; why: string }) => leg(false, say(`Timestamp: ${t.authority}`, `ត្រាពេលវេលា៖ ${t.authority}`), t.why)),
            ...out.bitcoin.map((b: { height: number; time: number }) => leg(true, "Bitcoin", blockLink(b.height))),
            ...(out.bitcoinUnchecked ?? []).map((height: number) => leg(null, "Bitcoin", blockLink(height), say("The proof names this block. This page doesn't fetch Bitcoin blocks, so the verifier below checks it.", "ភស្តុតាងដាក់ឈ្មោះប្លុកនេះ។ ទំព័រនេះមិនទាញយកប្លុក Bitcoin ទេ ដូច្នេះកម្មវិធីផ្ទៀងផ្ទាត់ខាងក្រោមពិនិត្យវា។"))),
            (out.bitcoinPending?.length ?? 0) > 0 ? leg(null, "Bitcoin", say("Waiting for a block. This takes a few hours.", "កំពុងរង់ចាំប្លុក។ វាចំណាយពេលពីរបីម៉ោង។")) : null,
            !pack.stamps?.ots ? leg(null, "Bitcoin", say("The log is stamped to Bitcoin once a day, and this record joins the next stamp. A few hours later that proof reaches a block.", "កំណត់ហេតុត្រូវបានបោះត្រាទៅ Bitcoin ម្តងក្នុងមួយថ្ងៃ ហើយកំណត់ត្រានេះចូលរួមក្នុងការបោះត្រាបន្ទាប់។ ពីរបីម៉ោងក្រោយមក ភស្តុតាងនោះទៅដល់ប្លុក។")) : null),
        card(h("h2", {}, say("What a record can't show", "អ្វីដែលកំណត់ត្រាមិនអាចបង្ហាញបាន")), h("p", {}, say("Who imagined the work. A record shows only who signed it, and when.", "អ្នកណាបានគិតស្នាដៃនេះ។ កំណត់ត្រាបង្ហាញតែអ្នកណាបានចុះហត្ថលេខា និងពេលណាប៉ុណ្ណោះ។"))),
        card(h("h2", {}, say("Check it yourself", "ពិនិត្យដោយខ្លួនឯង")), code(`npx @333eco/origin-verify record ${index}`), h("button", { type: "button", class: "btn ghost", onclick: download }, say("Download this record's proof", "ទាញយកភស្តុតាងកំណត់ត្រានេះ"))),
        link("/origin", say("All records", "កំណត់ត្រាទាំងអស់")));
}

/* ─────────────── Corpus ─────────────── */
interface Doc { slug: string; title: string; genre: string; date: string; repo: string; path: string; licence: string; sha256: string; doi: string | null; archive_matches_today: boolean | null; opentimestamps: boolean; source_url: string | null; read_at: string | null }
let docs: Doc[] | null = null, filter = "", shownDocs = PAGE;
const GENRES: Record<string, [string, string]> = { "defensive-publications": ["Defensive publication", "ការបោះពុម្ពការពារ"], essays: ["Essay", "អត្ថបទ"], positions: ["Position", "ជំហរ"], "white-papers": ["White paper", "ឯកសារស"], letters: ["Letter", "លិខិត"], program: ["Program", "កម្មវិធី"], about: ["About", "អំពី"] };
const genre = (g: string) => GENRES[g]?.[isKm() ? 1 : 0] ?? g;
async function readDocs() {
    if (docs) return docs;
    const r = await fetch(INDEX);
    if (!r.ok) throw new Error(String(r.status));
    docs = ((await r.json()).documents as Doc[]).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title));
    return docs;
}
const cantRead = (title: Node) => view.replaceChildren(title, card(leg(false, say("The corpus index can't be read right now", "មិនអាចអានសន្ទស្សន៍ឯកសារបានឥឡូវនេះទេ"), say("Try again in a little while.", "សូមសាកល្បងម្តងទៀតបន្តិចក្រោយ។"))));
async function corpusPage() {
    const title = head(say("Corpus", "សារពើភ័ណ្ឌឯកសារ"), say("Every paper and essay is timestamped when its text changes, so anyone can check that today's text is the text that was published.", "ឯកសារ និងអត្ថបទនីមួយៗត្រូវបានបោះត្រាពេលវេលានៅពេលអត្ថបទរបស់វាផ្លាស់ប្តូរ ដូច្នេះអ្នកណាក៏អាចពិនិត្យថាអត្ថបទថ្ងៃនេះគឺជាអត្ថបទដែលបានបោះពុម្ព។"));
    if (!docs) view.replaceChildren(title, card(h("p", { role: "status" }, say("Reading the index…", "កំពុងអានសន្ទស្សន៍…"))));
    let list: Doc[];
    try { list = await readDocs(); } catch { return cantRead(title); }
    if (route().name !== "corpus") return;
    const box = h("div", {}), input = h("input", { type: "search", value: filter, "aria-label": say("Search by title", "ស្វែងរកតាមចំណងជើង"), placeholder: say("Search by title", "ស្វែងរកតាមចំណងជើង"), oninput: (e: Event) => { filter = (e.target as HTMLInputElement).value; shownDocs = PAGE; fill(); } });
    const fill = () => {
        const q = filter.trim().toLowerCase(), hits = q ? list.filter((d) => d.title.toLowerCase().includes(q) || d.slug.includes(q) || d.sha256.startsWith(q.replace(/\s/g, ""))) : list;
        box.replaceChildren(...([h("p", { class: "fine ex-count" }, say(hits.length === 1 ? "1 document" : `${n(hits.length)} documents`, `${n(hits.length)} ឯកសារ`)),
            ...hits.slice(0, shownDocs).map((d) => h("a", { class: "card ex-doc", href: `/corpus/${d.slug}` }, h("b", {}, d.title), h("span", {}, `${genre(d.genre)} · ${date(d.date)} · `, h("span", { class: "ex-mono" }, short(d.sha256))),
                h("span", { class: "ex-chips" }, d.opentimestamps ? h("span", { class: "pill on" }, "Bitcoin") : null, d.doi ? h("span", { class: "pill on" }, "DOI") : null))),
            hits.length > shownDocs ? h("button", { type: "button", class: "btn ghost ex-more", onclick: () => { shownDocs += PAGE; fill(); } }, say("Show more", "បង្ហាញបន្ថែម")) : null].filter(Boolean) as Node[]));
    };
    fill();
    view.replaceChildren(title, h("form", { class: "ex-search", role: "search", onsubmit: (e: Event) => e.preventDefault() }, input), box);
}
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
/** Three checks that run here against the public repository. A failed fetch says "couldn't check", never "failed". */
async function liveLegs(d: Doc, into: HTMLElement) {
    const put = (key: string, node: Node) => into.querySelector(`[data-leg="${key}"]`)?.replaceWith(node);
    if (!d.source_url) { put("today", leg(null, say("Today's text", "អត្ថបទថ្ងៃនេះ"), say("This one's source isn't in a public repository.", "ប្រភពនេះមិនមាននៅក្នុងឃ្លាំងសាធារណៈទេ។"))); put("btc", leg(d.opentimestamps ? null : false, "Bitcoin", say("The proof lives beside the source.", "ភស្តុតាងនៅជាមួយប្រភព។"))); put("tsa", h("span", {})); return; }
    await Promise.all([
        (async () => {
            try {
                const r = await fetch(d.source_url!); if (!r.ok) throw new Error();
                const got = hex(await sha256(new Uint8Array(await r.arrayBuffer())));
                put("today", got === d.sha256 ? leg(true, say("Today's text", "អត្ថបទថ្ងៃនេះ"), say("The repository's text has this fingerprint, hashed here just now.", "អត្ថបទរបស់ឃ្លាំងមានស្នាមម្រាមដៃនេះ ដែលបានហាសនៅទីនេះមុននេះបន្តិច។")) : leg(null, say("Today's text", "អត្ថបទថ្ងៃនេះ"), say("The repository's text is newer than this index. The index catches up when the change finishes its chain.", "អត្ថបទរបស់ឃ្លាំងថ្មីជាងសន្ទស្សន៍នេះ។ សន្ទស្សន៍តាមទាន់នៅពេលការផ្លាស់ប្តូរបញ្ចប់ខ្សែសង្វាក់របស់វា។")));
            } catch { put("today", leg(null, say("Today's text", "អត្ថបទថ្ងៃនេះ"), say("The repository can't be read right now, so this wasn't checked.", "មិនអាចអានឃ្លាំងបានឥឡូវនេះទេ ដូច្នេះនេះមិនត្រូវបានពិនិត្យទេ។"))); }
        })(),
        (async () => {
            const proofUrl = `${d.source_url}.ots`;
            try {
                const r = await fetch(proofUrl); if (!r.ok) throw new Error();
                const digest = Uint8Array.from(d.sha256.match(/../g)!.map((x) => parseInt(x, 16)));
                const seen = await checkOts(new Uint8Array(await r.arrayBuffer()), digest);
                if (!seen.ok) return put("btc", leg(null, "Bitcoin", say("The repository's proof is for a newer version of the text than this index.", "ភស្តុតាងរបស់ឃ្លាំងគឺសម្រាប់កំណែថ្មីជាងនៃអត្ថបទជាងសន្ទស្សន៍នេះ។"), " ", link(proofUrl, say("The proof", "ភស្តុតាង"))));
                const heights: number[] = seen.bitcoin.map((a: { height: number }) => a.height);
                put("btc", heights.length ? leg(null, "Bitcoin", blockLink(Math.min(...heights)), say("The proof commits to this text and names this block. This page doesn't fetch Bitcoin blocks, so confirm it with the OpenTimestamps tool: ", "ភស្តុតាងបញ្ជាក់អត្ថបទនេះ ហើយដាក់ឈ្មោះប្លុកនេះ។ ទំព័រនេះមិនទាញយកប្លុក Bitcoin ទេ ដូច្នេះសូមបញ្ជាក់វាដោយឧបករណ៍ OpenTimestamps៖ "), link(proofUrl, say("the proof", "ភស្តុតាង")))
                    : leg(null, "Bitcoin", say("Waiting for a block. This takes a few hours. ", "កំពុងរង់ចាំប្លុក។ វាចំណាយពេលពីរបីម៉ោង។ "), link(proofUrl, say("The proof", "ភស្តុតាង"))));
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
async function docPage(slug: string) {
    const title = head(say("Corpus", "សារពើភ័ណ្ឌឯកសារ"));
    view.replaceChildren(title, card(h("p", { role: "status" }, say("Reading the index…", "កំពុងអានសន្ទស្សន៍…"))));
    let list: Doc[];
    try { list = await readDocs(); } catch { return cantRead(title); }
    if (route().name !== "doc") return;
    const d = list.find((x) => x.slug === slug);
    if (!d) return view.replaceChildren(title, card(h("p", {}, say("The index has no document by that name.", "សន្ទស្សន៍មិនមានឯកសារដែលមានឈ្មោះនោះទេ។"))), link("/corpus", say("All documents", "ឯកសារទាំងអស់")));
    const waiting = (key: string, t: string) => { const x = leg(null, t, say("Checking…", "កំពុងពិនិត្យ…")); x.dataset.leg = key; return x; };
    const legs = card(h("h2", {}, say("Where its timestamps are", "ត្រាពេលវេលារបស់វានៅទីណា")), waiting("today", say("Today's text", "អត្ថបទថ្ងៃនេះ")), waiting("btc", "Bitcoin"), waiting("tsa", say("Timestamp authorities", "អាជ្ញាធរបោះត្រាពេលវេលា")),
        d.doi ? leg(null, "Zenodo", link(`https://doi.org/${d.doi}`, d.doi), " · ", d.archive_matches_today ? say("The corpus index says the archived copy matches this text. Compare it yourself at the link.", "សន្ទស្សន៍ឯកសារនិយាយថាច្បាប់ចម្លងដែលបានរក្សាទុកត្រូវនឹងអត្ថបទនេះ។ សូមប្រៀបធៀបដោយខ្លួនឯងតាមតំណ។") : say("The archived copy is an earlier version.", "ច្បាប់ចម្លងដែលបានរក្សាទុកគឺជាកំណែមុន។")) : null,
        leg(null, say("Corpus index", "សន្ទស្សន៍ឯកសារ"), say("corpus.333.eco serves this fingerprint.", "corpus.333.eco ផ្តល់ស្នាមម្រាមដៃនេះ។")), h("p", { class: "fine ex-gap" }, say("A tick means it was checked on this page just now. No tick means it's stated, with where to check it.", "សញ្ញាធីកមានន័យថាបានពិនិត្យនៅលើទំព័រនេះមុននេះបន្តិច។ គ្មានសញ្ញាធីកមានន័យថាវាត្រូវបាននិយាយ ជាមួយកន្លែងដែលត្រូវពិនិត្យ។")));
    view.replaceChildren(head(d.title, `${genre(d.genre)} · ${date(d.date)} · ${d.licence}`),
        card(h("dl", { class: "ex-kv" }, h("dt", {}, say("Fingerprint (SHA-256)", "ស្នាមម្រាមដៃ (SHA-256)")), h("dd", { class: "ex-mono" }, full(d.sha256)), h("dt", {}, say("Source", "ប្រភព")), h("dd", {}, d.source_url ? link(d.source_url, d.path) : d.path)), d.read_at ? h("p", { class: "ex-gap" }, link(/^https?:\/\//.test(d.read_at) ? d.read_at : `https://${d.read_at}`, say("Read it", "អានវា"))) : null),
        legs, card(h("p", {}, say("A timestamp proves when this text existed. It never proves that the text is true.", "ត្រាពេលវេលាបង្ហាញថាអត្ថបទនេះមាននៅពេលណា។ វាមិនដែលបង្ហាញថាអត្ថបទនេះពិតទេ។"))), link("/corpus", say("All documents", "ឯកសារទាំងអស់")));
    await liveLegs(d, legs);
}

/* ─────────────── Pages ─────────────── */
function route(): { name: "origin" } | { name: "record"; index: number } | { name: "corpus" } | { name: "doc"; slug: string } {
    const p = location.pathname.replace(/\/+$/, "");
    const rec = /^\/origin\/(\d{1,12})$/.exec(p), doc = /^\/corpus\/([a-z0-9-]+)$/.exec(p);
    if (rec) return { name: "record", index: Number(rec[1]) };
    if (doc) return { name: "doc", slug: doc[1] };
    return p === "/corpus" ? { name: "corpus" } : { name: "origin" };
}
function paint() {
    const r = route(), area = r.name === "corpus" || r.name === "doc" ? "corpus" : "origin";
    document.querySelectorAll<HTMLElement>("[data-nav]").forEach((a) => { if (a.dataset.nav === area) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.title = `${r.name === "record" ? say(`Record #${r.index}`, `កំណត់ត្រា #${r.index}`) : area === "corpus" ? say("Corpus", "សារពើភ័ណ្ឌឯកសារ") : say("Records", "កំណត់ត្រា")} · B-Explorer`;
    const run = r.name === "record" ? recordPage(r.index) : r.name === "doc" ? docPage(r.slug) : r.name === "corpus" ? corpusPage() : originPage();
    run.catch((e) => view.replaceChildren(card(leg(false, say("That didn't work", "វាមិនដំណើរការទេ"), String(e.message ?? e)))));
}
function nav(path: string) { history.pushState(null, "", path); window.scrollTo(0, 0); found = null; searchNote = ""; paint(); }
document.addEventListener("click", (e) => {
    const a = (e.target as Element).closest?.("a");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.hasAttribute("download") || a.origin !== location.origin) return;
    e.preventDefault(); nav(a.pathname);
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
