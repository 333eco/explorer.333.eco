/* ─────────────── Legal (roadmap A709) ───────────────
   Every version of each service's legal documents, read from the public repository 333eco/legal-versions and checked here: its text
   hashed, its proof taken to Bitcoin, the manifest that lists it and the authorities' tokens on that manifest. What may be ticked is
   decided in ./legal (scripts/check-legal.mjs); the words are the papers' where they exist, else boards E8–E10 (demo.333.eco). The Khmer
   is our draft, like the rest of this site's. ⛔ "Existed by" and "Served from" are two cards, never one line.
   ⭐ 2026-11-25 (founder: fix the "known, not urgent" list; the first load stood at 70.8 KB gzip against its 71.1 KB budget): this file
   and ./legal are their own chunk, legal-tab.js, which app.js imports only when /legal opens (scripts/build.mjs). Moved here unchanged
   from app.ts. ⛔ Never import app.ts here: the page's helpers are handed in, and ./proofs is the page's own copy, bound below (the
   build maps this chunk's "./proofs" to ./proofs-bound, so the verifier isn't downloaded twice). */
import { h, leg, say, type Kid } from "./ui";
import { bindProofs, headerOf } from "./proofs-bound";
import { BLOB as LEGAL_BLOB, INDEX as LEGAL_INDEX, MANIFESTS as LEGAL_MANIFESTS, REPO as LEGAL_REPO, checkVersion, currentOf, readIndex as readLegalIndex, reviewDate, servedAt, type Checked, type Get as LegalGet, type LegalDoc, type LegalVersion } from "./legal";

/** What app.ts hands the Legal pages: its own helpers, so they draw exactly as the rest of the page does. */
export interface LegalDeps {
    view: { replaceChildren(...kids: Kid[]): void };
    route: () => { name: string };
    link: (href: string, ...kids: Kid[]) => HTMLElement;
    head: (title: string, lede?: string) => HTMLElement;
    card: (...kids: Kid[]) => HTMLElement;
    tickNote: () => HTMLElement;
    blockLink: (height: number) => HTMLElement;
    full: (s: string) => string;
    date: (raw: string) => string;
    when: (iso: string) => string;
    n: (x: number) => string;
    title: () => string;
    proofs: typeof import("./proofs");
}

const legalGet: LegalGet = async (url) => { const r = await fetch(url); if (r.status === 404) return null; if (!r.ok) throw new Error(String(r.status)); return new Uint8Array(await r.arrayBuffer()); };
let legalDocs: LegalDoc[] | null = null;
async function readLegal() {
    if (legalDocs) return legalDocs;
    const r = await fetch(LEGAL_INDEX); if (!r.ok) throw new Error(String(r.status));
    legalDocs = readLegalIndex(await r.json());
    return legalDocs;
}
/** Each version checked once per page load, so a repaint (the language toggle) or the version's own page reuses the result. */
const legalChecks = new Map<string, Promise<Checked>>();
const legalCheck = (d: LegalDoc, v: LegalVersion) => { let p = legalChecks.get(v.path); if (!p) { p = checkVersion(d, v, { get: legalGet, header: headerOf, today: new Date().toISOString().slice(0, 10) }); legalChecks.set(v.path, p); } return p; };

export function legalPages({ view, route, link, head, card, tickNote, blockLink, full, date, when, n, title: LEGAL_TITLE, proofs }: LegalDeps) {
    bindProofs(proofs);
    const TSA = () => say("Timestamp authorities", "អាជ្ញាធរបោះត្រាពេលវេលា");
    const legalHref = (d: LegalDoc, v: LegalVersion) => `/legal/${d.host}/${d.doc}/${v.id}`;
    const dateLine = (v: LegalVersion) => v.dateLine.replace(/\.$/, "");
    const legalBack = () => link("/legal", say("All legal documents", "ឯកសារច្បាប់ទាំងអស់"));
    const cantReadLegal = (title: Node) => view.replaceChildren(title, card(leg(false, say("The legal index can't be read right now", "មិនអាចអានសន្ទស្សន៍ឯកសារច្បាប់បានឥឡូវនេះទេ"), say("Try again in a little while.", "សូមសាកល្បងម្តងទៀតបន្តិចក្រោយ។"))));
    const pending = () => say("Waiting for a block. This takes a few hours.", "កំពុងរង់ចាំប្លុក។ វាចំណាយពេលពីរបីម៉ោង។");
    const notTied = () => say("This wasn't checked here, because the text didn't hash here to this version's fingerprint. ", "នេះមិនត្រូវបានពិនិត្យនៅទីនេះទេ ព្រោះអត្ថបទមិនបានហាសនៅទីនេះទៅស្នាមម្រាមដៃនៃកំណែនេះ។ ");
    const pill = (cls: string, text: string) => h("span", { class: cls }, text);
    /** The chips beside a version on the list: what was checked just now, and nothing else ticked. */
    function legalChips(c: Checked | null) {
        if (!c) return [pill("pill", say("Checking…", "កំពុងពិនិត្យ…"))];
        if (!c.sound) return [pill("pill ex-bad", say("Its address doesn't match its fingerprint", "អាសយដ្ឋានរបស់វាមិនត្រូវនឹងស្នាមម្រាមដៃរបស់វាទេ"))];
        const unchecked = (name: string) => pill("pill", say(`${name}: not checked just now`, `${name}៖ មិនបានពិនិត្យឥឡូវនេះទេ`));
        const failed = (name: string) => pill("pill ex-bad", say(`${name}: didn't pass its check`, `${name}៖ មិនបានឆ្លងការពិនិត្យទេ`));
        const out: Node[] = [];
        if (c.text.state === "differs") out.push(pill("pill ex-bad", say("Its text doesn't match its fingerprint", "អត្ថបទរបស់វាមិនត្រូវនឹងស្នាមម្រាមដៃរបស់វាទេ")));
        else if (c.tsa.state === "signed") out.push(pill("pill on ex-ok", say(`${n(c.tsa.names.length)} ${c.tsa.names.length === 1 ? "timestamp authority" : "timestamp authorities"}`, `អាជ្ញាធរបោះត្រាពេលវេលា ${n(c.tsa.names.length)}`)));
        else out.push(c.tsa.state === "bad" ? failed(TSA()) : unchecked(TSA()));
        const b = c.bitcoin;
        if (b.state === "pending") out.push(pill("pill", pending()));
        else if (c.text.state !== "differs") out.push(b.state === "block" && b.checked === true ? pill("pill on ex-ok", "Bitcoin") : (b.state === "block" && b.checked === false) || b.state === "other" ? failed("Bitcoin") : unchecked("Bitcoin"));
        return out;
    }
    async function legalPage() {
        const title = head(LEGAL_TITLE(), say("Every version of each service's legal documents, read from the public repository 333eco/legal-versions. Every check runs in your browser.", "គ្រប់កំណែនៃឯកសារច្បាប់របស់សេវានីមួយៗ អានពីឃ្លាំងសាធារណៈ 333eco/legal-versions។ ការពិនិត្យទាំងអស់ដំណើរការក្នុងកម្មវិធីរុករករបស់អ្នក។"));
        if (!legalDocs) view.replaceChildren(title, card(h("p", { role: "status" }, say("Reading the index…", "កំពុងអានសន្ទស្សន៍…"))));
        let docs: LegalDoc[];
        try { docs = await readLegal(); } catch { return cantReadLegal(title); }
        if (route().name !== "legal") return;
        const hosts = [...new Set(docs.map((d) => d.host))];
        const rows: { chips: HTMLElement; d: LegalDoc; v: LegalVersion }[] = [];
        const cards = hosts.map((host) => card(h("h2", { class: "ex-mono" }, host), ...docs.filter((d) => d.host === host).flatMap((d) => d.versions.slice().sort((a, b) => b.id.localeCompare(a.id)).map((v) => {
            const chips = h("span", { class: "ex-chips" }, ...legalChips(null)); rows.push({ chips, d, v });
            return h("a", { class: "ex-row", href: legalHref(d, v) }, h("b", {}, d.title), h("span", {}, `${dateLine(v)} · `, h("span", { class: "ex-mono" }, v.sha256.slice(0, 6))), chips);
        }))));
        view.replaceChildren(title, ...cards, tickNote());
        await Promise.all(rows.map(async ({ chips, d, v }) => { const c = await legalCheck(d, v); if (route().name === "legal" && chips.isConnected) chips.replaceChildren(...legalChips(c)); }));
    }
    async function legalVersionPage(host: string, docName: string, id: string | null) {
        const title = head(LEGAL_TITLE());
        view.replaceChildren(title, card(h("p", { role: "status" }, say("Reading the index…", "កំពុងអានសន្ទស្សន៍…"))));
        let docs: LegalDoc[];
        try { docs = await readLegal(); } catch { return cantReadLegal(title); }
        if (route().name !== "legalVersion") return;
        const d = docs.find((x) => x.host === host && x.doc === docName), cur = d ? currentOf(d) : null, v = d ? (id ? d.versions.find((x) => x.id === id) : cur) : null;
        if (!d || !v) return view.replaceChildren(title, card(h("p", {}, say("The index has no document by that name.", "សន្ទស្សន៍មិនមានឯកសារដែលមានឈ្មោះនោះទេ។"))), legalBack());
        document.title = `${d.title} · ${d.host} · B-Explorer`;
        const proof = link(`${LEGAL_BLOB}${v.path}.ots`, say("The proof", "ភស្តុតាង")), manifests = () => link(LEGAL_MANIFESTS, say("The manifests", "បញ្ជី"));
        const source = () => link(LEGAL_BLOB + v.path, say("Source", "ប្រភព"));
        const fp = say("Its fingerprint", "ស្នាមម្រាមដៃរបស់វា");
        const legs = card(leg(null, fp, say("Checking…", "កំពុងពិនិត្យ…")), h("p", { class: "ex-mono" }, full(v.sha256)), leg(null, "Bitcoin", say("Checking…", "កំពុងពិនិត្យ…")), leg(null, TSA(), say("Checking…", "កំពុងពិនិត្យ…")));
        const limit = h("div", { class: "card ex-limit" }, h("p", {}, say("Checking…", "កំពុងពិនិត្យ…")));
        const older = v !== cur && cur ? card(h("p", {}, h("b", {}, say("This is an earlier version.", "នេះជាកំណែមុន។")), " ", link(legalHref(d, cur), say("The current version", "កំណែបច្ចុប្បន្ន")))) : null;
        const served = card(h("h2", {}, say("Served from", "បង្ហាញពី")), h("p", {}, link(servedAt(d, v), `legal.333.eco/${d.host}/${d.doc}/${v.id}`)),
            h("p", { class: "fine ex-gap" }, say("The public repository ", "ឃ្លាំងសាធារណៈ "), link(`https://github.com/${LEGAL_REPO}`, LEGAL_REPO), say(" keeps this text and its proof.", " រក្សាអត្ថបទនេះ និងភស្តុតាងរបស់វា។")));
        view.replaceChildren(docHeadLegal(d, v), older, legs, limit, served, tickNote(), h("a", { class: "btn ghost", href: servedAt(d, v), rel: "noopener" }, say("Open its page on legal.333.eco", "បើកទំព័ររបស់វានៅលើ legal.333.eco")), legalBack());
        const c = await legalCheck(d, v);
        if (route().name !== "legalVersion" || !legs.isConnected) return;
        if (!c.sound) { legs.replaceChildren(leg(false, fp, say("This entry's address doesn't match its fingerprint, so nothing here was checked.", "អាសយដ្ឋាននៃធាតុនេះមិនត្រូវនឹងស្នាមម្រាមដៃរបស់វាទេ ដូច្នេះគ្មានអ្វីនៅទីនេះត្រូវបានពិនិត្យទេ។")), h("p", { class: "ex-mono" }, full(v.sha256))); }
        else {
            const t = c.text.state === "match" ? leg(true, fp, say("The repository's text has this fingerprint, hashed here just now. ", "អត្ថបទរបស់ឃ្លាំងមានស្នាមម្រាមដៃនេះ ដែលបានហាសនៅទីនេះមុននេះបន្តិច។ "), source())
                : c.text.state === "differs" ? leg(false, fp, say("The repository's text, hashed here just now, doesn't have this fingerprint. ", "អត្ថបទរបស់ឃ្លាំង ដែលបានហាសនៅទីនេះមុននេះបន្តិច មិនមានស្នាមម្រាមដៃនេះទេ។ "), source())
                : leg(null, fp, say("The repository can't be read right now, so this wasn't checked. ", "មិនអាចអានឃ្លាំងបានឥឡូវនេះទេ ដូច្នេះនេះមិនត្រូវបានពិនិត្យទេ។ "), source());
            const b = c.bitcoin;
            // The papers' words (liveLegs), each Bitcoin state as the corpus page says it.
            const btc = b.state === "block" ? (b.checked === true ? leg(true, "Bitcoin", blockLink(b.height), ". ", say(`The proof leads from this text to this block, whose header was read from mempool.space just now. Mined ${date(b.time!)}. `, `ភស្តុតាងនាំពីអត្ថបទនេះទៅប្លុកនេះ ដែលក្បាលរបស់វាត្រូវបានអានពី mempool.space មុននេះបន្តិច។ បានជីកនៅ ${date(b.time!)}។ `), proof)
                    : b.checked === false ? leg(false, "Bitcoin", blockLink(b.height), ". ", say("This block's header, as mempool.space serves it, doesn't hold this proof. ", "ក្បាលប្លុកនេះ ដូចដែល mempool.space ផ្តល់ឱ្យ មិនមានភស្តុតាងនេះទេ។ "), proof)
                    : leg(null, "Bitcoin", blockLink(b.height), ". ", say("The proof commits to this text and names this block, which couldn't be read just now. Confirm it with the OpenTimestamps tool: ", "ភស្តុតាងបញ្ជាក់អត្ថបទនេះ ហើយដាក់ឈ្មោះប្លុកនេះ ដែលមិនអាចអានបានឥឡូវនេះ។ សូមបញ្ជាក់វាដោយឧបករណ៍ OpenTimestamps៖ "), proof))
                : b.state === "pending" ? leg(null, "Bitcoin", `${pending()} `, proof)
                : b.state === "other" ? leg(false, "Bitcoin", say("The proof beside this text names another fingerprint. ", "ភស្តុតាងនៅជាមួយអត្ថបទនេះដាក់ឈ្មោះស្នាមម្រាមដៃផ្សេង។ "), proof)
                : b.state === "untied" ? leg(null, "Bitcoin", notTied(), proof)
                : leg(null, "Bitcoin", say("The proof can't be read right now, so this wasn't checked. ", "មិនអាចអានភស្តុតាងបានឥឡូវនេះទេ ដូច្នេះនេះមិនត្រូវបានពិនិត្យទេ។ "), proof);
            const s = c.tsa;
            const tsa = s.state === "signed" ? leg(true, TSA(), say(`In the ${s.day} manifest, which ${s.names.join(", ")} signed no later than ${when(s.first)}. `, `នៅក្នុងបញ្ជី ${s.day} ដែល ${s.names.join(", ")} បានចុះហត្ថលេខា មិនយឺតជាង ${when(s.first)}។ `), manifests())
                : s.state === "bad" ? leg(false, TSA(), say(`In the ${s.day} manifest, but its authorities' tokens didn't pass their check. `, `នៅក្នុងបញ្ជី ${s.day} ប៉ុន្តែសញ្ញារបស់អាជ្ញាធររបស់វាមិនបានឆ្លងការពិនិត្យទេ។ `), manifests())
                : s.state === "tokens-unread" ? leg(null, TSA(), say(`Listed in the ${s.day} manifest. Its authorities' tokens couldn't be read just now, so this wasn't checked. `, `មាននៅក្នុងបញ្ជី ${s.day}។ មិនអាចអានសញ្ញារបស់អាជ្ញាធររបស់វាបានឥឡូវនេះទេ ដូច្នេះនេះមិនត្រូវបានពិនិត្យទេ។ `), manifests())
                : s.state === "absent" ? leg(null, TSA(), say("No manifest read here just now lists this version. ", "គ្មានបញ្ជីដែលបានអាននៅទីនេះមុននេះបន្តិច រាយកំណែនេះទេ។ "), manifests())
                : s.state === "untied" ? leg(null, TSA(), notTied(), manifests())
                : leg(null, TSA(), say("No recent manifest could be read, so this wasn't checked. ", "មិនអាចអានបញ្ជីថ្មីៗបានទេ ដូច្នេះនេះមិនត្រូវបានពិនិត្យទេ។ "), manifests());
            // A review record (E10) is shown only when the index has one; none exists yet, and its absence is never shown. Its format isn't
            // settled, so it is stated, not ticked, with where to check it.
            const rd = reviewDate(v);
            const review = v.review ? leg(null, say("The review record", "កំណត់ត្រានៃការពិនិត្យ"), rd ? say(`Entered ${date(rd)}, when a lawyer reviewed this version, and timestamped in that day's manifest. `, `បានបញ្ចូលនៅ ${date(rd)} នៅពេលមេធាវីពិនិត្យកំណែនេះ ហើយបោះត្រាពេលវេលានៅក្នុងបញ្ជីថ្ងៃនោះ។ `) : null,
                say("It records that the review happened. It does not show what the lawyer advised. ", "វាកត់ត្រាថាការពិនិត្យបានកើតឡើង។ វាមិនបង្ហាញថាមេធាវីបានផ្តល់យោបល់អ្វីនោះទេ។ "), manifests()) : null;
            legs.replaceChildren(t, h("p", { class: "ex-mono" }, full(v.sha256)), btc, tsa, ...(review ? [review] : []));
        }
        limit.replaceChildren(h("p", {}, c.existedBy
            ? say(`What this shows: the text existed by ${date(c.existedBy)}. It does not show who published it, or that it was in force.`, `អ្វីដែលនេះបង្ហាញ៖ អត្ថបទមានរួចហើយនៅ ${date(c.existedBy)}។ វាមិនបង្ហាញថាអ្នកណាជាអ្នកផ្សព្វផ្សាយ ឬថាវាមានសុពលភាពនោះទេ។`)
            : say("What a timestamp shows: that a text existed by a date. It does not show who published it, or that it was in force. No check on this page dated this text just now.", "អ្វីដែលត្រាពេលវេលាបង្ហាញ៖ អត្ថបទមួយមានរួចហើយនៅកាលបរិច្ឆេទមួយ។ វាមិនបង្ហាញថាអ្នកណាជាអ្នកផ្សព្វផ្សាយ ឬថាវាមានសុពលភាពនោះទេ។ គ្មានការពិនិត្យណាមួយនៅលើទំព័រនេះបានកំណត់កាលបរិច្ឆេទអត្ថបទនេះមុននេះបន្តិចទេ។")));
    }
    const docHeadLegal = (d: LegalDoc, v: LegalVersion) => h("div", {}, h("h1", {}, `${d.title} · ${d.host}`), h("p", { class: "lede" }, dateLine(v)));
    return { legalPage, legalVersionPage };
}
