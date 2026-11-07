/** What the ledger page trusts: the public keys of log.333.eco/ledger, from the ledger repo's keys/manifest.json (2026-11-06). Public by design. ⛔ A new key is a new entry, never an edit. */
export default {
    origin: "log.333.eco/ledger",
    logVkey: "log.333.eco/ledger+7191ddfd+AdHTRR4OJs2od2yoLFWctaugqgilu3kdVfzBR2JDBem5",
    /** L1, the receipt key (DER ECDSA P-256 over ledger/receipt/v1 ‖ origin ‖ 0 ‖ u64 index ‖ seal ‖ at). */
    receiptKey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7ZPZCa+PJhqGwlP6WNZi6+6zru/A0SJ06iZQCQue9buaEAi+w5F+5vza2FOQcxTe8sxvYWhrDz9J8EBimpq7Xw==",
    witnesses: [] as string[],
};
