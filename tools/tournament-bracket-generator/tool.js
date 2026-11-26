/* Single and double elimination bracket generator. Needs ../_shared/tools.js (window.MW) loaded first.
 * Text: i18n/en.json (+ the shared one), merged into window.MW_I18N by the page and read through MW.i18n
 * (I.t / I.tn / I.th here, because t is the tournament). */
(function () {
  'use strict';
  var MAX = 128;
  // Layout in rem, so the bracket grows with the reader's text size.
  var COL_W = 12.5, COL_GAP = 2.75, LABEL_H = 2.4, NUM_H = 1.35, ROW_H = 2.75, BOX_H = 5.5, GAP = 0.85;
  var PITCH = NUM_H + BOX_H + GAP;

  function start() {
    var root = document.getElementById('tl-br');
    if (!root || !window.MW) return;
    var E = window.MW.engine, U = window.MW.ui, I = window.MW.i18n, $ = function (id) { return document.getElementById(id); };
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
      count.textContent = list.length ?
        I.sentences([I.tn('names_found', list.length), dup.length ? I.t('listed_twice', { names: I.list(dup) }) : '']) : '';
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
      if (list.length < min) { setError(I.t(fmt === 'double' ? 'err_too_few_double' : 'err_too_few', { min: I.num(min) })); namesEl.focus(); return; }
      if (list.length > MAX) { setError(I.t('err_too_many', { max: I.num(MAX), n: I.num(list.length) })); namesEl.focus(); return; }
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
    /** Match number as shown: "M3". */
    function mNo(id) { return I.t('match_no', { n: nums[id] }); }
    /** "Winner of M3" for a slot not known yet; a hidden bye match is looked through. */
    function placeholder(s) {
      if (s.k === 'w' || s.k === 'l') {
        var m = byId[s.m];
        if (sb[m.id] === 0) return I.t(s.k === 'w' ? 'winner_of' : 'loser_of', { m: mNo(m.id) });
        if (s.k === 'w') return placeholder(srcAlwaysBye(m.home) ? m.away : m.home);
      }
      return I.t('tbd');
    }
    /**
     * Round name. Winners and losers rounds are counted over the rounds that have a real match: with byes a whole
     * losers round can be byes only, and the page does not show it, so the first round shown is "Losers round 1".
     */
    function roundName(section, round) {
      if (section === 'winners' || section === 'losers') {
        var rs = visRounds[section] || [], i = rs.indexOf(round);
        if (i >= 0) {
          var w = section === 'winners' ? 'round_winners' : 'round_losers';
          return i === rs.length - 1 ? I.t(w + '_final') : I.t(w + '_n', { n: i + 1 });
        }
      }
      return E.roundLabel(t, section, round);
    }
    function label(m) { return roundName(m.section, m.round); }
    function nameOf(p) { return names[p]; }
    function who(p) { return I.t('who', { name: names[p], seed: p + 1 }); }
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
      var aria = I.t(win ? 'slot_aria_win' : lose ? 'slot_aria_lost' : 'slot_aria', { name: nameOf(pid), seed: pid + 1 });
      return '<button type="button" class="' + cls + '" data-m="' + m.id + '" data-s="' + (side === 'home' ? 'h' : 'a') + '" aria-pressed="' + win +
        '" aria-label="' + U.esc(aria) + '" title="' + U.esc(nameOf(pid)) + '">' + inner + '</button>';
    }

    function matchHtml(m, o, p) {
      var no = mNo(m.id);
      var parts = { m: no, round: label(m),
        home: typeof o.home === 'number' ? nameOf(o.home) : placeholder(m.home),
        away: typeof o.away === 'number' ? nameOf(o.away) : placeholder(m.away),
        winner: o.state === 'done' ? nameOf(o.winner) : '' };
      var groupLabel = I.t(o.state === 'done' ? 'match_aria_done' : o.state === 'ready' ? 'match_aria_ready' : 'match_aria', parts);
      var style = 'left:' + xOf(p) + 'rem;top:' + (boxTop(p) - NUM_H) + 'rem';
      if (o.state === 'skipped') {
        return '<div class="br-match is-skipped" style="' + style + '" role="group" aria-label="' + U.esc(I.t('match_aria_skipped', parts)) + '">' +
          '<div class="br-num">' + U.esc(no) + '</div><div class="br-box br-note">' + I.th('reset_not_needed') + '</div></div>';
      }
      return '<div class="br-match' + (o.state === 'ready' ? ' is-ready' : '') + '" style="' + style + '" role="group" aria-label="' + U.esc(groupLabel) + '">' +
        '<div class="br-num" aria-hidden="true">' + U.esc(m.conditional ? I.t('match_no_conditional', { m: no }) : no) + '</div>' +
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
        '<div class="br-scroll" tabindex="0" role="region" aria-label="' + U.esc(I.t('scrolls_sideways', { title: title })) + '">' +
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
      if (list.length === 1) return I.t('seeds_single', { a: list[0] + 1 });
      if (list.length === 2) return I.t('seeds_two', { a: list[0] + 1, b: list[1] + 1 });
      var contiguous = list[list.length - 1] - list[0] === list.length - 1;
      return contiguous ? I.t('seeds_range', { a: list[0] + 1, b: list[list.length - 1] + 1 }) :
        I.t('seeds_list', { list: I.list(list.map(function (x) { return x + 1; })) });
    }

    function render(focusKey) {
      var r = E.resolver(t), n = t.n, real = E.realMatches(t).length;
      var byes = byeSeeds();
      var size = E.nextPow2(Math.max(2, n));
      var body;
      if (t.format === 'double') {
        body = t.opts.reset ? I.tn('sum_body_reset', real - 1, { b: I.num(real) }) : I.tn('sum_body_games', real);
      } else {
        body = I.t('sum_body_single', { games: I.tn('sum_games', real), in_rounds: I.tn('sum_in_rounds', E.log2ceil(size)) });
      }
      // English needs "an 8-place" but "a 16-place": the _an key is used for sizes starting with 8 (8, 8192...).
      var head = 'sum_' + t.format + (/^8/.test(String(size)) ? '_an' : '');
      $('br-summary').textContent = I.sentences([
        I.t(head, { teams: I.tn('sum_teams', n), size: I.num(size), body: body }),
        byes.length ? I.tn(t.format === 'double' ? 'sum_byes_double' : 'sum_byes', byes.length, { seeds: seedRange(byes) }) : I.t('sum_no_byes')]);

      var html = '';
      if (t.format === 'double') {
        html += sectionHtml('winners', I.t('sec_winners'), r) + sectionHtml('losers', I.t('sec_losers'), r) + sectionHtml('final', I.t('sec_final'), r);
      } else {
        html += sectionHtml('main', I.t('sec_main'), r) + sectionHtml('third', I.t('sec_third'), r);
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

    var PLACES = ['place_1', 'place_2', 'place_3'];
    function renderPodium() {
      var p = E.podium(t), box = $('br-podium');
      if (!p.length) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="tl-card br-podium-card"><h3>' + I.th('final_places') + '</h3><ol>' + p.map(function (ids, i) {
        return '<li><span class="br-place">' + I.th(PLACES[i]) + '</span> ' +
          I.andList(ids.map(function (x) { return '<strong>' + U.esc(nameOf(x)) + '</strong>'; }), true) + '</li>';
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
      var res, msg = [];
      if (o.state === 'done' && o.winner === pid) {
        res = E.clearResult(t, matchId);
        msg.push(I.t('msg_cleared', { m: mNo(matchId) }));
      } else {
        res = E.setWinner(t, matchId, side);
        msg.push(I.t('msg_wins', { name: nameOf(pid), m: mNo(matchId) }));
        var nx = nextOf(matchId).filter(function (x) { return x.section === m.section || x.section === 'final'; })[0];
        if (m.section === 'final' && !m.conditional) {
          var r2 = E.resolver(t), reset = t.matches.filter(function (x) { return x.conditional; })[0];
          if (reset && r2.outcome(reset.id).state === 'ready') msg.push(I.t('msg_reset_decides'));
        } else if (nx) msg.push(I.t('msg_next', { round: label(nx) }));
      }
      if (res.cleared.length) {
        msg.push(I.tn('msg_cleared_later', res.cleared.length, { list: I.list(res.cleared.map(mNo)) }));
      }
      var p = E.podium(t);
      if (p.length) msg.push(I.t('msg_champion', { name: nameOf(p[0][0]) }));
      render([matchId, side]);
      writeHash();
      U.say(statusEl, I.sentences(msg));
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
      out.push(I.t(t.format === 'double' ? 'text_head_double' : 'text_head_single', { teams: I.tn('sum_teams', t.n) }));
      out.push(I.t('text_seeds', { list: I.list(names.map(function (nm, i) { return I.t('text_seed_item', { seed: i + 1, name: nm }); })) }));
      var byes = byeSeeds();
      if (byes.length) out.push(I.t('text_byes', { list: I.list(byes.map(who)) }));
      ordered().forEach(function (m) {
        var o = r.outcome(m.id), head = label(m);
        if (head !== last) { out.push('', head); last = head; }
        var key = o.state === 'done' ? 'text_line_won' : o.state === 'skipped' ? 'text_line_skipped' : m.conditional ? 'text_line_cond' : 'text_line';
        out.push('  ' + I.t(key, { m: mNo(m.id), home: slotText(m, 'home', o), away: slotText(m, 'away', o),
          winner: o.state === 'done' ? nameOf(o.winner) : '' }));
      });
      var p = E.podium(t);
      if (p.length) {
        out.push('');
        PLACES.forEach(function (pl, i) { if (p[i]) out.push(I.t('text_place', { place: I.t(pl), names: I.andList(p[i].map(nameOf)) })); });
      }
      return out.join('\n') + '\n';
    }
    var STAGE = { main: 'sec_main', third: 'round_third', winners: 'sec_winners', losers: 'sec_losers', final: 'sec_final' };
    function asCsv() {
      var r = E.resolver(t), rows = [['csv_match', 'csv_stage', 'csv_round', 'csv_home_seed', 'csv_home', 'csv_away_seed', 'csv_away', 'csv_winner'].map(function (k) { return I.t(k); })];
      ordered().forEach(function (m) {
        var o = r.outcome(m.id);
        function cell(side) { var p = side === 'home' ? o.home : o.away; return typeof p === 'number' ? [p + 1, nameOf(p)] : ['', placeholder(m[side])]; }
        var h = cell('home'), a = cell('away');
        rows.push([mNo(m.id), I.t(STAGE[m.section]), label(m), h[0], h[1], a[0], a[1],
          o.state === 'done' ? nameOf(o.winner) : o.state === 'skipped' ? I.t('csv_not_needed') : '']);
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
      if (list.length < 2) { setError(I.t('err_too_few_first', { min: I.num(2) })); return; }
      namesEl.value = E.shuffle(list).join('\n');
      updateCount();
      if (t) make(false);
      U.say(count, I.tn('drawn', list.length));
    });
    var fillN = $('br-fill-n');
    function fillValue() { var v = Math.round(+fillN.value); return v >= 2 && v <= MAX ? v : null; }
    fillN.addEventListener('input', function () { $('br-fill-label').textContent = fillValue() || '…'; });
    $('br-fill').addEventListener('click', function () {
      var v = fillValue();
      if (!v) { setError(I.t('err_fill_range', { min: I.num(2), max: I.num(MAX) })); fillN.focus(); return; }
      var list = []; for (var i = 1; i <= v; i++) list.push(I.t('team_n', { n: i }));
      namesEl.value = list.join('\n');
      updateCount();
      make(true);
    });
    $('br-undo').addEventListener('click', function () {
      if (!undo.length) return;
      t.results = JSON.parse(undo.pop());
      E.normalize(t);
      render(); writeHash();
      U.say(statusEl, I.t('msg_undone'));
    });
    $('br-clear').addEventListener('click', function () {
      if (!Object.keys(t.results).length) return;
      undo.push(snapshot());
      t.results = {};
      render(); writeHash();
      U.say(statusEl, I.t('msg_all_cleared'));
    });
    $('br-copy').addEventListener('click', function () { U.copy(asText(), statusEl); });
    $('br-csv').addEventListener('click', function () { U.download(I.t('csv_file'), asCsv(), 'text/csv;charset=utf-8', statusEl); });
    $('br-link').addEventListener('click', function () { writeHash(); U.copy(location.href, statusEl); });
    $('br-print').addEventListener('click', function () { window.print(); });

    syncOptions();
    if (!readHash()) { /* wait for the user */ }
    updateCount();
  }

  if (window.MW) window.MW.ui.ready(start);
  else document.addEventListener('DOMContentLoaded', start);
})();
