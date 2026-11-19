#!/usr/bin/env python3
"""Собирает files.txt — список файлов игры с контрольными суммами.

Приложение сравнивает этот список (скачанный с GitHub) со своим и докачивает только изменившиеся файлы.
Формат: первая строка «version X.Y», дальше строки «sha1 путь».
Запуск из корня проекта: python3 tools/build_manifest.py
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTS = ['index.html', 'css', 'js', 'img', 'fonts']


def main():
    version = re.search(r"GAME_VERSION = '([^']+)'", (ROOT / 'js' / 'ui.js').read_text(encoding='utf8')).group(1)
    files = []
    for part in PARTS:
        p = ROOT / part
        for f in sorted([p] if p.is_file() else p.rglob('*')):
            if f.is_file() and not f.name.startswith('.'):
                files.append((hashlib.sha1(f.read_bytes()).hexdigest(), f.relative_to(ROOT).as_posix()))
    lines = [f'version {version}'] + [f'{h} {path}' for h, path in files]
    (ROOT / 'files.txt').write_text('\n'.join(lines) + '\n', encoding='utf8')
    print(f'files.txt: версия {version}, файлов {len(files)}')


if __name__ == '__main__':
    main()
