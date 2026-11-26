/* Round robin schedule generator. Needs ../_shared/tools.js (window.MW) loaded first.
 * Text: i18n/en.json (+ the shared one), merged into window.MW_I18N by the page and read through MW.i18n. */
(function () {
  'use strict';
  var MAX = 200;

  function start() {
    var root = document.getElementById('tl-rr');
    if (!root || !window.MW) return;
    var E = window.MW.engine, U = window.MW.ui, I = window.MW.i18n, $ = function (id) { return document.getElementById(id); };
    var t = I.t, tn = I.tn, th = I.th, thn = I.thn, num = I.num;
    var form = $('rr-form'), names = $('rr-names'), dbl = $('rr-double'), err = $('rr-error'), count = $('rr-count');
    var result = $('rr-result'), statusEl = $('rr-status'), teamSel = $('rr-team');
    var state = null; // {names, double, rounds}

    function setError(text) { err.innerHTML = text ? '<p class="tl-error">' + U.esc(text) + '</p>' : ''; }

    function updateCount() {
      var list = E.parseNames(names.value);
      var dup = E.duplicates(list);
      count.textContent = list.length ?
        I.sentences([tn('names_found', list.length), dup.length ? t('listed_twice', { names: I.list(dup) }) : '']) : '';
    }

    function readHash() {
      var h = location.hash.replace(/^#/, '');
      if (!h) return null;
      try {
        var p = new URLSearchParams(h), tx = p.get('t');
        if (!tx) return null;
        return { names: tx.split('\n'), double: p.get('d') === '1' };
      } catch (e) { return null; }
    }
    function writeHash() {
      if (!state) return;
      var p = new URLSearchParams();
      p.set('t', state.names.join('\n'));
      if (state.double) p.set('d', '1');
      try { history.replaceState(null, '', '#' + p.toString()); } catch (e) { /* file:// or sandbox */ }
    }

    function make(focus) {
      var list = E.parseNames(names.value);
      setError('');
      if (list.length < 2) { setError(t('err_too_few', { min: num(2) })); names.focus(); return; }
      if (list.length > MAX) { setError(t('err_too_many', { max: num(MAX), n: num(list.length) })); names.focus(); return; }
      state = { names: list, double: dbl.checked, rounds: E.roundRobinRounds(list.length, dbl.checked) };
      render();
      writeHash();
      result.hidden = false;
      if (focus) $('rr-title').focus();
    }

    function nameOf(i) { return state.names[i]; }

    function render() {
      var n = state.names.length, legs = state.double ? 2 : 1;
      var games = n * (n - 1) / 2 * legs, rounds = state.rounds.length, per = Math.floor(n / 2);
      var parts = { teams: tn('sum_teams', n), games: tn('sum_games', games), in_rounds: tn('sum_in_rounds', rounds),
        per_round: tn('sum_per_round', per) };
      $('rr-summary').textContent = I.sentences([t(n % 2 ? 'summary_odd' : 'summary', parts), t('summary_home_first')]);
      var stats = [[games, 'stat_games'], [rounds, 'stat_rounds'], [per, 'stat_per_round'], [(n - 1) * legs, 'stat_per_team']];
      $('rr-stats').innerHTML = stats.map(function (s) { return '<li><b>' + num(s[0]) + '</b><span>' + thn(s[1], s[0]) + '</span></li>'; }).join('');

      var sel = teamSel.value;
      teamSel.innerHTML = '<option value="">' + th('all_teams') + '</option>' + state.names.map(function (nm, i) {
        return '<option value="' + i + '">' + U.esc(nm) + '</option>';
      }).join('');
      if (sel !== '' && +sel < n) teamSel.value = sel;
      renderRounds();
      renderTeam();
      renderGrid();
    }

    function teamName(i, me) {
      var tx = U.esc(nameOf(i));
      return i === me ? '<mark>' + tx + '</mark>' : tx;
    }

    function renderRounds() {
      var me = teamSel.value === '' ? -1 : +teamSel.value;
      var half = state.double ? state.rounds.length / 2 : 0;
      var html = state.rounds.map(function (rd) {
        var title = th('round_n', { n: rd.round + 1 });
        var leg = state.double ? '<span class="rr-leg">' + th(rd.round < half ? 'first_leg' : 'second_leg') + '</span>' : '';
        // A game row is a three-cell grid (home | v | away): its structure stays fixed, only "v" is translated.
        var lis = rd.games.map(function (g) {
          return '<li><span class="rr-home">' + teamName(g[0], me) + '</span> <span class="rr-v">' + th('versus') +
            '</span> <span class="rr-away">' + teamName(g[1], me) + '</span></li>';
        }).join('');
        var bye = rd.bye.length ?
          '<p class="rr-bye">' + th('bye_list', { names: I.list(rd.bye.map(function (b) { return teamName(b, me); }), true) }) + '</p>' : '';
        return '<section class="rr-round" aria-label="' + title + '"><h3>' + title + leg + '</h3><ol>' + lis + '</ol>' + bye + '</section>';
      }).join('');
      $('rr-rounds').innerHTML = html;
    }

    function renderTeam() {
      var box = $('rr-team-list');
      if (teamSel.value === '') { box.innerHTML = ''; return; }
      var me = +teamSel.value, rows = [];
      state.rounds.forEach(function (rd) {
        var line = null;
        rd.games.forEach(function (g) {
          if (g[0] === me) line = th('team_home', { name: U.esc(nameOf(g[1])), tag: '<span class="rr-ha">' + th('tag_home') + '</span>' });
          else if (g[1] === me) line = th('team_away', { name: U.esc(nameOf(g[0])), tag: '<span class="rr-ha">' + th('tag_away') + '</span>' });
        });
        if (line === null) line = '<em>' + th('team_bye') + '</em>';
        rows.push('<li><span class="rr-rn">' + th('round_n', { n: rd.round + 1 }) + '</span> ' + line + '</li>');
      });
      box.innerHTML = '<div class="tl-card rr-team-card"><h3>' + U.esc(nameOf(me)) + '</h3><ol class="rr-team-games">' + rows.join('') + '</ol></div>';
    }

    function renderGrid() {
      var n = state.names.length, box = $('rr-grid'), gridBox = $('rr-grid-box');
      if (n > 30) { gridBox.hidden = true; box.innerHTML = ''; return; }
      gridBox.hidden = false;
      var cell = {};
      state.rounds.forEach(function (rd) {
        rd.games.forEach(function (g) {
          var k = Math.min(g[0], g[1]) + '-' + Math.max(g[0], g[1]);
          (cell[k] = cell[k] || []).push(rd.round + 1);
        });
      });
      var head = '<tr><th scope="col"><span class="tl-sr">' + th('grid_team') + '</span></th>' + state.names.map(function (nm, i) {
        return '<th scope="col" class="num" title="' + U.esc(nm) + '"><abbr title="' + U.esc(nm) + '">' + (i + 1) + '</abbr></th>';
      }).join('') + '</tr>';
      var body = state.names.map(function (nm, i) {
        return '<tr><th scope="row">' + (i + 1) + '. ' + U.esc(nm) + '</th>' + state.names.map(function (_, j) {
          if (i === j) return '<td class="num rr-self" aria-label="' + th('grid_same_team') + '">–</td>';
          var k = Math.min(i, j) + '-' + Math.max(i, j);
          return '<td class="num">' + cell[k].join(' / ') + '</td>';
        }).join('') + '</tr>';
      }).join('');
      box.innerHTML = '<table class="rr-grid"><caption class="tl-sr">' + th('grid_caption') + '</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    }

    function asText() {
      var n = state.names.length, legs = state.double ? 2 : 1;
      var out = [t(state.double ? 'text_head_double' : 'text_head', {
        teams: tn('sum_teams', n), games: tn('sum_games', n * (n - 1) / 2 * legs), rounds: tn('text_rounds', state.rounds.length) }), ''];
      state.rounds.forEach(function (rd) {
        out.push(t('round_n', { n: rd.round + 1 }));
        rd.games.forEach(function (g) { out.push('  ' + t('game_line', { home: nameOf(g[0]), v: t('versus'), away: nameOf(g[1]) })); });
        if (rd.bye.length) out.push('  ' + t('bye_list', { names: I.list(rd.bye.map(nameOf)) }));
        out.push('');
      });
      return out.join('\n');
    }
    function asCsv() {
      var rows = [[t('csv_round'), t('csv_game'), t('csv_home'), t('csv_away'), t('csv_note')]];
      state.rounds.forEach(function (rd) {
        rd.games.forEach(function (g, i) { rows.push([rd.round + 1, i + 1, nameOf(g[0]), nameOf(g[1]), '']); });
        rd.bye.forEach(function (b) { rows.push([rd.round + 1, '', nameOf(b), '', t('csv_bye')]); });
      });
      return E.toCsv(rows);
    }

    // ------------------------------------------------------------ events
    form.addEventListener('submit', function (e) { e.preventDefault(); make(true); });
    names.addEventListener('input', updateCount);
    dbl.addEventListener('change', function () { if (state) make(false); });
    $('rr-shuffle').addEventListener('click', function () {
      var list = E.parseNames(names.value);
      if (list.length < 2) { setError(t('err_too_few_first', { min: num(2) })); return; }
      names.value = E.shuffle(list).join('\n');
      updateCount();
      if (state) make(false);
      U.say(statusEl, t('shuffled'));
      U.say(count, tn('shuffled_names', list.length));
    });
    var fillN = $('rr-fill-n');
    function fillValue() { var v = Math.round(+fillN.value); return v >= 2 && v <= MAX ? v : null; }
    fillN.addEventListener('input', function () { var v = fillValue(); $('rr-fill-label').textContent = v || '…'; });
    $('rr-fill').addEventListener('click', function () {
      var v = fillValue();
      if (!v) { setError(t('err_fill_range', { min: num(2), max: num(MAX) })); fillN.focus(); return; }
      var list = []; for (var i = 1; i <= v; i++) list.push(t('team_n', { n: i }));
      names.value = list.join('\n');
      updateCount();
      make(true);
    });
    teamSel.addEventListener('change', function () { if (state) { renderRounds(); renderTeam(); } });
    $('rr-copy').addEventListener('click', function () { U.copy(asText(), statusEl); });
    $('rr-csv').addEventListener('click', function () { U.download(t('csv_file'), asCsv(), 'text/csv;charset=utf-8', statusEl); });
    $('rr-link').addEventListener('click', function () {
      writeHash();
      U.copy(location.href, statusEl);
    });
    $('rr-print').addEventListener('click', function () { window.print(); });
    U.printOnly(function () { return result; });

    var fromHash = readHash();
    if (fromHash) { names.value = fromHash.names.join('\n'); dbl.checked = fromHash.double; make(false); }
    updateCount();
  }

  if (window.MW) window.MW.ui.ready(start);
  else document.addEventListener('DOMContentLoaded', start);
})();
