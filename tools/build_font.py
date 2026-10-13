#!/usr/bin/env python3
"""Embed tools/fonts/NotoRashiHebrew.ttf as base64 in js/font-rashi.js.

The plugin WebView loads from file://, where fetch() of local files is not
reliable on every platform, so the font travels inside a script.
"""
import base64
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'tools', 'fonts', 'NotoRashiHebrew.ttf')
OUT = os.path.join(ROOT, 'js', 'font-rashi.js')


def main():
    with open(SRC, 'rb') as f:
        data = base64.b64encode(f.read()).decode('ascii')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// נוצר ע"י tools/build_font.py — Noto Rashi Hebrew, SIL OFL 1.1 (assets/fonts/OFL.txt).\n')
        f.write(f"window.EPUB_FONT_RASHI = '{data}';\n")
    print(f'wrote {OUT} ({len(data)} chars)')


if __name__ == '__main__':
    main()
