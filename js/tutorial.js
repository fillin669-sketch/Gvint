'use strict';
/* =====================================================================
   ОБУЧЕНИЕ — сценарная партия с подсказками.
   Каждый шаг: текст, подсвеченный элемент и чего ждём от игрока:
   'next' (кнопка «Далее»), действие (сыграть карту, атаковать…) или 'zoom'.
   ===================================================================== */

const Tut = (() => {
  let active = false, free = false, step = 0, aiTurn = 0, prevLevel = null;

  const S = () => App.s;
  const handEl = (id) => {
    const c = S() && S().players[0].hand.find((x) => x.id === id);
    return c ? document.querySelector(`#hand [data-h="${c.uid}"]`) : null;
  };
  const minionEl = (side, id) => {
    const m = S() && S().players[side].board.find((x) => x.id === id);
    return m ? document.querySelector(`#arena [data-t="${m.uid}"]`) : null;
  };
  const uidOf = (side, id) => { const m = S().players[side].board.find((x) => x.id === id); return m && m.uid; };

  const STEPS = [
    { next: true, el: () => document.querySelector('#op-zone .hero'),
      text: '👑 Добро пожаловать в <b>ТРОН</b>! Наверху — вражеский претендент. Цель игры — опустить его здоровье (<b>красное сердце</b>) до нуля. В обучении у него всего 12.' },
    { next: true, el: () => document.querySelector('#me-zone .hero'),
      text: 'Внизу — вы. У вас 30 здоровья. Значок у портрета — ваша <b>натура</b>: от неё зависят сила героя и постоянный бонус.' },
    { next: true, el: () => $('#me-info'),
      text: 'Синие кристаллы — <b>мана</b>. Каждый ход их становится на 1 больше, и они полностью восстанавливаются. Сейчас у вас 2 маны.' },
    { next: true, el: () => $('#hand'),
      text: 'Внизу — ваша рука. Число в <b>синем кружке</b> — цена карты в мане. <b>Зелёная рамка</b> — карту можно сыграть прямо сейчас.' },
    { want: { type: 'play', id: 'kent' }, el: () => handEl('kent'),
      text: 'Сыграйте существо: нажмите на <b>«Кента на Подхвате»</b>, а потом на <b>своё поле</b> — нижнюю половину стола.' },
    { next: true, el: () => minionEl(0, 'kent'),
      text: 'Кент на поле! 💤 — он спит: существа атакуют только <b>со следующего хода</b>. 🛡️ <b>Провокация</b> — враги обязаны бить сначала его. 🦏 <b>Толстокожий</b> — получает на 1 урон меньше.' },
    { want: { type: 'end' }, el: () => $('#btn-end'),
      text: 'Мана закончилась. Нажмите <b>«Конец хода»</b> — теперь ходит противник.' },
    { pos: 'bottom', next: true, afterAI: true, el: () => minionEl(1, 'semki'),
      text: 'Противник выставил «Семки у Подъезда». <b>Жёлтый ромб</b> — атака (1), <b>красное сердце</b> — здоровье (2).' },
    { want: { pos: 'bottom', type: 'attack', id: 'kent', targetId: 'semki' }, el: () => minionEl(0, 'kent'),
      text: 'Ваш ход! Атакуйте: нажмите на <b>Кента</b> (у него зелёная рамка), потом на вражеские <b>Семки</b>.' },
    { next: true, el: () => minionEl(0, 'kent'),
      text: 'Существа бьют друг друга <b>одновременно</b>. Кент убил Семки, а их удар погасила Толстокожесть. За убитого врага вы получили 🪙 <b>золото</b>.' },
    { want: { pos: 'bottom', type: 'play', id: 'kirpich', target: 'h1' }, el: () => handEl('kirpich'),
      text: '<b>Заклинания</b> срабатывают сразу. Нажмите «Кирпич с балкона», а потом <b>вражеского героя</b> — 3 урона!' },
    { want: { type: 'end' }, el: () => $('#btn-end'),
      text: 'Осталась 1 мана — этого мало. Завершите ход.' },
    { pos: 'bottom', next: true, afterAI: true, el: () => minionEl(1, 'karlik'),
      text: 'Противник выставил «Горбатого Карлика». У многих карт есть 📣 <b>боевой клич</b> — эффект, который срабатывает при розыгрыше.' },
    { want: { pos: 'bottom', type: 'power' }, el: () => document.querySelector('[data-power="0"]'),
      text: 'Круглая кнопка рядом с портретом — <b>сила героя</b> ✊. Нажмите её, затем Карлика: 1 урон. Стоит 2 маны, раз в ход.' },
    { want: 'zoom', el: () => $('#hand'),
      text: 'Любую карту можно рассмотреть крупно: <b>подержите на ней палец</b> (на компьютере — правая кнопка мыши). Закройте просмотр нажатием.' },
    { next: true, el: () => $('#btn-shop'),
      text: '🛒 <b>Лавка</b>: раз в ход за золото можно купить карту. Золото даётся за каждого убитого врага.' },
    { next: true, el: null, last: true,
      text: 'Теперь сами! Атакуйте Кентом, разыгрывайте карты и бейте героя, а когда ходы кончатся — «Конец хода». Удачи!' },
  ];

  /* ---------------- партия обучения ---------------- */
  async function start() {
    closeZoom();
    $('#modal').classList.add('hidden');
    const s = createGame({ field: 'zags', soul: 'brave', artifact: null }, { field: 'night', soul: 'brave', artifact: null }, false, 0);
    const P = s.players[0], O = s.players[1];
    const mk = (ids, owner) => ids.map((id) => inst(defOf(id), owner));
    P.hand = mk(['kent', 'kirpich', 'semki', 'obrez'], 0);
    P.deck = mk(['taksist', 'stvol', 'pisyunchik_zol', 'ohota', 'bugai', 'gigaslav', 'biba_boba', 'umilenie', 'gibel', 'magaslav', 'berserk', 'bolno'], 0);
    O.hand = mk(['semki', 'karlik'], 1);
    O.deck = mk(['tapok', 'kent', 'semki', 'podorozhnik', 'kot_vasya', 'karlik', 'tapok', 'kent', 'semki'], 1);
    O.hp = 12;
    P.maxMana = 1; O.maxMana = 1;   // первый ход сразу с 2 маной
    active = true; free = false; step = 0; aiTurn = 0;
    prevLevel = AI.level;
    AI.setLevel('easy');
    resetView(s);
    Sound.setLocation('zags');
    show('game');
    addLog('🎓 Обучение');
    await beginGame(s, CTX);
    O.hand = O.hand.filter((c) => c.id !== 'coin');
    App.busy = false;
    render();
    FX.setZones([$('#field-op'), $('#field-me')]);
    FX.setAmbient(true);
    showPreview(null);
    banner('Обучение', 'Следуйте подсказкам', 1300);
    decorate();
  }

  /** Ходы противника по сценарию */
  function aiAction(s) {
    if (free) return null;   // дальше — обычный ИИ (уровень задаёт start)
    const script = [['semki'], ['karlik']][aiTurn];
    if (!script) return null;
    const O = s.players[1];
    for (const id of script) {
      const c = O.hand.find((x) => x.id === id);
      if (c && canPlay(s, 1, c)) return { type: 'play', uid: c.uid, target: null };
    }
    aiTurn++;
    return { type: 'end' };
  }

  function matches(a) {
    const st = STEPS[step];
    const w = st && st.want;
    if (!w || w === 'zoom' || a.type !== w.type) return false;
    const s = S();
    if (w.type === 'play') {
      const c = s.players[0].hand.find((x) => x.uid === a.uid);
      if (!c || c.id !== w.id) return false;
      if (w.target && a.target !== w.target) return false;
    }
    if (w.type === 'attack') {
      if (a.uid !== uidOf(0, w.id) || a.target !== uidOf(1, w.targetId)) return false;
    }
    return true;
  }

  function event(name) {
    if (active && !free && STEPS[step] && STEPS[step].want === name) setTimeout(advance, 300);
  }

  function advance() {
    if (STEPS[step] && STEPS[step].last) { free = true; decorate(); return; }
    step++;
    decorate();
  }

  function nudge() {
    const el = $('#tut');
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
    Sound.play('debuff');
  }

  function decorate() {
    document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    const box = $('#tut');
    const st = STEPS[step];
    const s = S();
    const waiting = st && st.afterAI && s && (s.current !== 0 || App.looping);
    if (!active || free || !st || waiting || !s) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.classList.toggle('bottom', st.pos === 'bottom');
    box.querySelector('.tut-step').textContent = `Обучение · шаг ${step + 1} из ${STEPS.length}`;
    box.querySelector('.tut-text').innerHTML = st.text;
    $('#tut-next').classList.toggle('hidden', !st.next);
    $('#tut-next').textContent = st.last ? 'Играть ➜' : 'Далее ➜';
    const el = st.el && st.el();
    if (el) el.classList.add('tut-glow');
  }

  // совпадение проверяется до действия (потом карты в руке уже нет), засчитывается после
  let pendingOk = false;
  function allow(a) { pendingOk = !free && matches(a); return free || pendingOk; }
  function after() { if (pendingOk) { pendingOk = false; advance(); } }

  function finish(winner) {
    if (prevLevel) { AI.setLevel(prevLevel); prevLevel = null; }
    active = false;
    decorate();
    try { localStorage.setItem('tron-tut-done', '1'); } catch (e) { /* ignore */ }
    Sound.play(winner === 0 ? 'win' : 'lose');
    setTimeout(() => {
      modal(`<h2>${winner === 0 ? '🎓 Обучение пройдено!' : 'Почти получилось!'}</h2>
        <p>${winner === 0 ? 'Вы знаете всё, чтобы бороться за Трон.' : 'Противник оказался сильнее. Попробуйте ещё раз или сразу в бой.'}<br><br>
        В меню выберите <b>поле</b>, <b>натуру героя</b> и <b>артефакт</b> — и вперёд.</p>
        <div class="mbtns"><button class="btn btn-gold" data-v="play">⚔ В бой</button><button class="btn" data-v="again">Пройти ещё раз</button><button class="btn" data-v="menu">В меню</button></div>`)
        .then((v) => { if (v === 'play') startGame(); else if (v === 'again') start(); else goMenu(); });
    }, 900);
  }

  function stop() {
    if (prevLevel) { AI.setLevel(prevLevel); prevLevel = null; }
    active = false;
    free = false;
    const box = $('#tut');
    if (box) box.classList.add('hidden');
    document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#tut-next').addEventListener('click', (e) => { e.stopPropagation(); advance(); });
    $('#tut-skip').addEventListener('click', (e) => { e.stopPropagation(); free = true; decorate(); });
  });

  return {
    get active() { return active; },
    start, stop, finish, aiAction, nudge, decorate, event,
    allow, after,
  };
})();
