#!/usr/bin/env python3
"""Snapshot Otzaria's export-restricted list into js/export-restricted.js.

Fallback only: on Otzaria >= 0.9.99 the plugin asks library.getExportRestrictions,
which reads the app's own up-to-date list. Usage: python3 tools/build_restricted.py [commit]
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'js', 'export-restricted.js')


def main():
    commit = sys.argv[1] if len(sys.argv) > 1 else 'dev'
    url = f'https://raw.githubusercontent.com/Otzaria/otzaria/{commit}/assets/export_restricted_books.json'
    with urllib.request.urlopen(url) as r:
        data = json.load(r)
    books = [b for b in data.get('books', []) if isinstance(b, str) and b.strip()]
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// נוצר ע"י tools/build_restricted.py — העתק של assets/export_restricted_books.json באוצריא\n')
        f.write(f'// (Otzaria/otzaria@{commit[:12]}). גיבוי לגרסאות בלי library.getExportRestrictions (לפני 0.9.99).\n')
        f.write('window.EPUB_EXPORT_RESTRICTED = ' + json.dumps(books, ensure_ascii=False, indent=2) + ';\n')
    print(f'wrote {OUT} ({len(books)} titles)')


if __name__ == '__main__':
    main()
