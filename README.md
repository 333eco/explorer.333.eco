# explorer.333.eco

Read-only pages over public data: B-Origin's log (log.333.eco) and the corpus (corpus.333.eco, and each paper's public repository). Every check runs in the reader's browser, using the published `@333eco/origin-verify`, so this host holds nothing and isn't trusted.

- `npm run build` writes `dist/`. `npm run drive` runs it in real Chrome against the real log, with a tampered-log control.
- Deploy: `npm run build && npx wrangler pages deploy` (Cloudflare Pages, direct upload; no build there, no Functions).
- ⛔ A tick means it was checked on the page just now. Anything else is stated, with where to check it.
- ⛔ No rates, rankings or counters. The gratitude ledger's page waits for the ledger; outside witnesses are named once they exist.
