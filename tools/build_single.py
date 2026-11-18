#!/usr/bin/env python3
"""Собирает игру в один HTML-файл со встроенными картинками.

Запуск из корня проекта:  python3 tools/build_single.py
Результат:                dist/tron.html
Нужна библиотека Pillow (pip install pillow).
"""
import base64
import io
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'dist' / 'tron.html'
FULL_SIZE, FULL_Q = 640, 72     # картинка в окне просмотра
THUMB_SIZE, THUMB_Q = 220, 70   # картинка на поле и в руке


def data_uri(path, size, quality):
    im = Image.open(path).convert('RGB')
    im.thumbnail((size, size))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def main():
    art = {}
    for p in sorted((ROOT / 'img' / 'cards').glob('*.jpg')):
        art[f'img/cards/{p.name}'] = data_uri(p, FULL_SIZE, FULL_Q)
        thumb = ROOT / 'img' / 'cards' / 'thumbs' / p.name
        art[f'img/cards/thumbs/{p.name}'] = data_uri(thumb if thumb.exists() else p, THUMB_SIZE, THUMB_Q)

    art['img/icon.png'] = 'data:image/png;base64,' + base64.b64encode((ROOT / 'img' / 'icon.png').read_bytes()).decode()
    html = (ROOT / 'index.html').read_text(encoding='utf8')
    css = (ROOT / 'css' / 'style.css').read_text(encoding='utf8')
    css = re.sub(r'url\(\.\./fonts/([^)]+)\)', lambda m: 'url(data:font/woff2;base64,' +
                 base64.b64encode((ROOT / 'fonts' / m.group(1)).read_bytes()).decode() + ')', css)
    html = html.replace('<link rel="stylesheet" href="css/style.css">', f'<style>\n{css}\n</style>')

    icon = 'data:image/png;base64,' + base64.b64encode((ROOT / 'img' / 'icon.png').read_bytes()).decode()
    html = html.replace('"img/icon.png"', '"' + icon + '"')

    embed = '<script>window.EMBED_ART = ' + json.dumps(art) + ';</script>'

    def inline(m):
        js = (ROOT / m.group(1)).read_text(encoding='utf8').replace('</script', '<\\/script')
        return f'<script>\n{js}\n</script>'

    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)
    # записи инструментов подгружаются игрой отдельно — в однофайловой версии встраиваем их сразу
    samples = (ROOT / 'js' / 'samples.js').read_text(encoding='utf8')
    html = html.replace('<script>\n', '<script>\n' + samples + '\n</script>\n<script>\n', 1)
    html = html.replace('<script>\n', embed + '\n<script>\n', 1)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding='utf8')
    print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1e6:.1f} MB, картинок: {len(art) // 2}')


if __name__ == '__main__':
    main()
