/**
 * Signed, and waiting for the log's next checkpoint (founder 2026-11-12: a file "found but awaits the next checkpoint", never an
 * empty result). sign.333.eco/log/waiting lists them. Each entry is checked HERE against the log's own record key, so the list is
 * never trusted; and the WHOLE list is read, so no one learns which file was looked for. A list that can't be read means no
 * waiting entries, and nothing more is claimed. ⚠️ Its twin is origin.333.eco client/waiting.ts: keep the two the same.
 */
export const WAITING = "https://sign.333.eco/log/waiting";
type Check = (entry: unknown, trust: unknown) => Promise<boolean>;
const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function readWaiting(size: number, trust: unknown, check: Check, doFetch: typeof fetch = fetch): Promise<any[]> {
    try {
        const r = await doFetch(WAITING, { cache: "no-store" });
        if (!r.ok) return [];
        const out = [];
        for (const w of ((await r.json()) as { entries?: { index: number; entry: string }[] }).entries ?? []) {
            if (!(Number.isInteger(w.index) && w.index >= size)) continue; // already in the log, or never a real slot
            const e = JSON.parse(new TextDecoder().decode(b64bytes(w.entry)));
            if (e.index === w.index && (await check(e, trust))) out.push(e);
        }
        return out;
    } catch { return []; }
}

export function matchWaiting(hashes: { sha256?: string; pixels?: string; phash?: string }, entries: any[], distanceOf?: (a: string, b: string) => number) {
    const out: { how: string; index: number; distance?: number; waiting: true; entry: any }[] = [];
    for (const e of entries) {
        const c = e.t === "record" ? e.claim : null;
        if (!c) continue;
        if (hashes.sha256 && c.sha256 === hashes.sha256) out.push({ how: "exact", index: e.index, waiting: true, entry: e });
        else if (hashes.pixels && c.pixels === hashes.pixels) out.push({ how: "same pixels", index: e.index, waiting: true, entry: e });
        else if (distanceOf && hashes.phash && c.phash) { const distance = distanceOf(hashes.phash, c.phash); if (distance <= 8) out.push({ how: "similar", index: e.index, distance, waiting: true, entry: e }); }
    }
    return out;
}
