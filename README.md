# explorer.333.eco

Read-only pages over public data: B-Origin's log (log.333.eco) and the corpus (corpus.333.eco, and each paper's public repository). Every check runs in the reader's browser, using the published `@333eco/origin-verify`, so this host holds nothing and isn't trusted.

- `npm run build` writes `dist/`. `npm run drive` runs it in real Chrome against the real log, with a tampered-log control.
- Deploy: `npm run build && npx wrangler pages deploy` (Cloudflare Pages, direct upload; no build there, no Functions).
- ⚠️ The 333.eco zone holds `.js` and `.css` in the browser for 4 hours on this host, whatever `_headers` says, so `scripts/build.mjs` puts a hash of each file in its address. Check a deploy by the `?v=` in the served HTML.
- ⛔ A tick means it was checked on the page just now. Anything else is stated, with where to check it.
- A paper's page reads its history in the browser: every `.rN.ots` proof beside the text, each proof's earliest block from mempool.space, each version's text from GitHub (hashed to the proof's fingerprint), Zenodo's first version, TDCommons's first posting (from `defensive-publications/submitted/manifest.json`, the repository's own public record, because the venue refuses scripts) and the Internet Archive's first capture. GitHub allows 60 unauthenticated calls an hour per network, and each paper uses two; past that the links are left out and the page says so.
- ⛔ "Earliest proof" and "Public by" stay apart, and the page never says *prior art*: a proof shows a text existed, not that anyone could read it (`project_publication_strategy`), and the dates belong to the earliest version only.
- ⛔ No rates, rankings or counters. Outside witnesses are named once they exist.
- `/ledger` (2026-11-06): the gratitude ledger's proofs only, checked here against `client/ledger-trust.ts` (its published keys): the checkpoint, the root from every entry and the hash tiles, public entries placed last, the TSAs and Bitcoin, and a receipt pasted by its owner, checked on the device and never sent. ⛔ Nothing here can reach a row. `npm run drive` covers it, with a forged receipt and a tampered entry as controls.
