// לוגיקה טהורה לבניית EPUB 3 מספרי אוצריא: ניקוי HTML ל-XHTML, חלוקה לפרקים,
// הערות שוליים, דף שער ודף זכויות, מטא-דאטה, תוכן עניינים (nav + ncx) ואריזת ZIP.
// אין כאן גישה ל-DOM או לאוצריא, כך שהקובץ נבדק גם ב-Node (tools/test_core.js).
(function (root) {
  'use strict';

  const NS_XHTML = 'http://www.w3.org/1999/xhtml';
  const NS_EPUB = 'http://www.idpf.org/2007/ops';
  // גודל יעד לקובץ פרק — קוראים רבים (Kobo, Kindle ישנים) נחנקים מקבצים גדולים
  const MAX_FILE_CHARS = 250000;

  // ══════════════════════════════════════════════════════════════════════
  // טקסט ו-XML
  // ══════════════════════════════════════════════════════════════════════

  // תווי בקרה אסורים ב-XML 1.0 (ו-surrogates בודדים)
  const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

  function escapeXml(s) {
    return String(s == null ? '' : s)
      .replace(INVALID_XML, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const NAMED_ENTITIES = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    ndash: '–', mdash: '—', hellip: '…', lrm: '‎', rlm: '‏',
    zwj: '‍', zwnj: '‌', shy: '­', laquo: '«', raquo: '»',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·',
    bull: '•', thinsp: ' ', ensp: ' ', emsp: ' ',
  };

  // XHTML ב-EPUB מכיר רק את חמש הישויות של XML — מפענחים הכול ומקודדים מחדש
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        if (!cp || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return '';
        return String.fromCodePoint(cp);
      }
      const v = NAMED_ENTITIES[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  }

  function stripTags(html) {
    return decodeEntities(String(html || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  }

  // ניקוד: שוואים, תנועות, דגש, רפה, שין/שׂין, קמץ קטן. טעמים: U+0591–U+05AF ומתג/מקף-עליון.
  const NIKUD = /[ְ-ׇֽֿׁׂׅׄ]/g;
  const TEAMIM = /[֑-ֽ֯]/g;

  function removeMarks(s, opts) {
    let out = s;
    if (opts && opts.removeTeamim) out = out.replace(TEAMIM, '');
    if (opts && opts.removeNikud) out = out.replace(NIKUD, '');
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ניקוי HTML של שורת אוצריא ל-XHTML תקין
  // ══════════════════════════════════════════════════════════════════════

  // תגים מותרים ← התג ב-XHTML והמחלקה שלו
  const INLINE_MAP = {
    b: ['b'], strong: ['strong'], i: ['i'], em: ['em'], u: ['u'], s: ['s'],
    small: ['small'], big: ['span', 'big'], sup: ['sup'], sub: ['sub'],
    span: ['span'], font: ['span'], a: ['span'], mark: ['span', 'mark'],
    q: ['q'], cite: ['cite'], abbr: ['abbr'], code: ['code'],
  };
  const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr', 'input', 'meta', 'link', 'col', 'area', 'base', 'embed', 'source', 'track', 'param']);
  // תגים שתוכנם אינו טקסט לקריאה
  const DROP_CONTENT = new Set(['script', 'style', 'head', 'title', 'template', 'svg', 'math', 'object', 'iframe', 'noscript']);

  const TOKEN = /<!--[\s\S]*?(?:-->|$)|<\/?([a-zA-Z][a-zA-Z0-9]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>|<|[^<]+/g;

  /**
   * ממיר HTML חופשי (כפי שמגיע מספרי אוצריא ומפרשים) ל-XHTML שורתי תקין:
   * רק תגי עיצוב מוכרים, בלי מאפיינים, קינון נכון, ישויות מקודדות.
   */
  function sanitizeInline(html, opts) {
    const src = String(html || '');
    let out = '';
    const stack = [];
    let dropDepth = 0;
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      const tok = m[0];
      if (tok.startsWith('<!--')) continue;
      if (m[1]) {
        const name = m[1].toLowerCase();
        const closing = tok[1] === '/';
        if (DROP_CONTENT.has(name)) {
          if (closing) dropDepth = Math.max(0, dropDepth - 1);
          else if (!/\/>$/.test(tok)) dropDepth++;
          continue;
        }
        if (dropDepth) continue;
        if (name === 'br') { if (!closing) out += '<br/>'; continue; }
        const mapped = INLINE_MAP[name];
        if (!mapped || VOID_TAGS.has(name)) {
          // תג בלוק או לא מוכר: שומרים על הפרדת מילים
          if (/^(p|div|li|tr|td|th|h[1-6]|blockquote|dd|dt)$/.test(name) && !/\s$/.test(out) && out) out += ' ';
          continue;
        }
        if (closing) {
          const at = stack.lastIndexOf(name);
          if (at < 0) continue;
          while (stack.length > at) out += `</${INLINE_MAP[stack.pop()][0]}>`;
        } else if (!/\/>$/.test(tok)) {
          stack.push(name);
          out += mapped[1] ? `<${mapped[0]} class="${mapped[1]}">` : `<${mapped[0]}>`;
        }
        continue;
      }
      if (dropDepth) continue;
      out += escapeXml(removeMarks(decodeEntities(tok), opts));
    }
    while (stack.length) out += `</${INLINE_MAP[stack.pop()][0]}>`;
    // תגים ריקים לא תורמים דבר וחלק מהקוראים מציגים אותם כרווח
    let prev;
    do { prev = out; out = out.replace(/<(b|strong|i|em|u|s|small|span|sup|sub|q|cite|abbr|code)(?: class="[a-z]+")?><\/\1>/g, ''); } while (out !== prev);
    return out;
  }

  const HEADING_LINE = /^\s*<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>\s*$/i;

  /** מסווג שורת ספר: כותרת (עם רמה) או פסקה. */
  function parseLine(line, opts) {
    const h = HEADING_LINE.exec(line);
    if (h) return { kind: 'heading', level: Number(h[1]), html: sanitizeInline(h[2], opts) };
    return { kind: 'p', html: sanitizeInline(line, opts) };
  }

  // מצייני מקום להזרקת סמני הערות לפני הניקוי: תווים פרטיים ששורדים את sanitizeInline כטקסט
  const MARK_OPEN = '';
  const MARK_CLOSE = '';
  const MARK_RE = /(\d+)/g;

  /**
   * מזריק טקסט לשורת HTML גולמית לפי אופסט של *תווים גלויים* — תגים אינם נספרים
   * ו-entity נספר כתו אחד (מוסכמת line.charCount של אוצריא לעוגני-מילה).
   * ההזרקה היא לפני התו הגלוי הבא, כך שאינה נכנסת לתוך תג.
   * points: [{ at, text }] ממוינים לפי at.
   */
  function injectAtVisibleOffsets(raw, points) {
    let out = '';
    let vis = 0;
    let p = 0;
    let i = 0;
    let lastVisEnd = 0;
    while (i < raw.length) {
      if (raw[i] === '<' && /[a-zA-Z\/!]/.test(raw[i + 1] || '')) {
        const close = raw.indexOf('>', i);
        const end = close < 0 ? raw.length : close + 1;
        out += raw.slice(i, end);
        i = end;
        continue;
      }
      while (p < points.length && points[p].at <= vis) out += points[p++].text;
      const ent = raw[i] === '&' ? /^&(?:#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/.exec(raw.slice(i, i + 12)) : null;
      const len = ent ? ent[0].length : 1;
      out += raw.slice(i, i + len);
      i += len;
      vis++;
      lastVisEnd = out.length;
    }
    // עוגן מעבר לסוף השורה: אחרי התו הגלוי האחרון, לפני תגים סוגרים (כמו </h2>)
    let rest = '';
    while (p < points.length) rest += points[p++].text;
    return out.slice(0, lastVisEnd) + rest + out.slice(lastVisEnd);
  }

  // ══════════════════════════════════════════════════════════════════════
  // מספרים עבריים, שמות מפרשים
  // ══════════════════════════════════════════════════════════════════════

  function hebNum(n) {
    if (!(n > 0)) return String(n);
    let s = '';
    let x = Math.floor(n);
    while (x >= 1000) { s += hebNum(Math.floor(x / 1000)) + '׳'; x %= 1000; if (!x) return s; }
    const H = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']];
    while (x >= 100) { const [v, c] = H.find(([v]) => x >= v); s += c; x -= v; }
    if (x === 15) return s + 'טו';
    if (x === 16) return s + 'טז';
    if (x >= 10) { s += 'יכלמנסעפצ'[Math.floor(x / 10) - 1]; x %= 10; }
    if (x) s += 'אבגדהוזחט'[x - 1];
    return s;
  }

  /** "רש״י על בראשית" ← "רש״י" (כשהסיומת היא שם הספר). */
  function commentatorShortName(title, bookTitle) {
    const t = String(title || '').trim();
    if (bookTitle) {
      const suffix = ` על ${bookTitle}`;
      if (t.endsWith(suffix) && t.length > suffix.length) return t.slice(0, -suffix.length);
    }
    const i = t.indexOf(' על ');
    return i > 0 ? t.slice(0, i) : t;
  }

  // ══════════════════════════════════════════════════════════════════════
  // טווחים בתוכן העניינים
  // ══════════════════════════════════════════════════════════════════════

  /**
   * טווח השורות [start, end) מכותרת `fromIdx` עד סוף הכותרת `toIdx` (כולל צאצאיה).
   * fromIdx/toIdx הם אינדקסים במערך ה-toc; null = מתחילת הספר / עד סופו.
   */
  function tocRange(toc, fromIdx, toIdx, lineCount) {
    const start = fromIdx == null ? 0 : toc[fromIdx].index;
    let end = lineCount;
    if (toIdx != null) {
      const lvl = toc[toIdx].level;
      for (let k = toIdx + 1; k < toc.length; k++) {
        if (toc[k].level <= lvl && toc[k].index > toc[toIdx].index) { end = toc[k].index; break; }
      }
    }
    return { start: Math.max(0, start), end: Math.max(start, Math.min(end, lineCount)) };
  }

  // ══════════════════════════════════════════════════════════════════════
  // זכויות יוצרים לפי מקור הטקסט
  // ══════════════════════════════════════════════════════════════════════

  // לפי README של Otzaria/otzaria-library (פרק "רישיונות תכנים ממקורות חיצוניים").
  // personal = המקור אינו מתיר הפצה; הקובץ מסומן לשימוש אישי בלבד.
  const SOURCE_RIGHTS = {
    sefaria: { license: 'GPL-3.0', url: 'https://www.gnu.org/licenses/gpl-3.0.html' },
    dicta: { license: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    pninim: { license: 'GNU FDL 1.3', url: 'https://www.gnu.org/licenses/fdl-1.3.html' },
    toratemet: { license: 'CC BY-NC-SA 2.5 (ללא שימוש מסחרי)', url: 'https://creativecommons.org/licenses/by-nc-sa/2.5/' },
    wikisource: { license: 'בכפוף לרישיון ויקיטקסט (CC BY-SA)', url: 'https://he.wikisource.org/' },
    nationallibrary: { license: 'CC BY-NC-SA 4.0 (ללא שימוש מסחרי)', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
    library: { license: 'CC BY-NC-SA 4.0 (ללא שימוש מסחרי)', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
    orbreslev: { license: 'CC BY-NC-SA 4.0 (ללא שימוש מסחרי)', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
    benyehuda: { license: 'בכפוף לתנאי פרויקט בן־יהודה', url: 'https://benyehuda.org/' },
    orayta: { license: 'בכפוף לרישיון המקור', url: '' },
    onyourway: { license: 'בכפוף לרישיון המקור', url: '' },
    wikijewishbooks: { license: 'שימוש בהרשאה מיוחדת בלבד — אין להעתיק או להפיץ ללא רשות', url: '', personal: true },
    tashma: { license: 'כל הזכויות שמורות לתא שמע', url: 'https://tashma.co.il/', personal: true },
    yamhahachma: { license: 'בכפוף לרישיון ים החכמה (חובת קרדיט: שם המאגר וקישור)', url: 'https://github.com/torahtyh/yam-HaHachma' },
  };

  function normalizeSourceKey(key) {
    let k = String(key || '').toLowerCase().replace(/[-_\s]/g, '');
    if (k.includes('toratemet')) return 'toratemet';
    if (k.endsWith('tootzaria') && k !== 'tootzaria') k = k.slice(0, -'tootzaria'.length);
    return k;
  }

  /**
   * פרטי הזכויות של ספר לפי `textSource` מ-library.getBookDetails.
   * מקור לא מוכר: לא מנחשים רישיון — מפנים למקור ומסמנים לשימוש אישי.
   */
  function rightsFor(textSource) {
    const key = normalizeSourceKey(textSource && textSource.key);
    const known = SOURCE_RIGHTS[key];
    const name = (textSource && textSource.name) || 'מקור לא ידוע';
    const sourceUrl = (textSource && textSource.url) || (known && known.url) || '';
    if (!known) {
      return { sourceName: name, sourceUrl, license: 'בכפוף לתנאי המקור', licenseUrl: '', personal: true };
    }
    return {
      sourceName: name, sourceUrl,
      license: known.license,
      licenseUrl: known.url && /licenses|creativecommons/.test(known.url) ? known.url : '',
      personal: !!known.personal,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // בניית המסמכים
  // ══════════════════════════════════════════════════════════════════════

  function xhtmlDoc(title, bodyHtml, opts) {
    const bodyClass = opts && opts.bodyClass ? ` class="${opts.bodyClass}"` : '';
    const bodyType = opts && opts.bodyType ? ` epub:type="${opts.bodyType}"` : '';
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<!DOCTYPE html>\n'
      + `<html xmlns="${NS_XHTML}" xmlns:epub="${NS_EPUB}" xml:lang="he" lang="he" dir="rtl">\n`
      + '<head>\n'
      + '<meta charset="UTF-8"/>\n'
      + `<title>${escapeXml(title || 'ספר')}</title>\n`
      + '<link rel="stylesheet" type="text/css" href="../css/book.css"/>\n'
      + '</head>\n'
      + `<body dir="rtl"${bodyClass}${bodyType}>\n${bodyHtml}\n</body>\n</html>\n`;
  }

  function link(text, url) {
    return url ? `<a href="${escapeXml(url)}">${escapeXml(text)}</a>` : escapeXml(text);
  }

  function joinNames(list) {
    const xs = (list || []).filter(Boolean);
    if (xs.length <= 1) return xs.join('');
    return `${xs.slice(0, -1).join(', ')} ו${xs[xs.length - 1]}`;
  }

  function formatDateHe(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  function titlePage(spec) {
    const m = spec.meta;
    const parts = [];
    parts.push('<section class="titlepage" epub:type="titlepage">');
    parts.push('<div class="tp-frame">');
    parts.push('<div class="tp-rule tp-rule-top" aria-hidden="true"></div>');
    parts.push(`<h1 class="tp-title">${escapeXml(m.title)}</h1>`);
    if (m.subtitle) parts.push(`<p class="tp-subtitle">${escapeXml(m.subtitle)}</p>`);
    if (m.creators && m.creators.length) parts.push(`<p class="tp-author">${escapeXml(joinNames(m.creators))}</p>`);
    if (spec.books.length > 1) {
      parts.push('<ul class="tp-books">');
      for (const b of spec.books) parts.push(`<li>${escapeXml(b.title)}${b.rangeLabel ? ` <span class="tp-range">(${escapeXml(b.rangeLabel)})</span>` : ''}</li>`);
      parts.push('</ul>');
    }
    if (spec.commentatorNames && spec.commentatorNames.length) {
      parts.push(`<p class="tp-with">עם ${escapeXml(joinNames(spec.commentatorNames))}</p>`);
    }
    parts.push('<div class="tp-rule" aria-hidden="true"></div>');
    const sources = uniqueBy(spec.books.map((b) => b.rights), (r) => r.sourceName);
    parts.push('<div class="tp-source">');
    parts.push(`<p>מקור הטקסט: ${sources.map((r) => link(r.sourceName, r.sourceUrl)).join(' · ')}</p>`);
    parts.push(`<p>הופק מספריית ${link('אוצריא', 'https://otzaria.org')}</p>`);
    if (spec.books.some((b) => b.rights.personal)) parts.push('<p class="tp-personal">לשימוש אישי בלבד</p>');
    parts.push('</div>');
    parts.push('</div>');
    parts.push('</section>');
    return xhtmlDoc(m.title, parts.join('\n'), { bodyClass: 'front', bodyType: 'frontmatter' });
  }

  function rightsPage(spec) {
    const m = spec.meta;
    const rows = (label, value) => (value ? `<tr><th scope="row">${escapeXml(label)}</th><td>${value}</td></tr>` : '');
    const parts = ['<section class="colophon" epub:type="copyright-page">', '<h1>פרטי הספר וזכויות</h1>'];
    for (const b of spec.books) {
      const d = b.details || {};
      const r = b.rights;
      parts.push('<div class="col-book">');
      parts.push(`<h2>${escapeXml(b.title)}</h2>`);
      parts.push('<table class="col-table">');
      parts.push(rows('מחבר', escapeXml(joinNames(d.authors))));
      parts.push(rows('תקופה', escapeXml([d.era, d.generation].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · '))));
      parts.push(rows('חיבור', escapeXml([d.compositionPlace, d.compositionDate].filter(Boolean).join(', '))));
      parts.push(rows('דפוס', escapeXml([(d.publicationPlaces || []).join(', '), (d.publicationDates || []).join(', ')].filter(Boolean).join(', '))));
      parts.push(rows('קטגוריה', escapeXml(d.categories || (d.categoryPath || '').replace(/^\//, '').replace(/\//g, ' › '))));
      parts.push(rows('טווח', escapeXml(b.rangeLabel || 'הספר כולו')));
      parts.push(rows('מקור הטקסט', link(r.sourceName, r.sourceUrl)));
      parts.push(rows('רישיון', link(r.license, r.licenseUrl)));
      if (b.commentators && b.commentators.length) {
        const cm = b.commentators.map((c) => `${escapeXml(c.name)} — ${link(c.rights.sourceName, c.rights.sourceUrl)} (${link(c.rights.license, c.rights.licenseUrl)})`);
        parts.push(rows('מפרשים', cm.join('<br/>')));
      }
      parts.push('</table>');
      if (d.shortDescription) parts.push(`<p class="col-desc">${escapeXml(stripTags(d.shortDescription))}</p>`);
      parts.push('</div>');
    }
    const allRights = spec.books.flatMap((b) => [b.rights, ...(b.commentators || []).map((c) => c.rights)]);
    parts.push('<div class="col-notice">');
    if (allRights.some((r) => r.personal)) {
      parts.push('<p><b>לשימוש אישי בלבד.</b> חלק מהטקסטים בקובץ זה נמסרו לאוצריא בהרשאה מיוחדת או שזכויותיהם שמורות; אין להעתיק, להפיץ או לפרסם אותם ללא רשות בעלי הזכויות.</p>');
    }
    if (spec.fonts && spec.fonts.length) {
      parts.push(`<p>גופן ההערות: ${spec.fonts.map((f) => escapeXml(f.family)).join(', ')} — ${link('SIL Open Font License 1.1', 'https://openfontlicense.org/')}.</p>`);
    }
    parts.push('<p>הזכויות בטקסטים שמורות לבעליהן כמפורט לעיל, וכל שימוש כפוף לרישיון המקור. העימוד, העיבוד והמטא-דאטה של ספריית אוצריא כפופים לרישיון הספרייה.</p>');
    parts.push(`<p>קובץ זה הופק ב-${escapeXml(formatDateHe(m.date))} באמצעות התוסף „ייצוא EPUB” לאוצריא${m.appVersion ? ` (גרסה ${escapeXml(m.appVersion)})` : ''}. אין לראות בו מהדורה מוגהת; לתיקון טעויות יש לפנות למקור הטקסט.</p>`);
    parts.push('</div>');
    parts.push('</section>');
    return xhtmlDoc(`פרטי הספר — ${m.title}`, parts.join('\n'), { bodyClass: 'front', bodyType: 'frontmatter' });
  }

  function coverPage(spec) {
    const body = `<div class="cover"><img src="../images/${spec.cover.name}" alt="${escapeXml(spec.meta.title)}"/></div>`;
    return xhtmlDoc(spec.meta.title, body, { bodyClass: 'cover-body', bodyType: 'cover' });
  }

  function uniqueBy(arr, key) {
    const seen = new Set();
    return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /**
   * ממיר ספר אחד לרשימת קבצי פרקים ונקודות ניווט.
   * book: { title, lines[], start (אינדקס השורה הראשונה בספר המקורי), toc[] (בטווח; index מוחלט),
   *         notes: { [lineIndex]: [{ commentator, html }] } }
   */
  function renderBook(book, bIdx, opts, multi) {
    const files = [];
    const navRoots = [];
    const tocByLine = new Map();
    for (const e of book.toc) {
      const list = tocByLine.get(e.index) || [];
      list.push(e);
      tocByLine.set(e.index, list);
    }
    const levels = book.toc.map((e) => e.level);
    const minLevel = levels.length ? Math.min(...levels) : 1;
    // מתחילים קובץ חדש בכותרות העליונות (ובאחת מתחתיהן אם העליונה היא רק שם הספר)
    const topCount = levels.filter((l) => l === minLevel).length;
    const splitLevel = topCount <= 1 ? minLevel + 1 : minLevel;
    const headingShift = multi ? 1 : 0;
    const notesMode = opts.notesMode || 'popup';
    const fontClass = opts.notesFont === 'book' ? 'cm-book' : 'cm-rashi';

    let cur = null;
    let fileSeq = 0;
    let noteSeq = 0;
    const prefix = `b${bIdx + 1}`;

    function openFile() {
      fileSeq++;
      const base = `${prefix}-${String(fileSeq).padStart(4, '0')}`;
      cur = { name: `${base}.xhtml`, notesName: `${base}-notes.xhtml`, body: [], notes: [], size: 0, title: book.title, noteCount: 0 };
      files.push(cur);
    }
    openFile();

    // נקודות ניווט בעץ לפי level
    const stack = [];
    function addNav(entry, file, anchor) {
      const node = { label: stripTags(entry.text) || '—', href: `${file}#${anchor}`, children: [], level: entry.level };
      while (stack.length && stack[stack.length - 1].level >= entry.level) stack.pop();
      if (stack.length) stack[stack.length - 1].children.push(node);
      else navRoots.push(node);
      stack.push(node);
    }

    for (let i = 0; i < book.lines.length; i++) {
      const lineNo = book.start + i;
      const entries = tocByLine.get(lineNo);
      if (entries && cur.body.length && entries.some((e) => e.level <= splitLevel)) openFile();
      else if (cur.size > MAX_FILE_CHARS) openFile();
      const anchor = `${prefix}l${lineNo}`;
      const idAttr = entries ? ` id="${anchor}"` : '';
      if (entries) for (const e of entries) addNav(e, cur.name, anchor);
      if (entries && cur.body.length === 0) cur.title = stripTags(entries[0].text) || book.title;

      // הערות מעוגנות (עם `at`) נכנסות במקומן בשורה; השאר — בסוף השורה
      const lineNotes = ((book.notes && book.notes[lineNo]) || [])
        .map((n) => ({ ...n, text: sanitizeInline(n.html, opts) }))
        .filter((n) => n.text);
      const anchored = lineNotes.filter((n) => Number.isInteger(n.at) && n.at >= 0).sort((x, y) => x.at - y.at);
      const trailing = lineNotes.filter((n) => !anchored.includes(n));
      const raw = anchored.length
        ? injectAtVisibleOffsets(book.lines[i], anchored.map((n, k) => ({ at: n.at, text: `${MARK_OPEN}${k}${MARK_CLOSE}` })))
        : book.lines[i];
      const parsed = parseLine(raw, opts);

      const after = [];
      const refs = [];
      for (const n of [...anchored, ...trailing]) {
        const isAnchored = anchored.includes(n);
        // סמן מעוגן: האות שהמקור מדפיס, למשל (א) לשער הציון; אחרת מספור רץ בפרק
        const label = isAnchored && n.label ? `(${n.label})` : null;
        const who = `<b class="cm-who">${escapeXml(n.commentator)}</b>`;
        if (notesMode === 'line') {
          refs.push(label ? `<span class="anchor-mark">${escapeXml(label)}</span>` : '');
          after.push(`<p class="cm">${label ? `<span class="anchor-mark">${escapeXml(label)}</span> ` : ''}${who} ${n.text}</p>`);
          continue;
        }
        noteSeq++;
        // המספור הרץ רק להערות בלי אות מקור, כדי שלא ידלג על אותיות
        if (!label) cur.noteCount++;
        const nid = `${prefix}n${noteSeq}`;
        const rid = `${prefix}r${noteSeq}`;
        const marker = escapeXml(label || hebNum(cur.noteCount));
        if (notesMode === 'popup') {
          // חלונית בלבד (EPUB 3 footnote): ההערה ב-<aside> באותו קובץ. קוראים שתומכים בחלוניות
          // (Apple Books, Kobo, Google Play Books, KOReader) מסתירים אותה ומציגים רק בלחיצה על הסמן
          refs.push(`<a class="noteref" epub:type="noteref" role="doc-noteref" id="${rid}" href="#${nid}">${marker}</a>`);
          cur.notes.push(`<aside class="footnote" epub:type="footnote" role="doc-footnote" id="${nid}"><p><span class="note-mark">${marker}</span> ${who} ${n.text}</p></aside>`);
        } else if (notesMode === 'chapter') {
          // הערות גלויות בסוף הפרק: קישורים רגילים, בלי epub:type, כדי שאף קורא לא יסתיר אותן
          refs.push(`<a class="noteref" id="${rid}" href="#${nid}">${marker}</a>`);
          cur.notes.push(`<p class="cm" id="${nid}"><a class="noteback" href="#${rid}">${marker}</a> ${who} ${n.text}</p>`);
        } else {
          // הערות סיום: הטקסט בקובץ נפרד בסוף הספר, ונפתח כחלונית. EPUB SSV 1.1: endnote הוצא משימוש —
            // ההערה הבודדת בתוך section endnotes מסומנת footnote (בלי role על li, לפי DAISY KB)
          refs.push(`<a class="noteref" epub:type="noteref" role="doc-noteref" id="${rid}" href="${cur.notesName}#${nid}">${marker}</a>`);
          cur.notes.push(`<li class="endnote" epub:type="footnote" id="${nid}"><p><a class="noteback" role="doc-backlink" href="${cur.name}#${rid}">${marker}</a> ${who} ${n.text}</p></li>`);
        }
      }
      // מחליפים את מצייני המקום בסמנים; מציין שנבלע (למשל בתוך <script>) — הסמן עובר לסוף השורה,
      // כדי שלכל הערה יהיה תמיד קישור חוזר תקין
      const placed = new Set();
      let html = parsed.html.replace(MARK_RE, (m, k) => { placed.add(Number(k)); return refs[Number(k)] || ''; });
      anchored.forEach((n, k) => { if (!placed.has(k)) html += refs[k]; });
      for (let k = anchored.length; k < refs.length; k++) html += refs[k];
      if (!html && !idAttr && !after.length) continue;
      let el;
      if (parsed.kind === 'heading') {
        const lvl = Math.min(6, parsed.level + headingShift);
        el = `<h${lvl}${idAttr} class="h">${html || escapeXml(stripTags(entries ? entries[0].text : ''))}</h${lvl}>`;
      } else {
        el = html ? `<p${idAttr}>${html}</p>` : `<span${idAttr}></span>`;
      }
      if (after.length) el += `\n<div class="cm-block ${fontClass}">\n${after.join('\n')}\n</div>`;
      cur.body.push(el);
      cur.size += el.length;
    }

    const used = files.filter((f) => f.body.length);
    const docs = [];
    const noteDocs = [];
    for (const f of used) {
      let body = `<section epub:type="chapter">\n${f.body.join('\n')}\n</section>`;
      if (f.notes.length && notesMode === 'popup') {
        body += `\n<div class="footnotes ${fontClass}">\n${f.notes.join('\n')}\n</div>`;
      }
      if (f.notes.length && notesMode === 'chapter') {
        body += `\n<section class="chapter-notes ${fontClass}">\n<h2 class="notes-title">הערות</h2>\n${f.notes.join('\n')}\n</section>`;
      }
      docs.push({ name: f.name, content: xhtmlDoc(f.title || book.title, body, { bodyType: 'bodymatter' }) });
      if (f.notes.length && notesMode === 'endnotes') {
        const title = `הערות — ${f.title || book.title}`;
        const nb = `<section class="endnotes ${fontClass}" epub:type="endnotes" role="doc-endnotes">\n`
          + `<h2 class="notes-title">${escapeXml(title)}</h2>\n<ol>\n${f.notes.join('\n')}\n</ol>\n</section>`;
        noteDocs.push({ name: f.notesName, content: xhtmlDoc(title, nb, { bodyClass: 'notes-body', bodyType: 'backmatter' }) });
      }
    }
    // קובץ ראשון ריק (כשהשורה הראשונה פותחת קובץ חדש) מושמט; נקודות הניווט מצביעות לקבצים קיימים בלבד
    const names = new Set(docs.map((d) => d.name));
    const fix = (nodes) => nodes.forEach((n) => { if (!names.has(n.href.split('#')[0])) n.href = `${docs[0].name}`; fix(n.children); });
    fix(navRoots);
    return { docs, noteDocs, navRoots, noteCount: noteSeq };
  }

  function partPage(book, bIdx) {
    const name = `b${bIdx + 1}-0000.xhtml`;
    const body = '<section class="part" epub:type="part">'
      + `<h1 class="part-title">${escapeXml(book.title)}</h1>`
      + (book.rangeLabel ? `<p class="part-range">${escapeXml(book.rangeLabel)}</p>` : '')
      + (book.details && book.details.authors && book.details.authors.length ? `<p class="part-author">${escapeXml(joinNames(book.details.authors))}</p>` : '')
      + '</section>';
    return { name, content: xhtmlDoc(book.title, body, { bodyClass: 'part-body', bodyType: 'bodymatter' }) };
  }

  function navOl(nodes, depth) {
    if (!nodes.length) return '';
    const pad = '  '.repeat(depth);
    const items = nodes.map((n) => `${pad}  <li><a href="${escapeXml(n.href)}">${escapeXml(n.label)}</a>${n.children.length ? `\n${navOl(n.children, depth + 2)}\n${pad}  ` : ''}</li>`);
    return `${pad}<ol>\n${items.join('\n')}\n${pad}</ol>`;
  }

  function navDoc(spec, navTree, landmarks) {
    const body = '<nav epub:type="toc" id="toc" role="doc-toc">\n<h1>תוכן העניינים</h1>\n'
      + `${navOl(navTree, 0)}\n</nav>\n`
      + '<nav epub:type="landmarks" id="landmarks" hidden="hidden">\n<h1>ציוני דרך</h1>\n<ol>\n'
      + landmarks.map((l) => `  <li><a epub:type="${l.type}" href="${escapeXml(l.href)}">${escapeXml(l.label)}</a></li>`).join('\n')
      + '\n</ol>\n</nav>';
    // nav.xhtml יושב באותה תיקייה כמו קבצי הטקסט
    return xhtmlDoc('תוכן העניינים', body, { bodyClass: 'nav-body' });
  }

  function ncxDoc(spec, navTree) {
    let order = 0;
    let maxDepth = 1;
    const points = (nodes, depth) => nodes.map((n) => {
      order++;
      maxDepth = Math.max(maxDepth, depth);
      const id = `np${order}`;
      return `<navPoint id="${id}" playOrder="${order}"><navLabel><text>${escapeXml(n.label)}</text></navLabel><content src="text/${escapeXml(n.href)}"/>${points(n.children, depth + 1)}</navPoint>`;
    }).join('\n');
    const map = points(navTree, 1);
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="he">\n'
      + `<head><meta name="dtb:uid" content="${escapeXml(spec.meta.identifier)}"/><meta name="dtb:depth" content="${maxDepth}"/>`
      + '<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>\n'
      + `<docTitle><text>${escapeXml(spec.meta.title)}</text></docTitle>\n`
      + `<navMap>\n${map}\n</navMap>\n</ncx>\n`;
  }

  function isoNoMs(d) {
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function opfDoc(spec, items, spine) {
    const m = spec.meta;
    const md = [];
    md.push(`<dc:identifier id="bookid">${escapeXml(m.identifier)}</dc:identifier>`);
    md.push(`<dc:title id="title">${escapeXml(m.title)}</dc:title>`);
    md.push('<meta refines="#title" property="title-type">main</meta>');
    if (m.subtitle) {
      md.push(`<dc:title id="subtitle">${escapeXml(m.subtitle)}</dc:title>`);
      md.push('<meta refines="#subtitle" property="title-type">subtitle</meta>');
    }
    md.push('<dc:language>he</dc:language>');
    (m.creators || []).forEach((c, i) => {
      md.push(`<dc:creator id="creator${i + 1}">${escapeXml(c)}</dc:creator>`);
      md.push(`<meta refines="#creator${i + 1}" property="role" scheme="marc:relators">aut</meta>`);
    });
    (m.contributors || []).forEach((c, i) => {
      md.push(`<dc:contributor id="contrib${i + 1}">${escapeXml(c)}</dc:contributor>`);
      md.push(`<meta refines="#contrib${i + 1}" property="role" scheme="marc:relators">ann</meta>`);
    });
    md.push('<dc:publisher>אוצריא</dc:publisher>');
    if (m.description) md.push(`<dc:description>${escapeXml(m.description)}</dc:description>`);
    for (const s of m.subjects || []) md.push(`<dc:subject>${escapeXml(s)}</dc:subject>`);
    for (const s of m.sources || []) md.push(`<dc:source>${escapeXml(s)}</dc:source>`);
    if (m.rights) md.push(`<dc:rights>${escapeXml(m.rights)}</dc:rights>`);
    md.push(`<dc:date>${isoNoMs(m.date).slice(0, 10)}</dc:date>`);
    md.push(`<meta property="dcterms:modified">${isoNoMs(m.date)}</meta>`);
    if (spec.cover) md.push('<meta name="cover" content="cover-image"/>');
    md.push(`<meta name="generator" content="Otzaria EPUB Export ${escapeXml(m.generatorVersion || '')}"/>`);

    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="he" dir="rtl">\n'
      + '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
      + md.join('\n')
      + '\n</metadata>\n<manifest>\n'
      + items.map((it) => `<item id="${it.id}" href="${escapeXml(it.href)}" media-type="${it.type}"${it.props ? ` properties="${it.props}"` : ''}/>`).join('\n')
      + '\n</manifest>\n<spine toc="ncx" page-progression-direction="rtl">\n'
      + spine.map((s) => `<itemref idref="${s.id}"${s.linear === false ? ' linear="no"' : ''}/>`).join('\n')
      + '\n</spine>\n</package>\n';
  }

  const CONTAINER_XML = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
    + '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n'
    + '</container>\n';

  /**
   * בונה את כל קבצי ה-EPUB.
   * spec = {
   *   meta: { title, subtitle?, creators[], contributors[], description?, subjects[], identifier, date, appVersion?, generatorVersion? },
   *   books: [{ title, rangeLabel?, details?, rights, lines[], start, toc[], notes?, commentators?[] }],
   *   options: { titlePage, rightsPage, removeNikud, removeTeamim },
   *   cover?: { name, type, data: Uint8Array },
   *   css: string,
   * }
   * מחזיר [{ path, data: string|Uint8Array, store?: boolean }] לפי הסדר לאריזה.
   */
  function buildEpub(spec) {
    const opts = spec.options || {};
    const multi = spec.books.length > 1;
    const out = [];
    const items = [];
    const spine = [];
    const navTree = [];
    const landmarks = [];
    let itemSeq = 0;
    const addXhtml = (name, content, props, linear) => {
      itemSeq++;
      const id = `x${itemSeq}`;
      out.push({ path: `OEBPS/text/${name}`, data: content });
      items.push({ id, href: `text/${name}`, type: 'application/xhtml+xml', props });
      spine.push({ id, linear });
      return id;
    };

    // מטא-דאטה מסוכמת
    const meta = spec.meta;
    if (!meta.rights) {
      const lines = uniqueBy(spec.books.flatMap((b) => [{ t: b.title, r: b.rights }, ...(b.commentators || []).map((c) => ({ t: c.name, r: c.rights }))]), (x) => x.t)
        .map((x) => `${x.t}: מקור — ${x.r.sourceName}${x.r.sourceUrl ? ` (${x.r.sourceUrl})` : ''}; רישיון — ${x.r.license}${x.r.licenseUrl ? ` (${x.r.licenseUrl})` : ''}`);
      if (spec.books.some((b) => b.rights.personal || (b.commentators || []).some((c) => c.rights.personal))) lines.push('לשימוש אישי בלבד; אין להפיץ ללא רשות בעלי הזכויות.');
      meta.rights = lines.join(' | ');
    }
    if (!meta.sources) {
      meta.sources = uniqueBy(spec.books.map((b) => b.rights), (r) => r.sourceName)
        .map((r) => (r.sourceUrl ? `${r.sourceName} — ${r.sourceUrl}` : r.sourceName));
    }

    if (spec.cover) {
      out.push({ path: `OEBPS/images/${spec.cover.name}`, data: spec.cover.data, store: true });
      items.push({ id: 'cover-image', href: `images/${spec.cover.name}`, type: spec.cover.type, props: 'cover-image' });
      addXhtml('cover.xhtml', coverPage(spec));
      landmarks.push({ type: 'cover', href: 'cover.xhtml', label: 'כריכה' });
    }
    if (opts.titlePage !== false) {
      addXhtml('title.xhtml', titlePage(spec));
      landmarks.push({ type: 'titlepage', href: 'title.xhtml', label: 'שער' });
      navTree.push({ label: 'שער', href: 'title.xhtml', children: [] });
    }
    if (opts.rightsPage !== false) {
      addXhtml('rights.xhtml', rightsPage(spec));
      landmarks.push({ type: 'copyright-page', href: 'rights.xhtml', label: 'פרטי הספר וזכויות' });
      navTree.push({ label: 'פרטי הספר וזכויות', href: 'rights.xhtml', children: [] });
    }
    // nav.xhtml בתוך ה-spine אך לא בזרם הקריאה הראשי
    const navId = 'nav';
    items.push({ id: navId, href: 'text/nav.xhtml', type: 'application/xhtml+xml', props: 'nav' });

    let firstBody = null;
    const allNoteDocs = [];
    spec.books.forEach((book, bIdx) => {
      let bookNode = null;
      if (multi) {
        const p = partPage(book, bIdx);
        addXhtml(p.name, p.content);
        bookNode = { label: book.title, href: p.name, children: [] };
        navTree.push(bookNode);
        if (!firstBody) firstBody = p.name;
      }
      const r = renderBook(book, bIdx, opts, multi);
      for (const d of r.docs) addXhtml(d.name, d.content);
      if (!firstBody && r.docs.length) firstBody = r.docs[0].name;
      if (bookNode) bookNode.children.push(...r.navRoots);
      else if (r.navRoots.length) navTree.push(...r.navRoots);
      else if (r.docs.length) navTree.push({ label: book.title, href: r.docs[0].name, children: [] });
      if (r.noteDocs.length) allNoteDocs.push({ book, docs: r.noteDocs });
    });
    // הערות הסיום בסוף ה-spine ומחוץ לזרם הקריאה (linear="no"): נפתחות רק מהקישור בטקסט
    for (const { book, docs } of allNoteDocs) {
      for (const d of docs) addXhtml(d.name, d.content, undefined, false);
      navTree.push({ label: multi ? `הערות — ${book.title}` : 'הערות', href: docs[0].name, children: [] });
    }
    if (allNoteDocs.length) landmarks.push({ type: 'endnotes', href: allNoteDocs[0].docs[0].name, label: 'הערות' });
    if (firstBody) landmarks.push({ type: 'bodymatter', href: firstBody, label: 'תחילת הספר' });
    landmarks.push({ type: 'toc', href: 'nav.xhtml#toc', label: 'תוכן העניינים' });

    out.push({ path: 'OEBPS/text/nav.xhtml', data: navDoc(spec, navTree, landmarks) });
    spine.push({ id: navId, linear: false });
    let css = spec.css || '';
    for (const f of spec.fonts || []) {
      out.push({ path: `OEBPS/fonts/${f.name}`, data: f.data, store: true });
      items.push({ id: `font-${f.name.replace(/[^A-Za-z0-9]/g, '')}`, href: `fonts/${f.name}`, type: f.type || 'font/ttf' });
      css = `@font-face { font-family: "${f.family}"; src: url("../fonts/${f.name}"); font-weight: normal; font-style: normal; }\n${css}`;
    }
    css = css.replace(/@charset "UTF-8";\n?/g, '');
    out.push({ path: 'OEBPS/css/book.css', data: `@charset "UTF-8";\n${css}` });
    items.push({ id: 'css', href: 'css/book.css', type: 'text/css' });
    out.push({ path: 'OEBPS/toc.ncx', data: ncxDoc(spec, navTree) });
    items.push({ id: 'ncx', href: 'toc.ncx', type: 'application/x-dtbncx+xml' });
    out.push({ path: 'OEBPS/content.opf', data: opfDoc(spec, items, spine) });

    return [
      { path: 'mimetype', data: 'application/epub+zip', store: true },
      { path: 'META-INF/container.xml', data: CONTAINER_XML },
      ...out,
    ];
  }

  // ══════════════════════════════════════════════════════════════════════
  // ZIP
  // ══════════════════════════════════════════════════════════════════════

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const utf8 = (s) => new TextEncoder().encode(s);

  /**
   * אורז ל-ZIP. deflateRaw(Uint8Array) => Promise<Uint8Array> אופציונלי; בלעדיו נשמר ללא דחיסה.
   * mimetype חייב להיות ראשון ולא דחוס (OCF 3.0 §4.3).
   */
  async function zip(files, deflateRaw, onProgress) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const name = utf8(f.path);
      const raw = typeof f.data === 'string' ? utf8(f.data) : f.data;
      const crc = crc32(raw);
      let body = raw;
      let method = 0;
      if (!f.store && deflateRaw && raw.length > 64) {
        const c = await deflateRaw(raw);
        if (c.length < raw.length) { body = c; method = 8; }
      }
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 names
      lv.setUint16(8, method, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, body.length, true);
      lv.setUint32(22, raw.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);
      chunks.push(local, body);

      const cen = new Uint8Array(46 + name.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, method, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, body.length, true);
      cv.setUint32(24, raw.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cen.set(name, 46);
      central.push(cen);
      offset += local.length + body.length;
      if (onProgress) onProgress(i + 1, files.length);
    }
    const cenSize = central.reduce((a, c) => a + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cenSize, true);
    ev.setUint32(16, offset, true);
    const all = [...chunks, ...central, end];
    const total = all.reduce((a, c) => a + c.length, 0);
    const result = new Uint8Array(total);
    let p = 0;
    for (const c of all) { result.set(c, p); p += c.length; }
    return result;
  }

  /** דחיסה בעזרת CompressionStream כשהדפדפן/WebView תומך; אחרת null (אריזה ללא דחיסה). */
  function nativeDeflateRaw() {
    if (typeof CompressionStream === 'undefined') return null;
    try { new CompressionStream('deflate-raw'); } catch (e) { return null; }
    return async (bytes) => {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    };
  }

  function uuidV4(rand) {
    const b = new Uint8Array(16);
    if (rand) rand(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0F) | 0x40;
    b[8] = (b[8] & 0x3F) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  /** שם קובץ בטוח לכל מערכות הקבצים. */
  function safeFileName(s) {
    return String(s || 'ספר').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'ספר';
  }

  const api = {
    escapeXml, decodeEntities, stripTags, removeMarks, sanitizeInline, parseLine, injectAtVisibleOffsets,
    hebNum, commentatorShortName, tocRange, normalizeSourceKey, rightsFor,
    buildEpub, zip, crc32, nativeDeflateRaw, uuidV4, safeFileName, formatDateHe,
    MAX_FILE_CHARS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EpubCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
