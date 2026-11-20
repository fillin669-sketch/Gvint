'use strict';
/* =====================================================================
   СБОРКА КОЛОДЫ — три слота, 30 карт, не больше 2 копий и 1 легенды.
   Карты натур кладутся только в колоду своей натуры, награды кампании —
   только после победы над боссом.
   ===================================================================== */

const Decks = (() => {
  const KEY = 'tron-decks';
  const SLOTS = 3;
  let decks = null;
  let slot = 0;
  let filter = 'all';

  function load() {
    if (decks) return decks;
    try { decks = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { decks = null; }
    if (!Array.isArray(decks)) decks = [];
    for (let i = 0; i < SLOTS; i++) if (!decks[i]) decks[i] = { name: `Колода ${i + 1}`, soul: 'brave', ids: [] };
    return decks;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(decks)); } catch (e) { /* ignore */ } }

  const pool = () => [...SHARED_CARDS, ...EXTRA_CARDS].filter((d) => d.id !== 'coin');
  const limit = (d) => (d.rarity === 'legendary' ? 1 : 2);
  const count = (deck, id) => deck.ids.filter((x) => x === id).length;

  /** Почему карту нельзя положить (или пустая строка) */
  function whyNot(deck, d) {
    if (d.reward && Campaign.unlocked().indexOf(d.id) < 0) return 'Награда кампании — победите босса';
    if (d.soul && d.soul !== deck.soul) return `Только для натуры «${SOULS[d.soul].name}»`;
    if (count(deck, d.id) >= limit(d)) return d.rarity === 'legendary' ? 'Легенда — не больше 1 копии' : 'Не больше 2 копий';
    if (deck.ids.length >= DECK_SIZE) return 'В колоде уже 30 карт';
    return '';
  }

  const FILTERS = [['all', 'Все'], ['minion', 'Существа'], ['spell', 'Заклинания'], ['c1', '0–1'], ['c2', '2'], ['c3', '3'], ['c4', '4'], ['c5', '5'], ['c6', '6'], ['c7', '7+'],
    ['soul', 'Натура'], ['tribe', 'Группы'], ['reward', 'Награды']];
  function passes(d) {
    if (filter === 'all') return true;
    if (filter === 'minion' || filter === 'spell') return d.type === filter;
    if (filter === 'soul') return !!d.soul;
    if (filter === 'tribe') return !!d.tribe || !!d.female;
    if (filter === 'reward') return !!d.reward;
    const c = +filter.slice(1);
    return c === 1 ? d.cost <= 1 : c === 7 ? d.cost >= 7 : d.cost === c;
  }

  function render() {
    load();
    const deck = decks[slot];
    $('#deck-slots').innerHTML = decks.map((d, i) => `<button class="btn ${i === slot ? 'sel' : ''}" data-slot="${i}">${esc(d.name)} · ${d.ids.length}/30</button>`).join('');
    $('#deck-souls').innerHTML = Object.keys(SOULS).map((k) => `<span class="pick sm ${deck.soul === k ? 'sel' : ''}" data-dsoul="${k}" style="--c:${SOULS[k].color}" title="${esc(SOULS[k].name)}">${SOULS[k].icon}</span>`).join('');
    $('#deck-filters').innerHTML = FILTERS.map(([k, n]) => `<button class="btn ${filter === k ? 'sel' : ''}" data-filter="${k}">${n}</button>`).join('');
    const cards = pool().filter(passes).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    $('#deck-pool').innerHTML = cards.map((d) => {
      const n = count(deck, d.id), why = whyNot(deck, d);
      const locked = (d.reward && Campaign.unlocked().indexOf(d.id) < 0) || (d.soul && d.soul !== deck.soul);
      return `<div class="dp ${locked ? 'locked' : ''} ${n ? 'in' : ''}" data-add="${esc(d.id)}" title="${esc(why)}">${hcardHTML(d)}
        ${n ? `<div class="dp-n">×${n}</div>` : ''}${locked ? `<div class="dp-lock">🔒</div>` : ''}</div>`;
    }).join('') || '<div class="pv-empty">Нет карт под этот фильтр</div>';
    // список колоды
    const grouped = {};
    deck.ids.forEach((id) => { grouped[id] = (grouped[id] || 0) + 1; });
    const rows = Object.keys(grouped).map((id) => defOf(id)).filter(Boolean).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    $('#deck-list').innerHTML = rows.map((d) => `<div class="dl r-${d.rarity || 'common'} ${whyNot({ ...deck, ids: [] }, d) ? 'bad' : ''}" data-remove="${esc(d.id)}">
      <span class="dl-cost">${d.cost}</span><span class="dl-name">${esc(d.name)}</span><span class="dl-n">${grouped[d.id] > 1 ? '×' + grouped[d.id] : ''}</span></div>`).join('')
      || '<div class="pv-empty">Нажимайте на карты слева,<br>чтобы добавить их в колоду</div>';
    const curve = [0, 0, 0, 0, 0, 0, 0, 0];
    deck.ids.forEach((id) => { const d = defOf(id); if (d) curve[Math.min(7, d.cost)]++; });
    const mx = Math.max(1, ...curve);
    $('#deck-curve').innerHTML = curve.map((n, c) => `<div class="cv"><i style="height:${n / mx * 100}%"></i><b>${n || ''}</b><span>${c === 7 ? '7+' : c}</span></div>`).join('');
    const minions = deck.ids.filter((id) => (defOf(id) || {}).type === 'minion').length;
    $('#deck-count').innerHTML = `<b class="${deck.ids.length === DECK_SIZE ? 'ok' : ''}">${deck.ids.length}/30</b> · существ ${minions} · заклинаний ${deck.ids.length - minions}`;
    $('#deck-name').value = deck.name;
    fitCardTexts($('#deck-pool'));
  }

  let toastT = 0;
  function toast(t) {
    const el = $('#deck-toast');
    el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1600);
  }

  function add(id) {
    const deck = decks[slot], d = defOf(id);
    const why = whyNot(deck, d);
    if (why) { toast(why); Sound.play('debuff'); return; }
    deck.ids.push(id); save(); render(); Sound.play('draw');
  }
  function remove(id) {
    const deck = decks[slot];
    const i = deck.ids.lastIndexOf(id);
    if (i >= 0) { deck.ids.splice(i, 1); save(); render(); }
  }

  /** Дополняет колоду до 30 подходящими картами по кривой маны */
  function autofill() {
    const deck = decks[slot];
    deck.ids = deck.ids.filter((id) => { const d = defOf(id); return d && !whyNot({ ...deck, ids: [] }, d); });
    const gen = buildDeck(0, true, deck.soul, Campaign.unlocked(), true);
    for (const d of gen) {
      if (deck.ids.length >= DECK_SIZE) break;
      if (!whyNot(deck, d)) deck.ids.push(d.id);
    }
    save(); render(); toast('Колода дополнена до 30 карт');
  }

  function open() { load(); show('decks'); render(); }

  /** Колоды, готовые к игре (30 карт) — для меню */
  function ready() { load(); return decks.map((d, i) => ({ i, d })).filter((x) => x.d.ids.length === DECK_SIZE); }
  function get(i) { load(); return decks[i]; }

  function init() {
    $('#deck-slots').addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (b) { slot = +b.dataset.slot; render(); } });
    $('#deck-souls').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dsoul]');
      if (!b) return;
      decks[slot].soul = b.dataset.dsoul; save(); render();
      const bad = decks[slot].ids.filter((id) => (defOf(id) || {}).soul && defOf(id).soul !== decks[slot].soul).length;
      if (bad) toast(`${bad} карт другой натуры подсвечены красным — замените их`);
    });
    $('#deck-filters').addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) { filter = b.dataset.filter; render(); } });
    $('#deck-pool').addEventListener('click', (e) => { const el = e.target.closest('[data-add]'); if (el) add(el.dataset.add); });
    $('#deck-list').addEventListener('click', (e) => { const el = e.target.closest('[data-remove]'); if (el) remove(el.dataset.remove); });
    $('#deck-name').addEventListener('change', (e) => { decks[slot].name = e.target.value.trim().slice(0, 24) || `Колода ${slot + 1}`; save(); render(); });
    $('#btn-deck-auto').addEventListener('click', autofill);
    $('#btn-deck-clear').addEventListener('click', async () => {
      if (await confirmModal('Очистить колоду?', 'Все карты будут убраны из этого слота.', 'Очистить')) { decks[slot].ids = []; save(); render(); }
    });
    $('#btn-deck-back').addEventListener('click', () => { show('menu'); renderMenu(); });
  }

  return { open, init, ready, get, load };
})();
