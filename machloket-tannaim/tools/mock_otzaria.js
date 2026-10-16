// מדמה את גשר אוצריא לבדיקות בדפדפן (tools/harness.html). לא נארז בתוסף.
// קריאות הפתיחה נרשמות ב-window.__opened.
(function () {
  const ok = (data) => ({ success: true, data });
  window.__opened = [];
  window.Otzaria = {
    _h: {},
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
    async call(m, p) {
      switch (m) {
        case 'storage.get': return ok(null);
        case 'storage.set': return ok(true);
        case 'library.findBooks': return ok([{ bookId: p.query, title: p.query, bookUid: `id:${p.query}`, type: 'text' }]);
        case 'library.getBookToc': return ok([]);
        case 'reader.openBook':
        case 'reader.openBookAtRef':
          window.__opened.push(Object.assign({ method: m }, p));
          return ok(true);
        default:
          if (m.startsWith('ui.')) { console.log('[ui]', p && p.message); return ok(true); }
          return { success: false, error: { code: 'mock', message: m } };
      }
    },
  };
  document.addEventListener('DOMContentLoaded', () => (window.Otzaria._h['plugin.boot'] || []).forEach((fn) => fn({ app: { version: 'mock' } })));
})();
