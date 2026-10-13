// ממשק התוסף "ייצוא EPUB": בחירת ספרים וטווחים, מפרשים, הגדרות, טעינת הטקסט
// מאוצריא, ציור כריכה, בניית הקובץ (core.js) ושמירה בדיאלוג "שמור בשם".
(function () {
  'use strict';

  const C = window.EpubCore;
  const HAS_OTZ = typeof window.Otzaria !== 'undefined';
  const VERSION = '1.1.0'; // יש לעדכן יחד עם manifest.json
  const CHUNK = 5000; // תקרת library.getBookContent
  const LINKS_WINDOW = 200; // תקרת library.getLinks
  const LINK_CONTENT_BATCH = 25; // תקרת library.getLinkContent
  const $ = (sel) => document.querySelector(sel);

  const state = {
    books: [], // { key, bookId, bookUid, id, title, details, rights, toc, from, to, commentators: [{title}], cmList, cmOpen, cmFilter }
    boot: { appVersion: '', platform: '' },
    cancelled: false,
    theme: null,
  };

  // ══════════════════════════════════════════════════════════════════════
  // גשר לאוצריא
  // ══════════════════════════════════════════════════════════════════════
  async function call(method, params) {
    if (!HAS_OTZ) return { success: false, error: { code: 'dev', message: 'הפעולה זמינה רק בתוך אוצריא' } };
    try {
      return await window.Otzaria.call(method, params || {});
    } catch (e) {
      return { success: false, error: { code: 'exception', message: e && e.message } };
    }
  }

  async function must(method, params) {
    const r = await call(method, params);
    if (!r || !r.success) {
      const msg = (r && r.error && (r.error.message || r.error.code)) || 'שגיאה לא ידועה';
      throw new Error(`${method}: ${msg}`);
    }
    return r.data;
  }

  const notify = (message) => call('ui.showSuccess', { message });
  const notifyError = (message) => (HAS_OTZ ? call('ui.showError', { message }) : console.error(message));

  // ══════════════════════════════════════════════════════════════════════
  // עזרי DOM
  // ══════════════════════════════════════════════════════════════════════
  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }

  const identity = (b) => (b.bookUid ? { bookUid: b.bookUid, bookId: b.bookId } : { bookId: b.bookId, id: b.id ?? undefined });

  // ══════════════════════════════════════════════════════════════════════
  // חיפוש והוספה
  // ══════════════════════════════════════════════════════════════════════
  let searchSeq = 0;
  async function runSearch() {
    const q = $('#searchInput').value.trim();
    const seq = ++searchSeq;
    const box = $('#searchResults');
    let items;
    let label;
    if (!q) {
      const r = await call('library.listRecentBooks');
      items = r.success ? (r.data || []).map((b) => ({ ...b, title: b.title || b.bookId })) : [];
      label = items.length ? 'נפתחו לאחרונה' : '';
    } else {
      const r = await call('library.findBooks', { query: q, limit: 30 });
      items = r.success ? r.data || [] : [];
      label = items.length ? '' : 'לא נמצאו ספרים';
    }
    if (seq !== searchSeq) return;
    // רק ספרי טקסט: PDF/Word/ספרים חיצוניים אינם נגישים כטקסט שורות
    items = items.filter((b) => !b.type || b.type === 'text').slice(0, 30);
    const seen = new Set();
    items = items.filter((b) => { const k = b.bookUid || b.bookId; if (seen.has(k)) return false; seen.add(k); return true; });
    box.replaceChildren(
      label ? el('div', { class: 'results-label', text: label }) : '',
      ...items.map((b) => el('div', { class: 'result' },
        el('span', { class: 'result-title', text: b.title || b.bookId }),
        b.categoryPath ? el('span', { class: 'result-path', text: b.categoryPath.replace(/^\//, '').replace(/\//g, ' › ') }) : '',
        el('button', { class: 'btn', onclick: () => { closeSearch(); addBook(b); } }, 'הוספה'))),
    );
  }

  /** סוגר את רשימת התוצאות ומנקה את השדה (גם מבטל חיפוש שעוד רץ). */
  function closeSearch(keepText) {
    searchSeq++;
    if (!keepText) $('#searchInput').value = '';
    $('#searchResults').replaceChildren();
  }

  async function addBook(meta) {
    const key = meta.bookUid || `${meta.bookId}#${meta.id ?? ''}`;
    if (state.books.some((b) => b.key === key)) { notifyError('הספר כבר נמצא ברשימה'); return; }
    const book = {
      key, bookId: meta.bookId || meta.title, bookUid: meta.bookUid, id: meta.id,
      title: meta.title || meta.bookId, details: null, rights: C.rightsFor(null), toc: [],
      from: null, to: null, commentators: [], cmList: null, cmOpen: false, cmFilter: '',
    };
    state.books.push(book);
    renderBooks();
    const [details, toc] = await Promise.all([
      call('library.getBookDetails', identity(book)),
      call('library.getBookToc', identity(book)),
    ]);
    if (details.success && details.data) {
      book.details = details.data;
      book.rights = C.rightsFor(details.data.textSource);
    }
    book.toc = toc.success && Array.isArray(toc.data) ? toc.data : [];
    renderBooks();
    saveDraft();
  }

  // ══════════════════════════════════════════════════════════════════════
  // רשימת הספרים
  // ══════════════════════════════════════════════════════════════════════
  function tocOptions(book, selected, emptyLabel) {
    const sel = el('select', { class: 'field' });
    sel.append(el('option', { value: '' }, emptyLabel));
    const minLevel = book.toc.length ? Math.min(...book.toc.map((e) => e.level)) : 1;
    book.toc.forEach((e, i) => {
      const indent = ' '.repeat(Math.max(0, e.level - minLevel));
      const o = el('option', { value: String(i) }, indent + C.stripTags(e.text));
      if (selected === i) o.selected = true;
      sel.append(o);
    });
    return sel;
  }

  function rangeLabel(book) {
    if (book.from == null && book.to == null) return '';
    const t = (i) => C.stripTags(book.toc[i].text);
    if (book.from != null && book.to != null) return book.from === book.to ? t(book.from) : `${t(book.from)} – ${t(book.to)}`;
    return book.from != null ? `מ${t(book.from)} עד הסוף` : `מההתחלה עד ${t(book.to)}`;
  }

  function renderBooks() {
    const list = $('#bookList');
    $('#booksCount').textContent = state.books.length ? `${state.books.length} ספרים` : '';
    if (!state.books.length) {
      list.replaceChildren(el('div', { class: 'empty' }, 'עוד לא נבחרו ספרים. חפשו ספר והוסיפו אותו — אפשר כמה ספרים לקובץ אחד.'));
    } else {
      list.replaceChildren(...state.books.map((b, idx) => bookCard(b, idx)));
    }
    const ready = state.books.length > 0;
    $('#exportBtn').disabled = !ready;
    $('#exportHint').textContent = ready ? '' : 'הוסיפו לפחות ספר אחד';
    $('#optTitle').placeholder = defaultTitle() || 'ייקבע לפי הספרים שנבחרו';
  }

  function bookCard(b, idx) {
    const d = b.details || {};
    const meta = [d.authors && d.authors.join(', '), d.era].filter(Boolean).join(' · ');
    const from = tocOptions(b, b.from, 'מתחילת הספר');
    const to = tocOptions(b, b.to, 'עד סוף הספר');
    from.addEventListener('change', () => {
      b.from = from.value === '' ? null : Number(from.value);
      if (b.from != null && b.to != null && b.to < b.from) b.to = b.from;
      renderBooks(); saveDraft();
    });
    to.addEventListener('change', () => {
      b.to = to.value === '' ? null : Number(to.value);
      if (b.from != null && b.to != null && b.to < b.from) b.from = b.to;
      renderBooks(); saveDraft();
    });
    const move = (delta) => {
      const j = idx + delta;
      [state.books[idx], state.books[j]] = [state.books[j], state.books[idx]];
      renderBooks(); saveDraft();
    };
    return el('div', { class: 'card' },
      el('div', { class: 'book-head' },
        el('div', { class: 'book-title' },
          el('b', { text: b.title }),
          meta ? el('div', { class: 'book-meta', text: meta }) : '',
          el('div', { class: 'book-rights muted' },
            `מקור: ${b.rights.sourceName} · ${b.rights.license} `,
            b.rights.personal ? el('span', { class: 'badge badge-warn', text: 'לשימוש אישי בלבד' }) : '')),
        el('button', { class: 'icon-btn', title: 'הזזה למעלה', 'aria-label': 'הזזה למעלה', disabled: idx === 0, onclick: () => move(-1) }, '▲'),
        el('button', { class: 'icon-btn', title: 'הזזה למטה', 'aria-label': 'הזזה למטה', disabled: idx === state.books.length - 1, onclick: () => move(1) }, '▼'),
        el('button', { class: 'icon-btn', title: 'הסרה', 'aria-label': 'הסרה', onclick: () => { state.books.splice(idx, 1); renderBooks(); saveDraft(); } }, '✕')),
      b.toc.length
        ? el('div', { class: 'range-row' }, el('span', { text: 'מ:' }), from, el('span', { text: 'עד:' }), to)
        : el('div', { class: 'muted small', text: 'לספר אין תוכן עניינים — ייוצא הספר כולו.' }),
      commentatorsBlock(b));
  }

  function commentatorsBlock(b) {
    const chosen = b.commentators.length
      ? el('div', { class: 'cm-chosen' }, ...b.commentators.map((c) => el('span', { class: 'badge', text: C.commentatorShortName(c.title, b.title) })))
      : '';
    const toggle = el('button', {
      class: 'btn cm-toggle',
      onclick: async () => {
        b.cmOpen = !b.cmOpen;
        if (b.cmOpen && !b.cmList) await loadCommentators(b);
        renderBooks();
      },
    }, b.cmOpen ? 'סגירת רשימת המפרשים' : (b.commentators.length ? `מפרשים (${b.commentators.length})` : 'הוספת מפרשים כהערות'));
    if (!b.cmOpen) return el('div', {}, toggle, chosen);

    const panel = el('div', { class: 'cm-panel' });
    if (!b.cmList) {
      panel.append(el('div', { class: 'muted small', text: 'טוען…' }));
    } else if (!b.cmList.items.length) {
      panel.append(el('div', { class: 'muted small', text: 'לא נמצאו מפרשים לספר זה.' }));
    } else {
      const filter = el('input', { type: 'search', class: 'field cm-filter', placeholder: 'סינון מפרשים…', value: b.cmFilter });
      const grid = el('div', { class: 'cm-list' });
      const fill = () => {
        const f = filter.value.trim();
        b.cmFilter = f;
        grid.replaceChildren();
        for (const g of b.cmList.groups) {
          const items = g.items.filter((c) => !f || c.title.includes(f));
          if (!items.length) continue;
          if (g.title) grid.append(el('div', { class: 'cm-group', text: g.title }));
          for (const c of items) {
            const cb = el('input', { type: 'checkbox', checked: b.commentators.some((x) => x.title === c.title) });
            cb.addEventListener('change', () => {
              if (cb.checked) b.commentators.push({ title: c.title });
              else b.commentators = b.commentators.filter((x) => x.title !== c.title);
              saveDraft();
            });
            grid.append(el('label', { class: 'cm-item' }, cb, C.commentatorShortName(c.title, b.title),
              c.linkCount ? el('span', { class: 'count', text: `(${c.linkCount})` }) : ''));
          }
        }
      };
      filter.addEventListener('input', fill);
      fill();
      panel.append(filter, grid);
    }
    return el('div', {}, toggle, panel);
  }

  async function loadCommentators(b) {
    const ident = { bookId: b.bookId, id: b.id ?? undefined };
    const [flat, grouped] = await Promise.all([
      call('library.getCommentators', ident),
      call('library.getCommentators', { ...ident, grouped: true }),
    ]);
    const items = flat.success && flat.data && flat.data.commentators ? flat.data.commentators : [];
    const byTitle = new Map(items.map((c) => [c.title, c]));
    const groups = [];
    if (grouped.success && grouped.data && grouped.data.groups) {
      const used = new Set();
      for (const g of grouped.data.groups) {
        const gi = g.commentators.map((t) => byTitle.get(t) || { title: t }).filter((c) => !used.has(c.title));
        gi.forEach((c) => used.add(c.title));
        if (gi.length) groups.push({ title: g.title, items: gi });
      }
      const rest = items.filter((c) => !used.has(c.title));
      if (rest.length) groups.push({ title: 'נוספים', items: rest });
    } else {
      groups.push({ title: '', items: [...items].sort((a, x) => (x.linkCount || 0) - (a.linkCount || 0)) });
    }
    b.cmList = { items, groups };
  }

  // ══════════════════════════════════════════════════════════════════════
  // הגדרות וטיוטה
  // ══════════════════════════════════════════════════════════════════════
  function readOptions() {
    return {
      title: $('#optTitle').value.trim(),
      cover: $('#optCover').checked,
      titlePage: $('#optTitlePage').checked,
      rightsPage: $('#optRightsPage').checked,
      removeTeamim: $('#optRemoveTeamim').checked,
      removeNikud: $('#optRemoveNikud').checked,
      notesMode: (document.querySelector('input[name="notesMode"]:checked') || {}).value || 'popup',
      notesFont: $('#optNotesFont').value,
    };
  }

  function writeOptions(o) {
    if (!o) return;
    if (typeof o.title === 'string') $('#optTitle').value = o.title;
    for (const [id, k] of [['#optCover', 'cover'], ['#optTitlePage', 'titlePage'], ['#optRightsPage', 'rightsPage'], ['#optRemoveTeamim', 'removeTeamim'], ['#optRemoveNikud', 'removeNikud']]) {
      if (typeof o[k] === 'boolean') $(id).checked = o[k];
    }
    const radio = document.querySelector(`input[name="notesMode"][value="${o.notesMode}"]`);
    if (radio) radio.checked = true;
    if (o.notesFont) $('#optNotesFont').value = o.notesFont;
  }

  let draftTimer = null;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const books = state.books.map((b) => ({
        bookId: b.bookId, bookUid: b.bookUid, id: b.id, title: b.title,
        from: b.from, to: b.to, commentators: b.commentators.map((c) => c.title),
        // נשמרות גם הכותרות, כדי לזהות שתוכן העניינים השתנה בעדכון ספרייה
        fromText: b.from != null && b.toc[b.from] ? b.toc[b.from].text : null,
        toText: b.to != null && b.toc[b.to] ? b.toc[b.to].text : null,
      }));
      call('storage.set', { key: 'draft', value: { books, options: readOptions() } });
    }, 400);
  }

  async function loadDraft() {
    const r = await call('storage.get', { key: 'draft' });
    const d = r.success ? r.data : null;
    if (!d) return;
    writeOptions(d.options);
    for (const s of d.books || []) {
      await addBook({ bookId: s.bookId, bookUid: s.bookUid, id: s.id, title: s.title });
      const b = state.books[state.books.length - 1];
      if (!b) continue;
      const pick = (i, text) => (i != null && b.toc[i] && (text == null || b.toc[i].text === text) ? i : null);
      b.from = pick(s.from, s.fromText);
      b.to = pick(s.to, s.toText);
      b.commentators = (s.commentators || []).map((title) => ({ title }));
    }
    renderBooks();
  }

  function defaultTitle() {
    if (!state.books.length) return '';
    if (state.books.length === 1) return state.books[0].title;
    if (state.books.length <= 3) return state.books.map((b) => b.title).join(', ');
    return `${state.books[0].title} ועוד ${state.books.length - 1} ספרים`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // התקדמות
  // ══════════════════════════════════════════════════════════════════════
  function progress(text, frac) {
    $('#busy').hidden = false;
    if (text != null) $('#busyText').textContent = text;
    if (frac != null) $('#busyBar').style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  }
  function checkCancel() {
    if (state.cancelled) throw new Error('cancelled');
  }

  // ══════════════════════════════════════════════════════════════════════
  // טעינת הטקסט והמפרשים
  // ══════════════════════════════════════════════════════════════════════

  /** טוען שורות עד `endLine` (לא כולל) — לא ממשיך לקרוא אחרי סוף הטווח. */
  async function loadLines(b, endLine, label) {
    let text = '';
    let offset = 0;
    let newlines = 0;
    const total = b.details && b.details.lineCount ? b.details.lineCount : null;
    for (;;) {
      checkCancel();
      const chunk = await must('library.getBookContent', { ...identity(b), offset, limit: CHUNK });
      if (typeof chunk !== 'string' || !chunk.length) break;
      text += chunk;
      offset += chunk.length;
      for (let i = 0; i < chunk.length; i++) if (chunk.charCodeAt(i) === 10) newlines++;
      if (total) progress(`${label}: טוען טקסט…`, Math.min(newlines, endLine ?? total) / (endLine ?? total));
      else progress(`${label}: טוען טקסט… (${Math.round(offset / 1000)}K תווים)`, null);
      if (chunk.length < CHUNK) break;
      if (endLine != null && newlines > endLine) break;
    }
    return text.split(/\r?\n/);
  }

  async function loadNotes(b, start, end, label) {
    const titles = b.commentators.map((c) => c.title);
    const links = [];
    let line = start;
    let win = LINKS_WINDOW;
    while (line < end) {
      checkCancel();
      progress(`${label}: אוסף קישורי מפרשים…`, (line - start) / Math.max(1, end - start));
      const r = await must('library.getLinks', {
        bookId: b.bookId, id: b.id ?? undefined,
        startLine: line, endLine: Math.min(end - 1, line + win - 1), targetTitles: titles,
        includeAnchors: true,
      });
      if (r.truncated && win > 1) { win = Math.max(1, win >> 1); continue; }
      links.push(...(r.links || []));
      line += win;
      win = LINKS_WINDOW;
    }
    // תוכן הקישורים, בלי כפילויות של אותה שורת יעד
    const uniq = new Map();
    for (const l of links) {
      const k = `${l.targetTitle}|${l.targetLine}|${l.targetLineEnd ?? ''}|${l.targetIsUserBook ? 1 : 0}`;
      if (!uniq.has(k)) uniq.set(k, l);
    }
    const targets = [...uniq.values()];
    const content = new Map();
    for (let i = 0; i < targets.length; i += LINK_CONTENT_BATCH) {
      checkCancel();
      progress(`${label}: טוען את דברי המפרשים…`, i / Math.max(1, targets.length));
      const batch = targets.slice(i, i + LINK_CONTENT_BATCH);
      const r = await must('library.getLinkContent', {
        links: batch.map((l) => ({
          targetTitle: l.targetTitle, targetLine: l.targetLine, targetLineEnd: l.targetLineEnd,
          targetIsUserBook: l.targetIsUserBook, targetCategoryId: l.targetCategoryId,
        })),
      });
      (r.items || []).forEach((it, j) => {
        const l = batch[j];
        if (it && typeof it.content === 'string' && it.content.trim()) {
          content.set(`${l.targetTitle}|${l.targetLine}|${l.targetLineEnd ?? ''}|${l.targetIsUserBook ? 1 : 0}`, it.content);
        }
      });
    }
    // קיבוץ לפי שורה. קישור עם עוגן-מילה (למשל שער הציון על המשנה ברורה) הוא הערה
    // נפרדת במקומה בשורה; קישורים בלי עוגן מאוחדים להערה אחת לכל מפרש בסוף השורה.
    const order = new Map(titles.map((t, i) => [t, i]));
    const keyOf = (l) => `${l.targetTitle}|${l.targetLine}|${l.targetLineEnd ?? ''}|${l.targetIsUserBook ? 1 : 0}`;
    const byLine = {};
    for (const l of links) {
      const html = content.get(keyOf(l));
      if (!html) continue;
      const entry = byLine[l.sourceLine] || (byLine[l.sourceLine] = { anchored: [], merged: new Map() });
      const a = l.anchor;
      if (a && Number.isInteger(a.start) && a.start >= 0) {
        // עוגן-נקודה: הסמן לפני התו שבמיקום; עוגן-טווח: אחרי סוף הטווח
        const at = Number.isInteger(a.end) && a.end > a.start ? a.end : a.start;
        if (!entry.anchored.some((x) => x.title === l.targetTitle && x.at === at && x.html === html)) {
          entry.anchored.push({ title: l.targetTitle, at, label: anchorLabel(a.label, l.targetHeRef), html });
        }
        continue;
      }
      const parts = entry.merged.get(l.targetTitle) || [];
      if (!parts.includes(html)) parts.push(html);
      entry.merged.set(l.targetTitle, parts);
    }
    const rank = (t) => order.get(t) ?? 99;
    const notes = {};
    for (const [ln, entry] of Object.entries(byLine)) {
      notes[ln] = [
        ...entry.anchored.map((x) => ({ commentator: C.commentatorShortName(x.title, b.title), html: x.html, at: x.at, label: x.label })),
        ...[...entry.merged.entries()]
          .sort((x, y) => rank(x[0]) - rank(y[0]))
          .map(([title, parts]) => ({ commentator: C.commentatorShortName(title, b.title), html: parts.join('<br/>') })),
      ];
    }
    return notes;
  }

  /** אות הסמן של עוגן: התווית מהמסד, ואם אין — הרכיב האחרון של ה-heRef (כמו באוצריא). */
  function anchorLabel(label, heRef) {
    const l = String(label || '').trim();
    if (l) return l.replace(/\u2666/g, '\u25C6');
    const tail = String(heRef || '').split(',').pop().trim();
    const letters = tail.replace(/["׳״]/g, '');
    return /^[א-ת]{1,4}$/.test(letters) ? tail : '';
  }

  async function commentatorRights(b) {
    const out = [];
    for (const c of b.commentators) {
      const r = await call('library.getBookDetails', { bookId: c.title });
      out.push({
        name: C.commentatorShortName(c.title, b.title),
        rights: C.rightsFor(r.success && r.data ? r.data.textSource : null),
      });
    }
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════
  // כריכה
  // ══════════════════════════════════════════════════════════════════════
  function wrapLines(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  async function drawCover(title, subtitle, author) {
    const W = 1200;
    const H = 1800;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1f3358');
    bg.addColorStop(1, '#0f1c33');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const gold = ctx.createLinearGradient(0, 0, W, H);
    gold.addColorStop(0, '#f3dc8c');
    gold.addColorStop(0.5, '#c5962f');
    gold.addColorStop(1, '#ecc865');
    ctx.strokeStyle = gold;
    ctx.lineWidth = 10;
    ctx.strokeRect(70, 70, W - 140, H - 140);
    ctx.lineWidth = 3;
    ctx.strokeRect(96, 96, W - 192, H - 192);
    // קישוט פינות
    ctx.fillStyle = gold;
    for (const [x, y] of [[96, 96], [W - 96, 96], [96, H - 96], [W - 96, H - 96]]) {
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
    }
    const serif = "'FrankRuhlCLM', 'Frank Ruehl CLM', 'David', 'Times New Roman', serif";
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // כותרת: מתכווצת עד שנכנסת בארבע שורות לכל היותר
    let size = 140;
    let lines;
    do {
      ctx.font = `bold ${size}px ${serif}`;
      lines = wrapLines(ctx, title, W - 300);
      size -= 8;
    } while ((lines.length > 4 || lines.some((l) => ctx.measureText(l).width > W - 300)) && size > 50);
    size += 8;
    const lh = size * 1.25;
    let y = 640 - ((lines.length - 1) * lh) / 2;
    ctx.fillStyle = gold;
    for (const l of lines) { ctx.fillText(l, W / 2, y); y += lh; }
    // קו מפריד
    y += 40;
    ctx.fillRect(W / 2 - 180, y, 360, 3);
    ctx.fillRect(W / 2 - 120, y + 12, 240, 2);
    y += 100;
    ctx.fillStyle = '#efe3c2';
    if (subtitle) {
      ctx.font = `${Math.round(size * 0.42)}px ${serif}`;
      for (const l of wrapLines(ctx, subtitle, W - 320).slice(0, 3)) { ctx.fillText(l, W / 2, y); y += size * 0.6; }
      y += 30;
    }
    if (author) {
      ctx.font = `${Math.round(size * 0.48)}px ${serif}`;
      for (const l of wrapLines(ctx, author, W - 320).slice(0, 2)) { ctx.fillText(l, W / 2, y); y += size * 0.65; }
    }
    ctx.fillStyle = gold;
    ctx.font = `36px ${serif}`;
    ctx.fillText('מספריית אוצריא', W / 2, H - 190);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return null;
    return { name: 'cover.jpg', type: 'image/jpeg', data: new Uint8Array(await blob.arrayBuffer()) };
  }

  // ══════════════════════════════════════════════════════════════════════
  // ייצוא
  // ══════════════════════════════════════════════════════════════════════
  async function exportEpub() {
    const opts = readOptions();
    state.cancelled = false;
    const books = [];
    try {
      for (let i = 0; i < state.books.length; i++) {
        const b = state.books[i];
        const label = state.books.length > 1 ? `(${i + 1}/${state.books.length}) ${b.title}` : b.title;
        const toc = b.toc;
        // סוף הטווח בשורות ידוע מראש רק כשנבחר "עד"; אחרת קוראים עד סוף הספר
        let endHint = null;
        if (b.to != null) endHint = C.tocRange(toc, b.from, b.to, Number.MAX_SAFE_INTEGER).end;
        const lines = await loadLines(b, endHint, label);
        const r = C.tocRange(toc, b.from, b.to, lines.length);
        const notes = b.commentators.length ? await loadNotes(b, r.start, r.end, label) : {};
        books.push({
          title: b.title,
          rangeLabel: rangeLabel(b),
          details: b.details,
          rights: b.rights,
          lines: lines.slice(r.start, r.end),
          start: r.start,
          toc: toc.filter((e) => e.index >= r.start && e.index < r.end),
          notes,
          commentators: b.commentators.length ? await commentatorRights(b) : [],
        });
      }
      checkCancel();
      progress('בונה את הקובץ…', 0.9);
      const title = opts.title || defaultTitle();
      const single = books.length === 1 ? books[0] : null;
      const creators = [...new Set(books.flatMap((b) => (b.details && b.details.authors) || []))];
      const commentatorNames = [...new Set(books.flatMap((b) => b.commentators.map((c) => c.name)))];
      const subtitle = single ? single.rangeLabel : '';
      const usesNotes = books.some((b) => Object.keys(b.notes).length);
      const spec = {
        meta: {
          title,
          subtitle,
          creators,
          contributors: commentatorNames,
          description: single && single.details && single.details.shortDescription ? C.stripTags(single.details.shortDescription) : '',
          subjects: [...new Set(books.flatMap((b) => {
            const d = b.details || {};
            return [...(d.categoryPath || '').split('/').filter(Boolean), ...(d.topics || [])];
          }))].slice(0, 12),
          identifier: `urn:uuid:${C.uuidV4((a) => crypto.getRandomValues(a))}`,
          date: new Date(),
          appVersion: state.boot.appVersion,
          generatorVersion: VERSION,
        },
        books,
        commentatorNames,
        options: opts,
        css: window.EPUB_BOOK_CSS,
        fonts: usesNotes && opts.notesFont === 'rashi' && window.EPUB_FONT_RASHI
          ? [{ name: 'NotoRashiHebrew.ttf', family: 'Noto Rashi Hebrew', type: 'font/ttf', data: base64ToBytes(window.EPUB_FONT_RASHI) }]
          : [],
        cover: opts.cover ? await drawCover(title, subtitle, creators.join(', ')) : null,
      };
      const files = C.buildEpub(spec);
      const bytes = await C.zip(files, C.nativeDeflateRaw(), (n, total) => progress('אורז…', 0.9 + 0.08 * (n / total)));
      checkCancel();
      progress('שמירה…', 1);
      await saveFile(bytes, C.safeFileName(title));
    } catch (e) {
      if (e && e.message === 'cancelled') notify('הייצוא בוטל');
      else notifyError(`הייצוא נכשל: ${(e && e.message) || e}`);
    } finally {
      $('#busy').hidden = true;
    }
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function saveFile(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/epub+zip' });
    if (!HAS_OTZ) {
      const a = el('a', { href: URL.createObjectURL(blob), download: `${name}.epub` });
      document.body.append(a); a.click(); a.remove();
      return;
    }
    const w = await must('fs.beginBinaryWrite', { purpose: 'user-file', expectedSize: blob.size });
    const res = await fetch(w.uploadUrl, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
    if (!res.ok) {
      await call('fs.abortBinaryWrite', { writeToken: w.writeToken });
      throw new Error(`העלאת הקובץ נכשלה (${res.status})`);
    }
    const r = await must('fs.commitUserFileWrite', {
      writeToken: w.writeToken, suggestedName: name, extension: 'epub', title: 'שמירת ספר EPUB',
    });
    if (r && !r.cancelled) notify(`הקובץ נשמר: ${r.name || name}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // ערכת נושא, אודות, אתחול
  // ══════════════════════════════════════════════════════════════════════
  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
    return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : hex;
  }

  function applyTheme(theme) {
    if (!theme || !theme.colorScheme) return;
    const cs = theme.colorScheme;
    const root = document.documentElement;
    const map = {
      '--color-primary': cs.primary, '--color-on-primary': cs.onPrimary,
      '--color-secondary': cs.secondary,
      '--color-secondary-container': cs.secondaryContainer, '--color-on-secondary-container': cs.onSecondaryContainer,
      '--color-surface': cs.surface, '--color-on-surface': cs.onSurface, '--color-on-surface-variant': cs.onSurfaceVariant,
      '--color-surface-container': cs.surfaceContainer, '--color-surface-container-high': cs.surfaceContainerHigh,
      '--color-surface-container-highest': cs.surfaceContainerHighest,
      '--color-error': cs.error, '--color-on-error': cs.onError, '--color-outline': cs.outline, '--color-outline-variant': cs.outlineVariant,
    };
    for (const [k, v] of Object.entries(map)) if (v) root.style.setProperty(k, v);
    if (cs.primary) root.style.setProperty('--color-primary-subtle', hexToRgba(cs.primary, 0.1));
    if (theme.typography) {
      const t = theme.typography;
      if (t.uiFontFamily) root.style.setProperty('--font-ui', `'${t.uiFontFamily}', system-ui, sans-serif`);
      if (t.fontFamily) root.style.setProperty('--font-main', `'${t.fontFamily}', 'David', serif`);
    }
  }

  function wire() {
    let t = null;
    const input = $('#searchInput');
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(runSearch, 250); });
    // רשימת "נפתחו לאחרונה" מוצגת רק כשהשדה בפוקוס
    input.addEventListener('focus', () => runSearch());
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSearch(); input.blur(); } });
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.search-row, #searchResults')) { clearTimeout(t); closeSearch(true); }
    });
    $('#exportBtn').addEventListener('click', exportEpub);
    $('#cancelBtn').addEventListener('click', () => { state.cancelled = true; progress('מבטל…', null); });
    document.querySelector('.options').addEventListener('change', saveDraft);
    $('#optTitle').addEventListener('input', saveDraft);
    $('#aboutBtn').addEventListener('click', () => {
      $('#aboutText').textContent = `גרסה ${VERSION}. ייצוא ספרים מספריית אוצריא לקובץ EPUB 3 תקני מימין לשמאל, עם דף שער, פרטי מקור וזכויות, תוכן עניינים ומפרשים כהערות.`;
      $('#aboutDlg').showModal();
    });
  }

  async function start(payload) {
    if (payload) {
      state.boot.appVersion = (payload.app && payload.app.version) || '';
      state.boot.platform = (payload.app && payload.app.platform) || '';
      applyTheme(payload.theme);
    }
    renderBooks();
    await loadDraft();
  }

  wire();
  if (HAS_OTZ) {
    window.Otzaria.on('plugin.boot', start);
    window.Otzaria.on('theme.changed', applyTheme);
  } else {
    start(null);
  }
})();
