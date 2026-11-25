/**
 * A B-Mail's files, compared in the reader's browser (founder 2026-11-25, "Attachments: agree"; canon [[project_b_origin]]
 * §b-mail-attachments item 1; open spec b-poh-statements §3.1 and §9.2: "the message's attachments, other than the carrier files, are
 * exactly those listed, by SHA-256"). A signed statement lists each file as `attachment: <sha256 hex> <name>`; the reader chooses or
 * drops the files that came with the mail, and each is hashed HERE.
 * ⛔ A file is never uploaded and never sent anywhere: this module names no way to reach the network (held by
 *    scripts/check-attachments.mjs on what is built, and by scripts/drive.mjs in real Chrome).
 * ⭐ Compared by SHA-256 only: the name is informative, since a mail app can change it. The carrier files (B-Mail.txt, the first
 *    mails' b-mail.txt, B-Mail-proof.json) are not the message's files and are never counted, unless their bytes are a listed file's.
 * ⛔ Never "verified", never a person: it says which file is the one signed, and which was not signed with the message.
 * The statement is read as the mail skill's bmail_mismatch and developers.333.eco's compareMessage read it: the head is what precedes
 * the first blank line after `b-mail/v1`, each line's key is what precedes its first ": ", and a file's SHA-256 is its value's first
 * word. Hashes are compared lowercased (as compareMessage does; the mail skill's bmail_mismatch compares them as written).
 * DRAFT Khmer (ours).
 */
import { h, leg, say, short } from "./ui";

export interface Listed { sha256: string; name: string }
/** A file the reader chose: its SHA-256 here, or null when it couldn't be read. */
export interface Received { name: string; sha256: string | null }
export const CARRIERS = ["B-Mail.txt", "b-mail.txt", "B-Mail-proof.json"];

/** The files a b-mail/v1 statement lists, in order. A line that is malformed stays listed, and can never be matched. */
export function listed(statement: string): Listed[] {
    if (!statement.startsWith("b-mail/v1\n")) return [];
    const rest = statement.slice(10), cut = rest.indexOf("\n\n");
    if (cut < 0) return [];
    const out: Listed[] = [];
    for (const line of rest.slice(0, cut).split("\n")) {
        const i = line.indexOf(": ");
        if (i < 0 || line.slice(0, i) !== "attachment") continue;
        const v = line.slice(i + 2), sp = v.indexOf(" ");
        out.push(sp < 0 ? { sha256: v, name: "" } : { sha256: v.slice(0, sp), name: v.slice(sp + 1) });
    }
    return out;
}
/** The box shows only beside a statement that was found signed and that lists files: with no record nothing was signed to compare. */
export const mayShow = (statement: string, found: boolean) => found && listed(statement).length > 0;

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const sha256Hex = async (bytes: Uint8Array) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));

/** Each listed file and the chosen file that has its SHA-256 (or null); the chosen files that are not listed, by kind. */
export function compare(list: Listed[], got: Received[]) {
    const signed = new Set(list.map((x) => x.sha256.toLowerCase()));
    return {
        rows: list.map((item) => ({ item, file: got.find((f) => f.sha256 !== null && f.sha256 === item.sha256.toLowerCase()) ?? null })),
        unread: got.filter((f) => f.sha256 === null),
        carriers: got.filter((f) => f.sha256 !== null && !signed.has(f.sha256) && CARRIERS.includes(f.name)),
        unsigned: got.filter((f) => f.sha256 !== null && !signed.has(f.sha256) && !CARRIERS.includes(f.name)),
    };
}

/**
 * The card on the check page. `kept` is held by the caller, so the files chosen survive a repaint (the language toggle repaints).
 * A new choice is added to what was chosen before; the same file chosen twice is kept once.
 */
export function fileBox(statement: string, kept: Received[]): HTMLElement | null {
    const list = listed(statement);
    if (!list.length) return null;
    const box = h("div", { class: "card ex-files" });
    let reading = false;
    const add = async (files: File[]) => {
        if (!files.length) return;
        reading = true; draw();
        for (const f of files) {
            let sha256: string | null = null;
            try { sha256 = await sha256Hex(new Uint8Array(await f.arrayBuffer())); } catch { /* said on its row */ }
            if (!kept.some((k) => k.name === f.name && k.sha256 === sha256)) kept.push({ name: f.name, sha256 });
        }
        reading = false;
        // Every box on the page redraws: a repaint while the files were read has built a new one from the same `kept`.
        document.querySelectorAll(".ex-files").forEach((b) => b.dispatchEvent(new Event("ex-redraw")));
    };
    const input = h("input", { type: "file", multiple: true, onchange: (e: Event) => { const t = e.target as HTMLInputElement; void add([...(t.files ?? [])]); t.value = ""; } });
    const draw = () => {
        const c = compare(list, kept), any = kept.length > 0;
        box.replaceChildren(...[
            h("h2", {}, say("The files signed with it", "ឯកសារដែលបានចុះហត្ថលេខាជាមួយវា")),
            h("p", {}, say("This message was signed with these files, each by its fingerprint. Choose or drop the files that came with your mail to compare them. They are read on this device and never uploaded; only their fingerprints are compared.",
                "សារនេះត្រូវបានចុះហត្ថលេខាជាមួយឯកសារទាំងនេះ ដោយស្នាមម្រាមដៃរបស់ឯកសារនីមួយៗ។ សូមជ្រើសរើស ឬទម្លាក់ឯកសារដែលភ្ជាប់មកជាមួយសំបុត្ររបស់អ្នក ដើម្បីប្រៀបធៀបវា។ ឯកសារត្រូវបានអាននៅលើឧបករណ៍នេះ ហើយមិនដែលត្រូវបានផ្ទុកឡើងទេ។ មានតែស្នាមម្រាមដៃរបស់វាប៉ុណ្ណោះដែលត្រូវបានប្រៀបធៀប។")),
            h("label", { class: "ex-file" }, say("Choose files, or drop them here", "ជ្រើសរើសឯកសារ ឬទម្លាក់វានៅទីនេះ"), input),
            reading ? h("p", { class: "fine", role: "status" }, say("Reading the files on this device…", "កំពុងអានឯកសារនៅលើឧបករណ៍នេះ…")) : null,
            ...c.rows.map(({ item, file }) => file
                ? leg(true, item.name || short(item.sha256), say("This is the file signed with the message.", "នេះគឺជាឯកសារដែលបានចុះហត្ថលេខាជាមួយសារ។"),
                    file.name !== item.name ? say(` You chose it as “${file.name}”.`, ` អ្នកបានជ្រើសរើសវាជា “${file.name}”។`) : "")
                : leg(null, item.name || short(item.sha256), any ? say("None of the files you chose has this fingerprint: ", "គ្មានឯកសារណាមួយដែលអ្នកបានជ្រើសរើសមានស្នាមម្រាមដៃនេះទេ៖ ") : say("Fingerprint ", "ស្នាមម្រាមដៃ "), h("span", { class: "ex-mono" }, short(item.sha256)))),
            ...c.unsigned.map((f) => leg(false, f.name, say("This file was not signed with the message.", "ឯកសារនេះមិនត្រូវបានចុះហត្ថលេខាជាមួយសារទេ។"))),
            ...c.carriers.map((f) => leg(null, f.name, say("This file carries the signature itself. It is not one of the message's files.", "ឯកសារនេះផ្ទុកហត្ថលេខាខ្លួនឯង។ វាមិនមែនជាឯកសារមួយរបស់សារនោះទេ។"))),
            ...c.unread.map((f) => leg(null, f.name, say("That file couldn't be read.", "មិនអាចអានឯកសារនោះបានទេ។"))),
        ].filter((x): x is HTMLElement => !!x));
    };
    box.addEventListener("ex-redraw", draw);
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("ex-over"); });
    box.addEventListener("dragleave", () => box.classList.remove("ex-over"));
    box.addEventListener("drop", (e) => { e.preventDefault(); box.classList.remove("ex-over"); void add([...((e as DragEvent).dataTransfer?.files ?? [])]); });
    draw();
    return box;
}
