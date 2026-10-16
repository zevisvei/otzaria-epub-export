// גשר לאוצריא: קריאות, ערכת נושא, אחסון, איתור ספר ופתיחתו במקום מסוים.
// משותף לתוספים שבריפו; כל תוסף מחזיק עותק משלו.
(function () {
  'use strict';

  const HAS_OTZ = typeof window.Otzaria !== 'undefined';

  async function call(method, params) {
    if (!HAS_OTZ) return { success: false, error: { code: 'dev', message: 'הפעולה זמינה רק בתוך אוצריא' } };
    try {
      return await window.Otzaria.call(method, params || {});
    } catch (e) {
      return { success: false, error: { code: 'exception', message: e.message } };
    }
  }
  const ok = (r) => !!(r && r.success && r.data !== false && r.data != null);

  const notifyError = (message) => (HAS_OTZ ? call('ui.showError', { message }) : console.warn(message));

  // ── אחסון (עם localStorage מחוץ לאוצריא) ──
  async function load(key, prefix) {
    if (!HAS_OTZ) {
      try { const v = localStorage.getItem(`${prefix}:${key}`); return v ? JSON.parse(v) : null; } catch (e) { return null; }
    }
    const r = await call('storage.get', { key });
    return r && r.success ? r.data : null;
  }
  async function save(key, value, prefix) {
    if (!HAS_OTZ) {
      try { localStorage.setItem(`${prefix}:${key}`, JSON.stringify(value)); } catch (e) { /* אחסון חסום */ }
      return;
    }
    await call('storage.set', { key, value });
  }

  // ── ערכת נושא ──
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

  /** start(payload) נקרא פעם אחת: באוצריא ב-plugin.boot, ובדפדפן מיד. */
  function boot(start) {
    if (HAS_OTZ) {
      window.Otzaria.on('plugin.boot', (payload) => { applyTheme(payload && payload.theme); start(payload || {}); });
      window.Otzaria.on('theme.changed', applyTheme);
    } else {
      start({});
    }
  }

  // ── איתור ספרים ──
  const norm = (s) => String(s || '').replace(/["״'׳]/g, '').replace(/\s+/g, ' ').trim();
  const bookCache = new Map();
  const tocCache = new Map();

  async function categoryOf(b) {
    if (b.categoryPath) return b.categoryPath;
    const r = await call('library.getBookMetadata', b.bookUid ? { bookUid: b.bookUid } : { bookId: b.bookId });
    return (r && r.success && r.data && r.data.categoryPath) || '';
  }

  /** ספר טקסט ששמו בדיוק title; כשיש כמה — זה שנתיבו מכיל אחד מ-hints. */
  async function resolveBook(title, hints) {
    const key = `${title}|${(hints || []).join(',')}`;
    if (bookCache.has(key)) return bookCache.get(key);
    const r = await call('library.findBooks', { query: title, limit: 50 });
    const list = ((r && r.success && r.data) || [])
      .filter((b) => (!b.type || b.type === 'text') && norm(b.title || b.bookId) === norm(title));
    let found = list[0] || null;
    if (list.length > 1 && hints && hints.length) {
      for (const b of list) {
        const path = norm(await categoryOf(b));
        if (hints.some((h) => path.includes(norm(h)))) { found = b; break; }
      }
    }
    const ident = found ? (found.bookUid ? { bookUid: found.bookUid } : { bookId: found.bookId }) : null;
    if (ident) bookCache.set(key, ident);
    return ident;
  }

  async function getToc(ident, flatten) {
    const key = ident.bookUid || ident.bookId;
    if (!tocCache.has(key)) {
      const r = await call('library.getBookToc', ident);
      tocCache.set(key, r && r.success ? flatten(r.data) : []);
    }
    return tocCache.get(key);
  }

  /**
   * פותח את target ({title, hints, ...}) בקורא. locate(flatToc) מחזיר שורה או null.
   * בלי שורה מדויקת — נפתח בהתייחסות (ref) אם יש, ואחרת בתחילת הספר.
   */
  async function openAt(target, { flatten, locate } = {}) {
    if (!HAS_OTZ) { notifyError('פתיחת ספרים זמינה רק בתוך אוצריא'); return false; }
    const ident = await resolveBook(target.title, target.hints);
    if (!ident) { notifyError(`הספר "${target.title}" לא נמצא בספרייה`); return false; }
    if (target.ref) {
      if (ok(await call('reader.openBookAtRef', Object.assign({}, ident, { ref: target.ref, highlight: true })))) return true;
    }
    if (locate) {
      const index = locate(await getToc(ident, flatten));
      if (index != null) {
        const params = Object.assign({}, ident, { index });
        if (target.search) params.searchQuery = target.search;
        if (ok(await call('reader.openBook', params))) return true;
      }
    }
    if (ok(await call('reader.openBook', Object.assign({}, ident, { index: 0 })))) return true;
    notifyError(`לא ניתן לפתוח את ${target.label || target.title}`);
    return false;
  }

  window.Otz = { HAS_OTZ, call, notifyError, load, save, boot, resolveBook, openAt };
})();
