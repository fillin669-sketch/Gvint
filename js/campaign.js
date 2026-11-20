'use strict';
/* =====================================================================
   КАМПАНИЯ — пять боссов подряд. У каждого свои правила, колода и награда:
   особая легендарная карта, которую больше нигде не получить.
   ===================================================================== */

const x2 = (...ids) => ids.flatMap((id) => [id, id]);

const BOSSES = [
  { key: 'tescha', name: 'Тёща', icon: '👵', field: 'nursery', soul: 'stubborn', hp: 30, armor: 0, level: 'boss',
    intro: '«Я же говорила, что он тебе не пара!»',
    rules: ['30 здоровья', 'Ворчит: в начале каждого её хода случайное ваше существо получает −1 атаки', 'Сила «Нотация»: оглушает ваше существо'],
    power: { name: 'Нотация', cost: 2, icon: '☝️', fx: [{ e: 'stun', t: 'enemyMinion' }], desc: 'Оглушите вражеское существо.' },
    onTurn: [{ e: 'debuffRandomEnemy', a: 1 }],
    deck: ['tescha', 'svekrov', 'granny', 'wife', ...x2('babki', 'kent', 'okhrannik', 'shkaf', 'g_vnuk', 'pirozhki', 'mama_zvonit'), 'ochered', 'kompot', 'banya', 'n_ded', 'n_stoyat'],
    reward: 'r_dacha' },
  { key: 'kollektor', name: 'Коллектор', icon: '📇', field: 'office', soul: 'greedy', hp: 35, armor: 0, level: 'boss',
    intro: '«Мы просто поговорим.»',
    rules: ['35 здоровья', 'Звонок в 3 ночи: в начале каждого его хода вы получаете 1 урон', 'Сила «Опись имущества»: 2 урона любому персонажу'],
    power: { name: 'Опись имущества', cost: 2, icon: '📋', fx: [{ e: 'dmg', n: 2, t: 'any' }], desc: 'Нанесите 2 урона любому персонажу.' },
    onTurn: [{ e: 'dmgHero', n: 1 }],
    deck: ['kreditor', 'realtor', 'wife', 'magnat', 'verbovka', 'w_dogovor', ...x2('r_kollektor', 'nalog', 'n_rostovshik', 'n_meshok', 'r_klyuchi', 'lombard', 'baryga'), 'n_vzyatka'],
    reward: 'r_spisanie' },
  { key: 'avtoritet', name: 'Авторитет района', icon: '🧢', field: 'night', soul: 'brave', hp: 30, armor: 0, level: 'boss',
    intro: '«Ты с какого района, братишка?»',
    rules: ['30 здоровья', 'Уважение: в начале каждого его хода вся его Гопота 🧢 получает +0/+1', 'Сила «Позвать пацанов»: призывает «Шпану» 1/1 со Спешкой'],
    power: { name: 'Позвать пацанов', cost: 2, icon: '📱', fx: [{ e: 'summon', token: 'shpana', n: 1 }], desc: 'Призовите «Шпану» 1/1 со Спешкой.' },
    onTurn: [{ e: 'buffTribe', tribe: 'gop', a: 0, h: 1 }],
    deck: [...x2('gop_kolyan', 'gop_tolyan', 'gop_vovan', 't_glavar', 'kachok', 'semki', 'kent', 'bychok', 'okhrannik', 'podzatylnik', 'kirpich', 'tapok'), 'obrez', 'sborshik'],
    reward: 'r_korona' },
  { key: 'dragon', name: 'Жопный Дракон', img: 'dragon_ass', icon: '🐉', field: 'zags', soul: 'greedy', hp: 30, armor: 0, level: 'boss',
    intro: '«Садись ближе, пидор, щас дам дыхнуть могуществом!»',
    rules: ['30 здоровья', 'Огненная отрыжка: в начале каждого его хода 1 урон случайному врагу', 'Сила «Дыхание»: 1 урон всем вашим существам (3 маны)'],
    power: { name: 'Дыхание', cost: 3, icon: '🔥', fx: [{ e: 'aoe', n: 1, who: 'enemyMinions' }], desc: 'Нанесите 1 урон всем вражеским существам.' },
    onTurn: [{ e: 'dmgRandomEnemy', n: 1 }],
    deck: ['dragon_ass', 'gus', 'enot', 'kreditor', 'kaka', 'spid', 'srachka', ...x2('dvorovy_pes', 'kot_vasya', 'bugai', 't_zoo', 'umilenie', 'ohota', 'zabor')],
    reward: 'r_yaytso' },
  { key: 'giga', name: 'GiGa$lav Pro+', img: 'gigaslav_pro', icon: '🦅', field: 'zags', soul: 'stubborn', hp: 45, armor: 5, level: 'boss',
    intro: '«Бывшие не возвращаются. Они стираются.»',
    rules: ['45 здоровья и 5 брони', 'Божественное спокойствие: в начале каждого его хода восстанавливает 2 здоровья', 'Сила «Отшив»: +4 брони'],
    power: { name: 'Отшив', cost: 2, icon: '🛡️', fx: [{ e: 'armor', n: 4 }], desc: 'Получите 4 брони.' },
    onTurn: [{ e: 'healHero', n: 2 }],
    deck: ['gigaslav_pro', 'gigaslav', 'boroda', 'bolno', 'pisyunchik_zol', 'batya', 'putnik', 'khtoya', 'gibel', 'tobi', 'n_ded',
      ...x2('bychok', 'shkaf', 'udostoverenie', 'n_stoyat', 'n_baran', 'kent')],
    reward: 'r_tron' },
];

const Campaign = (() => {
  const KEY = 'tron-campaign';
  let current = null;   // босс текущей партии

  function progress() {
    try { return Math.min(BOSSES.length, +(localStorage.getItem(KEY) || 0)); } catch (e) { return 0; }
  }
  function setProgress(n) {
    try { localStorage.setItem(KEY, String(Math.max(progress(), n))); } catch (e) { /* ignore */ }
  }
  /** Открытые наградные карты */
  function unlocked() { return BOSSES.slice(0, progress()).map((b) => b.reward); }

  function portraitHTML(b, cls) {
    return b.img ? `<img class="${cls}" src="${esc(ARTPATH(`img/cards/thumbs/${b.img}.jpg`))}" alt="">` : `<div class="${cls} glyph-portrait">${b.icon}</div>`;
  }

  function render() {
    const done = progress();
    $('#camp-list').innerHTML = BOSSES.map((b, i) => {
      const state = i < done ? 'done' : i === done ? 'open' : 'locked';
      const rw = defOf(b.reward);
      return `<div class="boss ${state}" data-boss="${i}">
        <div class="b-num">${i + 1}</div>${portraitHTML(b, 'b-portrait')}
        <div class="b-name">${esc(b.name)}</div>
        <div class="b-rules">${b.rules.map((r) => `<div>• ${esc(r)}</div>`).join('')}</div>
        <div class="b-reward">🏆 ${esc(rw.name)}</div>
        <div class="b-state">${state === 'done' ? '✅ Побеждён' : state === 'open' ? '⚔ В бой' : '🔒 Победите предыдущего'}</div></div>`;
    }).join('');
    $('#camp-progress').textContent = done >= BOSSES.length ? '👑 Кампания пройдена! Все награды открыты.' : `Побеждено боссов: ${done} из ${BOSSES.length}`;
  }

  function open() { show('campaign'); render(); Sound.setLocation('tavern'); }

  /** Параметры противника-босса для createGame */
  function opponent(i) {
    const b = BOSSES[i];
    current = i;
    return { field: b.field, soul: b.soul, artifact: null, hp: b.hp, armor: b.armor, deckIds: b.deck,
      power: b.power, onTurn: b.onTurn, boss: b.key };
  }

  function bossOf(P) { return P && P.boss ? BOSSES.find((b) => b.key === P.boss) : null; }

  /** Итог боя с боссом: при победе — награда */
  function finish(won) {
    const i = current;
    current = null;
    if (i == null || !won) return null;
    const first = progress() <= i;
    setProgress(i + 1);
    return first ? BOSSES[i].reward : null;
  }

  function init() {
    $('#camp-list').addEventListener('click', (e) => {
      const el = e.target.closest('[data-boss]');
      if (!el || el.classList.contains('locked')) return;
      startGame(+el.dataset.boss);
    });
    $('#btn-camp-back').addEventListener('click', () => show('menu'));
  }

  return { open, render, opponent, finish, unlocked, progress, bossOf, init, portraitHTML, get current() { return current; } };
})();
