#!/usr/bin/env python3
"""בונה את js/data.js מקובץ arguments.csv של MishnaBase (קז'דן וקיי, רישיון GPL-3).

שימוש:
    python3 tools/build_data.py [path/to/arguments.csv]

בלי נתיב — מוריד את הקובץ מהקומיט הנעוץ למטה.
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
COMMIT = '23baa2b57b1329cb639870f72b0743661bb8d0b3'
CSV_URL = f'https://raw.githubusercontent.com/BenjaminKay/MishnaBase/{COMMIT}/arguments.csv'

# שמות התנאים כפי שהם נזכרים במשנה
NAMES = {
    'Tanna Kama': 'תנא קמא', 'Stam': 'סתם משנה', 'Implicit opinion': 'דעה הסתומה', 'Chachamim': 'חכמים',
    'Chachmim': 'חכמים', 'Yesh Omrim': 'יש אומרים', 'Prior approach': 'בראשונה היו אומרים',
    'Later Beit Din': 'בית דין של אחריהם', 'Mishna Rishona': 'משנה ראשונה', 'Mishna Achrona': 'משנה אחרונה',
    'Talmid Echad': 'תלמיד אחד', 'Danin Lifnei Chachamim': 'דנין לפני חכמים',
    'Beit Shamai': 'בית שמאי', 'Beit Hillel': 'בית הלל', 'Shamai': 'שמאי', 'Hillel': 'הלל',
    'Rebbe': 'רבי', 'Rabbi Gamliel': 'רבן גמליאל', 'Rabbi Shimon ben Gamliel': 'רבן שמעון בן גמליאל',
    'Rabbi Yochanan ben Zakai': 'רבן יוחנן בן זכאי',
    'Rabbi Akiva': 'רבי עקיבא', 'Rabbi Eliezer': 'רבי אליעזר', 'Rabbi Yehoshua': 'רבי יהושע',
    'Rabbi Meir': 'רבי מאיר', 'Rabbi Yehuda': 'רבי יהודה', 'Rabbi Yossi': 'רבי יוסי', 'Rabbi Shimon': 'רבי שמעון',
    'Rabbi Elazar': 'רבי אלעזר', 'Rabbi Elazer': 'רבי אלעזר', 'Rabbi Yishmael': 'רבי ישמעאל', 'Rabbi Tarfon': 'רבי טרפון',
    'Rabbi Nechemia': 'רבי נחמיה', 'Rabbi Natan': 'רבי נתן', 'Rabbi Nehorai': 'רבי נהוראי', 'Rabbi Elai': 'רבי אלעאי',
    'Rabbi Tzadok': 'רבי צדוק', 'Rabbi Chalafta': 'רבי חלפתא', 'Rabbi Pappis': 'רבי פפייס', 'Rabbi Yishevov': 'רבי ישבב',
    'Rabbi Nichunia': 'רבי נחוניא', 'Rabbi Nichunia ben Alinatan': 'רבי נחוניא בן אלינתן',
    'Rabbi Yochanan ben Nuri': 'רבי יוחנן בן נורי', 'Rabbi Yochanan ben Broka': 'רבי יוחנן בן ברוקה',
    'Rabbi Yochanan Hasandlar': 'רבי יוחנן הסנדלר', 'Rabbi Yochanan ben Matya': 'רבי יוחנן בן מתיא',
    'Rabbi Elazar ben Azarya': 'רבי אלעזר בן עזריה', 'Rabbi Eliezer ben Yakov': 'רבי אליעזר בן יעקב',
    'Rabbi Yossi Haglili': 'רבי יוסי הגלילי', 'Rabbi Eliezer ben Yossi Haglili': 'רבי אליעזר בנו של רבי יוסי הגלילי',
    'Rabbi Elazar ben Tzadok': 'רבי אלעזר ברבי צדוק', 'Rabbi Elazar ben Shimon': 'רבי אלעזר ברבי שמעון',
    'Rabbi Elazar ben Yehuda': 'רבי אלעזר ברבי יהודה', 'Rabbi Elazar ben Yehuda Ish Bartota': 'רבי אלעזר בן יהודה איש ברתותא',
    'Rabbi Elazar Chasma': 'רבי אלעזר חסמא',
    'Rabbi Dosa ben Harkinas': 'רבי דוסא בן הרכינס', 'Rabbi Yehoshua ben Horkinas': 'רבי יהושע בן הורקנוס',
    'Rabbi Chananiah ben Antignos': 'רבי חנניה בן אנטיגנוס', 'Rabbi Chanina ben Antignos': 'רבי חנינא בן אנטיגנוס',
    'Rabbi Chananiah ben Tradion': 'רבי חנניה בן תרדיון', 'Rabbi Chanina Sgan Hacohanim': 'רבי חנינא סגן הכהנים',
    'Rabbi Chanina ben Gamliel': 'רבי חנינא בן גמליאל', 'Rabbi Chanina ben Akavia': 'רבי חנינא בן עקביא',
    'Chanina Ish Ono': 'חנינא איש אונו',
    'Rabbi Yehuda ben Bathyra': 'רבי יהודה בן בתירא', 'Rabbi Yehoshua ben Bathyra': 'רבי יהושע בן בתירא',
    'Rabbi Shimon ben Bathyra': 'רבי שמעון בן בתירא', 'Ben Bathyra': 'בן בתירא',
    'Rabbi Yehuda ben Bava': 'רבי יהודה בן בבא', 'Rabbi Yossi ben Yehuda': 'רבי יוסי ברבי יהודה',
    'Rabbi Yossi ben Yehuda ish Kfar Habavli': 'רבי יוסי בר יהודה איש כפר הבבלי',
    'Rabbi Yossi ben Mishulam': 'רבי יוסי בן משולם', 'Rabbi Yossi ben Hachotef': 'רבי יוסי בן החוטף',
    'Rabbi Yossi Avtolmos': 'רבי יוסי אבטולמוס', 'Yossi ben Choni': 'יוסי בן חוני',
    'Rabbi Shimon ben Elazar': 'רבי שמעון בן אלעזר', 'Rabbi Shimon ben Yehuda': 'רבי שמעון בן יהודה',
    'Rabbi Shimon Shizuri': 'רבי שמעון שזורי', 'Rabbi Yishmael Shizuri': 'רבי ישמעאל שזורי',
    'Rabbi Shimon ben Minasia': 'רבי שמעון בן מנסיא',
    'Rabbi Yishmael ben Yochanan ben Broka': 'רבי ישמעאל בנו של רבי יוחנן בן ברוקה',
    'Rabbi Matya ben Charash': 'רבי מתיא בן חרש', 'Rabbi Yehoshua ben Matya': 'רבי יהושע בן מתיא',
    'Rabbi Yakim Ish Chadid': 'רבי יקים איש חדיד',
    'Shimon ben Azai': 'בן עזאי', 'Shimon ben Zoma': 'בן זומא', 'Ben Zoma': 'בן זומא', 'Ben Nannas': 'בן ננס',
    'Aba Shaul': 'אבא שאול', 'Aba Eliezar ben Dolai': 'אבא אלעזר בן דולעאי', 'Admon': 'אדמון',
    'Akavia ben Mahalalel': 'עקביא בן מהללאל', 'Nachum Hamadai': 'נחום המדי', 'Sumchus': 'סומכוס',
    'Matya ben Shmuel': 'מתיא בן שמואל', 'Shimon Hateimani': 'שמעון התימני', 'Shimon Hativni': 'שמעון התימני', 'Min Galili': 'צדוקי גלילי',
    'Rabbi Yochanan ben Yehoshua': 'רבי יוחנן בן יהושע', 'Rabbi Yossi ben Durmaskis': 'רבי יוסי בן דורמסקית', 'Shimon achi Azarya': 'שמעון אחי עזריה',
    'Menachem ben Signai': 'מנחם בן סגנאי', 'Zicharia ben Kvutar': 'זכריה בן קבוטל', 'Yedua Habavli': 'יהודה הבבלי',
    'Chanan ben Avshalom': 'חנן בן אבישלום', 'Dostai': 'דוסתאי', 'Yoezer ish Habira': 'יועזר איש הבירה', 'Illa': 'אילא',
    'Bnei Cohanim Gidolim': 'בני כהנים גדולים', 'Tzdukim': 'צדוקים', 'Perushim': 'פרושים',
    'Anshei Yerushalayim': 'אנשי ירושלים', 'Anshei Galil': 'אנשי גליל', 'Anshei Yehuda': 'אנשי יהודה',
    'Yosef ben Yoezer': 'יוסי בן יועזר', 'Yehoshua ben Prachia': 'יהושע בן פרחיה', 'Yehuda ben Tabai': 'יהודה בן טבאי',
    'Avtalyon': 'אבטליון', 'Yosef ben Yochanan': 'יוסי בן יוחנן', "Nitai Ha'Arbeli": 'נתאי הארבלי',
    'Shimon ben Shetach': 'שמעון בן שטח', 'Shimaya': 'שמעיה',
}

# שם המסכת בספריית אוצריא, כשאינו כשם במאגר
OTZARIA_TITLE = {'מעשר': 'מעשרות', 'בכורים': 'ביכורים', 'מקוואות': 'מקואות'}
SEDARIM = ['זרעים', 'מועד', 'נשים', 'נזיקין', 'קדשים', 'טהרות']


def result_code(res):
    """H מחמיר · K מקל · M דעה אמצעית · C מחייב · P פוטר · '' אחר."""
    m = re.match(r'(Chumra|Chunra|BHB|Kula|Chayav|Patur)\s*([\d.]+)?', (res or '').strip())
    if not m:
        return ''
    kind, val = m.group(1), m.group(2)
    if kind == 'Chayav':
        return 'C' if val in (None, '1.0', '1') else 'M'
    if kind == 'Patur':
        return 'P'
    v = float(val) if val else (0.0 if kind == 'Kula' else 1.0)
    return 'H' if v >= 1 else 'K' if v <= 0 else 'M'


def main():
    if len(sys.argv) > 1:
        text = open(sys.argv[1], encoding='utf-8').read()
    else:
        text = urllib.request.urlopen(CSV_URL).read().decode('utf-8')
    rows = list(csv.DictReader(io.StringIO(text)))
    rows.sort(key=lambda r: (int(r['tabnum']), int(r['SeqID'])))

    names, name_ids = [], {}
    def nid(en):
        en = re.sub(r'\s+', ' ', en.replace('\xa0', ' ')).strip()
        if en not in NAMES:
            raise SystemExit(f'אין שם עברי ל-{en!r}')
        he = NAMES[en]
        if he not in name_ids:
            name_ids[he] = len(names)
            names.append(he)
        return name_ids[he]

    masechtot, mas_ids = [], {}
    args = []
    for r in rows:
        tab = int(r['tabnum'])
        if tab not in mas_ids:
            he = r['Tractate_Name_Hebrew'].strip()
            seder = SEDARIM[int(r['Seder_Number']) - 1]
            mas_ids[tab] = len(masechtot)
            masechtot.append([he, seder, 'משנה ' + OTZARIA_TITLE.get(he, he)])
        loc = r['Location'].strip()
        m = re.match(r'(\d+):(\d+)', loc)
        chapter, mishna = int(m.group(1)), int(m.group(2))
        positions = []
        for i in range(1, 7):
            d = (r.get(f'Disputant_{i}') or '').strip()
            if not d or d == 'NA':
                continue
            ids = [nid(x) for x in d.split('/') if x.strip()]
            score = (r.get(f'Score_{i}') or '').strip()
            positions.append([ids, result_code(r.get(f'Result_{i}')), 1 if score == '1' else 0])
        if len(positions) < 2:
            continue
        args.append([mas_ids[tab], chapter, mishna, loc, positions])

    args.sort(key=lambda a: (a[0], a[1], a[2]))
    data = {'masechtot': masechtot, 'names': names, 'args': args}
    out = os.path.join(ROOT, 'js', 'data.js')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write("// נוצר ע\"י tools/build_data.py ממאגר MishnaBase (GPL-3). אין לערוך ידנית.\n")
        f.write('window.MACHLOKET_DATA = ')
        # רשומה בכל שורה: קובץ קריא לבודקים ולכלי ההשוואה
        f.write('{\n')
        for i, (k, v) in enumerate(data.items()):
            rows = ',\n'.join('  ' + json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in v)
            f.write(f'{json.dumps(k)}: [\n{rows}\n]' + (',\n' if i < len(data) - 1 else '\n'))
        f.write('};\n')
    print(f'wrote {out} ({os.path.getsize(out)} bytes, {len(args)} machlokot, {len(names)} names)')


if __name__ == '__main__':
    main()
