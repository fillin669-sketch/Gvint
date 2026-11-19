'use strict';
/* =====================================================================
   ИИ ПРОТИВНИКА
   На каждом шаге перебирает все возможные действия (сыграть карту,
   сила героя, атака), проигрывает каждое на копии партии и выбирает
   лучшее по оценке позиции. Если ничего не улучшает позицию — конец хода.
   ===================================================================== */

const AI = (() => {
  const clone = (s) => JSON.parse(JSON.stringify(s));

  function pickBest(cards) {
    return cards.slice().sort((a, b) => (b.cost || 0) - (a.cost || 0))[0] || null;
  }

  const SIM = { log() {}, async choose(p, cards) { return pickBest(cards); } };

  function heroValue(p) {
    const hp = p.hp + p.armor;
    if (p.hp <= 0) return -1000;
    return hp * 0.85 + (hp < 12 ? (hp - 12) * 1.2 : 0);
  }

  function minionValue(s, m) {
    const atk = m.cantAttack ? 0 : getAtk(s, m);
    let v = 1 + atk * 1.05 + m.hp * 0.95;
    if (hasKw(m, 'taunt')) v += 1.2;
    if (hasKw(m, 'shield')) v += atk * 0.7 + 0.5;
    if (hasKw(m, 'stealth')) v += 0.8;
    if (hasKw(m, 'poison')) v += 2;
    if (hasKw(m, 'windfury')) v += atk * 0.5;
    if (hasKw(m, 'lifesteal')) v += atk * 0.4;
    if (hasKw(m, 'dodge')) v += atk * 0.4 + 0.5;
    if (hasKw(m, 'tough')) v += 1;
    if (hasKw(m, 'thorns')) v += 1;
    if (m.kill) v += 1;
    if (m.aura) v += 2;
    if (m.end) v += 2.5;
    if (m.spellDiscount) v += 1;
    if (m.frozen) v -= atk * 0.4;
    if (m.debt) v -= m.debt * 1.5;
    if (m.preg) v -= 2;
    return v;
  }

  function score(s, me) {
    const op = 1 - me;
    if (s.phase === 'over') return s.winner === me ? 10000 : s.winner === op ? -10000 : 0;
    const P = s.players[me], O = s.players[op];
    let v = heroValue(P) - heroValue(O);
    P.board.forEach((m) => { v += minionValue(s, m); });
    O.board.forEach((m) => { v -= minionValue(s, m) * 1.05; });
    const handCards = (p) => p.hand.filter((c) => c.id !== 'coin').length;
    v += handCards(P) * 1.6 - handCards(O) * 0.8;
    v += P.gold * 0.45 - O.gold * 0.2;
    // угроза летала: сумма атаки врага против нашего здоровья
    const threat = O.board.reduce((a, m) => a + (m.cantAttack ? 0 : getAtk(s, m)), 0);
    if (threat >= P.hp + P.armor) v -= 40;
    return v;
  }

  function genActions(s, me) {
    const P = s.players[me];
    const out = [];
    const seen = new Set();
    for (const c of P.hand) {
      if (!canPlay(s, me, c)) continue;
      const key = c.id + ':' + c.cost;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = cardTargets(s, me, c);
      if (t && t.length) t.forEach((target) => out.push({ type: 'play', uid: c.uid, target, card: c }));
      else out.push({ type: 'play', uid: c.uid, target: null, card: c });
    }
    if (canPower(s, me)) {
      const t = powerTargets(s, me);
      if (t) t.forEach((target) => out.push({ type: 'power', target }));
      else out.push({ type: 'power', target: null });
    }
    if (canShop(s, me)) out.push({ type: 'shop' });
    for (const m of P.board) {
      if (!canAttack(s, m)) continue;
      attackTargets(s, m).forEach((target) => out.push({ type: 'attack', uid: m.uid, target }));
    }
    return out;
  }

  async function simulate(s, me, a, depth) {
    const c = clone(s);
    await performAction(c, { type: a.type, uid: a.uid, target: a.target }, SIM);
    let v = score(c, me);
    // для маны (Медяк, Аванс) смотрим на один шаг дальше
    if (depth > 0 && a.card && a.card.fx && a.card.fx.some((f) => f.e === 'mana')) {
      let best = v - 0.5;
      for (const b of genActions(c, me)) if (b.type !== 'attack') best = Math.max(best, (await simulate(c, me, b, 0)));
      v = best;
    }
    return v;
  }

  /* Уровни сложности:
     noise   — ошибка в оценке позиции (чем больше, тем чаще «не видит» лучший ход)
     blunder — шанс сделать случайный ход вместо лучшего
     lazy    — шанс закончить ход, хотя ходы ещё есть
     look    — смотреть ли на ход вперёд (Медяк, Аванс)
     lethal  — всегда ли замечает добивание */
  const LEVELS = {
    easy:   { noise: 5,   blunder: 0.3,  lazy: 0.2,  look: false, lethal: 0.4 },
    medium: { noise: 1.8, blunder: 0.1,  lazy: 0.06, look: true,  lethal: 0.85 },
    hard:   { noise: 0.3, blunder: 0,    lazy: 0,    look: true,  lethal: 1 },
  };
  let level = 'medium';
  function setLevel(l) { if (LEVELS[l]) level = l; }

  /** Следующее действие ИИ или {type:'end'} */
  async function choose(s, me, lvl) {
    const L = LEVELS[lvl || level];
    const base = score(s, me);
    const actions = genActions(s, me);
    if (!actions.length) return { type: 'end' };
    const evals = [];
    for (const a of actions) {
      const runs = a.type === 'attack' ? 1 : 2;
      let v = 0;
      for (let i = 0; i < runs; i++) v += await simulate(s, me, a, L.look ? 1 : 0);
      v /= runs;
      if (a.type === 'play' && a.card.type === 'minion') v += 0.3;
      evals.push({ a, v, win: v >= 9000 });
    }
    // добивание: сильный ИИ не упускает, слабый — иногда
    const lethal = evals.find((e) => e.win);
    if (lethal && Math.random() < L.lethal) return pack(lethal.a);
    if (Math.random() < L.lazy) return { type: 'end' };
    if (Math.random() < L.blunder) {
      const ok = evals.filter((e) => e.v > base - 6);   // откровенно самоубийственные ходы не делает
      if (ok.length) return pack(pickRandom(ok).a);
    }
    let best = null, bestV = base + 0.25;
    for (const e of evals) {
      const v = e.v + (Math.random() * 2 - 1) * L.noise + Math.random() * 0.3;
      if (v > bestV) { bestV = v; best = e.a; }
    }
    return best ? pack(best) : { type: 'end' };
  }

  const pack = (a) => ({ type: a.type, uid: a.uid, target: a.target, pos: null });

  function mulligan(s, me) {
    const P = s.players[me];
    return P.hand.filter((c) => c.cost >= 5).map((c) => c.uid);
  }

  return { choose, mulligan, pickBest, score, setLevel, levels: () => Object.keys(LEVELS), get level() { return level; } };
})();
