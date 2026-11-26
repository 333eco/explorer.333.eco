/**
 * The invitation on the B-Mail check page (founder 2026-11-14, on the substrate's pushback to his Hotmail idea: "Excellent pushback;
 * save and build it now"; canon [[project_b_origin]] §b-mail-viral-loop). A person's signed message carries only the FACT (its
 * signature line); the invitation lives HERE, on a page the reader chose to open, stated once.
 *
 * ⭐ Shown only for a found record the signer has not withdrawn, whose signed text names an @name: never beside a failed check, and
 *    never about a name the message does not carry.
 * ⛔ Never "free" (the registry's fee step stands, in test mode) · never "verified" · no count, no countdown, no second ask.
 * ⭐ `from=b-mail` marks the channel on OUR link, never in anyone's mail: the beacon's link_click carries the full href, which is the
 *    count prediction P-BM1 reads. Nothing about the reader is added.
 */
export const INVITE_HREF = "https://333.eco/?from=b-mail";

/**
 * The second line (founder 2026-11-14: anyone can sign a mail at sign.333.eco/b-mail, live that day; his bar for it, P-BM3, "10%",
 * registered before this line shipped). Shown beside any found record its signer has not withdrawn, with or without an @name:
 * signing a mail needs none. `from=b-mail` marks the channel on OUR link; the page it opens reads only `lang` from its query.
 */
export const SIGN_HREF = "https://sign.333.eco/b-mail?from=b-mail";
export function maySign(text: string, found: boolean, withdrawn: boolean): boolean {
    return found && !withdrawn && text.startsWith("b-mail/v1\n") && text.indexOf("\n\n") > 0;
}

/** The @name to invite with, or null when the page must not invite. */
export function invitationFor(text: string, found: boolean, withdrawn: boolean): string | null {
    if (!found || withdrawn || !text.startsWith("b-mail/v1\n")) return null;
    const cut = text.indexOf("\n\n");
    if (cut < 0) return null;
    return /^name: (@[A-Za-z0-9._-]{1,64})$/m.exec(text.slice(0, cut + 1))?.[1] ?? null;
}

/**
 * The thank back (founder 2026-11-25, B-Mail thanks phase 3, part (a); the board C1 at demo.333.eco). One line, *Thank @x for this
 * mail*, offered once, after the page's two fine-print lines and before the two invitations.
 * ⭐ Shown ONLY beside a found record its signer has not withdrawn, whose signed text names an @name AND whose signer check ran on
 *    this page and PASSED (`signerPassed === true`, the row *Signed with @x's passkey*): the link goes to that same @x.
 * ⛔ Never beside an unconfirmed name (no proof in the link, or a passkey that page doesn't show: `null`), a proof that doesn't fit
 *    the record (`false`), a withdrawn record (its signer check can still pass), no record, or a statement with no `name:` line.
 * ⛔ The link never carries `from=b-mail` (that marker counts the two invitations); it carries `thank=b-mail`, which opens the
 *    Thank at once on 333.eco, and nothing about the reader or the message. ⛔ No words are ever filled in for the reader.
 * DRAFT Khmer (ours).
 */
export const thankHref = (at: string) => `https://333.eco/${at}?thank=b-mail#thank`;
export const thankWords = (at: string): [string, string] => [`Thank ${at} for this mail`, `អរគុណ ${at} សម្រាប់សំបុត្រនេះ`];
export function thankFor(text: string, found: boolean, withdrawn: boolean, signerPassed: boolean | null | undefined): string | null {
    if (signerPassed !== true) return null;
    return invitationFor(text, found, withdrawn);
}
