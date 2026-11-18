'use strict';
/* =====================================================================
   ТРОН — правила игры (без интерфейса).
   Состояние — простой объект, его можно клонировать для ИИ.
   ctx = { log(msg), fx(type, data), choose(pIdx, cards, title) → Promise<card> }
   ===================================================================== */

const MAX_BOARD = 7;
const MAX_HAND = 10;
const HERO_HP = 30;
const DECK_SIZE = 30;

let UID_SEQ = 1;
const rnd = (n) => Math.floor(Math.random() * n);
const pickRandom = (arr) => arr[rnd(arr.length)];
const fx = (ctx, type, d) => { if (ctx && ctx.fx) ctx.fx(type, d || {}); };
const q = (c) => `«${c.name}»`;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let DEFS = null;
function defOf(id) {
  if (!DEFS) { DEFS = {}; allCardDefs().forEach((d) => { DEFS[d.id] = d; }); }
  return DEFS[id];
}

const hasKw = (m, k) => !!(m && m.kw && m.kw.indexOf(k) !== -1);
const heroId = (i) => 'h' + i;

function inst(def, owner) {
  const c = JSON.parse(JSON.stringify(def));
  delete c.count;
  c.uid = UID_SEQ++;
  c.owner = owner;
  c.kw = c.kw || [];
  return c;
}

function tokenDef(key) {
  const t = TOKENS[key];
  return M('tok_' + key, t.name, 0, t.atk, t.hp, Object.assign(
    { kw: t.kw ? t.kw.slice() : [], icon: t.icon, cantAttack: !!t.cantAttack, token: true, cls: 'shared' },
    t.img ? IMG(t.img) : {}));
}

/* ---------------------- колода ---------------------- */
function buildDeck(owner, extra) {
  const pool = [];
  [...SHARED_CARDS, ...(extra ? EXTRA_CARDS : [])].forEach((d) => {
    const n = d.rarity === 'legendary' ? 1 : (d.count || 1);
    for (let i = 0; i < n; i++) pool.push({ d, k: Math.random() + (d.optionalArt ? 0 : 0.35) });
  });
  pool.sort((a, b) => b.k - a.k);
  const bucket = (c) => Math.min(7, Math.max(1, c));
  const want = { 1: 4, 2: 6, 3: 6, 4: 5, 5: 3, 6: 3, 7: 3 };
  const have = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const deck = [], rest = [];
  for (const { d } of pool) {
    if (deck.length >= DECK_SIZE) break;
    const b = bucket(d.cost);
    if (have[b] < want[b]) { deck.push(d); have[b]++; } else rest.push(d);
  }
  while (deck.length < DECK_SIZE && rest.length) deck.push(rest.shift());
  return shuffle(deck.map((d) => inst(d, owner)));
}

/** o = {field, soul, artifact} */
function newPlayer(idx, o, isAI, extra) {
  const hp = o.soul === 'kind' ? 35 : HERO_HP;
  return {
    idx, field: o.field, soul: o.soul || 'brave', artifact: o.artifact || null, isAI,
    name: isAI ? 'Противник' : 'Вы',
    hp, maxHp: hp, armor: (o.artifact === 'mug' ? 5 : 0) + (o.soul === 'stubborn' ? 3 : 0),
    mana: 0, maxMana: 0, powerUsed: false,
    gold: o.artifact === 'piggy' ? 3 : 0, shopUsed: false, keyUsed: false, savedOnce: false,
    deck: buildDeck(idx, extra), hand: [], board: [], dead: [], fatigue: 0,
  };
}

function createGame(o0, o1, extra, first) {
  const s = {
    players: [newPlayer(0, o0, false, extra), newPlayer(1, o1, true, extra)],
    turn: 0, current: first, first, phase: 'mulligan', winner: null,
  };
  const quiet = { log() {} };
  s.players.forEach((p) => draw(s, p.idx, (p.idx === first ? 3 : 4) + (p.soul === 'patient' ? 1 : 0), quiet));
  return s;
}

const shopCost = (P) => Math.max(0, SHOP_COST - (P.soul === 'greedy' ? 1 : 0));

function canShop(s, pIdx) {
  const P = s.players[pIdx];
  return s.phase === 'play' && s.current === pIdx && !P.shopUsed && P.gold >= shopCost(P) && P.deck.length > 0 && P.hand.length < MAX_HAND;
}

function mulligan(s, pIdx, uids) {
  const P = s.players[pIdx];
  const back = [];
  uids.forEach((uid) => {
    const i = P.hand.findIndex((c) => c.uid === uid);
    if (i < 0 || !P.deck.length) return;
    back.push(P.hand[i]);
    P.hand[i] = P.deck.shift();
  });
  back.forEach((c) => P.deck.splice(rnd(P.deck.length + 1), 0, c));
}

/** После замены карт: «Медяк» второму игроку и первый ход */
async function beginGame(s, ctx) {
  const second = s.players[1 - s.first];
  second.hand.push(inst(COIN, second.idx));
  s.players.forEach((p) => { if (p.artifact === 'sock' && p.hand.length < MAX_HAND) p.hand.push(inst(COIN, p.idx)); });
  s.phase = 'play';
  s.current = s.first;
  await startTurn(s, ctx);
}

/* ---------------------- базовые вещи ---------------------- */
function draw(s, pIdx, n, ctx) {
  const P = s.players[pIdx];
  for (let i = 0; i < n; i++) {
    if (!P.deck.length) {
      P.fatigue++;
      ctx.log(`${P.name}: колода пуста — усталость ${P.fatigue}`);
      fx(ctx, 'fatigue', { pIdx, n: P.fatigue });
      damage(s, heroId(pIdx), P.fatigue, ctx, null);
      continue;
    }
    const c = P.deck.shift();
    if (P.hand.length >= MAX_HAND) {
      ctx.log(`${P.name}: рука полна — ${q(c)} сгорает`);
      fx(ctx, 'burnCard', { pIdx, card: c });
      continue;
    }
    P.hand.push(c);
    fx(ctx, 'draw', { pIdx, uid: c.uid });
  }
}

function soulBonus(s, m) {
  const P = s.players[m.owner];
  return P && P.soul === 'brave' && (hasKw(m, 'charge') || hasKw(m, 'rush')) ? 1 : 0;
}

function auraOf(s, m) {
  const P = s.players[m.owner];
  if (!P || P.board.indexOf(m) < 0) return 0;
  return P.board.reduce((a, o) => a + (o !== m && o.aura ? o.aura.atk : 0), 0);
}

function getAtk(s, m) {
  return Math.max(0, m.atk + (m.tempAtk || 0) + auraOf(s, m) + soulBonus(s, m));
}

function costOf(s, pIdx, c) {
  if (c.type !== 'spell') return c.cost;
  const disc = s.players[pIdx].board.reduce((a, m) => a + (m.spellDiscount || 0), 0);
  return Math.max(0, c.cost - disc);
}

function findChar(s, id) {
  if (typeof id === 'string' && id[0] === 'h') return { kind: 'hero', p: s.players[+id[1]] };
  for (const P of s.players) {
    const m = P.board.find((x) => x.uid === id);
    if (m) return { kind: 'minion', m, side: P.idx };
  }
  return null;
}

function isTargetable(s, byIdx, m, card) {
  if (m.owner !== byIdx && hasKw(m, 'stealth')) return !!(card && card.antiTobi && m.id === 'tobi_ninja');
  return true;
}

function targetsForSpec(s, pIdx, f, card, src) {
  const enemy = 1 - pIdx;
  const mins = (side) => s.players[side].board.filter((m) => m !== src && isTargetable(s, pIdx, m, card));
  let ids = [];
  switch (f.t) {
    case 'any': ids = [heroId(pIdx), heroId(enemy), ...mins(pIdx), ...mins(enemy)]; break;
    case 'minion': ids = [...mins(pIdx), ...mins(enemy)]; break;
    case 'enemyMinion': ids = mins(enemy); break;
    case 'friendlyMinion': ids = mins(pIdx); break;
    case 'friendly': ids = [heroId(pIdx), ...mins(pIdx)]; break;
    case 'enemy': ids = [heroId(enemy), ...mins(enemy)]; break;
    default: return [];
  }
  return ids.filter((x) => {
    if (typeof x === 'string') return true;
    if (f.maxAtk != null && getAtk(s, x) > f.maxAtk) return false;
    if (f.minAtk != null && getAtk(s, x) < f.minAtk) return false;
    if (f.e === 'steal' && (x.noSteal || x.resist)) return false;
    if (x.resist && ['stun', 'silence', 'debuff', 'setAtk', 'debt', 'pregnant'].includes(f.e)) return false;
    return true;
  }).map((x) => (typeof x === 'string' ? x : x.uid));
}

const targetFxOf = (c) => ((c.type === 'spell' ? c.fx : c.bc) || []).find((f) => f.t);

function cardTargets(s, pIdx, c) {
  const f = targetFxOf(c);
  return f ? targetsForSpec(s, pIdx, f, c, null) : null;
}

function canPlay(s, pIdx, c) {
  const P = s.players[pIdx];
  if (s.phase !== 'play' || s.current !== pIdx) return false;
  if (costOf(s, pIdx, c) > P.mana) return false;
  if (c.type === 'minion') return P.board.length < MAX_BOARD;
  const t = cardTargets(s, pIdx, c);
  return !t || t.length > 0;
}

function powerOf(s, pIdx) { return SOULS[s.players[pIdx].soul].power; }

function powerTargets(s, pIdx) {
  const f = powerOf(s, pIdx).fx.find((x) => x.t);
  return f ? targetsForSpec(s, pIdx, f, null, null) : null;
}

function canPower(s, pIdx) {
  const P = s.players[pIdx];
  if (s.phase !== 'play' || s.current !== pIdx || P.powerUsed) return false;
  if (P.mana < powerOf(s, pIdx).cost) return false;
  const t = powerTargets(s, pIdx);
  return !t || t.length > 0;
}

function canAttack(s, m) {
  return s.phase === 'play' && m.owner === s.current && !m.sleeping && !m.frozen &&
    m.attacks > 0 && !m.cantAttack && getAtk(s, m) > 0 && attackTargets(s, m).length > 0;
}

function attackTargets(s, m) {
  const enemy = 1 - m.owner;
  const visible = s.players[enemy].board.filter((x) => !hasKw(x, 'stealth'));
  const taunts = visible.filter((x) => hasKw(x, 'taunt'));
  // Спешка: в ход появления — только существа
  const noHero = m.justPlayed && hasKw(m, 'rush') && !hasKw(m, 'charge');
  if (taunts.length && !hasKw(m, 'flying')) return taunts.map((x) => x.uid);
  return [...(noHero ? [] : [heroId(enemy)]), ...visible.map((x) => x.uid)];
}

/* ---------------------- урон и лечение ---------------------- */
function damage(s, id, n, ctx, src, isAttack) {
  if (n <= 0) return 0;
  const ch = findChar(s, id);
  if (!ch) return 0;
  if (ch.kind === 'hero') {
    const p = ch.p;
    const a = Math.min(p.armor, n);
    p.armor -= a;
    p.hp -= n - a;
    fx(ctx, 'dmg', { id, n });
  } else {
    const m = ch.m;
    if (isAttack && hasKw(m, 'dodge')) {
      m.kw = m.kw.filter((k) => k !== 'dodge');
      fx(ctx, 'dodge', { id });
      ctx.log(`${q(m)} уворачивается!`);
      return 0;
    }
    if (hasKw(m, 'shield')) {
      m.kw = m.kw.filter((k) => k !== 'shield');
      fx(ctx, 'shieldpop', { id });
      return 0;
    }
    if (hasKw(m, 'tough')) n -= 1;
    if (n <= 0) { fx(ctx, 'dmg', { id, n: 0 }); return 0; }
    m.hp -= n;
    fx(ctx, 'dmg', { id, n });
    if (src && src.type === 'minion' && hasKw(src, 'poison')) m.dead = true;
    if (m.enrage && m.hp > 0) m.atk += m.enrage.atk;
  }
  if (src && src.type === 'minion' && hasKw(src, 'lifesteal')) heal(s, heroId(src.owner), n, ctx);
  return n;
}

function heal(s, id, n, ctx) {
  const ch = findChar(s, id);
  if (!ch) return 0;
  const o = ch.kind === 'hero' ? ch.p : ch.m;
  const before = o.hp;
  o.hp = Math.min(o.maxHp, o.hp + n);
  if (o.hp > before) fx(ctx, 'heal', { id, n: o.hp - before });
  return o.hp - before;
}

/* ---------------------- существа ---------------------- */
function placeMinion(s, side, m, pos, ctx) {
  const P = s.players[side];
  if (P.board.length >= MAX_BOARD) return null;
  m.owner = side;
  m.maxHp = m.maxHp || m.hp;
  m.sleeping = !hasKw(m, 'charge') && !hasKw(m, 'rush');
  m.justPlayed = true;
  m.attacks = hasKw(m, 'windfury') ? 2 : 1;
  m.frozen = false;
  m.tempAtk = 0;
  const at = pos == null || pos > P.board.length ? P.board.length : Math.max(0, pos);
  P.board.splice(at, 0, m);
  fx(ctx, 'summon', { side, uid: m.uid });
  return m;
}

function summonDef(s, side, def, ctx, pos) {
  return placeMinion(s, side, inst(def, side), pos, ctx);
}

function removeMinion(s, m) {
  for (const P of s.players) {
    const i = P.board.indexOf(m);
    if (i >= 0) { P.board.splice(i, 1); return i; }
  }
  return -1;
}

function freeze(m, ctx) { if (m.resist) return; m.frozen = true; fx(ctx, 'stun', { id: m.uid }); }

function silence(s, m, ctx) {
  if (m.resist) return;
  m.kw = [];
  ['bc', 'dr', 'end', 'kill', 'aura', 'enrage', 'spellDiscount', 'debt', 'preg'].forEach((k) => { delete m[k]; });
  m.cantAttack = false;
  m.tempAtk = 0;
  m.silenced = true;
  if (m.spouse) {
    const f = findChar(s, m.spouse);
    if (f && f.m) delete f.m.spouse;
    delete m.spouse;
  }
  fx(ctx, 'silence', { id: m.uid });
}

function takeControl(s, m, newOwner, ctx) {
  if (m.noSteal || m.resist) return;
  removeMinion(s, m);
  if (s.players[newOwner].board.length >= MAX_BOARD) { m.dead = true; s.players[m.owner].board.push(m); return; }
  m.owner = newOwner;
  s.players[newOwner].board.push(m);
  m.sleeping = true;
  m.attacks = hasKw(m, 'windfury') ? 2 : 1;
  ctx.log(`${q(m)} переходит на сторону: ${s.players[newOwner].name}`);
  fx(ctx, 'steal', { id: m.uid });
}

function returnToHand(s, m, ctx) {
  removeMinion(s, m);
  fx(ctx, 'bounce', { id: m.uid });
  if (m.token) return;
  const P = s.players[m.owner];
  if (P.hand.length >= MAX_HAND) return;
  P.hand.push(inst(defOf(m.id), P.idx));
  ctx.log(`${q(m)} возвращается в руку`);
}

function marry(s, a, b, ctx) {
  a.spouse = b.uid; b.spouse = a.uid;
  a.atk = Math.max(0, a.atk - 2); b.atk = Math.max(0, b.atk - 2);
  ctx.log(`Свадьба: ${q(a)} + ${q(b)}`);
  fx(ctx, 'marry', { a: a.uid, b: b.uid });
}

function makePregnant(s, m, by, ctx) {
  if (m.preg || m.resist) return false;
  m.preg = { by, turns: 2 };
  m.atk = Math.max(0, m.atk - 2);
  ctx.log(`${q(m)} «беременеет»`);
  fx(ctx, 'preg', { id: m.uid });
  return true;
}

/** Убирает погибших, запускает предсмертные хрипы, проверяет победу */
async function resolveDeaths(s, ctx) {
  for (let guard = 0; guard < 20; guard++) {
    const dying = [];
    for (const P of s.players) for (const m of P.board) if (m.hp <= 0 || m.dead) dying.push(m);
    if (!dying.length) break;
    const after = [];
    for (const m of dying) {
      const side = m.owner;
      const pos = removeMinion(s, m);
      fx(ctx, 'kill', { uid: m.uid, side });
      ctx.log(`${q(m)} погибает`);
      const K = s.players[1 - side];
      const g = K.soul === 'greedy' ? 2 : 1;
      K.gold += g;
      fx(ctx, 'gold', { pIdx: K.idx, n: g });
      if (!m.token) s.players[side].dead.push(m.id);
      if (m.spouse) after.push({ spouse: m.spouse });
      if (m.dr) after.push({ side, dr: m.dr, pos, src: m });
    }
    for (const a of after) {
      if (a.spouse) {
        const f = findChar(s, a.spouse);
        if (f && f.m) { delete f.m.spouse; ctx.log(`Развод! ${q(f.m)} получает 2 урона`); damage(s, f.m.uid, 2, ctx, null); }
      } else await runFx(s, a.side, a.dr, null, ctx, a.src, a.pos);
    }
  }
  checkWin(s, ctx);
}

function checkWin(s, ctx) {
  if (s.phase === 'over') return;
  s.players.forEach((p) => {
    if (p.hp <= 0 && p.soul === 'stubborn' && !p.savedOnce) {
      p.savedOnce = true;
      p.hp = 1;
      if (ctx) { ctx.log(`${p.name}: Упрямство не даёт упасть — 1 здоровья!`); fx(ctx, 'saved', { id: heroId(p.idx) }); }
    }
  });
  const [a, b] = s.players;
  if (a.hp <= 0 || b.hp <= 0) {
    s.phase = 'over';
    s.winner = a.hp <= 0 && b.hp <= 0 ? null : a.hp <= 0 ? 1 : 0;
  }
}

/* ---------------------- эффекты ---------------------- */
async function runFx(s, pIdx, list, target, ctx, src, pos) {
  for (const f of list || []) {
    if (s.phase === 'over') return;
    await applyFx(s, pIdx, f, target, ctx, src, pos);
  }
}

async function applyFx(s, pIdx, f, target, ctx, src, pos) {
  const enemy = 1 - pIdx;
  const P = s.players[pIdx], E = s.players[enemy];
  const T = target != null && f.t ? findChar(s, target) : null;
  const tm = T && T.kind === 'minion' ? T.m : null;
  const others = (side) => s.players[side].board.filter((m) => m !== src && m.hp > 0 && !m.dead);
  const randEnemyMinion = () => (E.board.length ? pickRandom(E.board.filter((m) => m.hp > 0)) : null);
  switch (f.e) {
    case 'dmg':
      if (!T) break;
      if (tm && src && src.antiTobi && tm.id === 'tobi_ninja') { tm.dead = true; ctx.log('«Тоби? Ну тут тебе пизда.»'); break; }
      damage(s, target, f.n, ctx, src);
      if (f.stun && tm && tm.hp > 0) freeze(tm, ctx);
      break;
    case 'heal':
      if (!T) break;
      heal(s, target, f.n, ctx);
      if (f.cleanse && tm) { tm.frozen = false; delete tm.debt; }
      break;
    case 'buff':
      if (!tm) break;
      if (f.temp) tm.tempAtk = (tm.tempAtk || 0) + f.a; else tm.atk += f.a;
      tm.hp += f.h; tm.maxHp += f.h;
      if (f.kw && !hasKw(tm, f.kw)) tm.kw.push(f.kw);
      fx(ctx, 'buff', { id: tm.uid });
      break;
    case 'debuff':
      if (!tm || tm.resist) break;
      tm.atk = Math.max(0, tm.atk - f.a);
      if (f.h) { tm.hp -= f.h; tm.maxHp = Math.max(1, tm.maxHp - f.h); }
      fx(ctx, 'debuff', { id: tm.uid });
      break;
    case 'setAtk': if (tm && !tm.resist) { tm.atk = f.n; tm.tempAtk = 0; fx(ctx, 'debuff', { id: tm.uid }); } break;
    case 'stun': if (tm) freeze(tm, ctx); break;
    case 'destroy': if (tm) tm.dead = true; break;
    case 'steal': if (tm) takeControl(s, tm, pIdx, ctx); break;
    case 'bounce': if (tm) returnToHand(s, tm, ctx); break;
    case 'bounceRandomEnemy':
      shuffle(E.board.slice()).slice(0, f.n).forEach((m) => returnToHand(s, m, ctx));
      break;
    case 'silence': if (tm) silence(s, tm, ctx); break;
    case 'silenceElite': E.board.filter((m) => getAtk(s, m) >= f.minAtk).forEach((m) => silence(s, m, ctx)); break;
    case 'aoe': {
      const ids = [];
      if (f.who === 'enemyAll') ids.push(heroId(enemy));
      const sides = f.who === 'allMinions' ? [pIdx, enemy] : [enemy];
      sides.forEach((sd) => others(sd).forEach((m) => ids.push(m.uid)));
      fx(ctx, 'aoe', { pIdx, who: f.who });
      ids.forEach((id) => damage(s, id, f.n, ctx, src));
      break;
    }
    case 'stunAllEnemy': E.board.forEach((m) => freeze(m, ctx)); break;
    case 'stunRandomEnemy': shuffle(E.board.slice()).slice(0, f.n).forEach((m) => freeze(m, ctx)); break;
    case 'debuffAll': E.board.filter((m) => !m.resist).forEach((m) => { m.atk = Math.max(0, m.atk - f.a); fx(ctx, 'debuff', { id: m.uid }); }); break;
    case 'buffAll':
      (f.others ? others(pIdx) : P.board).forEach((m) => {
        if (f.temp) m.tempAtk = (m.tempAtk || 0) + f.a; else m.atk += f.a;
        m.hp += f.h; m.maxHp += f.h;
        fx(ctx, 'buff', { id: m.uid });
      });
      break;
    case 'buffRandomFriendly': {
      const o = others(pIdx);
      if (o.length) { const m = pickRandom(o); m.atk += f.a; m.hp += f.h; m.maxHp += f.h; fx(ctx, 'buff', { id: m.uid }); }
      break;
    }
    case 'healHero': heal(s, heroId(pIdx), f.n, ctx); break;
    case 'healAll':
      heal(s, heroId(pIdx), f.n, ctx);
      P.board.forEach((m) => heal(s, m.uid, f.n, ctx));
      break;
    case 'draw': draw(s, pIdx, f.n, ctx); break;
    case 'drawBoth': draw(s, pIdx, 1, ctx); draw(s, enemy, 1, ctx); break;
    case 'discardEnemy':
      if (E.hand.length) { const c = E.hand.splice(rnd(E.hand.length), 1)[0]; ctx.log(`${E.name} сбрасывает ${q(c)}`); fx(ctx, 'discard', { pIdx: enemy }); }
      break;
    case 'stealCard':
      if (E.hand.length && P.hand.length < MAX_HAND) {
        const c = E.hand.splice(rnd(E.hand.length), 1)[0];
        c.owner = pIdx;
        P.hand.push(c);
        ctx.log(`${P.name} забирает карту из руки противника`);
        fx(ctx, 'draw', { pIdx, uid: c.uid });
      }
      break;
    case 'discover': {
      if (!P.deck.length || P.hand.length >= MAX_HAND) break;
      const offer = shuffle(P.deck.slice()).slice(0, 3);
      const c = (await ctx.choose(pIdx, offer, 'Выберите карту — она отправится в руку')) || offer[0];
      P.deck.splice(P.deck.indexOf(c), 1);
      P.hand.push(c);
      fx(ctx, 'draw', { pIdx, uid: c.uid });
      break;
    }
    case 'randomCard':
      if (P.hand.length < MAX_HAND) {
        const c = inst(pickRandom(SHARED_CARDS), pIdx);
        P.hand.push(c);
        fx(ctx, 'draw', { pIdx, uid: c.uid });
      }
      break;
    case 'summon':
      for (let i = 0; i < f.n; i++) summonDef(s, pIdx, tokenDef(f.token), ctx, pos == null ? null : pos + i);
      break;
    case 'summonFromDeck': {
      const pool = shuffle(P.deck.filter((c) => c.type === 'minion' && c.cost <= f.maxCost)).slice(0, f.n);
      for (const c of pool) {
        if (P.board.length >= MAX_BOARD) break;
        P.deck.splice(P.deck.indexOf(c), 1);
        placeMinion(s, pIdx, c, null, ctx);
        ctx.log(`Из колоды выходит ${q(c)}`);
      }
      break;
    }
    case 'muster': {
      const pool = P.deck.filter((c) => c.group === f.group);
      for (const c of pool) {
        if (P.board.length >= MAX_BOARD) break;
        P.deck.splice(P.deck.indexOf(c), 1);
        delete c.bc;
        placeMinion(s, pIdx, c, null, ctx);
      }
      if (pool.length) ctx.log(`Подтягиваются: ${pool.map(q).join(', ')}`);
      break;
    }
    case 'fetch': {
      const i = P.deck.findIndex((c) => c.id === f.id);
      if (i >= 0 && Math.random() < f.chance && P.hand.length < MAX_HAND) {
        const c = P.deck.splice(i, 1)[0];
        P.hand.push(c);
        ctx.log(`«А вот был случай…» — ${q(c)} в руку`);
        fx(ctx, 'draw', { pIdx, uid: c.uid });
      }
      break;
    }
    case 'armor': P.armor += f.n; fx(ctx, 'armor', { id: heroId(pIdx), n: f.n }); break;
    case 'mana': P.mana = Math.min(10, P.mana + f.n); fx(ctx, 'mana', { pIdx }); break;
    case 'resurrect':
      if (P.dead.length && P.board.length < MAX_BOARD) {
        const id = pickRandom(P.dead);
        P.dead.splice(P.dead.indexOf(id), 1);
        const m = summonDef(s, pIdx, defOf(id), ctx);
        if (m) ctx.log(`${q(m)} воскресает`);
      }
      break;
    case 'destroyRandomEnemy': shuffle(E.board.slice()).slice(0, f.n).forEach((m) => { m.dead = true; }); fx(ctx, 'doom', {}); break;
    case 'destroyAll': s.players.forEach((p) => p.board.forEach((m) => { m.dead = true; })); fx(ctx, 'doom', {}); break;
    case 'dmgRandomEnemy': {
      const pool = [heroId(enemy), ...E.board.filter((m) => m.hp > 0 && !m.dead).map((m) => m.uid)];
      damage(s, pickRandom(pool), f.n, ctx, src);
      break;
    }
    case 'dmgStrongestEnemy': {
      const alive = E.board.filter((m) => m.hp > 0);
      if (!alive.length) break;
      const max = Math.max(...alive.map((m) => getAtk(s, m)));
      const m = pickRandom(alive.filter((x) => getAtk(s, x) === max));
      damage(s, m.uid, f.n, ctx, src);
      if (m.hp > 0 && f.debt) { m.debt = (m.debt || 0) + f.debt; fx(ctx, 'debuff', { id: m.uid }); }
      break;
    }
    case 'reveal': E.board.forEach((m) => { m.kw = m.kw.filter((k) => k !== 'stealth' && k !== 'shield' && k !== 'taunt'); }); break;
    case 'faceDmgHand': damage(s, heroId(enemy), E.hand.length, ctx, src); break;
    case 'selfBuffIf':
      if (src && P.board.some((m) => m !== src && m.id === f.id)) { src.atk += f.a; src.hp += f.h; src.maxHp += f.h; fx(ctx, 'buff', { id: src.uid }); }
      break;
    case 'chance': if (Math.random() < f.p) await runFx(s, pIdx, f.fx, null, ctx, src); break;
    case 'selfBuff': if (src && src.type === 'minion') { src.atk += f.a; src.hp += f.h; src.maxHp += f.h; fx(ctx, 'buff', { id: src.uid }); } break;
    case 'healSelf': if (src && src.type === 'minion') heal(s, src.uid, f.n, ctx); break;
    case 'gold': P.gold += f.n; fx(ctx, 'gold', { pIdx, n: f.n }); break;
    case 'destroyFemale': {
      const victims = s.players.flatMap((p) => p.board.filter((m) => m.female && m !== src));
      victims.forEach((m) => { m.dead = true; });
      if (victims.length) { ctx.log(`«Бывшие не возвращаются» — стёрто: ${victims.map(q).join(', ')}`); fx(ctx, 'doom', {}); }
      break;
    }
    case 'purify':
      P.board.forEach((m) => {
        m.frozen = false;
        delete m.debt;
        if (m.preg) { m.atk += 2; delete m.preg; }
        if (m.spouse) {
          const f2 = findChar(s, m.spouse);
          if (f2 && f2.m) delete f2.m.spouse;
          delete m.spouse;
        }
      });
      fx(ctx, 'heal', { id: heroId(pIdx), n: 0 });
      break;
    case 'dmgHero': damage(s, heroId(enemy), f.n, ctx, src); break;
    case 'unstun': P.board.forEach((m) => { m.frozen = false; }); break;
    case 'marryRandom': {
      const free = shuffle(E.board.filter((m) => m.hp > 0 && !m.spouse && !m.resist));
      if (free.length >= 2) marry(s, free[0], free[1], ctx);
      else damage(s, heroId(enemy), 2, ctx, null);
      break;
    }
    case 'debt': if (tm && !tm.resist) { tm.debt = (tm.debt || 0) + f.n; fx(ctx, 'debuff', { id: tm.uid }); } break;
    case 'debtRandom': { const m = randEnemyMinion(); if (m && !m.resist) { m.debt = (m.debt || 0) + f.n; fx(ctx, 'debuff', { id: m.uid }); } break; }
    case 'pregnant': if (tm) makePregnant(s, tm, pIdx, ctx); break;
    case 'pregnantRandom': {
      const free = E.board.filter((m) => m.hp > 0 && !m.preg && !m.resist);
      if (free.length) makePregnant(s, pickRandom(free), pIdx, ctx);
      else { summonDef(s, pIdx, tokenDef('baby'), ctx); ctx.log('Рождается «Ребёнок»'); }
      break;
    }
    default: break;
  }
}

/* ---------------------- ходы ---------------------- */
async function startTurn(s, ctx) {
  const P = s.players[s.current];
  s.turn++;
  P.maxMana = Math.min(10, P.maxMana + 1);
  P.mana = P.maxMana;
  P.powerUsed = false;
  P.shopUsed = false;
  for (const m of P.board) {
    m.sleeping = false;
    m.justPlayed = false;
    m.attacks = hasKw(m, 'windfury') ? 2 : 1;
    if (m.debt) { m.atk = Math.max(0, m.atk - m.debt); fx(ctx, 'debuff', { id: m.uid }); }
  }
  // роды: ребёнок появляется у того, кто сделал существо «беременным»
  for (const O of s.players) {
    for (const m of O.board) {
      if (!m.preg || m.preg.by !== P.idx) continue;
      if (--m.preg.turns <= 0) {
        delete m.preg;
        m.atk += 2;
        const b = summonDef(s, P.idx, tokenDef('baby'), ctx);
        ctx.log(`${q(m)} рожает! ${b ? '«Ребёнок» достаётся: ' + P.name : 'но места на поле нет'}`);
        fx(ctx, 'birth', { id: m.uid });
      }
    }
  }
  fx(ctx, 'turn', { pIdx: P.idx });
  draw(s, P.idx, 1, ctx);
  await resolveDeaths(s, ctx);
}

async function endTurn(s, ctx) {
  const P = s.players[s.current];
  for (const m of P.board.slice()) {
    if (s.phase === 'over') return;
    if (!m.end || m.hp <= 0 || m.dead || P.board.indexOf(m) < 0) continue;
    fx(ctx, 'trigger', { id: m.uid });
    await runFx(s, P.idx, m.end, null, ctx, m);
    await resolveDeaths(s, ctx);
  }
  if (s.phase === 'over') return;
  P.board.forEach((m) => { m.frozen = false; });
  s.players.forEach((p) => p.board.forEach((m) => { m.tempAtk = 0; }));
  s.current = 1 - s.current;
  await startTurn(s, ctx);
}

/**
 * Действия: {type:'play', uid, pos, target} | {type:'attack', uid, target}
 *           {type:'power', target} | {type:'end'}
 */
async function performAction(s, a, ctx) {
  if (s.phase !== 'play') return false;
  const pIdx = s.current;
  const P = s.players[pIdx];
  switch (a.type) {
    case 'play': {
      const c = P.hand.find((x) => x.uid === a.uid);
      if (!c || !canPlay(s, pIdx, c)) return false;
      const tf = targetFxOf(c);
      let target = a.target;
      if (tf) {
        const valid = targetsForSpec(s, pIdx, tf, c, null);
        if (target == null || valid.indexOf(target) < 0) {
          if (c.type === 'spell') return false;
          target = null;
        }
      }
      P.mana -= costOf(s, pIdx, c);
      P.hand.splice(P.hand.indexOf(c), 1);
      ctx.log(`${P.name}: ${q(c)}`);
      fx(ctx, 'play', { pIdx, uid: c.uid, id: c.id, ctype: c.type, storm: c.storm, target });
      if (c.type === 'minion') {
        const m = placeMinion(s, pIdx, c, a.pos, ctx);
        if (m && P.artifact === 'key' && !P.keyUsed) {
          P.keyUsed = true; m.atk += 2; m.hp += 2; m.maxHp += 2;
          ctx.log(`Ключ от гаража: ${q(m)} получает +2/+2`);
          fx(ctx, 'buff', { id: m.uid });
        }
        if (m && m.bc) await runFx(s, pIdx, m.bc, target, ctx, m, P.board.indexOf(m) + 1);
      } else {
        await runFx(s, pIdx, c.fx, target, ctx, c);
        if (P.artifact === 'ring') heal(s, heroId(pIdx), 1, ctx);
      }
      await resolveDeaths(s, ctx);
      return true;
    }
    case 'attack': {
      const m = P.board.find((x) => x.uid === a.uid);
      if (!m || !canAttack(s, m) || attackTargets(s, m).indexOf(a.target) < 0) return false;
      m.kw = m.kw.filter((k) => k !== 'stealth');
      m.attacks--;
      const T = findChar(s, a.target);
      const atk = getAtk(s, m);
      fx(ctx, 'attack', { uid: m.uid, target: a.target });
      if (T.kind === 'hero') {
        ctx.log(`${q(m)} бьёт героя на ${atk}`);
        damage(s, a.target, atk, ctx, m, true);
        await resolveDeaths(s, ctx);
        return true;
      }
      const tAtk = getAtk(s, T.m);
      ctx.log(`${q(m)} атакует ${q(T.m)}`);
      damage(s, T.m.uid, atk, ctx, m, true);
      damage(s, m.uid, tAtk, ctx, T.m, false);
      if (hasKw(T.m, 'thorns')) { ctx.log(`Шипы! ${q(m)} получает 2 урона`); damage(s, m.uid, 2, ctx, null); }
      const killed = T.m.hp <= 0 || T.m.dead;
      await resolveDeaths(s, ctx);
      if (killed && m.kill && P.board.indexOf(m) >= 0 && s.phase === 'play') {
        fx(ctx, 'trigger', { id: m.uid });
        ctx.log(`Добивание: ${q(m)}`);
        await runFx(s, pIdx, m.kill, null, ctx, m);
        await resolveDeaths(s, ctx);
      }
      return true;
    }
    case 'power': {
      if (!canPower(s, pIdx)) return false;
      const pw = powerOf(s, pIdx);
      const valid = powerTargets(s, pIdx);
      if (valid && valid.indexOf(a.target) < 0) return false;
      P.mana -= pw.cost;
      P.powerUsed = true;
      ctx.log(`${P.name}: сила героя «${pw.name}»`);
      fx(ctx, 'power', { pIdx, target: a.target });
      await runFx(s, pIdx, pw.fx, a.target, ctx, null);
      await resolveDeaths(s, ctx);
      return true;
    }
    case 'shop': {
      if (!canShop(s, pIdx)) return false;
      P.gold -= shopCost(P);
      P.shopUsed = true;
      ctx.log(`${P.name}: покупка в Лавке`);
      fx(ctx, 'shop', { pIdx });
      draw(s, pIdx, 1, ctx);
      return true;
    }
    case 'end':
      await endTurn(s, ctx);
      return true;
    default:
      return false;
  }
}
