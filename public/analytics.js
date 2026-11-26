// Site analytics: Cloudflare Web Analytics + HeartBank /api/track beacon.
// No-ops on local hosts so development doesn't emit CORS/network errors.
(function () {
    var h = location.hostname;
    if (
        h === "localhost" ||
        h === "127.0.0.1" ||
        h === "::1" ||
        h === "[::1]" ||
        h === "" ||
        h.endsWith(".local") ||
        location.protocol === "file:"
    ) {
        return;
    }

    // Cloudflare Web Analytics
    var cf = document.createElement("script");
    cf.defer = true;
    cf.src = "https://static.cloudflareinsights.com/beacon.min.js";
    cf.setAttribute(
        "data-cf-beacon",
        '{"token": "70fe80cf011244acb356dcf770603ead"}'
    );
    document.head.appendChild(cf);

    // HeartBank analytics → thonly.org/api/track
    var ENDPOINT = "https://thonly.org/api/track";
    var deviceId;
    try {
        deviceId = localStorage.getItem("ma-device");
        if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem("ma-device", deviceId);
        }
    } catch (e) {
        deviceId = "anon";
    }
    // login.333.eco gives this cookie to a founder account's browser when it logs in, so his own visits don't ring his phone.
    // One bit and no identity: nobody else ever gets it, and all anyone gains by forging it is not ringing that phone.
    var admin = /(?:^|;\s*)ma-admin=1(?:;|$)/.test(document.cookie);

    function post(event, data) {
        try {
            fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event: event,
                    data: data,
                    deviceId: deviceId,
                    location: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    // A369: true under automation (navigator.webdriver — /safari's
                    // simulator, a headless crawler). /api/track stores it, the
                    // admin push skips the row and /estate classes it machine.
                    wd: navigator.webdriver === true,
                    admin: admin
                }),
                keepalive: true
            }).catch(function () {});
        } catch (e) {}
    }

    // Single-page-app page_view tracking. These sites route client-side via the
    // History API (@lit-labs/router: pushState + popstate, path-based — no hash),
    // so navigating to /about or /login changes the URL without a document load.
    // Fire page_view on first load AND on every route change, de-duped on path.
    var lastPath = null;
    // Who visits whose page is never recorded: a person's address is logged as "/@", with no name.
    // Copied from 333.eco's beacon (333.eco static/analytics.js, `masked`; founder 2026-11-08/09). Here it masks each link_click's
    // href, so the B-Mail check page's thank link is recorded as https://333.eco/@?thank=b-mail#thank (scripts/check-analytics.mjs).
    function masked(u) {
        return String(u).replace(/\/@[^/?#]*/, "/@");
    }
    function pageView() {
        if (location.pathname === lastPath) return;
        lastPath = location.pathname;
        var maView = { path: location.pathname, ref: document.referrer };
        // The utm_source tag alone, on the landing view only (2026-11-22): an AI assistant's app
        // sends no referrer, so ChatGPT tags the links it shows instead. Never the rest of the query.
        if (!window.__maUtmRead) {
            window.__maUtmRead = true;
            try {
                var maUtm = (new URLSearchParams(location.search).get("utm_source") || "")
                    .slice(0, 64)
                    .replace(/[^\w.:-]/g, "");
                if (maUtm) maView.utm = maUtm;
            } catch (e) {}
        }
        post("page_view", maView);
    }
    function wrap(name) {
        var orig = history[name];
        if (typeof orig !== "function") return;
        history[name] = function () {
            var r = orig.apply(this, arguments);
            pageView();
            return r;
        };
    }
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", pageView);
    pageView();

    document.addEventListener("click", function (e) {
        // A click inside a shadow root is retargeted at the document, so
        // e.target is the HOST element and closest() from it never reaches the
        // anchor — which missed every link in a Lit component, i.e. nearly all
        // of them. composedPath() crosses shadow boundaries; closest() stays as
        // the pre-shadow-DOM fallback.
        var a = null;
        var path = (e.composedPath && e.composedPath()) || [];
        for (var i = 0; i < path.length; i++) {
            if (path[i].nodeType === 1 && path[i].matches("a[href]")) {
                a = path[i];
                break;
            }
        }
        if (!a && e.target.closest) a = e.target.closest("a[href]");
        if (!a) return;
        post("link_click", {
            href: masked(a.href),
            internal: String(a.host === location.host)
        });
    });
})();
