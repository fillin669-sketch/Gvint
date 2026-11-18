'use strict';
/* =====================================================================
   ИГРОВОЙ ДВИЖОК — правила, без интерфейса.
   Состояние игры — простой объект (его можно клонировать для ИИ).
   ctx = { sim, log(msg), choose(pIdx, cards, title) -> Promise<card|null> }
   ===================================================================== */

let UID_SEQ = 1;

const has = (c, a) => !!(c && c.abil && c.abil.indexOf(a) !== -1);
const isHero = (c) => has(c, 'hero');
const isUnit = (c) => !!c && c.type === 'unit';
const rnd = (n) => Math.floor(Math.random() * n);
const pickRandom = (arr) => arr[rnd(arr.length)];
const q = (c) => `«${c.name}»`;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCard(def, owner) {
  const c = JSON.parse(JSON.stringify(def));
  delete c.count;
  c.uid = UID_SEQ++;
  c.owner = owner;
  c.base = c.power;
  if (has(c, 'bond') && !c.bond) c.bond = c.id;
  return c;
}

function buildDeck(fk, owner, extra) {
  const defs = [...FACTIONS[fk].cards, ...SHARED_CARDS, ...(extra ? EXTRA_CARDS : [])];
  const deck = [];
  defs.forEach((d) => { for (let i = 0; i < (d.count || 1); i++) deck.push(makeCard(d, owner)); });
  return shuffle(deck);
}

const emptyRow = () => ({ cards: [], horn: null, curse: null, shield: null, fort: null });
const SLOT_KEYS = ['horn', 'curse', 'shield', 'fort'];

function newPlayer(idx, fk, isAI, extra) {
  return {
    idx, faction: fk, isAI,
    name: isAI ? 'Противник' : 'Вы',
    leader: Object.assign({}, FACTIONS[fk].leader, { used: false }),
    deck: buildDeck(fk, idx, extra), hand: [], grave: [],
    rows: { melee: emptyRow(), ranged: emptyRow(), siege: emptyRow() },
    passed: false, lives: 2,
  };
}

function createGame(f0, f1, extra) {
  const s = {
    players: [newPlayer(0, f0, false, extra), newPlayer(1, f1, true, extra)],
    weather: { melee: false, ranged: false, siege: false },
    weatherCards: [],
    round: 1, current: 0, starter: 0,
    history: [], phase: 'mulligan', winner: null,
  };
  s.players.forEach((p) => drawCards(p, 10));
  return s;
}

function drawCards(p, n) {
  let k = 0;
  while (n-- > 0 && p.deck.length) { p.hand.push(p.deck.shift()); k++; }
  return k;
}

function mulliganLimit(p) { return p.faction === 'forest' ? 3 : 2; }

function mulliganCard(s, pIdx, uid) {
  const P = s.players[pIdx];
  const i = P.hand.findIndex((c) => c.uid === uid);
  if (i < 0 || !P.deck.length) return null;
  const old = P.hand[i];
  const nw = P.deck.shift();
  P.hand[i] = nw;
  P.deck.splice(rnd(P.deck.length + 1), 0, old);
  return nw;
}

/* ---------------------- подсчёт силы ---------------------- */

function cardPower(s, side, rowKey, card) {
  if (!isUnit(card)) return 0;
  if (isHero(card)) return card.power;
  const row = s.players[side].rows[rowKey];
  let p = card.power;
  if (s.weather[rowKey]) p = Math.min(p, 1);
  if (row.curse) p = Math.ceil(p / 2);
  if (has(card, 'bond')) p *= row.cards.filter((c) => c.bond === card.bond && isUnit(c)).length;
  p += row.cards.filter((c) => c !== card && has(c, 'morale')).length;
  if (row.fort) p += 2;
  if (row.horn || row.cards.some((c) => c !== card && has(c, 'horn'))) p *= 2;
  return p;
}

function rowScore(s, side, r) {
  return s.players[side].rows[r].cards.reduce((a, c) => a + cardPower(s, side, r, c), 0);
}

function totalScore(s, side) {
  return ROWS.reduce((a, r) => a + rowScore(s, side, r), 0);
}

/** Все отряды на стороне side: [{card, row, power}] */
function unitsOn(s, side, filter) {
  const out = [];
  for (const r of ROWS) {
    for (const c of s.players[side].rows[r].cards) {
      if (!isUnit(c)) continue;
      const item = { card: c, row: r, side, power: cardPower(s, side, r, c) };
      if (!filter || filter(item)) out.push(item);
    }
  }
  return out;
}

const vulnerable = (it) => !isHero(it.card);
const targetable = (it) => vulnerable(it) && !has(it.card, 'stealth');

function findOnBoard(s, uid) {
  for (const side of [0, 1]) {
    for (const r of ROWS) {
      const row = s.players[side].rows[r];
      const i = row.cards.findIndex((c) => c.uid === uid);
      if (i >= 0) return { side, row: r, index: i, card: row.cards[i] };
    }
  }
  return null;
}

/* ---------------------- цели ---------------------- */

function legalTargets(s, pIdx, card) {
  const enemy = 1 - pIdx;
  const P = s.players[pIdx];
  if (card.type === 'unit') {
    if (has(card, 'spy')) return [{ type: 'row', side: enemy, row: card.row === 'agile' ? 'melee' : card.row }];
    if (card.row === 'agile') return ['melee', 'ranged'].map((r) => ({ type: 'row', side: pIdx, row: r }));
    return [{ type: 'row', side: pIdx, row: card.row }];
  }
  switch (card.kind) {
    case 'horn':
      return ROWS.filter((r) => !P.rows[r].horn).map((r) => ({ type: 'row', side: pIdx, row: r }));
    case 'decoy':
      return unitsOn(s, pIdx, vulnerable).map((it) => ({ type: 'unit', side: pIdx, row: it.row, uid: it.card.uid }));
    case 'damage':
    case 'charm':
      return unitsOn(s, enemy, card.antiTobi ? vulnerable : targetable).map((it) => ({ type: 'unit', side: enemy, row: it.row, uid: it.card.uid }));
    case 'healOne':
      return unitsOn(s, pIdx, vulnerable).map((it) => ({ type: 'unit', side: pIdx, row: it.row, uid: it.card.uid }));
    case 'shield':
      return ROWS.filter((r) => !P.rows[r].shield).map((r) => ({ type: 'row', side: pIdx, row: r }));
    case 'fort':
      return ROWS.filter((r) => !P.rows[r].fort).map((r) => ({ type: 'row', side: pIdx, row: r }));
    case 'story':
      return ROWS.map((r) => ({ type: 'row', side: enemy, row: r }));
    case 'curse':
      return ROWS.filter((r) => !s.players[enemy].rows[r].curse).map((r) => ({ type: 'row', side: enemy, row: r }));
    case 'rowdmg':
      return ROWS.map((r) => ({ type: 'row', side: enemy, row: r }));
    default:
      return [{ type: 'global' }];
  }
}

function leaderAvailable(s, pIdx) {
  const P = s.players[pIdx];
  if (P.leader.used) return false;
  switch (P.leader.ability) {
    case 'hornSiege': return !P.rows.siege.horn;
    case 'draw': return P.deck.length > 0;
    case 'reviveRandom': return P.grave.some((c) => isUnit(c) && !isHero(c));
    default: return true;
  }
}

/* ---------------------- перемещения карт ---------------------- */

function resetCard(c) {
  c.power = c.base;
  delete c.placed;
}

function toGrave(s, c) {
  if (!c || c.token || c.fromLeader || c.virtual) return;
  resetCard(c);
  s.players[c.owner].grave.push(c);
}

function removeFromBoard(s, card) {
  for (const p of s.players) {
    for (const r of ROWS) {
      const row = p.rows[r];
      const i = row.cards.indexOf(card);
      if (i >= 0) { row.cards.splice(i, 1); return true; }
    }
  }
  return false;
}

/** Щит ряда поглощает атаку. Возвращает true, если атака поглощена. */
function absorb(s, side, row, ctx) {
  const R = s.players[side].rows[row];
  if (!R.shield) return false;
  ctx.log(`${q(R.shield)} принимает удар на себя`);
  toGrave(s, R.shield);
  R.shield = null;
  return true;
}

/** Отбрасывает цели в рядах, где стоит щит (один щит гасит всю атаку по своему ряду). */
function unshielded(s, items, ctx) {
  const checked = new Map();
  return items.filter((it) => {
    const key = it.side + ':' + it.row;
    if (!checked.has(key)) checked.set(key, absorb(s, it.side, it.row, ctx));
    return !checked.get(key);
  });
}

function destroy(s, items, ctx, why) {
  items = unshielded(s, items, ctx);
  if (!items.length) return;
  for (const it of items) { removeFromBoard(s, it.card); toGrave(s, it.card); }
  ctx.log(`${why ? why + ': ' : ''}уничтожено — ${items.map((it) => q(it.card)).join(', ')}`);
}

function hitUnits(s, items, dmg, ctx) {
  unshielded(s, items, ctx).forEach((it) => damageUnit(s, it, dmg, ctx));
}

function buffUnit(c, n) {
  if (isUnit(c) && !isHero(c)) c.power = Math.max(c.power, c.base) + n;
}

function strongest(items) {
  const max = Math.max(0, ...items.map((it) => it.power));
  if (max <= 0) return [];
  return items.filter((it) => it.power === max);
}

function damageUnit(s, item, dmg, ctx) {
  const c = item.card;
  if (isHero(c)) return;
  c.power -= dmg;
  if (c.power <= 0) {
    removeFromBoard(s, c);
    toGrave(s, c);
    ctx.log(`${q(c)} погибает`);
  }
}

function bestAgileRow(s, pIdx, card) {
  let best = 'melee', bestVal = -Infinity;
  for (const r of ['melee', 'ranged']) {
    const row = s.players[pIdx].rows[r];
    const before = totalScore(s, pIdx);
    row.cards.push(card);
    const v = totalScore(s, pIdx) - before;
    row.cards.pop();
    if (v > bestVal) { bestVal = v; best = r; }
  }
  return best;
}

function clearWeather(s) {
  s.weatherCards.forEach((c) => toGrave(s, c));
  s.weatherCards = [];
  ROWS.forEach((r) => { s.weather[r] = false; });
}

/* ---------------------- розыгрыш ---------------------- */

const who = (s, i) => s.players[i].name;

async function performAction(s, pIdx, a, ctx) {
  const P = s.players[pIdx];
  if (a.type === 'pass') {
    P.passed = true;
    ctx.log(`${who(s, pIdx)}: пас`);
    return;
  }
  if (a.type === 'leader') { await useLeader(s, pIdx, ctx); return; }
  const i = P.hand.findIndex((c) => c.uid === a.uid);
  if (i < 0) return;
  const card = P.hand.splice(i, 1)[0];
  await resolveCard(s, pIdx, card, a.target, ctx);
  if (card.free) s.extraTurn = true;
}

async function resolveCard(s, pIdx, card, target, ctx) {
  const P = s.players[pIdx];
  const enemy = 1 - pIdx;
  const E = s.players[enemy];
  if (card.type === 'unit') {
    let row = card.row;
    if (row === 'agile') row = target && target.row ? target.row : bestAgileRow(s, pIdx, card);
    await placeUnit(s, pIdx, card, row, ctx);
    return;
  }
  ctx.log(`${who(s, pIdx)}: ${q(card)}`);
  switch (card.kind) {
    case 'weather':
      if (s.weather[card.wrow]) toGrave(s, card);
      else { s.weather[card.wrow] = true; s.weatherCards.push(card); }
      break;
    case 'clear':
      clearWeather(s);
      ROWS.forEach((r) => { if (P.rows[r].curse) { toGrave(s, P.rows[r].curse); P.rows[r].curse = null; } });
      if (card.buff) unitsOn(s, pIdx).forEach((it) => buffUnit(it.card, card.buff));
      toGrave(s, card);
      break;
    case 'horn':
      P.rows[target.row].horn = card;
      break;
    case 'decoy': {
      const row = P.rows[target.row];
      const idx = row.cards.findIndex((c) => c.uid === target.uid);
      if (idx < 0) { toGrave(s, card); break; }
      const t = row.cards[idx];
      card.type = 'decoy';
      row.cards[idx] = card;
      resetCard(t);
      t.owner = pIdx;
      P.hand.push(t);
      ctx.log(`${q(t)} возвращается в руку`);
      break;
    }
    case 'scorch': {
      const all = [...unitsOn(s, 0, vulnerable), ...unitsOn(s, 1, vulnerable)];
      destroy(s, strongest(all), ctx, 'Пожар');
      for (const p of s.players) {
        for (const r of ROWS) {
          if (p.rows[r].fort) { ctx.log(`${q(p.rows[r].fort)} сгорает`); toGrave(s, p.rows[r].fort); p.rows[r].fort = null; }
        }
      }
      toGrave(s, card);
      break;
    }
    case 'kill2': {
      const items = unitsOn(s, enemy, vulnerable).sort((a, b) => b.power - a.power).slice(0, 2);
      destroy(s, items, ctx, 'Гибель');
      toGrave(s, card);
      break;
    }
    case 'damage': {
      const f = findOnBoard(s, target.uid);
      if (f && card.antiTobi && has(f.card, 'stealth')) {
        destroy(s, [f], ctx, '«Тоби? Ну тут тебе пизда.»');
      } else if (f) {
        ctx.log(`${q(f.card)} получает ${card.value} урона`);
        hitUnits(s, [f], card.value, ctx);
      }
      toGrave(s, card);
      break;
    }
    case 'aoe':
      hitUnits(s, unitsOn(s, enemy, vulnerable), card.value, ctx);
      toGrave(s, card);
      break;
    case 'rowdmg':
      hitUnits(s, unitsOn(s, enemy, (it) => vulnerable(it) && it.row === target.row), card.value, ctx);
      toGrave(s, card);
      break;
    case 'story':
      hitUnits(s, unitsOn(s, enemy, (it) => vulnerable(it) && it.row === target.row), 2, ctx);
      unitsOn(s, pIdx).forEach((it) => buffUnit(it.card, 1));
      toGrave(s, card);
      break;
    case 'reflect':
      ROWS.forEach((r) => {
        const mine = P.rows[r], theirs = E.rows[r];
        if (!mine.curse) return;
        if (theirs.curse) { toGrave(s, mine.curse); mine.curse = null; return; }
        theirs.curse = mine.curse; theirs.curse.owner = pIdx; mine.curse = null;
        if (theirs.horn) { toGrave(s, theirs.horn); theirs.horn = null; }
        if (theirs.fort) { toGrave(s, theirs.fort); theirs.fort = null; }
        ctx.log(`Проклятие перелетает на ряд противника: ${ROW_NAMES[r]}`);
      });
      hitUnits(s, unitsOn(s, enemy, vulnerable), 1, ctx);
      toGrave(s, card);
      break;
    case 'shield':
      P.rows[target.row].shield = card;
      break;
    case 'fort':
      P.rows[target.row].fort = card;
      break;
    case 'heal':
      unitsOn(s, pIdx).forEach((it) => buffUnit(it.card, 1));
      toGrave(s, card);
      break;
    case 'healOne': {
      const f = findOnBoard(s, target.uid);
      if (f) {
        buffUnit(f.card, card.value);
        const row = P.rows[f.row];
        if (card.cleanse && row.curse) { toGrave(s, row.curse); row.curse = null; ctx.log('Проклятие снято'); }
      }
      toGrave(s, card);
      break;
    }
    case 'tax': {
      if (E.hand.length) {
        const c = E.hand.splice(rnd(E.hand.length), 1)[0];
        c.owner = pIdx;
        P.hand.push(c);
        ctx.log(`${who(s, pIdx)} забирает из руки противника ${pIdx === 0 ? q(c) : 'карту ' + q(c)}`);
      }
      toGrave(s, card);
      break;
    }
    case 'revive': {
      toGrave(s, card);
      const options = P.grave.filter((c) => isUnit(c) && !isHero(c) && c !== card);
      if (!options.length) break;
      const chosen = (await ctx.choose(pIdx, options, 'Рассол: выберите отряд, который воскреснет', false)) || options[0];
      P.grave.splice(P.grave.indexOf(chosen), 1);
      const r = chosen.row === 'agile' ? bestAgileRow(s, pIdx, chosen) : chosen.row;
      await placeUnit(s, pIdx, chosen, r, ctx);
      break;
    }
    case 'charm': {
      const f = findOnBoard(s, target.uid);
      if (f && f.side === enemy && !absorb(s, f.side, f.row, ctx)) {
        E.rows[f.row].cards.splice(f.index, 1);
        f.card.owner = pIdx;
        P.rows[f.row].cards.push(f.card);
        ctx.log(`${q(f.card)} переходит на сторону: ${who(s, pIdx)}`);
      }
      toGrave(s, card);
      break;
    }
    case 'curse': {
      const row = E.rows[target.row];
      if (row.horn) { toGrave(s, row.horn); row.horn = null; }
      if (row.fort) { toGrave(s, row.fort); row.fort = null; }
      row.curse = card;
      break;
    }
    case 'discard': {
      if (E.hand.length) {
        const c = E.hand.splice(rnd(E.hand.length), 1)[0];
        toGrave(s, c);
        ctx.log(`${who(s, enemy)} сбрасывает ${q(c)}`);
      }
      toGrave(s, card);
      break;
    }
    case 'draw2': {
      const n = drawCards(P, 2);
      ctx.log(`${who(s, pIdx)} берёт карт: ${n}`);
      toGrave(s, card);
      break;
    }
    case 'shop': {
      toGrave(s, card);
      if (!P.deck.length) break;
      const offer = shuffle(P.deck.slice()).slice(0, 3);
      const chosen = (await ctx.choose(pIdx, offer, 'Торговая Точка: заберите одну карту в руку', false)) || offer[0];
      P.deck.splice(P.deck.indexOf(chosen), 1);
      P.hand.push(chosen);
      shuffle(P.deck);
      ctx.log(`${who(s, pIdx)} покупает карту в Торговой Точке`);
      break;
    }
    default:
      toGrave(s, card);
  }
}

async function placeUnit(s, pIdx, card, row, ctx) {
  const P = s.players[pIdx];
  const enemy = 1 - pIdx;
  const spy = has(card, 'spy');
  const side = spy ? enemy : pIdx;
  card.placed = row;
  s.players[side].rows[row].cards.push(card);
  ctx.log(`${who(s, pIdx)}: ${q(card)} → ${ROW_NAMES[row]}${spy ? ' (к противнику)' : ''}`);

  if (spy) {
    const n = drawCards(P, 2);
    ctx.log(`${who(s, pIdx)} берёт карт: ${n}`);
  }
  if (has(card, 'draw')) drawCards(P, 1);
  if (has(card, 'cover') && !s.players[side].rows[row].shield) {
    const sh = makeCard(COVER_SHIELD_DEF, side);
    sh.virtual = true;
    sh.faction = card.faction;
    s.players[side].rows[row].shield = sh;
  }
  if (has(card, 'fetch') && card.fetch) {
    const i = P.deck.findIndex((c) => c.id === card.fetch);
    if (i >= 0 && Math.random() < 0.95) {
      const c = P.deck.splice(i, 1)[0];
      P.hand.push(c);
      ctx.log(`${who(s, pIdx)}: «А вот был случай…» — ${q(c)} в руку`);
    }
  }
  if (has(card, 'muster')) {
    const pulled = P.deck.filter((c) => c.muster === card.muster);
    P.deck = P.deck.filter((c) => c.muster !== card.muster);
    for (const c of pulled) {
      const r = c.row === 'agile' ? bestAgileRow(s, pIdx, c) : c.row;
      c.placed = r;
      P.rows[r].cards.push(c);
    }
    if (pulled.length) ctx.log(`Зов стаи: ${pulled.map(q).join(', ')}`);
  }
  if (has(card, 'summon') && card.summon) {
    const t = card.summon;
    for (let i = 0; i < (t.count || 1); i++) {
      const tok = makeCard({ id: card.id + '_token', name: t.name, type: 'unit', power: t.power, row: t.row,
        abil: [], icon: t.icon, img: card.img, thumb: card.thumb, rarity: 'common', faction: card.faction }, pIdx);
      tok.token = true;
      tok.placed = t.row;
      P.rows[t.row].cards.push(tok);
    }
    ctx.log(`Призыв: ${t.name} ×${t.count}`);
  }
  if (has(card, 'reinforce')) {
    const pool = shuffle(P.deck.filter((c) => isUnit(c) && !isHero(c))).slice(0, 2);
    for (const c of pool) {
      P.deck.splice(P.deck.indexOf(c), 1);
      const r = c.row === 'agile' ? bestAgileRow(s, pIdx, c) : c.row;
      const sd = has(c, 'spy') ? enemy : pIdx;
      c.placed = r;
      s.players[sd].rows[r].cards.push(c);
    }
    if (pool.length) ctx.log(`Подкрепление: ${pool.map(q).join(', ')}`);
  }
  if (has(card, 'dispel')) {
    let n = 0;
    ROWS.forEach((r) => {
      const R = s.players[1 - side].rows[r];
      if (R.horn) { toGrave(s, R.horn); R.horn = null; n++; }
      if (R.fort) { toGrave(s, R.fort); R.fort = null; n++; }
    });
    if (n) ctx.log('Ярость: усиления противника сняты');
  }
  if (has(card, 'convert')) {
    const victims = unitsOn(s, 1 - side, targetable).sort((a, b) => a.power - b.power);
    if (victims.length && !absorb(s, victims[0].side, victims[0].row, ctx)) {
      const v = victims[0];
      removeFromBoard(s, v.card);
      v.card.owner = pIdx;
      s.players[side].rows[v.row].cards.push(v.card);
      ctx.log(`${q(v.card)} переходит на сторону: ${who(s, side)}`);
    }
  }
  if (has(card, 'shoot')) {
    const t = strongest(unitsOn(s, 1 - side, targetable))[0];
    if (t) { ctx.log(`Выстрел: ${q(t.card)} −${card.value}`); hitUnits(s, [t], card.value, ctx); }
  }
  if (has(card, 'scorch')) {
    const enemySide = 1 - side;
    if (rowScore(s, enemySide, row) >= 10) {
      destroy(s, strongest(unitsOn(s, enemySide, (it) => vulnerable(it) && it.row === row)), ctx, 'Выжигание');
    }
  }
  if (has(card, 'medic')) {
    const options = P.grave.filter((c) => isUnit(c) && !isHero(c));
    if (options.length) {
      const chosen = await ctx.choose(pIdx, options, 'Целитель: выберите отряд, который вернётся на поле', true);
      if (chosen) {
        P.grave.splice(P.grave.indexOf(chosen), 1);
        const r = chosen.row === 'agile' ? bestAgileRow(s, pIdx, chosen) : chosen.row;
        await placeUnit(s, pIdx, chosen, r, ctx);
      }
    }
  }
}

async function useLeader(s, pIdx, ctx) {
  const P = s.players[pIdx];
  const L = P.leader;
  L.used = true;
  ctx.log(`${who(s, pIdx)}: лидер ${L.name}`);
  switch (L.ability) {
    case 'hornSiege': {
      const h = makeCard(LEADER_HORN_DEF, pIdx);
      h.fromLeader = true;
      h.faction = P.faction;
      P.rows.siege.horn = h;
      break;
    }
    case 'draw':
      drawCards(P, 1);
      break;
    case 'scorchMelee': {
      const enemy = 1 - pIdx;
      if (rowScore(s, enemy, 'melee') >= 10) {
        destroy(s, strongest(unitsOn(s, enemy, (it) => vulnerable(it) && it.row === 'melee')), ctx, 'Мор');
      }
      break;
    }
    case 'reviveRandom': {
      const options = P.grave.filter((c) => isUnit(c) && !isHero(c));
      if (options.length) {
        const c = pickRandom(options);
        P.grave.splice(P.grave.indexOf(c), 1);
        const r = c.row === 'agile' ? bestAgileRow(s, pIdx, c) : c.row;
        await placeUnit(s, pIdx, c, r, ctx);
      }
      break;
    }
  }
}

/** После действия: передаём ход, если соперник ещё не пасовал */
function advanceTurn(s) {
  if (s.extraTurn) { s.extraTurn = false; return; } // карта «не тратит ход»
  const o = 1 - s.current;
  if (!s.players[o].passed) s.current = o;
}

function tieWinner(s) {
  const sea = [0, 1].filter((i) => s.players[i].faction === 'sea');
  return sea.length === 1 ? sea[0] : null;
}

function endRound(s, ctx) {
  const scores = [totalScore(s, 0), totalScore(s, 1)];
  let winner = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : null;
  let tieBreak = false;
  if (winner === null) {
    winner = tieWinner(s);
    tieBreak = winner !== null;
  }
  if (winner === null) s.players.forEach((p) => p.lives--);
  else s.players[1 - winner].lives--;
  s.history.push({ round: s.round, scores, winner });

  const notes = [];
  if (winner !== null && s.players[winner].faction === 'iron' && drawCards(s.players[winner], 1)) {
    notes.push(`${who(s, winner)}: Железный Легион берёт карту за победу`);
  }
  for (const side of [0, 1]) {
    const traders = unitsOn(s, side, (it) => has(it.card, 'income')).length;
    const n = traders ? drawCards(s.players[side], traders) : 0;
    if (n) notes.push(`${who(s, side)}: Барыга приносит карт — ${n}`);
  }

  // уборка поля
  for (const p of s.players) {
    let keep = null;
    if (p.faction === 'dark') {
      const units = unitsOn(s, p.idx, (it) => !it.card.token);
      if (units.length) keep = pickRandom(units).card;
    }
    for (const r of ROWS) {
      const row = p.rows[r];
      row.cards = row.cards.filter((c) => {
        if (c === keep) return true;
        if (c.type === 'decoy') c.type = 'special';
        toGrave(s, c);
        return false;
      });
      for (const k of SLOT_KEYS) {
        if (row[k]) { toGrave(s, row[k]); row[k] = null; }
      }
    }
    if (keep) notes.push(`${p.name}: ${q(keep)} остаётся на поле (Порождения Тьмы)`);
    p.passed = false;
  }
  clearWeather(s);

  const [a, b] = s.players;
  if (a.lives <= 0 || b.lives <= 0) {
    s.phase = 'over';
    s.winner = a.lives <= 0 && b.lives <= 0 ? null : a.lives <= 0 ? 1 : 0;
  } else {
    s.round++;
    s.starter = winner === null ? 1 - s.starter : 1 - winner; // проигравший ходит первым
    s.current = s.starter;
  }
  notes.forEach((n) => ctx.log(n));
  return { scores, winner, tieBreak, notes };
}
