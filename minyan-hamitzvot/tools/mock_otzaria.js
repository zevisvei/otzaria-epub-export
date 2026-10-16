// מדמה את גשר אוצריא לבדיקות בדפדפן (tools/harness.html). לא נארז בתוסף.
// תוכן העניינים נלקח מ-tools/fixtures/tocs.json; קריאות הפתיחה נרשמות ב-window.__opened.
(function () {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'fixtures/tocs.json', false);
  xhr.send();
  const tocs = xhr.status === 200 ? JSON.parse(xhr.responseText) : {};
  const norm = (s) => String(s || '').replace(/["״'׳]/g, '');
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
        case 'library.getBookToc': {
          const k = Object.keys(tocs).find((t) => norm(t) === norm(p.bookId || String(p.bookUid).slice(3)));
          return ok(k ? tocs[k] : []);
        }
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
