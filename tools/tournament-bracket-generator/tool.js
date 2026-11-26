/* Single and double elimination bracket generator. Needs ../_shared/tools.js (window.MW) loaded first. */
(function () {
  'use strict';
  var MAX = 128;
  // Layout in rem, so the bracket grows with the reader's text size.
  var COL_W = 12.5, COL_GAP = 2.75, LABEL_H = 2.4, NUM_H = 1.35, ROW_H = 2.75, BOX_H = 5.5, GAP = 0.85;
  var PITCH = NUM_H + BOX_H + GAP;

  function start() {
    var root = document.getElementById('tl-br');
    if (!root || !window.MW) return;
    var E = window.MW.engine, U = window.MW.ui, $ = function (id) { return document.getElementById(id); };
    var form = $('br-form'), namesEl = $('br-names'), err = $('br-error'), count = $('br-count');
    var result = $('br-result'), statusEl = $('br-status'), sectionsEl = $('br-sections');
    var t = null, names = [], undo = [], sb = null, nums = null, byId = null, visRounds = {};

    function format() { return form.querySelector('input[name=br-format]:checked').value; }
    function setError(text) { err.innerHTML = text ? '<p class="tl-error">' + U.esc(text) + '</p>' : ''; }
    function syncOptions() {
      var d = format() === 'double';
      $('br-opt-third').hidden = d;
      $('br-opt-reset').hidden = !d;
    }
    function updateCount() {
      var list = E.parseNames(namesEl.value), dup = E.duplicates(list);
      count.textContent = list.length ? U.plural(list.length, 'name') + ' found.' + (dup.length ? ' Listed twice: ' + dup.join(', ') + '.' : '') : '';
    }

    // ------------------------------------------------------------ build
    function build(list, fmt, opts, resultsCode) {
      names = list;
      t = E.create(fmt, list.length, opts);
      t.opts = opts;
      byId = {}; t.matches.forEach(function (m) { byId[m.id] = m; });
      sb = E.structuralByes(t);
      nums = E.matchNumbers(t);
      visRounds = {};
      t.matches.forEach(function (m) {
        if (sb[m.id] !== 0) return;
        var a = visRounds[m.section] = visRounds[m.section] || [];
        if (a.indexOf(m.round) < 0) a.push(m.round);
      });
      Object.keys(visRounds).forEach(function (k) { visRounds[k].sort(function (a, b) { return a - b; }); });
      undo = [];
      if (resultsCode) {
        var ids = t.matches.map(function (m) { return m.id; }).sort(function (a, b) { return a - b; });
        ids.forEach(function (id, i) {
          var c = resultsCode.charAt(i);
          if (c === 'h' || c === 'a') E.setWinner(t, id, c);
        });
      }
    }

    function make(focus) {
      var list = E.parseNames(namesEl.value), fmt = format();
      setError('');
      var min = fmt === 'double' ? 3 : 2;
      if (list.length < min) { setError('Add at least ' + min + ' names, one per line' + (fmt === 'double' ? ' (double elimination needs 3 or more).' : '.')); namesEl.focus(); return; }
      if (list.length > MAX) { setError('This page makes brackets for up to ' + MAX + ' names. You have ' + list.length + '.'); namesEl.focus(); return; }
      // Same names and format, only an option changed (third place, reset): keep the results already entered.
      var keep = t && t.format === fmt && names.join('\n') === list.join('\n') ? resultsCode() : '';
      build(list, fmt, fmt === 'double' ? { reset: $('br-reset').checked } : { thirdPlace: $('br-third').checked }, keep);
      result.hidden = false;
      render();
      writeHash();
      U.say(statusEl, '');
      if (focus) $('br-title').focus();
    }

    // ------------------------------------------------------------ hash (state lives only in the page and its link)
    function resultsCode() {
      return t.matches.map(function (m) { return m.id; }).sort(function (a, b) { return a - b; })
        .map(function (id) { var r = t.results[id]; return r ? r.w : '-'; }).join('').replace(/-+$/, '');
    }
    function writeHash() {
      if (!t) return;
      var p = new URLSearchParams();
      p.set('f', t.format === 'double' ? 'd' : 's');
      p.set('o', t.format === 'double' ? (t.opts.reset ? 'r' : '') : (t.opts.thirdPlace ? '3' : ''));
      p.set('t', names.join('\n'));
      var rc = resultsCode(); if (rc) p.set('r', rc);
      try { history.replaceState(null, '', '#' + p.toString()); } catch (e) { /* sandboxed */ }
    }
    function readHash() {
      var h = location.hash.replace(/^#/, '');
      if (!h) return false;
      try {
        var p = new URLSearchParams(h), list = (p.get('t') || '').split('\n').filter(function (x) { return x.trim(); });
        var fmt = p.get('f') === 'd' ? 'double' : 'single', o = p.get('o') || '';
        if (list.length < (fmt === 'double' ? 3 : 2) || list.length > MAX) return false;
        form.querySelector('input[name=br-format][value=' + fmt + ']').checked = true;
        $('br-reset').checked = o.indexOf('r') >= 0; $('br-third').checked = o.indexOf('3') >= 0;
        syncOptions();
        namesEl.value = list.join('\n');
        build(list, fmt, fmt === 'double' ? { reset: o.indexOf('r') >= 0 } : { thirdPlace: o.indexOf('3') >= 0 }, p.get('r') || '');
        result.hidden = false;
        render();
        return true;
      } catch (e) { return false; }
    }

    // ------------------------------------------------------------ helpers
    function srcAlwaysBye(s) {
      return s.k === 'bye' || (s.k === 'seed' && s.i >= t.n) || (s.k === 'w' && sb[s.m] === 2) || (s.k === 'l' && sb[s.m] >= 1);
    }
    /** "Winner of M3" for a slot not known yet; a hidden bye match is looked through. */
    function placeholder(s) {
      if (s.k === 'w' || s.k === 'l') {
        var m = byId[s.m];
        if (sb[m.id] === 0) return (s.k === 'w' ? 'Winner of M' : 'Loser of M') + nums[m.id];
        if (s.k === 'w') return placeholder(srcAlwaysBye(m.home) ? m.away : m.home);
      }
      return 'To be decided';
    }
    /**
     * Round name. Winners and losers rounds are counted over the rounds that have a real match: with byes a whole
     * losers round can be byes only, and the page does not show it, so the first round shown is "Losers round 1".
     */
    function roundName(section, round) {
      if (section === 'winners' || section === 'losers') {
        var rs = visRounds[section] || [], i = rs.indexOf(round);
        if (i >= 0) {
          var w = section === 'winners' ? 'Winners' : 'Losers';
          return i === rs.length - 1 ? w + ' final' : w + ' round ' + (i + 1);
        }
      }
      return E.roundLabel(t, section, round);
    }
    function label(m) { return roundName(m.section, m.round); }
    function nameOf(p) { return names[p]; }
    function who(p) { return names[p] + ' (' + (p + 1) + ')'; }
    function visible(m) { return sb[m.id] === 0; }

    /** Visible matches that feed side s of m in the same section, looking through hidden bye matches. */
    function feeders(src, section) {
      if (src.k !== 'w') return [];
      var f = byId[src.m];
      if (!f || f.section !== section) return [];
      if (visible(f)) return [f];
      return feeders(f.home, section).concat(feeders(f.away, section));
    }

    // ------------------------------------------------------------ layout + render
    /**
     * Positions: every match of the section, byes included, gets the place it has in the full bracket (first round
     * one under the other, a later match halfway between the two it comes from). Only real games are drawn; the
     * picture is then squeezed so the closest two boxes in a column touch, which keeps big byes-heavy brackets short.
     */
    function layout(section) {
      var all = t.matches.filter(function (m) { return m.section === section; });
      var ms = all.filter(visible);
      if (!ms.length) return null;
      var rounds = []; ms.forEach(function (m) { if (rounds.indexOf(m.round) < 0) rounds.push(m.round); });
      rounds.sort(function (a, b) { return a - b; });
      var full = {}, allRounds = [];
      all.forEach(function (m) { if (allRounds.indexOf(m.round) < 0) allRounds.push(m.round); });
      allRounds.sort(function (a, b) { return a - b; }).forEach(function (r) {
        var prev = -1;
        all.filter(function (m) { return m.round === r; }).sort(function (a, b) { return a.order - b.order; }).forEach(function (m) {
          var ys = [];
          [m.home, m.away].forEach(function (s) {
            if (s.k === 'w' && byId[s.m] && byId[s.m].section === section && full[s.m] != null) ys.push(full[s.m]);
          });
          var want = ys.length ? ys.reduce(function (a, b) { return a + b; }, 0) / ys.length : prev + 1;
          full[m.id] = Math.max(want, prev + 1);
          prev = full[m.id];
        });
      });
      // Squeeze: the smallest distance between two drawn boxes of one column becomes one box.
      var gap = Infinity, minY = Infinity;
      rounds.forEach(function (r) {
        var ys = ms.filter(function (m) { return m.round === r; }).map(function (m) { return full[m.id]; }).sort(function (a, b) { return a - b; });
        for (var i = 1; i < ys.length; i++) gap = Math.min(gap, ys[i] - ys[i - 1]);
        if (ys.length) minY = Math.min(minY, ys[0]);
      });
      var scale = gap === Infinity || gap <= 1 ? 1 : 1 / gap;
      var pos = {}, maxY = 0, lines = [];
      ms.forEach(function (m) {
        var y = (full[m.id] - minY) * scale;
        pos[m.id] = { col: rounds.indexOf(m.round), y: y };
        maxY = Math.max(maxY, y);
      });
      ms.forEach(function (m) {
        ['home', 'away'].forEach(function (side) {
          feeders(m[side], section).forEach(function (f) { lines.push([f.id, m.id, side]); });
        });
      });
      return { matches: ms, rounds: rounds, pos: pos, maxY: maxY, lines: lines };
    }

    function boxTop(p) { return LABEL_H + p.y * PITCH + NUM_H; }
    function xOf(p) { return p.col * (COL_W + COL_GAP); }

    function slotHtml(m, side, o) {
      var pid = side === 'home' ? o.home : o.away;
      if (typeof pid !== 'number') {
        return '<div class="br-slot is-tbd"><span class="br-seed" aria-hidden="true"></span><span class="br-name">' + U.esc(placeholder(m[side])) + '</span></div>';
      }
      var done = o.state === 'done', win = done && o.winner === pid, lose = done && o.loser === pid;
      var playable = o.state === 'ready' || o.state === 'done';
      var inner = '<span class="br-seed">' + (pid + 1) + '</span><span class="br-name">' + U.esc(nameOf(pid)) + '</span>' +
        '<span class="br-mark" aria-hidden="true">' + (win ? '✓' : '') + '</span>';
      var cls = 'br-slot' + (win ? ' is-win' : '') + (lose ? ' is-lose' : '');
      if (!playable) return '<div class="' + cls + ' is-wait" title="' + U.esc(nameOf(pid)) + '">' + inner + '</div>';
      var aria = nameOf(pid) + ', seed ' + (pid + 1) + (win ? ', winner' : lose ? ', lost' : '');
      return '<button type="button" class="' + cls + '" data-m="' + m.id + '" data-s="' + (side === 'home' ? 'h' : 'a') + '" aria-pressed="' + win +
        '" aria-label="' + U.esc(aria) + '" title="' + U.esc(nameOf(pid)) + '">' + inner + '</button>';
    }

    function matchHtml(m, o, p) {
      var num = nums[m.id];
      var groupLabel = 'M' + num + ', ' + label(m) + ': ' +
        (typeof o.home === 'number' ? nameOf(o.home) : placeholder(m.home)) + ' v ' +
        (typeof o.away === 'number' ? nameOf(o.away) : placeholder(m.away)) +
        (o.state === 'done' ? '. Winner ' + nameOf(o.winner) : o.state === 'ready' ? '. To play' : '');
      var style = 'left:' + xOf(p) + 'rem;top:' + (boxTop(p) - NUM_H) + 'rem';
      if (o.state === 'skipped') {
        return '<div class="br-match is-skipped" style="' + style + '" role="group" aria-label="M' + num + ', ' + U.esc(label(m)) + ': not needed">' +
          '<div class="br-num">M' + num + '</div><div class="br-box br-note">Not needed: the winners-bracket champion won the grand final.</div></div>';
      }
      return '<div class="br-match' + (o.state === 'ready' ? ' is-ready' : '') + '" style="' + style + '" role="group" aria-label="' + U.esc(groupLabel) + '">' +
        '<div class="br-num" aria-hidden="true">M' + num + (m.conditional ? ' · only if needed' : '') + '</div>' +
        '<div class="br-box">' + slotHtml(m, 'home', o) + slotHtml(m, 'away', o) + '</div></div>';
    }

    function sectionHtml(section, title, r) {
      var L = layout(section);
      if (!L) return '';
      var cols = L.rounds.length;
      var w = cols * COL_W + (cols - 1) * COL_GAP, h = LABEL_H + (L.maxY + 1) * PITCH;
      var parts = [];
      L.rounds.forEach(function (rd, col) {
        parts.push('<div class="br-col-label" style="left:' + col * (COL_W + COL_GAP) + 'rem;width:' + COL_W + 'rem">' + U.esc(roundName(section, rd)) + '</div>');
      });
      var paths = L.lines.map(function (ln) {
        var a = L.pos[ln[0]], b = L.pos[ln[1]];
        var x1 = xOf(a) + COL_W, y1 = boxTop(a) + BOX_H / 2;
        var x2 = xOf(b), y2 = boxTop(b) + (ln[2] === 'home' ? ROW_H / 2 : ROW_H * 1.5);
        var mx = x2 - COL_GAP / 2;
        var o = r.outcome(ln[0]);
        var hot = o.state === 'done' ? ' class="is-hot"' : '';
        return '<path' + hot + ' d="M' + x1 + ' ' + y1 + 'H' + mx + 'V' + y2 + 'H' + x2 + '"/>';
      }).join('');
      var svg = '<svg class="br-lines" aria-hidden="true" focusable="false" viewBox="0 0 ' + w + ' ' + h + '" style="width:' + w + 'rem;height:' + h + 'rem" preserveAspectRatio="none">' + paths + '</svg>';
      L.matches.forEach(function (m) { parts.push(matchHtml(m, r.outcome(m.id), L.pos[m.id])); });
      return '<section class="br-section" aria-label="' + U.esc(title) + '"><h3>' + U.esc(title) + '</h3>' +
        '<div class="br-scroll" tabindex="0" role="region" aria-label="' + U.esc(title) + ', scrolls sideways">' +
        '<div class="br-canvas" style="width:' + w + 'rem;height:' + h + 'rem">' + svg + parts.join('') + '</div></div></section>';
    }

    function byeSeeds() {
      var r = E.resolver(t), out = [];
      t.matches.forEach(function (m) {
        if ((m.section === 'main' || m.section === 'winners') && m.round === 0 && sb[m.id] === 1) {
          var o = r.outcome(m.id); out.push(typeof o.home === 'number' ? o.home : o.away);
        }
      });
      return out.sort(function (a, b) { return a - b; });
    }

    function seedRange(list) {
      if (!list.length) return '';
      if (list.length === 1) return 'seed ' + (list[0] + 1);
      if (list.length === 2) return 'seeds ' + (list[0] + 1) + ' and ' + (list[1] + 1);
      var contiguous = list[list.length - 1] - list[0] === list.length - 1;
      return contiguous ? 'seeds ' + (list[0] + 1) + '–' + (list[list.length - 1] + 1) : 'seeds ' + list.map(function (x) { return x + 1; }).join(', ');
    }

    function render(focusKey) {
      var r = E.resolver(t), n = t.n, real = E.realMatches(t).length;
      var byes = byeSeeds();
      var size = E.nextPow2(Math.max(2, n));
      var s = U.plural(n, 'team') + ', ' + (t.format === 'double' ? 'double' : 'single') + ' elimination in ' + (/^8/.test(String(size)) ? 'an ' : 'a ') + size + '-place bracket: ';
      if (t.format === 'double') {
        s += (t.opts.reset ? (real - 1) + ' games, or ' + real + ' if the grand final reset is needed' : U.plural(real, 'game')) + '.';
      } else {
        s += U.plural(real, 'game') + ' in ' + U.plural(E.log2ceil(size), 'round') + '.';
      }
      s += byes.length ? ' ' + U.plural(byes.length, 'bye') + ': ' + seedRange(byes) + ' go straight to ' + (t.format === 'double' ? 'winners round 2' : 'round 2') + '.' : ' No byes.';
      $('br-summary').textContent = s;

      var html = '';
      if (t.format === 'double') {
        html += sectionHtml('winners', 'Winners bracket', r) + sectionHtml('losers', 'Losers bracket', r) + sectionHtml('final', 'Grand final', r);
      } else {
        html += sectionHtml('main', 'Bracket', r) + sectionHtml('third', 'Third-place match', r);
      }
      sectionsEl.innerHTML = html;
      $('br-undo').disabled = !undo.length;
      $('br-clear').disabled = !Object.keys(t.results).length;
      renderPodium();
      if (focusKey) {
        var b = sectionsEl.querySelector('button[data-m="' + focusKey[0] + '"][data-s="' + focusKey[1] + '"]');
        if (b) b.focus({ preventScroll: true });
      }
    }

    function renderPodium() {
      var p = E.podium(t), box = $('br-podium');
      if (!p.length) { box.innerHTML = ''; return; }
      var place = ['Champion', 'Second', 'Third'];
      box.innerHTML = '<div class="tl-card br-podium-card"><h3>Final places</h3><ol>' + p.map(function (ids, i) {
        return '<li><span class="br-place">' + place[i] + '</span> ' + ids.map(function (x) { return '<strong>' + U.esc(nameOf(x)) + '</strong>'; }).join(' and ') + '</li>';
      }).join('') + '</ol></div>';
    }

    // ------------------------------------------------------------ results
    function snapshot() { return JSON.stringify(t.results); }
    function nextOf(matchId) {
      var out = [];
      t.matches.forEach(function (m) {
        if ((m.home.k === 'w' && m.home.m === matchId) || (m.away.k === 'w' && m.away.m === matchId)) out.push(m);
      });
      return out;
    }
    function pick(matchId, side) {
      var r = E.resolver(t), o = r.outcome(matchId), m = byId[matchId];
      var pid = side === 'h' ? o.home : o.away;
      undo.push(snapshot());
      if (undo.length > 200) undo.shift();
      var res, msg;
      if (o.state === 'done' && o.winner === pid) {
        res = E.clearResult(t, matchId);
        msg = 'Result of M' + nums[matchId] + ' cleared.';
      } else {
        res = E.setWinner(t, matchId, side);
        msg = nameOf(pid) + ' wins M' + nums[matchId] + '.';
        var nx = nextOf(matchId).filter(function (x) { return x.section === m.section || x.section === 'final'; })[0];
        if (m.section === 'final' && !m.conditional) {
          var r2 = E.resolver(t), reset = t.matches.filter(function (x) { return x.conditional; })[0];
          if (reset && r2.outcome(reset.id).state === 'ready') msg += ' Both teams now have one loss: the grand final reset decides.';
        } else if (nx) msg += ' Next: ' + label(nx) + '.';
      }
      if (res.cleared.length) {
        msg += ' Cleared ' + U.plural(res.cleared.length, 'later result') + ' (' + res.cleared.map(function (id) { return 'M' + nums[id]; }).join(', ') + ') because a different team goes through. Undo brings ' + (res.cleared.length === 1 ? 'it' : 'them') + ' back.';
      }
      var p = E.podium(t);
      if (p.length) msg += ' ' + nameOf(p[0][0]) + ' is the champion.';
      render([matchId, side]);
      writeHash();
      U.say(statusEl, msg);
    }

    sectionsEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-m]');
      if (!b) return;
      pick(+b.getAttribute('data-m'), b.getAttribute('data-s'));
    });

    // ------------------------------------------------------------ exports
    function slotText(m, side, o) {
      var pid = side === 'home' ? o.home : o.away;
      return typeof pid === 'number' ? who(pid) : placeholder(m[side]);
    }
    function ordered() {
      return t.matches.filter(visible).sort(function (a, b) { return nums[a.id] - nums[b.id]; });
    }
    function asText() {
      var r = E.resolver(t), out = [], last = '';
      out.push((t.format === 'double' ? 'Double' : 'Single') + ' elimination bracket, ' + U.plural(t.n, 'team'));
      out.push('Seeds: ' + names.map(function (nm, i) { return (i + 1) + ' ' + nm; }).join(', '));
      var byes = byeSeeds();
      if (byes.length) out.push('Byes (straight to round 2): ' + byes.map(who).join(', '));
      ordered().forEach(function (m) {
        var o = r.outcome(m.id), head = label(m);
        if (head !== last) { out.push('', head); last = head; }
        var line = '  M' + nums[m.id] + '  ' + slotText(m, 'home', o) + ' v ' + slotText(m, 'away', o);
        if (o.state === 'done') line += '  -> ' + nameOf(o.winner) + ' won';
        else if (o.state === 'skipped') line += '  (not needed)';
        else if (m.conditional) line += '  (only if needed)';
        out.push(line);
      });
      var p = E.podium(t);
      if (p.length) {
        out.push('');
        ['Champion', 'Second', 'Third'].forEach(function (pl, i) { if (p[i]) out.push(pl + ': ' + p[i].map(nameOf).join(' and ')); });
      }
      return out.join('\n') + '\n';
    }
    function asCsv() {
      var r = E.resolver(t), rows = [['Match', 'Stage', 'Round', 'Home seed', 'Home', 'Away seed', 'Away', 'Winner']];
      ordered().forEach(function (m) {
        var o = r.outcome(m.id);
        var stage = { main: 'Bracket', third: 'Third place', winners: 'Winners bracket', losers: 'Losers bracket', final: 'Grand final' }[m.section];
        function cell(side) { var p = side === 'home' ? o.home : o.away; return typeof p === 'number' ? [p + 1, nameOf(p)] : ['', placeholder(m[side])]; }
        var h = cell('home'), a = cell('away');
        rows.push(['M' + nums[m.id], stage, label(m), h[0], h[1], a[0], a[1], o.state === 'done' ? nameOf(o.winner) : o.state === 'skipped' ? 'Not needed' : '']);
      });
      return E.toCsv(rows);
    }

    // ------------------------------------------------------------ print: fit the bracket to the page width
    window.addEventListener('beforeprint', function () {
      U.$$('.br-canvas', sectionsEl).forEach(function (c) {
        var w = c.getBoundingClientRect().width;
        if (w > 1000) c.style.zoom = String(Math.max(0.35, 1000 / w));
      });
    });
    window.addEventListener('afterprint', function () { U.$$('.br-canvas', sectionsEl).forEach(function (c) { c.style.zoom = ''; }); });
    U.printOnly(function () { return result; });

    // ------------------------------------------------------------ events
    form.addEventListener('submit', function (e) { e.preventDefault(); make(true); });
    U.$$('input[name=br-format]', form).forEach(function (r) { r.addEventListener('change', function () { syncOptions(); if (t) make(false); }); });
    $('br-third').addEventListener('change', function () { if (t) make(false); });
    $('br-reset').addEventListener('change', function () { if (t) make(false); });
    namesEl.addEventListener('input', updateCount);
    $('br-shuffle').addEventListener('click', function () {
      var list = E.parseNames(namesEl.value);
      if (list.length < 2) { setError('Add at least 2 names first.'); return; }
      namesEl.value = E.shuffle(list).join('\n');
      updateCount();
      if (t) make(false);
      U.say(count, 'Random draw done: the order is the new seeding. ' + U.plural(list.length, 'name') + '.');
    });
    var fillN = $('br-fill-n');
    function fillValue() { var v = Math.round(+fillN.value); return v >= 2 && v <= MAX ? v : null; }
    fillN.addEventListener('input', function () { $('br-fill-label').textContent = fillValue() || '…'; });
    $('br-fill').addEventListener('click', function () {
      var v = fillValue();
      if (!v) { setError('Choose a number from 2 to ' + MAX + '.'); fillN.focus(); return; }
      var list = []; for (var i = 1; i <= v; i++) list.push('Team ' + i);
      namesEl.value = list.join('\n');
      updateCount();
      make(true);
    });
    $('br-undo').addEventListener('click', function () {
      if (!undo.length) return;
      t.results = JSON.parse(undo.pop());
      E.normalize(t);
      render(); writeHash();
      U.say(statusEl, 'Last change undone.');
    });
    $('br-clear').addEventListener('click', function () {
      if (!Object.keys(t.results).length) return;
      undo.push(snapshot());
      t.results = {};
      render(); writeHash();
      U.say(statusEl, 'All results cleared. Undo brings them back.');
    });
    $('br-copy').addEventListener('click', function () { U.copy(asText(), statusEl); });
    $('br-csv').addEventListener('click', function () { U.download('tournament-bracket.csv', asCsv(), 'text/csv;charset=utf-8', statusEl); });
    $('br-link').addEventListener('click', function () { writeHash(); U.copy(location.href, statusEl); });
    $('br-print').addEventListener('click', function () { window.print(); });

    syncOptions();
    if (!readHash()) { /* wait for the user */ }
    updateCount();
  }

  if (window.MW) window.MW.ui.ready(start);
  else document.addEventListener('DOMContentLoaded', start);
})();
