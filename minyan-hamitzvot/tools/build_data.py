#!/usr/bin/env python3
"""בונה את js/data.js ממסד הנתונים של repwolfe/613 (רישיון MIT).

שימוש:
    python3 tools/build_data.py [path/to/db.db]

בלי נתיב — מוריד את db/db.db מהקומיט הנעוץ למטה.
"""
import json
import os
import sqlite3
import sys
import tempfile
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
COMMIT = 'f8a4aa851a1946eafb7e53ba8252189ff6e4db51'
DB_URL = f'https://raw.githubusercontent.com/repwolfe/613/{COMMIT}/db/db.db'

# ספר החינוך מסודר לפי הפרשיות: גבולות כל חומש במניין המהדורות המאוחרות
CHINUCH_BOOKS = [(1, 3, 0), (4, 114, 1), (115, 361, 2), (362, 413, 3), (414, 613, 4)]


def load_db(path):
    if path:
        return sqlite3.connect(path)
    tmp = os.path.join(tempfile.mkdtemp(), 'db.db')
    urllib.request.urlretrieve(DB_URL, tmp)
    return sqlite3.connect(tmp)


def main():
    c = load_db(sys.argv[1] if len(sys.argv) > 1 else None)
    books = [r[0] for r in c.execute('SELECT bookName FROM books ORDER BY _id')]
    verses = {vid: [b - 1, ch, v] for vid, b, ch, v in c.execute('SELECT _id, bookId, chapter, verse FROM verses')}
    src = lambda vid: verses.get(int(vid)) if vid not in (None, '') else None

    mitzvot = [[i, name.strip(), kind] for i, name, kind in
               c.execute('SELECT _id, mitzvahName, asehOrLoSaseh FROM mitzvos ORDER BY _id')]
    rambam_src = {mid: s for mid, s in c.execute('SELECT mitzvahId, source FROM rambam')}

    rambam = [[mid, num, src(s), t, p] for mid, num, s, t, p in c.execute(
        'SELECT mitzvahId, mitzvahNumber, source, type, punishmentId FROM rambam ORDER BY _id')]

    # מניין הרמב"ן רציף (1–620); הלאוין מתחילים אחרי 248 העשין
    ramban = []
    for mid, num, shichcha, s in c.execute(
            'SELECT mitzvahId, mitzvahNumber, shihchaNumber, source FROM ramban ORDER BY _id'):
        n = num if num <= 248 else num - 248
        ramban.append([mid, n, shichcha, src(s if s is not None else rambam_src.get(mid))])

    chinuch_src = {n: s for n, s in c.execute('SELECT mitzvahNumber, source FROM chinuchSources')}
    chinuch = []
    for old, mid, num, title, where, when, pun in c.execute(
            'SELECT oldMitzvahNumber, mitzvahId, mitzvahNumber, mitzvahTitle, whereApplies, whenApplies, punishment '
            'FROM chinuch ORDER BY mitzvahNumber'):
        book = next(b for lo, hi, b in CHINUCH_BOOKS if lo <= num <= hi)
        s = chinuch_src.get(old, rambam_src.get(mid))
        chinuch.append([mid, num, (title or '').strip(), where, when, pun, src(s), book])

    semag = [[mid, num, (title or '').strip(), src(s if s is not None else rambam_src.get(mid))]
             for mid, num, title, s in c.execute(
                 'SELECT mitzvahId, mitzvahNumber, semagTitle, source FROM semag ORDER BY _id')]

    bahag = [[mid, num, cat, (title or '').strip()] for mid, num, cat, title in c.execute(
        'SELECT mitzvahId, mitzvahNumber, categoryNum, mitzvahTitle FROM bahag ORDER BY _id')]

    data = {'books': books, 'mitzvot': mitzvot, 'rambam': rambam, 'ramban': ramban,
            'chinuch': chinuch, 'semag': semag, 'bahag': bahag}
    out = os.path.join(ROOT, 'js', 'data.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// נוצר ע"י tools/build_data.py ממאגר repwolfe/613 (MIT). אין לערוך ידנית.\n')
        f.write('window.MITZVOT_DATA = ')
        # רשומה בכל שורה: קובץ קריא לבודקים ולכלי ההשוואה
        f.write('{\n')
        for i, (k, v) in enumerate(data.items()):
            rows = ',\n'.join('  ' + json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in v)
            f.write(f'{json.dumps(k)}: [\n{rows}\n]' + (',\n' if i < len(data) - 1 else '\n'))
        f.write('};\n')
    print(f'wrote {out} ({os.path.getsize(out)} bytes, {len(mitzvot)} mitzvot)')


if __name__ == '__main__':
    main()
