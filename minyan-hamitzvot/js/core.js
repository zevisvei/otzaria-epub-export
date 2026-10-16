// לוגיקה טהורה של "מניין המצוות": מספרים עבריים, רשימות המונים, השוואה,
// חיפוש, ויעדי פתיחה באוצריא. נטען גם ב-Node לבדיקות (tools/test_core.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════
  // מספרים עבריים
  // ══════════════════════════════════════════════════════════════════════
  const UNITS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  // צירופים שנמנעים מלכתבם, ונכתבים בהיפוך אותיות (כמו בספרי אוצריא)
  const AVOID = { 'רע': 'ער', 'רעה': 'ערה', 'רצח': 'רחצ', 'שד': 'דש', 'שמד': 'שדמ' };

  function hebNum(n) {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return '';
    let s = '';
    while (n >= 1000) { s += UNITS[Math.min(9, Math.floor(n / 1000))]; n %= 1000; }
    let rest = HUNDREDS[Math.floor(n / 100)];
    n %= 100;
    if (n === 15) rest += 'טו';
    else if (n === 16) rest += 'טז';
    else rest += TENS[Math.floor(n / 10)] + UNITS[n % 10];
    for (const [bad, good] of Object.entries(AVOID)) if (rest.endsWith(bad)) rest = rest.slice(0, -bad.length) + good;
    return s + rest;
  }

  /** מספר עברי לתצוגה, עם גרש או גרשיים. */
  function hebNumG(n) {
    const s = hebNum(n);
    if (!s) return '';
    return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
  }

  const LETTER_VALUES = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 };

  /** ערך מניין של מילה באותיות ("רחצ" ← 298). null אם אינה מספר. */
  function hebValue(word) {
    const w = String(word || '').replace(/["״'׳]/g, '');
    if (!w || !/^[א-ת]+$/.test(w)) return null;
    let v = 0;
    for (const ch of w) v += LETTER_VALUES[ch] || 0;
    return v;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ניקוי טקסט לחיפוש ולהשוואת כותרות
  // ══════════════════════════════════════════════════════════════════════
  function norm(s) {
    return String(s || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[֑-ׇ]/g, '')       // ניקוד וטעמים
      .replace(/["״'׳]/g, '')
      .replace(/[-–־,.:;()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** "מצוה רחצ" ← {word: 'מצוה', num: 298}. */
  function parseNumbered(text) {
    const parts = norm(text).split(' ');
    if (parts.length < 2) return null;
    const num = hebValue(parts[parts.length - 1]);
    if (num == null) return null;
    return { prefix: parts.slice(0, -1).join(' '), num };
  }

  // ══════════════════════════════════════════════════════════════════════
  // המונים
  // ══════════════════════════════════════════════════════════════════════
  const PUNISH_RAMBAM = { N: '', K: 'כרת', B: 'מיתה בידי שמים', S: 'סקילה', F: 'שריפה', C: 'חנק', H: 'הרג', M: 'מלקות' };
  const TYPE_RAMBAM = { D: 'שבלב', P: 'שבמעשה', M: 'שבמידות', R: 'שבדיבור' };
  const WHERE_CHINUCH = ['בכל מקום', 'בארץ ישראל', 'בירושלים', 'במקדש'];
  const WHEN_CHINUCH = ['בכל זמן', 'בזמן שיש סמיכה', 'בזמן הבית', 'בזמן שהיובל נוהג'];
  const PUNISH_CHINUCH = ['', 'מלקות', 'כרת', 'סקילה', 'הרג', 'חנק', 'מיתה בידי שמים', 'שריפה'];
  const BAHAG_GROUPS = [
    'אלו הן הנסקלין', 'אלו הן הנשרפין', 'אלו הן הנהרגין', 'אלו הן הנחנקין', 'אלו שבכרת',
    'אלו שבמיתה בידי שמים', 'לאוין שבמלקות', 'מצוות עשה', 'פרשיות המסורות לציבור',
  ];

  const MONIM = [
    { key: 'rambam', name: 'הרמב״ם', full: 'הרמב״ם בספר המצוות',
      about: 'הרמב״ם קבע בספר המצוות י״ד שרשים שעל פיהם נמנות המצוות, ומנה רמ״ח עשין ושס״ה לאוין. ועל מניינו סמכו רוב הבאים אחריו.' },
    { key: 'ramban', name: 'הרמב״ן', full: 'הרמב״ן בהשגותיו לספר המצוות',
      about: 'הרמב״ן בהשגותיו לספר המצוות מודה לרמב״ם ברוב המניין, וחולק במקצת. ובסוף דבריו מנה מצוות ששכחן הרב — „שכחת העשין” ו„שכחת הלאוין”. כאן מניינו לפי סדר הרמב״ם, וכל שכחה נכנסת במקום שהוציא כנגדה.' },
    { key: 'chinuch', name: 'ספר החינוך', full: 'ספר החינוך',
      about: 'בעל ספר החינוך הלך בשיטת הרמב״ם במניין, וסידר את המצוות לפי סדר הפרשיות. ובכל מצוה ביאר שרשי המצוה, מדיני המצוה, והיכן ומתי היא נוהגת.' },
    { key: 'semag', name: 'הסמ״ג', full: 'ספר מצוות גדול לרבנו משה מקוצי',
      about: 'הסמ״ג חילק ספרו ללאוין ועשין, וברוב המצוות הלך בשיטת הרמב״ם, ובמקצתן חולק עליו.' },
    { key: 'bahag', name: 'בה״ג', full: 'הלכות גדולות',
      about: 'בעל הלכות גדולות הוא הראשון שמנה את המצוות, בהקדמת ספרו. סידר תחילה את העונשים — „אלו הן הנסקלין” וכו׳ — ואחר כך לאוין ועשין שעל היחיד, ולבסוף פרשיות המסורות לציבור. החלוקה למצוות כפי שחילק הרב אברהם שמעון טרויב.' },
  ];
  const MONEH = Object.fromEntries(MONIM.map((m) => [m.key, m]));

  /** בונה את כל הרשימות מנתוני data.js. */
  function buildIndex(D) {
    const mitzvot = new Map();
    for (const [id, name, kind] of D.mitzvot) mitzvot.set(id, { id, name, kind, by: {} });
    const lists = {};
    const add = (key, e) => {
      const m = mitzvot.get(e.mid);
      if (!m) return;
      e.kind = m.kind;
      if (!e.title) e.title = m.name;
      lists[key].push(e);
      (m.by[key] = m.by[key] || []).push(e);
    };
    lists.rambam = [];
    for (const [mid, num, src, type, pun] of D.rambam) add('rambam', { moneh: 'rambam', mid, num, src, type, punish: pun });
    lists.ramban = [];
    for (const [mid, num, shichcha, src] of D.ramban) add('ramban', { moneh: 'ramban', mid, num, shichcha, src });
    lists.chinuch = [];
    for (const [mid, num, title, where, when, pun, src, book] of D.chinuch) {
      add('chinuch', { moneh: 'chinuch', mid, num, title, where, when, punish: pun, src, book });
    }
    lists.semag = [];
    for (const [mid, num, title, src] of D.semag) add('semag', { moneh: 'semag', mid, num, title, src });
    lists.bahag = [];
    for (const [mid, num, cat, title] of D.bahag) add('bahag', { moneh: 'bahag', mid, num, cat, title });
    // הסמ"ג פותח בלאוין
    lists.semag.sort((a, b) => (a.kind === b.kind ? a.num - b.num : a.kind === 'L' ? -1 : 1));
    return { books: D.books, mitzvot, lists };
  }

  /** קבוצות להצגה: [{title, items}] */
  function groupsOf(index, key) {
    const list = index.lists[key];
    const by = (fn, titles) => {
      const out = [];
      for (const e of list) {
        const t = fn(e);
        let g = out.find((x) => x.key === t);
        if (!g) { g = { key: t, title: titles ? titles(t) : t, items: [] }; out.push(g); }
        g.items.push(e);
      }
      return out;
    };
    if (key === 'chinuch') return by((e) => e.book, (b) => `חומש ${index.books[b]}`);
    if (key === 'bahag') return by((e) => e.cat, (c) => BAHAG_GROUPS[c] || '');
    return by((e) => e.kind, (k) => (k === 'A' ? 'מצוות עשה' : 'מצוות לא תעשה'));
  }

  const kindName = (k) => (k === 'A' ? 'עשה' : 'לא תעשה');

  /** כינוי המצוה אצל המונה: "עשה ג", "מצוה תיח", "ל״ת שסה". */
  function entryLabel(e) {
    if (e.moneh === 'chinuch') return `מצוה ${hebNumG(e.num)}`;
    if (e.moneh === 'bahag') return `${e.kind === 'A' ? 'עשה' : 'ל״ת'} ${hebNumG(e.num)}`;
    return `${e.kind === 'A' ? 'עשה' : 'ל״ת'} ${hebNumG(e.num)}`;
  }

  function verseText(books, src) {
    if (!src) return '';
    const [b, ch, v] = src;
    return `${books[b]} ${hebNumG(ch)}, ${hebNumG(v)}`;
  }

  /** תגיות קצרות לשורה: עונש, היכן נוהגת וכו׳. */
  function entryTags(e) {
    const tags = [];
    if (e.moneh === 'rambam') {
      if (TYPE_RAMBAM[e.type] && e.type !== 'P') tags.push(`מצוה ${TYPE_RAMBAM[e.type]}`);
      if (PUNISH_RAMBAM[e.punish]) tags.push(PUNISH_RAMBAM[e.punish]);
    } else if (e.moneh === 'chinuch') {
      if (e.where > 0 && WHERE_CHINUCH[e.where]) tags.push(`נוהגת ${WHERE_CHINUCH[e.where]}`);
      if (e.when > 0 && WHEN_CHINUCH[e.when]) tags.push(`נוהגת ${WHEN_CHINUCH[e.when]}`);
      if (PUNISH_CHINUCH[e.punish]) tags.push(PUNISH_CHINUCH[e.punish]);
    } else if (e.moneh === 'ramban' && e.shichcha) {
      tags.push(`${e.kind === 'A' ? 'שכחת העשין' : 'שכחת הלאוין'} ${hebNumG(e.shichcha)}`);
    }
    return tags;
  }

  /** מסננים לפי מונה: [{id, label, options:[{value,label}], test(e, value)}] */
  function filtersOf(key) {
    if (key === 'rambam') {
      return [
        { id: 'punish', label: 'עונש', options: [{ value: 'K', label: 'כרת' }, { value: 'B', label: 'מיתה בידי שמים' },
          { value: 'D', label: 'מיתת בית דין' }, { value: 'M', label: 'מלקות' }, { value: 'N', label: 'אין בה עונש מפורש' }],
        test: (e, v) => (v === 'D' ? 'SFCH'.includes(e.punish) : e.punish === v) },
        { id: 'type', label: 'עניינה', options: Object.entries(TYPE_RAMBAM).map(([value, l]) => ({ value, label: `מצוה ${l}` })),
          test: (e, v) => e.type === v },
      ];
    }
    if (key === 'chinuch') {
      return [
        { id: 'now', label: 'נוהגת', options: [{ value: 'now', label: 'בזמן הזה' }, { value: 'land', label: 'בארץ ישראל' }, { value: 'temple', label: 'בזמן הבית' }],
          test: (e, v) => (v === 'now' ? e.where === 0 && e.when === 0 : v === 'land' ? e.where === 1 : e.where >= 2 || e.when === 2) },
        { id: 'punish', label: 'עונש', options: PUNISH_CHINUCH.map((l, i) => ({ value: String(i), label: l })).filter((o) => o.label),
          test: (e, v) => String(e.punish) === v },
      ];
    }
    if (key === 'ramban') {
      return [{ id: 'shichcha', label: 'הוספות', options: [{ value: 'y', label: 'מה ששכח הרב' }], test: (e) => !!e.shichcha }];
    }
    return [];
  }

  /** מי מנה את המצוה ומי לא. */
  function whoCounts(index, mid) {
    const m = index.mitzvot.get(mid);
    const yes = [], no = [];
    for (const mo of MONIM) (m && m.by[mo.key] ? yes : no).push(mo.key);
    return { yes, no };
  }

  /** השוואה בין שני מונים: מה שמנה זה ולא זה, ומה ששניהם מודים בו. */
  function compare(index, a, b) {
    const setB = new Set(index.lists[b].map((e) => e.mid));
    const setA = new Set(index.lists[a].map((e) => e.mid));
    return {
      onlyA: index.lists[a].filter((e) => !setB.has(e.mid)),
      both: index.lists[a].filter((e) => setB.has(e.mid)),
      onlyB: index.lists[b].filter((e) => !setA.has(e.mid)),
    };
  }

  /** כל המצוות שבכל המניינים, לפי מספר המונים. filter: 'all' | 'machloket' | 'agreed' */
  function allMitzvot(index, filter) {
    const out = [];
    for (const m of index.mitzvot.values()) {
      const n = Object.keys(m.by).length;
      if (!n) continue;
      if (filter === 'machloket' && n === MONIM.length) continue;
      if (filter === 'agreed' && n !== MONIM.length) continue;
      out.push(m);
    }
    return out;
  }

  function matches(query, ...texts) {
    const q = norm(query);
    if (!q) return true;
    const words = q.split(' ');
    const hay = norm(texts.join(' '));
    return words.every((w) => hay.includes(w));
  }

  // ══════════════════════════════════════════════════════════════════════
  // יעדי פתיחה באוצריא
  // ══════════════════════════════════════════════════════════════════════
  /**
   * היכן המצוה כתובה בספר המונה: {title, section, item:{prefix,num} | null, search, label}
   * section ו-item הם כותרות בתוכן העניינים של הספר באוצריא.
   */
  function openTarget(index, e) {
    if (e.moneh === 'rambam') {
      return { title: 'ספר המצוות', hints: ['רמב'], section: e.kind === 'A' ? 'מצוות עשה' : 'מצוות לא תעשה',
        item: { prefix: 'מצוה', num: e.num }, label: `ספר המצוות, ${kindName(e.kind)} ${hebNumG(e.num)}` };
    }
    if (e.moneh === 'ramban') {
      if (e.shichcha) {
        return { title: 'השגות הרמב"ן על ספר המצוות', hints: ['ספר המצוות', 'רמב'],
          section: e.kind === 'A' ? 'שכחת העשין' : 'שכחת הלאוין', item: { prefix: 'מצוה', num: e.shichcha },
          label: `השגות הרמב״ן, ${e.kind === 'A' ? 'שכחת העשין' : 'שכחת הלאוין'} ${hebNumG(e.shichcha)}` };
      }
      const m = index.mitzvot.get(e.mid);
      const r = m && m.by.rambam && m.by.rambam[0];
      return r ? openTarget(index, r) : null;
    }
    if (e.moneh === 'chinuch') {
      return { title: 'ספר החינוך', hints: ['מצוות', 'הלכה'], section: null, item: { prefix: 'מצוה', num: e.num },
        label: `ספר החינוך, מצוה ${hebNumG(e.num)}` };
    }
    if (e.moneh === 'semag') {
      return { title: 'ספר מצוות גדול', hints: ['מצוות', 'הלכה'], section: e.kind === 'A' ? 'עשין' : 'לאוין',
        item: { prefix: e.kind === 'A' ? 'מצות עשה' : 'מצות לא תעשה', num: e.num },
        label: `סמ״ג, ${e.kind === 'A' ? 'עשין' : 'לאוין'} ${hebNumG(e.num)}` };
    }
    if (e.moneh === 'bahag') {
      return { title: 'הלכות גדולות', hints: ['הלכה'], section: null, heading: 'הקדמה', search: firstWords(e.title, 3),
        label: 'הלכות גדולות, הקדמה' };
    }
    return null;
  }

  function firstWords(s, n) {
    return norm(s).split(' ').slice(0, n).join(' ');
  }

  /** פסוק בתורה: {title, ref} ל-reader.openBookAtRef. */
  function verseTarget(books, src) {
    if (!src) return null;
    const [b, ch, v] = src;
    return { title: books[b], hints: ['תורה'], ref: `${hebNum(ch)}:${hebNum(v)}`, chapter: ch, label: verseText(books, src) };
  }

  function flattenToc(list, depth = 0, out = []) {
    for (const e of list || []) {
      out.push({ text: e.text, index: e.index, depth: e.level != null ? e.level : depth });
      if (Array.isArray(e.children) && e.children.length) flattenToc(e.children, depth + 1, out);
    }
    return out;
  }

  /**
   * מאתר בתוכן העניינים (שטוח, מ-flattenToc) את שורת היעד.
   * הקטע (section) נמשך עד הכותרת הבאה שרמתה כרמתו או גבוהה ממנה.
   */
  function findInToc(flat, target) {
    if (target.heading) {
      const h = flat.find((x) => norm(x.text) === norm(target.heading));
      return h ? h.index : null;
    }
    if (!target.item) return null;
    const isSection = (t) => norm(t) === norm(target.section);
    let depth = target.section ? null : -1;
    for (const x of flat) {
      if (depth == null) {
        if (isSection(x.text)) depth = x.depth;
        continue;
      }
      if (target.section && x.depth <= depth) {
        depth = isSection(x.text) ? x.depth : null;
        continue;
      }
      const p = parseNumbered(x.text);
      if (p && p.num === target.item.num && p.prefix === norm(target.item.prefix)) return x.index;
    }
    return null;
  }

  return {
    hebNum, hebNumG, hebValue, norm, parseNumbered,
    MONIM, MONEH, BAHAG_GROUPS, buildIndex, groupsOf, entryLabel, entryTags, filtersOf, kindName,
    verseText, whoCounts, compare, allMitzvot, matches,
    openTarget, verseTarget, flattenToc, findInToc,
  };
});
