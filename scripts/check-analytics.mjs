// The beacon never records WHOSE page (founder 2026-11-08/09; 333.eco's own beacon, static/analytics.js `masked`): a link_click's href
// carries a person's address as "/@", with no name. This runs the SHIPPED public/analytics.js in a sandbox as if on explorer.333.eco,
// clicks links through its own click handler and reads what it would send. Nothing reaches the network: fetch is a stub.
// The control runs the same clicks through a copy of the file with the mask taken out, which must leak the name.
//   node scripts/check-analytics.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../public/analytics.js", import.meta.url), "utf8");
function clicks(src, hrefs) {
    const sent = [], listeners = {};
    const store = new Map();
    const ctx = {
        location: { hostname: "explorer.333.eco", host: "explorer.333.eco", protocol: "https:", pathname: "/b-mail", search: "" },
        document: {
            cookie: "", referrer: "",
            createElement: () => ({ setAttribute() {} }), head: { appendChild() {} },
            addEventListener: (t, f) => { (listeners[t] ??= []).push(f); },
        },
        history: { pushState() {}, replaceState() {} },
        window: { addEventListener() {} },
        localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
        crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000000" },
        navigator: { webdriver: false }, Intl, URLSearchParams, JSON, String,
        fetch: (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return Promise.resolve(); },
    };
    vm.runInNewContext(src, ctx);
    for (const href of hrefs) {
        const a = { nodeType: 1, matches: (s) => s === "a[href]", href, host: new URL(href).host };
        for (const f of listeners.click ?? []) f({ composedPath: () => [a], target: a });
    }
    return sent.filter((s) => s.body.event === "link_click").map((s) => s.body.data.href);
}

const THANK = "https://333.eco/@sokha.keo?thank=b-mail#thank", INVITE = "https://333.eco/?from=b-mail", SIGN = "https://sign.333.eco/b-mail?from=b-mail";
const OTHER = ["https://333.eco/@a_b-c.d", "https://333.eco/@x/", "https://explorer.333.eco/origin/26"];
let code = 0;
const must = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) code = 1; };

const got = clicks(SRC, [THANK, INVITE, SIGN, ...OTHER]);
must(got.length === 6, `each click sends one link_click (${got.length})`);
must(got[0] === "https://333.eco/@?thank=b-mail#thank", `the thank link is recorded as https://333.eco/@?thank=b-mail#thank (got ${JSON.stringify(got[0])})`);
must(!got.some((h) => /@[A-Za-z0-9._-]/.test(h)), `no @name survives in any recorded href (${JSON.stringify(got.filter((h) => /@[A-Za-z0-9._-]/.test(h)))})`);
must(/[?&]thank=b-mail/.test(got[0] ?? ""), "the thank=b-mail marker P-BM4 counts survives the mask");
must(got[1] === INVITE && got[2] === SIGN, `the two from=b-mail links come through unchanged (${JSON.stringify(got.slice(1, 3))})`);
must(got[3] === "https://333.eco/@" && got[4] === "https://333.eco/@/" && got[5] === OTHER[2], `other names are masked to the same "/@", and an address with no @ is untouched (${JSON.stringify(got.slice(3))})`);

// CONTROL: the same clicks through the file with its mask removed must leak the name, so the cases above can fail.
const bare = SRC.replace(/href: masked\(a\.href\)/, "href: a.href");
must(bare !== SRC, "CONTROL: the mask's call was found in the shipped file, and taken out of the copy");
const leak = clicks(bare, [THANK, INVITE]);
must(leak[0] === THANK, `CONTROL: without the mask the thank link would carry the name (${JSON.stringify(leak[0])})`);
process.exit(code);
