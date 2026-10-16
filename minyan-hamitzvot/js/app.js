// ממשק "מניין המצוות": רשימת כל מונה, במה נחלקו שני מונים, וכלל המצוות.
(function () {
  'use strict';

  const C = window.Core;
  const O = window.Otz;
  const I = C.buildIndex(window.MITZVOT_DATA);
  const $ = (sel) => document.querySelector(sel);
  const main = $('#main');
  const VERSION = '1.0.0';

  const state = {
    view: 'moneh', moneh: 'rambam', query: '', filters: {},
    cmpA: 'rambam', cmpB: 'bahag', allFilter: 'machloket', showBoth: false,
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const persist = () => O.save('ui', {
    view: state.view, moneh: state.moneh, cmpA: state.cmpA, cmpB: state.cmpB, allFilter: state.allFilter,
  }, 'minyan');

  // ══════════════════════════════════════════════════════════════════════
  // שורות
  // ══════════════════════════════════════════════════════════════════════
  /** תגי המונים: מלא — מנאה, ריק — לא מנאה. לחיצה עוברת למקומה במניין אותו מונה. */
  function whoBadges(mid, current) {
    const m = I.mitzvot.get(mid);
    return `<span class="who">${C.MONIM.map((mo) => {
      const e = m.by[mo.key] && m.by[mo.key][0];
      if (!e) return `<span class="who-b no" title="לא מנאה ${esc(mo.name)}">${esc(mo.name)}</span>`;
      const cur = mo.key === current ? ' cur' : '';
      return `<button class="who-b yes${cur}" data-act="goto" data-moneh="${mo.key}" data-mid="${mid}" title="${esc(mo.name)}: ${esc(C.entryLabel(e))}">${esc(mo.name)}</button>`;
    }).join('')}</span>`;
  }

  function row(e, opts = {}) {
    const verse = C.verseText(I.books, e.src);
    const tags = C.entryTags(e).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    const target = C.openTarget(I, e);
    return `<div class="row" id="r-${e.moneh}-${e.mid}">
      <span class="num">${esc(C.entryLabel(e))}</span>
      <div class="body">
        <div class="name">${esc(e.title)}</div>
        <div class="meta">
          ${verse ? `<button class="link" data-act="verse" data-moneh="${e.moneh}" data-mid="${e.mid}" title="פתיחת הפסוק">${esc(verse)}</button>` : ''}
          ${tags}
          ${opts.who === false ? '' : whoBadges(e.mid, e.moneh)}
        </div>
      </div>
      ${target ? `<button class="btn" data-act="open" data-moneh="${e.moneh}" data-mid="${e.mid}" title="${esc(target.label)}">עיין במקומו</button>` : ''}
    </div>`;
  }

  const entryOf = (moneh, mid) => {
    const m = I.mitzvot.get(Number(mid));
    return m && m.by[moneh] && m.by[moneh][0];
  };

  const searchBox = (placeholder) =>
    `<input type="search" class="field grow" id="q" placeholder="${esc(placeholder)}" value="${esc(state.query)}" aria-label="חיפוש" />`;

  // ══════════════════════════════════════════════════════════════════════
  // לפי המונה
  // ══════════════════════════════════════════════════════════════════════
  function renderMoneh() {
    const mo = C.MONEH[state.moneh];
    const filters = C.filtersOf(state.moneh);
    const active = filters.filter((f) => state.filters[f.id]);
    const pass = (e) => active.every((f) => f.test(e, state.filters[f.id]))
      && C.matches(state.query, e.title, I.mitzvot.get(e.mid).name, C.entryLabel(e), C.verseText(I.books, e.src));
    const groups = C.groupsOf(I, state.moneh)
      .map((g) => Object.assign({}, g, { items: g.items.filter(pass) }))
      .filter((g) => g.items.length);
    const total = groups.reduce((s, g) => s + g.items.length, 0);

    main.innerHTML = `<div class="page">
      <div class="chips monim">${C.MONIM.map((m) =>
        `<button class="chip" data-act="moneh" data-key="${m.key}" aria-pressed="${m.key === state.moneh}">${esc(m.name)}</button>`).join('')}</div>
      <p class="intro">${esc(mo.about)}</p>
      <div class="toolbar">
        ${searchBox(`חיפוש במניין ${mo.name}…`)}
        ${filters.map((f) => `<label>${esc(f.label)}
          <select class="field" data-filter="${f.id}">
            <option value="">הכל</option>
            ${f.options.map((o) => `<option value="${esc(o.value)}"${state.filters[f.id] === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select></label>`).join('')}
        <span class="muted small">${total === I.lists[state.moneh].length ? `${C.hebNumG(total)} מצוות` : `נמצאו ${total}`}</span>
      </div>
      ${groups.length ? groups.map((g) => `<section class="group">
        <h2 class="group-title">${esc(g.title)} <span class="muted small">(${g.items.length})</span></h2>
        ${g.items.map((e) => row(e)).join('')}
      </section>`).join('') : '<div class="empty">לא נמצאו מצוות</div>'}
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // במה נחלקו
  // ══════════════════════════════════════════════════════════════════════
  function renderCompare() {
    const a = C.MONEH[state.cmpA], b = C.MONEH[state.cmpB];
    const sel = (id, val) => `<select class="field" id="${id}">${C.MONIM.map((m) =>
      `<option value="${m.key}"${m.key === val ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`;
    let body;
    if (state.cmpA === state.cmpB) {
      body = '<div class="empty">יש לבחור שני מונים שונים</div>';
    } else {
      const r = C.compare(I, state.cmpA, state.cmpB);
      const f = (list) => list.filter((e) => C.matches(state.query, e.title, I.mitzvot.get(e.mid).name));
      const col = (title, list, cls) => `<section class="group ${cls}">
        <h2 class="group-title">${esc(title)} <span class="muted small">(${list.length})</span></h2>
        ${list.length ? list.map((e) => row(e)).join('') : '<div class="empty small">אין</div>'}
      </section>`;
      const onlyA = f(r.onlyA), onlyB = f(r.onlyB), both = f(r.both);
      body = `
        <p class="intro">${esc(a.name)} ו${esc(b.name)} מודים ב-${r.both.length} מצוות. ${esc(a.name)} מנה ${r.onlyA.length} שלא מנה ${esc(b.name)}, ו${esc(b.name)} מנה ${r.onlyB.length} שלא מנה ${esc(a.name)}.</p>
        ${col(`מנאן ${a.name} ולא ${b.name}`, onlyA, 'only')}
        ${col(`מנאן ${b.name} ולא ${a.name}`, onlyB, 'only')}
        <section class="group">
          <button class="btn" data-act="toggleBoth">${state.showBoth ? 'הסתרת' : 'הצגת'} המצוות ששניהם מודים בהן (${both.length})</button>
          ${state.showBoth ? both.map((e) => row(e)).join('') : ''}
        </section>`;
    }
    main.innerHTML = `<div class="page">
      <div class="toolbar">
        <label>בין ${sel('cmpA', state.cmpA)}</label>
        <label>ובין ${sel('cmpB', state.cmpB)}</label>
        <button class="btn" data-act="swap" title="החלפה">⇄</button>
        ${searchBox('חיפוש מצוה…')}
      </div>
      ${body}
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // כלל המצוות
  // ══════════════════════════════════════════════════════════════════════
  function renderAll() {
    const FILTERS = [['machloket', 'שנויות במחלוקת'], ['agreed', 'שהכל מודים בהן'], ['all', 'כולן']];
    const list = C.allMitzvot(I, state.allFilter)
      .filter((m) => C.matches(state.query, m.name, ...Object.values(m.by).flat().map((e) => e.title)));
    const shown = list.slice(0, 400);
    main.innerHTML = `<div class="page">
      <p class="intro">כל המצוות שנמנו באחד המניינים לפחות. כנגד כל מצוה מסומנים המונים שמנאוה; לחיצה על שם המונה מביאה למקומה במניינו.</p>
      <div class="toolbar">
        <div class="chips">${FILTERS.map(([k, l]) =>
          `<button class="chip" data-act="allFilter" data-key="${k}" aria-pressed="${k === state.allFilter}">${esc(l)}</button>`).join('')}</div>
        ${searchBox('חיפוש מצוה…')}
        <span class="muted small">${list.length} מצוות</span>
      </div>
      ${shown.length ? shown.map((m) => {
        const e = Object.values(m.by)[0][0];
        const verse = C.verseText(I.books, (m.by.rambam || m.by.ramban || m.by.chinuch || m.by.semag || [{}])[0].src);
        return `<div class="row">
          <span class="num">${esc(C.kindName(m.kind))}</span>
          <div class="body">
            <div class="name">${esc(m.name)}</div>
            <div class="meta">
              ${verse ? `<button class="link" data-act="verse" data-moneh="${e.moneh}" data-mid="${m.id}">${esc(verse)}</button>` : ''}
              ${whoBadges(m.id, null)}
            </div>
          </div>
        </div>`;
      }).join('') : '<div class="empty">לא נמצאו מצוות</div>'}
      ${list.length > shown.length ? `<div class="empty small">מוצגות ${shown.length} הראשונות — יש לצמצם בחיפוש</div>` : ''}
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ניווט ופעולות
  // ══════════════════════════════════════════════════════════════════════
  function render(keepFocus) {
    for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.view === state.view));
    const caret = keepFocus && document.activeElement && document.activeElement.id === 'q' ? document.activeElement.selectionStart : null;
    if (state.view === 'compare') renderCompare();
    else if (state.view === 'all') renderAll();
    else renderMoneh();
    if (caret != null) { const q = $('#q'); q.focus(); q.setSelectionRange(caret, caret); }
  }

  function setView(view) {
    state.view = view;
    state.query = '';
    main.scrollTop = 0;
    render();
    persist();
  }

  function gotoEntry(moneh, mid) {
    state.view = 'moneh';
    state.moneh = moneh;
    state.query = '';
    state.filters = {};
    render();
    persist();
    const el = document.getElementById(`r-${moneh}-${mid}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    }
  }

  async function openEntry(moneh, mid) {
    const e = entryOf(moneh, mid);
    const t = e && C.openTarget(I, e);
    if (!t) return;
    await O.openAt(t, { flatten: C.flattenToc, locate: (flat) => C.findInToc(flat, t) });
  }

  async function openVerse(moneh, mid) {
    const e = entryOf(moneh, mid);
    const t = e && C.verseTarget(I.books, e.src);
    if (!t) return;
    await O.openAt(t, {
      flatten: C.flattenToc,
      locate: (flat) => {
        const h = flat.find((x) => { const p = C.parseNumbered(x.text); return p && p.prefix === 'פרק' && p.num === t.chapter; });
        return h ? h.index : null;
      },
    });
  }

  let qTimer = null;
  function wire() {
    for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => setView(t.dataset.view));
    main.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'moneh') { state.moneh = b.dataset.key; state.filters = {}; state.query = ''; render(); persist(); }
      else if (act === 'goto') gotoEntry(b.dataset.moneh, b.dataset.mid);
      else if (act === 'open') openEntry(b.dataset.moneh, b.dataset.mid);
      else if (act === 'verse') openVerse(b.dataset.moneh, b.dataset.mid);
      else if (act === 'allFilter') { state.allFilter = b.dataset.key; render(); persist(); }
      else if (act === 'toggleBoth') { state.showBoth = !state.showBoth; render(); }
      else if (act === 'swap') { [state.cmpA, state.cmpB] = [state.cmpB, state.cmpA]; render(); persist(); }
    });
    main.addEventListener('input', (ev) => {
      if (ev.target.id !== 'q') return;
      state.query = ev.target.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => render(true), 200);
    });
    main.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.filter) { state.filters[t.dataset.filter] = t.value; render(); }
      else if (t.id === 'cmpA' || t.id === 'cmpB') { state[t.id] = t.value; render(); persist(); }
    });
    $('#aboutBtn').addEventListener('click', () => {
      $('#aboutVersion').textContent = `גרסה ${VERSION}`;
      $('#aboutDlg').showModal();
    });
  }

  async function start() {
    const saved = await O.load('ui', 'minyan');
    if (saved && typeof saved === 'object') {
      for (const k of ['view', 'moneh', 'cmpA', 'cmpB', 'allFilter']) {
        if (typeof saved[k] === 'string') state[k] = saved[k];
      }
      if (!C.MONEH[state.moneh]) state.moneh = 'rambam';
    }
    render();
  }

  wire();
  O.boot(start);
})();
