/**
 * The ledger page's memory of what THIS device already checked (A662, 2026-11-19; founder: "option 1; isn't a merkle tree incredibly
 * efficient?"). The page used to rebuild the root from every entry on every visit, and the ledger grows a tile a day (256 entries, padded),
 * so a visit grew without end. A Merkle tree makes the rest cheap: the tree's RIGHT EDGE (the root of each whole power-of-two block, at most
 * one per bit of the size) commits to every entry before it. Kept on this device, it lets a return visit read only the new entries and
 * still prove the earlier ones unchanged: the edge, extended by the new leaves, must give the newly signed root.
 *
 * ⭐ Pure (no DOM, no storage), so `scripts/check-ledger-memory.mjs` tests it against the real ledger and against the package's own
 *   treeRoot for every size. ⛔ The memory is a convenience of this device: lost or unreadable, the page checks every entry, as before.
 */
// @ts-expect-error the published verifier ships no types
import { treeRoot } from "@333eco/origin-verify";

/** RFC 6962's interior node H(0x01 ‖ l ‖ r), by the package's own code: the root of exactly two leaf HASHES is that node. */
const node = (l: Uint8Array, r: Uint8Array): Uint8Array => treeRoot([l, r]);

/** The tree's right edge at `size`: the roots of its whole blocks, largest first (one per set bit of the size). */
export interface Edge { size: number; hashes: Uint8Array[] }
export const EMPTY: Edge = { size: 0, hashes: [] };

/** The block sizes a tree of `size` leaves splits into, largest first (no 32-bit bitwise: sizes may pass 2^31 one day). */
export function blocksOf(size: number): number[] {
    const out: number[] = [];
    let b = 1; while (b * 2 <= size) b *= 2;
    for (let left = size; b >= 1; b /= 2) if (left >= b) { out.push(b); left -= b; }
    return out;
}

/** The edge after appending `leaves` (leaf hashes, in order). */
export function extend(e: Edge, leaves: Uint8Array[]): Edge {
    const hashes = [...e.hashes], sizes = blocksOf(e.size);
    for (const leaf of leaves) {
        hashes.push(leaf); sizes.push(1);
        while (sizes.length >= 2 && sizes[sizes.length - 1] === sizes[sizes.length - 2]) {
            const r = hashes.pop()!, l = hashes.pop()!, s = sizes.pop()!; sizes.pop();
            hashes.push(node(l, r)); sizes.push(s * 2);
        }
    }
    return { size: e.size + leaves.length, hashes };
}

/** The root of the tree whose right edge this is (RFC 6962: the blocks fold together from the right). */
export function rootOf(e: Edge): Uint8Array {
    if (!e.hashes.length) return treeRoot([]);
    let acc = e.hashes[e.hashes.length - 1];
    for (let i = e.hashes.length - 2; i >= 0; i--) acc = node(e.hashes[i], acc);
    return acc;
}

/** One entry tile (C2SP tlog-tiles): each entry is a 2-byte big-endian length, then its bytes. */
export function bundleEntries(b: Uint8Array): Uint8Array[] {
    const out: Uint8Array[] = [];
    for (let i = 0; i < b.length;) { const n = (b[i] << 8) | b[i + 1]; if (i + 2 + n > b.length) throw new Error("a truncated entry tile"); out.push(b.subarray(i + 2, i + 2 + n)); i += 2 + n; }
    return out;
}

const b64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** What this device keeps: the edge at a whole tile, the public entries before it, and when it was checked. Never sent anywhere. */
export interface Memory { edge: Edge; pub: { index: number; [k: string]: unknown }[]; at: string }
export function encodeMemory(origin: string, m: Memory): string {
    return JSON.stringify({ v: 1, origin, size: m.edge.size, hashes: m.edge.hashes.map(b64), pub: m.pub, at: m.at });
}
/** The memory, or null for anything that isn't exactly one this page wrote for this log (then every entry is checked). */
export function decodeMemory(raw: string | null, origin: string): Memory | null {
    try {
        const o = JSON.parse(raw ?? "null");
        if (!o || o.v !== 1 || o.origin !== origin || !Number.isSafeInteger(o.size) || o.size <= 0 || o.size % 256 !== 0) return null;
        if (!Array.isArray(o.hashes) || o.hashes.length !== blocksOf(o.size).length || typeof o.at !== "string" || isNaN(Date.parse(o.at))) return null;
        const hashes = o.hashes.map((h: unknown) => (typeof h === "string" ? unb64(h) : new Uint8Array(0)));
        if (hashes.some((h: Uint8Array) => h.length !== 32)) return null;
        if (!Array.isArray(o.pub) || o.pub.some((p: any) => !p || !Number.isSafeInteger(p.index) || p.index < 0 || p.index >= o.size)) return null;
        return { edge: { size: o.size, hashes }, pub: o.pub, at: o.at };
    } catch { return null; }
}
