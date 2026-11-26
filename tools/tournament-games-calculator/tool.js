/* Tournament games and rounds calculator. Needs ../_shared/tools.js (window.MW) loaded first.
 * Text: i18n/en.json (+ the shared one), merged into window.MW_I18N by the page and read through MW.i18n.
 * Numbers in sentences go through I.num (page language); the table and the CSV keep plain digits. */
(function () {
  'use strict';

  function start() {
    var root = document.getElementById('tl-calc');
    if (!root || !window.MW) return;
    var E = window.MW.engine, U = window.MW.ui, I = window.MW.i18n, $ = function (id) { return document.getElementById(id); };
    var t = I.t, tn = I.tn, th = I.th, thn = I.thn, num = I.num;
    var inputs = ['calc-n', 'calc-courts', 'calc-min', 'calc-hours', 'calc-groups', 'calc-adv', 'calc-swiss', 'calc-double', 'calc-third'];
    var last = null, timer = null;

    function B(html) { return '<strong>' + html + '</strong>'; }
    function dur(min) { return U.esc(U.duration(min)); }

    function numIn(id, min, max, dflt) {
      var raw = $(id).value.trim();
      if (raw === '') return { v: dflt, ok: true, empty: true };
      var v = Number(raw.replace(',', '.'));
      if (!isFinite(v)) return { v: dflt, ok: false };
      return { v: v, ok: v >= min && v <= max };
    }

    function read() {
      var errors = [];
      var n = numIn('calc-n', 2, 1024, NaN), c = numIn('calc-courts', 1, 200, 1), m = numIn('calc-min', 0, 600, 0);
      var h = numIn('calc-hours', 0, 500, 0), g = numIn('calc-groups', 1, 512, 2), q = numIn('calc-adv', 1, 512, 2), s = numIn('calc-swiss', 0, 1023, 0);
      if (!n.ok || n.empty || n.v !== Math.floor(n.v)) errors.push(t('err_n'));
      if (!c.ok || c.v !== Math.floor(c.v)) errors.push(t('err_courts'));
      if (!m.ok) errors.push(t('err_minutes'));
      if (!h.ok) errors.push(t('err_hours'));
      if (!g.ok || g.v !== Math.floor(g.v)) errors.push(t('err_groups'));
      if (!q.ok || q.v !== Math.floor(q.v)) errors.push(t('err_advance'));
      if (!s.ok || s.v !== Math.floor(s.v)) errors.push(t('err_swiss'));
      return {
        errors: errors, n: n.v, courts: c.v, minutes: Math.round(m.v), hours: h.v, groups: g.v, advance: q.v, swiss: s.v,
        double: $('calc-double').checked, third: $('calc-third').checked
      };
    }

    /** Time column of the table (plain digits, like the other columns). */
    function timeCell(slots, minutes, hours, extraSlots) {
      var parts = [];
      var total = slots * minutes;
      if (minutes > 0) parts.push(B(dur(total)));
      parts.push('<span class="calc-slots">' + thn('slots', slots, { n: slots }) + '</span>');
      if (extraSlots) {
        parts.push('<span class="calc-slots">' + th('if_reset', {
          x: minutes > 0 ? dur(extraSlots * minutes) : thn('slots', extraSlots, { n: extraSlots }) }) + '</span>');
      }
      if (hours > 0 && minutes > 0) {
        var fits = total <= hours * 60;
        var fitsAll = (slots + (extraSlots || 0)) * minutes <= hours * 60;
        var text = th(!fits ? 'fit_long' : fitsAll ? 'fit_ok' : 'fit_not_with_reset');
        parts.push('<span class="calc-fit ' + (fits ? 'is-fit' : 'is-long') + '">' + text + '</span>');
      }
      return parts.join('<br>');
    }

    function slotsExpr(byRound, courts) {
      var keys = Object.keys(byRound);
      return keys.map(function (k) { return Math.ceil(byRound[k] / courts); });
    }

    /** "On 2 courts: <expr> = 9 time slots × 20 min = 3 h." (expr may be empty: "On 2 courts: 9 time slots."). */
    function slotsLine(c, expr, slots, mins, minutes) {
      var p = { on_courts: thn('w_on_courts', c), expr: expr, slots: thn('w_slots', slots), mins: th('dur_min', { m: num(mins) }), time: B(dur(minutes)) };
      if (expr) return th(mins ? 'w_slots_line_time' : 'w_slots_line', p);
      return th(mins ? 'w_slots_short_time' : 'w_slots_short', p);
    }
    function para(items) { return '<p>' + I.sentences(items) + '</p>'; }

    function calc() {
      var o = read();
      $('calc-error').innerHTML = o.errors.length ? '<p class="tl-error">' + I.sentences(o.errors.map(U.esc)) + '</p>' : '';
      if (o.errors.length) return;
      var n = o.n, c = o.courts, mins = o.minutes;
      var res = E.calculate(n, { courts: c, minutes: mins, groups: o.groups, advance: o.advance, doubleRound: o.double, thirdPlace: o.third, swissRounds: o.swiss });
      $('calc-title').textContent = tn('title', n);
      var rows = [], work = [];
      var p2 = E.nextPow2(n);

      // Single elimination
      var se = res.single;
      var seT = E.create('single', n, { thirdPlace: o.third }), seP = E.plan(seT, c);
      var perRound = Object.keys(seP.byRound).filter(function (k) { return k.indexOf('main') === 0; }).map(function (k) { return seP.byRound[k]; });
      rows.push([t('fmt_single'), se.games, se.rounds, t('range_1_to', { n: se.rounds }), timeCell(se.slots, mins, o.hours), se.minutes]);
      var seBr = { teams: thn('w_teams', n), size: num(p2) };
      work.push('<h3>' + th('fmt_single') + '</h3>' + para([
        se.byes ? thn('w_se_bracket', se.byes, seBr) : th('w_se_bracket_no_byes', seBr),
        th(se.thirdPlace ? 'w_se_games_third' : 'w_se_games', { n: num(n), total: B(num(n - 1)), games: B(num(se.games)),
          in_rounds: thn('w_in_rounds', se.rounds), per: I.list(perRound.map(num), true) })]) +
        para([slotsLine(c, slotsExpr(seP.byRound, c).map(num).join(' + '), se.slots, mins, se.minutes)]));

      // Double elimination
      if (res.double) {
        var de = res.double;
        rows.push([t('fmt_double'), t('x_or_y', { a: de.games, b: de.gamesReset }),
          t('x_or_y', { a: de.wbRounds + de.lbRounds + 1, b: de.wbRounds + de.lbRounds + 2 }),
          t('at_least', { n: 2 }), timeCell(de.slots, mins, o.hours, de.slotsReset - de.slots), de.minutes]);
        var deP = { on_courts: thn('w_on_courts', c), slots: thn('w_slots', de.slots), mins: th('dur_min', { m: num(mins) }),
          time: B(dur(de.minutes)), extra: dur(mins) };
        work.push('<h3>' + th('fmt_double') + '</h3>' + para([
          th('w_de_games', { n: num(n), g: B(num(de.games)), gr: B(num(de.gamesReset)) }),
          th('w_de_rounds', { wb: num(de.wbRounds), lb: num(de.lbRounds) }),
          th('w_de_min')]) +
          para([th(mins ? 'w_de_slots_time' : 'w_slots_short', deP)]));
      } else {
        rows.push([t('fmt_double'), '–', '–', t('needs_more', { n: 3 }), '–', 0]);
      }

      // Round robin
      var rr = res.roundrobin;
      rows.push([t(o.double ? 'fmt_rr_double' : 'fmt_rr'), rr.games, rr.rounds, String(rr.perTeam), timeCell(rr.slots, mins, o.hours), rr.minutes]);
      var perWave = Math.ceil(rr.perRound / c);
      var rrP = { n: num(n), rounds: thn('w_rounds', rr.rounds), of_games: thn('w_of_games', rr.perRound) };
      work.push('<h3>' + th(o.double ? 'w_h_rr_double' : 'fmt_rr') + '</h3>' + para([
        th(o.double ? 'w_rr_games_double' : 'w_rr_games', { n: num(n), n1: num(n - 1), g: B(num(rr.games)) }),
        th(n % 2 ? 'w_rr_odd' : 'w_rr_even', rrP),
        thn('w_rr_per_team', rr.perTeam)]) +
        para([slotsLine(c, thn('w_rounds', rr.rounds) + ' × ' + num(perWave), rr.slots, mins, rr.minutes)]));

      // Groups + playoff
      if (res.groups) {
        var g = res.groups;
        var sizes = {}; g.sizes.forEach(function (k) { sizes[k] = (sizes[k] || 0) + 1; });
        var sizeKeys = Object.keys(sizes).sort(function (a, b) { return b - a; });
        var sizeText = I.andList(sizeKeys.map(function (k) { return thn('w_groups_of', sizes[k], { size: num(+k) }); }), true);
        var adjusted = g.groups !== o.groups || g.advance !== o.advance;
        rows.push([t('fmt_groups_detail', { g: g.groups, q: g.advance }), g.games, g.groupRounds + g.playoffRounds, t('at_least', { n: g.minPerTeam }),
          timeCell(g.slots, mins, o.hours), g.minutes]);
        var groupSum = sizeKeys.map(function (k) {
          return num(sizes[k]) + ' × ' + num(k * (k - 1) / 2) + (o.double ? ' × ' + num(2) : '');
        }).join(' + ');
        var size = E.nextPow2(Math.max(2, g.playoffEntrants));
        // English needs "an 8-place" but "a 16-place": the _an keys are used for sizes starting with 8.
        var an = /^8/.test(String(size)) ? '_an' : '';
        var poP = { g: num(g.groups), q: num(g.advance), e: num(g.playoffEntrants), size: num(size),
          byes: thn('w_byes', g.playoffByes),
          expr: num(g.playoffEntrants) + ' − ' + num(1) + (o.third && g.playoffEntrants >= 4 ? ' + ' + num(1) : ''),
          games: thn('w_games', g.playoffGames, { n: B(num(g.playoffGames)) }), in_rounds: thn('w_in_rounds', g.playoffRounds) };
        work.push('<h3>' + th('fmt_groups') + '</h3>' + para([
          thn(adjusted ? 'w_gr_groups_adjusted' : 'w_gr_groups', g.groups, { sizes: sizeText, teams: thn('w_teams', n) }),
          th('w_gr_games', { sum: groupSum, gg: B(num(g.groupGames)), in_rounds: thn('w_in_rounds', g.groupRounds) }),
          th(g.playoffByes ? (an ? 'w_gr_playoff_byes_an' : 'w_gr_playoff_byes') : (an ? 'w_gr_playoff_an' : 'w_gr_playoff'), poP),
          thn('w_gr_total', g.games, { n: B(num(g.games)) })]) +
          para([slotsLine(c, '', g.slots, mins, g.minutes)]));
      } else {
        rows.push([t('fmt_groups'), '–', '–', t('needs_more', { n: 4 }), '–', 0]);
      }

      // Swiss
      var sw = res.swiss;
      rows.push([t('fmt_swiss'), sw.games, sw.rounds, sw.byePerRound ? t('swiss_with_bye', { n: sw.rounds, m: sw.rounds - 1 }) : String(sw.rounds),
        timeCell(sw.slots, mins, o.hours), sw.minutes]);
      var swP = { n: num(n), rec: num(sw.recommended), rounds: thn('w_rounds', sw.rounds), per: thn('w_games', sw.perRound),
        games: thn('w_games', sw.games, { n: B(num(sw.games)) }) };
      var swKey = o.swiss > 0 ? (sw.byePerRound ? 'w_sw_chosen_bye' : 'w_sw_chosen') : (sw.byePerRound ? 'w_sw_auto_bye' : 'w_sw_auto');
      work.push('<h3>' + th('fmt_swiss') + '</h3>' + para([th(swKey, swP)]) +
        para([slotsLine(c, thn('w_rounds', sw.rounds) + ' × ' + num(Math.ceil(sw.perRound / c)), sw.slots, mins, sw.minutes)]));

      $('calc-table').tBodies[0].innerHTML = rows.map(function (r) {
        return '<tr><th scope="row">' + U.esc(r[0]) + '</th><td class="num" data-label="' + th('col_games') + '">' + U.esc(r[1]) +
          '</td><td class="num" data-label="' + th('col_rounds') + '">' + U.esc(r[2]) +
          '</td><td data-label="' + th('col_per_team') + '">' + U.esc(r[3]) + '</td><td data-label="' + th('col_time') + '">' + r[4] + '</td></tr>';
      }).join('');
      $('calc-work').innerHTML = work.join('');
      $('calc-time-note').textContent = mins > 0 ? tn('time_note', c) : t('time_note_empty');
      last = { n: n, rows: rows, o: o };
      clearTimeout(timer);
      timer = setTimeout(function () {
        var sP = { se: num(se.games), rr: num(rr.games), sw: num(sw.games),
          de: res.double ? num(res.double.games) : '', der: res.double ? num(res.double.gamesReset) : '', gp: res.groups ? num(res.groups.games) : '' };
        $('calc-summary').textContent = tn(res.double ? (res.groups ? 'summary_full' : 'summary_no_groups') : 'summary_min', n, sP);
      }, 500);
    }

    function plain(html) { var d = document.createElement('div'); d.innerHTML = String(html).replace(/<br>/g, th('list_sep')); return d.textContent; }
    function asText() {
      var o = last.o;
      var out = [o.minutes ? tn('text_head_time', last.n, { courts: tn('text_courts', o.courts), mins: num(o.minutes) }) : tn('text_head', last.n), ''];
      last.rows.forEach(function (r) {
        out.push(t(r[4] !== '–' ? 'text_row_time' : 'text_row', { format: r[0], games: r[1], rounds: r[2], per: r[3], time: r[4] !== '–' ? plain(r[4]) : '' }));
      });
      return out.join('\n') + '\n';
    }
    function asCsv() {
      var rows = [[t('csv_format'), t('csv_games'), t('csv_rounds'), t('csv_per_team'), t('csv_minutes')]];
      last.rows.forEach(function (r) { rows.push([r[0], r[1], r[2], r[3], r[5] || '']); });
      return E.toCsv(rows);
    }

    inputs.forEach(function (id) {
      var el = $(id);
      el.addEventListener('input', calc);
      el.addEventListener('change', calc);
    });
    $('calc-form').addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    $('calc-copy').addEventListener('click', function () { if (last) U.copy(asText(), $('calc-status')); });
    $('calc-csv').addEventListener('click', function () { if (last) U.download(t('csv_file'), asCsv(), 'text/csv;charset=utf-8', $('calc-status')); });
    $('calc-print').addEventListener('click', function () { window.print(); });
    U.printOnly(function () { return $('calc-result'); });
    calc();
  }

  if (window.MW) window.MW.ui.ready(start);
  else document.addEventListener('DOMContentLoaded', start);
})();
