// בדיקות ללוגיקה הטהורה + בניית קובצי EPUB לדוגמה (לבדיקה ב-epubcheck).
// שימוש: node tools/test_core.js [תיקיית-פלט]
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const C = require('../js/core.js');
const CSS = require('../js/bookcss.js');

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

function bookSpec(b, range, extra) {
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
  const files = C.buildEpub(spec);
  const bytes = await C.zip(files, deflate);
  return { files, bytes, name };
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
    assert.ok(notes.includes('epub:type="endnote"') && notes.includes('פירוש רש&quot;י'));
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
  test('metadata has rights, source and personal-use note', () => {
    const opf = builds[2].files.find((x) => x.path.endsWith('content.opf')).data;
    assert.ok(opf.includes('<dc:rights>') && opf.includes('GPL-3.0') && opf.includes('לשימוש אישי בלבד'));
    assert.ok(opf.includes('<dc:source>ספריא — https://www.sefaria.org/texts</dc:source>'));
    assert.ok(/<meta property="dcterms:modified">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/meta>/.test(opf));
  });

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const b of builds) fs.writeFileSync(path.join(outDir, `${b.name}.epub`), b.bytes);
    console.log(`wrote ${builds.length} samples to ${outDir}`);
  }
  console.log(`${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
})();
