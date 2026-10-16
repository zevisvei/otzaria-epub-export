// בדיקות ל-js/core.js: מספרים עבריים, רשימות, השוואה, ואיתור כל מצוה
// בתוכן העניינים של ספרי אוצריא (tools/fixtures/tocs.json — הכותרות מספרי otzaria-library).
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const C = require('../js/core.js');

global.window = {};
require('../js/data.js');
const D = global.window.MITZVOT_DATA;

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}

test('מספרים עבריים', () => {
  assert.strictEqual(C.hebNum(15), 'טו');
  assert.strictEqual(C.hebNum(16), 'טז');
  assert.strictEqual(C.hebNum(270), 'ער');
  assert.strictEqual(C.hebNum(275), 'ערה');
  assert.strictEqual(C.hebNum(298), 'רחצ');
  assert.strictEqual(C.hebNum(304), 'דש');
  assert.strictEqual(C.hebNum(344), 'שדמ');
  assert.strictEqual(C.hebNum(613), 'תריג');
  assert.strictEqual(C.hebNumG(613), 'תרי״ג');
  assert.strictEqual(C.hebNumG(5), 'ה׳');
  for (let n = 1; n <= 700; n++) assert.strictEqual(C.hebValue(C.hebNum(n)), n, `n=${n}`);
});

const I = C.buildIndex(D);

test('מניין כל מונה', () => {
  const count = (k, kind) => I.lists[k].filter((e) => e.kind === kind).length;
  for (const k of ['rambam', 'semag', 'chinuch']) {
    assert.strictEqual(count(k, 'A'), 248, k);
    assert.strictEqual(count(k, 'L'), 365, k);
  }
  assert.strictEqual(I.lists.bahag.length, 613);
  assert.strictEqual(I.lists.ramban.length, 620);
  assert.strictEqual(I.lists.semag[0].kind, 'L', 'הסמ"ג פותח בלאוין');
});

test('קבוצות', () => {
  assert.deepStrictEqual(C.groupsOf(I, 'chinuch').map((g) => g.items.length), [3, 111, 247, 52, 200]);
  assert.strictEqual(C.groupsOf(I, 'bahag').length, 9);
  assert.deepStrictEqual(C.groupsOf(I, 'rambam').map((g) => g.title), ['מצוות עשה', 'מצוות לא תעשה']);
});

test('השוואה', () => {
  const r = C.compare(I, 'rambam', 'chinuch');
  // החינוך הולך בשיטת הרמב"ם, חוץ ממצוה אחת שבמאגר נמנתה אחרת
  assert.ok(r.onlyA.length <= 1 && r.onlyB.length <= 1, `${r.onlyA.length}/${r.onlyB.length}`);
  const b = C.compare(I, 'rambam', 'bahag');
  assert.ok(b.onlyA.length > 50 && b.onlyB.length > 50);
  assert.strictEqual(b.onlyA.length + b.both.length, 613);
  const all = C.allMitzvot(I, 'all');
  const mach = C.allMitzvot(I, 'machloket');
  const agreed = C.allMitzvot(I, 'agreed');
  assert.strictEqual(mach.length + agreed.length, all.length);
});

test('חיפוש', () => {
  assert.ok(C.matches('שמע', 'מצות קריאת שמע'));
  assert.ok(C.matches('קריאת  שמע', 'מצות קְרִיאַת שמע'));
  assert.ok(!C.matches('תפילין', 'מצות קריאת שמע'));
});

const tocs = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tocs.json'), 'utf8'));
const flat = Object.fromEntries(Object.entries(tocs).map(([k, v]) => [C.norm(k), C.flattenToc(v)]));

test('כל מצוה נמצאת במקומה בספר המונה', () => {
  const missing = [];
  for (const k of Object.keys(I.lists)) {
    for (const e of I.lists[k]) {
      const t = C.openTarget(I, e);
      if (!t) { if (k !== 'ramban') missing.push(`${k} ${e.num}: אין יעד`); continue; }
      const f = flat[C.norm(t.title)];
      assert.ok(f, `אין תוכן עניינים ל-${t.title}`);
      if (C.findInToc(f, t) == null) missing.push(`${k} ${C.entryLabel(e)} ← ${t.label}`);
    }
  }
  assert.deepStrictEqual(missing, []);
});

test('יעד הרמב"ם הוא הכותרת הנכונה', () => {
  const e = I.lists.rambam.find((x) => x.kind === 'L' && x.num === 298);
  const t = C.openTarget(I, e);
  const f = flat[C.norm('ספר המצוות')];
  const idx = C.findInToc(f, t);
  const entry = f.find((x) => x.index === idx);
  assert.strictEqual(entry.text, 'מצוה רחצ');
  assert.ok(f.find((x) => x.text === 'מצוות לא תעשה').index < idx);
});

test('פסוק', () => {
  const e = I.lists.rambam[0];
  const v = C.verseTarget(I.books, e.src);
  assert.strictEqual(v.title, 'שמות');
  assert.strictEqual(v.ref, 'כ:ב');
  assert.strictEqual(C.verseText(I.books, e.src), 'שמות כ׳, ב׳');
});

if (failed) { console.log(`\n${failed} בדיקות נכשלו`); process.exit(1); }
console.log('\nכל הבדיקות עברו');
