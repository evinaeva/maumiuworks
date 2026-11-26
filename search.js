/* Site search in the header of every page of maumiuworks.com (owner 26.11.2026: «поле поиска в шапку, после 2 символов
   выпадают подсказки, сначала ищем на странице, потом по сайту»). No library, no server: the site index is
   /search-index.json (built by site_kit.write_search_index), loaded on the first focus. Words come from the page
   (data-* of .srch, from site/i18n/<lang>.json). Combobox pattern: arrows, Enter, Escape; works with a screen reader. */
(function () {
  "use strict";
  var box = document.querySelector(".srch");
  if (!box) return;
  var inp = box.querySelector(".srch-in"), list = box.querySelector(".srch-list"), btn = box.querySelector(".srch-btn");
  var W = { page: box.getAttribute("data-page"), site: box.getAttribute("data-site"), none: box.getAttribute("data-none") };
  var lang = (document.documentElement.lang || "en");
  var base = lang.split("-")[0];
  var index = null, loading = null, opts = [], act = -1, blocks = null, timer = 0;

  function norm(s) {
    // accents off (é → e), then NFC again: kana with dakuten stay one character, so positions match the original text
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC").replace(/ё/g, "е");
  }
  function terms(q) { return norm(q).split(/\s+/).filter(Boolean); }

  function load() {
    if (index || loading) return loading;
    loading = fetch("/search-index.json", { credentials: "omit" }).then(function (r) { return r.json(); })
      .then(function (j) { index = j; return j; }).catch(function () { index = []; return index; });
    return loading;
  }

  // ---- this page: headings, paragraphs, list items, table cells of <main> (not navigation)
  function pageBlocks() {
    if (blocks) return blocks;
    blocks = [];
    var els = document.querySelectorAll("main h1, main h2, main h3, main h4, main p, main li, main td, main dt, main dd, main summary, main figcaption");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest("nav, .srch, .toc, script, style")) continue;
      var tx = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (tx.length < 2) continue;
      blocks.push({ el: el, t: tx, n: norm(tx) });
    }
    return blocks;
  }

  function pageHits(ts) {
    var out = [], seen = {};
    var bs = pageBlocks();
    for (var i = 0; i < bs.length && out.length < 5; i++) {
      var b = bs[i], ok = true;
      for (var k = 0; k < ts.length; k++) if (b.n.indexOf(ts[k]) < 0) { ok = false; break; }
      if (!ok) continue;
      var key = b.n.slice(0, 80);
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ kind: "page", el: b.el, title: snippet(b.t, b.n, ts[0]), sub: "" });
    }
    return out;
  }

  function snippet(t, n, term) {
    var at = n.indexOf(term), from = Math.max(0, at - 40), to = Math.min(t.length, at + term.length + 70);
    if (from > 0) { var sp = t.indexOf(" ", from); if (sp >= 0 && sp < at) from = sp + 1; }       // whole words only
    if (to < t.length) { var sp2 = t.lastIndexOf(" ", to); if (sp2 > at + term.length) to = sp2; }
    return (from > 0 ? "…" : "") + t.slice(from, to).trim() + (to < t.length ? "…" : "");
  }

  // ---- the site: pages of the index, the page's own language first, one result per page (its best language)
  function siteHits(ts) {
    if (!index) return [];
    var best = {};
    var xd = document.querySelector('link[rel="alternate"][hreflang="x-default"]');
    var here = xd ? new URL(xd.href, location.href).pathname : location.pathname;   // this page in any language
    for (var i = 0; i < index.length; i++) {
      var e = index[i];
      if (e.u === location.pathname || (e.g || e.u) === here) continue;
      var t = norm(e.t), h = norm(e.h), d = norm(e.d), s = 0;
      for (var k = 0; k < ts.length; k++) {
        var x = ts[k];
        if (t.indexOf(x) >= 0) s += 5; else if (h.indexOf(x) >= 0) s += 3; else if (d.indexOf(x) >= 0) s += 1; else { s = 0; break; }
      }
      if (!s) continue;
      var lb = e.l.split("-")[0];
      s += e.l === lang ? 4 : lb === base ? 3 : lb === "en" ? 1 : 0;
      var g = e.g || e.u;
      if (!best[g] || best[g].s < s) best[g] = { s: s, e: e };
    }
    var arr = Object.keys(best).map(function (g) { return best[g]; });
    arr.sort(function (a, b) { return b.s - a.s; });
    return arr.slice(0, 8).map(function (x) { return { kind: "site", href: x.e.u, title: x.e.t, sub: x.e.d }; });
  }

  // ---- render (text only through textContent: page text and index text never become markup)
  function mark(parent, text, ts) {
    var n = norm(text), pos = 0, ranges = [];
    ts.forEach(function (x) { var i = n.indexOf(x); if (i >= 0) ranges.push([i, i + x.length]); });
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    ranges.forEach(function (r) {
      if (r[0] < pos) return;
      parent.appendChild(document.createTextNode(text.slice(pos, r[0])));
      var m = document.createElement("mark");
      m.textContent = text.slice(r[0], r[1]);
      parent.appendChild(m);
      pos = r[1];
    });
    parent.appendChild(document.createTextNode(text.slice(pos)));
  }

  function group(label) {
    var g = document.createElement("div");
    g.className = "srch-g";
    g.setAttribute("role", "presentation");
    g.textContent = label;
    list.appendChild(g);
  }

  function option(o, ts) {
    var a = document.createElement("a");
    a.className = "srch-o";
    a.id = "srch-o-" + opts.length;
    a.setAttribute("role", "option");
    a.setAttribute("aria-selected", "false");
    a.href = o.kind === "site" ? o.href : "#";
    var st = document.createElement("strong");
    mark(st, o.title, ts);
    a.appendChild(st);
    if (o.sub) {
      var sp = document.createElement("span");
      sp.textContent = o.sub.length > 120 ? o.sub.slice(0, 118) + "…" : o.sub;
      a.appendChild(sp);
    }
    a.addEventListener("mousedown", function (ev) { ev.preventDefault(); });   // keep focus in the field
    a.addEventListener("click", function (ev) { choose(o, ev); });
    list.appendChild(a);
    opts.push({ o: o, a: a });
  }

  function render() {
    var q = inp.value.trim();
    list.innerHTML = "";
    opts = []; act = -1;
    inp.removeAttribute("aria-activedescendant");
    if (q.length < 2) { close(); return; }
    var ts = terms(q);
    var p = pageHits(ts), s = siteHits(ts);
    if (p.length) { group(W.page); p.forEach(function (o) { option(o, ts); }); }
    if (s.length) { group(W.site); s.forEach(function (o) { option(o, ts); }); }
    if (!p.length && !s.length) {
      var none = document.createElement("div");
      none.className = "srch-none";
      none.setAttribute("role", "presentation");
      none.textContent = index ? W.none : "…";
      list.appendChild(none);
    }
    list.hidden = false;
    inp.setAttribute("aria-expanded", "true");
  }

  function close() {
    list.hidden = true;
    inp.setAttribute("aria-expanded", "false");
    inp.removeAttribute("aria-activedescendant");
    act = -1;
  }

  function move(d) {
    if (!opts.length) return;
    if (act >= 0) opts[act].a.setAttribute("aria-selected", "false");
    act = (act + d + opts.length) % opts.length;
    var a = opts[act].a;
    a.setAttribute("aria-selected", "true");
    inp.setAttribute("aria-activedescendant", a.id);
    a.scrollIntoView({ block: "nearest" });
  }

  function choose(o, ev) {
    if (o.kind === "page") {
      if (ev) ev.preventDefault();
      close();
      var el = o.el;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("srch-hit");
      setTimeout(function () { el.classList.remove("srch-hit"); }, 2400);
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    } else if (!ev) {
      location.href = o.href;
    }
  }

  inp.addEventListener("focus", function () { load(); if (inp.value.trim().length >= 2) render(); });
  inp.addEventListener("input", function () {
    clearTimeout(timer);
    var p = load();
    timer = setTimeout(function () { if (index) render(); else if (p) { render(); p.then(render); } }, 80);
  });
  inp.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) render(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      if (opts.length) { e.preventDefault(); choose(opts[act >= 0 ? act : 0].o); }
    } else if (e.key === "Escape") {
      if (!list.hidden) { e.preventDefault(); close(); }
      else if (box.classList.contains("open")) { box.classList.remove("open"); btn && btn.focus(); }
    }
  });
  inp.addEventListener("blur", function () {
    setTimeout(function () {
      if (box.contains(document.activeElement)) return;
      close();
      if (!inp.value) box.classList.remove("open");
      if (btn) btn.setAttribute("aria-expanded", box.classList.contains("open") ? "true" : "false");
    }, 120);
  });
  if (btn) btn.addEventListener("click", function () {
    box.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    inp.focus();
  });
  document.addEventListener("keydown", function (e) {     // «/» focuses the search, as on many sites
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "") &&
        !(document.activeElement || {}).isContentEditable) {
      e.preventDefault();
      if (btn && getComputedStyle(btn).display !== "none") btn.click(); else inp.focus();
    }
  });
})();
