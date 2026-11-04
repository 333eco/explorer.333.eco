// Runs before the first paint: the person's stored choice, else the browser's. The same stored key as the identity pages.
(function () { var s; try { s = localStorage.getItem("hb_lang"); } catch (e) {} document.documentElement.lang = s === "km" || s === "en" ? s : /^km\b/i.test(navigator.language || "") ? "km" : "en"; })();
