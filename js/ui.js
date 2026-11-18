'use strict';
/* =====================================================================
   ТРОН — интерфейс и игровой цикл
   ===================================================================== */

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const App = {
  s: null,
  myHero: 'wife',
  oppHero: 'random',
  extra: true,
  sel: null,            // {kind:'card'|'bc'|'power'|'minion', uid, pos}
  targets: new Set(),
  busy: false,
  looping: false,
  fxq: [],
  prev: new Map(),      // id → {hp, atk}
  seen: new Set(),      // существа, уже показанные на поле
  handSeen: new Set(),
  opHandN: 0,
  props: null,
  logLines: [],
  galTab: 'shared',
  hovering: false,
};

/* ---------------------- окружение полей ---------------------- */
const FIELD_PROPS = {
  zags:    [['💒', 'Свадебная арка'], ['🎂', 'Свадебный торт']],
  office:  [['🗄️', 'Шкаф с договорами'], ['🪴', 'Офисный фикус']],
  night:   [['🚦', 'Светофор'], ['🗑️', 'Мусорный бак']],
  nursery: [['🧸', 'Плюшевый мишка'], ['⚗️', 'Колба с зельем']],
};
const PROP_HP = 5;

/* ---------------------- картинки новых карт ---------------------- */
const ART_OK = new Set();
function probeArt() {
  EXTRA_CARDS.forEach((c) => {
    if (!c.optionalArt) return;
    if (window.EMBED_ART) { if (c.thumb.startsWith('data:')) ART_OK.add(c.id); return; }
    const im = new Image();
    im.onload = () => { ART_OK.add(c.id); };
    im.src = c.thumb;
  });
}
const artOf = (c, full) => {
  if (!c.img) return null;
  if (c.optionalArt && !ART_OK.has(c.id)) return null;
  return full ? c.img : (c.thumb || c.img);
};

/* ---------------------- масштаб ---------------------- */
function fit() {
  const k = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  $('#stage').style.transform = `translate(-50%, -50%) scale(${k})`;
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));

function show(id) {
  ['menu', 'game', 'gallery'].forEach((x) => $('#' + x).classList.toggle('hidden', x !== id));
}

/* ---------------------- HTML карт ---------------------- */
function clsName(c) {
  if (c.cls === 'shared' || c.cls === 'extra') return 'Общая карта';
  return HEROES[c.cls] ? 'Карта героини: ' + HEROES[c.cls].short : '';
}

function artHTML(c, full) {
  const src = artOf(c, full);
  return src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span class="glyph">${c.icon || '✦'}</span>`;
}

function hcardHTML(c, o) {
  o = o || {};
  const cost = o.cost != null ? o.cost : c.cost;
  const cls = ['hcard', 'r-' + (c.rarity || 'common'), c.type];
  if (o.cls) cls.push(o.cls);
  const data = c.uid ? `data-h="${c.uid}"` : `data-gid="${esc(c.id)}"`;
  const stats = c.type === 'minion' ? `<div class="hc-atk">${c.atk}</div><div class="hc-hp">${c.hp}</div>` : '';
  return `<div class="${cls.join(' ')}" ${data} ${o.style ? `style="${o.style}"` : ''}>
    <div class="hc-art">${artHTML(c)}</div>
    <div class="hc-cost ${cost < c.cost ? 'cheap' : ''}">${cost}</div>
    <div class="hc-name">${esc(c.name)}</div>
    <div class="hc-text">${esc(cardShortText(c))}</div>${stats}</div>`;
}

function minionHTML(s, m, o) {
  const cls = ['minion'];
  if (m.rarity === 'legendary') cls.push('legendary');
  ['taunt', 'shield', 'stealth'].forEach((k) => { if (hasKw(m, k)) cls.push(k); });
  if (m.frozen) cls.push('frozen');
  if (o.extra) cls.push(o.extra);
  const atk = getAtk(s, m);
  const icons = [];
  ['poison', 'windfury', 'lifesteal', 'flying', 'charge'].forEach((k) => { if (hasKw(m, k)) icons.push(KEYWORDS[k].icon); });
  if (m.dr) icons.push('⚰️');
  if (m.end) icons.push('🌙');
  if (m.aura) icons.push('✴️');
  if (m.enrage) icons.push('💢');
  if (m.spellDiscount) icons.push('🏷️');
  if (m.cantAttack) icons.push('⛔');
  if (m.female) icons.push('♀');
  const status = [m.spouse ? '💍' : '', m.preg ? '🤰' : '', m.debt ? '📜' : ''].join('');
  const sleepy = m.owner === s.current && m.sleeping && !m.cantAttack && s.phase === 'play';
  const def = defOf(m.id);
  const baseAtk = def ? def.atk : m.atk;
  return `<div class="${cls.join(' ')}" data-t="${m.uid}" ${o.style ? `style="${o.style}"` : ''}>
    <div class="m-frame"><div class="m-art">${artHTML(m)}</div></div>
    <div class="m-icons">${icons.slice(0, 4).map((x) => `<span>${x}</span>`).join('')}</div>
    ${status ? `<div class="m-status">${status}</div>` : ''}
    ${sleepy ? '<div class="m-zz">💤</div>' : ''}
    <div class="m-atk ${atk > baseAtk ? 'up' : atk < baseAtk ? 'down' : ''}">${atk}</div>
    <div class="m-hp ${m.hp < m.maxHp ? 'hurt' : m.maxHp > (def ? def.hp : m.maxHp) ? 'up' : ''}">${m.hp}</div></div>`;
}

function heroHTML(s, i, extra) {
  const P = s.players[i];
  const H = HEROES[P.hero];
  return `<div class="hero ${extra || ''}" data-t="h${i}">
    <div class="h-art"><img src="${esc(H.thumb || H.img)}" alt=""></div>
    ${P.armor ? `<div class="h-armor">${P.armor}</div>` : ''}
    <div class="h-hp ${P.hp < P.maxHp ? 'hurt' : ''}">${P.hp}</div>
    <div class="h-name">${esc(H.name)}</div></div>`;
}

function powerHTML(s, i, extra) {
  const P = s.players[i];
  const pw = HEROES[P.hero].power;
  const cls = ['power'];
  if (P.powerUsed) cls.push('used');
  else if (i === 0 && canAct() && canPower(s, 0)) cls.push('ready');
  if (extra) cls.push(extra);
  return `<div class="${cls.join(' ')}" data-power="${i}" title="${esc(pw.name)}"><div class="pw-cost">${pw.cost}</div>${pw.icon}</div>`;
}

/* ---------------------- превью ---------------------- */
function previewHTML(c, live) {
  if (!c) {
    return `<div class="pv-empty">Нажмите на карту или существо,<br>чтобы рассмотреть его.<br><br>
      Карта в руке → место на поле или цель.<br>Своё существо → кого атаковать.<br>Круглая кнопка у героини — её сила.</div>`;
  }
  if (c.power && c.field) {   // героиня
    return `<img class="pv-img" src="${esc(c.img)}" alt=""><h3>${esc(c.name)}</h3>
      <div class="pv-meta">Героиня · поле «${esc(c.fieldName)}» · ${HERO_HP} здоровья</div>
      <div class="pv-ab"><b>${c.power.icon} Сила «${esc(c.power.name)}» (${c.power.cost} маны).</b> ${esc(c.power.desc)}</div>
      <div class="pv-ab">${esc(c.desc)}</div><div class="pv-quote">${esc(c.quote)}</div>`;
  }
  const src = artOf(c, true);
  const img = src ? `<img class="pv-img" src="${esc(src)}" alt="">` : `<div class="pv-glyph">${c.icon || '✦'}</div>`;
  const atk = live ? getAtk(App.s, live) : c.atk;
  const hp = live ? live.hp : c.hp;
  const stats = `<div class="pv-stats">${live ? '' : `<span class="s-cost">💎 ${c.cost}</span>`}${c.type === 'minion' ? `<span class="s-atk">⚔ ${atk}</span><span class="s-hp">❤ ${hp}${live && live.maxHp > hp ? '/' + live.maxHp : ''}</span>` : ''}</div>`;
  const parts = cardTextParts(c).map((p) => `<div class="pv-ab"><b>${p.name}.</b> ${esc(p.text)}</div>`);
  if (live) {
    if (live.frozen) parts.push('<div class="pv-ab"><b>💫 Оглушён.</b> Пропускает ближайшую атаку.</div>');
    if (live.spouse) parts.push('<div class="pv-ab"><b>💍 В браке.</b> Если супруг погибнет — получит 2 урона.</div>');
    if (live.preg) parts.push(`<div class="pv-ab"><b>🤰 Беременность.</b> Роды через ${live.preg.turns} хода — ребёнок достанется ${live.preg.by === 0 ? 'вам' : 'противнику'}.</div>`);
    if (live.debt) parts.push(`<div class="pv-ab"><b>📜 Долг.</b> Теряет ${live.debt} атаки в начале каждого своего хода.</div>`);
    if (live.silenced) parts.push('<div class="pv-ab"><b>🤐 Без свойств.</b></div>');
  }
  const meta = `${c.type === 'minion' ? 'Существо' : 'Заклинание'}${c.token ? ' · призванное' : ''} · ${RARITY_NAMES[c.rarity || 'common']}<br>${clsName(c)}`;
  return `${img}<h3>${esc(c.name)}</h3><div class="pv-meta">${meta}</div>${stats}${parts.join('') || '<div class="pv-ab">Без особых свойств.</div>'}
    ${c.quote ? `<div class="pv-quote">${esc(c.quote)}</div>` : ''}`;
}

function showPreview(c, live) {
  const el = $('#preview');
  if (el) el.innerHTML = previewHTML(c, live);
}

function previewFromEl(el) {
  const s = App.s;
  if (el.dataset.t != null && s) {
    const id = el.dataset.t[0] === 'h' ? el.dataset.t : +el.dataset.t;
    const ch = findChar(s, id);
    if (!ch) return null;
    if (ch.kind === 'hero') return { c: HEROES[ch.p.hero] };
    return { c: ch.m, live: ch.m };
  }
  if (el.dataset.h && s) {
    const c = s.players[0].hand.find((x) => x.uid === +el.dataset.h);
    return c ? { c } : null;
  }
  if (el.dataset.power != null && s) return { c: HEROES[s.players[+el.dataset.power].hero] };
  if (el.dataset.gid) return { c: defOf(el.dataset.gid) };
  if (el.dataset.hero) return { c: HEROES[el.dataset.hero] };
  return null;
}

/* ---------------------- журнал ---------------------- */
function addLog(msg) {
  const cls = msg.startsWith('Вы') ? 'me' : msg.startsWith('Противник') ? 'op' : 'sys';
  App.logLines.push({ msg, cls });
  if (App.logLines.length > 80) App.logLines.shift();
  const el = $('#log');
  if (!el) return;
  el.innerHTML = App.logLines.map((l) => `<div class="${l.cls}">${esc(l.msg)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

const CTX = {
  log: addLog,
  fx(type, d) { App.fxq.push(Object.assign({ type }, d)); },
  choose(pIdx, cards, title) {
    if (pIdx !== 0) return Promise.resolve(AI.pickBest(cards));
    render();
    return chooseCardModal(cards, title);
  },
};

/* ---------------------- выбор и цели ---------------------- */
function canAct() {
  const s = App.s;
  return !!s && s.phase === 'play' && s.current === 0 && !App.busy;
}

function selCard() {
  const s = App.s;
  return App.sel && App.sel.uid != null ? s.players[0].hand.find((c) => c.uid === App.sel.uid) : null;
}

function computeTargets() {
  const s = App.s;
  const out = new Set();
  let hint = '';
  let lane = '';
  if (!App.sel || !canAct()) return { out, hint, lane };
  const sel = App.sel;
  if (sel.kind === 'card') {
    const c = selCard();
    if (!c) { App.sel = null; return { out, hint, lane }; }
    if (c.type === 'minion') { lane = 'drop'; hint = 'Выберите место на своём поле'; } else {
      const t = cardTargets(s, 0, c);
      if (t) { t.forEach((x) => out.add(x)); hint = 'Выберите цель заклинания'; } else { lane = 'cast'; hint = 'Нажмите на поле, чтобы разыграть'; }
    }
  } else if (sel.kind === 'bc') {
    const c = selCard();
    const f = c && targetFxOf(c);
    if (f) targetsForSpec(s, 0, f, c, null).forEach((x) => out.add(x));
    hint = 'Цель боевого клича (или нажмите мимо — без цели)';
  } else if (sel.kind === 'power') {
    (powerTargets(s, 0) || []).forEach((x) => out.add(x));
    hint = 'Выберите цель силы героини';
  } else if (sel.kind === 'minion') {
    const m = s.players[0].board.find((x) => x.uid === sel.uid);
    if (m && canAttack(s, m)) attackTargets(s, m).forEach((x) => out.add(x)); else App.sel = null;
    hint = 'Кого атаковать?';
  }
  return { out, hint, lane };
}

function hasMoves(s) {
  if (!canAct()) return false;
  if (canPower(s, 0)) return true;
  if (s.players[0].hand.some((c) => canPlay(s, 0, c))) return true;
  return s.players[0].board.some((m) => canAttack(s, m));
}

/* ---------------------- окружение ---------------------- */
function makeProps(s) {
  return [0, 1].map((side) => FIELD_PROPS[HEROES[s.players[side].hero].field].map(([icon, name]) => ({ icon, name, hp: PROP_HP })));
}

function propHTML(side, i) {
  const P = App.props && App.props[side][i];
  if (!P) return '';
  const d = P.hp <= 0 ? 'broken' : P.hp < PROP_HP ? 'd' + Math.min(3, Math.ceil((PROP_HP - P.hp) * 3 / PROP_HP)) : '';
  const pos = i === 0 ? 'left:36px' : 'right:36px';
  return `<div class="prop ${d}" style="${pos};top:${side === 1 ? 40 : 30}px" data-prop="${side}:${i}" title="${esc(P.name)}">
    <span class="pi">${P.icon}</span><span class="php"><i style="width:${Math.max(0, P.hp) / PROP_HP * 100}%"></i></span></div>`;
}

function hitProp(side, n) {
  if (!App.props) return null;
  const alive = App.props[side].map((p, i) => ({ p, i })).filter((x) => x.p.hp > 0);
  if (!alive.length) return null;
  const x = pickRandom(alive);
  x.p.hp = Math.max(0, x.p.hp - n);
  return { side, i: x.i, broken: x.p.hp === 0 };
}

function damageProps(events) {
  const out = [];
  for (const e of events) {
    let h = null;
    if (e.type === 'aoe') { h = hitProp(1 - e.pIdx, 1); if (e.who === 'allMinions') { const h2 = hitProp(e.pIdx, 1); if (h2) out.push(h2); } }
    else if (e.type === 'doom') { [0, 1].forEach((sd) => { const h2 = hitProp(sd, 2); if (h2) out.push(h2); }); }
    else if (e.type === 'kill' && Math.random() < 0.35) h = hitProp(e.side, 1);
    else if (e.type === 'dmg' && typeof e.id === 'string' && e.n >= 4) h = hitProp(+e.id[1], 1);
    if (h) out.push(h);
  }
  return out;
}

/* ---------------------- отрисовка ---------------------- */
function snapshot() {
  const snap = new Map();
  document.querySelectorAll('#arena [data-t]').forEach((el) => {
    const id = el.dataset.t[0] === 'h' ? el.dataset.t : +el.dataset.t;
    snap.set(id, { rect: FX.toStage(el), html: el.outerHTML });
  });
  return snap;
}

const elOf = (id) => document.querySelector(`#arena [data-t="${id}"]`);

function render() {
  const s = App.s;
  if (!s) return;
  const snap = snapshot();
  const events = App.fxq.splice(0);
  const propHits = damageProps(events);
  const { out: targets, hint, lane } = computeTargets();
  App.targets = targets;
  const isMine = (id) => (typeof id === 'string' ? id === 'h0' : (findChar(s, id) || {}).side === 0);
  const tcls = (id) => (targets.has(id) ? ' tgt' + (isMine(id) ? ' friendly' : '') : '');

  // поля героинь
  [['#field-op', 1], ['#field-me', 0]].forEach(([sel, i]) => {
    const H = HEROES[s.players[i].hero];
    const el = $(sel);
    el.className = 'field field-' + H.field;
    el.dataset.emblem = H.icon;
  });

  // героини и их силы
  const selPower = App.sel && App.sel.kind === 'power';
  $('#op-zone').innerHTML = heroHTML(s, 1, tcls('h1')) + powerHTML(s, 1) + propHTML(1, 0) + propHTML(1, 1);
  $('#me-zone').innerHTML = heroHTML(s, 0, tcls('h0')) + powerHTML(s, 0, selPower ? 'sel' : '') + propHTML(0, 0) + propHTML(0, 1);

  // существа
  let freshN = 0;
  const newSeen = new Set();
  for (const [sel, i] of [['#op-board', 1], ['#me-board', 0]]) {
    const html = s.players[i].board.map((m) => {
      newSeen.add(m.uid);
      let extra = tcls(m.uid);
      let style = '';
      if (!App.seen.has(m.uid)) { extra += ' fresh'; style = `animation-delay:${Math.min(freshN++, 4) * 90}ms`; }
      if (i === 0 && canAct() && canAttack(s, m)) extra += ' can';
      if (App.sel && App.sel.kind === 'minion' && App.sel.uid === m.uid) extra += ' sel';
      return minionHTML(s, m, { extra, style });
    }).join('');
    const el = $(sel);
    el.innerHTML = html;
    el.classList.toggle('drop', i === 0 && lane === 'drop');
    el.classList.toggle('cast', lane === 'cast');
  }
  App.seen = newSeen;

  // рука
  const me = s.players[0];
  const handEl = $('#hand');
  const n = me.hand.length;
  const gap = n <= 7 ? 6 : Math.floor((1000 - 136) / (n - 1) - 136);
  handEl.style.setProperty('--gap', gap + 'px');
  handEl.classList.toggle('locked', !canAct());
  let drawnN = 0;
  const newHand = new Set();
  handEl.innerHTML = me.hand.map((c) => {
    newHand.add(c.uid);
    const extra = [];
    if (canAct() && canPlay(s, 0, c)) extra.push('playable');
    if (App.sel && App.sel.uid === c.uid && (App.sel.kind === 'card' || App.sel.kind === 'bc')) extra.push('sel');
    let style = '';
    if (!App.handSeen.has(c.uid)) { extra.push('drawn'); style = `animation-delay:${Math.min(drawnN++, 6) * 90}ms`; }
    return hcardHTML(c, { cost: costOf(s, 0, c), cls: extra.join(' '), style });
  }).join('');
  if (drawnN && App.handSeen.size) Sound.play('draw');
  App.handSeen = newHand;

  // рука противника
  const opN = s.players[1].hand.length;
  $('#op-hand').innerHTML = Array.from({ length: opN }, (_, k) => `<div class="back ${k >= App.opHandN ? 'drawn' : ''}"></div>`).join('');
  App.opHandN = opN;

  // панели
  const crystals = (P) => Array.from({ length: 10 }, (_, k) => `<span class="crystal ${k < P.mana ? 'full' : k < P.maxMana ? 'spent' : ''}"></span>`).join('');
  const op = s.players[1];
  $('#op-info').innerHTML = `<div class="i-row"><span class="i-name">${esc(HEROES[op.hero].short)}</span><span class="mana-num">💎 ${op.mana}/${op.maxMana}</span></div>
    <div class="crystals">${crystals(op)}</div>
    <div class="i-row"><span>🂠 Рука: ${opN}</span><span>📚 Колода: ${op.deck.length}</span></div>`;
  $('#me-info').innerHTML = `<div class="i-row"><span class="i-name">${esc(HEROES[me.hero].short)}</span><span class="mana-num">💎 ${me.mana}/${me.maxMana}</span></div>
    <div class="crystals">${crystals(me)}</div>
    <div class="i-row"><span>📚 Колода: ${me.deck.length}</span>${me.fatigue ? `<span>😵 Усталость ${me.fatigue}</span>` : ''}</div>`;

  const endBtn = $('#btn-end');
  const myTurn = s.phase === 'play' && s.current === 0;
  endBtn.disabled = !canAct();
  endBtn.textContent = myTurn ? 'Конец хода' : s.phase === 'play' ? 'Ход противника' : 'Конец игры';
  endBtn.classList.toggle('wait', !myTurn);
  endBtn.classList.toggle('ready', myTurn && canAct() && !hasMoves(s));

  const h = $('#hint');
  h.textContent = hint;
  h.classList.toggle('on', !!hint);

  // освещение
  const g = $('#game');
  const turn = s.phase !== 'play' ? 'none' : s.current === 0 ? 'me' : 'op';
  ['me', 'op', 'none'].forEach((t) => g.classList.toggle('turn-' + t, turn === t));

  if (!App.hovering && App.sel) {
    const c = selCard();
    if (c) showPreview(c);
  }

  // всплывающие числа: сравниваем с прошлой отрисовкой
  const nowVals = new Map();
  document.querySelectorAll('#arena [data-t]').forEach((el) => {
    const id = el.dataset.t[0] === 'h' ? el.dataset.t : +el.dataset.t;
    const ch = findChar(s, id);
    if (!ch) return;
    const v = ch.kind === 'hero' ? { hp: ch.p.hp + ch.p.armor } : { hp: ch.m.hp };
    nowVals.set(id, v);
    const p = App.prev.get(id);
    if (!p) return;
    const dh = v.hp - p.hp;
    if (dh) FX.float((dh > 0 ? '+' : '') + dh, FX.toStage(el), dh > 0 ? 'up' : 'down');
    if (dh < 0) el.classList.add('hit');
  });
  App.prev = nowVals;
  playFx(events, snap, propHits);
}

/* ---------------------- звуки и эффекты событий ---------------------- */
const STORM_SOUND = { toxic: 'weather_melee', rain: 'weather_ranged', haze: 'weather_siege', gold: 'clear' };

function playFx(events, snap, propHits) {
  const sounds = new Set();
  let kills = 0;
  const rectOf = (id) => { const el = elOf(id); return el ? FX.toStage(el) : (snap.get(id) || {}).rect; };
  for (const e of events) {
    switch (e.type) {
      case 'play':
        sounds.add(e.type === 'minion' ? 'place' : 'special');
        if (e.storm) { FX.storm(e.storm, 3600); sounds.add(STORM_SOUND[e.storm]); }
        break;
      case 'summon': {
        sounds.add('place');
        const el = elOf(e.uid);
        if (el) setTimeout(() => FX.burstRect(FX.toStage(el), 'dust', 16), 300);
        break;
      }
      case 'dmg': {
        const r = rectOf(e.id);
        if (r) FX.burstRect(r, 'spark', 12);
        sounds.add(typeof e.id === 'string' ? 'heroHit' : 'hit');
        break;
      }
      case 'heal': { const r = rectOf(e.id); if (r) FX.burstRect(r, 'heal', 12); sounds.add('heal'); break; }
      case 'kill': { kills++; const g = snap.get(e.uid); if (g) FX.ghost(g.html, g.rect); break; }
      case 'shieldpop': { const r = rectOf(e.id); if (r) FX.burstRect(r, 'shield', 26); sounds.add('shieldpop'); break; }
      case 'stun': { const r = rectOf(e.id); if (r) FX.float('💫', r, 'icon'); sounds.add('stun'); break; }
      case 'silence': { const r = rectOf(e.id); if (r) FX.float('🤐', r, 'icon'); sounds.add('debuff'); break; }
      case 'steal': { const r = rectOf(e.id); if (r) FX.float('🤝', r, 'icon'); sounds.add('special'); break; }
      case 'bounce': { const r = rectOf(e.id); if (r) FX.float('↩️', r, 'icon'); sounds.add('draw'); break; }
      case 'marry': [e.a, e.b].forEach((id) => { const r = rectOf(id); if (r) { FX.float('💍', r, 'icon'); FX.burstRect(r, 'spark', 14); } }); sounds.add('marry'); break;
      case 'preg': { const r = rectOf(e.id); if (r) FX.float('🤰', r, 'icon'); sounds.add('debuff'); break; }
      case 'birth': { const r = rectOf(e.id); if (r) FX.float('👶', r, 'icon'); sounds.add('birth'); break; }
      case 'buff': sounds.add('buff'); break;
      case 'debuff': sounds.add('debuff'); break;
      case 'armor': { const r = rectOf(e.id); if (r) FX.float('🛡️+' + e.n, r, 'up'); sounds.add('absorb'); break; }
      case 'mana': sounds.add('mana'); break;
      case 'aoe':
        FX.flash(FX.toStage($(e.pIdx === 0 ? '#op-board' : '#me-board')), 'red');
        if (e.who === 'allMinions') FX.flash(FX.toStage($(e.pIdx === 0 ? '#me-board' : '#op-board')), 'red');
        sounds.add('burn');
        break;
      case 'doom': FX.quake(); sounds.add('doom'); ['#op-board', '#me-board'].forEach((l) => FX.flash(FX.toStage($(l)), 'curse')); break;
      case 'power': sounds.add('leader'); break;
      case 'trigger': { const r = rectOf(e.id); if (r) FX.flash(r, 'gold'); break; }
      case 'burnCard': addLog('🔥 Карта сгорела: рука переполнена'); break;
      case 'fatigue': { const r = rectOf('h' + e.pIdx); if (r) FX.float('😵', r, 'icon'); break; }
      default: break;
    }
  }
  if (kills) { sounds.add('kill'); if (kills >= 3) { FX.quake(); sounds.add('quake'); } }
  for (const ph of propHits) {
    const el = document.querySelector(`[data-prop="${ph.side}:${ph.i}"]`);
    if (!el) continue;
    el.classList.add('shake');
    const r = FX.toStage(el);
    FX.burst(r.x + r.w / 2, r.y + r.h * 0.6, 'debris', ph.broken ? 30 : 9);
    if (ph.broken) { FX.burst(r.x + r.w / 2, r.y + r.h * 0.6, 'dust', 16); sounds.add('smash'); } else sounds.add('crack');
  }
  sounds.forEach((nm) => Sound.play(nm));
}

/* ---------------------- выполнение действий ---------------------- */
async function lunge(uid, target) {
  const a = elOf(uid), t = elOf(target);
  if (!a || !t) return;
  const ra = FX.toStage(a), rt = FX.toStage(t);
  const dx = (rt.x + rt.w / 2 - ra.x - ra.w / 2) * 0.82, dy = (rt.y + rt.h / 2 - ra.y - ra.h / 2) * 0.82;
  a.style.zIndex = 10;
  Sound.play('attack');
  a.animate([{ transform: 'none' }, { transform: `translate(${dx * 0.15}px, ${dy * 0.15 - 20}px) scale(1.12)`, offset: 0.35 },
    { transform: `translate(${dx}px, ${dy}px) scale(1.08)` }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
  await sleep(300);
}

function boltClass(a) {
  const s = App.s;
  let list;
  if (a.type === 'power') list = powerOf(s, s.current).fx;
  else { const c = s.players[s.current].hand.find((x) => x.uid === a.uid); list = c ? (c.type === 'spell' ? c.fx : c.bc) : []; }
  if ((list || []).some((f) => f.e === 'heal' || f.e === 'buff')) return 'heal';
  if ((list || []).some((f) => ['stun', 'steal', 'silence', 'debuff', 'setAtk', 'pregnant', 'debt', 'bounce'].includes(f.e))) return 'magic';
  return '';
}

async function doAction(a) {
  const s = App.s;
  const pIdx = s.current;
  App.busy = true;
  App.sel = null;
  App.hovering = false;
  render();
  try {
    if (a.type === 'play' && pIdx === 1) {
      const c = s.players[1].hand.find((x) => x.uid === a.uid);
      if (c) { $('#played').innerHTML = hcardHTML(c, {}); showPreview(c); Sound.play('draw'); await sleep(1000); $('#played').innerHTML = ''; }
    }
    if (a.type === 'attack') await lunge(a.uid, a.target);
    else if ((a.type === 'play' || a.type === 'power') && a.target != null) {
      const from = elOf('h' + pIdx), to = elOf(a.target);
      if (from && to) await FX.bolt(FX.toStage(from), FX.toStage(to), boltClass(a));
    }
    await performAction(s, a, CTX);
  } finally {
    if (s === App.s) { App.busy = false; render(); }
  }
}

async function loop() {
  const s = App.s;
  if (!s || App.looping) return;
  App.looping = true;
  try {
    while (s === App.s && s.phase === 'play' && s.current === 1) {
      await sleep(650);
      if (s !== App.s) return;
      const a = await AI.choose(s, 1);
      if (s !== App.s) return;
      await doAction(a);
      if (a.type === 'end') break;
    }
  } finally {
    App.looping = false;
  }
  if (s !== App.s) return;
  if (s.phase === 'over') { gameOver(); return; }
  if (s.current === 0) { Sound.play('turn'); banner('Ваш ход', '', 900); }
}

async function humanAct(a) {
  if (!canAct()) return;
  await doAction(a);
  const s = App.s;
  if (!s) return;
  if (s.phase === 'over') { gameOver(); return; }
  if (s.current === 1) loop();
}

function lanePos(e) {
  const x = e.clientX;
  return [...document.querySelectorAll('#me-board .minion')].filter((m) => { const r = m.getBoundingClientRect(); return r.left + r.width / 2 < x; }).length;
}

function clearSel() { App.sel = null; render(); }

function onArenaClick(e) {
  const s = App.s;
  if (!s) return;

  // окружение можно ломать в любой момент
  const propEl = e.target.closest('[data-prop]');
  if (propEl) {
    const [side, i] = propEl.dataset.prop.split(':').map(Number);
    const P = App.props[side][i];
    if (P.hp > 0) {
      P.hp--;
      render();
      const el = document.querySelector(`[data-prop="${side}:${i}"]`);
      el.classList.add('shake');
      const r = FX.toStage(el);
      FX.burst(r.x + r.w / 2, r.y + r.h * 0.6, 'debris', P.hp ? 6 : 30);
      Sound.play(P.hp ? 'crack' : 'smash');
    }
    return;
  }

  const tEl = e.target.closest('[data-t]');
  const pEl = e.target.closest('[data-power]');
  if (tEl || pEl) { const pv = previewFromEl(tEl || pEl); if (pv) showPreview(pv.c, pv.live); }
  if (!canAct()) return;
  const id = tEl ? (tEl.dataset.t[0] === 'h' ? tEl.dataset.t : +tEl.dataset.t) : null;
  const sel = App.sel;

  // выбор цели
  if (sel && id != null && App.targets.has(id)) {
    if (sel.kind === 'card') humanAct({ type: 'play', uid: sel.uid, target: id });
    else if (sel.kind === 'bc') humanAct({ type: 'play', uid: sel.uid, pos: sel.pos, target: id });
    else if (sel.kind === 'power') humanAct({ type: 'power', target: id });
    else if (sel.kind === 'minion') humanAct({ type: 'attack', uid: sel.uid, target: id });
    return;
  }
  // клич без цели
  if (sel && sel.kind === 'bc') { humanAct({ type: 'play', uid: sel.uid, pos: sel.pos, target: null }); return; }

  // сила героини
  if (pEl && pEl.dataset.power === '0') {
    if (!canPower(s, 0)) return;
    if (powerTargets(s, 0)) { App.sel = sel && sel.kind === 'power' ? null : { kind: 'power' }; render(); } else humanAct({ type: 'power', target: null });
    return;
  }

  // своё существо — выбрать атакующего
  if (id != null && typeof id === 'number') {
    const m = s.players[0].board.find((x) => x.uid === id);
    if (m && canAttack(s, m)) { App.sel = sel && sel.uid === id && sel.kind === 'minion' ? null : { kind: 'minion', uid: id }; render(); return; }
  }

  // разыграть выбранную карту
  if (sel && sel.kind === 'card') {
    const c = selCard();
    if (c && c.type === 'minion' && e.target.closest('#me-board, #field-me, #me-zone') && !tEl) {
      const pos = lanePos(e);
      const f = targetFxOf(c);
      if (f && targetsForSpec(s, 0, f, c, null).length) { App.sel = { kind: 'bc', uid: c.uid, pos }; render(); return; }
      humanAct({ type: 'play', uid: c.uid, pos });
      return;
    }
    if (c && c.type === 'spell' && !cardTargets(s, 0, c) && !tEl) { humanAct({ type: 'play', uid: c.uid }); return; }
  }
  if (sel) clearSel();
}

function onHandClick(e) {
  const el = e.target.closest('.hcard');
  if (!el || !App.s) return;
  const c = App.s.players[0].hand.find((x) => x.uid === +el.dataset.h);
  if (!c) return;
  showPreview(c);
  if (!canAct()) return;
  if (App.sel && App.sel.uid === c.uid) { clearSel(); return; }
  App.sel = canPlay(App.s, 0, c) ? { kind: 'card', uid: c.uid } : null;
  render();
}

/* ---------------------- баннер и окна ---------------------- */
let bannerToken = 0;
function banner(text, sub, ms) {
  const el = $('#banner');
  const token = ++bannerToken;
  el.querySelector('.banner-text').textContent = text;
  el.querySelector('.banner-sub').textContent = sub || '';
  el.classList.remove('hidden');
  return new Promise((res) => {
    const done = () => { el.removeEventListener('click', done); if (token === bannerToken) el.classList.add('hidden'); res(); };
    el.addEventListener('click', done);
    setTimeout(done, ms || 1300);
  });
}

function modal(html, onClick, boxCls) {
  const m = $('#modal');
  return new Promise((res) => {
    const close = (v) => { m.classList.add('hidden'); m.innerHTML = ''; m.onclick = null; res(v); };
    m.innerHTML = `<div class="mbox ${boxCls || ''}">${html}</div>`;
    m.classList.remove('hidden');
    m.onclick = (e) => {
      const b = e.target.closest('[data-v]');
      if (b) { close(b.dataset.v); return; }
      if (onClick) onClick(e, close);
    };
  });
}

function chooseCardModal(cards, title) {
  const html = `<h2>${esc(title)}</h2><div class="mcards">${cards.map((c) => hcardHTML(c)).join('')}</div>`;
  return modal(html, (e, close) => {
    const el = e.target.closest('.hcard[data-h]');
    if (el) close(+el.dataset.h);
  }).then((v) => cards.find((c) => c.uid === v) || cards[0]);
}

function confirmModal(title, text, yes) {
  return modal(`<h2>${esc(title)}</h2><p>${text}</p><div class="mbtns"><button class="btn btn-gold" data-v="yes">${yes || 'Да'}</button><button class="btn" data-v="no">Отмена</button></div>`)
    .then((v) => v === 'yes');
}

function mulliganModal() {
  const s = App.s;
  const P = s.players[0];
  const swap = new Set();
  const m = $('#modal');
  return new Promise((res) => {
    const draw = () => {
      m.innerHTML = `<div class="mbox"><h2>Стартовая рука</h2>
        <p>${s.first === 0 ? 'Вы ходите первым.' : 'Вы ходите вторым и получите «Медяк» (+1 мана на один ход).'}
        Нажмите на карты, которые хотите заменить.</p>
        <div class="mcards">${P.hand.map((c) => hcardHTML(c, { cls: swap.has(c.uid) ? 'swap' : '' })).join('')}</div>
        <div class="mbtns"><button class="btn btn-gold" data-done="1">${swap.size ? 'Заменить и начать' : 'Оставить и начать'}</button></div></div>`;
    };
    draw();
    m.classList.remove('hidden');
    m.onclick = (e) => {
      if (e.target.closest('[data-done]')) {
        m.classList.add('hidden'); m.innerHTML = ''; m.onclick = null;
        mulligan(s, 0, [...swap]);
        res();
        return;
      }
      const el = e.target.closest('.hcard[data-h]');
      if (!el) return;
      const uid = +el.dataset.h;
      if (swap.has(uid)) swap.delete(uid); else swap.add(uid);
      draw();
    };
  });
}

/* ---------------------- начало и конец партии ---------------------- */
async function startGame() {
  const keys = Object.keys(HEROES);
  const opp = App.oppHero === 'random' ? pickRandom(keys.filter((k) => k !== App.myHero)) : App.oppHero;
  const first = rnd(2);
  const s = createGame(App.myHero, opp, App.extra, first);
  App.s = s;
  App.sel = null;
  App.busy = true;
  App.fxq = [];
  App.prev = new Map();
  App.seen = new Set();
  App.handSeen = new Set();
  App.opHandN = 0;
  App.logLines = [];
  App.props = makeProps(s);
  FX.clearAll();
  Sound.setLocation(HEROES[App.myHero].field);
  show('game');
  addLog(`${HEROES[App.myHero].name} против ${HEROES[opp].name}`);
  render();
  FX.setZones([$('#field-op'), $('#field-me')]);
  showPreview(null);
  await banner(`${HEROES[App.myHero].short} ⚔ ${HEROES[opp].short}`, `Поле: ${HEROES[App.myHero].fieldName}`, 1600);
  if (s !== App.s) return;
  await mulliganModal();
  if (s !== App.s) return;
  mulligan(s, 1, AI.mulligan(s, 1));
  await beginGame(s, CTX);
  App.busy = false;
  render();
  if (s.current === 1) loop(); else { Sound.play('turn'); banner('Ваш ход', '', 900); }
}

function gameOver() {
  const s = App.s;
  const loser = s.winner == null ? null : 1 - s.winner;
  if (loser != null) {
    const el = elOf('h' + loser);
    if (el) { FX.ghost(el.outerHTML, FX.toStage(el)); el.style.visibility = 'hidden'; }
    FX.quake();
  }
  Sound.play(s.winner === 0 ? 'win' : 'lose');
  const H = HEROES[s.players[s.winner === 1 ? 1 : 0].hero];
  const title = s.winner === 0 ? '🏆 Победа!' : s.winner === 1 ? 'Поражение' : 'Ничья';
  setTimeout(() => {
    if (s !== App.s) return;
    modal(`<h2>${title}</h2><img class="result-hero" src="${esc(H.thumb)}" alt="">
      <p>${s.winner === 0 ? 'Трон ваш.' : s.winner === 1 ? `Трон достаётся: ${esc(H.name)}.` : 'Обе героини пали.'} Ходов сыграно: ${s.turn}.</p>
      <div class="mbtns"><button class="btn btn-gold" data-v="again">Ещё партию</button><button class="btn" data-v="menu">В меню</button></div>`)
      .then((v) => { if (v === 'again') startGame(); else goMenu(); });
  }, 1100);
}

function goMenu() {
  App.s = null;
  FX.clearAll();
  $('#banner').classList.add('hidden');
  Sound.setLocation('tavern');
  show('menu');
}

async function leaveToMenu() {
  if (await confirmModal('Выйти в меню?', 'Текущая партия будет потеряна.', 'Выйти')) goMenu();
}

/* ---------------------- меню ---------------------- */
function heroTileHTML(k, sel) {
  const H = HEROES[k];
  return `<div class="hero-tile ${sel ? 'sel' : ''}" data-hero="${k}"><img src="${esc(H.thumb)}" alt="">
    <div class="ht-body"><h4>${esc(H.name)}</h4><p>${esc(H.desc)}</p>
    <p class="pw">${H.power.icon} <b>${esc(H.power.name)}</b> (${H.power.cost}): ${esc(H.power.desc)}</p>
    <p class="loc">🗺️ Поле: ${esc(H.fieldName)}</p></div></div>`;
}

function renderMenu() {
  $('#hero-list').innerHTML = Object.keys(HEROES).map((k) => heroTileHTML(k, App.myHero === k)).join('');
  $('#opp-select').innerHTML = '<option value="random">Случайная героиня</option>' +
    Object.keys(HEROES).map((k) => `<option value="${k}">${esc(HEROES[k].name)}</option>`).join('');
  $('#opp-select').value = App.oppHero;
}

function showRules() {
  const kws = Object.values(KEYWORDS).map((k) => `<li><b>${k.icon} ${k.name}</b> — ${k.desc}</li>`).join('');
  modal(`<h2>Правила</h2>
    <h3>Цель</h3><p>Опустите здоровье вражеской героини с ${HERO_HP} до нуля.</p>
    <h3>Ход</h3><ul>
      <li>Каждый ход вы получаете +1 кристалл маны (максимум 10) и берёте карту. Мана полностью восстанавливается в начале хода.</li>
      <li>Карты стоят ману (синий кристалл в углу карты). Существа выходят на поле, заклинания срабатывают сразу.</li>
      <li>Существа атакуют со следующего хода (кроме тех, у кого Рывок). Каждое — один раз за ход.</li>
      <li>При атаке существа наносят урон друг другу одновременно. Героиню можно бить напрямую, если нет Провокации.</li>
      <li>Сила героини (круглая кнопка) — раз в ход за 2 маны.</li>
      <li>Кто ходит вторым, получает «Медяк» — +1 мана на один ход.</li>
      <li>На поле не больше 7 существ, в руке не больше 10 карт. Пустая колода — урон «усталостью».</li>
    </ul>
    <h3>Ключевые слова</h3><ul>${kws}
      <li><b>📣 Боевой клич</b> — срабатывает, когда карта разыграна из руки.</li>
      <li><b>⚰️ Предсмертный хрип</b> — срабатывает, когда существо погибает.</li>
      <li><b>💫 Оглушение</b> — существо пропускает свою ближайшую атаку.</li>
      <li><b>💍 Брак</b> — супруги слабеют, а смерть одного наносит 2 урона другому.</li>
      <li><b>🤰 Беременность</b> — −2 атаки; через 2 хода «Ребёнок» 2/2 достаётся тому, кто это устроил.</li>
      <li><b>📜 Долг</b> — существо теряет атаку в начале каждого своего хода.</li>
    </ul>
    <h3>Управление</h3><p>Нажмите карту в руке, затем место на поле или подсвеченную цель. Нажмите своё существо с зелёной рамкой, затем врага. Предметы по краям поля можно ломать — просто нажимайте на них.</p>
    <div class="mbtns"><button class="btn btn-gold" data-v="ok">Понятно</button></div>`, null, 'rules');
}

/* ---------------------- коллекция ---------------------- */
function renderGallery() {
  const tabs = [['shared', 'Ваши карты'], ['extra', 'Без картинок']]
    .concat(Object.keys(HEROES).map((k) => [k, 'Карты: ' + HEROES[k].short])).concat([['heroes', 'Героини']]);
  $('#gal-tabs').innerHTML = tabs.map(([k, n]) => `<button class="btn ${App.galTab === k ? 'sel' : ''}" data-tab="${k}">${esc(n)}</button>`).join('');
  if (App.galTab === 'heroes') {
    $('#gal-grid').innerHTML = Object.keys(HEROES).map((k) => heroTileHTML(k, false)).join('');
  } else {
    const defs = App.galTab === 'shared' ? SHARED_CARDS : App.galTab === 'extra' ? EXTRA_CARDS : HEROES[App.galTab].cards;
    $('#gal-grid').innerHTML = defs.slice().sort((a, b) => a.cost - b.cost).map((d) =>
      `<div class="gcard">${hcardHTML(d)}<div class="gid">${esc(d.id)}${d.count > 1 && d.rarity !== 'legendary' ? ' ×' + d.count : ''}</div></div>`).join('');
  }
  $('#gal-preview').innerHTML = '<div class="pv-empty">Нажмите на карту, чтобы рассмотреть её.<br><br>Под каждой картой — её id (имя файла картинки).</div>';
}

/* ---------------------- инициализация ---------------------- */
function updateSoundBtns() {
  document.querySelectorAll('.btn-sound').forEach((b) => { b.textContent = Sound.isMuted() ? '🔇' : '🔊'; });
}

function init() {
  fit();
  FX.init();
  probeArt();
  renderMenu();
  updateSoundBtns();
  showPreview(null);

  document.addEventListener('pointerdown', () => Sound.init(), { capture: true });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-sound')) return;
    e.stopPropagation();
    Sound.init();
    Sound.setMuted(!Sound.isMuted());
    updateSoundBtns();
  }, { capture: true });

  $('#hero-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-hero]');
    if (!t) return;
    App.myHero = t.dataset.hero;
    renderMenu();
  });
  $('#opp-select').addEventListener('change', (e) => { App.oppHero = e.target.value; });
  $('#extra-toggle').addEventListener('change', (e) => { App.extra = e.target.checked; });
  $('#btn-start').addEventListener('click', startGame);
  $('#btn-rules').addEventListener('click', showRules);
  $('#btn-gallery').addEventListener('click', () => { show('gallery'); renderGallery(); });
  $('#btn-gal-back').addEventListener('click', () => show('menu'));
  $('#gal-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { App.galTab = t.dataset.tab; renderGallery(); }
  });
  $('#gal-grid').addEventListener('click', (e) => {
    const el = e.target.closest('.hcard, [data-hero]');
    const pv = el && previewFromEl(el);
    if (pv) $('#gal-preview').innerHTML = previewHTML(pv.c);
  });

  $('#arena').addEventListener('click', onArenaClick);
  ['#field-me', '#field-op'].forEach((f) => $(f).addEventListener('click', onArenaClick));
  $('#hand').addEventListener('click', onHandClick);
  $('#btn-end').addEventListener('click', () => { if (canAct()) humanAct({ type: 'end' }); });
  $('#btn-menu').addEventListener('click', leaveToMenu);

  // предпросмотр при наведении (компьютер)
  $('#stage').addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-t], .hcard, [data-power], [data-hero]');
    if (!el || e.target.closest('#modal')) return;
    const pv = previewFromEl(el);
    if (!pv) return;
    if (el.closest('#gallery')) { $('#gal-preview').innerHTML = previewHTML(pv.c); return; }
    if (el.closest('#menu')) return;
    App.hovering = true;
    showPreview(pv.c, pv.live);
  });
  $('#stage').addEventListener('mouseout', (e) => {
    if (!e.target.closest('#game [data-t], #game .hcard, #game [data-power]')) return;
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-t], .hcard, [data-power]')) return;
    App.hovering = false;
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && App.sel) clearSel(); });
  document.addEventListener('contextmenu', (e) => { if (App.sel) { e.preventDefault(); clearSel(); } });
  window.addEventListener('resize', () => { if (App.s) FX.setZones([$('#field-op'), $('#field-me')]); });
}

document.addEventListener('DOMContentLoaded', init);
