#!/usr/bin/env python3
"""Скачивает ноты настоящих инструментов (FluidR3_GM, CC BY 3.0) и собирает js/samples.js.
Запуск: python3 tools/fetch_samples.py /путь/к/рабочей/папке  (нужны curl и ffmpeg)"""
import subprocess, os, sys, concurrent.futures as cf
SP = sys.argv[1]  # рабочая папка для скачанных и сжатых файлов
NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
def nm(m): return f"{NAMES[m%12]}{m//12-1}"
# инструмент: (ноты, длительность сэмпла в секундах)
PLAN = {
  'violin':               (range(55, 92, 4), 2.4),
  'cello':                (range(36, 73, 4), 3.0),
  'flute':                (range(60, 97, 4), 2.2),
  'acoustic_guitar_nylon':(range(40, 81, 4), 2.2),
  'bagpipe':              (range(46, 71, 4), 3.0),
  'music_box':            (range(64, 97, 4), 2.0),
  'string_ensemble_1':    (range(40, 77, 4), 3.2),
  'pizzicato_strings':    (range(36, 65, 4), 1.4),
  'orchestral_harp':      (range(48, 85, 4), 2.2),
  'taiko_drum':           ([36, 41, 48], 1.2),
  'melodic_tom':          ([55, 62], 0.6),
  'tinkle_bell':          ([84], 0.8),
}
jobs = []
for inst, (notes, dur) in PLAN.items():
    for m in notes:
        jobs.append((inst, m, dur))
def run(job):
    inst, m, dur = job
    raw = f"{SP}/sf_raw/{inst}_{m}.mp3"
    out = f"{SP}/sf_out/{inst}_{m}.mp3"
    if not os.path.exists(raw):
        url = f"https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/{inst}-mp3/{nm(m)}.mp3"
        r = subprocess.run(['curl', '-sf', '--max-time', '40', '-o', raw, url])
        if r.returncode: return (job, 'download failed')
    fade = 0.35
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-t', str(dur), '-ac', '1', '-ar', '22050',
        '-af', f'afade=t=out:st={max(0, dur - fade)}:d={fade}', '-b:a', '40k', out])
    return (job, 'ok' if r.returncode == 0 else 'ffmpeg failed')
with cf.ThreadPoolExecutor(8) as ex:
    res = list(ex.map(run, jobs))
bad = [r for r in res if r[1] != 'ok']
print('files', len(res), 'bad', bad)
tot = sum(os.path.getsize(f"{SP}/sf_out/{f}") for f in os.listdir(f"{SP}/sf_out"))
print('total KB', tot // 1024)

# ---- упаковка в js/samples.js ----
import base64, json, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bank = {}
for f in sorted(os.listdir(f"{SP}/sf_out")):
    m = re.match(r'(.+)_(\d+)\.mp3$', f)
    if not m: continue
    bank.setdefault(m.group(1), {})[m.group(2)] = base64.b64encode(open(f"{SP}/sf_out/{f}", 'rb').read()).decode()
with open(os.path.join(ROOT, 'js', 'samples.js'), 'w') as fh:
    fh.write('/* Записи инструментов: FluidR3_GM (Frank Wen), лицензия CC BY 3.0, через midi-js-soundfonts.\n'
             '   Сгенерировано tools/fetch_samples.py — не редактировать вручную. */\n')
    fh.write('window.SAMPLES = ' + json.dumps(bank, separators=(',', ':')) + ';\n')
print('samples.js KB', os.path.getsize(os.path.join(ROOT, 'js', 'samples.js')) // 1024)
