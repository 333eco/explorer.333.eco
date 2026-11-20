/* The colour theme, shared byte-identical by login.333.eco, sign.333.eco and origin.333.eco (a test in each pins it).
   System by default; the footer's Auto / Light / Dark is an override that Auto clears. Loaded in <head> so a stored
   choice applies before the first paint. Storage in try/catch (a blocked store means "Auto", never an error). The
   toggle ships `hidden`, so a page without script never shows a control that does nothing; this script marks <html>
   with data-theme-js before the body is read, and hb.css shows the toggle from the FIRST paint (A662 perf-5, 2026-11-19:
   revealed at DOMContentLoaded, it added a footer row late and a footer in view jumped up 40 px at ~0.8 s). */
(function () {
    var KEY = "hb-theme", root = document.documentElement;
    root.setAttribute("data-theme-js", "");
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
/* The page strip's current tab (founder 2026-11-20, /beautify round 2: "snaps so no word is cut", "the current tab always fully shown").
   Shared here because this is the one script every page with a .nav loads (login, sign, origin, developers). Below 1024 px the strip is
   one swiping row with a 48 px fade at its right edge: put the leftmost tab whose start, at the edge, leaves the current one clear of the
   fade; if the strip ends before that, give it room (blank space after the last tab, under the fade). Centering the tab (origin's old
   way) cut the strip's first tab mid-word whenever the scroll range ended first. At ≥ 1024 px the nav is a left panel: not touched.
   Run after the fonts, so the widths are the real ones. No .nav, or nothing to scroll: nothing happens. */
(function () {
    function room(nav, px) {
        var r = nav.querySelector(".nav-room");
        if (!r) { r = document.createElement("span"); r.className = "nav-room"; r.setAttribute("aria-hidden", "true"); r.style.cssText = "flex:none;width:0;height:1px"; nav.appendChild(r); }
        r.style.width = (parseFloat(r.style.width) || 0) + px + "px";
    }
    function place() {
        var nav = document.querySelector(".nav"), cur = nav && nav.querySelector('a[aria-current="page"]');
        if (!nav || !cur || getComputedStyle(nav).flexDirection !== "row" || nav.scrollWidth <= nav.clientWidth + 1) return;
        var FADE = 48, box = nav.getBoundingClientRect(), all = nav.querySelectorAll("a"), tabs = [];
        for (var k = 0; k < all.length; k++) if (all[k].getClientRects().length) tabs.push(all[k]);   // a hidden tab (the app's name above 560 px) has no box
        var at = function (a) { return a.getBoundingClientRect().left - box.left + nav.scrollLeft; };
        var first = at(tabs[0]), end = at(cur) + cur.getBoundingClientRect().width, lead = cur;
        for (var i = 0; i < tabs.length; i++) if (end <= at(tabs[i]) - first + nav.clientWidth - FADE) { lead = tabs[i]; break; }
        var want = at(lead) - first, max = nav.scrollWidth - nav.clientWidth;
        if (want > max) room(nav, want - max);
        nav.scrollLeft = want;
        var mm = nav.querySelector(".nav-more"); if (mm) mm.style.visibility = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - mm.offsetWidth - 2 ? "visible" : "hidden";
    }
    /* The › at the strip's right end (founder 2026-11-20: "add the › at the end of the strip", after two cold readers called the fade alone
       "cut off"). Pinned to the strip's right edge (sticky, inside the strip), shown only while tabs remain hidden to the right; a tap
       scrolls to the next whole tab. It carries the fade itself, so the strip's own fade (the no-script one) is turned off when it is
       there. aria-hidden: keyboards and screen readers already reach every tab; it is a cue for the eye and the thumb, with no words. */
    function more() {
        var nav = document.querySelector(".nav");
        // only a strip that overflows gets one: the 48 px › would itself make a strip that fits overflow
        if (!nav || nav.querySelector(".nav-more") || getComputedStyle(nav).flexDirection !== "row" || nav.scrollWidth <= nav.clientWidth + 1) return;
        var m = document.createElement("span");
        m.className = "nav-more"; m.setAttribute("aria-hidden", "true"); m.textContent = "\u203a";
        nav.appendChild(m); nav.classList.add("has-more");
        var update = function () {
            var row = getComputedStyle(nav).flexDirection === "row";
            var hidden = row && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - m.offsetWidth - 2;
            m.style.visibility = hidden ? "visible" : "hidden";
        };
        m.addEventListener("click", function () {
            // The next view starts on a WHOLE tab: the first one not fully shown — but never past the start that just fits the last
            // tab, because a scroll that runs into the range's end stops mid-tab (the end clamp cut "Your records" on the first try).
            var box = nav.getBoundingClientRect(), all = nav.querySelectorAll("a"), tabs = [];
            for (var k = 0; k < all.length; k++) if (all[k].getClientRects().length) tabs.push(all[k]);
            var at = function (a) { return a.getBoundingClientRect().left - box.left + nav.scrollLeft; }, first = at(tabs[0]);
            var right = nav.scrollLeft + nav.clientWidth - m.offsetWidth, next = null, fit = null, last = tabs[tabs.length - 1];
            var lastEnd = at(last) + last.getBoundingClientRect().width - first;
            for (var i = 0; i < tabs.length; i++) {
                var st = at(tabs[i]) - first, en = st + tabs[i].getBoundingClientRect().width;
                if (next === null && en > right - first + 1) next = st;
                if (fit === null && lastEnd - st <= nav.clientWidth) fit = st;
            }
            if (next === null) return;
            var to = fit === null ? next : Math.min(next, fit), max = nav.scrollWidth - nav.clientWidth;
            // the range may end a few pixels short of that whole tab's start (measured 2026-11-20: 516 vs 529): give it the room first
            if (to > max) room(nav, to - max);
            var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
            nav.scrollTo({ left: to, behavior: reduce ? "auto" : "smooth" });
        });
        var queued = false;
        nav.addEventListener("scroll", function () { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; update(); }); } }, { passive: true });
        window.addEventListener("resize", update);
        update();
    }
    document.addEventListener("DOMContentLoaded", function () {
        var go = function () { more(); place(); window.addEventListener("resize", more); };
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
    });
})();
