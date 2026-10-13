// פורמטים נוספים מאותו מודל שורה של core.js: DOCX (Word) ו-FB2.
// שני הפורמטים מקבלים את אותו spec של buildEpub ומחזירים קבצים לאריזה (DOCX) או מחרוזת XML (FB2).
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.EpubCore;
  const { escapeXml, stripTags, hebNum, joinNames, rightsFacts, sourceList, completeMeta, formatDateHe } = C;

  // ══════════════════════════════════════════════════════════════════════
  // HTML שורתי (הפלט של sanitizeInline) ← רצפים מעוצבים
  // ══════════════════════════════════════════════════════════════════════

  const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unescapeXml = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m, e) => XML_ENT[e]);

  /**
   * מפרק HTML נקי (תגי העיצוב המוגבלים של sanitizeInline) לרצף:
   * { type: 'text', text, f: {b,i,u,s,small,big,sup,sub} } | { type: 'br' } | { type: 'note', k }
   */
  function inlineRuns(html) {
    const out = [];
    const stack = [];
    const fmt = () => {
      const f = {};
      for (const t of stack) {
        if (t === 'b' || t === 'strong') f.b = true;
        else if (t === 'i' || t === 'em' || t === 'cite') f.i = true;
        else if (t === 'u') f.u = true;
        else if (t === 's') f.s = true;
        else if (t === 'small') f.small = true;
        else if (t === 'span.big') f.big = true;
        else if (t === 'sup') f.sup = true;
        else if (t === 'sub') f.sub = true;
      }
      return f;
    };
    const re = /<(\/?)([a-z]+)(?:\s+class="([a-z-]+)")?\s*(\/?)>|(\d+)|[^<]+/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[5] !== undefined) { out.push({ type: 'note', k: Number(m[5]) }); continue; }
      if (m[2]) {
        const name = m[2] === 'span' && m[3] === 'big' ? 'span.big' : m[2];
        if (name === 'br') { out.push({ type: 'br' }); continue; }
        if (m[1]) { const at = stack.lastIndexOf(name); if (at >= 0) stack.splice(at, 1); else if (name === 'span') stack.splice(stack.lastIndexOf('span.big'), 1); }
        else if (!m[4]) stack.push(name);
        continue;
      }
      const text = unescapeXml(m[0]);
      if (text) out.push({ type: 'text', text, f: fmt() });
    }
    return out;
  }

  /** מעבר על כל מודלי השורות של הספר (כולל איחוד פסוקים במצב רציף) עם ערכי תוכן העניינים. */
  function forEachLine(book, opts, fn) {
    for (const m of C.bookModels(book, opts)) fn(m, m.entries);
  }

  function splitLevelOf(book) {
    const levels = book.toc.map((e) => e.level);
    const minLevel = levels.length ? Math.min(...levels) : 1;
    return levels.filter((l) => l === minLevel).length <= 1 ? minLevel + 1 : minLevel;
  }

  // ══════════════════════════════════════════════════════════════════════
  // DOCX (Office Open XML, ECMA-376)
  // ══════════════════════════════════════════════════════════════════════

  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const BASE_SZ = 24; // חצאי נקודה = 12pt
  const RASHI_FONT = 'Noto Rashi Hebrew';
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const wt = (text) => `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`;

  // סדר האלמנטים ב-rPr מחייב לפי הסכמה (CT_RPr)
  function rPr(f, extra) {
    const x = extra || {};
    let s = '';
    if (x.style) s += `<w:rStyle w:val="${x.style}"/>`;
    if (x.font) s += `<w:rFonts w:ascii="${escapeXml(x.font)}" w:hAnsi="${escapeXml(x.font)}" w:cs="${escapeXml(x.font)}"/>`;
    if (f.b) s += '<w:b/><w:bCs/>';
    if (f.i) s += '<w:i/><w:iCs/>';
    if (f.s) s += '<w:strike/>';
    if (f.small || f.big) {
      const sz = f.small ? Math.round(BASE_SZ * 0.85) : Math.round(BASE_SZ * 1.15);
      s += `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
    }
    if (f.u) s += '<w:u w:val="single"/>';
    if (f.sup) s += '<w:vertAlign w:val="superscript"/>';
    else if (f.sub) s += '<w:vertAlign w:val="subscript"/>';
    s += '<w:rtl/>';
    return `<w:rPr>${s}</w:rPr>`;
  }

  function runsXml(runs, noteXml, font) {
    return runs.map((r) => {
      if (r.type === 'br') return '<w:r><w:br/></w:r>';
      if (r.type === 'note') return noteXml ? noteXml(r.k) : '';
      return `<w:r>${rPr(r.f, { font })}${wt(r.text)}</w:r>`;
    }).join('');
  }

  // סדר האלמנטים ב-pPr (CT_PPr): pStyle, keepNext, ..., pageBreakBefore, ..., bidi, ..., jc
  function para(content, o) {
    const x = o || {};
    let p = '';
    if (x.style) p += `<w:pStyle w:val="${x.style}"/>`;
    if (x.pageBreakBefore) p += '<w:pageBreakBefore/>';
    p += '<w:bidi/>';
    if (x.jc) p += `<w:jc w:val="${x.jc}"/>`;
    return `<w:p><w:pPr>${p}</w:pPr>${content}</w:p>`;
  }
  const textPara = (text, o, f) => para(text ? `<w:r>${rPr(f || {})}${wt(text)}</w:r>` : '', o);

  function hyperlinkRun(text, url, rels) {
    if (!url) return `<w:r>${rPr({})}${wt(text)}</w:r>`;
    const id = rels.add('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', url, true);
    return `<w:hyperlink r:id="${id}"><w:r>${rPr({}, { style: 'Hyperlink' })}${wt(text)}</w:r></w:hyperlink>`;
  }

  function relsBuilder(prefixed) {
    const list = [...(prefixed || [])];
    return {
      add(type, target, external) {
        const id = `rId${list.length + 1}`;
        list.push({ id, type, target, external });
        return id;
      },
      xml() {
        return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
          + list.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escapeXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')
          + '</Relationships>';
      },
    };
  }

  function stylesXml(opts, bodyFont) {
    const font = bodyFont || 'David';
    const rFonts = `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>`;
    const heading = (n, sz) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>`
      + `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 480 : 300}" w:after="160"/><w:jc w:val="center"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>`
      + `<w:rPr><w:b/><w:bCs/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
    const noteFont = opts.notesFont === 'rashi' ? '' : '';
    return `${XML_HEAD}<w:styles xmlns:w="${W_NS}">`
      + `<w:docDefaults><w:rPrDefault><w:rPr>${rFonts}<w:sz w:val="${BASE_SZ}"/><w:szCs w:val="${BASE_SZ}"/><w:lang w:val="he-IL" w:bidi="he-IL"/></w:rPr></w:rPrDefault>`
      + '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
      + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:bidi/><w:jc w:val="both"/></w:pPr><w:rPr><w:rtl/></w:rPr></w:style>`
      + heading(1, 40) + heading(2, 34) + heading(3, 30) + heading(4, 27) + heading(5, 25) + heading(6, 24)
      + `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="1200" w:after="400"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="64"/><w:szCs w:val="64"/></w:rPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="Centered"><w:name w:val="Centered"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="Commentary"><w:name w:val="Commentary"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60" w:line="260" w:lineRule="auto"/><w:ind w:start="360"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>${noteFont}<w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="EndnoteText"><w:name w:val="endnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>`
      + '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:b/><w:bCs/><w:vertAlign w:val="superscript"/></w:rPr></w:style>'
      + '<w:style w:type="character" w:styleId="EndnoteReference"><w:name w:val="endnote reference"/><w:rPr><w:b/><w:bCs/><w:vertAlign w:val="superscript"/></w:rPr></w:style>'
      + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:start="240"/></w:pPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="TOC3"><w:name w:val="toc 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:start="480"/></w:pPr></w:style>'
      + '</w:styles>';
  }

  /**
   * בונה מסמך Word. מצבי ההערות:
   *  popup / chapter — הערות שוליים של Word (בתחתית העמוד), מספור עברי;
   *  endnotes — הערות סיום של Word; line — פסקאות פירוש מתחת לכל קטע.
   * הערה מעוגנת עם אות מקור — סימן מותאם (customMarkFollows) עם האות.
   * מחזיר [{ path, data }] לאריזה ב-zip.
   */
  function buildDocx(spec) {
    const opts = spec.options || {};
    const meta = completeMeta(spec);
    const multi = spec.books.length > 1;
    const mode = opts.notesMode === 'line' ? 'line' : opts.notesMode === 'endnotes' ? 'endnote' : 'footnote';
    // גופן לכל מפרש (שם משפחה בלבד — Word משתמש בו אם מותקן) וגופן גוף הספר
    const fontOf = (name) => (spec.commentatorFonts && spec.commentatorFonts[name]) || spec.notesFontFamily || null;
    const rels = relsBuilder([
      { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', target: 'styles.xml' },
      { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', target: 'settings.xml' },
      { id: 'rId3', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes', target: 'footnotes.xml' },
      { id: 'rId4', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes', target: 'endnotes.xml' },
    ]);
    const body = [];
    const notes = []; // { id, xml }
    let noteId = 0;
    const pageBreak = '<w:r><w:br w:type="page"/></w:r>';

    // ── שער ──
    if (opts.titlePage !== false) {
      body.push(textPara(meta.title, { style: 'Title' }));
      if (meta.subtitle) body.push(textPara(meta.subtitle, { style: 'Subtitle' }));
      if (meta.creators && meta.creators.length) body.push(textPara(joinNames(meta.creators), { style: 'Subtitle' }));
      if (multi) for (const b of spec.books) body.push(textPara(b.rangeLabel ? `${b.title} (${b.rangeLabel})` : b.title, { style: 'Centered' }));
      if (spec.commentatorNames && spec.commentatorNames.length) body.push(textPara(`עם ${joinNames(spec.commentatorNames)}`, { style: 'Centered' }));
      const src = sourceList(spec);
      body.push(para(`<w:r>${rPr({})}${wt('מקור הטקסט: ')}</w:r>`
        + src.map((r, i) => (i ? `<w:r>${rPr({})}${wt(' · ')}</w:r>` : '') + hyperlinkRun(r.sourceName, r.sourceUrl, rels)).join(''), { style: 'Centered' }));
      body.push(para(`<w:r>${rPr({})}${wt('הופק מספריית ')}</w:r>${hyperlinkRun('אוצריא', 'https://otzaria.org', rels)}`, { style: 'Centered' }));
      if (spec.books.some((b) => b.rights.personal)) body.push(textPara('לשימוש אישי בלבד', { style: 'Centered' }, { b: true }));
    }
    // ── פרטים וזכויות ──
    if (opts.rightsPage !== false) {
      const facts = rightsFacts(spec);
      body.push(para(`${body.length ? pageBreak : ''}<w:r>${rPr({})}${wt('פרטי הספר וזכויות')}</w:r>`, { style: 'Heading1' }));
      for (const fb of facts.books) {
        body.push(textPara(fb.title, { style: 'Heading3' }));
        for (const row of fb.rows) {
          body.push(para(`<w:r>${rPr({ b: true })}${wt(`${row.label}: `)}</w:r>`
            + row.parts.map((pt) => (pt.url ? hyperlinkRun(pt.text, pt.url, rels) : `<w:r>${rPr({})}${wt(pt.text)}</w:r>`)).join('')));
        }
        if (fb.description) body.push(textPara(fb.description));
      }
      for (const n of facts.notices) body.push(textPara(n, {}, { small: true }));
    }
    // ── תוכן עניינים (שדה TOC; Word מציע לעדכן בפתיחה) ──
    body.push(para(`${body.length ? pageBreak : ''}<w:r>${rPr({})}${wt('תוכן העניינים')}</w:r>`, { style: 'TOCHeading' }));
    body.push(para('<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
      + '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>'
      + '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
      + `<w:r>${rPr({})}${wt('לעדכון תוכן העניינים: לחיצה ימנית ← עדכן שדה (F9)')}</w:r>`
      + '<w:r><w:fldChar w:fldCharType="end"/></w:r>'));

    // ── הספרים ──
    spec.books.forEach((book, bIdx) => {
      const shift = multi ? 1 : 0;
      const split = splitLevelOf(book);
      if (multi) body.push(para(`<w:r>${rPr({})}${wt(book.title)}</w:r>`, { style: 'Heading1', pageBreakBefore: true }));
      let first = !multi;
      const counters = {};
      forEachLine(book, opts, (m, entries) => {
        const runs = inlineRuns(m.html);
        const noteXml = (k) => {
          const n = m.notes[k];
          if (!n) return '';
          if (mode === 'line') {
            return n.letter ? `<w:r>${rPr({ b: true, sup: true })}${wt(C.noteMarker(n, {}, opts).text)}</w:r>` : '';
          }
          noteId++;
          const ref = mode === 'footnote' ? 'footnoteReference' : 'endnoteReference';
          const refStyle = mode === 'footnote' ? 'FootnoteReference' : 'EndnoteReference';
          const textStyle = mode === 'footnote' ? 'FootnoteText' : 'EndnoteText';
          // סימן מותאם (אות מקור, או מונה נפרד לכל מפרש); אחרת — המספור העברי האוטומטי של Word
          const custom = n.letter || opts.markPerCommentator;
          const mk = custom ? C.noteMarker(n, counters, opts) : null;
          const v = mk && mk.variant != null ? C.MARK_VARIANTS[mk.variant] : {};
          const mkF = { b: !!v.b, i: !!v.i, u: !!v.u };
          const mkFont = v.r ? RASHI_FONT : null;
          const markRun = custom
            ? `<w:r>${rPr(mkF, { style: refStyle, font: mkFont })}${wt(mk.text)}</w:r>`
            : `<w:r>${rPr({}, { style: refStyle })}<w:${mode === 'footnote' ? 'footnoteRef' : 'endnoteRef'}/></w:r>`;
          const font = fontOf(n.commentator);
          const content = inlineRuns(n.text);
          notes.push({
            id: noteId,
            xml: `<w:${mode} w:id="${noteId}">`
              + para(`${markRun}<w:r>${rPr({})}${wt(' ')}</w:r><w:r>${rPr({ b: true }, { font })}${wt(`${n.commentator}: `)}</w:r>${runsXml(content, null, font)}`, { style: textStyle })
              + `</w:${mode}>`,
          });
          return custom
            ? `<w:r>${rPr({}, { style: refStyle })}<w:${ref} w:customMarkFollows="1" w:id="${noteId}"/></w:r><w:r>${rPr(mkF, { style: refStyle, font: mkFont })}${wt(mk.text)}</w:r>`
            : `<w:r>${rPr({}, { style: refStyle })}<w:${ref} w:id="${noteId}"/></w:r>`;
        };
        const content = runsXml(runs, noteXml);
        if (m.kind === 'heading' || entries) {
          const level = Math.min(6, (m.kind === 'heading' ? m.level : entries[0].level) + shift);
          const text = content || `<w:r>${rPr({})}${wt(stripTags(entries ? entries[0].text : ''))}</w:r>`;
          const pb = !first && entries && entries.some((e) => e.level <= split);
          if (m.kind === 'heading') { body.push(para(text, { style: `Heading${level}`, pageBreakBefore: pb })); first = false; }
          else body.push(para(content, { pageBreakBefore: pb }));
        } else if (content) {
          body.push(para(content));
        }
        if (mode === 'line') {
          for (const n of m.notes) {
            const font = fontOf(n.commentator);
            body.push(para((n.letter ? `<w:r>${rPr({ b: true })}${wt(`${C.noteMarker(n, {}, opts).text} `)}</w:r>` : '')
              + `<w:r>${rPr({ b: true }, { font })}${wt(`${n.commentator}: `)}</w:r>${runsXml(inlineRuns(n.text), null, font)}`, { style: 'Commentary' }));
          }
        }
      });
    });

    const sectPr = '<w:sectPr>'
      + '<w:footnotePr><w:numFmt w:val="hebrew1"/></w:footnotePr><w:endnotePr><w:numFmt w:val="hebrew1"/></w:endnotePr>'
      + '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/>'
      + '<w:bidi/></w:sectPr>';
    const documentXml = `${XML_HEAD}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${body.join('')}${sectPr}</w:body></w:document>`;

    const sep = (tag) => `<w:${tag} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:${tag}>`
      + `<w:${tag} w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:${tag}>`;
    const fn = notes.filter(() => mode === 'footnote').map((n) => n.xml).join('');
    const en = notes.filter(() => mode === 'endnote').map((n) => n.xml).join('');
    const footnotesXml = `${XML_HEAD}<w:footnotes xmlns:w="${W_NS}" xmlns:r="${R_NS}">${sep('footnote')}${fn}</w:footnotes>`;
    const endnotesXml = `${XML_HEAD}<w:endnotes xmlns:w="${W_NS}" xmlns:r="${R_NS}">${sep('endnote')}${en}</w:endnotes>`;
    const settingsXml = `${XML_HEAD}<w:settings xmlns:w="${W_NS}">`
      + '<w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>'
      + '<w:footnotePr><w:numFmt w:val="hebrew1"/><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>'
      + '<w:endnotePr><w:numFmt w:val="hebrew1"/><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>'
      + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
      + '</w:settings>';

    const iso = meta.date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const coreXml = `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
      + `<dc:title>${escapeXml(meta.title)}</dc:title>`
      + (meta.subtitle ? `<dc:subject>${escapeXml(meta.subtitle)}</dc:subject>` : '')
      + `<dc:creator>${escapeXml(joinNames(meta.creators) || 'אוצריא')}</dc:creator>`
      + `<cp:keywords>${escapeXml((meta.subjects || []).join(', '))}</cp:keywords>`
      + `<dc:description>${escapeXml([meta.description, `זכויות: ${meta.rights}`].filter(Boolean).join('\n'))}</dc:description>`
      + `<dc:identifier>${escapeXml(meta.identifier)}</dc:identifier>`
      + '<dc:language>he-IL</dc:language>'
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>`
      + '</cp:coreProperties>';
    const customProps = [['Rights', meta.rights], ['Source', (meta.sources || []).join(' | ')], ['Generator', `Otzaria EPUB Export ${meta.generatorVersion || ''}`.trim()]];
    const customXml = `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">`
      + customProps.map(([k, v], i) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${k}"><vt:lpwstr>${escapeXml(v || '')}</vt:lpwstr></property>`).join('')
      + '</Properties>';
    const appXml = `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Otzaria EPUB Export</Application></Properties>`;
    const contentTypes = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
      + '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'
      + '<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>'
      + '</Types>';
    const rootRels = `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>'
      + '</Relationships>';

    return [
      { path: '[Content_Types].xml', data: contentTypes },
      { path: '_rels/.rels', data: rootRels },
      { path: 'docProps/core.xml', data: coreXml },
      { path: 'docProps/app.xml', data: appXml },
      { path: 'docProps/custom.xml', data: customXml },
      { path: 'word/document.xml', data: documentXml },
      { path: 'word/styles.xml', data: stylesXml(opts, spec.bodyFontFamily) },
      { path: 'word/settings.xml', data: settingsXml },
      { path: 'word/footnotes.xml', data: footnotesXml },
      { path: 'word/endnotes.xml', data: endnotesXml },
      { path: 'word/_rels/document.xml.rels', data: rels.xml() },
    ];
  }

  // ══════════════════════════════════════════════════════════════════════
  // FB2 (FictionBook 2.0)
  // ══════════════════════════════════════════════════════════════════════

  const FB_NS = 'http://www.gribuser.ru/xml/fictionbook/2.0';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';

  function fbInline(runs, noteXml) {
    let out = '';
    for (const r of runs) {
      if (r.type === 'br') { out += ' '; continue; }
      if (r.type === 'note') { out += noteXml ? noteXml(r.k) : ''; continue; }
      let t = escapeXml(r.text);
      if (r.f.sup) t = `<sup>${t}</sup>`;
      else if (r.f.sub) t = `<sub>${t}</sub>`;
      if (r.f.s) t = `<strikethrough>${t}</strikethrough>`;
      if (r.f.i) t = `<emphasis>${t}</emphasis>`;
      if (r.f.b) t = `<strong>${t}</strong>`;
      out += t;
    }
    return out;
  }

  function base64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /**
   * בונה FictionBook 2.0. הערות (בכל מצב פרט ל"מתחת לכל קטע") — <a type="note"> אל
   * <body name="notes">, שהקוראים (KOReader, FBReader, Moon+) מציגים כחלונית.
   * מחזיר מחרוזת XML.
   */
  function buildFb2(spec) {
    const opts = spec.options || {};
    const meta = completeMeta(spec);
    const multi = spec.books.length > 1;
    const inlineNotes = opts.notesMode === 'line';
    const notes = [];
    const counters = {};
    const authorXml = (name) => `<author><nickname>${escapeXml(name)}</nickname></author>`;
    const authors = (meta.creators && meta.creators.length ? meta.creators : ['אוצריא']).map(authorXml).join('');
    const annotation = [meta.description, meta.subtitle].filter(Boolean);

    let bodyXml = '';
    // שער ופרטי זכויות כסעיף ראשון
    if (opts.rightsPage !== false) {
      const facts = rightsFacts(spec);
      let sec = '<section><title><p>פרטי הספר וזכויות</p></title>';
      for (const fb of facts.books) {
        sec += `<subtitle>${escapeXml(fb.title)}</subtitle>`;
        for (const row of fb.rows) {
          sec += `<p><strong>${escapeXml(row.label)}:</strong> ${row.parts.map((pt) => (pt.url ? `<a xlink:href="${escapeXml(pt.url)}">${escapeXml(pt.text)}</a>` : escapeXml(pt.text))).join('')}</p>`;
        }
        if (fb.description) sec += `<p>${escapeXml(fb.description)}</p>`;
      }
      sec += '<empty-line/>' + facts.notices.map((n) => `<p><emphasis>${escapeXml(n)}</emphasis></p>`).join('') + '</section>';
      bodyXml += sec;
    }

    spec.books.forEach((book) => {
      // קינון סעיפים לפי רמות הכותרות; FB2 מחייב title בתחילת section ו-p אחרי subsections אסור
      const stack = []; // { level, hasChildren }
      let out = '';
      const close = (level) => {
        while (stack.length && stack[stack.length - 1].level >= level) { out += '</section>'; stack.pop(); }
      };
      let openText = false; // פסקאות לפני הכותרת הראשונה
      const ensureSection = () => { if (!stack.length) { out += '<section>'; stack.push({ level: 0 }); openText = true; } };
      if (multi) { out += `<section><title><p>${escapeXml(book.title)}</p></title>`; stack.push({ level: -1 }); }
      forEachLine(book, opts, (m, entries) => {
        const noteXml = (k) => {
          const n = m.notes[k];
          if (!n) return '';
          if (inlineNotes) return n.letter ? `<sup>${escapeXml(C.noteMarker(n, {}, opts).text)}</sup>` : '';
          const id = `n${notes.length + 1}`;
          const mk = C.noteMarker(n, counters, opts);
          const v = mk.variant != null ? C.MARK_VARIANTS[mk.variant] : {};
          let mark = escapeXml(mk.text);
          if (v.i) mark = `<emphasis>${mark}</emphasis>`;
          if (v.b) mark = `<strong>${mark}</strong>`;
          notes.push(`<section id="${id}"><title><p>${escapeXml(mk.text)}</p></title><p><strong>${escapeXml(n.commentator)}:</strong> ${fbInline(inlineRuns(n.text))}</p></section>`);
          return `<a xlink:href="#${id}" type="note">${mark}</a>`;
        };
        const text = fbInline(inlineRuns(m.html), noteXml);
        const isHeading = m.kind === 'heading' || entries;
        if (isHeading) {
          const level = m.kind === 'heading' ? m.level : entries[0].level;
          close(level);
          if (openText && stack.length === 1 && stack[0].level === 0) { out += '</section>'; stack.pop(); openText = false; }
          out += `<section><title><p>${text || escapeXml(stripTags(entries ? entries[0].text : ''))}</p></title>`;
          stack.push({ level });
          if (m.kind !== 'heading' && text) out += `<p>${text}</p>`;
        } else if (text) {
          ensureSection();
          out += `<p>${text}</p>`;
        }
        if (inlineNotes && m.notes.length) {
          ensureSection();
          out += `<cite>${m.notes.map((n) => `<p>${n.letter ? `${escapeXml(C.noteMarker(n, {}, opts).text)} ` : ''}<strong>${escapeXml(n.commentator)}:</strong> ${fbInline(inlineRuns(n.text))}</p>`).join('')}</cite>`;
        }
      });
      while (stack.length) { out += '</section>'; stack.pop(); }
      bodyXml += out;
    });

    const date = meta.date.toISOString().slice(0, 10);
    const genre = 'religion';
    const cover = spec.cover ? `<coverpage><image xlink:href="#cover.${spec.cover.type === 'image/png' ? 'png' : 'jpg'}"/></coverpage>` : '';
    const titleInfo = `<title-info><genre>${genre}</genre>${authors}<book-title>${escapeXml(meta.title)}</book-title>`
      + (annotation.length ? `<annotation>${annotation.map((a) => `<p>${escapeXml(a)}</p>`).join('')}</annotation>` : '')
      + (meta.subjects && meta.subjects.length ? `<keywords>${escapeXml(meta.subjects.join(', '))}</keywords>` : '')
      + `<date value="${date}">${date}</date>${cover}<lang>he</lang>`
      + `</title-info>`;
    const docInfo = '<document-info><author><nickname>אוצריא</nickname></author>'
      + `<program-used>Otzaria EPUB Export ${escapeXml(meta.generatorVersion || '')}</program-used>`
      + `<date value="${date}">${date}</date>`
      + (meta.sources || []).filter((s) => /https?:\/\//.test(s)).map((s) => `<src-url>${escapeXml(s.replace(/^.*?(https?:\/\/\S+).*$/, '$1'))}</src-url>`).join('')
      + `<id>${escapeXml(meta.identifier)}</id><version>1.0</version>`
      + `<history><p>${escapeXml(`זכויות: ${meta.rights}`)}</p></history>`
      + '</document-info>';
    const publishInfo = `<publish-info><publisher>אוצריא</publisher><year>${meta.date.getFullYear()}</year></publish-info>`;
    const binaries = spec.cover
      ? `<binary id="cover.${spec.cover.type === 'image/png' ? 'png' : 'jpg'}" content-type="${spec.cover.type}">${base64(spec.cover.data)}</binary>`
      : '';
    const titleBody = opts.titlePage !== false
      ? `<title><p>${escapeXml(meta.title)}</p>${meta.subtitle ? `<p>${escapeXml(meta.subtitle)}</p>` : ''}${meta.creators && meta.creators.length ? `<p>${escapeXml(joinNames(meta.creators))}</p>` : ''}</title>`
        + `<epigraph><p>מקור הטקסט: ${escapeXml(sourceList(spec).map((r) => r.sourceName).join(' · '))}</p><p>הופק מספריית אוצריא · ${escapeXml(formatDateHe(meta.date))}</p></epigraph>`
      : '';
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + `<FictionBook xmlns="${FB_NS}" xmlns:xlink="${XLINK_NS}">`
      + `<description>${titleInfo}${docInfo}${publishInfo}</description>`
      + `<body>${titleBody}${bodyXml || '<section><p/></section>'}</body>`
      + (notes.length ? `<body name="notes"><title><p>הערות</p></title>${notes.join('')}</body>` : '')
      + binaries
      + '</FictionBook>\n';
  }

  const api = { inlineRuns, buildDocx, buildFb2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EpubFormats = api;
})(typeof window !== 'undefined' ? window : globalThis);
