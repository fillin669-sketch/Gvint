'use strict';
/* =====================================================================
   ВИЗУАЛЬНЫЕ ЭФФЕКТЫ
   - анимированная погода на рядах (canvas)
   - искры, угли, обломки
   - «сгорание» уничтоженных карт, всплывающие числа, тряска стола
   Все координаты — в системе #stage (1280×640).
   ===================================================================== */

const FX = (() => {
  let cv = null, cx = null, layer = null;
  const KINDS = ['toxic', 'rain', 'haze', 'gold'];
  let zones = [];                                   // области поля для бури
  const level = { toxic: 0, rain: 0, haze: 0, gold: 0 }; // сила бури 0..1
  let target = { toxic: false, rain: false, haze: false, gold: false };
  const timers = {};
  let parts = [];
  let raf = 0, last = 0, t = 0;
  let MAX_PARTS = 420;
  // качество: high — всё; low — меньше частиц, без тумана и атмосферы, холст в половинном разрешении
  const Q = { name: 'high', mult: 1, fog: true, ambient: true };
  let ambientOn = false;

  function init() {
    cv = document.getElementById('fx-canvas');
    cx = cv.getContext('2d');
    layer = document.getElementById('fx-layer');
  }

  function setQuality(q) {
    const low = q === 'low';
    Q.name = q; Q.mult = low ? 0.4 : 1; Q.fog = !low; Q.ambient = !low;
    MAX_PARTS = low ? 160 : 420;
    if (!cv) return;
    const k = low ? 0.5 : 1;
    cv.width = 1280 * k; cv.height = 640 * k;
    cx = cv.getContext('2d');
    cx.setTransform(k, 0, 0, k, 0, 0);
    if (!low && ambientOn) kick();
  }

  /** Атмосфера: угольки и пылинки над столом, пока идёт партия */
  function setAmbient(on) {
    ambientOn = on;
    if (on) kick();
  }

  function spawnAmbient() {
    if (!ambientOn || !Q.ambient || !zones.length) return;
    let n = 0;
    for (const p of parts) if (p.kind === 'mote') n++;
    if (n >= 26 || Math.random() > 0.35) return;
    const R = pickRandom(zones);
    const ember = Math.random() < 0.45;
    add({ kind: 'mote', x: rand(R.x, R.x + R.w), y: R.y + R.h + 10, vx: rand(-8, 8), vy: rand(-28, -12), g: 0, life: rand(6, 11),
      r: ember ? rand(1.2, 2.2) : rand(0.8, 1.6), col: ember ? pickRandom(['#ffb347', '#ff8a3d', '#ffd36b']) : 'rgba(255,240,210,.8)', wob: rand(0, 6), ember });
  }

  // положение сцены меняется только при повороте/изменении окна — запоминаем
  let stageCache = null;
  function stageScale() {
    if (!stageCache) {
      const sr = document.getElementById('stage').getBoundingClientRect();
      stageCache = { sr, k: sr.width / 1280 || 1 };
    }
    return stageCache;
  }
  function invalidate() { stageCache = null; }

  function toStage(el, cache) {
    const { sr, k } = cache || stageScale();
    const r = el.getBoundingClientRect();
    return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
  }

  function setZones(els) {
    const c = stageScale();
    zones = els.filter(Boolean).map((el) => toStage(el, c));
  }

  /** Буря на всём поле на ms миллисекунд: toxic | rain | haze | gold */
  function storm(kind, ms) {
    if (!(kind in target)) return;
    target[kind] = true;
    clearTimeout(timers[kind]);
    timers[kind] = setTimeout(() => { target[kind] = false; }, ms || 3000);
    kick();
  }

  function clearAll() {
    parts = [];
    KINDS.forEach((k) => { target[k] = false; level[k] = 0; clearTimeout(timers[k]); });
    if (cx) cx.clearRect(0, 0, 1280, 640);
    if (layer) layer.innerHTML = '';
  }

  /* ---------------- частицы ---------------- */
  function add(p) {
    if (parts.length >= MAX_PARTS) return;
    p.age = 0;
    parts.push(p);
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  /** Взрыв частиц в точке. kind: ember | debris | spark | heal | shield | dust */
  function burst(x, y, kind, n, opts) {
    const count = Math.max(1, Math.round((n || 20) * Q.mult));
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 260);
      const p = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.5, 1.1), kind };
      if (kind === 'ember')  { p.vy -= 120; p.g = -40; p.r = rand(1.5, 3.5); p.col = pickRandom(['#ffb347', '#ff7b2b', '#ffd36b', '#ff4b1f']); }
      if (kind === 'debris') { p.g = 700; p.r = rand(3, 7); p.rot = rand(0, 6); p.vr = rand(-12, 12); p.col = pickRandom(['#6b4a2a', '#8a6a44', '#4a3a2a', '#9a8a70']); p.vy -= 200; }
      if (kind === 'spark')  { p.g = 300; p.r = rand(1, 2.5); p.col = pickRandom(['#fff3c4', '#ffd36b', '#ffffff']); p.life = rand(0.3, 0.7); }
      if (kind === 'heal')   { p.vx *= 0.25; p.vy = rand(-90, -40); p.g = 0; p.r = rand(2, 4); p.col = pickRandom(['#8dff8d', '#d8ffb0', '#5fe08a']); p.cross = true; }
      if (kind === 'shield') { p.g = 0; p.r = rand(1.5, 3); p.col = pickRandom(['#9ed8ff', '#e6f6ff', '#5aa0f0']); p.life = rand(0.4, 0.8); }
      if (kind === 'emoji')  { p.vy -= 160; p.g = 260; p.r = rand(18, 30); p.ch = opts && opts.ch; p.rot = rand(-0.5, 0.5); p.vr = rand(-3, 3); p.life = rand(0.9, 1.5); }
      if (kind === 'gold')   { p.g = 120; p.r = rand(1.5, 3.5); p.col = pickRandom(['#fff3c4', '#ffd36b', '#ffb52e', '#fff']); p.life = rand(0.6, 1.2); }
      if (kind === 'arcane') { p.g = -30; p.r = rand(1.5, 3.2); p.col = pickRandom(['#e3b6ff', '#b16cff', '#7a3cff', '#fff']); p.life = rand(0.6, 1.1); }
      if (kind === 'blue')   { p.g = 60; p.r = rand(1.2, 2.6); p.col = pickRandom(['#bfe3ff', '#5aa0f0', '#fff']); p.life = rand(0.4, 0.8); }
      if (kind === 'dust')   { p.vy = rand(-40, 10); p.vx *= 0.6; p.g = 30; p.r = rand(4, 9); p.col = 'rgba(200,180,140,.35)'; p.soft = true; p.life = rand(0.4, 0.8); }
      add(p);
    }
    kick();
  }

  function burstRect(r, kind, n, opts) { burst(r.x + r.w / 2, r.y + r.h / 2, kind, n, opts); }

  /* ---------------- погода ---------------- */
  // ближний бой — «кишечная» зелено-бурая муть с пузырями
  // дальний бой — ливень
  // осада — пьяный угар: янтарно-лиловая дымка и пена
  const FOG = {
    toxic: ['rgba(110,140,40,', 'rgba(120,90,30,'],
    rain:  ['rgba(150,170,200,', 'rgba(110,130,160,'],
    haze:  ['rgba(200,140,40,', 'rgba(150,60,170,'],
    gold:  ['rgba(255,210,110,', 'rgba(255,240,180,'],
  };

  function spawnWeather(dt) {
    for (const r of KINDS) {
      const L = level[r];
      if (L < 0.02) continue;
      for (const R of zones) {
        if (r === 'gold') {
          if (Math.random() < L * 20 * dt) add({ kind: 'spark', x: rand(R.x, R.x + R.w), y: rand(R.y, R.y + R.h), vx: 0, vy: rand(-40, -10), g: 0, life: rand(0.5, 1.2), r: rand(1.5, 3), col: pickRandom(['#ffe9a6', '#fff', '#ffd36b']) });
          continue;
        }
        if (r === 'rain') {
          const n = Math.round(L * 90 * dt * 10) / 10 + (Math.random() < (L * 90 * dt) % 1 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            add({ kind: 'rain', x: rand(R.x - 30, R.x + R.w), y: R.y - 10, vx: 120, vy: rand(650, 800), life: 1, bottom: R.y + R.h - 4, R });
          }
        } else if (r === 'toxic') {
          if (Math.random() < L * 30 * dt) {
            add({ kind: 'bubble', x: rand(R.x + 10, R.x + R.w - 10), y: R.y + R.h - 6, vx: 0, vy: rand(-45, -20), life: rand(1.4, 2.6), r: rand(3, 9),
              col: pickRandom(['rgba(150,180,60,', 'rgba(140,100,40,']), top: R.y + 6, wob: rand(0, 6) });
          }
        } else if (Math.random() < L * 24 * dt) {
          add({ kind: 'bubble', x: rand(R.x + 10, R.x + R.w - 10), y: R.y + R.h - 6, vx: rand(-10, 10), vy: rand(-35, -15), life: rand(1.6, 3), r: rand(2, 6),
            col: pickRandom(['rgba(255,240,200,', 'rgba(255,200,120,', 'rgba(220,170,255,']), top: R.y + 6, wob: rand(0, 6) });
        }
      }
    }
  }

  function drawFog() {
    for (const r of KINDS) {
      const L = level[r];
      if (L < 0.02) continue;
      for (const R of zones) {
        cx.save();
        cx.beginPath();
        cx.rect(R.x, R.y, R.w, R.h);
        cx.clip();
        const cols = FOG[r];
        for (let i = 0; i < 5; i++) {
          const speed = r === 'rain' ? 40 : 18;
          const span = R.w + 320;
          const x = R.x - 160 + ((t * speed * (i % 2 ? 1 : -0.7) + i * 230) % span + span) % span;
          const y = R.y + R.h * (0.3 + 0.4 * Math.sin(t * 0.6 + i * 1.7) * 0.5 + 0.2);
          const rad = 90 + 30 * Math.sin(t + i);
          const g = cx.createRadialGradient(x, y, 0, x, y, rad);
          const a = (r === 'rain' ? 0.18 : r === 'gold' ? 0.14 : 0.24) * L;
          g.addColorStop(0, cols[i % 2] + a + ')');
          g.addColorStop(1, cols[i % 2] + '0)');
          cx.fillStyle = g;
          cx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        if (r === 'rain') { // тёмная пелена дождя
          cx.fillStyle = `rgba(20,30,50,${0.25 * L})`;
          cx.fillRect(R.x, R.y, R.w, R.h);
        }
        cx.restore();
      }
    }
  }

  /* ---------------- цикл ---------------- */
  function busy() {
    return (ambientOn && Q.ambient) || parts.length > 0 || KINDS.some((r) => level[r] > 0.01 || target[r]);
  }

  function kick() {
    if (!raf && cx) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function frame(now) {
    // экономный режим и одни лишь пылинки — 30 кадров/с вместо 60
    const onlyAmbient = !parts.some((p) => p.kind !== 'mote') && !KINDS.some((r) => level[r] > 0.01 || target[r]);
    if ((Q.name === 'low' || onlyAmbient) && now - last < 30) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    for (const r of KINDS) {
      const goal = target[r] ? 1 : 0;
      level[r] += (goal - level[r]) * Math.min(1, dt * 1.6);
      if (!target[r] && level[r] < 0.01) level[r] = 0;
    }
    spawnWeather(dt);
    spawnAmbient();
    cx.clearRect(0, 0, 1280, 640);
    if (Q.fog) drawFog();

    const alive = [];
    for (const p of parts) {
      p.age += dt;
      if (p.kind === 'rain') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y >= p.bottom) {
          for (let i = 0; i < 2; i++) add({ kind: 'splash', x: p.x, y: p.bottom, vx: rand(-60, 60), vy: rand(-120, -60), g: 500, life: 0.25, r: 1.2, col: '#bcd6ff' });
          continue;
        }
        if (p.x > p.R.x + p.R.w) continue;
        cx.strokeStyle = 'rgba(190,215,255,.55)';
        cx.lineWidth = 1.3;
        cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); cx.stroke();
        alive.push(p);
        continue;
      }
      if (p.age >= p.life) continue;
      const k = 1 - p.age / p.life;
      if (p.kind === 'mote') {
        p.x += (p.vx + Math.sin(t * 1.3 + p.wob) * 10) * dt; p.y += p.vy * dt;
        const a = Math.min(1, p.age * 1.5) * k * (p.ember ? 0.9 : 0.45) * (0.7 + 0.3 * Math.sin(t * 6 + p.wob));
        cx.globalAlpha = a;
        cx.fillStyle = p.col;
        cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fill();
        if (p.ember) { cx.globalAlpha = a * 0.25; cx.beginPath(); cx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); cx.fill(); }
        cx.globalAlpha = 1;
        alive.push(p);
        continue;
      }
      if (p.kind === 'bubble') {
        p.y += p.vy * dt;
        const x = p.x + Math.sin(t * 3 + p.wob) * 4;
        if (p.y < p.top) { add({ kind: 'spark', x, y: p.y, vx: rand(-30, 30), vy: rand(-30, 10), g: 0, life: 0.2, r: 1, col: '#fff' }); continue; }
        cx.strokeStyle = p.col + (0.75 * k) + ')';
        cx.fillStyle = p.col + (0.25 * k) + ')';
        cx.lineWidth = 1.2;
        cx.beginPath(); cx.arc(x, p.y, p.r, 0, Math.PI * 2); cx.fill(); cx.stroke();
        alive.push(p);
        continue;
      }
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind !== 'debris') { p.vx *= 0.97; if (p.kind !== 'heal') p.vy *= 0.98; }
      cx.globalAlpha = Math.max(0, k);
      cx.fillStyle = p.col;
      if (p.ch) {
        p.rot += p.vr * dt;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
        cx.font = `${Math.round(p.r)}px serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText(p.ch, 0, 0); cx.restore();
      } else if (p.kind === 'debris') {
        p.rot += p.vr * dt;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.7); cx.restore();
      } else if (p.cross) {
        cx.fillRect(p.x - p.r, p.y - p.r / 3, p.r * 2, p.r / 1.5);
        cx.fillRect(p.x - p.r / 3, p.y - p.r, p.r / 1.5, p.r * 2);
      } else {
        if (p.kind === 'ember' || p.kind === 'spark') { cx.shadowColor = p.col; cx.shadowBlur = 8; }
        cx.beginPath(); cx.arc(p.x, p.y, p.r * (p.soft ? 1 + p.age * 2 : 1), 0, Math.PI * 2); cx.fill();
        cx.shadowBlur = 0;
      }
      cx.globalAlpha = 1;
      alive.push(p);
    }
    parts = alive;

    if (busy()) raf = requestAnimationFrame(frame);
    else { raf = 0; cx.clearRect(0, 0, 1280, 640); }
  }

  /* ---------------- DOM-эффекты ---------------- */
  function temp(el, ms) {
    layer.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /** Сгорающая копия уничтоженной карты */
  function ghost(html, r) {
    const g = document.createElement('div');
    g.className = 'ghost';
    g.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    g.innerHTML = html;
    temp(g, 1000);
    burstRect(r, 'ember', 26);
    burstRect(r, 'spark', 10);
  }

  function float(text, r, cls) {
    const f = document.createElement('div');
    f.className = 'float ' + (cls || '');
    f.textContent = text;
    f.style.left = (r.x + r.w / 2) + 'px';
    f.style.top = (r.y + r.h * 0.3) + 'px';
    temp(f, 1200);
  }

  /** Вспышка поверх ряда */
  function flash(r, cls) {
    const f = document.createElement('div');
    f.className = 'rowflash ' + (cls || '');
    f.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    temp(f, 900);
  }

  function quake() {
    const g = document.getElementById('game');
    g.classList.remove('quake');
    void g.offsetWidth;
    g.classList.add('quake');
    setTimeout(() => g.classList.remove('quake'), 600);
  }

  /** Золотые искры по всему полю (очищение) */
  function sparkle() {
    zones.forEach((R) => {
      for (let i = 0; i < 14; i++) burst(rand(R.x, R.x + R.w), rand(R.y, R.y + R.h), 'spark', 3);
    });
  }

  /** Снаряд от точки к точке (заклинания, сила героя) */
  function bolt(from, to, cls, ms) {
    const b = document.createElement('div');
    b.className = 'bolt ' + (cls || '');
    b.style.left = (from.x + from.w / 2) + 'px';
    b.style.top = (from.y + from.h / 2) + 'px';
    layer.appendChild(b);
    const dx = (to.x + to.w / 2) - (from.x + from.w / 2), dy = (to.y + to.h / 2) - (from.y + from.h / 2);
    const anim = b.animate([{ transform: 'translate(-50%,-50%) scale(.6)' }, { transform: `translate(calc(${dx}px - 50%), calc(${dy}px - 50%)) scale(1.2)` }],
      { duration: ms || 380, easing: 'cubic-bezier(.5,0,.8,.6)' });
    return new Promise((res) => { anim.onfinish = () => { b.remove(); burstRect(to, cls === 'heal' ? 'heal' : 'ember', 16); res(); }; });
  }

  /* ---------------- эффекты редкости ---------------- */
  function dom(cls, r, ms, html) {
    const d = document.createElement('div');
    d.className = cls;
    if (r) d.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    if (html) d.innerHTML = html;
    temp(d, ms);
    return d;
  }

  /** Ударная волна-кольцо */
  function ring(r, color) {
    const size = Math.max(r.w, r.h) * 1.1;
    const d = dom('shock', { x: r.x + r.w / 2 - size / 2, y: r.y + r.h / 2 - size / 2, w: size, h: size }, 700);
    d.style.setProperty('--c', color);
  }

  /** Рунный круг под существом */
  function runeCircle(r, color) {
    const size = Math.max(r.w, r.h) * 1.6;
    const d = dom('runes', { x: r.x + r.w / 2 - size / 2, y: r.y + r.h / 2 - size / 2, w: size, h: size }, 1400, '<i></i><b>ᚱ ᚢ ᚾ ᛖ ᛋ ᛏ ᚨ ᚷ</b>');
    d.style.setProperty('--c', color);
  }

  /** Барьер при получении урона */
  function barrier(r, color) {
    const d = dom('barrier', { x: r.x - 10, y: r.y - 10, w: r.w + 20, h: r.h + 20 }, 650);
    d.style.setProperty('--c', color);
  }

  /** Шлейф за атакующим: несколько «призраков» вдоль пути */
  function trail(from, to, color, n) {
    for (let i = 1; i <= (n || 6); i++) {
      const k = i / ((n || 6) + 1);
      const x = from.x + (to.x - from.x) * k * 0.8, y = from.y + (to.y - from.y) * k * 0.8;
      setTimeout(() => {
        const d = dom('trail', { x, y, w: from.w, h: from.h }, 450);
        d.style.setProperty('--c', color);
      }, k * 260);
    }
  }

  /** Заставка легенды: затемнение, лучи, имя */
  function legendIntro(card, src) {
    const img = src ? `<img src="${src}" alt="">` : `<span class="li-glyph">${card.icon || '✦'}</span>`;
    dom('legend-intro', null, 1500, `<div class="li-rays"></div><div class="li-card">${img}</div><div class="li-name">${card.name}</div><div class="li-sub">Легендарная карта</div>`);
  }

  return { invalidate, setQuality, setAmbient, quality: () => Q.name, ring, runeCircle, barrier, trail, legendIntro, init, setZones, storm, clearAll, burst, burstRect, ghost, float, flash, quake, sparkle, bolt, toStage };
})();
