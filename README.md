# ייצוא EPUB – תוסף לאוצריא

מייצא ספרים מספריית אוצריא לספר אלקטרוני **EPUB 3** תקני, מימין לשמאל.

- **טווח:** מכותרת עד כותרת בתוכן העניינים, או הספר כולו.
- **כמה ספרים בקובץ אחד:** לכל ספר יש שער פנימי משלו וענף משלו בתוכן העניינים.
- **מפרשים כהערות.** אפשר לבחור מפרשים לכל ספר, ולהציג אותם באחת מארבע דרכים:
  - **חלונית בלבד** (ברירת מחדל): סימן קטן בטקסט, והפירוש מופיע רק בלחיצה עליו.
    המבנה הוא המוסכמה הרשמית: `<a epub:type="noteref" role="doc-noteref">` אל `<aside epub:type="footnote" role="doc-footnote">`
    (EPUB SSV 1.1, DAISY KB, Apple Books Asset Guide).
    - **Apple Books וקוראים דומים:** מסתירים את ה-aside בעצמם.
    - **calibre:** מציג חלונית אך אינו מסתיר, ולכן ההערה מוסתרת בו דרך המחלקות שהוא מתעד לשם כך (`is-calibre-viewer`, `calibre-footnote-container`).
    - **קורא שאינו תומך בחלוניות:** ההערות מופיעות בקטן בסוף הפרק.
  - **הערות בסוף הספר:** חלונית בלחיצה. הטקסט שמור בקובצי הערות נפרדים בסוף הספר (`epub:type="endnote"`, `linear="no"`), ולכן אינו מופיע באף פרק, בכל קורא.
  - **מתחת לכל קטע:** הפירוש מופיע מיד אחרי הפסוק או הקטע.
  - **בסוף כל פרק:** הערות ממוספרות בסוף הפרק.

  **מפרש שמקושר למילה מסוימת בשורה** (למשל שער הציון על המשנה ברורה) נכנס במקומו, עם אות המקור — (א), (ב). שאר המפרשים מקבלים סמן בסוף השורה.
  בשתי הדרכים הגלויות אפשר לבחור את גופן המפרשים: כתב רש״י מוטמע (Noto Rashi Hebrew, SIL OFL), או גופן הספר בקטן.
- **דף שער** מעוצב, עם מקור הטקסט וציון שהספר הופק מאוצריא.
- **דף פרטים וזכויות:** מחבר, תקופה, דפוס, מקור הטקסט ורישיון, לכל ספר ולכל מפרש.
- **מטא-דאטה:** `dc:rights`, `dc:source`, `dc:creator`, `dc:contributor` (מפרשים), `dc:subject` ועוד.
  הרישיון נקבע לפי מקור הטקסט, כמפורט ב-README של [otzaria-library](https://github.com/Otzaria/otzaria-library).
  טקסט שמקורו אינו מתיר הפצה מסומן „לשימוש אישי בלבד”.
- **כריכה** מצוירת, הסרת טעמים או ניקוד, ושמירת הבחירות כטיוטה.

## מבנה

| קובץ | תפקיד |
|---|---|
| `manifest.json` | הגדרות התוסף והרשאות |
| `index.html`, `css/style.css` | ממשק (צבעי ערכת הנושא של אוצריא) |
| `js/core.js` | לוגיקה טהורה: ניקוי HTML ל-XHTML, טווחים, הערות, שער, זכויות, OPF/nav/NCX, ZIP |
| `js/bookcss.js` | גיליון הסגנון שנארז בתוך ה-EPUB |
| `js/font-rashi.js` | גופן כתב רש״י כ-base64 (נוצר ע״י `tools/build_font.py`) |
| `js/app.js` | ממשק, טעינת טקסט ומפרשים מאוצריא, כריכה, שמירה |
| `tools/` | בדיקות, מדמה גשר, אייקון, אריזה (לא נארז) |

## פקודות

```bash
node tools/test_core.js [out-dir]                    # בדיקות + קובצי EPUB לדוגמה
tools/check_samples.sh path/to/epubcheck.jar [java]  # בדיקה מלאה ב-epubcheck
python3 tools/pack.py                                # אריזה ל-dist/*.otzplugin
tools/make_icon.sh                                   # רינדור tools/icon.svg ל-assets/icon.png
```

לתצוגה בדפדפן עם גשר מדומה: `python3 -m http.server`, ואז לפתוח את `tools/harness.html`.

## פרסום

`.github/workflows/release.yml` מאמת, בונה ומפרסם לחנות אוצריא בכל push ל-`main` שמעלה את `version` ב-`manifest.json`
(ראו [פרסום אוטומטי ל-CI](https://github.com/Otzaria/otzaria/blob/dev/docs/plugin-sdk/README.md#פרסום-אוטומטי-ל-ci-github-action)).
נדרשים Secrets בריפו: `OTZARIA_USER`, `OTZARIA_PASSWORD`. בלעדיהם ה-Action מאמת בלבד.
