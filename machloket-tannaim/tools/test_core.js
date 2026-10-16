// בדיקות ל-js/core.js: מספרים, מפתחות, דברי תנא, בין שני תנאים, ושמות המסכתות כבספריית אוצריא
// (tools/fixtures/library.json — שמות ספרי המשנה ותוכן העניינים של משנה ברכות מ-otzaria-library).
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const C = require('../js/core.js');

global.window = {};
require('../js/data.js');
const D = global.window.MACHLOKET_DATA;
const LIB = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'library.json'), 'utf8'));

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}

const I = C.buildIndex(D);
const id = (n) => { const i = I.names.indexOf(n); assert.ok(i >= 0, `אין ${n}`); return i; };

test('מספרים עבריים', () => {
  assert.strictEqual(C.hebNum(15), 'טו');
  assert.strictEqual(C.hebNum(24), 'כד');
  assert.strictEqual(C.hebNumG(1), 'א׳');
  assert.strictEqual(C.hebNumG(30), 'ל׳');
  assert.strictEqual(C.hebNumG(16), 'ט״ז');
});

test('ששה סדרים ושישים ושלש מסכתות', () => {
  assert.strictEqual(I.masechtot.length, 63);
  assert.deepStrictEqual([...new Set(I.masechtot.map((m) => m.seder))], C.SEDARIM);
});

test('כל מסכת קיימת בספריית אוצריא', () => {
  const titles = new Set(LIB.mishnaTitles);
  const missing = I.masechtot.filter((m) => !titles.has(m.title)).map((m) => m.title);
  assert.deepStrictEqual(missing, []);
});

test('כל מחלוקת — שני חולקים לפחות, ובכל אחד שם', () => {
  for (const a of I.args) {
    assert.ok(a.positions.length >= 2);
    for (const p of a.positions) for (const n of p.ids) assert.ok(I.names[n]);
  }
});

test('מחלוקת ראשונה שבמשנה', () => {
  const a = I.masechtot[0].args[0];
  assert.strictEqual(I.masechtot[0].name, 'ברכות');
  assert.strictEqual(C.locText(a), 'פרק א משנה א');
  const names = a.positions.map((p) => C.positionName(I, p));
  assert.deepStrictEqual(names, ['רבי אליעזר', 'חכמים', 'רבן גמליאל']);
  assert.ok(a.positions[1].halacha, 'הלכה כחכמים');
  assert.strictEqual(a.positions[0].stance, 'H');
});

test('דברי תנא', () => {
  const s = C.tannaStats(I, id('רבי אליעזר'));
  assert.ok(s.count > 200);
  assert.ok(s.halacha < s.decided);
  assert.ok(s.rivals.length > 5);
  assert.ok(s.rivals[0].count >= s.rivals[1].count);
});

test('בית שמאי ובית הלל', () => {
  const r = C.between(I, id('בית שמאי'), id('בית הלל'));
  assert.ok(r.list.length > 200);
  assert.ok(r.forB > r.forA * 10, 'הלכה כבית הלל');
  assert.ok(r.strictA > r.strictB, 'רוב חומרות בית שמאי');
  assert.strictEqual(r.rule.winner, 'בית הלל');
});

test('כלל הפסק לפי שמות בכל סדר', () => {
  assert.ok(C.ruleFor('רבי יוסי', 'רבי יהודה'));
  assert.strictEqual(C.ruleFor('רבי טרפון', 'רבי עקיבא'), null);
  for (const r of C.RULES) { id(r.a); id(r.b); }
});

test('יעד הפתיחה', () => {
  const a = I.masechtot[0].args.find((x) => x.chapter === 2);
  const t = C.openTarget(I, a);
  assert.strictEqual(t.title, 'משנה ברכות');
  assert.strictEqual(t.ref, `ב:${C.hebNum(a.mishna)}`);
  assert.strictEqual(C.chapterIndex(LIB.brachotToc, 2), 7);
});

test('חיפוש', () => {
  assert.ok(C.matches('אליעזר', 'רבי אליעזר'));
  assert.ok(!C.matches('טרפון', 'רבי אליעזר'));
});

if (failed) { console.log(`\n${failed} בדיקות נכשלו`); process.exit(1); }
console.log('\nכל הבדיקות עברו');
