# תוספים לאוצריא

תוספים ל[אוצריא](https://github.com/Otzaria/otzaria). כל תוסף בתיקייה משלו, עם `manifest.json`, בדיקות וכלי אריזה.

| תוסף | תיקייה | מה הוא עושה |
|---|---|---|
| **ייצוא EPUB** | [`epub-export/`](epub-export) | ייצוא ספרים ותיקיות ל-EPUB, ‏Kobo, ‏Word ו-FB2 מימין לשמאל, עם מפרשים כהערות |
| **מניין המצוות** | [`minyan-hamitzvot/`](minyan-hamitzvot) | תרי״ג מצוות כמניין בה״ג, הרמב״ם, הרמב״ן, הסמ״ג וספר החינוך, ובמה נחלקו |
| **מחלוקות התנאים** | [`machloket-tannaim/`](machloket-tannaim) | כל מחלוקת שבמשנה: החולקים, מחמיר ומקל, והלכה כמי; דברי כל תנא ובין תנא לחבירו |

## התקנה

מהחנות של אוצריא, או מקובץ: בכל [רליס](https://github.com/zevisvei/otzaria-plugins/releases) מצורף קובץ `.otzplugin`.
באוצריא: הגדרות ← תוספים ← התקנה מקובץ.

## פיתוח

```bash
cd <plugin>
node tools/test_core.js      # בדיקות
python3 tools/pack.py        # אריזה ל-dist/*.otzplugin
```

לתצוגה בדפדפן עם גשר מדומה: `python3 -m http.server` בשורש הריפו, ואז `<plugin>/tools/harness.html`.

## CI ופרסום

- **`.github/workflows/ci.yml`** — בכל push ו-PR:
  - בדיקות כל תוסף.
  - epubcheck וסכמת FB2 לייצוא EPUB.
  - אימות כל התוספים ב-[otzaria-plugin-validator](https://github.com/Otzaria/otzaria-plugin-validator), עם תגובת סיכום על ה-PR.
- **`.github/workflows/release.yml`** — בכל push ל-`main`, לכל תוסף בנפרד (matrix):
  - אימות ובנייה.
  - פרסום לחנות אוצריא כש-`version` ב-`manifest.json` עלה. גרסה שכבר בחנות מדולגת.
  - רליס ב-GitHub בתגית `<plugin>-v<version>`.
  - הנתיבים יחסיים לתיקיית התוסף: תמונת החנות `tools/store-icon.png`, התיאור המלא `STORE_DESCRIPTION.txt`, וצילומי המסך `screenshots/`.
  - נדרשים Secrets בריפו: `OTZARIA_USER`, `OTZARIA_PASSWORD`. בלעדיהם — אימות בלבד.
  - תוסף חדש: נדרש לפחות צילום מסך אחד, והדחיפה הראשונה ממתינה לאישור מנהל.

**תוסף חדש:**
1. יוצרים תיקייה עם `manifest.json`, `STORE_DESCRIPTION.txt`, `tools/store-icon.png` ו-`screenshots/`.
2. מוסיפים אותה ל-matrix בשני קובצי ה-workflow.

## רישיונות

כל תוסף והרישיון שלו — ראו ה-README שבתיקייתו.
מחלוקות התנאים ב-GPL-3, כרישיון הנתונים שלו (MishnaBase).
