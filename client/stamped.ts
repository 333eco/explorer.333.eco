/**
 * What an outside clock's stamp on the gratitude ledger is worth (2026-11-20, the explorer's ticks). A token over `checkpoints/<s>`, with
 * `s` read from the UNSIGNED `stamps/index.json`, says nothing about the ledger unless that file is the ledger's own signed checkpoint at
 * exactly `s` entries, and its root is the root the ledger checked on this page has at `s`. The same three tests the verifier package runs
 * on a record's stamps (verifyPack → stampedCheckpoint), here against the tree the page rebuilt instead of a consistency proof.
 *
 * ⭐ Pure (no DOM, no network), so `scripts/check-stamped.mjs` tests it with a key of its own, including the case the live ledger can't
 *   show: a checkpoint the ledger DID sign whose root is not the audited one.
 */
// @ts-expect-error the published verifier ships no types
import { checkCheckpoint, checkpointBody } from "@333eco/origin-verify";

/** `body` is the stamped text, for the clocks' tokens. `unread`: the file or the audited root couldn't be read, so nothing was checked. */
export type Held =
    | { ok: true; body: Uint8Array }
    | { ok: false; why: "unread" | "signature" | "beyond" | "root" }
    | { ok: false; why: "size"; size: number };

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * @param note   the file served at `checkpoints/<size>`, or null when it couldn't be read
 * @param rootAt the audited ledger's root at a size: null past its end; it may throw when that root can't be read
 */
export async function heldStamp(note: string | null, size: number, trust: unknown, rootAt: (size: number) => Uint8Array | null | Promise<Uint8Array | null>): Promise<Held> {
    if (note === null) return { ok: false, why: "unread" };
    let cp: { ok: boolean; size?: number; root?: Uint8Array };
    try { cp = await checkCheckpoint(note, trust); } catch { return { ok: false, why: "signature" }; } // not a signed note at all
    if (!cp.ok) return { ok: false, why: "signature" };
    if (cp.size !== size) return { ok: false, why: "size", size: cp.size! };
    let root: Uint8Array | null;
    try { root = await rootAt(size); } catch { return { ok: false, why: "unread" }; }
    if (root === null) return { ok: false, why: "beyond" };
    if (!same(root, cp.root!)) return { ok: false, why: "root" };
    return { ok: true, body: new TextEncoder().encode(checkpointBody(note)) };
}
