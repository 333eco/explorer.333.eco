/* The colour theme, shared byte-identical by login.333.eco, sign.333.eco and origin.333.eco (a test in each pins it).
   System by default; the footer's Auto / Light / Dark is an override that Auto clears. Loaded in <head> so a stored
   choice applies before the first paint. Storage in try/catch (a blocked store means "Auto", never an error). The
   toggle ships `hidden` and this script reveals it, so a page without script never shows a control that does nothing. */
(function () {
    var KEY = "hb-theme", root = document.documentElement;
    var get = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
    var paint = function (c) {
        if (c === "light" || c === "dark") root.setAttribute("data-theme", c); else root.removeAttribute("data-theme");
        var bs = document.querySelectorAll("[data-theme-choice]");
        for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", String(bs[i].getAttribute("data-theme-choice") === c));
    };
    var saved = get(); var now = saved === "light" || saved === "dark" ? saved : "auto";
    paint(now);
    document.addEventListener("DOMContentLoaded", function () {
        paint(now);
        var bs = document.querySelectorAll("[data-theme-choice]");
        for (var i = 0; i < bs.length; i++) bs[i].addEventListener("click", function () {
            var c = this.getAttribute("data-theme-choice") || "auto";
            try { if (c === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch (e) {}
            now = c; paint(c);
        });
        var gs = document.querySelectorAll("[data-theme-ui]");
        for (var j = 0; j < gs.length; j++) gs[j].hidden = false;
    });
})();
