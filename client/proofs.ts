/**
 * The proof checks the corpus page and the Legal tab share (moved here unchanged from app.ts on 2026-11-25, roadmap A709, so the Legal
 * tab reuses the papers' checks as they are and client/legal.ts can be tested on its own). Two seams only: anchorOf takes the block
 * header reader and manifestTokens the fetch, each defaulting to what app.ts used, so the page behaves as before.
 */
// @ts-expect-error the published verifier ships no types
import { checkOts, checkTimestamp } from "@333eco/origin-verify";
// @ts-expect-error the same
import trust from "@333eco/origin-verify/trust";

/** The base64 (or base64url) of a root certificate, as bytes: app.ts's unb64, the same line. */
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
export const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
/** Each authority's token on one manifest (`<manifest>.<authority>.tsr`, beside it), checked here against that authority's published roots,
 *  the same ones the log's tokens are checked against. `ok` is undefined when the token couldn't be read (or there is none). */
export async function manifestTokens(url: string, manifest: Uint8Array, get: typeof fetch = fetch) {
    return Promise.all(Object.entries(((trust as any).tsaRoots ?? {}) as Record<string, string[]>).map(async ([name, roots]) => {
        try {
            const r = await get(`${url}.${name}.tsr`); if (!r.ok) return { name };
            const got = await checkTimestamp(new Uint8Array(await r.arrayBuffer()), manifest, roots.map(unb64));
            return { name, ok: !!got.ok, time: got.ok ? String(got.time instanceof Date ? got.time.toISOString() : got.time) : undefined };
        } catch { return { name }; }
    })) as Promise<{ name: string; ok?: boolean; time?: string }[]>;
}
/** An OpenTimestamps file names the digest it speaks of: 31 bytes of magic, a version byte, the SHA-256 tag, then 32 bytes. */
export const otsDigest = (b: Uint8Array) => (b.length >= 65 && b[32] === 0x08 ? hex(b.subarray(33, 65)) : null);
/** A block's 80-byte header from mempool.space, read once per height. null when it can't be read: the proof then stays unchecked, never failed. */
const blockHeaders = new Map<number, Promise<Uint8Array | null>>();
export const headerOf = (height: number): Promise<Uint8Array | null> => {
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
export interface Anchor { ok: boolean; height?: number; time?: string; checked: boolean | null }
/** A proof names one or more blocks (each calendar adds its own). Only the earliest matters, so only it is checked and shown. */
export async function anchorOf(proof: Uint8Array, digest: Uint8Array, header: (height: number) => Promise<Uint8Array | null> = headerOf): Promise<Anchor> {
    const seen = await checkOts(proof, digest);
    if (!seen.ok) return { ok: false, checked: null };
    const heights: number[] = seen.bitcoin.map((a: { height: number }) => a.height);
    if (!heights.length) return { ok: true, checked: null };
    const first = Math.min(...heights);
    const r = await checkOts(proof, digest, { header: (x: number) => (x === first ? header(x) : Promise.resolve(null)) });
    const at: { verified: boolean | null; time?: string }[] = r.bitcoin.filter((a: { height: number }) => a.height === first);
    const good = at.find((a) => a.verified === true);
    return { ok: true, height: first, time: good?.time, checked: good ? true : at.some((a) => a.verified === false) ? false : null };
}
