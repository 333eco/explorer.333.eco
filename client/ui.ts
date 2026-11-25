// The page's small DOM helpers, shared by app.ts and attachments.ts (moved here unchanged on 2026-11-25, so the B-Mail file box can be
// built, and driven in real Chrome by scripts/drive.mjs, apart from the rest of the page). Nothing here touches the page at import.
export type Kid = Node | string | null | undefined | false;
export const isKm = () => document.documentElement.lang === "km";
export const say = (en: string, km: string) => (isKm() ? km : en);
export function h(tag: string, attrs: Record<string, string | boolean | ((e: any) => void)> = {}, ...kids: Kid[]) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (typeof v === "function") n.addEventListener(k.slice(2), v as EventListener);
        else if (v === true) n.setAttribute(k, "");
        else if (v !== false) n.setAttribute(k, v);
    }
    n.append(...(kids.filter(Boolean) as (Node | string)[]));
    return n;
}
export const short = (s: string) => `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)} … ${s.slice(-4)}`;
export const leg = (ok: boolean | null, title: string, ...body: Kid[]) => h("div", { class: "ex-leg" }, h("b", { class: ok === true ? "ex-ok" : ok === false ? "ex-bad" : "" }, title), h("p", {}, ...body));
