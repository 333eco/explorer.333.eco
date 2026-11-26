/**
 * The Legal chunk's ./proofs (2026-11-25): the page's own proof helpers, handed over by app.js when it loads the chunk, so the verifier
 * they use is downloaded once. scripts/build.mjs maps every "./proofs" in legal-tab.js to this file; tsc and scripts/check-legal.mjs read
 * the real ./proofs. The names here are ./proofs's own (anything the chunk uses and this doesn't bind is undefined, and the drive fails).
 */
import type * as P from "./proofs";
export type { Anchor } from "./proofs";
export let anchorOf: typeof P.anchorOf, headerOf: typeof P.headerOf, hex: typeof P.hex, manifestTokens: typeof P.manifestTokens, otsDigest: typeof P.otsDigest, sha256: typeof P.sha256;
export function bindProofs(p: typeof P) { ({ anchorOf, headerOf, hex, manifestTokens, otsDigest, sha256 } = p); }
