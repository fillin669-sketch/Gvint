'use strict';
/* =====================================================================
   ИНТЕРФЕЙС И ИГРОВОЙ ЦИКЛ
   ===================================================================== */

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const App = {
  s: null,
  myFaction: 'iron',
  oppFaction: 'random',
  sel: null,          // выбранная карта в руке
  targets: [],        // допустимые цели для выбранной карты
  busy: false,
  looping: false,
  passArm: false,
  lastActor: null,
  seen: new Set(),
  logLines: [],
  galTab: 'shared',
  extra: true,        // добавлять в колоду новые карты без картинок
};

// Картинки для новых карт: показываем, только если файл реально есть
const ART_OK = new Set();
function probeArt() {
  EXTRA_CARDS.forEach((c) => {
    if (!c.optionalArt) return;
    const im = new Image();
    im.onload = () => { ART_OK.add(c.id); };
    im.src = c.thumb;
  });
}
const artOf = (c, full) => {
  if (c.optionalArt && !ART_OK.has(c.id.replace(/_token$/, ''))) return null;
  return full ? c.img : (c.thumb || c.img);
};

/* ---------------------- масштабирование ---------------------- */
function fit() {
  const k = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  $('#stage').style.transform = `translate(-50%, -50%) scale(${k})`;
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));

function show(id) {
  ['menu', 'game', 'gallery'].forEach((x) => $('#' + x).classList.toggle('hidden', x !== id));
}

/* ---------------------- карты: HTML ---------------------- */
function factionName(fk) {
  return fk === 'shared' ? 'Общая карта' : FACTIONS[fk] ? FACTIONS[fk].name : '';
}

function leaderCard(p) {
  return { id: p.leader.id, name: p.leader.name, icon: p.leader.icon, type: 'leader', faction: p.faction,
    desc: p.leader.desc, used: p.leader.used, abil: [], owner: p.idx };
}

function cardHTML(c, o) {
  o = o || {};
  const cls = ['card', 'f-' + (c.faction || 'shared'), 'r-' + (c.rarity || 'common')];
  if (isHero(c)) cls.push('hero');
  if (c.token) cls.push('token');
  if (o.cls) cls.push(o.cls);
  const src = artOf(c, o.full);
  const art = src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span class="glyph">${c.icon || '✦'}</span>`;
  let badge = '';
  let icons = '';
  if (c.type === 'unit') {
    const val = o.power != null ? o.power : c.power;
    const base = c.base != null ? c.base : c.power;
    const mod = val > base ? 'buff' : val < base ? 'nerf' : '';
    badge = `<div class="pw ${mod}">${val}</div>`;
    const ic = [ROW_ICONS[c.row]].concat(c.abil.filter((a) => a !== 'hero' && ABILITIES[a]).map((a) => ABILITIES[a].icon)).slice(0, 3);
    icons = `<div class="ic top">${ic.map((x) => `<span>${x}</span>`).join('')}</div>`;
  } else if (c.type === 'leader') {
    badge = `<div class="pw sp">👑</div>`;
  } else {
    badge = `<div class="pw sp">${c.icon || '✦'}</div>`;
  }
  let data = '';
  if (c.type === 'leader') data = `data-lid="${c.owner}"`;
  else if (c.uid) data = `data-uid="${c.uid}"`;
  else data = `data-gid="${esc(c.id)}"`;
  return `<div class="${cls.join(' ')}" ${data}><div class="art">${art}</div>${badge}${icons}<div class="nm">${esc(c.name)}</div></div>`;
}

function describeCard(c) {
  if (c.type === 'leader') return [{ name: 'Способность лидера', desc: c.desc + (c.used ? ' (уже использована)' : '') }];
  if (c.type === 'unit') {
    return c.abil.filter((a) => ABILITIES[a]).map((a) => {
      let d = ABILITIES[a].desc;
      if (a === 'shoot') d = `При розыгрыше наносит ${c.value} урона сильнейшему вражескому отряду.`;
      if (a === 'summon' && c.summon) d = `При розыгрыше призывает: ${c.summon.name} ×${c.summon.count} (сила ${c.summon.power}, ${ROW_NAMES[c.summon.row]}).`;
      return { name: `${ABILITIES[a].icon} ${ABILITIES[a].name}`, desc: d };
    });
  }
  const k = SPECIAL_KINDS[c.kind];
  const out = k ? [{ name: k.name + (c.free ? ' (не тратит ход)' : ''), desc: k.desc(c) }] : [];
  if (c.note) out.push({ name: 'Особо', desc: c.note });
  return out;
}

function previewHTML(c, power) {
  if (!c) {
    return `<div class="pv-empty">Наведите курсор или нажмите на карту,<br>чтобы рассмотреть её.<br><br>Выберите карту в руке, затем подсвеченный ряд или цель.</div>`;
  }
  const img = artOf(c, true) ? `<img class="pv-img" src="${esc(c.img)}" alt="">` : `<div class="pv-glyph f-${c.faction || 'shared'}">${c.icon || '✦'}</div>`;
  let meta;
  if (c.type === 'unit') {
    const base = c.base != null ? c.base : c.power;
    const pw = power != null && power !== base ? `${power} (базовая ${base})` : base;
    meta = `${ROW_ICONS[c.row]} ${ROW_NAMES[c.row]} · Сила ${pw}`;
    if (c.token) meta += ' · призванное существо';
  } else if (c.type === 'leader') {
    meta = `Лидер · ${factionName(c.faction)}`;
  } else {
    meta = 'Особая карта';
  }
  const rar = c.rarity && c.type !== 'leader' ? ` · ${RARITY_NAMES[c.rarity]}` : '';
  const fac = c.type !== 'leader' ? `<br>${factionName(c.faction)}` : '';
  const abs = describeCard(c).map((a) => `<div class="pv-ab"><b>${a.name}.</b> ${esc(a.desc)}</div>`).join('');
  const quote = c.quote ? `<div class="pv-quote">${esc(c.quote)}</div>` : '';
  return `${img}<h3>${esc(c.name)}</h3><div class="pv-meta">${meta}${rar}${fac}</div>${abs || '<div class="pv-ab">Без особых способностей.</div>'}${quote}`;
}

/* ---------------------- поиск карт ---------------------- */
function findAnywhere(uid) {
  const s = App.s;
  if (!s) return null;
  for (const p of s.players) {
    for (const zone of [p.hand, p.deck, p.grave]) {
      const c = zone.find((x) => x.uid === uid);
      if (c) return { card: c };
    }
    for (const r of ROWS) {
      const row = p.rows[r];
      const c = row.cards.find((x) => x.uid === uid);
      if (c) return { card: c, side: p.idx, row: r };
      for (const k of SLOT_KEYS) if (row[k] && row[k].uid === uid) return { card: row[k] };
    }
  }
  const w = s.weatherCards.find((x) => x.uid === uid);
  return w ? { card: w } : null;
}

function cardFromEl(el) {
  if (el.dataset.uid) {
    const f = findAnywhere(+el.dataset.uid);
    if (!f) return null;
    const power = f.side != null && f.card.type === 'unit' ? cardPower(App.s, f.side, f.row, f.card) : null;
    return { card: f.card, power };
  }
  if (el.dataset.lid != null && App.s) return { card: leaderCard(App.s.players[+el.dataset.lid]) };
  if (el.dataset.gid) {
    const def = allCardDefs().find((d) => d.id === el.dataset.gid) || galleryLeaders().find((d) => d.id === el.dataset.gid);
    return def ? { card: def } : null;
  }
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
  sim: false,
  log: addLog,
  choose(pIdx, cards, title, canSkip) {
    if (pIdx !== 0) return Promise.resolve(AI.pickBest(cards));
    render();
    return chooseCardModal(cards, title, canSkip);
  },
};

/* ---------------------- отрисовка ---------------------- */
function canAct() {
  const s = App.s;
  return !!s && s.phase === 'play' && s.current === 0 && !App.busy && !s.players[0].passed;
}

function overlapGap(n, avail, cw, gap) {
  if (n <= 1 || n * cw + (n - 1) * gap <= avail) return gap;
  return Math.floor((avail - cw) / (n - 1) - cw);
}

function render() {
  const s = App.s;
  if (!s) return;
  if (App.sel && !s.players[0].hand.includes(App.sel)) App.sel = null;
  App.targets = App.sel && canAct() ? legalTargets(s, 0, App.sel) : [];
  const tRows = new Set(App.targets.filter((t) => t.type === 'row').map((t) => t.side + ':' + t.row));
  const tUnits = new Map(App.targets.filter((t) => t.type === 'unit').map((t) => [t.uid, t]));
  const tGlobal = App.targets.some((t) => t.type === 'global');
  const newSeen = new Set();

  const rowHTML = (side, r) => {
    const row = s.players[side].rows[r];
    const n = row.cards.length;
    const gap = overlapGap(n, 846, 66, 4);
    const cards = row.cards.map((c) => {
      newSeen.add(c.uid);
      const extra = [];
      if (!App.seen.has(c.uid)) extra.push('fresh');
      if (tUnits.has(c.uid)) extra.push('target-unit', side === 0 ? 'mine' : '');
      return cardHTML(c, { power: cardPower(s, side, r, c), cls: 'sm ' + extra.join(' ') });
    }).join('');
    const slot = SLOT_KEYS.map((k) => row[k]).filter(Boolean);
    const slotHTML = slot.length ? slot.map((c) => cardHTML(c, { cls: 'sm' })).join('') : `<span class="slot-ic">${side === 0 ? '📯' : ''}</span>`;
    const cls = ['row', 'side' + side];
    if (s.weather[r]) cls.push('w-' + r);
    if (row.curse) cls.push('cursed');
    if (tGlobal || tRows.has(side + ':' + r)) cls.push('target');
    return `<div class="${cls.join(' ')}" data-side="${side}" data-row="${r}">
      <div class="rscore">${rowScore(s, side, r)}</div>
      <div class="rslot ${slot.length > 2 ? 'many' : slot.length > 1 ? 'two' : ''}">${slotHTML}</div>
      <div class="rcards" style="--gap:${gap}px">${cards}</div>
      <div class="rlabel">${ROW_ICONS[r]}</div><div class="wfx"></div></div>`;
  };

  $('#board').innerHTML =
    ['siege', 'ranged', 'melee'].map((r) => rowHTML(1, r)).join('') +
    '<div class="divider"></div>' +
    ['melee', 'ranged', 'siege'].map((r) => rowHTML(0, r)).join('');
  App.seen = newSeen;

  // рука
  const me = s.players[0];
  const order = { melee: 0, agile: 1, ranged: 2, siege: 3 };
  const hand = me.hand.slice().sort((a, b) => {
    if (a.type !== b.type) return a.type === 'unit' ? -1 : 1;
    if (a.type === 'unit') return (order[a.row] - order[b.row]) || (a.power - b.power);
    return a.name.localeCompare(b.name);
  });
  const hgap = overlapGap(hand.length, 976, 112, 8);
  const handEl = $('#hand');
  handEl.style.setProperty('--gap', hgap + 'px');
  handEl.classList.toggle('locked', !canAct());
  handEl.innerHTML = hand.length
    ? hand.map((c) => cardHTML(c, { cls: 'md' + (c === App.sel ? ' sel' : '') })).join('')
    : '<div class="hand-empty">Рука пуста</div>';

  // погода
  const wEl = $('#weather');
  wEl.innerHTML = s.weatherCards.map((c) => cardHTML(c, { cls: 'sm' })).join('');
  wEl.classList.toggle('target', tGlobal);

  // игроки
  for (const i of [0, 1]) {
    const p = s.players[i];
    const f = FACTIONS[p.faction];
    const tot = totalScore(s, i);
    const oth = totalScore(s, 1 - i);
    const can = i === 0 && canAct() && leaderAvailable(s, 0);
    const el = $('#pinfo' + i);
    el.classList.toggle('active', s.phase === 'play' && s.current === i);
    el.innerHTML = `
      <div class="pi-top"><div class="emblem f-${p.faction}">${f.emblem}</div>
        <div class="pi-name"><b>${p.name}</b><small>${f.name}</small></div></div>
      <div class="pi-mid">
        <div class="gems">${[0, 1].map((k) => `<span class="gem ${k < p.lives ? '' : 'lost'}"></span>`).join('')}</div>
        <div title="Карт в руке">🂠 ${p.hand.length}</div>
        ${p.passed ? '<div class="passed-tag">ПАС</div>' : ''}
      </div>
      <div class="pi-bot">
        <div class="leader-wrap ${can ? 'can' : ''}" data-leader="${i}">
          ${cardHTML(leaderCard(p), { cls: p.leader.used ? 'used' : '' })}
          <small>${p.leader.used ? 'Лидер использован' : i === 0 ? (can ? 'Нажмите, чтобы применить' : 'Лидер') : 'Лидер'}</small>
        </div>
        <div class="total ${tot > oth ? 'lead' : ''}">${tot}</div>
      </div>`;

    const top = p.grave[p.grave.length - 1];
    $('#piles' + i).innerHTML = `
      <div class="pile"><div class="cardback f-${p.faction}">${f.emblem}<b>${p.deck.length}</b></div>Колода</div>
      <div class="pile" data-grave="${i}">${top ? cardHTML(top, { cls: 'sm' }) : '<div class="empty"></div>'}Сброс (${p.grave.length})</div>`;
  }

  const passBtn = $('#btn-pass');
  passBtn.disabled = !canAct();
  passBtn.classList.toggle('ready', App.passArm);
  passBtn.textContent = App.passArm ? 'Точно пас?' : 'Пас';

  if (!App.hovering) $('#preview').innerHTML = previewHTML(App.sel);
}

/* ---------------------- баннер и модальные окна ---------------------- */
let bannerToken = 0;
function banner(text, sub, ms) {
  const el = $('#banner');
  const token = ++bannerToken;
  el.querySelector('.banner-text').textContent = text;
  el.querySelector('.banner-sub').textContent = sub || '';
  el.classList.remove('hidden');
  return new Promise((res) => {
    const done = () => {
      el.removeEventListener('click', done);
      if (token === bannerToken) el.classList.add('hidden');
      res();
    };
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

function chooseCardModal(cards, title, canSkip) {
  const html = `<h2>${esc(title)}</h2><div class="mcards">${cards.map((c) => cardHTML(c)).join('')}</div>
    ${canSkip ? '<div class="mbtns"><button class="btn" data-v="skip">Пропустить</button></div>' : ''}`;
  return modal(html, (e, close) => {
    const el = e.target.closest('.card[data-uid]');
    if (el) close(+el.dataset.uid);
  }).then((v) => (v === 'skip' || v == null ? null : cards.find((c) => c.uid === v) || null));
}

function confirmModal(title, text, yes, no) {
  return modal(`<h2>${esc(title)}</h2><p>${text}</p>
    <div class="mbtns"><button class="btn btn-gold" data-v="yes">${yes || 'Да'}</button><button class="btn" data-v="no">${no || 'Отмена'}</button></div>`)
    .then((v) => v === 'yes');
}

function mulliganModal() {
  const s = App.s;
  const P = s.players[0];
  let left = mulliganLimit(P);
  const m = $('#modal');
  return new Promise((res) => {
    const finish = () => { m.classList.add('hidden'); m.innerHTML = ''; m.onclick = null; res(); };
    const draw = () => {
      m.innerHTML = `<div class="mbox"><h2>Замена карт</h2>
        <p>Нажмите на карту, чтобы заменить её случайной картой из колоды. Осталось замен: <b>${left}</b></p>
        <div class="mcards">${P.hand.map((c) => cardHTML(c)).join('')}</div>
        <div class="mbtns"><button class="btn btn-gold" data-done="1">Готово</button></div></div>`;
    };
    draw();
    m.classList.remove('hidden');
    m.onclick = (e) => {
      if (e.target.closest('[data-done]')) { finish(); return; }
      const el = e.target.closest('.card[data-uid]');
      if (!el || left <= 0) return;
      if (mulliganCard(s, 0, +el.dataset.uid)) {
        left--;
        draw();
        if (left <= 0) setTimeout(finish, 900);
      }
    };
  });
}

/* ---------------------- действия игрока ---------------------- */
async function humanAct(action) {
  if (!canAct()) return;
  App.busy = true;
  App.sel = null;
  App.passArm = false;
  App.hovering = false;
  await performAction(App.s, 0, action, CTX);
  App.lastActor = 0;
  render();
  if (action.type === 'pass') await banner('Вы пасуете', '', 900);
  advanceTurn(App.s);
  App.busy = false;
  loop();
}

function selectCard(uid) {
  if (!canAct()) return;
  const c = App.s.players[0].hand.find((x) => x.uid === uid);
  App.sel = App.sel === c ? null : c;
  App.passArm = false;
  App.hovering = false;
  render();
}

function onGameClick(e) {
  const s = App.s;
  if (!s) return;

  if (e.target.closest('#btn-menu')) { leaveToMenu(); return; }

  const grave = e.target.closest('[data-grave]');
  if (grave) {
    const p = s.players[+grave.dataset.grave];
    const html = `<h2>Сброс: ${p.name}</h2>${p.grave.length ? `<div class="mcards">${p.grave.map((c) => cardHTML(c)).join('')}</div>` : '<p>Пусто</p>'}
      <div class="mbtns"><button class="btn" data-v="ok">Закрыть</button></div>`;
    modal(html);
    return;
  }

  if (e.target.closest('#btn-pass')) {
    if (!canAct()) return;
    if (!App.passArm && s.players[0].hand.length) {
      App.passArm = true;
      render();
      setTimeout(() => { if (App.passArm) { App.passArm = false; render(); } }, 3000);
      return;
    }
    humanAct({ type: 'pass' });
    return;
  }

  const leader = e.target.closest('[data-leader="0"]');
  if (leader) {
    if (!canAct() || !leaderAvailable(s, 0)) return;
    const L = s.players[0].leader;
    confirmModal(L.name, `${esc(L.desc)}<br><br>Применить способность лидера? (один раз за игру, тратит ход)`, 'Применить')
      .then((ok) => { if (ok) humanAct({ type: 'leader' }); });
    return;
  }

  const handCard = e.target.closest('#hand .card');
  if (handCard) { selectCard(+handCard.dataset.uid); return; }

  if (!App.sel) return;

  const unitEl = e.target.closest('.card.target-unit');
  if (unitEl) {
    const t = App.targets.find((x) => x.type === 'unit' && x.uid === +unitEl.dataset.uid);
    if (t) { humanAct({ type: 'card', uid: App.sel.uid, target: t }); return; }
  }

  const isGlobal = App.targets.some((t) => t.type === 'global');
  if (isGlobal && (e.target.closest('#weather') || e.target.closest('.row'))) {
    humanAct({ type: 'card', uid: App.sel.uid, target: { type: 'global' } });
    return;
  }

  const rowEl = e.target.closest('.row.target');
  if (rowEl) {
    const t = App.targets.find((x) => x.type === 'row' && x.side === +rowEl.dataset.side && x.row === rowEl.dataset.row);
    if (t) { humanAct({ type: 'card', uid: App.sel.uid, target: t }); return; }
  }

  // клик мимо — снимаем выбор
  if (!e.target.closest('#preview')) {
    App.sel = null;
    render();
  }
}

/* ---------------------- игровой цикл ---------------------- */
async function loop() {
  const s = App.s;
  if (!s || App.looping) return;
  App.looping = true;
  try {
    while (s === App.s && s.phase === 'play') {
      const [p0, p1] = s.players;
      if (p0.passed && p1.passed) { await finishRound(); continue; }
      const cur = s.players[s.current];
      if (cur.passed) { s.current = 1 - s.current; continue; }

      if (!cur.hand.length && !leaderAvailable(s, s.current)) {
        await performAction(s, s.current, { type: 'pass' }, CTX);
        render();
        await banner(cur.isAI ? 'Противник пасует' : 'Карт больше нет — пас', '', 1000);
        advanceTurn(s);
        continue;
      }

      if (cur.isAI) {
        App.busy = true;
        render();
        await sleep(700);
        const a = await AI.choose(s, s.current);
        if (s !== App.s) return;
        await performAction(s, s.current, a, CTX);
        App.lastActor = 1;
        render();
        if (a.type === 'pass') await banner('Противник пасует', '', 1000);
        else await sleep(450);
        advanceTurn(s);
        continue;
      }

      // ход человека — ждём ввода
      App.busy = false;
      render();
      if (App.lastActor === 1 && !s.players[1].passed) {
        App.lastActor = 0;
        banner('Ваш ход', '', 650);
      }
      return;
    }
    if (s === App.s && s.phase === 'over') showGameOver();
  } finally {
    App.looping = false;
  }
}

async function finishRound() {
  const s = App.s;
  App.busy = true;
  render();
  await sleep(500);
  const r = endRound(s, CTX);
  const roundNo = s.history[s.history.length - 1].round;
  const title = r.winner === 0 ? 'Раунд за вами!' : r.winner === 1 ? 'Раунд за противником' : 'Ничья';
  const sub = `${r.scores[0]} : ${r.scores[1]}${r.tieBreak ? ' — ничья в пользу Морских Кланов' : ''}`;
  addLog(`Итог раунда ${roundNo}: ${sub}`);
  App.seen = new Set();
  render();
  await banner(title, sub, 1900);
  if (s.phase === 'over') return;
  App.lastActor = null;
  await banner(`Раунд ${s.round}`, s.current === 0 ? 'Вы ходите первым' : 'Первым ходит противник', 1400);
}

function showGameOver() {
  const s = App.s;
  const title = s.winner === 0 ? '🏆 Победа!' : s.winner === 1 ? 'Поражение' : 'Ничья';
  const rows = s.history.map((h) => `<tr><td>Раунд ${h.round}</td>
    <td class="${h.winner === 0 ? 'w' : ''}">${h.scores[0]}</td><td class="${h.winner === 1 ? 'w' : ''}">${h.scores[1]}</td></tr>`).join('');
  modal(`<h2>${title}</h2>
    <table class="result-table"><tr><th></th><th>Вы</th><th>Противник</th></tr>${rows}</table>
    <div class="mbtns"><button class="btn btn-gold" data-v="again">Ещё партию</button><button class="btn" data-v="menu">В меню</button></div>`)
    .then((v) => { if (v === 'again') startGame(); else { App.s = null; show('menu'); } });
}

async function leaveToMenu() {
  const ok = await confirmModal('Выйти в меню?', 'Текущая партия будет потеряна.', 'Выйти');
  if (!ok) return;
  App.s = null;
  $('#banner').classList.add('hidden');
  show('menu');
}

async function startGame() {
  const keys = Object.keys(FACTIONS);
  const opp = App.oppFaction === 'random' ? pickRandom(keys.filter((k) => k !== App.myFaction)) : App.oppFaction;
  const s = createGame(App.myFaction, opp, App.extra);
  App.s = s;
  App.sel = null;
  App.seen = new Set();
  App.logLines = [];
  App.lastActor = null;
  App.busy = true;
  App.passArm = false;
  show('game');
  addLog(`Партия: ${FACTIONS[App.myFaction].name} против ${FACTIONS[opp].name}`);
  render();

  AI.mulligan(s, 1);
  await mulliganModal();
  if (s !== App.s) return;

  let first;
  const forest = [0, 1].filter((i) => s.players[i].faction === 'forest');
  if (forest.length === 1 && forest[0] === 0) {
    const v = await modal(`<h2>Лесное Братство</h2><p>Вы решаете, кто ходит первым.</p>
      <div class="mbtns"><button class="btn btn-gold" data-v="0">Хожу первым</button><button class="btn" data-v="1">Пусть начнёт противник</button></div>`);
    first = v === '1' ? 1 : 0;
  } else if (forest.length === 1) {
    first = 0; // ИИ Лесного Братства уступает первый ход
  } else {
    first = rnd(2);
  }
  s.starter = first;
  s.current = first;
  s.phase = 'play';
  render();
  await banner('Раунд 1', first === 0 ? 'Вы ходите первым' : 'Первым ходит противник', 1500);
  App.busy = false;
  loop();
}

/* ---------------------- меню ---------------------- */
function renderMenu() {
  $('#faction-list').innerHTML = Object.keys(FACTIONS).map((k) => {
    const f = FACTIONS[k];
    return `<div class="faction-tile f-${k} ${App.myFaction === k ? 'sel' : ''}" data-fk="${k}">
      <div class="fe">${f.emblem}</div><h4>${f.name}</h4>
      <p>${f.desc}</p>
      <p class="perk">✦ ${f.perk}</p>
      <p class="ldr">👑 ${f.leader.name}: ${f.leader.desc}</p></div>`;
  }).join('');
  $('#opp-select').innerHTML = `<option value="random">Случайная фракция</option>` +
    Object.keys(FACTIONS).map((k) => `<option value="${k}" ${App.oppFaction === k ? 'selected' : ''}>${FACTIONS[k].name}</option>`).join('');
  $('#opp-select').value = App.oppFaction;
}

function showRules() {
  const abil = Object.values(ABILITIES).map((a) => `<li><b>${a.icon} ${a.name}</b> — ${a.desc}</li>`).join('');
  modal(`<h2>Правила</h2>
    <h3>Цель</h3>
    <p>Игра идёт до двух выигранных раундов. В каждом раунде побеждает тот, у кого больше общая сила отрядов на поле. Проигравший раунд теряет кристалл (♦). Потерял оба — проиграл партию. При ничьей кристалл теряют оба.</p>
    <h3>Ход</h3>
    <ul>
      <li>В начале партии вы получаете 10 карт и можете заменить 2 из них.</li>
      <li>За ход можно сыграть одну карту, применить лидера или спасовать.</li>
      <li>Спасовавший больше не ходит до конца раунда, соперник может доигрывать.</li>
      <li>Раунд кончается, когда спасовали оба. Карты с поля уходят в сброс, новые карты в начале раунда <b>не выдаются</b> — берегите руку!</li>
    </ul>
    <h3>Ряды</h3>
    <p>⚔️ ближний бой, 🏹 дальний бой, 🏰 осада. Отряд можно выставить только в свой ряд (⇄ — в ближний или дальний на выбор).</p>
    <h3>Способности отрядов</h3><ul>${abil}</ul>
    <h3>Управление</h3>
    <p>Нажмите карту в руке — подсветятся допустимые цели. Нажмите подсвеченный ряд или карту. Для «Паса» нажмите кнопку дважды. Нажатие на сброс показывает его содержимое.</p>
    <div class="mbtns"><button class="btn btn-gold" data-v="ok">Понятно</button></div>`, null, 'rules');
}

/* ---------------------- коллекция ---------------------- */
function galleryLeaders() {
  return Object.keys(FACTIONS).map((k) => ({ ...FACTIONS[k].leader, type: 'leader', faction: k, abil: [] }));
}

function renderGallery() {
  const tabs = [['shared', 'Ваши карты'], ['extra', 'Новые карты']].concat(Object.keys(FACTIONS).map((k) => [k, FACTIONS[k].name])).concat([['leaders', 'Лидеры']]);
  $('#gal-tabs').innerHTML = tabs.map(([k, n]) => `<button class="btn ${App.galTab === k ? 'sel' : ''}" data-tab="${k}">${n}</button>`).join('');
  let defs;
  if (App.galTab === 'shared') defs = SHARED_CARDS;
  else if (App.galTab === 'extra') defs = EXTRA_CARDS;
  else if (App.galTab === 'leaders') defs = galleryLeaders();
  else defs = FACTIONS[App.galTab].cards;
  $('#gal-grid').innerHTML = defs.map((d) => {
    const html = cardHTML(d).replace(/data-lid="undefined"/, `data-gid="${esc(d.id)}"`);
    return `<div class="gcard">${html}<div class="gid">${esc(d.id)}${d.count > 1 ? ' ×' + d.count : ''}</div></div>`;
  }).join('');
  $('#gal-preview').innerHTML = previewHTML(null).replace('Выберите карту в руке, затем подсвеченный ряд или цель.', 'Под каждой картой — её id (имя файла картинки).');
}

/* ---------------------- инициализация ---------------------- */
function init() {
  fit();
  renderMenu();

  $('#faction-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-fk]');
    if (!t) return;
    App.myFaction = t.dataset.fk;
    renderMenu();
  });
  $('#opp-select').addEventListener('change', (e) => { App.oppFaction = e.target.value; });
  $('#extra-toggle').addEventListener('change', (e) => { App.extra = e.target.checked; });
  probeArt();
  $('#btn-start').addEventListener('click', startGame);
  $('#btn-rules').addEventListener('click', showRules);
  $('#btn-gallery').addEventListener('click', () => { show('gallery'); renderGallery(); });
  $('#btn-gal-back').addEventListener('click', () => show('menu'));
  $('#gal-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { App.galTab = t.dataset.tab; renderGallery(); }
  });
  $('#gal-grid').addEventListener('click', (e) => {
    const el = e.target.closest('.card');
    const f = el && cardFromEl(el);
    if (f) $('#gal-preview').innerHTML = previewHTML(f.card);
  });

  $('#game').addEventListener('click', onGameClick);

  // предпросмотр при наведении
  $('#stage').addEventListener('mouseover', (e) => {
    const el = e.target.closest('.card');
    if (!el || e.target.closest('#modal')) return;
    const f = cardFromEl(el);
    if (!f) return;
    if (el.closest('#gallery')) { $('#gal-preview').innerHTML = previewHTML(f.card); return; }
    App.hovering = true;
    $('#preview').innerHTML = previewHTML(f.card, f.power);
  });
  $('#stage').addEventListener('mouseout', (e) => {
    if (!e.target.closest('#game .card')) return;
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.card')) return;
    App.hovering = false;
    if (App.s) $('#preview').innerHTML = previewHTML(App.sel);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && App.sel) { App.sel = null; render(); }
  });
}

document.addEventListener('DOMContentLoaded', init);
