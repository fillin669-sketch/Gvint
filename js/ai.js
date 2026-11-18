'use strict';
/* =====================================================================
   ИИ ПРОТИВНИКА
   Перебирает все возможные ходы, симулирует каждый на копии состояния
   и выбирает лучший с учётом разницы очков, преимущества в картах
   и экономии сильных карт в «необязательных» раундах.
   ===================================================================== */

const AI = (() => {
  const CARD_VALUE = 8;

  const clone = (s) => JSON.parse(JSON.stringify(s));

  function pickBest(cards) {
    const spy = cards.find((c) => has(c, 'spy'));
    if (spy) return spy;
    return cards.slice().sort((a, b) => (b.power || 0) - (a.power || 0))[0] || null;
  }

  const SIM_CTX = {
    sim: true,
    log() {},
    async choose(pIdx, cards) { return pickBest(cards); },
  };

  function mulligan(s, pIdx) {
    const P = s.players[pIdx];
    let n = mulliganLimit(P);
    const seenKinds = new Set();
    const isBad = (c) => {
      if (c.type === 'unit') return !c.abil.length && c.power <= 2;
      if (c.kind === 'weather' || c.kind === 'clear') {
        if (seenKinds.has(c.kind)) return true;
        seenKinds.add(c.kind);
      }
      return false;
    };
    const bad = P.hand.filter(isBad);
    for (const c of bad) {
      if (n-- <= 0) break;
      mulliganCard(s, pIdx, c.uid);
    }
  }

  function cost(m) {
    if (m.type === 'leader') return 6;
    const c = m.card;
    if (c.type === 'unit') return has(c, 'spy') ? 0 : c.power * (isHero(c) ? 1.3 : 1);
    return { weather: 3, clear: 2, horn: 5, decoy: 2, scorch: 6, kill2: 7, damage: 4, aoe: 5,
      rowdmg: 5, charm: 5, curse: 5, discard: 3, draw2: 2, shop: 2,
      revive: 4, shield: 1, heal: 3, healOne: 2, tax: 3, reflect: 4, fort: 3, story: 4 }[c.kind] || 3;
  }

  function genMoves(s, me) {
    const P = s.players[me];
    const res = [];
    const seen = new Set();
    for (const c of P.hand) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      for (const t of legalTargets(s, me, c)) res.push({ type: 'card', uid: c.uid, target: t, card: c });
    }
    if (leaderAvailable(s, me)) res.push({ type: 'leader' });
    return res;
  }

  async function evaluate(s, me) {
    const op = 1 - me;
    const P = s.players[me], O = s.players[op];
    const base = totalScore(s, me) - totalScore(s, op);
    const hb = P.hand.length - O.hand.length;
    const moves = genMoves(s, me);
    for (const m of moves) {
      // случайность (добор, призыв) — усредняем по двум прогонам
      let diff = 0, adv = 0;
      const RUNS = 2;
      for (let k = 0; k < RUNS; k++) {
        const c2 = clone(s);
        await performAction(c2, me, { type: m.type, uid: m.uid, target: m.target }, SIM_CTX);
        diff += totalScore(c2, me) - totalScore(c2, op);
        adv += (c2.players[me].hand.length - c2.players[op].hand.length) - hb + 1;
      }
      m.diff = diff / RUNS;
      m.gain = m.diff - base;
      m.adv = adv / RUNS + (m.card && m.card.free ? 1 : 0);
      m.cost = cost(m);
    }
    return { moves, diff: base };
  }

  async function choose(s, me) {
    const op = 1 - me;
    const P = s.players[me], O = s.players[op];
    const tw = tieWinner(s);
    const need = tw === me ? 0 : 1;          // нужная разница для победы в раунде
    const mustWin = P.lives === 1;           // проигрыш раунда = проигрыш игры
    const PASS = { type: 'pass' };

    const { moves, diff } = await evaluate(s, me);
    if (!moves.length) return PASS;

    // ---- противник спасовал ----
    if (O.passed) {
      if (diff >= need) return PASS;
      const winning = moves.filter((m) => m.diff >= need).sort((a, b) => a.cost - b.cost || b.diff - a.diff);
      if (winning.length) return winning[0];
      const potential = moves.reduce((acc, m) => acc + Math.max(0, m.gain), 0);
      if (mustWin || diff + potential >= need) {
        return moves.sort((a, b) => (b.gain + CARD_VALUE * b.adv) - (a.gain + CARD_VALUE * a.adv))[0];
      }
      return PASS;
    }

    // ---- обычный ход ----
    const firstRound = P.lives === 2 && O.lives === 2;
    if (!mustWin) {
      if (firstRound) {
        if (diff >= need && P.hand.length <= O.hand.length && (totalScore(s, me) >= 25 || P.hand.length <= 6)) return PASS;
        if (diff <= -22 && P.hand.length <= O.hand.length + 2) return PASS;
      } else if (O.lives === 1) {
        // мы уже ведём по раундам — можем отдать раунд, сохранив карты
        if (diff <= -15 && P.hand.length <= O.hand.length + 1) return PASS;
      }
    }

    const w = mustWin ? 0.1 : O.lives === 1 ? 0.4 : 0.7;
    for (const m of moves) m.value = m.gain + CARD_VALUE * m.adv - w * m.cost + Math.random() * 0.5;
    moves.sort((a, b) => b.value - a.value);
    const best = moves[0];
    if (!mustWin && best.value < -6 && diff >= need) return PASS;
    return best;
  }

  return { choose, mulligan, pickBest };
})();
