/**
 * The ledger page's hashing, off the page's main thread (A662, 2026-11-19): every new entry's leaf hash, and the tree's right edge extended
 * by them. A first visit hashes the whole ledger, which grows a tile a day. ⛔ No check depends on this file: if the browser can't start it,
 * the page runs the same two functions itself (ledger-memory.ts and the package's hashLeaf), so the answer is the same either way.
 */
// @ts-expect-error the published verifier ships no types
import { hashLeaf } from "@333eco/origin-verify";
import { extend, type Edge } from "./ledger-memory";

self.onmessage = (e: MessageEvent<{ entries: Uint8Array[]; edge: Edge }>) => {
    const leaves: Uint8Array[] = e.data.entries.map(hashLeaf);
    (self as unknown as Worker).postMessage({ leaves, edge: extend(e.data.edge, leaves) });
};
