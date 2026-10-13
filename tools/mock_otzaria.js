// מדמה את גשר אוצריא לבדיקות בדפדפן (tools/harness.html). לא נארז בתוסף.
// הקובץ שנשמר נחשף ב-window.__saved (Uint8Array) לבדיקה ב-epubcheck.
(function () {
  const heb = (n) => {
    const O = 'אבגדהוזחט', T = 'יכלמנסעפצ'; let s = '';
    while (n >= 100) { const h = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']].find(([v]) => n >= v); s += h[1]; n -= h[0]; }
    if (n === 15) return s + 'טו'; if (n === 16) return s + 'טז';
    if (n >= 10) { s += T[Math.floor(n / 10) - 1]; n %= 10; } if (n) s += O[n - 1]; return s;
  };
  const books = {};
  function build(title, chapters, verses, source) {
    const lines = [`<h1>${title}</h1>`];
    const toc = [{ text: title, index: 0, level: 1 }];
    for (let c = 1; c <= chapters; c++) {
      toc.push({ text: `פרק ${heb(c)}`, index: lines.length, level: 2 });
      lines.push(`<h2>פרק ${heb(c)}</h2>`);
      for (let v = 1; v <= verses; v++) lines.push(`(${heb(v)}) וַיְדַבֵּ֥ר ה׳ פסוק ${heb(v)} של פרק ${heb(c)} <b>בספר</b> ${title} &amp; <span style="x">עוד</span>`);
    }
    const id = Object.keys(books).length + 1;
    books[title] = { title, text: lines.join('\n'), toc, id, source };
  }
  build('בראשית', 50, 20, { key: 'Sefaria', name: 'ספריא', url: 'https://www.sefaria.org/texts' });
  build('ספר החינוך', 8, 6, { key: 'wikiJewishBooksToOtzaria', name: 'אוצר הספרים היהודי השיתופי', url: 'https://wiki.jewishbooks.org.il/' });
  const byUid = (p) => Object.values(books).find((b) => (p.bookUid && `id:${b.id}` === p.bookUid) || b.title === p.bookId || b.id === p.id);
  const meta = (b) => ({ bookId: b.title, title: b.title, id: b.id, bookUid: `id:${b.id}`, type: 'text', source: 'library', categoryPath: '/תנך/תורה' });
  const ok = (data) => ({ success: true, data });
  const uploads = {};
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    if (String(url).startsWith('mock-upload://')) {
      uploads[url] = new Uint8Array(await init.body.arrayBuffer());
      return new Response(null, { status: 204 });
    }
    return realFetch(url, init);
  };
  window.__calls = [];
  window.Otzaria = {
    _h: {},
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
    async call(m, p) {
      window.__calls.push(m);
      switch (m) {
        case 'storage.get': return ok(null);
        case 'settings.getMany': return ok({
          'key-font-family': 'FrankRuhlCLM', 'key-commentators-font-family': 'NotoRashiHebrew',
          'key-replace-holy-names': true, 'key-holy-name-style': 'kuf', 'key-show-teamim': false,
          'key-default-nikud': false, 'key-default-remove-punctuation': false, 'key-continuous-reading-mode': true,
        });
        case 'fonts.listInstalled': return ok({ platform: 'linux', families: [{ name: 'David', scripts: ['hebrew', 'latin'], monospace: false }] });
        case 'fonts.resolveFamilies':
          // בבדיקה: הבייטים של Noto Rashi תחת השם המבוקש
          return ok({ css: `@font-face{font-family:'${p.families[0].name}';src:url(data:font/ttf;base64,${window.EPUB_FONT_RASHI}) format('truetype');}`, resolved: [p.families[0].name] });
        case 'storage.set': return ok(true);
        case 'library.listRecentBooks': return ok([meta(books['בראשית'])]);
        case 'library.findBooks': return ok(Object.values(books).filter((b) => b.title.includes(p.query)).map(meta));
        case 'library.getBookDetails': {
          const b = byUid(p);
          if (!b) return ok({ title: p.bookId, textSource: { key: 'Sefaria', name: 'ספריא', url: 'https://www.sefaria.org/texts' } });
          return ok({ ...meta(b), authors: ['משה רבנו'], era: 'תורה שבכתב', categories: 'תנ"ך', categoryPath: '/תנ"ך/תורה',
            shortDescription: 'ספר <b>בראשית</b>', publicationDates: [], publicationPlaces: [], topics: ['תורה'],
            textSource: b.source, lineCount: b.text.split('\n').length });
        }
        case 'library.getBookToc': return ok(byUid(p).toc);
        case 'library.getBookContent': {
          const t = byUid(p).text; const o = p.offset || 0;
          return ok(t.substring(o, o + Math.min(5000, p.limit || 1000)));
        }
        case 'library.getCommentators': {
          const list = [{ title: `רש"י על ${p.bookId}`, linkCount: 900 }, { title: `אבן עזרא על ${p.bookId}`, linkCount: 400 }, { title: 'שער הציון', linkCount: 300 }];
          return ok(p.grouped ? { groups: [{ title: 'ראשונים', commentators: list.map((c) => c.title) }] } : { commentators: list });
        }
        case 'library.getLinks': {
          const links = [];
          for (let l = p.startLine; l <= p.endLine; l++) {
            if (l % 4 !== 2) continue;
            for (const t of p.targetTitles) {
              const link = { sourceLine: l, targetTitle: t, targetLine: l * 2, targetLineEnd: null, targetIsUserBook: false, targetCategoryId: 3, targetHeRef: `${t} א, ${heb(l % 20 + 1)}` };
              // שער הציון: עוגן-אות בתוך השורה, כמו על המשנה ברורה
              if (t === 'שער הציון' && p.includeAnchors) link.anchor = { start: 14, end: null, label: null };
              links.push(link);
            }
          }
          return ok({ truncated: false, links });
        }
        case 'library.getLinkContent':
          return ok({ items: p.links.map((l) => ({ content: `<b>דיבור המתחיל.</b> פירוש ${l.targetTitle.split(' על ')[0]} לשורה ${l.targetLine / 2} &amp; עוד` })) });
        case 'fs.beginBinaryWrite': {
          const tok = `w${Object.keys(uploads).length + 1}`;
          return ok({ writeToken: tok, uploadUrl: `mock-upload://${tok}`, maxBytes: 100 << 20 });
        }
        case 'fs.commitUserFileWrite':
          window.__saved = uploads[`mock-upload://${p.writeToken}`];
          window.__savedName = `${p.suggestedName}.${p.extension}`;
          return ok({ cancelled: false, token: 't', name: window.__savedName, size: window.__saved.length });
        default: return ok(true);
      }
    },
  };
  window.addEventListener('load', () => {
    setTimeout(() => (window.Otzaria._h['plugin.boot'] || []).forEach((f) => f({
      plugin: { id: 'x', version: '1.0.0' }, app: { platform: 'linux', version: '0.9.99' },
    })), 30);
  });
})();
