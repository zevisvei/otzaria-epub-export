// גיליון הסגנון שנארז בתוך קובץ ה-EPUB (OEBPS/css/book.css).
// צבעים מינימליים ושחור-לבן בגוף הטקסט, כדי שייראה טוב גם בקוראי דיו אלקטרוני ובמצב לילה של הקורא.
// כיוון הטקסט נקבע במאפייני dir ב-XHTML ובספיין: EPUB אוסר direction/unicode-bidi ב-CSS.
(function (root) {
  'use strict';
  const BOOK_CSS = `@charset "UTF-8";
body {
  text-align: justify;
  margin: 0 3%;
  font-family: "Frank Ruehl CLM", "FrankRuehl", "Taamey Frank CLM", "David CLM", "David", "Times New Roman", serif;
  line-height: 1.6;
  -webkit-hyphens: none;
  hyphens: none;
  widows: 2;
  orphans: 2;
}

p { margin: 0 0 0.35em; text-indent: 0; }
h1, h2, h3, h4, h5, h6 {
  font-weight: bold;
  text-align: center;
  line-height: 1.3;
  page-break-after: avoid;
  break-after: avoid;
  text-indent: 0;
}
h1 { font-size: 1.7em; margin: 1.2em 0 0.8em; }
h2 { font-size: 1.4em; margin: 1.1em 0 0.6em; }
h3 { font-size: 1.2em; margin: 1em 0 0.5em; }
h4 { font-size: 1.08em; margin: 0.9em 0 0.4em; }
h5, h6 { font-size: 1em; margin: 0.8em 0 0.3em; }
section > h1:first-child,
section > h2:first-child { margin-top: 0.6em; }

.big { font-size: 1.15em; }
small { font-size: 0.85em; }
sup, sub { line-height: 0; font-size: 0.75em; }

/* ── הערות ומפרשים ── */
a.noteref {
  font-size: 0.68em;
  vertical-align: super;
  line-height: 0;
  text-decoration: none;
  font-weight: bold;
  padding: 0 0.12em;
}
a.noteback { text-decoration: none; font-weight: bold; }
.cm-rashi { font-family: "Noto Rashi Hebrew", "Mekorot-Rashi", "Rashi", serif; }
.cm-book { font-family: inherit; }
.cm-who { font-weight: bold; }

/* מתחת לכל קטע */
div.cm-block {
  margin: 0.15em 1.2em 0.7em 0;
  padding-right: 0.6em;
  border-right: 2px solid #b8a98c;
  font-size: 0.82em;
  line-height: 1.45;
}
p.cm { margin: 0 0 0.3em; }

/* בסוף הפרק */
section.chapter-notes {
  margin-top: 2em;
  padding-top: 0.6em;
  border-top: 1px solid #999;
  font-size: 0.82em;
  line-height: 1.45;
}
h2.notes-title { font-size: 1.15em; margin: 0.4em 0 0.6em; }

/* הערות סיום (נפתחות כחלונית) */
section.endnotes { font-size: 0.9em; line-height: 1.5; }
section.endnotes ol { list-style: none; margin: 0; padding: 0; }
li.endnote { margin: 0 0 0.6em; }
li.endnote p { margin: 0; }

/* ── כריכה ── */
body.cover-body { margin: 0; padding: 0; text-align: center; }
div.cover { margin: 0; padding: 0; text-align: center; height: 100%; }
div.cover img { max-width: 100%; max-height: 100%; height: auto; }

/* ── שער ── */
body.front { text-align: center; }
section.titlepage { padding: 6% 2%; }
.tp-frame {
  border: 3px double #6b5432;
  padding: 2.4em 1.2em 2em;
  text-align: center;
}
.tp-rule {
  height: 0;
  width: 40%;
  margin: 1.4em auto;
  border-top: 1px solid #6b5432;
  border-bottom: 1px solid #6b5432;
  padding-top: 2px;
}
.tp-rule-top { margin-top: 0; }
h1.tp-title { font-size: 2.2em; margin: 0.4em 0 0.3em; letter-spacing: 0.02em; }
.tp-subtitle { font-size: 1.15em; margin: 0.2em 0 0.6em; font-style: normal; }
.tp-author { font-size: 1.25em; margin: 0.8em 0 0.2em; }
.tp-with { font-size: 1em; margin: 0.8em 0 0; }
ul.tp-books { list-style: none; margin: 1em 0 0; padding: 0; }
ul.tp-books li { margin: 0.25em 0; font-size: 1.1em; }
.tp-range { font-size: 0.85em; }
.tp-source { font-size: 0.9em; margin-top: 1em; }
.tp-source p { margin: 0.3em 0; text-align: center; }
.tp-personal { font-weight: bold; margin-top: 0.8em; }
section.titlepage a, section.colophon a { color: inherit; }

/* ── דף פרטים וזכויות ── */
section.colophon { text-align: right; font-size: 0.92em; padding: 1em 0; }
section.colophon h1 { font-size: 1.5em; }
section.colophon h2 { font-size: 1.15em; text-align: right; margin: 1.2em 0 0.4em; }
table.col-table { border-collapse: collapse; width: 100%; margin: 0 0 0.6em; }
table.col-table th, table.col-table td {
  text-align: right;
  vertical-align: top;
  padding: 0.25em 0.4em;
  border-bottom: 1px solid #ccc;
}
table.col-table th { width: 7em; font-weight: bold; white-space: nowrap; }
.col-desc { margin: 0.5em 0; }
.col-notice { margin-top: 1.6em; padding-top: 0.6em; border-top: 1px solid #999; font-size: 0.9em; }
.col-notice p { margin: 0 0 0.6em; }

/* ── שער פנימי לכל ספר (קובץ מרובה ספרים) ── */
body.part-body { text-align: center; }
section.part { padding-top: 30%; }
h1.part-title { font-size: 2em; }
.part-range, .part-author { text-align: center; font-size: 1.1em; }

nav#toc ol { list-style: none; padding-right: 1.2em; padding-left: 0; }
nav#toc > ol { padding-right: 0; }
nav#toc li { margin: 0.2em 0; }
nav#toc a { text-decoration: none; color: inherit; }
`;
  if (typeof module !== 'undefined' && module.exports) module.exports = BOOK_CSS;
  else root.EPUB_BOOK_CSS = BOOK_CSS;
})(typeof window !== 'undefined' ? window : globalThis);
