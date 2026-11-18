'use strict';
/* =====================================================================
   БАЗА КАРТ
   ---------------------------------------------------------------------
   Как добавить свою карту:
     1. Положите картинку в img/cards/<id>.jpg
        (и, по желанию, уменьшенную копию в img/cards/thumbs/<id>.jpg).
     2. Добавьте строку в массив SHARED_CARDS (общие карты, есть у всех)
        или в cards нужной фракции (FACTIONS.<ключ>.cards).

   Поля карты:
     id      — уникальный идентификатор (латиница)
     name    — название
     type    — 'unit' (отряд) или 'special' (особая карта)
     power   — сила отряда
     row     — 'melee' | 'ranged' | 'siege' | 'agile' (ближний ИЛИ дальний)
     abil    — список способностей отряда (см. ABILITIES)
     kind    — тип особой карты (см. SPECIAL_KINDS)
     value   — число для способностей с уроном
     img     — путь к картинке; без него рисуется значок icon
     rarity  — 'legendary' | 'epic' | 'rare' | 'common' (цвет рамки)
     count   — сколько копий в колоде (по умолчанию 1)
   ===================================================================== */

const ROWS = ['melee', 'ranged', 'siege'];
const ROW_NAMES = {
  melee: 'Ближний бой',
  ranged: 'Дальний бой',
  siege: 'Осада',
  agile: 'Ближний или дальний бой',
};
const ROW_ICONS = { melee: '⚔️', ranged: '🏹', siege: '🏰', agile: '⇄' };

// Способности отрядов
const ABILITIES = {
  hero:      { name: 'Легенда',        icon: '★',  desc: 'Неуязвим: на него не действуют погода, урон, проклятия, рога и уничтожение.' },
  spy:       { name: 'Лазутчик',       icon: '👁', desc: 'Выставляется на сторону противника (его сила идёт противнику). Вы берёте 2 карты.' },
  medic:     { name: 'Целитель',       icon: '✚',  desc: 'Возвращает выбранный отряд (не легенду) из вашего сброса прямо на поле.' },
  bond:      { name: 'Братство',       icon: '🔗', desc: 'Сила умножается на число одноимённых карт в этом ряду.' },
  morale:    { name: 'Воодушевление',  icon: '⬆',  desc: '+1 к силе всех остальных отрядов в этом ряду.' },
  muster:    { name: 'Зов стаи',       icon: '👥', desc: 'Сразу выставляет из колоды все карты той же группы.' },
  horn:      { name: 'Горнист',        icon: '📯', desc: 'Удваивает силу остальных отрядов в ряду (рога не складываются).' },
  scorch:    { name: 'Выжигание',      icon: '🔥', desc: 'Если сила того же ряда противника 10 и больше — уничтожает его сильнейший отряд(ы).' },
  shoot:     { name: 'Выстрел',        icon: '🎯', desc: 'При розыгрыше наносит урон (число на карте) сильнейшему вражескому отряду.' },
  convert:   { name: 'Обольщение',     icon: '💘', desc: 'При розыгрыше переманивает слабейший вражеский отряд (не легенду) на вашу сторону.' },
  reinforce: { name: 'Подкрепление',   icon: '🃏', desc: 'При розыгрыше выставляет на поле 2 случайных отряда (не легенды) из вашей колоды.' },
  summon:    { name: 'Призыв',         icon: '🐾', desc: 'При розыгрыше призывает на поле дополнительных существ.' },
  dispel:    { name: 'Ярость',         icon: '💢', desc: 'При розыгрыше снимает с противника все рога и усиления рядов.' },
  draw:      { name: 'Доход',          icon: '💰', desc: 'При розыгрыше вы берёте 1 карту из колоды.' },
  income:    { name: 'Торговец',       icon: '⚖️', desc: 'Если в конце раунда стоит на поле — вы берёте 1 карту.' },
  cover:     { name: 'Прикрытие',      icon: '🛡️', desc: 'При розыгрыше ставит щит на свой ряд: он примет на себя следующую атаку врага по этому ряду.' },
  stealth:   { name: 'Скрытность',     icon: '🥷', desc: 'Его нельзя выбрать целью: не действуют удары, выстрелы, вербовка и обольщение (кроме карты «Тоби Пизда»).' },
  fetch:     { name: 'А вот был случай…', icon: '📜', desc: 'С вероятностью 95% достаёт из колоды в руку карту «Одна история охуительнее другой».' },
};

// Типы особых карт
const SPECIAL_KINDS = {
  weather:  { name: 'Погода',        desc: (c) => `Сила всех отрядов в ряду «${ROW_NAMES[c.wrow]}» у ОБОИХ игроков становится 1 (кроме легенд).` },
  clear:    { name: 'Очищение',      desc: (c) => 'Убирает всю погоду с поля и снимает проклятия с ваших рядов.' + (c.buff ? ` Все ваши отряды получают +${c.buff} к силе.` : '') },
  horn:     { name: 'Рог',           desc: () => 'Удваивает силу всех отрядов в выбранном вашем ряду.' },
  decoy:    { name: 'Подмена',       desc: () => 'Заменяет выбранный ваш отряд (не легенду) этой картой — отряд возвращается в руку.' },
  scorch:   { name: 'Пожар',         desc: () => 'Уничтожает сильнейший отряд(ы) на всём поле — у обоих игроков (кроме легенд).' },
  damage:   { name: 'Удар',          desc: (c) => `Наносит ${c.value} урона выбранному вражескому отряду. При силе 0 он погибает.` },
  aoe:      { name: 'Буря',          desc: (c) => `Наносит ${c.value} урона КАЖДОМУ вражескому отряду (кроме легенд).` },
  rowdmg:   { name: 'Зараза',        desc: (c) => `Наносит ${c.value} урона каждому отряду в выбранном ряду противника.` },
  kill2:    { name: 'Гибель',        desc: () => 'Уничтожает 2 сильнейших вражеских отряда (кроме легенд).' },
  charm:    { name: 'Вербовка',      desc: () => 'Выбранный вражеский отряд (не легенда) переходит на вашу сторону.' },
  curse:    { name: 'Проклятие',     desc: () => 'Проклинает выбранный ряд противника: сила отрядов в нём уменьшается вдвое, рог в этом ряду сгорает.' },
  discard:  { name: 'Насмешка',      desc: () => 'Противник сбрасывает 1 случайную карту из руки.' },
  draw2:    { name: 'Сделка',        desc: () => 'Вы берёте 2 карты из колоды.' },
  shop:     { name: 'Торговля',      desc: () => 'Посмотрите 3 случайные карты своей колоды и заберите одну в руку.' },
  revive:   { name: 'Воскрешение',   desc: () => 'Верните на поле выбранный отряд (не легенду) из вашего сброса.' },
  shield:   { name: 'Укрытие',       desc: () => 'Поставьте щит на свой ряд: он поглотит следующую атаку врага по этому ряду. НЕ тратит ход.' },
  heal:     { name: 'Массовое лечение', desc: () => 'Все ваши отряды восстанавливают силу после урона и получают +1.' },
  healOne:  { name: 'Лечение',       desc: (c) => `Выбранный ваш отряд восстанавливает силу после урона и получает +${c.value}.` + (c.cleanse ? ' Снимает проклятие с его ряда.' : '') },
  tax:      { name: 'Изъятие',       desc: () => 'Заберите себе в руку случайную карту из руки противника.' },
  reflect:  { name: 'Обратка',       desc: () => 'Все проклятия с ваших рядов перелетают на ряды противника. Каждый вражеский отряд получает 1 урона.' },
  fort:     { name: 'Укрепление',    desc: () => 'Ставится на ваш ряд: каждый отряд в нём получает +2 к силе. Сгорает от пожара.' },
  story:    { name: 'Ступор',        desc: () => 'Отряды в выбранном ряду противника получают по 2 урона, все ваши отряды — +1 к силе.' },
};

const RARITY_NAMES = { legendary: 'Легендарная', epic: 'Эпическая', rare: 'Редкая', common: 'Обычная' };

// ---------- конструкторы ----------
function U(id, name, power, row, abil, icon, extra) {
  return Object.assign({ id, name, type: 'unit', power, row, abil: abil || [], icon: icon || '❔', rarity: 'common' }, extra || {});
}
function S(id, kind, name, icon, extra) {
  return Object.assign({ id, name, type: 'special', kind, power: 0, abil: [], icon: icon || '✦', rarity: 'common' }, extra || {});
}
// В собранной однофайловой версии картинки встроены в window.EMBED_ART
const ARTPATH = (p) => (typeof window !== 'undefined' && window.EMBED_ART && window.EMBED_ART[p]) || p;
const IMG = (id) => ({ img: ARTPATH(`img/cards/${id}.jpg`), thumb: ARTPATH(`img/cards/thumbs/${id}.jpg`) });

/* =====================================================================
   ОБЩИЕ КАРТЫ (ваши карточки) — попадают в колоду любой фракции
   ===================================================================== */
const SHARED_CARDS = [
  // ---- Легенды ----
  U('gigaslav', 'Гигаслав', 12, 'melee', ['hero'], '👑', { ...IMG('gigaslav'), rarity: 'legendary',
    quote: '«Блудные женщины — испытание для слабых. Я не слабый.»' }),
  U('magnat', 'Денежный Магнат', 9, 'siege', ['hero', 'draw'], '💶', { ...IMG('magnat'), rarity: 'legendary',
    quote: '«В этой войне побеждает не только клинок, но и кошелёк.»' }),
  U('boroda', 'Шикарная Борода', 9, 'melee', ['hero'], '🧔', { ...IMG('boroda'), rarity: 'legendary',
    quote: '«На НАХУЙ отлетела шваль!»' }),
  U('pisyunchik_zol', 'Писюнчик зол и готов рвать тузы!', 10, 'ranged', ['hero'], '🐱', { ...IMG('pisyunchik_zol'), rarity: 'legendary',
    quote: '«Писюнчик зол и готов рвать тузы!»' }),

  // ---- Отряды ----
  U('bolno', 'Я делать твоя больно', 7, 'melee', ['shoot'], '🪓', { ...IMG('bolno'), rarity: 'legendary', value: 5,
    quote: '«Твоя жизнь сломлена!»' }),
  U('ohota', 'Охота на Нелюдей', 6, 'melee', ['scorch'], '🐺', { ...IMG('ohota'), rarity: 'epic',
    quote: '«Здесь людям место, а не всякой нечисти!»' }),
  U('berserk', 'Ярость Берсерка', 8, 'melee', ['dispel'], '💢', { ...IMG('berserk'), rarity: 'epic',
    quote: '«Иди сюда, мармышка!»' }),
  U('bugai', 'Призыв: Бугай', 7, 'melee', ['morale'], '👹', { ...IMG('bugai'), rarity: 'epic',
    quote: '«Вот теперь можно и повеселиться!»' }),
  U('szadi', 'Появление Сзади', 5, 'melee', ['spy'], '🕵️', { ...IMG('szadi'), rarity: 'epic',
    quote: '«Тихо… не убегай. Будет интересно…»' }),
  U('biba_boba', 'Биба и Боба', 4, 'melee', ['bond', 'fetch'], '💪', { ...IMG('biba_boba'), rarity: 'epic', count: 2, fetch: 'istoriya',
    quote: '«Главное прийти, а приключения всегда найдутся»' }),
  U('umilenie', 'Умиление', 3, 'ranged', ['summon'], '🐾', { ...IMG('umilenie'), rarity: 'epic',
    summon: { name: 'Котёнок-рыцарь', power: 2, row: 'melee', count: 3, icon: '🐱' },
    quote: '«Котята, вперёд! Покажите ему, что милота — тоже сила!»' }),
  U('ubezhdenie', 'Убеждение: Перерождение Веры', 3, 'ranged', ['horn'], '☀️', { ...IMG('ubezhdenie'), rarity: 'epic',
    quote: '«Вера в тебя — это лишь вопрос правильных слов…»' }),
  U('ohotniki', 'Охотники, но не любовники', 5, 'ranged', ['morale'], '🦌', { ...IMG('ohotniki'), rarity: 'legendary',
    quote: '«Охотники, но не любовники!»' }),
  U('pricha', 'Соблазнительная Прича', 4, 'ranged', ['convert'], '💘', { ...IMG('pricha'), rarity: 'epic',
    quote: '«Сопротивление? Милая… ты уже проиграла.»' }),
  U('stvol', 'Носил с собою ствол', 5, 'ranged', ['shoot'], '🔫', { ...IMG('stvol'), rarity: 'epic', value: 5,
    quote: '«Носил с собою ствол… носил патрон в стволе.»' }),
  U('magaslav', 'МагаСлав', 3, 'siege', ['reinforce'], '🦁', { ...IMG('magaslav'), rarity: 'epic',
    quote: '«Приходи один, мы тоже одни будем»' }),
  U('poilo', 'Великолепное пойло', 4, 'siege', ['medic'], '🍾', { ...IMG('poilo'), rarity: 'epic',
    quote: '«Один глоток дарует силу льва, но забирает твёрдость шага…»' }),
  U('bol', 'Анальная Боль', 5, 'siege', ['shoot'], '🔧', { ...IMG('bol'), rarity: 'epic', value: 4,
    quote: '«Тут не про милосердие — тут про крики!»' }),

  // ---- Особые карты ----
  S('gibel', 'kill2', 'Гибель', '💀', { ...IMG('gibel'), rarity: 'legendary',
    quote: '«Сова на скакалке!»' }),
  S('kaka', 'scorch', 'Моя делать кака — твой дом гореть!', '🔥', { ...IMG('kaka'), rarity: 'legendary',
    quote: '«Моя делать кака… твой дом гореть!»' }),
  S('pisyunchik_zametil', 'aoe', 'Писюнчик вас заметил!', '🐾', { ...IMG('pisyunchik_zametil'), rarity: 'legendary', value: 2,
    quote: '«Вам не избежать проблем!»' }),
  S('tobi', 'damage', 'Тоби Пизда', '🔥', { ...IMG('tobi'), rarity: 'legendary', value: 8, antiTobi: true,
    note: 'Если цель — Тоби, он уничтожается сразу (скрытность не спасает).',
    quote: '«Тоби? Ну тут тебе пизда.»' }),
  S('udostoverenie', 'damage', 'Удостоверение «Умелый Пенис»', '📜', { ...IMG('udostoverenie'), rarity: 'epic', value: 6,
    quote: '«Не просто титул — доказанный навык.»' }),
  S('spid', 'rowdmg', 'Спид', '☣️', { ...IMG('spid'), rarity: 'legendary', value: 3,
    quote: '«Это не просто болезнь… это стиль жизни!»' }),
  S('mihail', 'curse', 'Твою змею укротил Михаил', '🐍', { ...IMG('mihail'), rarity: 'legendary',
    quote: '«Твою змею укротил Михаил!»' }),
  S('verbovka', 'charm', 'Вербовка', '🤝', { ...IMG('verbovka'), rarity: 'epic',
    quote: '«Иногда врага не нужно уничтожать — достаточно предложить ему лучшую сторону.»' }),
  S('nasmeshka', 'discard', 'Насмешка', '🃏', { ...IMG('nasmeshka'), rarity: 'rare',
    quote: '«Ну серьёзно… ебать ты чмоня!»' }),
  S('delishki', 'draw2', 'Обсудим делишки насущные', '🪙', { ...IMG('delishki'), rarity: 'rare',
    quote: '«Деньги любят тишину… Но мы с ними поговорим.»' }),
  S('torgovlya', 'shop', 'Торговая Точка', '🛒', { ...IMG('torgovlya'), rarity: 'epic',
    quote: '«Тапки БибуДаст — ходи с комфортом!»' }),
  S('hrabrost', 'horn', 'Храбрость и Сила', '🍺', { ...IMG('hrabrost'), rarity: 'rare',
    quote: '«У вас будет похмелье — смотри не сдохни!»' }),
  S('pidozra', 'decoy', 'У меня Пидозра', '⚖️', { ...IMG('pidozra'), rarity: 'epic',
    quote: '«Я чувствую… здесь что-то не чисто.»' }),
  S('srachka', 'weather', 'Жёсткая Срачка', '💩', { ...IMG('srachka'), rarity: 'legendary', wrow: 'melee',
    quote: '«Даже величайшие герои склоняются перед силой кишечника.»' }),
  S('karlik', 'weather', 'Горбатый Карлик', '🐴', { ...IMG('karlik'), rarity: 'rare', wrow: 'ranged',
    quote: '«Сначала себя в порядок приведи, карлик…»' }),
  S('maloletki', 'weather', 'Малолетки', '🍻', { ...IMG('maloletki'), rarity: 'epic', wrow: 'siege',
    quote: '«Ща будет бухалово»' }),
  S('yager', 'clear', 'Ягермейстер', '🦌', { ...IMG('yager'), rarity: 'legendary', buff: 1,
    quote: '«Ну мёд, ну мёд по телу!!!!»' }),

  // ---- Вторая партия карт ----
  U('tobi_ninja', 'Тоби', 6, 'agile', ['stealth'], '🥷', { ...IMG('tobi_ninja'), rarity: 'epic',
    quote: '«Ты бьёшь по воздуху, приятель.»' }),
  U('baryga', 'Барыга', 3, 'siege', ['income'], '⚖️', { ...IMG('baryga'), rarity: 'rare',
    quote: '«Не обманешь — не продашь!»' }),
  U('kent', 'Кент на Подхвате', 3, 'melee', ['cover'], '🛡️', { ...IMG('kent'), rarity: 'common',
    quote: '«Один в поле не воин, а вдвоём уже банда.»' }),
  U('semki', 'Семки у Подъезда', 2, 'melee', ['draw'], '🌻', { ...IMG('semki'), rarity: 'common', count: 2,
    quote: '«Сидим, никого не трогаем, примус починяем.»' }),
  S('istoriya', 'story', 'Одна история охуительнее другой', '📜', { ...IMG('istoriya'), rarity: 'epic',
    quote: '«Не перебивай, там дальше вообще пиздец!»' }),
  S('obrez', 'damage', 'Огнестрел: Обрез', '💥', { ...IMG('obrez'), rarity: 'rare', value: 5,
    quote: '«Аргумент, против которого не попрёшь.»' }),
  S('podzatylnik', 'damage', 'Пацанский Подзатыльник', '✋', { ...IMG('podzatylnik'), rarity: 'common', value: 3, count: 2,
    quote: '«Для профилактики и ясности ума.»' }),
  S('nalog', 'tax', 'Налоговая Проверка', '📕', { ...IMG('nalog'), rarity: 'rare',
    quote: '«Заплати налоги и спи спокойно… в канаве.»' }),
  S('obratka', 'reflect', 'Обратка', '🪞', { ...IMG('obratka'), rarity: 'epic',
    quote: '«Свой яд пей сам, братишка.»' }),
  S('lager', 'fort', 'Укреплённый Лагерь', '🏰', { ...IMG('lager'), rarity: 'rare',
    quote: '«Пока стоят стены — враг не пройдёт.»' }),
  S('korobka', 'shield', 'Картонная Коробка', '📦', { ...IMG('korobka'), rarity: 'common', free: true,
    quote: '«Гениальная маскировка всех времён.»' }),
  S('rassol', 'revive', 'Рассол с Утра', '🥒', { ...IMG('rassol'), rarity: 'common',
    quote: '«Эликсир, перед которым бессильна даже смерть.»' }),
  S('kompot', 'heal', 'Бабушкин Компот', '🍒', { ...IMG('kompot'), rarity: 'rare',
    quote: '«Закрыто с любовью — открыто к победе!»' }),
  S('doshirak', 'healOne', 'Живительный Доширак', '🍜', { ...IMG('doshirak'), rarity: 'rare', value: 4, cleanse: true,
    quote: '«Заварил кипяточком — и снова в строй!»' }),
  S('podorozhnik', 'healOne', 'Подорожник', '🌿', { ...IMG('podorozhnik'), rarity: 'common', value: 2,
    quote: '«Лучшая медицина со времён динозавров.»' }),
  S('ugol', 'clear', 'Активированный Уголь', '⚫', { ...IMG('ugol'), rarity: 'common',
    quote: '«Десять таблеток — и ты снова человек.»' }),
];

/* =====================================================================
   ФРАКЦИИ — у каждой свой лидер, бонус и несколько своих отрядов
   ===================================================================== */
const FACTIONS = {
  iron: {
    name: 'Железный Легион', emblem: '🛡️',
    desc: 'Дисциплина, осадные машины и сплочённые отряды.',
    perk: 'Победив в раунде, берёт 1 карту из колоды.',
    leader: { id: 'iron_leader', name: 'Маршал Брандт', icon: '🎖️', ability: 'hornSiege',
      desc: 'Удваивает силу вашего осадного ряда (если там ещё нет рога).' },
    cards: [
      U('iron_footman', 'Пехотинец Легиона', 4, 'melee', ['bond'], '🛡️', { count: 3 }),
      U('iron_catapult', 'Катапульта', 8, 'siege', ['bond'], '🪨', { count: 2 }),
      U('iron_archer', 'Лучник гарнизона', 4, 'ranged', [], '🏹', { count: 2 }),
      U('iron_medic', 'Полевой лекарь', 5, 'siege', ['medic'], '⚕️'),
      U('iron_banner', 'Знаменосец', 1, 'melee', ['morale'], '🚩'),
    ],
  },
  forest: {
    name: 'Лесное Братство', emblem: '🌲',
    desc: 'Ловкие стрелки и хранители древних рощ.',
    perk: 'Может заменить 3 карты вместо 2 и сам решает, кто ходит первым.',
    leader: { id: 'forest_leader', name: 'Ведунья Эйлин', icon: '🌿', ability: 'draw',
      desc: 'Возьмите 1 карту из колоды.' },
    cards: [
      U('forest_ranger', 'Лесной следопыт', 6, 'agile', [], '🧝', { count: 2 }),
      U('forest_yew', 'Стрелок Тисовой рощи', 4, 'ranged', ['bond'], '🎯', { count: 3 }),
      U('forest_dryad', 'Дриада-целительница', 2, 'ranged', ['medic'], '🌸'),
      U('forest_treant', 'Древень', 8, 'siege', [], '🌳'),
      U('forest_keeper', 'Хранитель рощи', 2, 'melee', ['morale'], '🍃'),
    ],
  },
  dark: {
    name: 'Порождения Тьмы', emblem: '🦇',
    desc: 'Стаи чудовищ, которые приходят все разом.',
    perk: 'После каждого раунда один случайный отряд остаётся на поле.',
    leader: { id: 'dark_leader', name: 'Повелитель Мора', icon: '☠️', ability: 'scorchMelee',
      desc: 'Если сила ближнего боя противника 10+, уничтожает его сильнейший отряд(ы) там.' },
    cards: [
      U('dark_ghoul', 'Гуль', 2, 'melee', ['muster'], '💀', { count: 3, muster: 'ghoul' }),
      U('dark_coven1', 'Ведьма Полынь', 5, 'melee', ['muster'], '🧙‍♀️', { muster: 'coven' }),
      U('dark_coven2', 'Ведьма Белена', 5, 'melee', ['muster'], '🧙‍♀️', { muster: 'coven' }),
      U('dark_coven3', 'Ведьма Дурман', 5, 'melee', ['muster'], '🧙‍♀️', { muster: 'coven' }),
      U('dark_harpy', 'Гарпия', 3, 'agile', [], '🦅', { count: 2 }),
      U('dark_golem', 'Каменный голем', 7, 'siege', [], '🗿'),
    ],
  },
  sea: {
    name: 'Морские Кланы', emblem: '⚓',
    desc: 'Налётчики с севера, сильные в братстве.',
    perk: 'Побеждает в раунде при ничьей.',
    leader: { id: 'sea_leader', name: 'Ярл Хротгар', icon: '🪓', ability: 'reviveRandom',
      desc: 'Возвращает на поле случайный отряд (не легенду) из вашего сброса.' },
    cards: [
      U('sea_raider', 'Налётчик', 4, 'melee', ['bond'], '⚔️', { count: 3 }),
      U('sea_axe', 'Метатель топоров', 4, 'ranged', ['bond'], '🪓', { count: 2 }),
      U('sea_drakkar', 'Драккар', 6, 'siege', [], '⛵', { count: 2 }),
      U('sea_skald', 'Скальд', 2, 'siege', ['horn'], '🎻'),
      U('sea_healer', 'Знахарка', 3, 'ranged', ['medic'], '🌿'),
    ],
  },
};

/* =====================================================================
   НОВЫЕ КАРТЫ (пока без картинок — рисуется значок).
   Чтобы дать карте картинку, положите img/cards/<id>.jpg
   и img/cards/thumbs/<id>.jpg — игра подхватит её сама.
   ===================================================================== */
const ART = (id) => ({ ...IMG(id), optionalArt: true });
const EXTRA_CARDS = [
  // ---- Легенды ----
  U('tescha', 'Тёща', 10, 'siege', ['hero'], '👵', { ...ART('tescha'), rarity: 'legendary',
    quote: '«Я же говорила, что он тебе не пара!»' }),
  U('batya', 'Батя с ремнём', 8, 'melee', ['hero', 'scorch'], '👨‍🦳', { ...ART('batya'), rarity: 'legendary',
    quote: '«Ну всё. Сейчас кто-то получит.»' }),

  // ---- Отряды ----
  U('gop_kolyan', 'Гопник Колян', 3, 'melee', ['muster'], '🧢', { ...ART('gop_kolyan'), rarity: 'common', muster: 'gop',
    quote: '«Слышь, есть чё?»' }),
  U('gop_tolyan', 'Гопник Толян', 3, 'melee', ['muster'], '🧢', { ...ART('gop_tolyan'), rarity: 'common', muster: 'gop',
    quote: '«А ты с какого района?»' }),
  U('gop_vovan', 'Гопник Вован', 3, 'melee', ['muster'], '🧢', { ...ART('gop_vovan'), rarity: 'common', muster: 'gop',
    quote: '«Позвонить дай, брат.»' }),
  U('babki', 'Бабки у подъезда', 4, 'ranged', ['spy'], '👀', { ...ART('babki'), rarity: 'rare',
    quote: '«А эта-то, с третьего этажа, опять с новым!»' }),
  U('kachok', 'Качок из подвала', 4, 'melee', ['bond'], '🏋️', { ...ART('kachok'), rarity: 'common', count: 2,
    quote: '«Ты ваще сколько жмёшь?»' }),
  U('tamada', 'Тамада', 2, 'ranged', ['horn'], '🎤', { ...ART('tamada'), rarity: 'rare',
    quote: '«А теперь — конкурс!»' }),
  U('perforator', 'Сосед с перфоратором', 5, 'siege', ['shoot'], '🔨', { ...ART('perforator'), rarity: 'rare', value: 3,
    quote: '«Суббота, восемь утра — самое время.»' }),
  U('uchastkovy', 'Участковый', 6, 'melee', ['dispel'], '👮', { ...ART('uchastkovy'), rarity: 'epic',
    quote: '«Тааак. Что тут у нас?»' }),
  U('taksist', 'Таксист-философ', 4, 'agile', ['draw'], '🚕', { ...ART('taksist'), rarity: 'common',
    quote: '«Я тебе так скажу, брат: жизнь — она как дорога…»' }),
  U('garazh_muzhiki', 'Мужики из гаражей', 4, 'siege', ['reinforce'], '🔧', { ...ART('garazh_muzhiki'), rarity: 'epic',
    quote: '«Щас мужиков позову — разберёмся.»' }),
  U('feldsher', 'Фельдшер скорой', 3, 'siege', ['medic'], '🚑', { ...ART('feldsher'), rarity: 'rare',
    quote: '«Ну что, опять упал? Сам упал?»' }),
  U('rybak', 'Рыбак с байками', 3, 'ranged', ['income'], '🎣', { ...ART('rybak'), rarity: 'rare',
    quote: '«Вот такую вчера вытащил! Не веришь?»' }),
  U('garmonist', 'Гармонист на свадьбе', 2, 'siege', ['morale'], '🪗', { ...ART('garmonist'), rarity: 'common',
    quote: '«Эх, раз, ещё раз!»' }),
  U('dvorovy_pes', 'Дворовый пёс Шарик', 5, 'melee', ['stealth'], '🐕', { ...ART('dvorovy_pes'), rarity: 'rare',
    quote: '«Его все кормят, но никто не поймает.»' }),

  // ---- Особые карты ----
  S('kirpich', 'damage', 'Кирпич с балкона', '🧱', { ...ART('kirpich'), rarity: 'rare', value: 6,
    quote: '«Он сам выпал. Честно.»' }),
  S('tapok', 'damage', 'Летящий тапок', '🩴', { ...ART('tapok'), rarity: 'common', value: 2, count: 2,
    quote: '«Мать — лучший снайпер в мире.»' }),
  S('shaurma', 'curse', 'Шаурма с вокзала', '🌯', { ...ART('shaurma'), rarity: 'epic',
    quote: '«Пахнет вкусно. Это и подозрительно.»' }),
  S('korporativ', 'rowdmg', 'Утро после корпоратива', '🥴', { ...ART('korporativ'), rarity: 'rare', value: 2,
    quote: '«Кто мне вчера налил последнюю?»' }),
  S('svadba', 'scorch', 'Драка на свадьбе', '💍', { ...ART('svadba'), rarity: 'epic',
    quote: '«Ни одна нормальная свадьба без этого не обходится.»' }),
  S('mama_zvonit', 'discard', 'Мама звонит', '📞', { ...ART('mama_zvonit'), rarity: 'common',
    quote: '«Ты покушал? Шапку надел?»' }),
  S('avans', 'draw2', 'Аванс пришёл', '💸', { ...ART('avans'), rarity: 'rare',
    quote: '«Гуляем! До зарплаты как-нибудь доживём.»' }),
  S('rynok', 'shop', 'Барахолка на рынке', '🧺', { ...ART('rynok'), rarity: 'common',
    quote: '«Бери, дорогой, для тебя — скидка!»' }),
  S('banya', 'heal', 'Банька с веником', '🧖', { ...ART('banya'), rarity: 'epic',
    quote: '«С лёгким паром!»' }),
  S('pirozhki', 'healOne', 'Бабушкины пирожки', '🥟', { ...ART('pirozhki'), rarity: 'common', value: 3, cleanse: true,
    quote: '«Ешь давай, совсем худой стал.»' }),
  S('garazh', 'fort', 'Гараж', '🏚️', { ...ART('garazh'), rarity: 'rare',
    quote: '«Не просто гараж — мужская крепость.»' }),
  S('sto_gramm', 'horn', 'Сто грамм для храбрости', '🥃', { ...ART('sto_gramm'), rarity: 'common',
    quote: '«Для сугреву и для смелости.»' }),
  S('otmazka', 'decoy', 'Отмазка', '🤷', { ...ART('otmazka'), rarity: 'common',
    quote: '«Я вообще мимо проходил.»' }),
  S('dozhd', 'weather', 'Ливень на шашлыках', '🌧️', { ...ART('dozhd'), rarity: 'rare', wrow: 'ranged',
    quote: '«Каждый раз! Каждый раз на майские!»' }),
  S('nashatyr', 'clear', 'Нашатырь', '🧪', { ...ART('nashatyr'), rarity: 'common',
    quote: '«Нюхни — и как новенький.»' }),
];

// Служебное: проставляем принадлежность карт
(function () {
  SHARED_CARDS.forEach((c) => { c.faction = 'shared'; });
  EXTRA_CARDS.forEach((c) => { c.faction = 'shared'; });
  for (const k in FACTIONS) {
    FACTIONS[k].key = k;
    FACTIONS[k].cards.forEach((c) => { c.faction = k; });
  }
})();

// Шаблон карты рога — используется способностью лидера
const LEADER_HORN_DEF = S('leader_horn', 'horn', 'Боевой рог лидера', '📯');
// Щит, который ставит «Кент на Подхвате»
const COVER_SHIELD_DEF = S('cover_shield', 'shield', 'Щит кента', '🛡️', IMG('kent'));

function allCardDefs() {
  const out = [...SHARED_CARDS, ...EXTRA_CARDS];
  for (const k in FACTIONS) out.push(...FACTIONS[k].cards);
  return out;
}
