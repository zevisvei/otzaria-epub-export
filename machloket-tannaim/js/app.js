// ממשק "מחלוקות התנאים": לפי סדר המשנה, דברי כל תנא, ובין תנא לחבירו.
(function () {
  'use strict';

  const C = window.Core;
  const O = window.Otz;
  const I = C.buildIndex(window.MACHLOKET_DATA);
  const TANNAIM = C.tannaim(I);
  const $ = (sel) => document.querySelector(sel);
  const main = $('#main');
  const VERSION = '1.0.0';

  const nameId = (name) => I.names.indexOf(name);
  const state = {
    view: 'seder', seder: 'זרעים', mas: 0, tanna: nameId('רבי אליעזר'),
    pairA: nameId('רבי מאיר'), pairB: nameId('רבי יהודה'), query: '', showAll: false,
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const persist = () => O.save('ui', {
    view: state.view, seder: state.seder, mas: state.mas, tanna: state.tanna, pairA: state.pairA, pairB: state.pairB,
  }, 'machloket');

  const times = (n) => (n === 1 ? 'מקום אחד' : `${n} מקומות`);
  const inTimes = (n) => (n === 1 ? 'במקום אחד' : `ב-${n} מקומות`);

  // ══════════════════════════════════════════════════════════════════════
  // כרטיס מחלוקת
  // ══════════════════════════════════════════════════════════════════════
  function card(a, opts = {}) {
    const mas = I.masechtot[a.mas];
    const where = opts.withMasechet ? `${mas.name} ${C.locText(a)}` : C.locText(a);
    return `<div class="mach">
      <div class="mach-head">
        <button class="link" data-act="open" data-arg="${a.id}" title="עיון ב${esc(mas.title)}">${esc(where)}</button>
        ${a.decided ? '' : '<span class="tag">לא נפסקה הלכה</span>'}
      </div>
      <ul class="positions">${a.positions.map((p) => {
        const hl = opts.highlight && p.ids.some((id) => opts.highlight.includes(id)) ? ' me' : '';
        return `<li class="pos${p.halacha ? ' halacha' : ''}${hl}">
          <span class="who">${p.ids.map((id) => `<button class="link plain" data-act="tanna" data-id="${id}">${esc(I.names[id])}</button>`).join(' ו')}</span>
          ${C.STANCE[p.stance] ? `<span class="stance s-${p.stance}">${C.STANCE[p.stance]}</span>` : ''}
          ${p.halacha ? '<span class="tag strong">הלכה כמותו</span>' : ''}
        </li>`;
      }).join('')}</ul>
    </div>`;
  }

  const filterArgs = (list) => list.filter((a) => C.matches(state.query,
    I.masechtot[a.mas].name, ...a.positions.map((p) => C.positionName(I, p))));

  const searchBox = (placeholder) =>
    `<input type="search" class="field grow" id="q" placeholder="${esc(placeholder)}" value="${esc(state.query)}" aria-label="חיפוש" />`;

  // ══════════════════════════════════════════════════════════════════════
  // לפי סדר המשנה
  // ══════════════════════════════════════════════════════════════════════
  function renderSeder() {
    const inSeder = I.masechtot.filter((m) => m.seder === state.seder);
    if (I.masechtot[state.mas].seder !== state.seder) state.mas = inSeder[0].id;
    const mas = I.masechtot[state.mas];
    const chapters = C.chaptersOf(I, state.mas)
      .map((g) => Object.assign({}, g, { args: filterArgs(g.args) }))
      .filter((g) => g.args.length);
    main.innerHTML = `<div class="page">
      <div class="chips sedarim">${C.SEDARIM.map((s) =>
        `<button class="chip" data-act="seder" data-key="${s}" aria-pressed="${s === state.seder}">סדר ${s}</button>`).join('')}</div>
      <div class="chips masechtot">${inSeder.map((m) =>
        `<button class="chip" data-act="mas" data-key="${m.id}" aria-pressed="${m.id === state.mas}">${esc(m.name)}<span class="count">${m.args.length}</span></button>`).join('')}</div>
      <div class="toolbar">
        <h2 class="mas-title">מסכת ${esc(mas.name)}</h2>
        <span class="muted small">${mas.args.length} מחלוקות</span>
        ${searchBox('חיפוש תנא…')}
      </div>
      ${chapters.length ? chapters.map((g) => `<section class="group">
        <h2 class="group-title">פרק ${C.hebNum(g.chapter)} <span class="muted small">(${g.args.length})</span></h2>
        ${g.args.map((a) => card(a)).join('')}
      </section>`).join('') : '<div class="empty">לא נמצאו מחלוקות</div>'}
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // התנאים
  // ══════════════════════════════════════════════════════════════════════
  function renderTannaim() {
    const id = state.tanna;
    const name = I.names[id];
    const s = C.tannaStats(I, id);
    const list = TANNAIM.filter((t) => C.matches(state.query, t.name));
    const parts = [];
    if (s.decided) parts.push(`מתוך ${times(s.decided)} שנפסקה בהם הלכה — הלכה כמותו ב${s.halacha === 1 ? 'אחד' : '-' + s.halacha}`);
    if (s.strict || s.lenient) parts.push(`במחלוקת של חומרא וקולא — החמיר ב-${s.strict} והקל ב-${s.lenient}`);
    if (s.chovah || s.ptor) parts.push(`במחלוקת של חיוב ופטור — חייב ב-${s.chovah} ופטר ב-${s.ptor}`);
    const args = filterArgs(I.byName[id]);
    const shown = state.showAll ? args : args.slice(0, 30);

    main.innerHTML = `<div class="page tannaim-page">
      <aside class="tanna-list">
        ${searchBox('חיפוש תנא…')}
        <div class="tlist">${list.map((t) =>
          `<button class="titem${t.id === id ? ' cur' : ''}" data-act="tanna" data-id="${t.id}">${esc(t.name)}<span class="count">${t.count}</span></button>`).join('')}</div>
      </aside>
      <section class="tanna-main">
        <h2 class="tanna-name">${esc(name)}</h2>
        <p class="intro">נחלק במשנה ${inTimes(s.count)}.${parts.length ? ' ' + parts.join('. ') + '.' : ''}</p>
        ${s.rivals.length ? `<h3 class="sub">חבריו שנחלק עמהם</h3>
        <table class="rivals">
          <thead><tr><th>החולק</th><th>מחלוקות</th><th>הלכה כ${esc(name)}</th><th>הלכה כחבירו</th><th></th></tr></thead>
          <tbody>${s.rivals.slice(0, 20).map((r) => `<tr>
            <td><button class="link plain" data-act="tanna" data-id="${r.id}">${esc(r.name)}</button></td>
            <td>${r.count}</td><td>${r.mine}</td><td>${r.theirs}</td>
            <td><button class="btn" data-act="pair" data-a="${id}" data-b="${r.id}">מחלוקותיהם</button></td>
          </tr>`).join('')}</tbody>
        </table>` : ''}
        <h3 class="sub">מקומות שנחלק בהם <span class="muted small">(${args.length})</span></h3>
        ${shown.map((a) => card(a, { withMasechet: true, highlight: [id] })).join('')}
        ${args.length > shown.length ? `<button class="btn more" data-act="showAll">הצגת כל ${args.length} המחלוקות</button>` : ''}
      </section>
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // בין תנא לחבירו
  // ══════════════════════════════════════════════════════════════════════
  function renderPair() {
    const a = state.pairA, b = state.pairB;
    const sel = (key, val) => `<select class="field" id="${key}">${TANNAIM.map((t) =>
      `<option value="${t.id}"${t.id === val ? ' selected' : ''}>${esc(t.name)} (${t.count})</option>`).join('')}</select>`;
    let body;
    if (a === b) {
      body = '<div class="empty">יש לבחור שני תנאים שונים</div>';
    } else {
      const r = C.between(I, a, b);
      const na = I.names[a], nb = I.names[b];
      const lines = [`${na} ו${nb} נחלקו במשנה ${inTimes(r.list.length)}.`];
      if (r.forA || r.forB) lines.push(`פסק הרמב״ם כ${na} ב-${r.forA}, וכ${nb} ב-${r.forB}.`);
      if (r.strictA || r.strictB) lines.push(`${na} החמיר ב-${r.strictA}, ו${nb} החמיר ב-${r.strictB}.`);
      body = `
        ${r.rule ? `<p class="rule">„${esc(r.rule.text)}” <span class="muted">(${esc(r.rule.src)})</span></p>` : ''}
        <p class="intro">${esc(lines.join(' '))}</p>
        ${r.list.length ? filterArgs(r.list).map((x) => card(x, { withMasechet: true, highlight: [a, b] })).join('') : '<div class="empty">לא נמצאו מחלוקות ביניהם</div>'}`;
    }
    main.innerHTML = `<div class="page">
      <div class="toolbar">
        <label>בין ${sel('pairA', a)}</label>
        <label>ובין ${sel('pairB', b)}</label>
        <button class="btn" data-act="swap" title="החלפה">⇄</button>
      </div>
      <div class="chips rules">${C.RULES.map((r) =>
        `<button class="chip" data-act="rule" data-a="${nameId(r.a)}" data-b="${nameId(r.b)}">${esc(r.a)} ו${esc(r.b)}</button>`).join('')}</div>
      ${body}
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ניווט ופעולות
  // ══════════════════════════════════════════════════════════════════════
  function render(keepFocus) {
    for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.view === state.view));
    const caret = keepFocus && document.activeElement && document.activeElement.id === 'q' ? document.activeElement.selectionStart : null;
    if (state.view === 'tannaim') renderTannaim();
    else if (state.view === 'pair') renderPair();
    else renderSeder();
    if (caret != null) { const q = $('#q'); q.focus(); q.setSelectionRange(caret, caret); }
  }

  function go(patch) {
    Object.assign(state, { query: '', showAll: false }, patch);
    main.scrollTop = 0;
    render();
    persist();
  }

  async function openArg(id) {
    const a = I.args[Number(id)];
    const t = C.openTarget(I, a);
    await O.openAt(t, { flatten: (toc) => toc, locate: (toc) => C.chapterIndex(toc, t.chapter) });
  }

  let qTimer = null;
  function wire() {
    for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => go({ view: t.dataset.view }));
    main.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'seder') go({ seder: b.dataset.key });
      else if (act === 'mas') go({ mas: Number(b.dataset.key) });
      else if (act === 'tanna') go({ view: 'tannaim', tanna: Number(b.dataset.id) });
      else if (act === 'pair' || act === 'rule') go({ view: 'pair', pairA: Number(b.dataset.a), pairB: Number(b.dataset.b) });
      else if (act === 'swap') go({ pairA: state.pairB, pairB: state.pairA });
      else if (act === 'showAll') { state.showAll = true; render(); }
      else if (act === 'open') openArg(b.dataset.arg);
    });
    main.addEventListener('input', (ev) => {
      if (ev.target.id !== 'q') return;
      state.query = ev.target.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => render(true), 200);
    });
    main.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.id === 'pairA' || t.id === 'pairB') go({ [t.id]: Number(t.value) });
    });
    $('#aboutBtn').addEventListener('click', () => {
      $('#aboutVersion').textContent = `גרסה ${VERSION}`;
      $('#aboutDlg').showModal();
    });
  }

  async function start() {
    const saved = await O.load('ui', 'machloket');
    if (saved && typeof saved === 'object') {
      if (['seder', 'tannaim', 'pair'].includes(saved.view)) state.view = saved.view;
      if (C.SEDARIM.includes(saved.seder)) state.seder = saved.seder;
      for (const k of ['mas', 'tanna', 'pairA', 'pairB']) {
        if (Number.isInteger(saved[k]) && saved[k] >= 0 && saved[k] < (k === 'mas' ? I.masechtot.length : I.names.length)) state[k] = saved[k];
      }
    }
    render();
  }

  wire();
  O.boot(start);
})();
