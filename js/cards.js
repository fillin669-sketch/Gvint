'use strict';
/* =====================================================================
   ТРОН — база карт
   ---------------------------------------------------------------------
   M(id, имя, мана, атака, здоровье, опции) — существо
   Sp(id, имя, мана, [эффекты], опции)     — заклинание
   Опции: kw (ключевые слова), bc (боевой клич), dr (предсмертный хрип),
          end (в конце вашего хода), aura, enrage, spellDiscount,
          cantAttack, noSteal, rarity, quote, count, icon, img
   Картинка: img/cards/<id>.jpg и img/cards/thumbs/<id>.jpg
   ===================================================================== */

const KEYWORDS = {
  taunt:     { name: 'Провокация',   icon: '🛡️', desc: 'Враги обязаны сначала атаковать это существо.' },
  charge:    { name: 'Рывок',        icon: '⚡', desc: 'Может атаковать сразу после розыгрыша.' },
  shield:    { name: 'Щит',          icon: '🔰', desc: 'Первый полученный урон полностью поглощается.' },
  stealth:   { name: 'Скрытность',   icon: '🥷', desc: 'Нельзя выбрать целью, пока само не атакует.' },
  poison:    { name: 'Яд',           icon: '☠️', desc: 'Убивает любое существо, которому нанесёт урон.' },
  windfury:  { name: 'Двойной удар', icon: '⚔️', desc: 'Может атаковать дважды за ход.' },
  lifesteal: { name: 'Вампиризм',    icon: '🩸', desc: 'Нанесённый урон лечит вашего героя.' },
  flying:    { name: 'Полёт',        icon: '🪽', desc: 'Атакует, не обращая внимания на Провокацию.' },
  dodge:     { name: 'Уворот',       icon: '💨', desc: 'Первая атака существа по нему проходит мимо.' },
  tough:     { name: 'Толстокожий',  icon: '🦏', desc: 'Получает на 1 урон меньше от любого источника.' },
  thorns:    { name: 'Шипы',         icon: '🌵', desc: 'Кто атакует это существо, получает 2 урона.' },
  untouchable: { name: 'Нездешний', icon: '⏳', desc: 'Неуязвим к любому урону и эффектам, пока сам не атакует.' },
  cleave:    { name: 'Размах',       icon: '🪓', desc: 'Атакуя существо, наносит ещё 2 урона его соседям слева и справа.' },
  pierce:    { name: 'Пробой',       icon: '🌀', desc: 'Атакует кого угодно, не глядя на Провокацию и Скрытность; удары пробивают Щит, Уворот, Толстокожесть, Шипы и броню героя.' },
  rush:      { name: 'Спешка',       icon: '🏃', desc: 'Может сразу атаковать существ (но не героя).' },
};

const RARITY_NAMES = { legendary: 'Легендарная', epic: 'Эпическая', rare: 'Редкая', common: 'Обычная' };

// В однофайловой версии картинки встроены в window.EMBED_ART
const ARTPATH = (p) => (typeof window !== 'undefined' && window.EMBED_ART && window.EMBED_ART[p]) || p;
const IMG = (id) => ({ img: ARTPATH(`img/cards/${id}.jpg`), thumb: ARTPATH(`img/cards/thumbs/${id}.jpg`) });
const ART = (id) => ({ ...IMG(id), optionalArt: true });   // картинки может не быть

function M(id, name, cost, atk, hp, o) {
  return Object.assign({ id, name, type: 'minion', cost, atk, hp, kw: [], icon: '❔', rarity: 'common' }, o || {});
}
function Sp(id, name, cost, fx, o) {
  return Object.assign({ id, name, type: 'spell', cost, fx, kw: [], icon: '✦', rarity: 'common' }, o || {});
}

/* ---------------- жетоны (призываемые существа) ---------------- */
const TOKENS = {
  recruit: { name: 'Новобранец', atk: 1, hp: 1, icon: '🪖' },
  kitten:  { name: 'Котёнок-рыцарь', atk: 1, hp: 1, icon: '🐱', img: 'umilenie' },
  boba:    { name: 'Боба', atk: 2, hp: 2, icon: '💪', img: 'biba_boba', kw: ['taunt'] },
  teen:    { name: 'Малолетка', atk: 1, hp: 1, icon: '🍺', img: 'maloletki' },
  muzhik:  { name: 'Мужик из гаража', atk: 2, hp: 2, icon: '🔧' },
  garage:  { name: 'Гараж', atk: 0, hp: 5, icon: '🏚️', kw: ['taunt'], cantAttack: true },
  bone:    { name: 'Костяк', atk: 1, hp: 1, icon: '💀' },
  baby:    { name: 'Ребёнок', atk: 2, hp: 2, icon: '👶' },
  dog:     { name: 'Пёс', atk: 1, hp: 1, icon: '🐕', img: 'vot_chto' },
  bugaichik: { name: 'Бугайчик', atk: 2, hp: 2, icon: '👹', img: 'bugai' },
};

/* =====================================================================
   ВАШИ КАРТЫ (с картинками)
   ===================================================================== */
const SHARED_CARDS = [
  // ---- новые легенды ----
  M('bard', 'Блядский Бард на Жабе', 9, 6, 8, { ...IMG('bard'), rarity: 'legendary', icon: '🪕',
    bc: [{ e: 'stunAllEnemy' }, { e: 'debuffAll', a: 2 }], aura: { atk: 1 },
    quote: '«Он не герой, не мудрец и даже не человек. Он просто еблан с лютней, жабой и армией пьяных шлюх.»' }),
  M('shaman', 'Сраный Шаман-Говномант', 8, 6, 6, { ...IMG('shaman'), rarity: 'legendary', icon: '💩',
    bc: [{ e: 'silenceElite', minAtk: 5 }, { e: 'debuffAll', a: 3 }],
    quote: '«Очисть поле, блядь, естественным путём!»' }),
  M('govnomet', 'Говномёт-3000', 6, 2, 8, { ...IMG('govnomet'), rarity: 'legendary', icon: '🛞', cantAttack: true,
    end: [{ e: 'aoe', n: 2, who: 'enemyMinions' }],
    quote: '«Срать на врагов — это не метафора, а тактика!»' }),
  M('mantikora', 'Бухой Мантикора-Таксист', 9, 7, 7, { ...IMG('mantikora'), rarity: 'legendary', icon: '🚕', kw: ['charge'],
    bc: [{ e: 'bounceRandomEnemy', n: 2 }],
    quote: '«Куда едем, блять? В пизду, говоришь? Поехали!»' }),
  M('dragon_ass', 'Жопный Дракон', 10, 8, 7, { ...IMG('dragon_ass'), rarity: 'legendary', icon: '🐉', noSteal: true,
    bc: [{ e: 'aoe', n: 3, who: 'enemyMinions' }], end: [{ e: 'dmgRandomEnemy', n: 2 }],
    quote: '«Садись ближе, пидор, щас дам дыхнуть могуществом!»' }),
  M('gus', 'Гусь-Ебанатор', 9, 6, 6, { ...IMG('gus'), rarity: 'legendary', icon: '🪿',
    bc: [{ e: 'aoe', n: 2, who: 'enemyMinions' }, { e: 'debuffAll', a: 2 }],
    quote: '«Га-га, сука, встаньте на колени!»' }),
  M('enot', 'Пиздокрылый Енот-Наркоман', 7, 6, 5, { ...IMG('enot'), rarity: 'legendary', icon: '🦝', kw: ['flying', 'dodge'],
    bc: [{ e: 'dmg', n: 5, t: 'enemyMinion' }], end: [{ e: 'chance', p: 0.5, fx: [{ e: 'dmgRandomEnemy', n: 3 }] }],
    quote: '«Ебанутый, но летает. А это уже, сука, уважение.»' }),
  M('kreditor', 'Пиздодракон Кредитор', 8, 6, 7, { ...IMG('kreditor'), rarity: 'legendary', icon: '📜',
    bc: [{ e: 'dmgStrongestEnemy', n: 6, debt: 2 }],
    quote: '«Долги надо отдавать, пидор. Даже в аду.»' }),
  M('baba_snaryad', 'Баба-Снаряд', 8, 6, 5, { female: true, ...IMG('baba_snaryad'), rarity: 'legendary', icon: '🍺', kw: ['charge'],
    bc: [{ e: 'aoe', n: 2, who: 'enemyMinions' }, { e: 'stunRandomEnemy', n: 1 }], kill: [{ e: 'healSelf', n: 3 }],
    quote: '«Летит, орёт, давит — и ещё просит добавки!»' }),

  // ---- влияние и контроль ----
  Sp('vot_chto', 'Вот что будет с тобой', 2, [{ e: 'transform', t: 'enemyMinion' }], { ...IMG('vot_chto'), rarity: 'epic', icon: '🐕',
    note: 'Превращает вражеское существо в самое слабое другое существо из колоды противника; если такого нет — в «Пса» 1/1. Не действует на легендарные карты.',
    quote: '«Вжух и ты теперь пёс.»' }),
  M('para', 'Ultimate Пара', 5, 4, 3, { ...IMG('para'), rarity: 'epic', icon: '💞', dr: [{ e: 'summonCopy' }, { e: 'buffAll', a: 1, h: 1 }],
    quote: '«Влюблённые сердца не сломит буря.»' }),
  M('nadezhda', 'Надежда', 5, 4, 4, { ...IMG('nadezhda'), rarity: 'epic', icon: '🗡️', female: true, kw: ['charge', 'cleave'],
    quote: '«Пиздюли достанутся всем)»' }),
  M('zamanchivy', 'Заманчивый взгляд', 4, 2, 4, { ...IMG('zamanchivy'), rarity: 'epic', icon: '💋', female: true, bc: [{ e: 'charmRandom', n: 2 }],
    quote: '«Кокетное подмигивание — путь к сердцам»' }),

  // ---- путешественник между мирами ----
  M('khtoya', 'Хтоя?', 4, 3, 4, { ...IMG('khtoya'), rarity: 'epic', icon: '❓', kw: ['untouchable'],
    quote: '«Где я блять?»' }),
  M('putnik', 'Пространственный путник', 6, 3, 6, { ...IMG('putnik'), rarity: 'epic', icon: '🌀', kw: ['windfury', 'pierce'],
    quote: '«А я уже пришёл»' }),
  Sp('vzglyad', 'Взгляд убийцы', 3, [{ e: 'mark', n: 2, t: 'enemy', turns: 4 }], { ...IMG('vzglyad'), rarity: 'epic', icon: '👉',
    note: 'Существо получает урон, пока живо; вражеский герой — 4 хода подряд.', quote: '«Я тебя щас уничтожу»' }),

  // ---- экстра-легенда ----
  M('gigaslav_pro', 'GiGa$lav Pro+', 10, 7, 8, { ...IMG('gigaslav_pro'), rarity: 'legendary', icon: '🦅', kw: ['taunt', 'shield'], resist: true,
    bc: [{ e: 'destroyFemale' }, { e: 'purify' }],
    quote: '«Бывшие не возвращаются. Они стираются.»' }),
  M('byvshaya', 'Бывшая', 5, 4, 4, { ...IMG('byvshaya'), rarity: 'epic', icon: '💔', female: true,
    bc: [{ e: 'debuff', a: 3, h: 0, t: 'enemyMinion' }], end: [{ e: 'dmgHero', n: 2 }], dr: [{ e: 'debuffAll', a: 1 }],
    quote: '«Та, что клялась в верности… оказалась лишь красивой ложью.»' }),

  // ---- легенды ----
  M('gigaslav', 'Гигаслав', 7, 5, 6, { ...IMG('gigaslav'), rarity: 'legendary', icon: '👑', kw: ['taunt', 'shield'], resist: true,
    quote: '«Блудные женщины — испытание для слабых. Я не слабый.»' }),
  M('magnat', 'Денежный Магнат', 5, 4, 7, { ...IMG('magnat'), rarity: 'legendary', icon: '💶', end: [{ e: 'draw', n: 1 }],
    quote: '«В этой войне побеждает не только клинок, но и кошелёк.»' }),
  M('boroda', 'Шикарная Борода', 5, 4, 6, { ...IMG('boroda'), rarity: 'legendary', icon: '🧔', kw: ['taunt', 'thorns'], bc: [{ e: 'armor', n: 4 }],
    quote: '«На НАХУЙ отлетела шваль!»' }),
  M('pisyunchik_zol', 'Писюнчик зол и готов рвать тузы!', 6, 7, 4, { ...IMG('pisyunchik_zol'), rarity: 'legendary', icon: '🐱', kw: ['charge'],
    quote: '«Писюнчик зол и готов рвать тузы!»' }),
  M('ohotniki', 'Охотники, но не любовники', 4, 3, 4, { ...IMG('ohotniki'), rarity: 'legendary', icon: '🦌', aura: { atk: 1 },
    quote: '«Охотники, но не любовники!»' }),
  M('bolno', 'Я делать твоя больно', 5, 5, 4, { ...IMG('bolno'), rarity: 'legendary', icon: '🪓', bc: [{ e: 'dmg', n: 3, t: 'any' }], kill: [{ e: 'draw', n: 1 }],
    quote: '«Твоя жизнь сломлена!»' }),

  // ---- эпические и редкие существа ----
  M('ohota', 'Охота на Нелюдей', 5, 3, 4, { ...IMG('ohota'), rarity: 'epic', icon: '🐺', bc: [{ e: 'aoe', n: 2, who: 'enemyMinions' }],
    quote: '«Здесь людям место, а не всякой нечисти!»' }),
  M('berserk', 'Ярость Берсерка', 4, 3, 5, { ...IMG('berserk'), rarity: 'epic', icon: '💢', enrage: { atk: 2 }, kill: [{ e: 'selfBuff', a: 1, h: 1 }],
    quote: '«Иди сюда, мармышка!»' }),
  M('bugai', 'Призыв: Бугай', 5, 4, 5, { ...IMG('bugai'), rarity: 'epic', icon: '👹', kw: ['taunt'], dr: [{ e: 'summon', token: 'bugaichik', n: 1 }],
    quote: '«Вот теперь можно и повеселиться!»' }),
  M('szadi', 'Появление Сзади', 3, 4, 2, { ...IMG('szadi'), rarity: 'epic', icon: '🕵️', kw: ['stealth'],
    quote: '«Тихо… не убегай. Будет интересно…»' }),
  M('biba_boba', 'Биба и Боба', 3, 2, 2, { ...IMG('biba_boba'), rarity: 'epic', icon: '💪', count: 2,
    bc: [{ e: 'summon', token: 'boba', n: 1 }, { e: 'fetch', id: 'istoriya', chance: 0.95 }],
    quote: '«Главное прийти, а приключения всегда найдутся»' }),
  M('umilenie', 'Умиление', 4, 3, 3, { ...IMG('umilenie'), rarity: 'epic', icon: '🐾', bc: [{ e: 'summon', token: 'kitten', n: 3 }],
    quote: '«Котята, вперёд! Покажите ему, что милота — тоже сила!»' }),
  M('ubezhdenie', 'Убеждение: Перерождение Веры', 5, 3, 4, { ...IMG('ubezhdenie'), rarity: 'epic', icon: '☀️',
    bc: [{ e: 'steal', t: 'enemyMinion', maxAtk: 2 }],
    quote: '«Вера в тебя — это лишь вопрос правильных слов…»' }),
  M('pricha', 'Соблазнительная Прича', 4, 3, 4, { female: true, ...IMG('pricha'), rarity: 'epic', icon: '💘', kw: ['lifesteal'],
    bc: [{ e: 'stun', t: 'enemyMinion' }],
    quote: '«Сопротивление? Милая… ты уже проиграла.»' }),
  M('stvol', 'Носил с собою ствол', 3, 3, 2, { ...IMG('stvol'), rarity: 'epic', icon: '🔫', bc: [{ e: 'dmg', n: 2, t: 'any' }],
    quote: '«Носил с собою ствол… носил патрон в стволе.»' }),
  M('magaslav', 'МагаСлав', 6, 4, 4, { ...IMG('magaslav'), rarity: 'epic', icon: '🦁', bc: [{ e: 'summonFromDeck', n: 2, maxCost: 3 }],
    quote: '«Приходи один, мы тоже одни будем»' }),
  M('poilo', 'Великолепное пойло', 3, 2, 4, { ...IMG('poilo'), rarity: 'epic', icon: '🍾', bc: [{ e: 'buffAll', a: 1, h: 0, others: true }],
    quote: '«Один глоток дарует силу льва, но забирает твёрдость шага…»' }),
  M('bol', 'Анальная Боль', 4, 4, 3, { ...IMG('bol'), rarity: 'epic', icon: '🔧', kw: ['poison'],
    quote: '«Тут не про милосердие — тут про крики!»' }),
  M('tobi_ninja', 'Тоби', 3, 3, 2, { ...IMG('tobi_ninja'), rarity: 'epic', icon: '🥷', kw: ['stealth', 'windfury'],
    quote: '«Ты бьёшь по воздуху, приятель.»' }),
  M('karlik', 'Горбатый Карлик', 2, 2, 3, { ...IMG('karlik'), rarity: 'rare', icon: '🐴', bc: [{ e: 'debuff', a: 2, h: 0, t: 'enemyMinion' }],
    quote: '«Сначала себя в порядок приведи, карлик…»' }),
  M('baryga', 'Барыга', 3, 2, 3, { ...IMG('baryga'), rarity: 'rare', icon: '⚖️', spellDiscount: 1, end: [{ e: 'gold', n: 1 }],
    quote: '«Не обманешь — не продашь!»' }),
  M('kent', 'Кент на Подхвате', 2, 2, 3, { ...IMG('kent'), rarity: 'common', icon: '🛡️', kw: ['taunt', 'tough'], count: 2,
    quote: '«Один в поле не воин, а вдвоём уже банда.»' }),
  M('semki', 'Семки у Подъезда', 2, 1, 2, { ...IMG('semki'), rarity: 'common', icon: '🌻', bc: [{ e: 'draw', n: 1 }], count: 2,
    quote: '«Сидим, никого не трогаем, примус починяем.»' }),

  // ---- заклинания ----
  Sp('gibel', 'Гибель', 6, [{ e: 'destroyRandomEnemy', n: 2 }], { ...IMG('gibel'), rarity: 'legendary', icon: '💀',
    quote: '«Сова на скакалке!»' }),
  Sp('kaka', 'Моя делать кака — твой дом гореть!', 6, [{ e: 'aoe', n: 4, who: 'allMinions' }], { ...IMG('kaka'), rarity: 'legendary', icon: '🔥', storm: 'toxic',
    quote: '«Моя делать кака… твой дом гореть!»' }),
  Sp('pisyunchik_zametil', 'Писюнчик вас заметил!', 4, [{ e: 'aoe', n: 2, who: 'enemyMinions' }], { ...IMG('pisyunchik_zametil'), rarity: 'legendary', icon: '🐾',
    quote: '«Вам не избежать проблем!»' }),
  Sp('tobi', 'Тоби Пизда', 4, [{ e: 'dmg', n: 6, t: 'any' }], { ...IMG('tobi'), rarity: 'legendary', icon: '🔥', antiTobi: true,
    note: 'Может поразить Тоби даже в Скрытности — и тогда уничтожает его.', quote: '«Тоби? Ну тут тебе пизда.»' }),
  Sp('udostoverenie', 'Удостоверение «Умелый Пенис»', 3, [{ e: 'buff', a: 3, h: 3, t: 'friendlyMinion' }], { ...IMG('udostoverenie'), rarity: 'epic', icon: '📜',
    quote: '«Не просто титул — доказанный навык.»' }),
  Sp('spid', 'Спид', 5, [{ e: 'aoe', n: 3, who: 'enemyMinions' }], { ...IMG('spid'), rarity: 'legendary', icon: '☣️', storm: 'haze',
    quote: '«Это не просто болезнь… это стиль жизни!»' }),
  Sp('mihail', 'Твою змею укротил Михаил', 2, [{ e: 'setAtk', n: 1, t: 'enemyMinion' }], { ...IMG('mihail'), rarity: 'legendary', icon: '🐍',
    quote: '«Твою змею укротил Михаил!»' }),
  Sp('verbovka', 'Вербовка', 8, [{ e: 'steal', t: 'enemyMinion' }], { ...IMG('verbovka'), rarity: 'epic', icon: '🤝',
    quote: '«Иногда врага не нужно уничтожать — достаточно предложить ему лучшую сторону.»' }),
  Sp('nasmeshka', 'Насмешка', 1, [{ e: 'silence', t: 'enemyMinion' }], { ...IMG('nasmeshka'), rarity: 'rare', icon: '🃏',
    quote: '«Ну серьёзно… ебать ты чмоня!»' }),
  Sp('delishki', 'Обсудим делишки насущные', 3, [{ e: 'draw', n: 2 }], { ...IMG('delishki'), rarity: 'rare', icon: '🪙',
    quote: '«Деньги любят тишину… Но мы с ними поговорим.»' }),
  Sp('torgovlya', 'Торговая Точка', 2, [{ e: 'discover' }], { ...IMG('torgovlya'), rarity: 'epic', icon: '🛒',
    quote: '«Тапки БибуДаст — ходи с комфортом!»' }),
  Sp('hrabrost', 'Храбрость и Сила', 2, [{ e: 'buffAll', a: 2, h: 0, temp: true }], { ...IMG('hrabrost'), rarity: 'rare', icon: '🍺',
    quote: '«У вас будет похмелье — смотри не сдохни!»' }),
  Sp('pidozra', 'У меня Пидозра', 2, [{ e: 'reveal' }, { e: 'draw', n: 1 }], { ...IMG('pidozra'), rarity: 'epic', icon: '⚖️',
    quote: '«Я чувствую… здесь что-то не чисто.»' }),
  Sp('srachka', 'Жёсткая Срачка', 3, [{ e: 'aoe', n: 2, who: 'allMinions' }], { ...IMG('srachka'), rarity: 'legendary', icon: '💩', storm: 'toxic',
    quote: '«Даже величайшие герои склоняются перед силой кишечника.»' }),
  Sp('maloletki', 'Малолетки', 2, [{ e: 'summon', token: 'teen', n: 3 }], { ...IMG('maloletki'), rarity: 'epic', icon: '🍻', storm: 'haze',
    quote: '«Ща будет бухалово»' }),
  Sp('yager', 'Ягермейстер', 4, [{ e: 'buffAll', a: 1, h: 1 }, { e: 'healHero', n: 4 }], { ...IMG('yager'), rarity: 'legendary', icon: '🦌', storm: 'gold',
    quote: '«Ну мёд, ну мёд по телу!!!!»' }),
  Sp('istoriya', 'Одна история охуительнее другой', 3, [{ e: 'stunRandomEnemy', n: 2 }, { e: 'buffAll', a: 1, h: 0 }], { ...IMG('istoriya'), rarity: 'epic', icon: '📜',
    quote: '«Не перебивай, там дальше вообще пиздец!»' }),
  Sp('obrez', 'Огнестрел: Обрез', 3, [{ e: 'dmg', n: 4, t: 'minion' }], { ...IMG('obrez'), rarity: 'rare', icon: '💥',
    quote: '«Аргумент, против которого не попрёшь.»' }),
  Sp('podzatylnik', 'Пацанский Подзатыльник', 1, [{ e: 'dmg', n: 1, t: 'enemyMinion', stun: true }], { ...IMG('podzatylnik'), rarity: 'common', icon: '✋', count: 2,
    quote: '«Для профилактики и ясности ума.»' }),
  Sp('nalog', 'Налоговая Проверка', 3, [{ e: 'stealCard' }], { ...IMG('nalog'), rarity: 'rare', icon: '📕',
    quote: '«Заплати налоги и спи спокойно… в канаве.»' }),
  Sp('obratka', 'Обратка', 3, [{ e: 'faceDmgHand' }], { ...IMG('obratka'), rarity: 'epic', icon: '🪞',
    quote: '«Свой яд пей сам, братишка.»' }),
  Sp('lager', 'Укреплённый Лагерь', 3, [{ e: 'buffAll', a: 0, h: 2 }], { ...IMG('lager'), rarity: 'rare', icon: '🏰',
    quote: '«Пока стоят стены — враг не пройдёт.»' }),
  Sp('korobka', 'Картонная Коробка', 0, [{ e: 'armor', n: 3 }], { ...IMG('korobka'), rarity: 'common', icon: '📦',
    quote: '«Гениальная маскировка всех времён.»' }),
  Sp('rassol', 'Рассол с Утра', 3, [{ e: 'resurrect' }], { ...IMG('rassol'), rarity: 'common', icon: '🥒',
    quote: '«Эликсир, перед которым бессильна даже смерть.»' }),
  Sp('kompot', 'Бабушкин Компот', 3, [{ e: 'healAll', n: 4 }], { ...IMG('kompot'), rarity: 'rare', icon: '🍒',
    quote: '«Закрыто с любовью — открыто к победе!»' }),
  Sp('doshirak', 'Живительный Доширак', 2, [{ e: 'heal', n: 6, t: 'friendly', cleanse: true }], { ...IMG('doshirak'), rarity: 'rare', icon: '🍜',
    quote: '«Заварил кипяточком — и снова в строй!»' }),
  Sp('podorozhnik', 'Подорожник', 1, [{ e: 'heal', n: 3, t: 'any' }], { ...IMG('podorozhnik'), rarity: 'common', icon: '🌿',
    quote: '«Лучшая медицина со времён динозавров.»' }),
  Sp('ugol', 'Активированный Уголь', 1, [{ e: 'healHero', n: 2 }, { e: 'draw', n: 1 }], { ...IMG('ugol'), rarity: 'common', icon: '⚫',
    quote: '«Десять таблеток — и ты снова человек.»' }),
];

/* =====================================================================
   НОВЫЕ КАРТЫ (пока без картинок — рисуется значок)
   ===================================================================== */
const EXTRA_CARDS = [
  M('tescha', 'Тёща', 8, 6, 9, { female: true, ...ART('tescha'), rarity: 'legendary', icon: '👵', kw: ['taunt'], bc: [{ e: 'stunAllEnemy' }],
    quote: '«Я же говорила, что он тебе не пара!»' }),
  M('batya', 'Батя с ремнём', 7, 5, 5, { ...ART('batya'), rarity: 'legendary', icon: '👨‍🦳', bc: [{ e: 'destroy', t: 'enemyMinion', minAtk: 5 }],
    quote: '«Ну всё. Сейчас кто-то получит.»' }),
  M('gop_kolyan', 'Гопник Колян', 2, 2, 2, { ...ART('gop_kolyan'), icon: '🧢', kw: ['rush'], group: 'gop', bc: [{ e: 'muster', group: 'gop' }], quote: '«Слышь, есть чё?»' }),
  M('gop_tolyan', 'Гопник Толян', 2, 2, 2, { ...ART('gop_tolyan'), icon: '🧢', kw: ['rush'], group: 'gop', bc: [{ e: 'muster', group: 'gop' }], quote: '«А ты с какого района?»' }),
  M('gop_vovan', 'Гопник Вован', 2, 2, 2, { ...ART('gop_vovan'), icon: '🧢', kw: ['rush'], group: 'gop', bc: [{ e: 'muster', group: 'gop' }], quote: '«Позвонить дай, брат.»' }),
  M('babki', 'Бабки у подъезда', 1, 1, 2, { female: true, ...ART('babki'), rarity: 'rare', icon: '👀', kw: ['taunt'], bc: [{ e: 'drawBoth' }],
    quote: '«А эта-то, с третьего этажа, опять с новым!»' }),
  M('kachok', 'Качок из подвала', 3, 3, 3, { ...ART('kachok'), icon: '🏋️', kw: ['taunt'], count: 2, bc: [{ e: 'selfBuffIf', id: 'kachok', a: 2, h: 2 }],
    quote: '«Ты ваще сколько жмёшь?»' }),
  M('sborshik', 'Сборщик металлолома', 3, 3, 3, { ...ART('sborshik'), rarity: 'rare', icon: '🛒', kill: [{ e: 'gold', n: 2 }],
    quote: '«Это не мусор — это капитал.»' }),
  M('vyshibala', 'Вышибала из кабака', 4, 3, 4, { ...ART('vyshibala'), rarity: 'rare', icon: '🚪', kw: ['taunt', 'thorns'],
    quote: '«Не положено.»' }),
  M('kot_vasya', 'Кот Вася', 1, 1, 1, { ...ART('kot_vasya'), icon: '🐈', kw: ['dodge', 'rush'], count: 2,
    quote: '«Мяу. В смысле — пошёл вон.»' }),
  Sp('lombard', 'Ломбард', 1, [{ e: 'gold', n: 3 }], { ...ART('lombard'), rarity: 'rare', icon: '💍', quote: '«Сдал кольцо — получил на жизнь.»' }),
  // ---- стена из Провокаций ----
  M('okhrannik', 'Охранник в магазине', 2, 1, 4, { ...ART('okhrannik'), icon: '🕴️', kw: ['taunt'], count: 2,
    quote: '«Сумочку к осмотру.»' }),
  M('ochered', 'Очередь в поликлинику', 3, 2, 5, { ...ART('ochered'), icon: '🧓', kw: ['taunt'],
    quote: '«Я только спросить!»' }),
  M('zabor', 'Забор с гвоздями', 3, 0, 6, { ...ART('zabor'), rarity: 'rare', icon: '🚧', kw: ['taunt', 'thorns'], cantAttack: true,
    quote: '«Не влезай — убьёт.»' }),
  M('shkaf', 'Тёщин шкаф', 4, 2, 7, { ...ART('shkaf'), rarity: 'rare', icon: '🗄️', kw: ['taunt', 'tough'],
    quote: '«Там ещё бабушкины шубы.»' }),
  M('bychok', 'Бык из качалки', 6, 5, 7, { ...ART('bychok'), rarity: 'epic', icon: '🐂', kw: ['taunt', 'thorns'],
    quote: '«Ещё подход — и домой.»' }),
  M('svekrov', 'Свекровь', 6, 4, 7, { ...ART('svekrov'), rarity: 'epic', icon: '👩‍🦳', female: true, kw: ['taunt'],
    bc: [{ e: 'debuff', a: 2, h: 0, t: 'enemyMinion' }], quote: '«Я тебе как мать говорю.»' }),
  Sp('krysha', 'Крыша', 2, [{ e: 'buff', a: 0, h: 2, t: 'friendlyMinion', kw: 'taunt' }], { ...ART('krysha'), rarity: 'rare', icon: '🛡️',
    quote: '«Мы за тебя впряжёмся.»' }),
  M('tamada', 'Тамада', 3, 2, 3, { ...ART('tamada'), rarity: 'rare', icon: '🎤', end: [{ e: 'buffRandomFriendly', a: 1, h: 1 }],
    quote: '«А теперь — конкурс!»' }),
  M('perforator', 'Сосед с перфоратором', 5, 3, 4, { ...ART('perforator'), rarity: 'rare', icon: '🔨', end: [{ e: 'dmgRandomEnemy', n: 1 }],
    quote: '«Суббота, восемь утра — самое время.»' }),
  M('uchastkovy', 'Участковый', 4, 3, 5, { ...ART('uchastkovy'), rarity: 'epic', icon: '👮', kw: ['taunt'], bc: [{ e: 'stun', t: 'enemyMinion' }],
    quote: '«Тааак. Что тут у нас?»' }),
  M('taksist', 'Таксист-философ', 3, 3, 2, { ...ART('taksist'), icon: '🚕', kw: ['charge'],
    quote: '«Я тебе так скажу, брат: жизнь — она как дорога…»' }),
  M('garazh_muzhiki', 'Мужики из гаражей', 4, 3, 3, { ...ART('garazh_muzhiki'), rarity: 'epic', icon: '🔧', bc: [{ e: 'summon', token: 'muzhik', n: 2 }],
    quote: '«Щас мужиков позову — разберёмся.»' }),
  M('feldsher', 'Фельдшер скорой', 3, 2, 4, { ...ART('feldsher'), rarity: 'rare', icon: '🚑', end: [{ e: 'healHero', n: 3 }],
    quote: '«Ну что, опять упал? Сам упал?»' }),
  M('rybak', 'Рыбак с байками', 2, 1, 3, { ...ART('rybak'), rarity: 'rare', icon: '🎣', end: [{ e: 'chance', p: 0.5, fx: [{ e: 'draw', n: 1 }] }],
    quote: '«Вот такую вчера вытащил! Не веришь?»' }),
  M('garmonist', 'Гармонист на свадьбе', 2, 2, 2, { ...ART('garmonist'), icon: '🪗', bc: [{ e: 'buffRandomFriendly', a: 1, h: 1 }],
    quote: '«Эх, раз, ещё раз!»' }),
  M('dvorovy_pes', 'Дворовый пёс Шарик', 2, 2, 2, { ...ART('dvorovy_pes'), rarity: 'rare', icon: '🐕', kw: ['stealth', 'dodge'],
    quote: '«Его все кормят, но никто не поймает.»' }),
  Sp('kirpich', 'Кирпич с балкона', 2, [{ e: 'dmg', n: 3, t: 'any' }], { ...ART('kirpich'), rarity: 'rare', icon: '🧱', quote: '«Он сам выпал. Честно.»' }),
  Sp('tapok', 'Летящий тапок', 1, [{ e: 'dmg', n: 2, t: 'minion' }], { ...ART('tapok'), icon: '🩴', count: 2, quote: '«Мать — лучший снайпер в мире.»' }),
  Sp('shaurma', 'Шаурма с вокзала', 2, [{ e: 'debuff', a: 2, h: 1, t: 'enemyMinion' }], { ...ART('shaurma'), rarity: 'epic', icon: '🌯', quote: '«Пахнет вкусно. Это и подозрительно.»' }),
  Sp('korporativ', 'Утро после корпоратива', 3, [{ e: 'aoe', n: 1, who: 'enemyMinions' }, { e: 'stunAllEnemy' }], { ...ART('korporativ'), rarity: 'rare', icon: '🥴', quote: '«Кто мне вчера налил последнюю?»' }),
  Sp('svadba', 'Драка на свадьбе', 7, [{ e: 'destroyAll' }], { ...ART('svadba'), rarity: 'epic', icon: '💍', quote: '«Ни одна нормальная свадьба без этого не обходится.»' }),
  Sp('mama_zvonit', 'Мама звонит', 2, [{ e: 'discardEnemy' }, { e: 'draw', n: 1 }], { ...ART('mama_zvonit'), icon: '📞', quote: '«Ты покушал? Шапку надел?»' }),
  Sp('avans', 'Аванс пришёл', 0, [{ e: 'mana', n: 1 }, { e: 'gold', n: 1 }], { ...ART('avans'), rarity: 'rare', icon: '💸', quote: '«Гуляем! До зарплаты как-нибудь доживём.»' }),
  Sp('rynok', 'Барахолка на рынке', 1, [{ e: 'randomCard' }], { ...ART('rynok'), icon: '🧺', quote: '«Бери, дорогой, для тебя — скидка!»' }),
  Sp('banya', 'Банька с веником', 3, [{ e: 'buffAll', a: 0, h: 1 }, { e: 'healAll', n: 99 }], { ...ART('banya'), rarity: 'epic', icon: '🧖', quote: '«С лёгким паром!»' }),
  Sp('pirozhki', 'Бабушкины пирожки', 2, [{ e: 'buff', a: 1, h: 3, t: 'friendlyMinion' }], { ...ART('pirozhki'), icon: '🥟', quote: '«Ешь давай, совсем худой стал.»' }),
  Sp('garazh', 'Гараж', 3, [{ e: 'summon', token: 'garage', n: 1 }, { e: 'armor', n: 2 }], { ...ART('garazh'), rarity: 'rare', icon: '🏚️', quote: '«Не просто гараж — мужская крепость.»' }),
  Sp('sto_gramm', 'Сто грамм для храбрости', 1, [{ e: 'buff', a: 3, h: 0, t: 'friendlyMinion', temp: true }], { ...ART('sto_gramm'), icon: '🥃', quote: '«Для сугреву и для смелости.»' }),
  Sp('otmazka', 'Отмазка', 2, [{ e: 'bounce', t: 'minion' }], { ...ART('otmazka'), icon: '🤷', quote: '«Я вообще мимо проходил.»' }),
  Sp('dozhd', 'Ливень на шашлыках', 3, [{ e: 'debuffAll', a: 1 }, { e: 'draw', n: 1 }], { ...ART('dozhd'), rarity: 'rare', icon: '🌧️', storm: 'rain', quote: '«Каждый раз! Каждый раз на майские!»' }),
  Sp('nashatyr', 'Нашатырь', 1, [{ e: 'unstun' }, { e: 'draw', n: 1 }], { ...ART('nashatyr'), icon: '🧪', quote: '«Нюхни — и как новенький.»' }),
];

/* =====================================================================
   ГЕРОИНИ — теперь это легендарные существа-карты
   ===================================================================== */
const HEROINE_CARDS = [
  M('wife', 'Кредитная Жена №1', 7, 6, 8, { ...IMG('wife'), rarity: 'legendary', icon: '💳', female: true,
    bc: [{ e: 'marryRandom' }], end: [{ e: 'debtRandom', n: 1 }],
    quote: '«Любовь — это тоже контракт. А контракт у меня всегда с процентами!»' }),
  M('realtor', 'Риелторша Вечного Займа', 7, 5, 8, { ...IMG('realtor'), rarity: 'legendary', icon: '🏠', female: true, kw: ['taunt'],
    bc: [{ e: 'armor', n: 5 }, { e: 'debt', n: 2, t: 'enemyMinion' }], end: [{ e: 'healHero', n: 3 }],
    quote: '«Любовь, семья, дети, ипотека — всё включено, котик… подписывай, пока горячая ставка!»' }),
  M('cheetah', 'Бегущая Мать-Гепард', 7, 6, 6, { ...IMG('cheetah'), rarity: 'legendary', icon: '🍼', female: true, kw: ['charge'],
    bc: [{ e: 'pregnant', t: 'enemyMinion' }], dr: [{ e: 'summon', token: 'baby', n: 2 }],
    quote: '«Пробежалась мимо — и ты уже отец, муж и ипотечный раб!»' }),
  M('granny', 'Бабка-Репродукторша', 6, 4, 7, { ...IMG('granny'), rarity: 'legendary', icon: '⏳', female: true,
    bc: [{ e: 'pregnant', t: 'enemyMinion' }], end: [{ e: 'healAll', n: 2 }],
    quote: '«Щас я тебе быстренько семью, ипотеку и троих подгоню!»' }),
];

/* Карты, которые раньше принадлежали героиням (без картинок) */
EXTRA_CARDS.push(
  Sp('w_dogovor', 'Брачный договор', 3, [{ e: 'steal', t: 'enemyMinion', maxAtk: 3 }], { ...ART('w_dogovor'), icon: '📃', rarity: 'epic', quote: '«Подпиши здесь, здесь и вот тут — навсегда.»' }),
  Sp('w_kreditka', 'Кредитка с драконом', 1, [{ e: 'mana', n: 1 }, { e: 'draw', n: 1 }], { ...ART('w_kreditka'), icon: '💳', quote: '«Лимит? Не слышала.»' }),
  M('w_svidetel', 'Свидетельница на свадьбе', 3, 2, 4, { ...ART('w_svidetel'), female: true, icon: '💐', rarity: 'rare', bc: [{ e: 'marryRandom' }], quote: '«Горько! Горько!»' }),
  Sp('r_klyuchi', 'Ключи от квартиры', 2, [{ e: 'armor', n: 4 }, { e: 'draw', n: 1 }], { ...ART('r_klyuchi'), icon: '🔑', quote: '«Дом, милый займ.»' }),
  M('r_kollektor', 'Коллектор', 4, 4, 4, { ...ART('r_kollektor'), icon: '📇', rarity: 'rare', bc: [{ e: 'debt', n: 2, t: 'enemyMinion' }], quote: '«Мы просто поговорим.»' }),
  M('r_novostroyka', 'Новостройка', 5, 2, 8, { ...ART('r_novostroyka'), icon: '🏢', rarity: 'epic', kw: ['taunt', 'tough'], quote: '«Сдача — в следующем квартале. Какого года — не уточняем.»' }),
  M('c_aist', 'Аист с доставкой', 2, 2, 2, { ...ART('c_aist'), icon: '🕊️', kw: ['flying'], dr: [{ e: 'summon', token: 'baby', n: 1 }], quote: '«Распишитесь в получении.»' }),
  Sp('c_test', 'Тест на две полоски', 2, [{ e: 'pregnant', t: 'enemyMinion' }, { e: 'draw', n: 1 }], { ...ART('c_test'), icon: '🧪', rarity: 'rare', quote: '«Ну всё, поздравляю.»' }),
  Sp('c_matkapital', 'Маткапитал', 3, [{ e: 'summon', token: 'baby', n: 2 }], { ...ART('c_matkapital'), icon: '💰', rarity: 'rare', quote: '«Государство поможет. Наверное.»' }),
  Sp('g_dekret', 'Декретный таймер', 3, [{ e: 'pregnantRandom' }, { e: 'pregnantRandom' }], { ...ART('g_dekret'), icon: '⏰', rarity: 'epic', quote: '«Тик-так, касатик.»' }),
  M('g_vnuk', 'Любимый внук', 3, 3, 3, { ...ART('g_vnuk'), icon: '🧒', bc: [{ e: 'healHero', n: 3 }], quote: '«Ба, я ненадолго!»' }),
  Sp('g_noski', 'Вязаные носки', 3, [{ e: 'buff', a: 2, h: 2, t: 'friendlyMinion', kw: 'taunt' }], { ...ART('g_noski'), icon: '🧦', rarity: 'rare', quote: '«Надень, а то простудишься.»' }),
);

/* =====================================================================
   ИГРОКИ, СИЛА ГЕРОЯ И ПОЛЯ
   ===================================================================== */
/* Натура героя: сила (раз в ход) и постоянный бонус */
const SOULS = {
  stubborn: { name: 'Упрямство', icon: '🐏', color: '#e0453a', hue: 0,
    passive: 'Один раз за игру смертельный удар оставляет героя с 1 здоровьем. Старт с 3 бронёй.',
    power: { name: 'Стойка', cost: 2, icon: '🛡️', fx: [{ e: 'armor', n: 3 }], desc: 'Получите 3 брони.' } },
  kind: { name: 'Доброта', icon: '🥧', color: '#4fd06a', hue: 110,
    passive: 'Герой начинает игру с 35 здоровья.',
    power: { name: 'Подорожник', cost: 2, icon: '🌿', fx: [{ e: 'heal', n: 4, t: 'any' }], desc: 'Восстановите 4 здоровья любому персонажу.' } },
  brave: { name: 'Наглость', icon: '🍺', color: '#ff9a2e', hue: 25,
    passive: 'Ваши существа с Рывком или Спешкой имеют +1 к атаке.',
    power: { name: 'Удар по столу', cost: 2, icon: '✊', fx: [{ e: 'dmg', n: 1, t: 'any' }], desc: 'Нанесите 1 урон любому персонажу.' } },
  patient: { name: 'Терпение', icon: '🎣', color: '#4aa3ff', hue: 200,
    passive: 'В стартовой руке на 1 карту больше.',
    power: { name: 'Выжидание', cost: 3, icon: '⏳', fx: [{ e: 'buffRandomFriendly', a: 0, h: 2 }], desc: 'Случайное ваше существо получает +0/+2.' } },
  greedy: { name: 'Жадность', icon: '💰', color: '#f2c14e', hue: 45,
    passive: 'За каждого убитого врага — 2 золота вместо 1. Лавка дешевле на 1.',
    power: { name: 'Заначка', cost: 1, icon: '🪙', fx: [{ e: 'gold', n: 1 }], desc: 'Получите 1 золото.' } },
};

/* Артефакт: стартовый бонус */
const ARTIFACTS = {
  mug:   { name: 'Бездонная кружка', icon: '🍺', desc: 'В начале игры +5 брони.' },
  sock:  { name: 'Счастливый носок', icon: '🧦', desc: 'В начале игры — «Медяк» в руку.' },
  piggy: { name: 'Копилка', icon: '🐷', desc: 'Начинаете с 3 золота.' },
  key:   { name: 'Ключ от гаража', icon: '🗝️', desc: 'Первое разыгранное вами существо получает +2/+2.' },
  ring:  { name: 'Кольцо бывшей', icon: '💍', desc: 'Каждое ваше заклинание лечит вашего героя на 1.' },
};

const SHOP_COST = 3;   // золото за карту в Лавке

const FIELDS = {
  zags:    { name: 'ЗАГС', icon: '💒', desc: 'Розовый мрамор, кольца и звон колоколов.' },
  office:  { name: 'Агентство недвижимости', icon: '🏢', desc: 'Договоры, часы и стук печатной машинки.' },
  night:   { name: 'Ночной забег', icon: '🌃', desc: 'Ночная улица, ветер и стук сердца.' },
  nursery: { name: 'Декретная лаборатория', icon: '🧪', desc: 'Бурлящий котёл и музыкальная шкатулка.' },
};

// «Медяк» — бонус второму игроку
const COIN = Sp('coin', 'Медяк', 0, [{ e: 'mana', n: 1 }], { icon: '🪙', rarity: 'common', quote: '«На удачу.»' });

/* ---------------- служебное ---------------- */
(function () {
  SHARED_CARDS.push(...HEROINE_CARDS);
  SHARED_CARDS.forEach((c) => { c.cls = 'shared'; });
  EXTRA_CARDS.forEach((c) => { c.cls = 'extra'; });
  COIN.cls = 'shared';
})();

function allCardDefs() {
  const out = [...SHARED_CARDS, ...EXTRA_CARDS, COIN];
  return out;
}

/* =====================================================================
   ТЕКСТ КАРТ — собирается из эффектов
   ===================================================================== */
const TGT = {
  any: 'любому персонажу', minion: 'существу', enemyMinion: 'вражескому существу',
  friendlyMinion: 'вашему существу', friendly: 'вашему персонажу', enemy: 'врагу',
};
const TGT_ACC = {
  any: 'любого персонажа', minion: 'существо', enemyMinion: 'вражеское существо',
  friendlyMinion: 'ваше существо', friendly: 'вашего персонажа', enemy: 'врага',
};

function tokenText(key) {
  const t = TOKENS[key];
  return `«${t.name}» ${t.atk}/${t.hp}${t.kw ? ' с ' + t.kw.map((k) => KEYWORDS[k].name).join(', ') : ''}`;
}

function effText(f) {
  switch (f.e) {
    case 'dmg': return `Нанесите ${f.n} урона ${TGT[f.t]}${f.stun ? ' и оглушите его' : ''}.`;
    case 'heal': return `Восстановите ${f.n} здоровья ${TGT[f.t]}${f.cleanse ? ' и снимите с него оглушение и долги' : ''}.`;
    case 'buff': return `Дайте ${TGT[f.t]} +${f.a}/+${f.h}${f.kw ? ' и ' + KEYWORDS[f.kw].name : ''}${f.temp ? ' до конца хода' : ''}.`;
    case 'debuff': return `${TGT_ACC[f.t][0].toUpperCase() + TGT_ACC[f.t].slice(1)} получает −${f.a}${f.h ? '/−' + f.h : ' атаки'}.`;
    case 'setAtk': return `Атака ${TGT[f.t].replace(/у$/, 'а')} становится ${f.n}.`;
    case 'stun': return `Оглушите ${TGT_ACC[f.t]}: оно пропустит свою следующую атаку.`;
    case 'destroy': return `Уничтожьте ${TGT_ACC[f.t]}${f.minAtk ? ` с атакой ${f.minAtk} и больше` : ''}.`;
    case 'steal': return `Возьмите под контроль ${TGT_ACC[f.t]}${f.maxAtk != null ? ` с атакой ${f.maxAtk} или меньше` : ''}.`;
    case 'bounce': return `Верните ${TGT_ACC[f.t]} в руку владельца.`;
    case 'bounceRandomEnemy': return `Высадите ${f.n} случайных вражеских существ — они возвращаются в руку владельца.`;
    case 'silence': return `${TGT_ACC[f.t][0].toUpperCase() + TGT_ACC[f.t].slice(1)} теряет все свойства.`;
    case 'silenceElite': return `Вражеские существа с атакой ${f.minAtk}+ теряют все свойства.`;
    case 'aoe': return `Нанесите ${f.n} урона ${{ enemyMinions: 'всем вражеским существам', allMinions: 'ВСЕМ существам', enemyAll: 'всем врагам' }[f.who]}.`;
    case 'stunAllEnemy': return 'Оглушите всех вражеских существ.';
    case 'stunRandomEnemy': return `Оглушите ${f.n} случайных вражеских существ.`;
    case 'debuffAll': return `Вражеские существа получают −${f.a} атаки.`;
    case 'buffAll': return `${f.others ? 'Другие ваши существа' : 'Ваши существа'} получают +${f.a}/+${f.h}${f.temp ? ' до конца хода' : ''}.`.replace('/+0', ' атаки').replace('+0/', '+0/');
    case 'buffRandomFriendly': return `Случайное другое ваше существо получает +${f.a}/+${f.h}.`;
    case 'healHero': return `Восстановите ${f.n} здоровья вашему герою.`;
    case 'healAll': return f.n >= 99 ? 'Полностью вылечите всех ваших персонажей.' : `Восстановите ${f.n} здоровья всем вашим персонажам.`;
    case 'draw': return f.n === 1 ? 'Возьмите карту.' : `Возьмите ${f.n} карты.`;
    case 'drawBoth': return 'Каждый игрок берёт карту.';
    case 'discardEnemy': return 'Противник сбрасывает случайную карту.';
    case 'stealCard': return 'Заберите случайную карту из руки противника.';
    case 'discover': return 'Посмотрите 3 карты своей колоды и возьмите одну.';
    case 'randomCard': return 'Получите случайную общую карту.';
    case 'summon': return `Призовите ${f.n > 1 ? f.n + '× ' : ''}${tokenText(f.token)}.`;
    case 'summonFromDeck': return `Выставьте из колоды ${f.n} случайных существа стоимостью до ${f.maxCost}.`;
    case 'muster': return 'Выставьте из колоды всех других гопников.';
    case 'fetch': return 'С вероятностью 95% достаньте из колоды «Одну историю охуительнее другой».';
    case 'armor': return `Получите ${f.n} брони.`;
    case 'mana': return `Получите ${f.n} ману в этом ходу.`;
    case 'resurrect': return 'Воскресите случайное ваше погибшее существо.';
    case 'destroyRandomEnemy': return `Уничтожьте ${f.n} случайных вражеских существ.`;
    case 'destroyAll': return 'Уничтожьте ВСЕХ существ.';
    case 'dmgRandomEnemy': return `Нанесите ${f.n} урона случайному врагу.`;
    case 'dmgStrongestEnemy': return `Нанесите ${f.n} урона сильнейшему вражескому существу${f.debt ? ` и повесьте на него «Долг» (−${f.debt} атаки каждый ход)` : ''}.`;
    case 'reveal': return 'Вражеские существа теряют Скрытность, Щит и Провокацию.';
    case 'faceDmgHand': return 'Нанесите вражескому герою урон, равный числу карт в его руке.';
    case 'selfBuffIf': return 'Если у вас есть другой «Качок» — получает +2/+2.';
    case 'chance': return `С вероятностью ${Math.round(f.p * 100)}%: ${f.fx.map(effText).join(' ').replace(/^./, (c) => c.toLowerCase())}`;
    case 'charmRandom': return `Очаруйте ${f.n} случайных вражеских существ: они не могут атаковать, пока это существо на столе.`;
    case 'transform': return 'Превратите вражеское существо (не легенду) в более слабое существо из колоды противника.';
    case 'summonCopy': return 'Возвращается на стол с вдвое меньшими атакой и здоровьем (один раз).';
    case 'mark': return `Возьмите на прицел ${TGT_ACC[f.t]}: в начале каждого вашего хода он получает ${f.n} урона.`;
    case 'selfBuff': return `Получает +${f.a}/+${f.h}.`;
    case 'healSelf': return `Восстанавливает себе ${f.n} здоровья.`;
    case 'gold': return `Получите ${f.n} золота 🪙.`;
    case 'destroyFemale': return 'Уничтожьте всех существ женского пола на поле (у обоих игроков).';
    case 'purify': return 'Снимите с ваших существ оглушение, долги, беременность и браки.';
    case 'dmgHero': return `Нанесите ${f.n} урона вражескому герою.`;
    case 'unstun': return 'Снимите оглушение со всех ваших существ.';
    case 'marryRandom': return 'Два случайных вражеских существа женятся: оба −2 атаки. Если врагов меньше двух — 2 урона вражескому герою.';
    case 'debt': return `${TGT_ACC[f.t][0].toUpperCase() + TGT_ACC[f.t].slice(1)} получает «Долг»: −${f.n} атаки в начале каждого своего хода.`;
    case 'debtRandom': return `Случайное вражеское существо получает «Долг» (−${f.n} атака каждый ход).`;
    case 'pregnant': return `${TGT_ACC[f.t][0].toUpperCase() + TGT_ACC[f.t].slice(1)} «беременеет»: −2 атаки, через 2 ваших хода у вас рождается «Ребёнок» 2/2.`;
    case 'pregnantRandom': return 'Случайное вражеское существо «беременеет»: −2 атаки, через 2 ваших хода у вас рождается «Ребёнок» 2/2.';
    default: return '';
  }
}

/** Части текста карты: [{name, text}] */
function cardTextParts(c) {
  const out = [];
  (c.kw || []).forEach((k) => out.push({ name: `${KEYWORDS[k].icon} ${KEYWORDS[k].name}`, text: KEYWORDS[k].desc }));
  if (c.cantAttack) out.push({ name: '⛔ Орудие', text: 'Не может атаковать.' });
  if (c.noSteal) out.push({ name: '🔒 Неподкупный', text: 'Его нельзя переманить.' });
  if (c.female) out.push({ name: '♀ Женщина', text: 'Женское существо.' });
  if (c.resist) out.push({ name: '🚫 Барьер целомудрия', text: 'Иммунитет к манипуляциям: его нельзя переманить, оглушить, ослабить, лишить свойств, женить или сделать «беременным».' });
  if (c.bc) out.push({ name: '📣 Клич', text: c.bc.map(effText).join(' ') });
  if (c.fx) out.push({ name: '✨ Эффект', text: c.fx.map(effText).join(' ') });
  if (c.dr) out.push({ name: '⚰️ Предсмертный хрип', text: c.dr.map(effText).join(' ') });
  if (c.kill) out.push({ name: '🗡️ Добивание', text: 'Когда это существо убивает врага в атаке: ' + c.kill.map(effText).join(' ').replace(/^./, (x) => x.toLowerCase()) });
  if (c.end) out.push({ name: '🌙 В конце вашего хода', text: c.end.map(effText).join(' ') });
  if (c.aura) out.push({ name: '✴️ Аура', text: `Ваши другие существа имеют +${c.aura.atk} к атаке.` });
  if (c.enrage) out.push({ name: '💢 Ярость', text: `Каждый раз, получив урон и выжив, получает +${c.enrage.atk} к атаке.` });
  if (c.spellDiscount) out.push({ name: '🏷️ Скидка', text: `Ваши заклинания стоят на ${c.spellDiscount} меньше.` });
  if (c.note) out.push({ name: '❗ Особо', text: c.note });
  return out;
}

/** Короткий текст для маленькой карты в руке */
function cardShortText(c) {
  const kws = (c.kw || []).map((k) => KEYWORDS[k].name);
  const parts = [];
  if (kws.length) parts.push(kws.join(', ') + '.');
  if (c.bc) parts.push('Клич: ' + c.bc.map(effText).join(' '));
  if (c.fx) parts.push(c.fx.map(effText).join(' '));
  if (c.dr) parts.push('Хрип: ' + c.dr.map(effText).join(' '));
  if (c.kill) parts.push('Добивание: ' + c.kill.map(effText).join(' '));
  if (c.end) parts.push('Конец хода: ' + c.end.map(effText).join(' '));
  if (c.aura) parts.push(`Другие ваши +${c.aura.atk} атаки.`);
  if (c.enrage) parts.push(`Ранен — +${c.enrage.atk} атаки.`);
  if (c.spellDiscount) parts.push('Заклинания дешевле на 1.');
  if (c.cantAttack) parts.push('Не атакует.');
  if (c.resist) parts.push('Иммунитет к манипуляциям.');
  return parts.join(' ');
}
