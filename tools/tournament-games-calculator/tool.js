/* Tournament games and rounds calculator. Needs ../_shared/tools.js (window.MW) loaded first. */
(function () {
  'use strict';

  function start() {
    var root = document.getElementById('tl-calc');
    if (!root || !window.MW) return;
    var E = window.MW.engine, U = window.MW.ui, $ = function (id) { return document.getElementById(id); };
    var inputs = ['calc-n', 'calc-courts', 'calc-min', 'calc-hours', 'calc-groups', 'calc-adv', 'calc-swiss', 'calc-double', 'calc-third'];
    var last = null, timer = null;

    function num(id, min, max, dflt) {
      var raw = $(id).value.trim();
      if (raw === '') return { v: dflt, ok: true, empty: true };
      var v = Number(raw.replace(',', '.'));
      if (!isFinite(v)) return { v: dflt, ok: false };
      return { v: v, ok: v >= min && v <= max };
    }

    function read() {
      var errors = [];
      var n = num('calc-n', 2, 1024, NaN), c = num('calc-courts', 1, 200, 1), m = num('calc-min', 0, 600, 0);
      var h = num('calc-hours', 0, 500, 0), g = num('calc-groups', 1, 512, 2), q = num('calc-adv', 1, 512, 2), s = num('calc-swiss', 0, 1023, 0);
      if (!n.ok || n.empty || n.v !== Math.floor(n.v)) errors.push('Teams or players: a whole number from 2 to 1024.');
      if (!c.ok || c.v !== Math.floor(c.v)) errors.push('Courts: a whole number from 1 to 200.');
      if (!m.ok) errors.push('Minutes per match: from 0 to 600.');
      if (!h.ok) errors.push('Hours: from 0 to 500.');
      if (!g.ok || g.v !== Math.floor(g.v)) errors.push('Groups: a whole number, 1 or more.');
      if (!q.ok || q.v !== Math.floor(q.v)) errors.push('Go through from each group: a whole number, 1 or more.');
      if (!s.ok || s.v !== Math.floor(s.v)) errors.push('Swiss rounds: a whole number, or leave it empty.');
      return {
        errors: errors, n: n.v, courts: c.v, minutes: Math.round(m.v), hours: h.v, groups: g.v, advance: q.v, swiss: s.v,
        double: $('calc-double').checked, third: $('calc-third').checked
      };
    }

    function timeCell(slots, minutes, hours, extraSlots) {
      var parts = [];
      var total = slots * minutes;
      if (minutes > 0) parts.push('<strong>' + (E.formatMinutes(total) || '0 min') + '</strong>');
      parts.push('<span class="calc-slots">' + U.plural(slots, 'time slot') + '</span>');
      if (extraSlots) {
        parts.push('<span class="calc-slots">+' + (minutes > 0 ? E.formatMinutes(extraSlots * minutes) : U.plural(extraSlots, 'time slot')) + ' if the reset is played</span>');
      }
      if (hours > 0 && minutes > 0) {
        var fits = total <= hours * 60;
        var fitsAll = (slots + (extraSlots || 0)) * minutes <= hours * 60;
        var text = !fits ? '✗ too long' : fitsAll ? '✓ fits' : '✓ fits, ✗ not with the reset';
        parts.push('<span class="calc-fit ' + (fits ? 'is-fit' : 'is-long') + '">' + text + '</span>');
      }
      return parts.join('<br>');
    }

    function slotsExpr(byRound, courts) {
      var keys = Object.keys(byRound);
      return keys.map(function (k) { return Math.ceil(byRound[k] / courts); });
    }

    function calc() {
      var o = read();
      $('calc-error').innerHTML = o.errors.length ? '<p class="tl-error">' + o.errors.map(U.esc).join(' ') + '</p>' : '';
      if (o.errors.length) return;
      var n = o.n, c = o.courts, mins = o.minutes;
      var res = E.calculate(n, { courts: c, minutes: mins, groups: o.groups, advance: o.advance, doubleRound: o.double, thirdPlace: o.third, swissRounds: o.swiss });
      var legs = o.double ? 2 : 1;
      $('calc-title-n').textContent = n;
      var rows = [], work = [];
      var p2 = E.nextPow2(n), R = E.log2ceil(Math.max(2, n));

      // Single elimination
      var se = res.single;
      var seT = E.create('single', n, { thirdPlace: o.third }), seP = E.plan(seT, c);
      var perRound = Object.keys(seP.byRound).filter(function (k) { return k.indexOf('main') === 0; }).map(function (k) { return seP.byRound[k]; });
      rows.push(['Single elimination', se.games, se.rounds, '1 to ' + se.rounds, timeCell(se.slots, mins, o.hours), se.minutes]);
      work.push('<h3>Single elimination</h3><p>' + n + ' teams need a bracket of ' + p2 + ', so there ' + (se.byes === 1 ? 'is 1 bye' : 'are ' + se.byes + ' byes') +
        (se.byes ? ' for the top ' + (se.byes === 1 ? 'seed' : se.byes + ' seeds') : '') + '. Games: ' + n + ' − 1 = <strong>' + (n - 1) + '</strong>' +
        (se.thirdPlace ? ' + 1 third-place match = <strong>' + se.games + '</strong>' : '') + ', in ' + U.plural(se.rounds, 'round') +
        ' (' + perRound.join(', ') + ' games per round' + (se.thirdPlace ? ', the third-place match with the final' : '') + ').</p>' +
        '<p>On ' + U.plural(c, 'court') + ': ' + slotsExpr(seP.byRound, c).join(' + ') + ' = ' + U.plural(se.slots, 'time slot') +
        (mins ? ' × ' + mins + ' min = <strong>' + (E.formatMinutes(se.minutes) || '0 min') + '</strong>' : '') + '.</p>');

      // Double elimination
      if (res.double) {
        var de = res.double;
        rows.push(['Double elimination', de.games + ' or ' + de.gamesReset, (de.wbRounds + de.lbRounds + 1) + ' or ' + (de.wbRounds + de.lbRounds + 2),
          'at least 2', timeCell(de.slots, mins, o.hours, de.slotsReset - de.slots), de.minutes]);
        work.push('<h3>Double elimination</h3><p>Games: 2 × ' + n + ' − 2 = <strong>' + de.games + '</strong>, or 2 × ' + n + ' − 1 = <strong>' + de.gamesReset +
          '</strong> when the grand final reset is played. Rounds: ' + de.wbRounds + ' in the winners bracket, ' + de.lbRounds +
          ' in the losers bracket, then the grand final (and the reset if needed). Every team plays at least 2 games.</p>' +
          '<p>On ' + U.plural(c, 'court') + ': ' + U.plural(de.slots, 'time slot') + (mins ? ' × ' + mins + ' min = <strong>' + E.formatMinutes(de.minutes) + '</strong>, plus ' + E.formatMinutes(mins) + ' if the reset is played' : '') + '.</p>');
      } else {
        rows.push(['Double elimination', '–', '–', 'needs 3 or more', '–', 0]);
      }

      // Round robin
      var rr = res.roundrobin;
      rows.push(['Round robin' + (o.double ? ' (home and away)' : ''), rr.games, rr.rounds, String(rr.perTeam), timeCell(rr.slots, mins, o.hours), rr.minutes]);
      var perWave = Math.ceil(rr.perRound / c);
      work.push('<h3>Round robin' + (o.double ? ', home and away' : '') + '</h3><p>Games: ' + n + ' × ' + (n - 1) + ' ÷ 2' + (o.double ? ' × 2' : '') + ' = <strong>' + rr.games +
        '</strong>. ' + (n % 2 ? n + ' is odd, so one team has a bye each round: ' : n + ' is even, so nobody rests: ') + U.plural(rr.rounds, 'round') + ' of ' +
        U.plural(rr.perRound, 'game') + '. Every team plays ' + rr.perTeam + ' games.</p>' +
        '<p>On ' + U.plural(c, 'court') + ': ' + rr.rounds + ' rounds × ' + perWave + ' = ' + U.plural(rr.slots, 'time slot') +
        (mins ? ' × ' + mins + ' min = <strong>' + (E.formatMinutes(rr.minutes) || '0 min') + '</strong>' : '') + '.</p>');

      // Groups + playoff
      if (res.groups) {
        var g = res.groups;
        var sizes = {}; g.sizes.forEach(function (k) { sizes[k] = (sizes[k] || 0) + 1; });
        var sizeText = Object.keys(sizes).sort(function (a, b) { return b - a; }).map(function (k) { return sizes[k] + ' of ' + k; }).join(' and ');
        var changed = (g.groups !== o.groups || g.advance !== o.advance) ? ' (adjusted to what ' + n + ' teams allow)' : '';
        rows.push(['Groups + playoff: ' + g.groups + ' × top ' + g.advance, g.games, g.groupRounds + g.playoffRounds, 'at least ' + g.minPerTeam,
          timeCell(g.slots, mins, o.hours), g.minutes]);
        var groupSum = Object.keys(sizes).sort(function (a, b) { return b - a; }).map(function (k) {
          return sizes[k] + ' × ' + (k * (k - 1) / 2) + (o.double ? ' × 2' : '');
        }).join(' + ');
        work.push('<h3>Groups + playoff</h3><p>' + g.groups + ' groups' + changed + ': ' + sizeText + '. Group games: ' + groupSum + ' = <strong>' + g.groupGames +
          '</strong> in ' + U.plural(g.groupRounds, 'round') + '. ' + g.groups + ' × ' + g.advance + ' = ' + g.playoffEntrants + ' go through to ' + (/^8/.test(String(E.nextPow2(Math.max(2, g.playoffEntrants)))) ? 'an ' : 'a ') +
          E.nextPow2(Math.max(2, g.playoffEntrants)) + '-place playoff' + (g.playoffByes ? ' with ' + U.plural(g.playoffByes, 'bye') : '') + ': ' + g.playoffEntrants +
          ' − 1' + (o.third && g.playoffEntrants >= 4 ? ' + 1' : '') + ' = <strong>' + g.playoffGames + '</strong> games in ' + U.plural(g.playoffRounds, 'round') +
          '. Total: <strong>' + g.games + '</strong> games.</p><p>On ' + U.plural(c, 'court') + ': ' + U.plural(g.slots, 'time slot') +
          (mins ? ' × ' + mins + ' min = <strong>' + (E.formatMinutes(g.minutes) || '0 min') + '</strong>' : '') + '.</p>');
      } else {
        rows.push(['Groups + playoff', '–', '–', 'needs 4 or more', '–', 0]);
      }

      // Swiss
      var sw = res.swiss;
      rows.push(['Swiss system', sw.games, sw.rounds, sw.byePerRound ? sw.rounds + ' (' + (sw.rounds - 1) + ' with a bye)' : String(sw.rounds),
        timeCell(sw.slots, mins, o.hours), sw.minutes]);
      work.push('<h3>Swiss system</h3><p>' + (o.swiss > 0 ? 'You chose ' + U.plural(sw.rounds, 'round') + ' (' + sw.recommended + ' is usual for ' + n + ')' :
        '⌈log₂ ' + n + '⌉ = ' + U.plural(sw.rounds, 'round')) + ' of ⌊' + n + ' ÷ 2⌋ = ' + U.plural(sw.perRound, 'game') + ': <strong>' + sw.games + '</strong> games' +
        (sw.byePerRound ? '; one player has a bye each round, which counts as a win' : '') + '.</p><p>On ' + U.plural(c, 'court') + ': ' + sw.rounds + ' rounds × ' +
        Math.ceil(sw.perRound / c) + ' = ' + U.plural(sw.slots, 'time slot') + (mins ? ' × ' + mins + ' min = <strong>' + (E.formatMinutes(sw.minutes) || '0 min') + '</strong>' : '') + '.</p>');

      $('calc-table').tBodies[0].innerHTML = rows.map(function (r) {
        return '<tr><th scope="row">' + U.esc(r[0]) + '</th><td class="num" data-label="Games">' + r[1] + '</td><td class="num" data-label="Rounds">' + r[2] +
          '</td><td data-label="Games per team">' + U.esc(r[3]) + '</td><td data-label="Time">' + r[4] + '</td></tr>';
      }).join('');
      $('calc-work').innerHTML = work.join('');
      $('calc-time-note').textContent = mins > 0 ?
        'Time: matches of one round share the ' + U.plural(c, 'court') + ', and rounds are played one after another; breaks are not counted.' :
        'Enter minutes per match to turn time slots into hours and minutes.';
      last = { n: n, rows: rows, o: o };
      clearTimeout(timer);
      timer = setTimeout(function () {
        $('calc-summary').textContent = n + ' teams: knockout ' + se.games + ' games, ' + (res.double ? 'double elimination ' + res.double.games + ' or ' + res.double.gamesReset + ', ' : '') +
          'round robin ' + rr.games + (res.groups ? ', groups + playoff ' + res.groups.games : '') + ', Swiss ' + sw.games + '.';
      }, 500);
    }

    function plain(html) { var d = document.createElement('div'); d.innerHTML = String(html).replace(/<br>/g, ', '); return d.textContent; }
    function asText() {
      var out = ['Games and rounds for ' + last.n + ' teams' + (last.o.minutes ? ', ' + last.o.courts + ' court(s), ' + last.o.minutes + ' min per match' : ''), ''];
      last.rows.forEach(function (r) {
        out.push(r[0] + ': ' + r[1] + ' games, ' + r[2] + ' rounds, games per team ' + r[3] + (r[4] !== '–' ? ', time ' + plain(r[4]) : ''));
      });
      return out.join('\n') + '\n';
    }
    function asCsv() {
      var rows = [['Format', 'Games', 'Rounds', 'Games per team', 'Minutes']];
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
    $('calc-csv').addEventListener('click', function () { if (last) U.download('tournament-games.csv', asCsv(), 'text/csv;charset=utf-8', $('calc-status')); });
    $('calc-print').addEventListener('click', function () { window.print(); });
    U.printOnly(function () { return $('calc-result'); });
    calc();
  }

  if (window.MW) window.MW.ui.ready(start);
  else document.addEventListener('DOMContentLoaded', start);
})();
