/**
 * A revoke entry (`t: "revoke"`, from 2026-11-26; b-poh-statements v1.7 §6.1): one or more B-PoH app keys reported, by their holder
 * with their own passkey, or by sign.333.eco when Google revoked the phone's batch. ⭐ It removes nothing: every record stays and keeps
 * verifying; it changes only what may be said about a press with those keys at or after `compromised`. Two dates: `compromised` (from
 * when the key may have pressed for someone else; for a batch, the key's enrollment minute) and `witnessedAt` (when it became known).
 * ⛔ Never "verified" or "fraud", never a person or a phone named, never shown as a failure of the log. DRAFT Khmer (ours).
 * Read defensively: an entry the page doesn't know, or a field it doesn't expect, is shown plainly and never throws.
 */
export type By = "holder" | "operator" | "other";
export interface Revoke { index: number; by: By; keys: string[]; compromised: string; witnessedAt: string }

/** What the page reads from a revoke entry, whatever shape it arrives in. */
export function readRevoke(e: any): Revoke {
    const by: By = e?.by === "holder" ? "holder" : e?.by === "operator" ? "operator" : "other";
    const keys = Array.isArray(e?.keys) ? e.keys.filter((k: unknown): k is string => typeof k === "string") : [];
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    return { index: Number.isInteger(e?.index) ? e.index : -1, by, keys, compromised: str(e?.compromised), witnessedAt: str(e?.witnessedAt) };
}

/** [English, Khmer]. */
export const BY_KIND: Record<By, [string, string]> = {
    holder: ["A phone's keys reported", "កូនសោរបស់ទូរស័ព្ទមួយត្រូវបានរាយការណ៍"],
    operator: ["A batch of phone keys revoked", "កូនសោទូរស័ព្ទមួយក្រុមត្រូវបានដកហូត"],
    other: ["Phone keys reported", "កូនសោទូរស័ព្ទត្រូវបានរាយការណ៍"],
};
export const WHO: Record<By, [string, string]> = {
    holder: ["Their holder reported the phone lost or stolen, with their own passkey.", "អ្នកកាន់បានរាយការណ៍ថាទូរស័ព្ទបាត់ ឬត្រូវបានលួច ដោយប្រើ passkey ផ្ទាល់ខ្លួន។"],
    operator: ["sign.333.eco found that Google revoked the batch of phone chips these keys came from.", "sign.333.eco បានរកឃើញថា Google បានដកហូតក្រុមបន្ទះឈីបទូរស័ព្ទ ដែលកូនសោទាំងនេះមកពី។"],
    other: ["", ""],
};
export const REPORTED_BY: Record<By, [string, string]> = {
    holder: ["The phone's holder, with their passkey", "អ្នកកាន់ទូរស័ព្ទ ដោយប្រើ passkey របស់ពួកគេ"],
    operator: ["sign.333.eco", "sign.333.eco"],
    other: ["Not stated in a way this page knows", "មិនបានបញ្ជាក់តាមរបៀបដែលទំព័រនេះស្គាល់ទេ"],
};
/** The one sentence: from when, and since when it is known. Both dates as the page already writes `witnessedAt`. */
export const backed = (from: string, known: string): [string, string] => [
    `A press made with these keys from ${from} on is no longer backed by what the phone's chip showed. This was known ${known}.`,
    `ការចុចដែលធ្វើដោយកូនសោទាំងនេះ ចាប់ពី ${from} តទៅ លែងត្រូវបានគាំទ្រដោយអ្វីដែលបន្ទះឈីបរបស់ទូរស័ព្ទបានបង្ហាញទៀតហើយ។ គេបានដឹងរឿងនេះនៅ ${known}។`,
];
export const ENROLLED: [string, string] = ["For a revoked batch, that is the minute the key was enrolled, so nothing its chip showed is relied on.", "សម្រាប់ក្រុមដែលត្រូវបានដកហូត នោះគឺជានាទីដែលកូនសោត្រូវបានចុះឈ្មោះ ដូច្នេះគ្មានអ្វីដែលបន្ទះឈីបរបស់វាបានបង្ហាញត្រូវបានពឹងផ្អែកទេ។"];
export const NOTHING_REMOVED: [string, string] = ["Nothing was removed. Every record stays in the log and still checks. What changes is only what a press with these keys, at or after that time, can be said to show.", "គ្មានអ្វីត្រូវបានលុបទេ។ កំណត់ត្រានីមួយៗនៅក្នុងកំណត់ហេតុ ហើយនៅតែពិនិត្យបាន។ អ្វីដែលផ្លាស់ប្តូរ គឺមានតែអ្វីដែលការចុចដោយកូនសោទាំងនេះ នៅពេលនោះ ឬក្រោយមក អាចនិយាយថាបង្ហាញប៉ុណ្ណោះ។"];
/** Under the list on /origin, where no one entry is meant. */
export const LIST_NOTE: [string, string] = ["Each removes nothing: every record stays in the log and still checks.", "នីមួយៗមិនលុបអ្វីទេ៖ កំណត់ត្រានីមួយៗនៅក្នុងកំណត់ហេតុ ហើយនៅតែពិនិត្យបាន។"];
