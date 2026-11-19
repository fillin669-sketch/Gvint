'use strict';
/* =====================================================================
   ТРОН — интерфейс и игровой цикл
   ===================================================================== */

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const App = {
  s: null,
  myField: 'zags',
  mySoul: 'brave',
  myArtifact: 'mug',
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
  return '';
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
    <div class="hc-art">${artHTML(c)}</div>${c.rarity && c.rarity !== 'common' ? `<div class="gem g-${c.rarity} hc-gem"></div>` : ''}
    <div class="hc-cost ${cost < c.cost ? 'cheap' : ''}">${cost}</div>
    <div class="hc-name">${esc(c.name)}</div>
    <div class="hc-text">${esc(cardShortText(c))}</div>${stats}</div>`;
}

function minionHTML(s, m, o) {
  const cls = ['minion'];
  if (m.rarity === 'legendary' || m.rarity === 'epic' || m.rarity === 'rare') cls.push(m.rarity);
  ['taunt', 'shield', 'stealth'].forEach((k) => { if (hasKw(m, k)) cls.push(k); });
  if (m.frozen) cls.push('frozen');
  if (o.extra) cls.push(o.extra);
  const atk = getAtk(s, m);
  const icons = [];
  ['untouchable', 'pierce', 'poison', 'windfury', 'lifesteal', 'flying', 'charge'].forEach((k) => { if (hasKw(m, k)) icons.push(KEYWORDS[k].icon); });
  if (m.dr) icons.push('⚰️');
  if (m.end) icons.push('🌙');
  if (m.aura) icons.push('✴️');
  if (m.enrage) icons.push('💢');
  if (m.spellDiscount) icons.push('🏷️');
  if (m.cantAttack) icons.push('⛔');
  if (m.female) icons.push('♀');
  const status = [m.spouse ? '💍' : '', m.preg ? '🤰' : '', m.debt ? '📜' : '', m.mark ? '🎯' : ''].join('');
  const sleepy = m.owner === s.current && m.sleeping && !m.cantAttack && s.phase === 'play';
  const def = defOf(m.id);
  const baseAtk = def ? def.atk : m.atk;
  return `<div class="${cls.join(' ')}" data-t="${m.uid}" ${o.style ? `style="${o.style}"` : ''}>
    <div class="m-shadow"></div>${m.rarity === 'legendary' ? '<div class="m-crown">👑</div>' : ''}
    <div class="m-frame"><div class="m-art">${artHTML(m)}</div></div>${m.rarity && m.rarity !== 'common' ? `<div class="gem g-${m.rarity} m-gem"></div>` : ''}
    <div class="m-icons">${icons.slice(0, 4).map((x) => `<span>${x}</span>`).join('')}</div>
    ${status ? `<div class="m-status">${status}</div>` : ''}
    ${sleepy ? '<div class="m-zz">💤</div>' : ''}
    <div class="m-atk ${atk > baseAtk ? 'up' : atk < baseAtk ? 'down' : ''}">${atk}</div>
    <div class="m-hp ${m.hp < m.maxHp ? 'hurt' : m.maxHp > (def ? def.hp : m.maxHp) ? 'up' : ''}">${m.hp}</div></div>`;
}

const HERO_IMG = ARTPATH('img/icon.png');
const heroName = (i) => (i === 0 ? 'Вы' : 'Противник');
const heroInfo = (i) => ({ isHero: true, idx: i });

function heroHTML(s, i, extra) {
  const P = s.players[i];
  const so = SOULS[P.soul];
  return `<div class="hero side${i} ${extra || ''}" data-t="h${i}" style="--soul:${so.color}">
    <div class="h-art"><img src="${esc(HERO_IMG)}" alt="" style="filter:hue-rotate(${so.hue}deg)"></div>
    <div class="h-soul" title="${esc(so.name)}">${so.icon}</div>
    ${P.armor ? `<div class="h-armor">${P.armor}</div>` : ''}
    <div class="h-hp ${P.hp < P.maxHp ? 'hurt' : ''}">${P.hp}</div>
    ${P.mark ? `<div class="h-mark" title="На прицеле: ${P.mark.n} урона ещё ${P.mark.turns} хода">🎯${P.mark.turns}</div>` : ''}
    <div class="h-name">${heroName(i)}</div></div>`;
}

function powerHTML(s, i, extra) {
  const P = s.players[i];
  const pw = powerOf(s, i);
  const cls = ['power'];
  if (P.powerUsed) cls.push('used');
  else if (i === 0 && canAct() && canPower(s, 0)) cls.push('ready');
  if (extra) cls.push(extra);
  return `<div class="${cls.join(' ')}" data-power="${i}" title="${esc(pw.name)}"><div class="pw-cost">${pw.cost}</div>${pw.icon}</div>`;
}

/* ---------------------- превью ---------------------- */
function heroText(i) {
  const s = App.s;
  const P = s.players[i];
  const so = SOULS[P.soul], pw = so.power, ar = ARTIFACTS[P.artifact];
  return { name: i === 0 ? 'Вы — Претендент на Трон' : 'Противник — Претендент на Трон',
    meta: `Герой · ${P.hp}/${P.maxHp} здоровья${P.armor ? ' · ' + P.armor + ' брони' : ''} · 🪙 ${P.gold} золота`,
    parts: [
      [`${so.icon} Натура «${so.name}»`, so.passive],
      [`${pw.icon} Сила «${pw.name}» (${pw.cost} маны)`, pw.desc + ' Раз в ход.'],
      ar ? [`${ar.icon} Артефакт «${ar.name}»`, ar.desc] : null,
    ].filter(Boolean) };
}

function previewHTML(c, live) {
  if (!c) {
    return `<div class="pv-empty">Нажмите на карту или существо,<br>чтобы рассмотреть его.<br><br>
      Карта в руке → место на поле или цель.<br>Своё существо → кого атаковать.<br><br>🔍 Долгое нажатие на карту —<br>крупный просмотр.</div>`;
  }
  if (c.isHero) {
    const h = heroText(c.idx);
    return `<img class="pv-img" src="${esc(HERO_IMG)}" alt="" style="filter:hue-rotate(${SOULS[App.s.players[c.idx].soul].hue}deg)"><h3>${esc(h.name)}</h3>
      <div class="pv-meta">${esc(h.meta)}</div>${h.parts.map(([n, t]) => `<div class="pv-ab"><b>${n}.</b> ${esc(t)}</div>`).join('')}`;
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
    if (live.mark) parts.push(`<div class="pv-ab"><b>🎯 На прицеле.</b> Получает ${live.mark.n} урона в начале каждого хода ${live.mark.by === 0 ? 'вашего' : 'противника'}.</div>`);
    if (live.debt) parts.push(`<div class="pv-ab"><b>📜 Долг.</b> Теряет ${live.debt} атаки в начале каждого своего хода.</div>`);
    if (live.silenced) parts.push('<div class="pv-ab"><b>🤐 Без свойств.</b></div>');
  }
  const meta = `${c.type === 'minion' ? 'Существо' : 'Заклинание'}${c.token ? ' · призванное' : ''} · ${RARITY_NAMES[c.rarity || 'common']}<br>${clsName(c)}`;
  return `${img}<h3>${esc(c.name)}</h3><div class="pv-meta">${meta}</div>${stats}${parts.join('') || '<div class="pv-ab">Без особых свойств.</div>'}
    ${c.quote ? `<div class="pv-quote">${esc(c.quote)}</div>` : ''}`;
}

function showPreview(c, live) {
  const el = $('#preview');
  App.pv = c ? { c, live } : null;
  if (el) el.innerHTML = previewHTML(c, live) + (c ? '<div class="pv-zoomhint">🔍 Нажмите сюда, чтобы увеличить</div>' : '');
}

/* ---------------------- крупный просмотр ---------------------- */
function openZoom(c, live) {
  if (!c) return;
  closeZoom();
  const z = document.createElement('div');
  z.id = 'zoom';
  let left, body;
  if (c.isHero) {
    const h = heroText(c.idx);
    left = `<img class="z-img" src="${esc(HERO_IMG)}" alt="" style="filter:hue-rotate(${SOULS[App.s.players[c.idx].soul].hue}deg)">`;
    body = `<h2>${esc(h.name)}</h2><div class="z-meta">${esc(h.meta)}</div>${h.parts.map(([n, t]) => `<div class="z-ab"><b>${n}.</b> ${esc(t)}</div>`).join('')}`;
  } else {
    const src = artOf(c, true);
    left = src ? `<img class="z-img" src="${esc(src)}" alt="">` : `<div class="z-glyph">${c.icon || '✦'}</div>`;
    const atk = live ? getAtk(App.s, live) : c.atk;
    const hp = live ? live.hp : c.hp;
    const stats = `<div class="z-stats"><span style="color:#9fd0ff">💎 ${c.cost}</span>${c.type === 'minion' ? `<span style="color:var(--atk)">⚔ ${atk}</span><span style="color:#ff8a7a">❤ ${hp}</span>` : ''}</div>`;
    const parts = cardTextParts(c).map((p) => `<div class="z-ab"><b>${p.name}.</b> ${esc(p.text)}</div>`).join('');
    body = `<h2>${esc(c.name)}</h2><div class="z-meta">${c.type === 'minion' ? 'Существо' : 'Заклинание'} · ${RARITY_NAMES[c.rarity || 'common']}</div>
      ${stats}${parts || '<div class="z-ab">Без особых свойств.</div>'}${c.quote ? `<div class="z-quote">${esc(c.quote)}</div>` : ''}`;
  }
  z.innerHTML = `${left}<div class="z-text">${body}<div class="z-close">Нажмите в любом месте, чтобы закрыть</div></div>`;
  z.addEventListener('click', (e) => { e.stopPropagation(); closeZoom(); });
  $('#stage').appendChild(z);
  Tut.event('zoom');
}
function closeZoom() { const z = $('#zoom'); if (z) z.remove(); }

/** Долгое нажатие (или правая кнопка мыши) на карте открывает крупный просмотр */
function setupLongPress() {
  let timer = null, startX = 0, startY = 0, fired = false;
  const cardEl = (t) => t.closest && t.closest('[data-t], .hcard, [data-power]');
  const zoomFrom = (el) => {
    const pv = previewFromEl(el);
    if (pv) openZoom(pv.c, pv.live);
  };
  const stage = $('#stage');
  stage.addEventListener('pointerdown', (e) => {
    fired = false;
    const el = cardEl(e.target);
    if (!el || e.target.closest('#zoom')) return;
    startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => { fired = true; timer = null; zoomFrom(el); }, 450);
  });
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  stage.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 12) cancel(); });
  stage.addEventListener('pointerup', cancel);
  stage.addEventListener('pointercancel', cancel);
  // клик после долгого нажатия не должен выбирать карту
  document.addEventListener('click', (e) => { if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
  stage.addEventListener('contextmenu', (e) => {
    const el = cardEl(e.target);
    if (el) { e.preventDefault(); e.stopPropagation(); zoomFrom(el); }
  }, true);
}

function previewFromEl(el) {
  const s = App.s;
  if (el.dataset.t != null && s) {
    const id = el.dataset.t[0] === 'h' ? el.dataset.t : +el.dataset.t;
    const ch = findChar(s, id);
    if (!ch) return null;
    if (ch.kind === 'hero') return { c: heroInfo(ch.p.idx) };
    return { c: ch.m, live: ch.m };
  }
  if (el.dataset.h && s) {
    const c = s.players[0].hand.find((x) => x.uid === +el.dataset.h);
    return c ? { c } : null;
  }
  if (el.dataset.power != null && s) return { c: heroInfo(+el.dataset.power) };
  if (el.dataset.gid) return { c: defOf(el.dataset.gid) };
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
    hint = 'Выберите цель силы героя';
  } else if (sel.kind === 'minion') {
    const m = s.players[0].board.find((x) => x.uid === sel.uid);
    if (m && canAttack(s, m)) attackTargets(s, m).forEach((x) => out.add(x)); else App.sel = null;
    hint = 'Кого атаковать?';
  }
  return { out, hint, lane };
}

function hasMoves(s) {
  if (!canAct()) return false;
  if (canPower(s, 0) || canShop(s, 0)) return true;
  if (s.players[0].hand.some((c) => canPlay(s, 0, c))) return true;
  return s.players[0].board.some((m) => canAttack(s, m));
}

/* ---------------------- окружение ---------------------- */
function makeProps(s) {
  return [0, 1].map((side) => FIELD_PROPS[s.players[side].field].map(([icon, name]) => ({ icon, name, hp: PROP_HP })));
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
    const F = s.players[i].field;
    const el = $(sel);
    el.className = 'field field-' + F;
    el.dataset.emblem = FIELDS[F].icon;
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
  const mid = (n - 1) / 2;
  handEl.innerHTML = me.hand.map((c, i) => {
    newHand.add(c.uid);
    const off = i - mid;
    const fan = `--r:${(off * Math.min(3.5, 22 / Math.max(1, n))).toFixed(1)}deg;--y:${(off * off * 0.9 - 8).toFixed(1)}px;`;
    const extra = [];
    if (canAct() && canPlay(s, 0, c)) extra.push('playable');
    if (App.sel && App.sel.uid === c.uid && (App.sel.kind === 'card' || App.sel.kind === 'bc')) extra.push('sel');
    let style = '';
    if (!App.handSeen.has(c.uid)) { extra.push('drawn'); style = `animation-delay:${Math.min(drawnN++, 6) * 90}ms`; }
    return hcardHTML(c, { cost: costOf(s, 0, c), cls: extra.join(' '), style: fan + style });
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
  const soulTag = (P) => `<span class="i-soul" style="color:${SOULS[P.soul].color}">${SOULS[P.soul].icon} ${SOULS[P.soul].name}</span>${P.artifact ? ' ' + ARTIFACTS[P.artifact].icon : ''}`;
  $('#op-info').innerHTML = `<div class="i-row">${soulTag(op)}<span class="i-gold">🪙 ${op.gold}</span></div><div class="i-row"><span class="i-name">Противник</span><span class="mana-num">💎 ${op.mana}/${op.maxMana}</span></div>
    <div class="crystals">${crystals(op)}</div>
    <div class="i-row"><span>🂠 Рука: ${opN}</span><span>📚 Колода: ${op.deck.length}</span></div>`;
  $('#me-info').innerHTML = `<div class="i-row">${soulTag(me)}<span class="i-gold">🪙 ${me.gold}</span></div><div class="i-row"><span class="i-name">Вы</span><span class="mana-num">💎 ${me.mana}/${me.maxMana}</span></div>
    <div class="crystals">${crystals(me)}</div>
    <div class="i-row"><span>📚 Колода: ${me.deck.length}</span>${me.fatigue ? `<span>😵 Усталость ${me.fatigue}</span>` : ''}</div>`;

  const shopBtn = $('#btn-shop');
  shopBtn.innerHTML = `🛒 Лавка: карта за ${shopCost(me)} 🪙${me.shopUsed ? ' (куплено)' : ''}`;
  shopBtn.disabled = !(canAct() && canShop(s, 0));
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
  Tut.decorate();
}

/* ---------------------- эффекты по редкости ---------------------- */
const RARITY_VFX = {
  legendary: { color: '#ffd36b', burst: 'gold' },
  epic:      { color: '#b16cff', burst: 'arcane' },
  rare:      { color: '#5aa0f0', burst: 'blue' },
};
// «фирменные» частицы легенд
const SIGNATURE = {
  gigaslav: '☀️', gigaslav_pro: '👼', dragon_ass: '🔥', gus: '🪶', enot: '❄️', bard: '🎵', govnomet: '💩', shaman: '💩',
  kreditor: '🪙', baba_snaryad: '🍺', mantikora: '🚕', wife: '💍', realtor: '🏠', cheetah: '🍼', granny: '⏳',
  magnat: '💶', boroda: '🧔', pisyunchik_zol: '🐾', ohotniki: '🦌', bolno: '🪓', tescha: '👵', batya: '🩳',
  gibel: '💀', kaka: '🔥', spid: '☣️', srachka: '💩', yager: '🦌', tobi: '🔥', mihail: '🐍', pisyunchik_zametil: '🐾',
};
const sigOf = (c) => SIGNATURE[c.id] || c.icon || '✨';
const rarityOf = (id) => {
  const ch = App.s && findChar(App.s, id);
  return ch && ch.kind === 'minion' ? ch.m : null;
};

/** Розыгрыш карты: заставка для легенд, руны для эпиков, искры для редких */
function playRarityFx(e, sounds) {
  const c = defOf(e.id);
  if (!c || c.token) return;
  const V = RARITY_VFX[c.rarity];
  if (!V) return;
  const el = e.ctype === 'minion' ? elOf(e.uid) : elOf('h' + e.pIdx);
  const r = el ? FX.toStage(el) : null;
  if (c.rarity === 'legendary') {
    FX.legendIntro(c, artOf(c, true));
    sounds.add('legend');
    setTimeout(() => {
      if (r) { FX.ring(r, V.color); FX.burstRect(r, 'gold', 50); FX.burstRect(r, 'emoji', 10, { ch: sigOf(c) }); }
      FX.quake();
    }, 1100);
  } else if (c.rarity === 'epic') {
    sounds.add('epic');
    if (r) { FX.runeCircle(r, V.color); FX.burstRect(r, 'arcane', 36); }
  } else if (r) {
    FX.burstRect(r, 'blue', 22);
  }
}

/** Получение урона: барьер цвета редкости */
function defendRarityFx(m, r, sounds) {
  const V = m && RARITY_VFX[m.rarity];
  if (!V || !r) return;
  FX.barrier(r, V.color);
  FX.burstRect(r, V.burst, m.rarity === 'legendary' ? 24 : 14);
  if (m.rarity === 'legendary') sounds.add('ringHit');
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
        sounds.add(e.ctype === 'minion' ? 'place' : 'special');
        if (e.storm) { FX.storm(e.storm, 3600); sounds.add(STORM_SOUND[e.storm]); }
        playRarityFx(e, sounds);
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
        if (typeof e.id === 'number' && e.n > 0) defendRarityFx(rarityOf(e.id), r, sounds);
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
      case 'dodge': { const r = rectOf(e.id); if (r) { FX.float('💨 мимо!', r, 'icon'); } sounds.add('attack'); break; }
      case 'gold': { const r = rectOf('h' + e.pIdx); if (r) FX.float('🪙+' + e.n, r, 'up'); sounds.add('mana'); break; }
      case 'shop': sounds.add('draw'); break;
      case 'mark': { const r = rectOf(e.id); if (r) { FX.float('🎯', r, 'icon'); FX.ring(r, '#ff4b3a'); } sounds.add('debuff'); break; }
      case 'saved': { const r = rectOf(e.id); if (r) { FX.float('🐏 Упрямство!', r, 'up'); FX.burstRect(r, 'spark', 40); } sounds.add('clear'); break; }
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
  const m = rarityOf(uid);
  const V = m && RARITY_VFX[m.rarity];
  if (V) {
    FX.trail(ra, { x: rt.x + (rt.w - ra.w) / 2, y: rt.y + (rt.h - ra.h) / 2 }, V.color, m.rarity === 'legendary' ? 8 : m.rarity === 'epic' ? 6 : 3);
    setTimeout(() => {
      FX.ring(rt, V.color);
      if (m.rarity === 'legendary') { FX.burstRect(rt, 'emoji', 6, { ch: sigOf(m) }); FX.burstRect(rt, 'gold', 30); Sound.play('ringHit'); }
      else if (m.rarity === 'epic') FX.burstRect(rt, 'arcane', 24);
    }, 280);
  }
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
      const a = (Tut.active && Tut.aiAction(s)) || await AI.choose(s, 1);
      if (s !== App.s) return;
      await doAction(a);
      if (a.type === 'end') break;
    }
  } finally {
    App.looping = false;
    Tut.decorate();
  }
  if (s !== App.s) return;
  if (s.phase === 'over') { gameOver(); return; }
  if (s.current === 0) { Sound.play('turn'); banner('Ваш ход', '', 900); }
}

async function humanAct(a) {
  if (!canAct()) return;
  if (Tut.active && !Tut.allow(a)) { Tut.nudge(); App.sel = null; render(); return; }
  await doAction(a);
  const s = App.s;
  if (!s) return;
  if (Tut.active) Tut.after(a);
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
function resetView(s) {
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
}

async function startGame() {
  Tut.stop();
  const opp = pickRandom(Object.keys(FIELDS).filter((k) => k !== App.myField));
  const first = rnd(2);
  const s = createGame({ field: App.myField, soul: App.mySoul, artifact: App.myArtifact },
    { field: opp, soul: pickRandom(Object.keys(SOULS)), artifact: pickRandom(Object.keys(ARTIFACTS)) }, App.extra, first);
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
  Sound.setLocation(App.myField);
  show('game');
  addLog(`Битва за Трон. Поле: ${FIELDS[App.myField].name}`);
  render();
  FX.setZones([$('#field-op'), $('#field-me')]);
  FX.setAmbient(true);
  watchFps();
  showPreview(null);
  await banner('Битва за Трон', `Поле: ${FIELDS[App.myField].name}`, 1600);
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
  if (Tut.active) { Tut.finish(s.winner); return; }
  const loser = s.winner == null ? null : 1 - s.winner;
  if (loser != null) {
    const el = elOf('h' + loser);
    if (el) { FX.ghost(el.outerHTML, FX.toStage(el)); el.style.visibility = 'hidden'; }
    FX.quake();
  }
  Sound.play(s.winner === 0 ? 'win' : 'lose');
  const title = s.winner === 0 ? '🏆 Победа!' : s.winner === 1 ? 'Поражение' : 'Ничья';
  setTimeout(() => {
    if (s !== App.s) return;
    modal(`<h2>${title}</h2><img class="result-hero ${s.winner === 1 ? 'side1' : ''}" src="${esc(HERO_IMG)}" alt="">
      <p>${s.winner === 0 ? 'Трон ваш.' : s.winner === 1 ? 'Трон достаётся противнику.' : 'Оба претендента пали.'} Ходов сыграно: ${s.turn}.</p>
      <div class="mbtns"><button class="btn btn-gold" data-v="again">Ещё партию</button><button class="btn" data-v="menu">В меню</button></div>`)
      .then((v) => { if (v === 'again') startGame(); else goMenu(); });
  }, 1100);
}

function goMenu() {
  Tut.stop();
  App.s = null;
  FX.setAmbient(false);
  FX.clearAll();
  $('#banner').classList.add('hidden');
  Sound.setLocation('tavern');
  show('menu');
}

async function leaveToMenu() {
  if (await confirmModal('Выйти в меню?', 'Текущая партия будет потеряна.', 'Выйти')) goMenu();
}

/* ---------------------- меню ---------------------- */
function fieldTileHTML(k, sel) {
  const F = FIELDS[k];
  return `<div class="hero-tile field-tile field-${k} ${sel ? 'sel' : ''}" data-field="${k}">
    <div class="ft-icon">${F.icon}</div><div class="ht-body"><h4>${esc(F.name)}</h4><p>${esc(F.desc)}</p></div></div>`;
}

function renderMenu() {
  $('#hero-list').innerHTML = Object.keys(FIELDS).map((k) => fieldTileHTML(k, App.myField === k)).join('');
  $('#soul-list').innerHTML = Object.keys(SOULS).map((k) => {
    const so = SOULS[k];
    return `<div class="chip ${App.mySoul === k ? 'sel' : ''}" data-soul="${k}" style="--c:${so.color}">
      <div class="c-top">${so.icon} <b>${so.name}</b> · ${so.power.icon} ${so.power.name} (${so.power.cost})</div>
      <div class="c-sub">${esc(so.power.desc)} ${esc(so.passive)}</div></div>`;
  }).join('');
  $('#artifact-list').innerHTML = Object.keys(ARTIFACTS).map((k) => {
    const ar = ARTIFACTS[k];
    return `<div class="chip art ${App.myArtifact === k ? 'sel' : ''}" data-artifact="${k}">
      <div class="c-top">${ar.icon} <b>${ar.name}</b></div><div class="c-sub">${esc(ar.desc)}</div></div>`;
  }).join('');
}

function showRules() {
  const kws = Object.values(KEYWORDS).map((k) => `<li><b>${k.icon} ${k.name}</b> — ${k.desc}</li>`).join('');
  modal(`<h2>Правила</h2>
    <h3>Цель</h3><p>Опустите здоровье вражеского претендента на трон с ${HERO_HP} до нуля.</p>
    <h3>Ход</h3><ul>
      <li>Каждый ход вы получаете +1 кристалл маны (максимум 10) и берёте карту. Мана полностью восстанавливается в начале хода.</li>
      <li>Карты стоят ману (синий кристалл в углу карты). Существа выходят на поле, заклинания срабатывают сразу.</li>
      <li>Существа атакуют со следующего хода (кроме тех, у кого Рывок). Каждое — один раз за ход.</li>
      <li>При атаке существа наносят урон друг другу одновременно. Вражеского героя можно бить напрямую, если нет Провокации.</li>
      <li>Сложность противника выбирается в меню: Лёгкий, Средний или Сложный.</li>
      <li>Натура героя даёт силу (круглая кнопка, раз в ход) и постоянный бонус. Артефакт — стартовый бонус.</li>
      <li>🪙 Золото даётся за каждое убитое вражеское существо. В Лавке за ${SHOP_COST} золота можно раз в ход купить карту.</li>
      <li>Кто ходит вторым, получает «Медяк» — +1 мана на один ход. Кто ходит первым, не берёт карту в свой первый ход.</li>
      <li>На поле не больше 7 существ, в руке не больше 10 карт. Пустая колода — урон «усталостью».</li>
    </ul>
    <h3>Ключевые слова</h3><ul>${kws}
      <li><b>📣 Боевой клич</b> — срабатывает, когда карта разыграна из руки.</li>
      <li><b>⚰️ Предсмертный хрип</b> — срабатывает, когда существо погибает.</li>
      <li><b>💫 Оглушение</b> — существо пропускает свою ближайшую атаку.</li>
      <li><b>💍 Брак</b> — супруги слабеют, а смерть одного наносит 2 урона другому.</li>
      <li><b>🤰 Беременность</b> — −2 атаки; через 2 хода «Ребёнок» 2/2 достаётся тому, кто это устроил.</li>
      <li><b>📜 Долг</b> — существо теряет атаку в начале каждого своего хода.</li>
      <li><b>🗡️ Добивание</b> — срабатывает, когда существо убивает врага в атаке.</li>
    </ul>
    <h3>Управление</h3><p><b>🔍 Долгое нажатие на любую карту</b> (или правая кнопка мыши) открывает её крупно — с оригинальной картинкой и описанием. Нажмите карту в руке, затем место на поле или подсвеченную цель. Нажмите своё существо с зелёной рамкой, затем врага. Предметы по краям поля можно ломать — просто нажимайте на них.</p>
    <h3>Авторы</h3><p>Музыка сочиняется игрой на ходу. Записи инструментов: FluidR3_GM SoundFont (Frank Wen),
      лицензия Creative Commons Attribution 3.0, через проект midi-js-soundfonts (Benjamin Gleitzman). Шрифт Philosopher — SIL Open Font License.</p>
    <div class="mbtns"><button class="btn btn-gold" data-v="ok">Понятно</button></div>`, null, 'rules');
}

/* ---------------------- коллекция ---------------------- */
function renderGallery() {
  const tabs = [['shared', 'Ваши карты'], ['extra', 'Без картинок']];
  $('#gal-tabs').innerHTML = tabs.map(([k, n]) => `<button class="btn ${App.galTab === k ? 'sel' : ''}" data-tab="${k}">${esc(n)}</button>`).join('');
  {
    const defs = App.galTab === 'extra' ? EXTRA_CARDS : SHARED_CARDS;
    $('#gal-grid').innerHTML = defs.slice().sort((a, b) => a.cost - b.cost).map((d) =>
      `<div class="gcard">${hcardHTML(d)}<div class="gid">${esc(d.id)}${d.count > 1 && d.rarity !== 'legendary' ? ' ×' + d.count : ''}</div></div>`).join('');
  }
  $('#gal-preview').innerHTML = '<div class="pv-empty">Нажмите на карту, чтобы рассмотреть её.<br><br>Под каждой картой — её id (имя файла картинки).</div>';
}

/* ---------------------- качество графики ---------------------- */
function detectQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  return mem <= 2 || cores <= 4 ? 'low' : 'high';
}

function gfxSetting() {
  try { return localStorage.getItem('tron-gfx') || 'auto'; } catch (e) { return 'auto'; }
}

function applyQuality(q) {
  App.quality = q;
  document.body.classList.toggle('lowfx', q === 'low');
  FX.setQuality(q);
  Sound.setLowQuality(q === 'low');
}

/** Замер плавности в начале партии: если телефон не тянет — экономный режим */
function watchFps() {
  if (gfxSetting() !== 'auto' || App.quality === 'low') return;
  let frames = 0;
  const t0 = performance.now();
  const step = (t) => {
    frames++;
    if (t - t0 < 5000) { requestAnimationFrame(step); return; }
    const fps = frames * 1000 / (t - t0);
    if (fps < 38 && App.quality !== 'low') {
      applyQuality('low');
      addLog(`⚙️ Графика переключена на экономную (было ${Math.round(fps)} кадров/с)`);
    }
  };
  requestAnimationFrame(step);
}

/** Текстуры рисуются один раз при запуске и дальше ничего не стоят */
function makeTextures() {
  const mk = (w, h, draw, type) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL(type || 'image/png', 0.82); };
  const wood = mk(512, 256, (g, w, h) => {
    g.fillStyle = '#2e1c0f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const y = Math.random() * h, amp = 2 + Math.random() * 6, f = 0.004 + Math.random() * 0.01, ph = Math.random() * 6;
      g.strokeStyle = Math.random() < 0.5 ? `rgba(0,0,0,${0.08 + Math.random() * 0.18})` : `rgba(140,90,45,${0.05 + Math.random() * 0.12})`;
      g.lineWidth = 0.6 + Math.random() * 1.8;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * f + ph) * amp);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {   // сучки
      const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 10;
      const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(10,5,2,.7)'); gr.addColorStop(1, 'rgba(10,5,2,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 1.8, r, 0, 0, Math.PI * 2); g.fill();
    }
  }, 'image/jpeg');
  const noise = mk(128, 128, (g, w, h) => {
    const d = g.createImageData(w, h);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 40 + Math.random() * 40; }
    g.putImageData(d, 0, 0);
  });
  const root = document.documentElement.style;
  root.setProperty('--tex-wood', `url(${wood})`);
  root.setProperty('--tex-noise', `url(${noise})`);
  document.body.classList.add('tex');
}

/* ---------------------- версия и обновления ---------------------- */
const GAME_VERSION = '3.7';
const SITE_URL = 'https://raw.githubusercontent.com/fillin669-sketch/Gvint/ccr-ed511808-3mdvrp/';
const CHANGELOG = [
  'Новые карты: «Хтоя?» — неуязвим, пока не атакует; «Пространственный путник» — бьёт дважды кого угодно, пробивая любую защиту; «Взгляд убийцы» — цель каждый ход получает 2 урона',
];

function showVersionBadge() {
  const p = new URLSearchParams(location.search);
  const el = $('#version-badge');
  if (!el) return;
  if (p.get('apk')) el.textContent = `Версия ${GAME_VERSION} · обновляется сама при запуске${p.get('updated') ? ' · только что обновлена' : ''}`;
  else el.textContent = `Версия ${GAME_VERSION}`;
}

async function checkUpdates() {
  const params = new URLSearchParams(location.search);
  const apk = +params.get('apk') || 0;
  let seen = null;
  try { seen = localStorage.getItem('tron-seen-version'); } catch (e) { /* ignore */ }
  if (seen && seen !== GAME_VERSION) {
    modal(`<h2>Что нового в версии ${GAME_VERSION}</h2><ul class="news">${CHANGELOG.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <div class="mbtns"><button class="btn btn-gold" data-v="ok">Отлично</button></div>`);
  }
  try { localStorage.setItem('tron-seen-version', GAME_VERSION); } catch (e) { /* ignore */ }
  if (!apk) return;   // открыто в браузере, а не в приложении
  try {
    const r = await fetch(SITE_URL + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = await r.json();
    if (v.apk > apk) {
      await sleep(1200);
      modal(`<h2>Вышла новая версия приложения</h2><p>Скачайте её и установите поверх — прогресс не пропадёт.</p>
        <ul class="news">${(v.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        <div class="mbtns"><a class="btn btn-gold" href="${esc(v.apkUrl)}">⬇ Скачать обновление</a><button class="btn" data-v="later">Позже</button></div>`);
    }
  } catch (e) { /* нет сети — ничего страшного */ }
}

/* ---------------------- инициализация ---------------------- */
function updateSoundBtns() {
  document.querySelectorAll('.btn-sound').forEach((b) => { b.textContent = Sound.isMuted() ? '🔇' : '🔊'; });
  document.querySelectorAll('.btn-music').forEach((b) => { b.textContent = '🎵'; b.style.opacity = Sound.isMusicOn() ? 1 : 0.4; b.title = Sound.isMusicOn() ? 'Музыка включена' : 'Музыка выключена'; });
}

function init() {
  fit();
  FX.init();
  probeArt();
  renderMenu();
  updateSoundBtns();
  showPreview(null);
  showVersionBadge();
  checkUpdates();
  makeTextures();
  const gfx = gfxSetting();
  applyQuality(gfx === 'auto' ? detectQuality() : gfx);
  $('#gfx-select').value = gfx;
  let ai = 'medium';
  try { ai = localStorage.getItem('tron-ai') || 'medium'; } catch (e) { /* ignore */ }
  AI.setLevel(ai);
  $('#ai-select').value = ai;
  $('#ai-select').addEventListener('change', (e) => {
    AI.setLevel(e.target.value);
    try { localStorage.setItem('tron-ai', e.target.value); } catch (er) { /* ignore */ }
  });
  $('#gfx-select').addEventListener('change', (e) => {
    try { localStorage.setItem('tron-gfx', e.target.value); } catch (er) { /* ignore */ }
    applyQuality(e.target.value === 'auto' ? detectQuality() : e.target.value);
  });

  document.addEventListener('pointerdown', () => Sound.init(), { capture: true });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-music')) return;
    e.stopPropagation();
    Sound.init();
    Sound.setMusic(!Sound.isMusicOn());
    updateSoundBtns();
  }, { capture: true });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-sound')) return;
    e.stopPropagation();
    Sound.init();
    Sound.setMuted(!Sound.isMuted());
    updateSoundBtns();
  }, { capture: true });

  $('#hero-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-field]');
    if (!t) return;
    App.myField = t.dataset.field;
    Sound.init();
    Sound.setLocation(App.myField);
    renderMenu();
  });
  $('#extra-toggle').addEventListener('change', (e) => { App.extra = e.target.checked; });
  $('#btn-start').addEventListener('click', async () => {
    let done = false;
    try { done = localStorage.getItem('tron-tut-done') === '1'; } catch (e) { /* нет хранилища */ }
    if (!done) {
      const v = await modal(`<h2>Первый раз в ТРОНе?</h2><p>Короткое обучение за 3 минуты покажет, как играть.</p>
        <div class="mbtns"><button class="btn btn-gold" data-v="tut">🎓 Пройти обучение</button><button class="btn" data-v="skip">Сразу в бой</button></div>`);
      try { localStorage.setItem('tron-tut-done', '1'); } catch (e) { /* ignore */ }
      if (v === 'tut') { Tut.start(); return; }
    }
    startGame();
  });
  $('#btn-tutorial').addEventListener('click', () => Tut.start());
  $('#btn-shop').addEventListener('click', () => { if (canAct()) humanAct({ type: 'shop' }); });
  $('#soul-list').addEventListener('click', (e) => { const t = e.target.closest('[data-soul]'); if (t) { App.mySoul = t.dataset.soul; renderMenu(); } });
  $('#artifact-list').addEventListener('click', (e) => { const t = e.target.closest('[data-artifact]'); if (t) { App.myArtifact = t.dataset.artifact; renderMenu(); } });
  $('#btn-rules').addEventListener('click', showRules);
  $('#btn-gallery').addEventListener('click', () => { show('gallery'); renderGallery(); });
  $('#btn-gal-back').addEventListener('click', () => show('menu'));
  $('#gal-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { App.galTab = t.dataset.tab; renderGallery(); }
  });
  $('#gal-grid').addEventListener('click', (e) => {
    const el = e.target.closest('.hcard');
    const pv = el && previewFromEl(el);
    if (pv) { App.galPv = pv.c; $('#gal-preview').innerHTML = previewHTML(pv.c) + '<div class="pv-zoomhint">🔍 Нажмите сюда, чтобы увеличить</div>'; }
  });

  $('#arena').addEventListener('click', onArenaClick);
  ['#field-me', '#field-op'].forEach((f) => $(f).addEventListener('click', onArenaClick));
  $('#hand').addEventListener('click', onHandClick);
  $('#btn-end').addEventListener('click', () => { if (canAct()) humanAct({ type: 'end' }); });
  $('#btn-menu').addEventListener('click', leaveToMenu);

  // предпросмотр при наведении (компьютер)
  $('#stage').addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-t], .hcard, [data-power]');
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

  setupLongPress();
  $('#preview').addEventListener('click', () => { if (App.pv) openZoom(App.pv.c, App.pv.live); });
  $('#gal-preview').addEventListener('click', () => { if (App.galPv) openZoom(App.galPv); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeZoom(); if (App.sel) clearSel(); } });
  document.addEventListener('contextmenu', (e) => { if (App.sel) { e.preventDefault(); clearSel(); } });
  window.addEventListener('resize', () => { if (App.s) FX.setZones([$('#field-op'), $('#field-me')]); });
}

document.addEventListener('DOMContentLoaded', init);
