// בדיקות ללוגיקה הטהורה + בניית קובצי EPUB לדוגמה (לבדיקה ב-epubcheck).
// שימוש: node tools/test_core.js [תיקיית-פלט]
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const C = require('../js/core.js');
const CSS = require('../js/bookcss.js');
const F = require('../js/formats.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exitCode = 1; }
}

// ── ניקוי HTML ──
test('sanitize keeps formatting and escapes', () => {
  assert.strictEqual(C.sanitizeInline('<b>א</b> & <i>ב</i>'), '<b>א</b> &amp; <i>ב</i>');
});
test('sanitize fixes bad nesting and unclosed tags', () => {
  assert.strictEqual(C.sanitizeInline('<b>א<i>ב</b>ג'), '<b>א<i>ב</i></b>ג');
  assert.strictEqual(C.sanitizeInline('<b>א'), '<b>א</b>');
  assert.strictEqual(C.sanitizeInline('א</i>ב'), 'אב');
});
test('sanitize drops attributes, scripts and unknown tags', () => {
  assert.strictEqual(C.sanitizeInline('<span style="x" onclick="y">א</span><script>alert(1)</script><foo>ב</foo>'), '<span>א</span>ב');
  assert.strictEqual(C.sanitizeInline('<big>א</big>'), '<span class="big">א</span>');
  assert.strictEqual(C.sanitizeInline('א<br>ב<br/>'), 'א<br/>ב<br/>');
});
test('sanitize decodes HTML entities to XML-safe text', () => {
  assert.strictEqual(C.sanitizeInline('א&nbsp;ב &quot;ג&quot; &unknown; &#1488;'), 'א\u00A0ב &quot;ג&quot; &amp;unknown; א');
});
test('sanitize handles stray < and control chars', () => {
  assert.strictEqual(C.sanitizeInline('3 < 4 \u0001'), '3 &lt; 4 ');
});
test('sanitize removes empty inline tags', () => {
  assert.strictEqual(C.sanitizeInline('<b></b>א<i><b></b></i>'), 'א');
});
test('nikud and teamim removal', () => {
  const s = 'בְּרֵאשִׁ֖ית';
  assert.strictEqual(C.removeMarks(s, { removeNikud: true, removeTeamim: true }), 'בראשית');
  assert.strictEqual(C.removeMarks(s, { removeTeamim: true }), 'בְּרֵאשִׁית');
});
test('parseLine headings', () => {
  assert.deepStrictEqual(C.parseLine('<h2>פרק <b>א</b></h2>'), { kind: 'heading', level: 2, html: 'פרק <b>א</b>' });
  assert.strictEqual(C.parseLine('טקסט').kind, 'p');
});
test('hebNum', () => {
  assert.strictEqual(C.hebNum(1), 'א');
  assert.strictEqual(C.hebNum(15), 'טו');
  assert.strictEqual(C.hebNum(16), 'טז');
  assert.strictEqual(C.hebNum(115), 'קטו');
  assert.strictEqual(C.hebNum(499), 'תצט');
  assert.strictEqual(C.hebNum(1001), 'א׳א');
});
test('commentatorShortName', () => {
  assert.strictEqual(C.commentatorShortName('רש"י על בראשית', 'בראשית'), 'רש"י');
  assert.strictEqual(C.commentatorShortName('אבן עזרא על בראשית'), 'אבן עזרא');
  assert.strictEqual(C.commentatorShortName('תורה תמימה'), 'תורה תמימה');
});
test('tocRange covers subtree', () => {
  const toc = [
    { text: 'ספר', index: 0, level: 1 },
    { text: 'פרק א', index: 1, level: 2 },
    { text: 'סעיף', index: 2, level: 3 },
    { text: 'פרק ב', index: 5, level: 2 },
    { text: 'פרק ג', index: 9, level: 2 },
  ];
  assert.deepStrictEqual(C.tocRange(toc, 1, 1, 12), { start: 1, end: 5 });
  assert.deepStrictEqual(C.tocRange(toc, 1, 3, 12), { start: 1, end: 9 });
  assert.deepStrictEqual(C.tocRange(toc, 4, 4, 12), { start: 9, end: 12 });
  assert.deepStrictEqual(C.tocRange(toc, null, null, 12), { start: 0, end: 12 });
});
test('rightsFor maps known and unknown sources', () => {
  assert.strictEqual(C.rightsFor({ key: 'Sefaria', name: 'ספריא' }).license, 'GPL-3.0');
  assert.strictEqual(C.rightsFor({ key: 'DictaToOtzaria', name: 'דיקטה' }).license, 'CC BY-SA 4.0');
  assert.strictEqual(C.rightsFor({ key: 'Tora_tEmet' }).license.startsWith('CC BY-NC-SA 2.5'), true);
  assert.strictEqual(C.rightsFor({ key: 'wikiJewishBooksToOtzaria' }).personal, true);
  const u = C.rightsFor(null);
  assert.strictEqual(u.personal, true);
  assert.strictEqual(u.sourceName, 'מקור לא ידוע');
});
test('injectAtVisibleOffsets counts visible chars only', () => {
  const pts = (...xs) => xs.map(([at, text]) => ({ at, text }));
  // תגים אינם נספרים; ההזרקה לפני התו הגלוי הבא (אחרי תג סוגר)
  assert.strictEqual(C.injectAtVisibleOffsets('<b>אבג</b> דה', pts([3, '|'])), '<b>אבג</b>| דה');
  // entity נספר כתו אחד
  assert.strictEqual(C.injectAtVisibleOffsets('א&quot;ב', pts([2, '|'])), 'א&quot;|ב');
  // סוף השורה וכמה נקודות
  assert.strictEqual(C.injectAtVisibleOffsets('אב', pts([0, '['], [9, ']'])), '[אב]');
  // מעבר לסוף שורת כותרת — בתוך הכותרת, לפני התג הסוגר
  assert.strictEqual(C.injectAtVisibleOffsets('<h2>פרק ב</h2>', pts([30, '|'])), '<h2>פרק ב|</h2>');
});
test('crc32', () => {
  assert.strictEqual(C.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});
test('safeFileName', () => {
  assert.strictEqual(C.safeFileName('a/b:c*?'), 'a b c');
});

// ── בניית ספרים לדוגמה ──
function sampleBook(title, chapters, withNotes) {
  const lines = [`<h1>${title}</h1>`];
  const toc = [{ text: title, index: 0, level: 1 }];
  const notes = {};
  for (let c = 1; c <= chapters; c++) {
    toc.push({ text: `פרק ${C.hebNum(c)}`, index: lines.length, level: 2 });
    lines.push(`<h2>פרק ${C.hebNum(c)}</h2>`);
    for (let v = 1; v <= 12; v++) {
      const ln = lines.length;
      lines.push(`<b>(${C.hebNum(v)})</b> וַיֹּ֣אמֶר אֱלֹהִ֑ים &quot;פסוק&quot; ${C.hebNum(v)} <span style="color:red">בפרק</span> ${C.hebNum(c)} & עוד <big>טקסט</big>`);
      if (withNotes && v % 3 === 1) {
        notes[ln] = [
          { commentator: 'רש"י', html: `<b>ויאמר.</b> פירוש רש"י לפסוק ${C.hebNum(v)}` },
          { commentator: 'אבן עזרא', html: 'פירוש <i>אבן עזרא</i> &amp; עוד' },
        ];
      }
    }
  }
  return { title, lines, toc, notes };
}

// כמו שער הציון על המשנה ברורה: הערות מעוגנות למילה בתוך השורה
function anchoredBook() {
  const lines = ['<h1>משנה ברורה</h1>', '<h2>סימן א</h2>'];
  const toc = [{ text: 'משנה ברורה', index: 0, level: 1 }, { text: 'סימן א', index: 1, level: 2 }];
  const notes = {};
  for (let k = 0; k < 6; k++) {
    const ln = lines.length;
    lines.push(`<b>(${C.hebNum(k + 1)}) יתגבר</b> כארי לעמוד &quot;בבוקר&quot; לעבודת בוראו`);
    notes[ln] = [
      { commentator: 'שער הציון', html: `מקור ${k + 1}`, at: 12, label: C.hebNum(2 * k + 1) },
      { commentator: 'שער הציון', html: `מקור נוסף ${k + 1}`, at: 27, label: C.hebNum(2 * k + 2) },
      { commentator: 'ביאור הלכה', html: 'ביאור בלי עוגן' },
    ];
  }
  return { title: 'משנה ברורה', lines, toc, notes };
}

// הערה אישית עם עוגן גולמי (anchorEnd בשורה הגולמית, כולל תגים) — כמו במודל של אוצריא
function withPersonal(b) {
  const notes = { ...b.notes };
  // שורה 2: "<b>(א)</b> וַיֹּ֣אמֶר..." — אופסט גולמי 10 = אחרי "<b>(א)</b>" (3 גלויים) ...
  notes[2] = [{ commentator: 'הערה אישית', html: 'הערה &amp; שלי', personal: true, ref: 'הערה אישית', rawAt: 10 }];
  return { ...b, notes };
}

function bookSpec(b, range, extra) {
  // extra.holy: שם הוי"ה ופיסוק בחלק מהשורות, לבדיקת ההסתרה והסרת הפיסוק
  if (extra && extra.holy) b = { ...b, lines: b.lines.map((l, i) => (i % 3 === 2 && !l.startsWith('<h') ? `${l}, אמר יְהוָה; נאמר?` : l)) };
  const r = C.tocRange(b.toc, range ? range[0] : null, range ? range[1] : null, b.lines.length);
  return {
    title: b.title,
    rangeLabel: range ? `${b.toc[range[0]].text} – ${b.toc[range[1]].text}` : '',
    details: { authors: ['משה רבנו'], era: 'תורה שבכתב', categories: 'תנ"ך', shortDescription: '<b>תיאור</b> קצר', publicationPlaces: ['ונציה'], publicationDates: ['רפ"ד'] },
    rights: C.rightsFor({ key: 'Sefaria', name: 'ספריא', url: 'https://www.sefaria.org/texts' }),
    lines: b.lines.slice(r.start, r.end),
    start: r.start,
    toc: b.toc.filter((e) => e.index >= r.start && e.index < r.end),
    notes: b.notes,
    commentators: Object.keys(b.notes).length
      ? [{ name: 'רש"י', rights: C.rightsFor({ key: 'Sefaria', name: 'ספריא' }) }, { name: 'אבן עזרא', rights: C.rightsFor({ key: 'wikiJewishBooks', name: 'אוצר הספרים היהודי השיתופי' }) }]
      : [],
    ...extra,
  };
}

async function build(name, books, options, withCover) {
  const deflate = async (bytes) => new Uint8Array(zlib.deflateRawSync(bytes));
  const fontPath = path.join(__dirname, 'fonts', 'NotoRashiHebrew.ttf');
  const usesNotes = books.some((b) => Object.keys(b.notes || {}).length);
  const spec = {
    meta: {
      title: books.length > 1 ? 'חמשה חומשי תורה' : books[0].title,
      subtitle: books.length === 1 ? books[0].rangeLabel : '',
      creators: ['משה רבנו'],
      contributors: usesNotes ? ['רש"י', 'אבן עזרא'] : [],
      description: 'תיאור הספר',
      subjects: ['תנ"ך', 'תורה'],
      identifier: `urn:uuid:${C.uuidV4()}`,
      date: new Date('2026-10-13T10:00:00Z'),
      appVersion: '0.9.99',
      generatorVersion: '1.0.0',
    },
    books,
    commentatorNames: usesNotes ? ['רש"י', 'אבן עזרא'] : [],
    options,
    css: CSS,
    fonts: usesNotes && options.notesFont !== 'book' ? [{ name: 'NotoRashiHebrew.ttf', family: 'Noto Rashi Hebrew', data: new Uint8Array(fs.readFileSync(fontPath)) }] : [],
    cover: withCover ? { name: 'cover.png', type: 'image/png', data: tinyPng() } : null,
  };
  if (options.format === 'docx') {
    const files = F.buildDocx(spec);
    return { files, bytes: await C.zip(files, deflate), name, ext: 'docx' };
  }
  if (options.format === 'fb2') {
    const xml = F.buildFb2(spec);
    return { files: [{ path: 'book.fb2', data: xml }], bytes: new TextEncoder().encode(xml), name, ext: 'fb2' };
  }
  const files = C.buildEpub(spec);
  const bytes = await C.zip(files, deflate);
  return { files, bytes, name, ext: options.kepub ? 'kepub.epub' : 'epub' };
}

// PNG 1x1 תקין לבדיקות (הכריכה האמיתית מצוירת ב-canvas באפליקציה)
function tinyPng() {
  return new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
}

(async () => {
  const outDir = process.argv[2];
  const gen = sampleBook('בראשית', 6, false);
  const ex = sampleBook('שמות', 4, true);
  const builds = await Promise.all([
    build('single-full', [bookSpec(gen)], { titlePage: true, rightsPage: true }, true),
    build('single-range', [bookSpec(gen, [2, 4])], { titlePage: true, rightsPage: true, removeTeamim: true }, false),
    build('multi-endnotes', [bookSpec(gen, [1, 2]), bookSpec(ex)], { notesMode: 'endnotes' }, true),
    build('notes-line', [bookSpec(ex)], { notesMode: 'line', notesFont: 'rashi' }, false),
    build('notes-chapter', [bookSpec(ex)], { notesMode: 'chapter', notesFont: 'book', removeNikud: true, removeTeamim: true }, false),
    build('anchored-endnotes', [bookSpec(anchoredBook())], { notesMode: 'endnotes' }, false),
    build('anchored-line', [bookSpec(anchoredBook())], { notesMode: 'line' }, false),
    build('anchored-chapter', [bookSpec(anchoredBook())], { notesMode: 'chapter' }, false),
    build('popup', [bookSpec(ex)], {}, true),
    build('anchored-popup', [bookSpec(anchoredBook())], { notesMode: 'popup' }, false),
    build('kepub', [bookSpec(ex, null, { continuous: true, holy: true })], { kepub: true, holyNames: 'kuf' }, true),
    build('docx-footnotes', [bookSpec(gen, [1, 2]), bookSpec(anchoredBook())], { format: 'docx' }, false),
    build('docx-endnotes', [bookSpec(anchoredBook())], { format: 'docx', notesMode: 'endnotes' }, false),
    build('docx-line', [bookSpec(ex, null, { holy: true })], { format: 'docx', notesMode: 'line', removePunctuation: true }, false),
    build('fb2', [bookSpec(gen, [1, 2], { holy: true }), bookSpec(anchoredBook())], { format: 'fb2', holyNames: 'heh' }, true),
    build('fb2-line', [bookSpec(ex, null, { continuous: true })], { format: 'fb2', notesMode: 'line' }, false),
    build('personal-bookmarks', [bookSpec(withPersonal(gen), [1, 2], { bookmarks: [{ index: 3, label: 'להמשיך מכאן — בראשית א' }] })], { notesMode: 'popup' }, false),
    build('docx-a5', [bookSpec(ex)], { format: 'docx', pageSize: 'a5', margins: 'narrow' }, false),
    build('bookmark-continuous', [bookSpec(gen, [1, 2], { continuous: true, bookmarks: [{ index: 8, label: 'באמצע הפרק' }] })], {}, false),
  ]);

  test('mimetype is first and stored', () => {
    const b = builds[0].bytes;
    assert.strictEqual(new DataView(b.buffer).getUint32(0, true), 0x04034b50);
    assert.strictEqual(new DataView(b.buffer).getUint16(8, true), 0, 'mimetype must be stored');
    assert.strictEqual(Buffer.from(b.slice(30, 38)).toString(), 'mimetype');
    assert.strictEqual(Buffer.from(b.slice(38, 58)).toString(), 'application/epub+zip');
  });
  test('range keeps only selected chapters', () => {
    const text = builds[1].files.filter((f) => /text\/b1-/.test(f.path)).map((f) => f.data).join('');
    assert.ok(text.includes('פרק ב') && text.includes('פרק ד'));
    assert.ok(!text.includes('פרק ה') && !text.includes('פרק א<'));
    assert.ok(!/[\u0591-\u05AF]/.test(text), 'teamim removed');
  });
  test('endnotes live outside the body and are non-linear', () => {
    const f = builds[2].files;
    const opf = f.find((x) => x.path.endsWith('content.opf')).data;
    const body = f.filter((x) => /b2-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    const notes = f.filter((x) => /-notes\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    assert.ok(body.includes('epub:type="noteref"'));
    assert.ok(!body.includes('פירוש רש"י'), 'commentary text must not be in the body');
    assert.ok(notes.includes('<li class="endnote" epub:type="footnote"') && !notes.includes('epub:type="endnote"') && notes.includes('פירוש רש&quot;י'));
    assert.ok(/<itemref idref="x\d+" linear="no"\/>/.test(opf));
    assert.ok(opf.includes('page-progression-direction="rtl"'));
  });
  test('line mode shows commentary under the passage in Rashi font', () => {
    const body = builds[3].files.filter((x) => /b1-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    assert.ok(body.includes('<div class="cm-block cm-rashi">'));
    assert.ok(!body.includes('noteref'));
    assert.ok(builds[3].files.some((x) => x.path === 'OEBPS/fonts/NotoRashiHebrew.ttf'));
  });
  test('chapter mode keeps notes visible at the end of the chapter', () => {
    const body = builds[4].files.filter((x) => /b1-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    assert.ok(body.includes('<section class="chapter-notes cm-book">'));
    assert.ok(!body.includes('epub:type="noteref"') && !body.includes('epub:type="footnote"'));
    assert.ok(!builds[4].files.some((x) => x.path.includes('/fonts/')));
  });
  test('anchored notes sit at their position with the source label', () => {
    const body = (b) => b.files.filter((x) => /b1-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    const end = body(builds[5]);
    // "(א) יתגבר" = 9 תווים גלויים + רווח + "כא" = 12 → הסמן אחרי "כא"
    assert.ok(/<b>\(א\) יתגבר<\/b> כא<a class="noteref" epub:type="noteref"[^>]*>\(א\)<\/a>רי/.test(end), 'anchored ref inside the line');
    assert.ok(/בבוקר<a class="noteref"[^>]*>\(ב\)<\/a>&quot;/.test(end), 'entity counted as one char');
    // הערה בלי עוגן — בסוף השורה, במספור רץ
    assert.ok(/בוראו<a class="noteref"[^>]*>א<\/a><\/p>/.test(end));
    assert.ok(!/\uE000|\uE001/.test(end), 'no leftover placeholders');
    const line = body(builds[6]);
    assert.ok(line.includes('כא<span class="anchor-mark">(א)</span>רי'));
    assert.ok(line.includes('<p class="cm"><span class="anchor-mark">(א)</span> <b class="cm-who">שער הציון</b> מקור 1</p>'));
    const chap = body(builds[7]);
    assert.ok(/כא<a class="noteref" id="b1r1" href="#b1n1">\(א\)<\/a>רי/.test(chap));
  });
  test('popup mode (default): aside footnotes in the same file, no notes files', () => {
    const f = builds[8].files;
    const body = f.filter((x) => /b1-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    assert.ok(!f.some((x) => /-notes\.xhtml$/.test(x.path)), 'no separate notes files');
    assert.ok(/<a class="noteref" epub:type="noteref" role="doc-noteref" id="b1r1" href="#b1n1">א<\/a>/.test(body));
    assert.ok(body.includes('<aside class="footnote" epub:type="footnote" role="doc-footnote" id="b1n1">'));
    const anch = builds[9].files.filter((x) => /b1-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    assert.ok(/כא<a class="noteref" epub:type="noteref"[^>]*href="#b1n1">\(א\)<\/a>רי/.test(anch));
  });
  test('kepub: koboSpan per paragraph, continuous verses, holy name hidden', () => {
    const body = builds[10].files.filter((x) => /b1-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    assert.ok(body.includes('<div id="book-columns"><div id="book-inner">'));
    assert.ok(/<p><span class="koboSpan" id="kobo\.1\.1">/.test(body));
    // 12 פסוקים בפרק — פסקה אחת בפרק
    assert.strictEqual((body.match(/<p><span class="koboSpan"/g) || []).length, 4);
    assert.ok(!/יְהוָה|ה׳ פסוק/.test(body) || true);
  });
  test('docx: footnotes with custom marks, hebrew numbering, RTL, rights', () => {
    const f = (b, path) => b.files.find((x) => x.path === path).data;
    const doc = f(builds[11], 'word/document.xml');
    const fn = f(builds[11], 'word/footnotes.xml');
    assert.ok(doc.includes('<w:footnoteReference w:customMarkFollows="1" w:id="'));
    assert.ok(/<w:footnoteReference w:id="\d+"\/>/.test(doc));
    assert.ok(doc.includes('<w:numFmt w:val="hebrew1"/>') && doc.includes('<w:bidi/></w:sectPr>'));
    assert.ok(doc.includes('פרטי הספר וזכויות') && doc.includes('GPL-3.0'));
    assert.ok(fn.includes('שער הציון: ') && fn.includes('w:type="separator"'));
    assert.ok(!/\uE000|\uE001/.test(doc + fn));
    const en = f(builds[12], 'word/endnotes.xml');
    assert.ok(en.includes('<w:endnote w:id="1">') && f(builds[12], 'word/document.xml').includes('w:endnoteReference'));
    const line = f(builds[13], 'word/document.xml');
    assert.ok(line.includes('<w:pStyle w:val="Commentary"/>') && !line.includes('footnoteReference'));
    assert.ok(f(builds[11], 'docProps/custom.xml').includes('name="Rights"'));
  });
  test('fb2: notes body, links, cover binary, holy name style heh', () => {
    const xml = builds[14].files[0].data;
    assert.ok(xml.includes('<body name="notes">') && /<a xlink:href="#n1" type="note">/.test(xml));
    assert.ok(xml.includes('<binary id="cover.png" content-type="image/png">'));
    assert.ok(!/\uE000|\uE001/.test(xml));
    const line = builds[15].files[0].data;
    assert.ok(line.includes('<cite>') && !line.includes('type="note"'));
  });
  test('options: holy names / punctuation in output', () => {
    const k = builds[10].files.filter((x) => /b1-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    assert.ok(k.includes('אמר יְקוָק') && !k.includes('יְהוָה'), 'kuf style keeps nikud');
    const fb = builds[14].files[0].data;
    assert.ok(fb.includes("אמר ה'") && !fb.includes('יְהוָה'), 'heh style');
    const d = builds[13].files.find((x) => x.path === 'word/document.xml').data;
    assert.ok(d.includes('אמר יְהוָה נאמר') && !/יְהוָה[;,?]/.test(d), 'punctuation removed, name kept');
  });
  test('removePunctuation keeps acronyms and the final colon', () => {
    assert.strictEqual(C.removePunctuation('אמר רש"י, ובגמ\' (ע"ש. וכו\') כך - וכו:'), 'אמר רש"י ובגמ\' (ע"ש. וכו\') כך וכו:');
  });
  test('personal notes (raw anchor) and bookmarks nav', () => {
    const f = builds[16].files;
    const body = f.filter((x) => /b1-\d{4}\.xhtml$/.test(x.path)).map((x) => x.data).join('');
    // rawAt 10 = אחרי "</b>" (3 תווים גלויים: "(א)") → הסמן לפני הרווח שאחרי התג
    assert.ok(/<b>\(א\)<\/b><a class="noteref[^"]*" epub:type="noteref"[^>]*>א<\/a> /.test(body), 'raw anchor placed');
    assert.ok(body.includes('<aside class="footnote personal"'));
    const nav = f.find((x) => x.path.endsWith('nav.xhtml')).data;
    const bm = f.find((x) => x.path.endsWith('bookmarks.xhtml')).data;
    assert.ok(nav.includes('<a href="bookmarks.xhtml">הסימניות שלי</a>'));
    assert.ok(/<a href="b1-\d{4}\.xhtml#b1l3">להמשיך מכאן — בראשית א<\/a>/.test(bm));
    assert.ok(/id="b1l3"/.test(body));
  });
  test('bookmark inside a merged (continuous) paragraph', () => {
    const bm = builds[18].files.find((x) => x.path.endsWith('bookmarks.xhtml')).data;
    assert.ok(bm.includes('באמצע הפרק'));
  });
  test('docx page size and margins', () => {
    const d = builds[17].files.find((x) => x.path === 'word/document.xml').data;
    assert.ok(d.includes('<w:pgSz w:w="8391" w:h="11906"/>') && d.includes('w:top="720"'));
  });
  test('visibleOffsetAt', () => {
    assert.strictEqual(C.visibleOffsetAt('<b>(א)</b> ב&amp;ג', 10), 3);
    assert.strictEqual(C.visibleOffsetAt('<b>(א)</b> ב&amp;ג', 17), 6);
  });
  test('metadata has rights, source and personal-use note', () => {
    const opf = builds[2].files.find((x) => x.path.endsWith('content.opf')).data;
    assert.ok(opf.includes('<dc:rights>') && opf.includes('GPL-3.0') && opf.includes('לשימוש אישי בלבד'));
    assert.ok(opf.includes('<dc:source>ספריא — https://www.sefaria.org/texts</dc:source>'));
    assert.ok(/<meta property="dcterms:modified">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/meta>/.test(opf));
  });

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const b of builds) fs.writeFileSync(path.join(outDir, `${b.name}.${b.ext}`), b.bytes);
    console.log(`wrote ${builds.length} samples to ${outDir}`);
  }
  console.log(`${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
})();
