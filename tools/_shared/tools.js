/*
 * Maumiu Works tournament tools: shared engine + small page helpers.
 * The engine is a line-by-line port of Ligona's own generator (Generator.kt, Resolver.kt, FormatPlanner.kt, Swiss.kt),
 * so the web page and the app give the same bracket and the same schedule for the same list of names.
 * Pure functions only in MW.engine; DOM helpers in MW.ui are used by the tool pages.
 * Loads as a classic script (defer) in the browser -> window.MW; in Node -> module.exports.
 */
(function (root) {
  'use strict';

  var BYE = 'bye';
  var PENDING = 'pending';

  // ------------------------------------------------------------------ basics
  function nextPow2(n) { var p = 1; while (p < n) p *= 2; return p; }
  function log2ceil(n) { var r = 0, p = 1; while (p < n) { p *= 2; r++; } return r; }

  /** Standard seeding order (1-based): 1 v 8, 4 v 5, 2 v 7, 3 v 6 ... top seeds meet last. */
  function seedOrder(size) {
    var order = [1];
    while (order.length < size) {
      var next = order.length * 2, out = [];
      for (var i = 0; i < order.length; i++) { out.push(order[i], next + 1 - order[i]); }
      order = out;
    }
    return order;
  }

  function idGen(start) { var n = start || 0; return function () { return n++; }; }

  var Src = {
    seed: function (i) { return { k: 'seed', i: i }; },
    fixed: function (p) { return { k: 'fixed', p: p }; },
    winnerOf: function (m) { return { k: 'w', m: m }; },
    loserOf: function (m) { return { k: 'l', m: m }; },
    rank: function (g, r) { return { k: 'rank', g: g, r: r }; },
    bye: { k: 'bye' }
  };

  function match(id, section, round, order, home, away, extra) {
    var m = { id: id, section: section, round: round, order: order, home: home, away: away, conditional: false, group: -1 };
    if (extra) for (var k in extra) m[k] = extra[k];
    return m;
  }

  // ------------------------------------------------------------------ knockout (Generator.singleElimination)
  /** Entrants in seed order; positions past the end are byes, which always go to the top seeds. */
  function singleElimination(ids, entrants, thirdPlace, section) {
    section = section || 'main';
    var size = nextPow2(Math.max(2, entrants.length));
    var order = seedOrder(size);
    var result = [];
    var previous = [];
    for (var i = 0; i < size / 2; i++) {
      var a = entrants[order[2 * i] - 1] || Src.bye;
      var b = entrants[order[2 * i + 1] - 1] || Src.bye;
      var m = match(ids(), section, 0, i, a, b);
      result.push(m); previous.push(m);
    }
    var round = 1;
    while (previous.length > 1) {
      var next = [];
      for (var j = 0; j < previous.length; j += 2) {
        var mm = match(ids(), section, round, j / 2, Src.winnerOf(previous[j].id), Src.winnerOf(previous[j + 1].id));
        result.push(mm); next.push(mm);
      }
      previous = next;
      round++;
    }
    if (thirdPlace) {
      var semis = result.filter(function (x) { return x.round === round - 2; });
      if (semis.length === 2) {
        result.push(match(ids(), 'third', 0, 0, Src.loserOf(semis[0].id), Src.loserOf(semis[1].id)));
      }
    }
    return result;
  }

  // ------------------------------------------------------------------ double elimination (Generator.doubleElimination)
  function doubleElimination(ids, n, reset) {
    var entrants = [];
    for (var i = 0; i < n; i++) entrants.push(Src.seed(i));
    var winners = singleElimination(ids, entrants, false, 'winners');
    var wbRounds = 0;
    winners.forEach(function (m) { wbRounds = Math.max(wbRounds, m.round + 1); });
    function wb(r) { return winners.filter(function (m) { return m.round === r; }).sort(function (x, y) { return x.order - y.order; }); }
    var losers = [];
    if (wbRounds >= 2) {
      var w0 = wb(0), current = [];
      for (var j = 0; j < w0.length; j += 2) {
        current.push(match(ids(), 'losers', 0, j / 2, Src.loserOf(w0[j].id), Src.loserOf(w0[j + 1].id)));
      }
      losers = losers.concat(current);
      var lbRound = 1;
      for (var k = 1; k < wbRounds; k++) {
        // Drop-in round: LB survivors meet the losers of WB round k (order flipped to avoid quick rematches).
        var dropping = wb(k);
        if (k % 2 === 1) dropping = dropping.slice().reverse();
        current = current.map(function (m, idx) {
          return match(ids(), 'losers', lbRound, idx, Src.winnerOf(m.id), Src.loserOf(dropping[idx].id));
        });
        losers = losers.concat(current);
        lbRound++;
        if (k < wbRounds - 1) {
          var halved = [];
          for (var h = 0; h < current.length; h += 2) {
            halved.push(match(ids(), 'losers', lbRound, h / 2, Src.winnerOf(current[h].id), Src.winnerOf(current[h + 1].id)));
          }
          current = halved;
          losers = losers.concat(current);
          lbRound++;
        }
      }
    }
    var wbFinal = winners.reduce(function (a, b) { return b.round > a.round ? b : a; });
    var lbFinal = losers.length ? losers.reduce(function (a, b) { return b.round > a.round ? b : a; }) : null;
    var lbChampion = lbFinal ? Src.winnerOf(lbFinal.id) : Src.loserOf(wbFinal.id);
    var finals = [match(ids(), 'final', 0, 0, Src.winnerOf(wbFinal.id), lbChampion)];
    if (reset) finals.push(match(ids(), 'final', 1, 0, Src.winnerOf(wbFinal.id), lbChampion, { conditional: true }));
    return winners.concat(losers, finals);
  }

  // ------------------------------------------------------------------ round robin (Generator.roundRobin, circle method)
  /**
   * Everyone plays everyone once (or twice, home and away). Participants are ids (numbers).
   * Returns matches {round, order, home, away} with home/away = participant ids; byes are not generated.
   */
  function roundRobin(participants, doubleRound, ids, group) {
    ids = ids || idGen();
    group = group == null ? 0 : group;
    var odd = participants.length % 2 === 1;
    var list = participants.slice();
    if (odd) list.push(null);
    var m = list.length;
    var rounds = m - 1;
    var firstLeg = []; // [round, home, away]
    var balance = {}, lastHome = {};
    var ring = list.slice();
    for (var r = 0; r < rounds; r++) {
      for (var i = 0; i < m / 2; i++) {
        var a = ring[i], b = ring[m - 1 - i];
        if (a === null || b === null) continue;
        var aHome;
        if (!odd) {
          aHome = !((i === 0 && r % 2 === 1) || (i > 0 && i % 2 === 1));
        } else {
          var ka0 = lastHome[a] === true ? 1 : 0, ka1 = balance[a] || 0;
          var kb0 = lastHome[b] === true ? 1 : 0, kb1 = balance[b] || 0;
          if (ka0 !== kb0 || ka1 !== kb1) aHome = ka0 !== kb0 ? ka0 < kb0 : ka1 < kb1;
          else aHome = (r + i) % 2 === 0;
        }
        var home = aHome ? a : b, away = aHome ? b : a;
        balance[home] = (balance[home] || 0) + 1;
        balance[away] = (balance[away] || 0) - 1;
        lastHome[home] = true; lastHome[away] = false;
        firstLeg.push([r, home, away]);
      }
      ring = [ring[0], ring[m - 1]].concat(ring.slice(1, m - 1));
    }
    var result = [], order = 0, lastRound = -1;
    firstLeg.forEach(function (f) {
      if (f[0] !== lastRound) { order = 0; lastRound = f[0]; }
      result.push(match(ids(), 'group', f[0], order++, Src.fixed(f[1]), Src.fixed(f[2]), { group: group }));
    });
    if (doubleRound) {
      var shift = (odd || rounds < 2) ? 0 : 1;
      for (var k = 0; k < rounds; k++) {
        var rr = (k + shift) % rounds, o = 0;
        firstLeg.forEach(function (f) {
          if (f[0] !== rr) return;
          result.push(match(ids(), 'group', rounds + k, o++, Src.fixed(f[2]), Src.fixed(f[1]), { group: group }));
        });
      }
    }
    return result;
  }

  /** Round robin as plain rounds: [{round, games:[[home, away]], bye:[ids]}] (ids = indexes into the name list). */
  function roundRobinRounds(n, doubleRound) {
    var ids = []; for (var i = 0; i < n; i++) ids.push(i);
    var ms = roundRobin(ids, doubleRound);
    var total = 0; ms.forEach(function (m) { total = Math.max(total, m.round + 1); });
    var rounds = [];
    for (var r = 0; r < total; r++) rounds.push({ round: r, games: [], bye: [] });
    ms.forEach(function (m) { rounds[m.round].games.push([m.home.p, m.away.p]); });
    rounds.forEach(function (rd) {
      var playing = {};
      rd.games.forEach(function (g) { playing[g[0]] = 1; playing[g[1]] = 1; });
      for (var p = 0; p < n; p++) if (!playing[p]) rd.bye.push(p);
    });
    return rounds;
  }

  // ------------------------------------------------------------------ groups + playoff
  /** Snake seeding: group of seed index i when there are g groups. */
  function groupOf(i, groups) {
    var row = Math.floor(i / groups), col = i % groups;
    return row % 2 === 0 ? col : groups - 1 - col;
  }

  function groupMembers(n, groups) {
    var out = []; for (var g = 0; g < groups; g++) out.push([]);
    for (var i = 0; i < n; i++) out[groupOf(i, groups)].push(i);
    return out;
  }

  /** Group qualifiers in playoff seed order, each rank block rotated so no first-round match is a same-group rematch. */
  function playoffEntrants(groups, advance) {
    var seeds = [];
    for (var g = 0; g < groups; g++) seeds.push(Src.rank(g, 0));
    var size = nextPow2(Math.max(2, groups * advance));
    var order = seedOrder(size);
    function clashes(list) {
      var c = 0;
      for (var i = 0; i < size / 2; i++) {
        var a = list[order[2 * i] - 1], b = list[order[2 * i + 1] - 1];
        if (a && b && a.g === b.g) c++;
      }
      return c;
    }
    for (var rank = 1; rank < advance; rank++) {
      var block = []; for (var gg = 0; gg < groups; gg++) block.push(Src.rank(gg, rank));
      var best = null, bestC = Infinity;
      for (var shift = 0; shift < groups; shift++) {
        var cand = seeds.concat(block.slice(shift), block.slice(0, shift));
        var c = clashes(cand);
        if (c < bestC) { bestC = c; best = cand; }
      }
      seeds = best;
    }
    return seeds;
  }

  /** Same limits as the app (Generator.normalizeSettings). */
  function normalizeGroups(n, groups, advance) {
    var g = Math.min(Math.max(1, groups), Math.max(1, Math.floor(n / 2)));
    var smallest = Math.floor(n / g);
    var q = Math.min(Math.max(1, advance), Math.max(1, smallest));
    return { groups: g, advance: q };
  }

  // ------------------------------------------------------------------ tournament + resolver
  /**
   * format: 'single' | 'double' | 'roundrobin' | 'groups'
   * opts: {thirdPlace, reset, doubleRound, groups, advance}
   */
  function create(format, n, opts) {
    opts = opts || {};
    var ids = idGen(), matches;
    var seeds = []; for (var i = 0; i < n; i++) seeds.push(Src.seed(i));
    if (format === 'single') matches = singleElimination(ids, seeds, !!opts.thirdPlace);
    else if (format === 'double') matches = doubleElimination(ids, n, opts.reset !== false);
    else if (format === 'roundrobin') {
      var all = []; for (var p = 0; p < n; p++) all.push(p);
      matches = roundRobin(all, !!opts.doubleRound, ids, 0);
    } else if (format === 'groups') {
      var gs = normalizeGroups(n, opts.groups || 2, opts.advance || 2);
      var members = groupMembers(n, gs.groups);
      matches = [];
      members.forEach(function (list, g) { matches = matches.concat(roundRobin(list, !!opts.doubleRound, ids, g)); });
      matches = matches.concat(singleElimination(ids, playoffEntrants(gs.groups, gs.advance), !!opts.thirdPlace));
    } else throw new Error('Unknown format ' + format);
    return { format: format, n: n, matches: matches, results: {} };
  }

  /**
   * Derives every slot from the match graph and the recorded results (t.results[matchId] = {w:'h'|'a', h:id, a:id}).
   * A result recorded for other participants than those now in the slots is ignored (Resolver.kt).
   * Group ranks are not resolved here (the web tools do not play out groups): they stay pending.
   */
  function resolver(t) {
    var byId = {}, memo = {};
    t.matches.forEach(function (m) { byId[m.id] = m; });
    var firstFinal = null;
    t.matches.forEach(function (m) { if (m.section === 'final' && !m.conditional && !firstFinal) firstFinal = m; });

    function slot(s) {
      switch (s.k) {
        case 'seed': return s.i < t.n ? s.i : BYE;
        case 'fixed': return s.p;
        case 'w': return outcome(s.m).winner;
        case 'l': return outcome(s.m).loser;
        case 'rank': return PENDING;
        default: return BYE;
      }
    }
    function out(home, away, state, winner, loser) { return { home: home, away: away, state: state, winner: winner, loser: loser }; }
    function compute(m) {
      var home = slot(m.home), away = slot(m.away);
      if (m.conditional) {
        var fo = firstFinal ? outcome(firstFinal.id) : null;
        if (!fo || fo.state === 'waiting' || fo.state === 'ready') return out(home, away, 'waiting', PENDING, PENDING);
        if (fo.winner !== fo.away || fo.state === 'bye') return out(home, away, 'skipped', PENDING, PENDING);
      }
      if (home === PENDING || away === PENDING) return out(home, away, 'waiting', PENDING, PENDING);
      if (home === BYE && away === BYE) return out(home, away, 'bye', BYE, BYE);
      if (home === BYE) return out(home, away, 'bye', away, BYE);
      if (away === BYE) return out(home, away, 'bye', home, BYE);
      var r = t.results[m.id];
      if (!r || r.h !== home || r.a !== away) return out(home, away, 'ready', PENDING, PENDING);
      return r.w === 'h' ? out(home, away, 'done', home, away) : out(home, away, 'done', away, home);
    }
    function outcome(id) {
      if (!(id in memo)) memo[id] = compute(byId[id]);
      return memo[id];
    }
    return { outcome: outcome, slot: slot, byId: byId };
  }

  /** Drops results whose participants no longer match the slot (repeats until stable). Returns the ids dropped. */
  function normalize(t) {
    var dropped = [];
    for (;;) {
      var r = resolver(t), stale = [];
      Object.keys(t.results).forEach(function (k) {
        var id = +k, res = t.results[k], o = r.outcome(id);
        if (o.state === 'skipped' || o.state === 'waiting' || o.state === 'bye' || o.home !== res.h || o.away !== res.a) stale.push(k);
      });
      if (!stale.length) return dropped;
      stale.forEach(function (k) { delete t.results[k]; dropped.push(+k); });
    }
  }

  /**
   * Sets the winner of a match (side 'h' or 'a'); later results that no longer fit are cleared.
   * Returns {ok, cleared:[matchIds]}.
   */
  function setWinner(t, matchId, side) {
    var o = resolver(t).outcome(matchId);
    if (o.state !== 'ready' && o.state !== 'done') return { ok: false, cleared: [] };
    t.results[matchId] = { w: side, h: o.home, a: o.away };
    return { ok: true, cleared: normalize(t) };
  }

  function clearResult(t, matchId) {
    delete t.results[matchId];
    return { ok: true, cleared: normalize(t) };
  }

  /** A slot that is a bye whatever happens (a structural bye): seeds past the field, losers of bye matches... */
  function structuralByes(t) {
    var byId = {}, memo = {};
    t.matches.forEach(function (m) { byId[m.id] = m; });
    function always(s) {
      switch (s.k) {
        case 'bye': return true;
        case 'seed': return s.i >= t.n;
        case 'w': return matchSides(s.m) === 2;
        case 'l': return matchSides(s.m) >= 1;
        default: return false;
      }
    }
    function matchSides(id) {
      if (!(id in memo)) { var m = byId[id]; memo[id] = (always(m.home) ? 1 : 0) + (always(m.away) ? 1 : 0); }
      return memo[id];
    }
    var res = {};
    t.matches.forEach(function (m) { res[m.id] = matchSides(m.id); });
    return res; // matchId -> 0 (real game), 1 (one side is always a bye), 2 (both)
  }

  /** Matches that are really played (byes left out). The reset final counts (it may be played). */
  function realMatches(t) {
    var sb = structuralByes(t);
    return t.matches.filter(function (m) { return sb[m.id] === 0; });
  }

  function isFinished(t) {
    var r = resolver(t);
    return t.matches.length > 0 && t.matches.every(function (m) {
      var s = r.outcome(m.id).state; return s !== 'waiting' && s !== 'ready';
    });
  }

  /** Final places once finished: [[1st], [2nd], [3rd...]] as participant ids. */
  function podium(t) {
    if (!isFinished(t)) return [];
    var r = resolver(t);
    function known(x) { return typeof x === 'number'; }
    if (t.format === 'double') {
      var finals = t.matches.filter(function (m) {
        if (m.section !== 'final') return false; var s = r.outcome(m.id).state; return s === 'done' || s === 'bye';
      });
      if (!finals.length) return [];
      var last = finals.reduce(function (a, b) { return b.round > a.round ? b : a; });
      var o = r.outcome(last.id);
      var lbs = t.matches.filter(function (m) { return m.section === 'losers'; });
      var lbFinal = lbs.length ? lbs.reduce(function (a, b) { return b.round > a.round ? b : a; }) : null;
      var third = lbFinal ? r.outcome(lbFinal.id).loser : null;
      var res = [];
      if (known(o.winner)) res.push([o.winner]);
      if (known(o.loser)) res.push([o.loser]);
      if (known(third)) res.push([third]);
      return res;
    }
    var main = t.matches.filter(function (m) { return m.section === 'main'; });
    var fin = main.reduce(function (a, b) { return b.round > a.round ? b : a; });
    var fo = r.outcome(fin.id);
    if (!known(fo.winner)) return [];
    var places = [[fo.winner]];
    if (known(fo.loser)) places.push([fo.loser]);
    var tp = t.matches.filter(function (m) { return m.section === 'third'; })[0];
    var thirds;
    if (tp) { var w = r.outcome(tp.id).winner; thirds = known(w) ? [w] : []; }
    else {
      thirds = main.filter(function (m) { return m.round === fin.round - 1; })
        .map(function (m) { return r.outcome(m.id).loser; }).filter(known);
    }
    if (thirds.length) places.push(thirds);
    return places;
  }

  // ------------------------------------------------------------------ labels (Labels.kt)
  function sectionRounds(t, section) {
    var n = 0; t.matches.forEach(function (m) { if (m.section === section) n = Math.max(n, m.round + 1); }); return n || 1;
  }
  function knockoutRoundLabel(round, rounds) {
    var left = rounds - round;
    if (left === 1) return 'Final';
    if (left === 2) return 'Semi-finals';
    if (left === 3) return 'Quarter-finals';
    return 'Round of ' + Math.pow(2, left);
  }
  function roundLabel(t, section, round) {
    var rs = sectionRounds(t, section);
    switch (section) {
      case 'main': return knockoutRoundLabel(round, rs);
      case 'winners': return round === rs - 1 ? 'Winners final' : 'Winners round ' + (round + 1);
      case 'losers': return round === rs - 1 ? 'Losers final' : 'Losers round ' + (round + 1);
      case 'final': return round === 0 ? 'Grand final' : 'Grand final reset';
      case 'third': return 'Third place';
      default: return 'Round ' + (round + 1);
    }
  }
  var SECTION_ORDER = { group: 0, main: 1, winners: 1, losers: 2, third: 3, final: 4 };
  /** Display order (Labels.displayOrder) and numbers M1, M2... for real games. */
  function matchNumbers(t) {
    var sb = structuralByes(t);
    var sorted = t.matches.slice().sort(function (a, b) {
      return (SECTION_ORDER[a.section] - SECTION_ORDER[b.section]) ||
        ((a.section === 'group' ? a.round : 0) - (b.section === 'group' ? b.round : 0)) ||
        (a.group - b.group) || (a.round - b.round) || (a.order - b.order);
    });
    var nums = {}, k = 0;
    sorted.forEach(function (m) { if (sb[m.id] === 0) nums[m.id] = ++k; });
    return nums;
  }

  // ------------------------------------------------------------------ counting (calculator)
  /** Games and time like the app's planner: matches of one round of one section share the courts, rounds follow each other. */
  function plan(t, courts) {
    var real = realMatches(t);
    var waves = {}, keys = [];
    real.forEach(function (m) {
      var k = m.section + ':' + m.round;
      if (!(k in waves)) { waves[k] = 0; keys.push(k); }
      waves[k]++;
    });
    var c = Math.max(1, courts || 1), slots = 0;
    keys.forEach(function (k) { slots += Math.ceil(waves[k] / c); });
    return { games: real.length, rounds: keys.length, slots: slots, byRound: waves };
  }

  /** Swiss rounds the app suggests when none are set (Swiss.recommendedRounds). */
  function swissRounds(n) { return n <= 2 ? 1 : Math.min(n - 1, log2ceil(n)); }

  /** All numbers for N participants. opts: {courts, minutes, groups, advance, doubleRound, thirdPlace, swissRounds} */
  function calculate(n, opts) {
    opts = opts || {};
    var courts = Math.max(1, opts.courts || 1), minutes = Math.max(0, opts.minutes || 0);
    var res = {};
    var p2 = nextPow2(Math.max(2, n));
    // Single elimination
    var se = create('single', n, { thirdPlace: !!opts.thirdPlace });
    var sp = plan(se, courts);
    res.single = { games: sp.games, rounds: log2ceil(Math.max(2, n)), byes: p2 - n, bracket: p2, slots: sp.slots,
      thirdPlace: !!opts.thirdPlace && n >= 4 };
    // Double elimination
    if (n >= 3) {
      var deNo = plan(create('double', n, { reset: false }), courts);
      var deYes = plan(create('double', n, { reset: true }), courts);
      var dt = create('double', n, { reset: true });
      var lbRounds = {};
      realMatches(dt).forEach(function (m) { if (m.section === 'losers') lbRounds[m.round] = 1; });
      res.double = { games: deNo.games, gamesReset: deYes.games, wbRounds: log2ceil(n), lbRounds: Object.keys(lbRounds).length,
        byes: p2 - n, bracket: p2, slots: deNo.slots, slotsReset: deYes.slots };
    }
    // Round robin: counted, not generated (1024 teams would be half a million matches). Every round of the circle
    // method has floor(N/2) games (tested against the generator in engine.test.mjs).
    var legs = opts.doubleRound ? 2 : 1;
    function rrRounds(k) { return (k % 2 === 0 ? k - 1 : k) * legs; }
    var rrR = rrRounds(n), per0 = Math.floor(n / 2);
    res.roundrobin = { games: n * (n - 1) / 2 * legs, rounds: rrR, perRound: per0, perTeam: (n - 1) * legs,
      byePerRound: n % 2 === 1, slots: rrR * Math.ceil(per0 / courts) };
    // Groups + playoff
    if (n >= 4) {
      var gs = normalizeGroups(n, opts.groups || 2, opts.advance || 2);
      var sizes = groupMembers(n, gs.groups).map(function (l) { return l.length; });
      var groupRounds = 0, groupGames = 0, gSlots = 0;
      sizes.forEach(function (k) { groupRounds = Math.max(groupRounds, rrRounds(k)); groupGames += k * (k - 1) / 2 * legs; });
      // Round r of every group is played at the same time (the app's planner groups matches by round).
      for (var r = 0; r < groupRounds; r++) {
        var inRound = 0;
        sizes.forEach(function (k) { if (r < rrRounds(k)) inRound += Math.floor(k / 2); });
        gSlots += Math.ceil(inRound / courts);
      }
      var po = { n: 0, matches: singleElimination(idGen(), playoffEntrants(gs.groups, gs.advance), !!opts.thirdPlace), results: {} };
      var pp = plan(po, courts);
      var q = gs.groups * gs.advance;
      res.groups = { groups: gs.groups, advance: gs.advance, sizes: sizes, groupGames: groupGames,
        playoffGames: pp.games, games: groupGames + pp.games, groupRounds: groupRounds,
        playoffEntrants: q, playoffRounds: log2ceil(Math.max(2, q)), playoffByes: nextPow2(Math.max(2, q)) - q,
        slots: gSlots + pp.slots, minPerTeam: (Math.min.apply(null, sizes) - 1) * legs };
    }
    // Swiss
    var sr = opts.swissRounds > 0 ? Math.min(opts.swissRounds, Math.max(1, n - 1)) : swissRounds(n);
    var per = Math.floor(n / 2);
    res.swiss = { rounds: sr, perRound: per, games: sr * per, byePerRound: n % 2 === 1,
      slots: sr * Math.ceil(per / courts), recommended: swissRounds(n) };
    Object.keys(res).forEach(function (k) {
      var r = res[k];
      r.minutes = r.slots * minutes;
      if (r.slotsReset != null) r.minutesReset = r.slotsReset * minutes;
    });
    return res;
  }

  // ------------------------------------------------------------------ text helpers (pure)
  /** One name per line (or comma/semicolon/tab separated when the paste is a single line). Numbering "1." is removed. */
  function parseNames(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    if (lines.filter(function (l) { return l.trim(); }).length === 1 && /[,;\t]/.test(lines.join(''))) {
      lines = lines.join('').split(/[,;\t]/);
    }
    lines = lines.map(function (l) { return l.trim().replace(/\s+/g, ' '); }).filter(function (l) { return l.length; });
    // A numbered or bulleted list ("1. Lions", "- Lions"): drop the numbers, but only when every line has one,
    // so a name like "1. FC Köln" in a plain list stays as it is.
    var mark = /^(?:\d{1,3}[.)]|[-*•])\s+/;
    if (lines.length > 1 && lines.every(function (l) { return mark.test(l); })) {
      lines = lines.map(function (l) { return l.replace(mark, ''); }).filter(function (l) { return l.length; });
    }
    return lines.map(function (l) { return l.slice(0, 60); });
  }

  function duplicates(names) {
    var seen = {}, dup = [];
    names.forEach(function (n) { var k = n.toLowerCase(); if (seen[k] === 1) dup.push(n); seen[k] = (seen[k] || 0) + 1; });
    return dup;
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    // Spreadsheets run cells that start with = + - @ as formulas: keep them as text.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }

  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }

  function formatMinutes(min) {
    if (!(min > 0)) return '';
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  var engine = {
    BYE: BYE, PENDING: PENDING, nextPow2: nextPow2, log2ceil: log2ceil, seedOrder: seedOrder, idGen: idGen, Src: Src,
    singleElimination: singleElimination, doubleElimination: doubleElimination, roundRobin: roundRobin,
    roundRobinRounds: roundRobinRounds, groupOf: groupOf, groupMembers: groupMembers, playoffEntrants: playoffEntrants,
    normalizeGroups: normalizeGroups, create: create, resolver: resolver, normalize: normalize, setWinner: setWinner,
    clearResult: clearResult, structuralByes: structuralByes, realMatches: realMatches, isFinished: isFinished,
    podium: podium, roundLabel: roundLabel, knockoutRoundLabel: knockoutRoundLabel, matchNumbers: matchNumbers,
    sectionRounds: sectionRounds, plan: plan, swissRounds: swissRounds, calculate: calculate, parseNames: parseNames,
    duplicates: duplicates, toCsv: toCsv, shuffle: shuffle, formatMinutes: formatMinutes
  };

  // ------------------------------------------------------------------ page helpers (browser only)
  var ui = {
    $: function (sel, ctx) { return (ctx || document).querySelector(sel); },
    $$: function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); },
    esc: function (s) {
      return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    },
    /** Short status line near a button (aria-live region inside the tool). */
    say: function (el, text) {
      if (!el) return;
      el.textContent = '';
      setTimeout(function () { el.textContent = text; }, 30);
    },
    copy: function (text, statusEl) {
      function done() { ui.say(statusEl, 'Copied to the clipboard.'); }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        ui.say(statusEl, ok ? 'Copied to the clipboard.' : 'Copy did not work in this browser: select the text and copy it by hand.');
      }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    },
    download: function (filename, text, type, statusEl) {
      var blob = new Blob(['﻿' + text], { type: type || 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      ui.say(statusEl, 'Saved ' + filename + '.');
    },
    /**
     * Print only [getEl()] (the schedule or bracket): before printing, every sibling along the path from it up to
     * <body> is hidden, so the site bar, the form, the explanations and the footer stay off the paper.
     */
    printOnly: function (getEl) {
      function hide() {
        var el = getEl();
        if (!el || el.hidden) return;
        for (var node = el; node && node !== document.body; node = node.parentNode) {
          var p = node.parentNode; if (!p || !p.children) break;
          Array.prototype.forEach.call(p.children, function (c) { if (c !== node) c.setAttribute('data-tl-hide', ''); });
        }
      }
      function show() { ui.$$('[data-tl-hide]').forEach(function (c) { c.removeAttribute('data-tl-hide'); }); }
      window.addEventListener('beforeprint', hide);
      window.addEventListener('afterprint', show);
    },
    ready: function (fn) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
    },
    plural: function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  };

  var api = { engine: engine, ui: ui };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MW = api;
})(this);
