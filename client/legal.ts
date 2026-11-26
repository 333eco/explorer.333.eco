/**
 * The Legal tab's checks (roadmap A709; founder 2026-11-25: "instead of me signing, how about we simply timestamp like we do for our
 * papers, and add a new "Legal" tab page to B-Explorer?", then "yes then go"). Each version of each service's legal documents lives in the
 * PUBLIC repository 333eco/legal-versions: its exact bytes at `<host>/<doc>/<id>.md`, its OpenTimestamps proof beside it, and the dated
 * manifests of every tracked file with three authorities' RFC 3161 tokens. This file decides what may be ticked; app.ts only draws it.
 * ⭐ 2026-11-25 (A709 M3/M4; founder: "do M3/M4"): the documents shared by every service have `host: null` in the index and live at
 *   `<doc>/<id>.md`, served at legal.333.eco/<doc>/<id>/. They are checked exactly as a service's are; only their address has no host.
 *
 * ⛔ A tick means it was checked here just now, and EVERY tick on a version needs its text hashed here to the index's fingerprint first:
 *   a proof or a manifest line speaks of a fingerprint, so it says nothing about a text that doesn't have it (the papers' rule of
 *   2026-11-20, `tiedOf`). A changed byte in the text leaves the version with no tick and no "existed by" date.
 * ⛔ "Existed by" comes only from a check that passed just now (a token's time, a block's time), never from the index's dates or a
 *   manifest's file name. It is never on one line with "served from": a timestamp shows the text existed, not who published it.
 * ⭐ Pure: no DOM, and the network only through the `get` and `header` it is handed, so scripts/check-legal.mjs runs it on fixtures.
 */
import { anchorOf, hex, manifestTokens, otsDigest, sha256, type Anchor } from "./proofs";

/** Pinned here, never read from the index: the index names its own repository, and a page that followed it could be pointed anywhere. */
export const REPO = "333eco/legal-versions", BRANCH = "main";
export const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
export const INDEX = `${RAW}index.json`;
export const BLOB = `https://github.com/${REPO}/blob/${BRANCH}/`;
export const MANIFESTS = `https://github.com/${REPO}/tree/${BRANCH}/timestamps/manifests`;
/** A document's place in every address: `<host>/<doc>`, or `<doc>` alone for one shared by every service (host null). */
export const placeOf = (d: LegalDoc) => (d.host === null ? d.doc : `${d.host}/${d.doc}`);
/** Where legal.333.eco serves a version (spec §3: a version's address is permanent). */
export const servedAt = (d: LegalDoc, v: LegalVersion) => `https://legal.333.eco/${placeOf(d)}/${v.id}/`;

export interface LegalVersion { id: string; dateLine: string; date: string; sha256: string; path: string; operator: string | null; firstServed: string | null; review: unknown }
export interface LegalDoc { host: string | null; body: string; doc: string; title: string; versions: LegalVersion[] }

/** A version whose address doesn't follow from its own fingerprint is never checked: its id is `<date>-<first 6 (to 8) hex>`, its path
 *  `<host>/<doc>/<id>.md`, or `<doc>/<id>.md` only when the host is null (legal.333.eco SPEC §3, §4). */
export function sound(d: LegalDoc, v: LegalVersion) {
    if (!(d.host === null || (typeof d.host === "string" && /^[a-z0-9][a-z0-9.-]*\.[a-z]+$/.test(d.host))) || !/^[a-z0-9-]+$/.test(d.doc) || !/^[0-9a-f]{64}$/.test(v.sha256)) return false;
    const m = /^(\d{4}-\d{2}-\d{2})-([0-9a-f]{6,8})$/.exec(v.id);
    return !!m && m[1] === v.date && v.sha256.startsWith(m[2]) && v.path === `${placeOf(d)}/${v.id}.md`;
}

/** The index as served, read as documents; anything not shaped like one is left out. A host is a name or exactly null (shared by every
 *  service); a missing host or any other value is not a document. */
export function readIndex(json: unknown): LegalDoc[] {
    const docs = (json as { documents?: unknown })?.documents;
    if (!Array.isArray(docs)) throw new Error("not an index");
    return docs.filter((d) => d && (typeof d.host === "string" || d.host === null) && typeof d.doc === "string" && typeof d.title === "string" && Array.isArray(d.versions))
        .map((d) => ({ host: d.host, body: typeof d.body === "string" ? d.body : "", doc: d.doc, title: d.title, versions: (d.versions as LegalVersion[]).filter((v) => v && typeof v.id === "string" && typeof v.sha256 === "string" && typeof v.path === "string") }));
}
/** The current version is the newest by its id (date first, then fingerprint), whatever order the index lists them in. */
export const currentOf = (d: LegalDoc) => d.versions.slice().sort((a, b) => a.id.localeCompare(b.id)).pop() ?? null;

/** What `get` answers: the bytes, or null when the address answered but holds nothing (404). It throws when it couldn't be read. */
export type Get = (url: string) => Promise<Uint8Array | null>;
export type TextLeg = { state: "match" } | { state: "differs"; got: string } | { state: "unread" };
export type BitcoinLeg =
    | { state: "block"; height: number; time?: string; checked: boolean | null } // the proof's earliest block; ticked only when checked === true
    | { state: "pending" } // the proof is real and waits for a block
    | { state: "other"; digest: string | null } // the proof speaks of another fingerprint (or isn't a proof)
    | { state: "untied"; anchor: Anchor | null } // the text here didn't hash to this version's fingerprint, so the block wasn't taken for it
    | { state: "unread" };
export type TsaLeg =
    | { state: "signed"; day: string; url: string; names: string[]; first: string }
    | { state: "bad"; day: string; url: string }
    | { state: "tokens-unread"; day: string; url: string }
    | { state: "absent" } // no manifest read here names this fingerprint at this path
    | { state: "untied" }
    | { state: "unread" };
export interface Checked { sound: boolean; text: TextLeg; bitcoin: BitcoinLeg; tsa: TsaLeg; existedBy: string | null }

const DAY = 864e5;
const dayAt = (iso: string, plus: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + plus * DAY).toISOString().slice(0, 10);
/**
 * The days whose manifest is read, in order, the earliest first: the day before the version was first served (the manifests are dated in
 * UTC) up to two weeks after it, never past tomorrow. Without that hint, the last ten days, the newest first, as the papers' page does.
 * ⭐ The earliest manifest that names the version gives its date; a later one (the weekly re-attestation) would move it later each week.
 */
export function manifestDays(v: LegalVersion, today: string) {
    const last = dayAt(today, 1), out: string[] = [];
    if (v.firstServed && /^\d{4}-\d{2}-\d{2}$/.test(v.firstServed)) for (let k = -1; k <= 14; k++) { const d = dayAt(v.firstServed, k); if (d > last) break; out.push(d); }
    if (!out.length) for (let k = 0; k < 10; k++) out.push(dayAt(last, -k));
    return out;
}

const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!.map((c) => parseInt(c, 16)));
const earliest = (...t: (string | undefined | null)[]) => (t.filter(Boolean) as string[]).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

/**
 * Checks one version. `get` reads the repository (and the authorities' tokens); `header` reads a block's header (mempool.space on the page).
 * Every leg that can't be read says so; none of them throws.
 */
export async function checkVersion(d: LegalDoc, v: LegalVersion, o: { get: Get; header: (height: number) => Promise<Uint8Array | null>; today: string }): Promise<Checked> {
    if (!sound(d, v)) return { sound: false, text: { state: "unread" }, bitcoin: { state: "unread" }, tsa: { state: "unread" }, existedBy: null };
    const read = (url: string) => o.get(url).catch(() => undefined); // undefined: couldn't be read; null: nothing there
    const textBytes = await read(RAW + v.path);
    const text: TextLeg = !textBytes ? { state: "unread" } : ((got) => (got === v.sha256 ? { state: "match" as const } : { state: "differs" as const, got }))(hex(await sha256(textBytes)));
    const tied = text.state === "match";

    const bitcoin = await (async (): Promise<BitcoinLeg> => {
        const proof = await read(`${RAW}${v.path}.ots`);
        if (!proof) return { state: "unread" };
        const digest = otsDigest(proof);
        if (digest !== v.sha256) return { state: "other", digest };
        let a: Anchor;
        try { a = await anchorOf(proof, bytesOf(v.sha256), o.header); } catch { return { state: "unread" }; }
        if (!a.ok) return { state: "other", digest };
        if (a.height === undefined) return { state: "pending" };
        if (!tied) return { state: "untied", anchor: a };
        return { state: "block", height: a.height, time: a.time, checked: a.checked };
    })();

    const tsa = await (async (): Promise<TsaLeg> => {
        if (!tied) return { state: text.state === "unread" ? "unread" : "untied" };
        const line = `${v.sha256}  ${v.path}`;
        let readAny = false;
        for (const day of manifestDays(v, o.today)) {
            const url = `${RAW}timestamps/manifests/${day}.sha256`, bytes = await read(url);
            if (bytes === undefined) continue; // unread: an earlier or later one may still be read
            readAny = true;
            if (bytes === null || !new TextDecoder().decode(bytes).split("\n").includes(line)) continue;
            const tokens = await manifestTokens(url, bytes, (async (u: string) => { const b = await o.get(u); return b ? new Response(b as BufferSource) : new Response(null, { status: 404 }); }) as typeof fetch);
            const signed = tokens.filter((t) => t.ok);
            if (signed.length) return { state: "signed", day, url, names: signed.map((t) => t.name), first: earliest(...signed.map((t) => t.time))! };
            return tokens.some((t) => t.ok === false) ? { state: "bad", day, url } : { state: "tokens-unread", day, url };
        }
        return readAny ? { state: "absent" } : { state: "unread" };
    })();

    const existedBy = tied ? earliest(tsa.state === "signed" ? tsa.first : null, bitcoin.state === "block" && bitcoin.checked === true ? bitcoin.time : null) : null;
    return { sound: true, text, bitcoin, tsa, existedBy };
}

/** A review record's date, when the index gives one (its format is not settled yet; none exists on 2026-11-25). */
export const reviewDate = (v: LegalVersion): string | null => {
    const r = v.review as { date?: unknown } | null | undefined;
    return r && typeof r === "object" && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date.slice(0, 10) : null;
};
