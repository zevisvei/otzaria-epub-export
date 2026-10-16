// לוגיקה טהורה של "מחלוקות התנאים": מחלוקות לפי מסכת ופרק, דברי כל תנא,
// בין שני תנאים, כללי הפסק שבגמרא, ויעד הפתיחה במשנה. נטען גם ב-Node לבדיקות.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UNITS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];

  /** מספר עברי עד 99 (פרקים ומשניות). */
  function hebNum(n) {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return '';
    if (n === 15) return 'טו';
    if (n === 16) return 'טז';
    return TENS[Math.floor(n / 10) % 10] + UNITS[n % 10];
  }
  function hebNumG(n) {
    const s = hebNum(n);
    return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
  }

  const SEDARIM = ['זרעים', 'מועד', 'נשים', 'נזיקין', 'קדשים', 'טהרות'];

  /** דעת התנא במחלוקת. */
  const STANCE = { H: 'מחמיר', K: 'מקל', M: 'דעה אמצעית', C: 'מחייב', P: 'פוטר', '': '' };

  /**
   * כללי הפסק שבגמרא בין שני תנאים. names — השמות כפי שבנתונים.
   * winner — שמו של מי שהלכה כמותו.
   */
  const RULES = [
    { a: 'רבי מאיר', b: 'רבי יהודה', winner: 'רבי יהודה', text: 'רבי מאיר ורבי יהודה — הלכה כרבי יהודה', src: 'עירובין מו:' },
    { a: 'רבי יהודה', b: 'רבי יוסי', winner: 'רבי יוסי', text: 'רבי יהודה ורבי יוסי — הלכה כרבי יוסי', src: 'עירובין מו:' },
    { a: 'רבי מאיר', b: 'רבי יוסי', winner: 'רבי יוסי', text: 'ואין צריך לומר רבי מאיר ורבי יוסי — הלכה כרבי יוסי', src: 'עירובין מו:' },
    { a: 'בית שמאי', b: 'בית הלל', winner: 'בית הלל', text: 'אלו ואלו דברי אלהים חיים הן, והלכה כבית הלל', src: 'עירובין יג:' },
  ];

  /** בונה את המפתחות מנתוני data.js. */
  function buildIndex(D) {
    const names = D.names;
    const masechtot = D.masechtot.map(([, seder, title], i) => ({ id: i, name: title.replace(/^משנה /, ''), seder, title, args: [] }));
    const args = D.args.map(([m, chapter, mishna, loc, positions], i) => ({
      id: i, mas: m, chapter, mishna, loc,
      positions: positions.map(([ids, stance, halacha]) => ({ ids, stance, halacha: !!halacha })),
    }));
    const byName = names.map(() => []);
    for (const a of args) {
      masechtot[a.mas].args.push(a);
      a.decided = a.positions.some((p) => p.halacha);
      for (const p of a.positions) for (const id of p.ids) if (!byName[id].includes(a)) byName[id].push(a);
    }
    return { names, masechtot, args, byName };
  }

  const positionName = (I, p) => p.ids.map((id) => I.names[id]).join(' ו');
  const positionOf = (a, id) => a.positions.find((p) => p.ids.includes(id));

  /** "פרק ב משנה ד" / "פרק ב משנה ד-ה" */
  function locText(a) {
    const m = /^(\d+):(\d+)(?:-(\d+))?/.exec(a.loc);
    if (!m) return `פרק ${hebNum(a.chapter)} משנה ${hebNum(a.mishna)}`;
    return `פרק ${hebNum(m[1])} משנה ${hebNum(m[2])}${m[3] ? `-${hebNum(m[3])}` : ''}`;
  }

  /** המחלוקות של מסכת, לפי פרקים: [{chapter, args}] */
  function chaptersOf(I, mas) {
    const out = [];
    for (const a of I.masechtot[mas].args) {
      let g = out.find((x) => x.chapter === a.chapter);
      if (!g) { g = { chapter: a.chapter, args: [] }; out.push(g); }
      g.args.push(a);
    }
    return out;
  }

  /** התנאים לפי מספר מחלוקותיהם. */
  function tannaim(I) {
    return I.names.map((name, id) => ({ id, name, count: I.byName[id].length }))
      .filter((t) => t.count)
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, 'he'));
  }

  /** דברי תנא אחד: כמה נחלק, הלכה כמותו, החמיר והקל, ועם מי נחלק. */
  function tannaStats(I, id) {
    const list = I.byName[id];
    const s = { count: list.length, decided: 0, halacha: 0, strict: 0, lenient: 0, chovah: 0, ptor: 0, rivals: new Map() };
    for (const a of list) {
      const mine = positionOf(a, id);
      if (a.decided) { s.decided++; if (mine.halacha) s.halacha++; }
      if (mine.stance === 'H') s.strict++;
      else if (mine.stance === 'K') s.lenient++;
      else if (mine.stance === 'C') s.chovah++;
      else if (mine.stance === 'P') s.ptor++;
      for (const p of a.positions) {
        if (p === mine) continue;
        for (const other of p.ids) {
          if (mine.ids.includes(other)) continue;
          let r = s.rivals.get(other);
          if (!r) { r = { id: other, name: I.names[other], count: 0, mine: 0, theirs: 0, args: [] }; s.rivals.set(other, r); }
          if (r.args.includes(a)) continue;
          r.args.push(a);
          r.count++;
          if (mine.halacha && !p.halacha) r.mine++;
          else if (p.halacha && !mine.halacha) r.theirs++;
        }
      }
    }
    s.rivals = [...s.rivals.values()].sort((x, y) => y.count - x.count);
    return s;
  }

  /** המחלוקות שבין שני תנאים, וכמה פעמים הלכה כל אחד מהם. */
  function between(I, a, b) {
    const list = I.byName[a].filter((x) => {
      const pa = positionOf(x, a), pb = positionOf(x, b);
      return pa && pb && pa !== pb;
    });
    let forA = 0, forB = 0, strictA = 0, strictB = 0;
    for (const x of list) {
      const pa = positionOf(x, a), pb = positionOf(x, b);
      if (pa.halacha && !pb.halacha) forA++;
      if (pb.halacha && !pa.halacha) forB++;
      if (pa.stance === 'H' && pb.stance === 'K') strictA++;
      if (pb.stance === 'H' && pa.stance === 'K') strictB++;
    }
    return { list, forA, forB, strictA, strictB, rule: ruleFor(I.names[a], I.names[b]) };
  }

  function ruleFor(nameA, nameB) {
    return RULES.find((r) => (r.a === nameA && r.b === nameB) || (r.a === nameB && r.b === nameA)) || null;
  }

  function norm(s) {
    return String(s || '').replace(/[֑-ׇ]/g, '').replace(/["״'׳]/g, '').replace(/\s+/g, ' ').trim();
  }
  const matches = (q, ...texts) => {
    const n = norm(q);
    if (!n) return true;
    const hay = norm(texts.join(' '));
    return n.split(' ').every((w) => hay.includes(w));
  };

  /** יעד פתיחה: {title, ref, chapter, label} — "משנה ברכות", "א:ב". */
  function openTarget(I, a) {
    const mas = I.masechtot[a.mas];
    return {
      title: mas.title, hints: ['משנה'], ref: `${hebNum(a.chapter)}:${hebNum(a.mishna)}`,
      chapter: a.chapter, label: `${mas.title} ${locText(a)}`,
    };
  }

  /** שורת תחילת הפרק בתוכן העניינים ("פרק ב"), לגיבוי. */
  function chapterIndex(toc, chapter) {
    const walk = (list) => {
      for (const e of list || []) {
        const t = norm(String(e.text || '').replace(/<[^>]*>/g, ''));
        if (t === `פרק ${hebNum(chapter)}`) return e.index;
        const r = walk(e.children);
        if (r != null) return r;
      }
      return null;
    };
    return walk(toc);
  }

  return {
    hebNum, hebNumG, SEDARIM, STANCE, RULES,
    buildIndex, positionName, positionOf, locText, chaptersOf, tannaim, tannaStats, between, ruleFor,
    norm, matches, openTarget, chapterIndex,
  };
});
