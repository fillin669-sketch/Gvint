'use strict';
/* =====================================================================
   ЗВУК — синтезируется через Web Audio, без аудиофайлов.
   Sound.play('hit') — короткий эффект.
   Sound.setLocation('sea') — фоновые звуки локации (поля фракции).
   ===================================================================== */

const LOCATIONS = {
  tavern:  { name: 'Трактир' },
  zags:    { name: 'ЗАГС' },
  office:  { name: 'Агентство недвижимости' },
  night:   { name: 'Ночной забег' },
  nursery: { name: 'Декретная лаборатория' },
};

const Sound = (() => {
  let ac = null, master, sfx, amb, noiseBuf;
  let muted = false;
  try { muted = localStorage.getItem('tron-muted') === '1'; } catch (e) { /* нет хранилища */ }
  let current = null;      // { key, nodes: [], timers: [] }
  let wanted = 'tavern';

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 0.75; sfx.connect(master);
    amb = ac.createGain(); amb.gain.value = 0.45; amb.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setLocation(wanted);
    return true;
  }

  const now = () => ac.currentTime;

  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  /** Тон: freq → slide за dur секунд */
  function tone(freq, dur, o) {
    if (!ac) return;
    o = o || {};
    const t = now() + (o.delay || 0);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ac.createGain();
    env(g, t, o.vol || 0.3, o.attack || 0.005, dur);
    let node = osc;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.dest || sfx);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /** Шум через фильтр */
  function noise(dur, o) {
    if (!ac) return;
    o = o || {};
    const t = now() + (o.delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    env(g, t, o.vol || 0.3, o.attack || 0.005, dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  const chord = (notes, step, o) => notes.forEach((n, i) => tone(n, o.dur || 0.5, Object.assign({}, o, { delay: (o.delay || 0) + i * step })));

  const SFX = {
    place()   { tone(140, 0.25, { slide: 55, vol: 0.5 }); noise(0.08, { freq: 2500, vol: 0.15 }); },
    hero()    { SFX.place(); chord([523, 659, 784, 1047], 0.06, { type: 'triangle', vol: 0.12, dur: 0.6 }); },
    special() { chord([880, 1175, 1568], 0.05, { type: 'triangle', vol: 0.1, dur: 0.4 }); noise(0.4, { filter: 'highpass', freq: 5000, vol: 0.05, attack: 0.1 }); },
    hit()     { noise(0.18, { filter: 'bandpass', freq: 900, q: 2, vol: 0.45 }); tone(110, 0.18, { slide: 50, vol: 0.4 }); },
    kill()    { noise(0.6, { freq: 3000, slide: 200, vol: 0.5 }); tone(200, 0.5, { type: 'sawtooth', slide: 40, vol: 0.18, lp: 900 }); },
    quake()   { noise(1.2, { freq: 400, slide: 60, vol: 0.7, attack: 0.02 }); tone(60, 1, { slide: 30, vol: 0.5 }); },
    burn()    { noise(0.9, { filter: 'bandpass', freq: 1200, slide: 3000, q: 0.8, vol: 0.35, attack: 0.1 }); },
    absorb()  { tone(1400, 0.3, { type: 'square', slide: 900, vol: 0.06 }); noise(0.15, { filter: 'highpass', freq: 3000, vol: 0.2 }); },
    horn()    { tone(220, 0.7, { type: 'sawtooth', vol: 0.18, lp: 1200, attack: 0.05 }); tone(330, 0.9, { type: 'sawtooth', vol: 0.16, lp: 1400, attack: 0.05, delay: 0.25 }); },
    weather_melee()  { for (let i = 0; i < 6; i++) tone(90 + Math.random() * 60, 0.25, { slide: 40, vol: 0.25, delay: i * 0.12, lp: 400 }); },
    weather_ranged() { noise(1.6, { filter: 'bandpass', freq: 5000, slide: 2500, q: 0.6, vol: 0.3, attack: 0.3 }); },
    weather_siege()  { chord([392, 330, 262, 196], 0.12, { type: 'triangle', vol: 0.12, dur: 0.3 }); tone(160, 0.35, { slide: 90, vol: 0.25, delay: 0.5, type: 'sawtooth', lp: 600 }); },
    clear()   { chord([784, 988, 1175, 1568, 1976], 0.07, { type: 'sine', vol: 0.15, dur: 0.8 }); },
    heal()    { chord([523, 784, 1047], 0.1, { type: 'sine', vol: 0.14, dur: 0.6 }); },
    draw()    { noise(0.12, { filter: 'highpass', freq: 3000, slide: 6000, vol: 0.12 }); },
    pass()    { tone(196, 0.5, { type: 'triangle', vol: 0.15 }); },
    turn()    { tone(660, 0.12, { vol: 0.07 }); tone(990, 0.15, { vol: 0.05, delay: 0.08 }); },
    leader()  { chord([262, 330, 392, 523], 0.09, { type: 'sawtooth', vol: 0.1, dur: 0.7, lp: 1600 }); },
    crack()   { noise(0.12, { filter: 'highpass', freq: 1800, vol: 0.4 }); tone(300, 0.1, { slide: 120, vol: 0.2, type: 'square', lp: 900 }); },
    smash()   { SFX.crack(); noise(0.7, { freq: 1500, slide: 100, vol: 0.45, delay: 0.05 }); for (let i = 0; i < 4; i++) tone(500 + Math.random() * 900, 0.08, { vol: 0.08, delay: 0.1 + i * 0.07, type: 'triangle' }); },
    attack()  { noise(0.22, { filter: 'bandpass', freq: 600, slide: 2400, q: 1.2, vol: 0.35 }); },
    heroHit() { tone(90, 0.4, { slide: 45, vol: 0.6 }); noise(0.3, { freq: 1200, slide: 200, vol: 0.4 }); },
    shieldpop() { tone(1800, 0.25, { type: 'triangle', slide: 600, vol: 0.12 }); noise(0.2, { filter: 'highpass', freq: 4000, vol: 0.25 }); },
    mana()    { chord([660, 880], 0.05, { type: 'sine', vol: 0.1, dur: 0.3 }); },
    stun()    { for (let i = 0; i < 3; i++) tone(1200 + i * 300, 0.12, { type: 'triangle', vol: 0.06, delay: i * 0.07 }); },
    marry()   { [1047, 1319, 1568, 1319, 1047].forEach((f, i) => tone(f, 0.9, { vol: 0.08, delay: i * 0.18 })); },
    birth()   { tone(500, 0.25, { slide: 700, vol: 0.12, type: 'triangle' }); tone(650, 0.35, { slide: 450, vol: 0.12, delay: 0.25, type: 'triangle' }); },
    buff()    { chord([523, 659, 784], 0.04, { type: 'triangle', vol: 0.08, dur: 0.3 }); },
    debuff()  { chord([392, 311, 247], 0.05, { type: 'sawtooth', vol: 0.06, dur: 0.35, lp: 1200 }); },
    doom()    { tone(55, 2, { type: 'sawtooth', vol: 0.3, lp: 300, attack: 0.1 }); noise(1.8, { freq: 800, slide: 80, vol: 0.4, attack: 0.2 }); },
    win()     { chord([392, 494, 587, 784], 0.13, { type: 'sawtooth', vol: 0.12, dur: 0.9, lp: 2200 }); },
    lose()    { chord([392, 349, 311, 262], 0.18, { type: 'triangle', vol: 0.14, dur: 0.9 }); },
  };

  function play(name) {
    if (!ac || muted) return;
    try { (SFX[name] || (() => {}))(); } catch (e) { if (window.DEBUG_SOUND) throw e; /* звук не обязателен */ }
  }

  /* ---------------- фоновые звуки локаций ---------------- */
  function loopNoise(cur, o) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.freq; f.Q.value = o.q || 0.7;
    const g = ac.createGain(); g.gain.value = o.vol;
    if (o.lfo) {
      const l = ac.createOscillator(); l.frequency.value = o.lfo;
      const lg = ac.createGain(); lg.gain.value = o.vol * (o.depth || 0.8);
      l.connect(lg); lg.connect(g.gain); l.start(); cur.nodes.push(l);
    }
    src.connect(f); f.connect(g); g.connect(cur.out); src.start();
    cur.nodes.push(src);
  }
  function drone(cur, freqs, vol, lp) {
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = ac.createGain(); g.gain.value = vol;
    f.connect(g); g.connect(cur.out);
    freqs.forEach((fr) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); cur.nodes.push(o); });
  }
  /** Случайно повторяющееся событие */
  function every(cur, minS, maxS, fn) {
    const tick = () => {
      if (current !== cur) return;
      if (!muted) { try { fn(cur.out); } catch (e) { /* ignore */ } }
      cur.timers.push(setTimeout(tick, (minS + Math.random() * (maxS - minS)) * 1000));
    };
    cur.timers.push(setTimeout(tick, (minS * 0.5 + Math.random() * minS) * 1000));
  }

  const BUILD = {
    tavern(c) {
      loopNoise(c, { freq: 300, vol: 0.12, lfo: 0.3, depth: 0.3 });
      every(c, 0.05, 0.4, (o) => noise(0.03, { filter: 'bandpass', freq: 2000 + Math.random() * 3000, q: 3, vol: 0.1 + Math.random() * 0.2, dest: o }));
      every(c, 6, 14, (o) => { tone(1900, 0.25, { vol: 0.05, dest: o, type: 'triangle' }); tone(2500, 0.3, { vol: 0.04, delay: 0.05, dest: o }); });
    },
    zags(c) {   // ЗАГС: орган, колокола, гул гостей
      drone(c, [130.8, 196, 261.6], 0.025, 900);
      loopNoise(c, { filter: 'bandpass', freq: 500, q: 0.6, vol: 0.06, lfo: 0.2, depth: 0.5 });
      every(c, 6, 12, (o) => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 1.6, { vol: 0.03, delay: i * 0.22, dest: o })));
      every(c, 9, 18, (o) => noise(1.2, { filter: 'bandpass', freq: 1400, q: 2, vol: 0.05, attack: 0.3, dest: o }));
    },
    office(c) { // агентство: часы, печатная машинка, город
      loopNoise(c, { freq: 300, vol: 0.08, lfo: 0.05, depth: 0.4 });
      every(c, 0.95, 1.05, (o) => tone(2600, 0.03, { type: 'square', vol: 0.02, dest: o }));
      every(c, 4, 9, (o) => { const n = 3 + rnd(6); for (let i = 0; i < n; i++) noise(0.03, { filter: 'highpass', freq: 3000, vol: 0.12, delay: i * (0.08 + Math.random() * 0.08), dest: o }); });
      every(c, 10, 20, (o) => tone(880, 0.6, { vol: 0.04, dest: o }));
    },
    night(c) {  // ночной забег: ветер, сердце, аисты
      loopNoise(c, { freq: 700, vol: 0.16, lfo: 0.3, depth: 0.7 });
      every(c, 0.55, 0.65, (o) => { tone(60, 0.12, { slide: 40, vol: 0.18, dest: o }); tone(55, 0.12, { slide: 38, vol: 0.13, delay: 0.16, dest: o }); });
      every(c, 7, 14, (o) => { for (let i = 0; i < 6; i++) noise(0.04, { filter: 'bandpass', freq: 2200, q: 4, vol: 0.12, delay: i * 0.06, dest: o }); });
    },
    nursery(c) { // лаборатория: котёл, музыкальная шкатулка, погремушка
      loopNoise(c, { freq: 200, vol: 0.05 });
      every(c, 0.2, 0.9, (o) => tone(120 + Math.random() * 120, 0.15, { slide: 60, vol: 0.08, lp: 500, dest: o }));
      every(c, 8, 14, (o) => [1568, 1319, 1175, 1047, 1175, 1319, 1047].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.035, delay: i * 0.32, dest: o })));
      every(c, 10, 20, (o) => { for (let i = 0; i < 5; i++) noise(0.04, { filter: 'highpass', freq: 5000, vol: 0.1, delay: i * 0.09, dest: o }); });
    },
    iron(c) {
      loopNoise(c, { freq: 420, vol: 0.18, lfo: 0.07, depth: 0.7 });
      every(c, 3, 6, (o) => { tone(75, 0.45, { slide: 40, vol: 0.4, dest: o }); tone(75, 0.45, { slide: 40, vol: 0.3, delay: 0.35, dest: o }); });
      every(c, 7, 15, (o) => { tone(2400, 0.3, { type: 'triangle', vol: 0.05, dest: o }); tone(3300, 0.4, { vol: 0.03, delay: 0.02, dest: o }); });
    },
    forest(c) {
      loopNoise(c, { freq: 900, vol: 0.09, lfo: 0.1, depth: 0.6 });
      every(c, 1.5, 4.5, (o) => {
        const base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) tone(base, 0.08, { slide: base * 1.4, vol: 0.06, delay: i * 0.12, dest: o });
      });
      every(c, 14, 28, (o) => { tone(390, 0.35, { slide: 350, vol: 0.12, dest: o, attack: 0.05 }); tone(390, 0.5, { slide: 340, vol: 0.12, delay: 0.5, dest: o, attack: 0.05 }); });
    },
    dark(c) {
      drone(c, [55, 55.6, 82.4], 0.05, 220);
      loopNoise(c, { freq: 250, vol: 0.06, lfo: 0.05, depth: 0.8 });
      every(c, 8, 15, (o) => { tone(196, 3.5, { vol: 0.12, dest: o }); tone(466, 3, { vol: 0.04, dest: o }); tone(587, 2.5, { vol: 0.03, dest: o }); });
      every(c, 6, 12, (o) => noise(1.2, { filter: 'bandpass', freq: 1200, slide: 2200, q: 6, vol: 0.12, attack: 0.4, dest: o }));
    },
    sea(c) {
      loopNoise(c, { freq: 650, vol: 0.22, lfo: 0.12, depth: 0.9 });
      every(c, 4, 9, (o) => { tone(1500, 0.28, { slide: 950, vol: 0.06, dest: o }); tone(1300, 0.32, { slide: 850, vol: 0.05, delay: 0.32, dest: o }); });
      every(c, 7, 13, (o) => tone(95, 0.6, { type: 'sawtooth', slide: 70, vol: 0.06, lp: 400, attack: 0.15, dest: o }));
    },
  };

  function stopLocation() {
    if (!current) return;
    const old = current;
    current = null;
    old.timers.forEach(clearTimeout);
    const t = now();
    old.out.gain.setTargetAtTime(0.0001, t, 0.4);
    setTimeout(() => { old.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* ignore */ } }); old.out.disconnect(); }, 2500);
  }

  function setLocation(key) {
    wanted = key;
    if (!ac || (current && current.key === key)) return;
    stopLocation();
    const out = ac.createGain();
    out.gain.value = 0.0001;
    out.connect(amb);
    out.gain.setTargetAtTime(1, now(), 0.8);
    current = { key, nodes: [], timers: [], out };
    (BUILD[key] || BUILD.tavern)(current);
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('tron-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (ac) master.gain.setTargetAtTime(m ? 0 : 0.9, now(), 0.1);
  }

  return { init, play, setLocation, setMuted, isMuted: () => muted };
})();
