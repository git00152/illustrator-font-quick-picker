'use strict';
// Font Quick Picker - panel UI
(function () {
  const fsp = require('fs').promises;
  const path = require('path');

  function extRoot() {
    let p = window.__adobe_cep__.getSystemPath('extension');
    p = decodeURI(p.replace(/^file:\/\//, ''));
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return p;
  }
  const ROOT = extRoot();
  const indexer = require(path.join(ROOT, 'js', 'indexer.js'));
  const model = require(path.join(ROOT, 'js', 'model.js'));
  const rights = require(path.join(ROOT, 'js', 'rights.js'));
  const DATA = indexer.dataDir();
  // manifest.xml is the single source of the version
  const VERSION = (() => {
    try {
      const xml = require('fs').readFileSync(path.join(ROOT, 'CSXS', 'manifest.xml'), 'utf8');
      return (/ExtensionBundleVersion="([^"]+)"/.exec(xml) || [])[1] || '?';
    } catch (e) { return '?'; }
  })();

  const $ = (id) => document.getElementById(id);
  const $q = $('q'), $list = $('list'), $spacer = $('spacer'), $rows = $('rows'), $status = $('status');

  const DEFAULT_PV = 'あア亜 永遠 Ag';
  const cfg = {
    previewText: DEFAULT_PV, previewSize: 28, favorites: [], recent: [], extraDirs: [],
    hidden: [], view: 'preview', clickApply: true, cls: '',
  };
  const state = { host: [], hostCount: -1, psMap: {}, comp: new Set(), families: [], filtered: [], sel: 0, mode: 'all', open: null };
  let favSet = new Set(), hiddenSet = new Set();
  const NEW_MAX = 50;
  const CLS_LABEL = { serif: 'Serif', sans: 'Sans', slab: 'Slab', script: 'Script', mono: 'Mono', display: 'Display', symbol: 'Symbol' };

  // ---------- persistence ----------
  async function loadJSON(name, dflt) {
    try { return JSON.parse(await fsp.readFile(path.join(DATA, name), 'utf8')); } catch (e) { return dflt; }
  }
  async function saveJSON(name, obj) {
    try {
      await fsp.mkdir(DATA, { recursive: true });
      await fsp.writeFile(path.join(DATA, name), JSON.stringify(obj));
    } catch (e) { status('保存に失敗しました: ' + e.message); }
  }
  let saveT = null;
  function saveCfg() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      cfg.favorites = Array.from(favSet);
      cfg.hidden = Array.from(hiddenSet);
      saveJSON('settings.json', cfg);
    }, 300);
  }

  // ---------- host bridge ----------
  function evalJsx(code) {
    return new Promise((res) => window.__adobe_cep__.evalScript(code, (r) => res(r)));
  }
  function status(msg) { $status.textContent = msg; }

  // ---------- font loading ----------
  const aliasIds = new Map();
  function aliasOf(st) {
    let id = aliasIds.get(st.ps);
    if (!id) { id = 'fqp' + (aliasIds.size + 1); aliasIds.set(st.ps, id); }
    return id;
  }
  const loaded = new Map();      // alias -> { ok, failed, face, buf, last }
  const pending = new Set();
  const queue = [];
  let active = 0, bufCount = 0, visible = new Set(), loadT = null;
  const BUF_MAX = 40, CONCURRENCY = 4;

  // styles: every style whose preview is on screen
  function scheduleLoads(styles) {
    clearTimeout(loadT);
    loadT = setTimeout(() => {
      visible = new Set();
      for (const st of styles) {
        const a = aliasOf(st);
        visible.add(a);
        const L = loaded.get(a);
        if (L) { L.last = Date.now(); continue; }
        if (!pending.has(a)) { pending.add(a); queue.push(st); }
      }
      pump();
    }, 50);
  }
  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const st = queue.shift(), a = aliasOf(st);
      if (!visible.has(a)) { pending.delete(a); continue; }
      active++;
      loadFace(st).finally(() => { active--; pending.delete(a); render(); pump(); });
    }
  }
  async function loadFace(st) {
    const a = aliasOf(st);
    let face = null, buf = false;
    if (st.local) {
      try { face = new FontFace(a, 'local("' + st.ps + '")'); await face.load(); } catch (e) { face = null; }
    }
    // Adobe Fonts files are never read whole: their previews use only the font as
    // activated in the OS (local()), and the indexer reads just their name tables
    if (!face && st.file && st.index === 0 && !indexer.isLiveType(st.file)) {
      try {
        const d = await fsp.readFile(st.file);
        face = new FontFace(a, d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
        await face.load();
        buf = true;
      } catch (e) { face = null; }
    }
    if (!face) { loaded.set(a, { failed: true, last: Date.now() }); return; }
    document.fonts.add(face);
    loaded.set(a, { ok: true, face, buf, last: Date.now() });
    if (buf) { bufCount++; evict(); }
  }
  function evict() {
    if (bufCount <= BUF_MAX) return;
    const c = Array.from(loaded.entries())
      .filter(([a, v]) => v.buf && !visible.has(a))
      .sort((x, y) => x[1].last - y[1].last);
    while (bufCount > BUF_MAX && c.length) {
      const [a, v] = c.shift();
      document.fonts.delete(v.face);
      loaded.delete(a);
      bufCount--;
    }
  }

  // ---------- list rendering (virtualized) ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtDate(ms) {
    const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function compact() { return cfg.view === 'name'; }
  // one badge per source; several sources for one family get a warning outline
  function vendorBadges(f) {
    if (f.comp) return '';
    // data-v: vendor for the rights tooltip ('none' when no font file was found)
    if (!f.vendors.length) return '<span class="vd vd-none" data-v="none">?</span>';
    const multi = multiVendor(f);
    return f.vendors.map((v) => '<span class="vd vd-' + v + (multi ? ' multi' : '') + '" data-v="' + v + '">'
      + model.VENDORS[v].label + '</span>').join('');
  }
  // Google and OFL are both open licences, so mixing only those is no conflict
  function multiVendor(f) { return new Set(f.vendors.map((v) => (v === 'ofl' ? 'google' : v))).size > 1; }

  // ---------- rights tooltip ----------
  const $tip = $('tip');
  const MARK = { ok: '○', cond: '△', ng: '×', ask: '？' };
  let tipFor = null, tipHideT = null;
  function tipHTML(f, v) {
    const r = rights.RIGHTS[v];
    let h = '<div class="tip-head"><span class="vd vd-' + v + '">' + esc(v === 'none' ? '?' : model.VENDORS[v].label) + '</span>'
      + '<b>' + esc(r ? r.title : (v === 'none' ? '提供元不明' : 'その他の提供元')) + '</b></div>';
    if (multiVendor(f)) {
      h += '<div class="tip-warn">⚠ 同名のフォントが複数の提供元（' + f.vendors.map((x) => model.VENDORS[x].label).join('・')
        + '）から入っています。Illustrator が実際にどちらを使っているかは判別できないため、条件の厳しい方に合わせてください</div>';
    }
    if (r) {
      h += '<div class="tip-sum">' + esc(r.summary) + '</div><ul class="tip-list">'
        + r.items.map(([lv, label, note]) => '<li class="lv-' + lv + '"><i>' + MARK[lv] + '</i><span><b>' + esc(label) + '</b>'
          + (note ? '<em>' + esc(note) + '</em>' : '') + '</span></li>').join('') + '</ul>';
    } else {
      h += '<div class="tip-sum">' + (v === 'none'
        ? 'フォントファイルが見つからないため、提供元を判定できません。入手元のライセンスを確認してください'
        : '権利情報は登録していません。製造元のライセンスを確認してください') + '</div>';
    }
    if (f.mfr || f.licUrl) {
      h += '<div class="tip-meta">' + (f.mfr ? '製造元: ' + esc(f.mfr) : '')
        + (f.licUrl ? (f.mfr ? '<br>' : '') + 'ライセンス: <a data-url="' + esc(f.licUrl) + '">' + esc(f.licUrl) + '</a>' : '') + '</div>';
    }
    if (r) {
      h += '<div class="tip-src">出典: ' + r.sources.map(([t, u]) => '<a data-url="' + esc(u) + '">' + esc(t) + '</a>').join('、')
        + '<br>' + rights.CHECKED + ' 時点の情報です。規約は変わることがあるため、重要な案件では公式の規約を確認してください</div>';
    }
    return h;
  }
  function showTip(badge) {
    clearTimeout(tipHideT);
    if (tipFor === badge) return;
    const row = badge.closest('.row'), f = row && state.filtered[+row.dataset.i];
    if (!f) return;
    tipFor = badge;
    $tip.innerHTML = tipHTML(f, badge.dataset.v);
    $tip.hidden = false;
    // below the badge, or above it when there is no room; kept inside the panel
    const b = badge.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    const w = Math.min(320, W - 16);
    $tip.style.width = w + 'px';
    $tip.style.left = Math.max(8, Math.min(b.left, W - w - 8)) + 'px';
    const th = $tip.offsetHeight;
    $tip.style.top = (b.bottom + 6 + th <= H - 8 ? b.bottom + 6 : Math.max(8, b.top - 6 - th)) + 'px';
  }
  function hideTip(delay) {
    clearTimeout(tipHideT);
    tipHideT = setTimeout(() => { $tip.hidden = true; tipFor = null; }, delay || 0);
  }
  // rows are rebuilt often, so hover is tracked by delegation rather than per badge
  $rows.addEventListener('mouseover', (e) => {
    const badge = e.target.closest && e.target.closest('.vd');
    if (badge) showTip(badge); else if (tipFor) hideTip(250);
  });
  $rows.addEventListener('mouseleave', () => hideTip(250));
  $tip.addEventListener('mouseenter', () => clearTimeout(tipHideT));   // lets links be clicked
  $tip.addEventListener('mouseleave', () => hideTip(150));
  $tip.addEventListener('click', (e) => {
    const u = e.target.dataset && e.target.dataset.url;
    if (!u) return;
    try { window.cep.util.openURLInDefaultBrowser(u); } catch (err) { window.open(u); }
  });
  $list.addEventListener('scroll', () => hideTip(0));
  function rowH() { return compact() ? 28 : Math.round(cfg.previewSize * 1.35) + 26; }
  // weights accordion: one family (state.open) at a time shows all its styles
  function subPvSize() { return Math.round(cfg.previewSize * 0.75); }
  function subH() { return compact() ? 24 : Math.round(subPvSize() * 1.3) + 10; }
  function geom() {
    const openIdx = state.open == null ? -1 : state.filtered.findIndex((f) => f.key === state.open);
    const of = openIdx >= 0 ? state.filtered[openIdx] : null;
    const H = rowH(), SH = subH(), X = of ? of.styles.length * SH + 4 : 0;
    return Object.assign(model.listGeometry(state.filtered.length, H, openIdx, X), { H, SH, X, openIdx });
  }
  // Runs fn, then scrolls so that row i stays where it was on screen (opening or
  // closing an accordion above it would otherwise move it under the pointer).
  function keepAnchor(i, fn) {
    const before = geom().top(i) - $list.scrollTop;
    fn();
    $spacer.style.height = geom().total + 'px';
    $list.scrollTop = geom().top(i) - before;
  }
  function setOpen(key) { state.open = key; }
  function pvClass(a) {
    const L = loaded.get(a);
    return L && L.ok ? 'pv' : (L && L.failed ? 'pv failed' : 'pv pending');
  }
  let raf = 0;
  function render() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
  function draw() {
    const g = geom(), n = state.filtered.length, H = g.H, top = $list.scrollTop, h = $list.clientHeight;
    $spacer.style.height = g.total + 'px';
    const s = Math.max(0, g.indexAt(top) - 3), e = Math.min(n, g.indexAt(top + h) + 4);
    const pv = esc(cfg.previewText || ' ');
    const hideIcon = state.mode === 'hidden' ? '<span class="hide" data-act="hide" title="再表示">↺</span>'
      : '<span class="hide" data-act="hide" title="このフォントを非表示">⊘</span>';
    const want = [];
    let html = '';
    for (let i = s; i < e; i++) {
      const f = state.filtered[i], st = f.styles[f.cur], a = aliasOf(st), y = g.top(i);
      const multi = f.styles.length > 1, open = i === g.openIdx;
      const tag = state.mode === 'new' ? fmtDate(f.added) : (f.comp ? '合成' : CLS_LABEL[f.cls]);
      html += '<div class="row' + (i === state.sel ? ' sel' : '') + (open ? ' open' : '') + '" data-i="' + i + '" style="top:' + y + 'px;height:' + H + 'px">'
        + '<div class="meta"><span class="star' + (favSet.has(f.key) ? ' on' : '') + '" data-act="fav">★</span>'
        // fixed columns: titles (flexible) | tag | style | hide, so tags line up across rows
        + '<span class="titles"><span class="name">' + esc(f.display) + '</span>' + vendorBadges(f)
        + (f.nameJa && f.nameEn && f.nameJa !== f.nameEn ? '<span class="sub">' + esc(f.nameEn) + '</span>' : '') + '</span>'
        + '<span class="tagcol">' + (tag ? '<span class="cls">' + tag + '</span>' : '') + '</span>'
        + '<span class="style"><span class="st-name">' + esc(st.name) + '</span>'
        + (multi ? '<b data-act="toggle" title="ウエイト一覧">' + f.styles.length + (open ? ' ▾' : ' ▸') + '</b>' : '') + '</span>'
        + hideIcon + '</div>'
        + (compact() ? '' : '<div class="' + pvClass(a) + '" style="font-family:\'' + a + '\',system-ui;font-size:' + cfg.previewSize + 'px">' + pv + '</div>')
        + '</div>';
      if (!compact()) want.push(st);
      if (open) {
        const SH = g.SH, by = y + H;
        html += '<div class="weights" style="top:' + by + 'px;height:' + g.X + 'px">';
        f.styles.forEach((ws, j) => {
          const wy = by + 2 + j * SH, wa = aliasOf(ws);
          if (wy + SH < top - 200 || wy > top + h + 200) return;   // off screen
          html += '<div class="w-row' + (j === f.cur ? ' on' : '') + '" data-i="' + i + '" data-s="' + j + '" style="top:' + (2 + j * SH) + 'px;height:' + SH + 'px">'
            + '<span class="w-name">' + esc(ws.name) + '</span>'
            + (compact() ? '' : '<span class="' + pvClass(wa) + ' w-pv" style="font-family:\'' + wa + '\',system-ui;font-size:' + subPvSize() + 'px">' + pv + '</span>')
            + '</div>';
          if (!compact()) want.push(ws);
        });
        html += '</div>';
      }
    }
    $rows.innerHTML = html;
    if (want.length) scheduleLoads(want);
  }

  // ---------- filtering ----------
  function applyFilter(keepKey) {
    const m = state.mode;
    let src = state.families;
    if (m === 'recent') {
      const byKey = new Map(state.families.map((f) => [f.key, f]));
      src = cfg.recent.map((k) => byKey.get(k)).filter(Boolean);
    }
    if (m === 'hidden') src = src.filter((f) => hiddenSet.has(f.key));
    else src = src.filter((f) => !hiddenSet.has(f.key));
    if (m === 'ja' || m === 'en' || m === 'comp') src = src.filter((f) => model.category(f) === m);
    if (m === 'en' && cfg.cls) src = src.filter((f) => (cfg.cls === 'none' ? !f.cls : f.cls === cfg.cls));
    if (m === 'fav') src = src.filter((f) => favSet.has(f.key));
    const byAdded = (a, b) => b.added - a.added;
    // newest NEW_MAX families (a family counts once however many weights it has)
    if (m === 'new') src = src.filter((f) => f.added > 0).sort(byAdded).slice(0, NEW_MAX);
    state.filtered = $q.value.trim() ? model.search(src, $q.value, favSet) : src.slice();
    if (m === 'new') state.filtered.sort(byAdded);   // keep chronological order while searching
    const idx = keepKey ? state.filtered.findIndex((f) => f.key === keepKey) : -1;
    state.sel = idx >= 0 ? idx : 0;
    if (!(idx >= 0 && keepKey === state.open)) state.open = null;
    $list.scrollTop = 0;
    ensureVisible();
    render();
    countStatus();
  }
  function countStatus() {
    status(state.filtered.length + ' / ' + state.families.length + ' ファミリー'
      + (hiddenSet.size && state.mode !== 'hidden' ? '（非表示 ' + hiddenSet.size + '）' : ''));
  }
  function rebuild() {
    const cur = state.filtered[state.sel];
    state.families = model.buildFamilies(state.host, state.psMap, indexer.isLiveType, state.comp);
    applyFilter(cur && cur.key);
  }

  // ---------- selection & actions ----------
  // Keeps the selected row visible; with its accordion open, the whole block if it
  // fits, else the highlighted weight.
  function ensureVisible() {
    const g = geom(), ch = $list.clientHeight, f = state.filtered[state.sel];
    $spacer.style.height = g.total + 'px';
    let y0 = g.top(state.sel), y1 = y0 + g.H;
    if (f && state.sel === g.openIdx) {
      if (g.H + g.X <= ch) y1 = y0 + g.H + g.X;
      else { const wy = y1 + 2 + f.cur * g.SH; y1 = wy + g.SH; if (y1 - y0 > ch) y0 = wy; }
    }
    if (y0 < $list.scrollTop) $list.scrollTop = y0;
    else if (y1 > $list.scrollTop + ch) $list.scrollTop = y1 - ch;
  }
  // ↑↓ walk through the open family's weights first, then on to the next family
  function move(d) {
    const n = state.filtered.length;
    if (!n) return;
    const f = state.filtered[state.sel];
    if (f && state.open === f.key && Math.abs(d) === 1) {
      const c = f.cur + d;
      if (c >= 0 && c < f.styles.length) { f.cur = c; ensureVisible(); render(); return; }
    }
    setOpen(null);
    state.sel = Math.max(0, Math.min(n - 1, state.sel + d));
    ensureVisible();
    render();
  }
  function pageRows() { return Math.max(1, Math.floor($list.clientHeight / rowH()) - 1); }
  // ←→: close / open the selected family's weights
  function expand(on) {
    const f = state.filtered[state.sel];
    if (!f || f.styles.length < 2) return;
    setOpen(on ? f.key : null);
    ensureVisible();
    render();
  }
  function toggleFav(i) {
    const f = state.filtered[i];
    if (!f) return;
    if (favSet.has(f.key)) favSet.delete(f.key); else favSet.add(f.key);
    saveCfg();
    render();
  }
  // Hides the family (or restores it in the hidden list); it leaves the current list either way
  function toggleHidden(i) {
    const f = state.filtered[i];
    if (!f) return;
    if (hiddenSet.has(f.key)) hiddenSet.delete(f.key); else hiddenSet.add(f.key);
    saveCfg();
    const top = $list.scrollTop, sel = Math.min(i, state.filtered.length - 2);
    applyFilter();
    state.sel = Math.max(0, sel);
    $list.scrollTop = top;
    render();
  }
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll('#tabs [data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    $('cls').hidden = m !== 'en';
    $('hidden-bar').hidden = m !== 'hidden';
    applyFilter();
    $q.focus();
  }
  function setView(v) {
    cfg.view = v;
    $('btn-view').classList.toggle('on', v === 'name');
    $('btn-view').textContent = v === 'name' ? 'あ' : 'Aa';
    saveCfg();
    render();
    ensureVisible();
  }
  const MSG = {
    NODOC: 'ドキュメントが開いていません',
    NOSEL: 'テキストを選択してください',
    NOTEXT: '選択範囲にテキストがありません',
    NOFONT: 'Illustratorでフォントが見つかりません（再スキャンしてください）',
    NOTAPPLIED: 'Illustratorがこのフォントを適用しませんでした',
  };
  // silent: a click-to-apply with nothing applicable selected is just a selection, not an error
  const NOT_APPLICABLE = new Set(['NODOC', 'NOSEL', 'NOTEXT']);
  async function applySel(silent) {
    const f = state.filtered[state.sel];
    if (!f) return;
    const st = f.styles[f.cur];
    const r = await evalJsx('fqp_apply(' + JSON.stringify(st.ps) + ')');
    if (typeof r === 'string' && r.indexOf('OK:') === 0) {
      status(r.slice(3) + '件に適用しました：' + f.display + ' ' + st.name);
      cfg.recent = [f.key].concat(cfg.recent.filter((k) => k !== f.key)).slice(0, 30);
      saveCfg();
    } else {
      const code = String(r).replace('ERR:', '');
      if (silent && NOT_APPLICABLE.has(code)) return;
      status(MSG[code] || ('適用できませんでした: ' + r));
    }
  }
  function setPreviewText(t) {
    cfg.previewText = t;
    $('pv-text').value = t;
    $('btn-pv-reset').disabled = t === DEFAULT_PV;
    saveCfg();
    render();
  }
  async function grabSelText() {
    const t = await evalJsx('fqp_selText()');
    if (!t || t === 'EvalScript error.' || !t.trim()) { status('テキストを選択してください'); return; }
    setPreviewText(t);
    status('見本文字に取り込みました');
  }
  function resetPreviewText() {
    setPreviewText(DEFAULT_PV);
    status('見本文字を既定に戻しました');
  }
  // seq: rowDownSeq when the caller started; a row press since then wins over this jump
  async function selectCurrent(seq) {
    if ($q.value.trim()) return;
    const ps = await evalJsx('fqp_current()');
    if (!ps || ps === 'EvalScript error.') return;
    if (seq !== rowDownSeq) return;
    const i = state.filtered.findIndex((f) => f.styles.some((s) => s.ps === ps));
    if (i < 0) return;
    const f = state.filtered[i];
    f.cur = f.styles.findIndex((s) => s.ps === ps);
    state.sel = i;
    if (state.open !== f.key) state.open = null;
    ensureVisible();
    render();
  }

  // ---------- data refresh ----------
  async function refreshHost(force) {
    const count = parseInt(await evalJsx('fqp_count()'), 10);
    if (!force && count === state.hostCount) return;
    status('Illustratorのフォント一覧を取得中…');
    const r = await evalJsx('fqp_list()');
    let list;
    try { list = JSON.parse(r); } catch (e) { status('フォント一覧の取得に失敗しました: ' + String(r).slice(0, 80)); return; }
    state.host = list;
    state.hostCount = count;
    saveJSON('hostfonts.json', { count, list });
    rebuild();
  }
  async function rescanFiles() {
    status('フォントファイルを走査中…');
    const t = Date.now();
    const res = await indexer.buildIndex({
      extraDirs: cfg.extraDirs,
      onProgress: (d, n) => status('走査中 ' + d + ' / ' + n),
    });
    state.psMap = indexer.toPsMap(res.files);
    state.comp = await indexer.compositeFontNames();
    rebuild();
    status(state.families.length + ' ファミリー（ファイル ' + res.total + '、新規解析 ' + res.parsed + '、' + ((Date.now() - t) / 1000).toFixed(1) + '秒）');
  }

  // ---------- events ----------
  function registerKeys() {
    const mac = [126, 125, 123, 124, 36, 76, 53, 48, 116, 121];
    const win = [38, 40, 37, 39, 13, 27, 9, 33, 34];
    const codes = navigator.platform.indexOf('Mac') === 0 ? mac : win;
    const list = [];
    codes.forEach((k) => { list.push({ keyCode: k }); list.push({ keyCode: k, altKey: true }); });
    try { window.__adobe_cep__.registerKeyEventsInterest(JSON.stringify(list)); } catch (e) { /* older CEP */ }
  }

  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.target.closest && e.target.closest('#settings, #scan')) return;
    const inQ = e.target === $q;
    switch (e.key) {
      case 'ArrowDown': move(1); e.preventDefault(); return;
      case 'ArrowUp': move(-1); e.preventDefault(); return;
      case 'PageDown': move(pageRows()); e.preventDefault(); return;
      case 'PageUp': move(-pageRows()); e.preventDefault(); return;
      case 'ArrowRight': if (!inQ || e.altKey) { expand(true); e.preventDefault(); } return;
      case 'ArrowLeft': if (!inQ || e.altKey) { expand(false); e.preventDefault(); } return;
      case 'Enter': applySel(); e.preventDefault(); return;
      case 'Escape':
        if (inQ && $q.value) { $q.value = ''; applyFilter(); } else $q.focus();
        e.preventDefault();
        return;
    }
    if (!inQ && !e.metaKey && !e.ctrlKey) {
      if (e.key === 'f') { toggleFav(state.sel); e.preventDefault(); return; }
      if (e.key === 'h') { toggleHidden(state.sel); e.preventDefault(); return; }
      if (e.key.length === 1) $q.focus();
    }
  });

  $q.addEventListener('input', () => applyFilter());
  $list.addEventListener('scroll', render);
  window.addEventListener('resize', render);

  // Rows are rebuilt with innerHTML whenever a preview font finishes loading. If that
  // happens between mousedown and mouseup, Chromium drops click/dblclick, so the
  // double click is detected on mousedown, which is hit-tested at press time.
  const DBL_MS = 500;
  let rowDownSeq = 0, lastDown = { key: null, t: 0 };
  $rows.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const row = e.target.closest('.row, .w-row');
    if (!row) return;
    rowDownSeq++;
    e.preventDefault();   // keep focus in the search box
    const i = +row.dataset.i, f = state.filtered[i];
    if (!f) return;
    const act = e.target.dataset.act;
    if (act) lastDown = { key: null, t: 0 };
    if (act === 'fav') { toggleFav(i); return; }
    if (act === 'hide') { toggleHidden(i); return; }
    if (act === 'toggle') {
      keepAnchor(i, () => { state.sel = i; setOpen(state.open === f.key ? null : f.key); });
      ensureVisible();
      render();
      return;
    }
    // header: select the family and open its weights (a later click on an open
    // header closes them); weight row: pick that weight
    const isWeight = row.classList.contains('w-row');
    const target = isWeight ? f.key + '\n' + row.dataset.s : f.key;
    const now = Date.now();
    const dbl = lastDown.key === target && now - lastDown.t < DBL_MS;
    lastDown = dbl ? { key: null, t: 0 } : { key: target, t: now };
    // the second click of a double click must not undo the first click's opening
    const closing = !isWeight && !dbl && state.open === f.key;
    keepAnchor(i, () => {
      state.sel = i;
      if (isWeight) f.cur = +row.dataset.s;
      else setOpen(closing || f.styles.length < 2 ? null : f.key);
    });
    ensureVisible();
    render();
    if (closing) return;   // closing only; the weight was already applied when it was picked
    if (cfg.clickApply) { if (!dbl) applySel(true); }   // the second click of a double click would repeat it
    else if (dbl) applySel();
  });

  $('tabs').addEventListener('click', (e) => {
    const m = e.target.dataset.m;
    if (m) setMode(m);
  });
  $('cls').addEventListener('click', (e) => {
    const c = e.target.dataset.c;
    if (c == null) return;
    cfg.cls = c;
    document.querySelectorAll('#cls [data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === c));
    saveCfg();
    applyFilter();
    $q.focus();
  });
  $('btn-view').addEventListener('click', () => setView(compact() ? 'preview' : 'name'));
  $('click-apply').addEventListener('change', (e) => { cfg.clickApply = e.target.checked; saveCfg(); });
  $('btn-hidden-close').addEventListener('click', () => setMode('all'));
  $('btn-settings').addEventListener('click', () => { $('settings').hidden = !$('settings').hidden; });
  $('btn-grab').addEventListener('click', grabSelText);
  $('btn-pv-reset').addEventListener('click', resetPreviewText);
  $('pv-text').addEventListener('input', (e) => setPreviewText(e.target.value));
  $('pv-size').addEventListener('input', (e) => { cfg.previewSize = +e.target.value; saveCfg(); render(); ensureVisible(); });
  $('extra-dirs').addEventListener('change', (e) => {
    cfg.extraDirs = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
    saveCfg();
  });
  async function rescanAll() { await refreshHost(true); await rescanFiles(); }
  $('btn-rescan').addEventListener('click', () => {
    cfg.extraDirs = $('extra-dirs').value.split('\n').map((s) => s.trim()).filter(Boolean);
    saveCfg();
    $('scan').hidden = true;
    rescanAll();
  });
  $('btn-scan-close').addEventListener('click', () => { $('scan').hidden = true; $q.focus(); });

  // ---------- panel flyout menu ----------
  const FLYOUT = '<Menu>'
    + '<MenuItem Id="about" Label="Font Quick Picker v' + VERSION + '" Enabled="false"/>'
    + '<MenuItem Label="---"/>'
    + '<MenuItem Id="grab" Label="選択テキストを見本文字に取り込む"/>'
    + '<MenuItem Id="pvreset" Label="見本文字を既定に戻す"/>'
    + '<MenuItem Id="view" Label="フォント名表示／プレビュー表示を切り替え"/>'
    + '<MenuItem Label="---"/>'
    + '<MenuItem Id="hidden" Label="非表示にしたフォント…"/>'
    + '<MenuItem Id="extra" Label="追加スキャンフォルダ…"/>'
    + '<MenuItem Id="rescan" Label="フォントを再スキャン"/>'
    + '<MenuItem Label="---"/>'
    + '<MenuItem Id="reload" Label="パネルを再読み込み（開発用）"/>'
    + '</Menu>';
  // Picks up edits without restarting Illustrator: re-evaluates host.jsx, drops the
  // cached Node modules, then reloads the page. manifest.xml changes still need a restart.
  async function reloadPanel() {
    status('再読み込み中…');
    await evalJsx('$.evalFile(' + JSON.stringify(path.join(ROOT, 'jsx', 'host.jsx')) + ')');
    for (const m of ['indexer.js', 'model.js', 'rights.js']) {
      try { delete require.cache[require.resolve(path.join(ROOT, 'js', m))]; } catch (e) { /* not cached */ }
    }
    clearTimeout(saveT);
    cfg.favorites = Array.from(favSet);
    cfg.hidden = Array.from(hiddenSet);
    await saveJSON('settings.json', cfg);   // flush a pending debounced save
    location.reload();
  }
  function onFlyout(ev) {
    let d = ev && ev.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = { menuId: (/menuId["\s:=>]+"?(\w+)/.exec(d) || [])[1] }; } }
    const id = d && d.menuId;
    if (id === 'grab') grabSelText();
    else if (id === 'pvreset') resetPreviewText();
    else if (id === 'view') setView(compact() ? 'preview' : 'name');
    else if (id === 'hidden') setMode('hidden');
    else if (id === 'extra') { $('scan').hidden = false; $('extra-dirs').focus(); }
    else if (id === 'rescan') rescanAll();
    else if (id === 'reload') reloadPanel();
  }
  function setupFlyout() {
    try {
      window.__adobe_cep__.invokeSync('setPanelFlyoutMenu', FLYOUT);
      window.__adobe_cep__.addEventListener('com.adobe.csxs.events.flyoutMenuClicked', onFlyout);
    } catch (e) { /* flyout menus unsupported */ }
  }

  window.addEventListener('focus', async () => {
    const seq = rowDownSeq;
    $q.focus();
    $q.select();
    await refreshHost(false);   // picks up newly activated fonts
    selectCurrent(seq);
  });

  function applySkin() {
    try {
      const env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
      const c = env.appSkinInfo.panelBackgroundColor.color;
      document.documentElement.style.setProperty('--bg', 'rgb(' + (c.red | 0) + ',' + (c.green | 0) + ',' + (c.blue | 0) + ')');
      document.body.classList.toggle('light', c.red * 0.299 + c.green * 0.587 + c.blue * 0.114 > 128);
    } catch (e) { /* keep default dark */ }
  }

  // ---------- init ----------
  async function init() {
    status('Font Quick Picker v' + VERSION + ' 起動中…');
    $status.title = 'Font Quick Picker v' + VERSION;
    applySkin();
    registerKeys();
    setupFlyout();
    Object.assign(cfg, await loadJSON('settings.json', {}));
    favSet = new Set(cfg.favorites || []);
    hiddenSet = new Set(cfg.hidden || []);
    $('pv-text').value = cfg.previewText;
    $('btn-pv-reset').disabled = cfg.previewText === DEFAULT_PV;
    $('pv-size').value = cfg.previewSize;
    $('click-apply').checked = cfg.clickApply;
    document.querySelectorAll('#cls [data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === cfg.cls));
    setView(cfg.view);
    $('extra-dirs').value = (cfg.extraDirs || []).join('\n');
    $q.focus();

    // 1) instant start from caches
    const [files, hc, comp] = await Promise.all([
      indexer.loadCachedIndex(), loadJSON('hostfonts.json', null), indexer.compositeFontNames(),
    ]);
    state.psMap = indexer.toPsMap(files);
    state.comp = comp;
    if (hc && hc.list) { state.host = hc.list; state.hostCount = hc.count; rebuild(); }
    // 2) refresh Illustrator's font list only if the count changed
    await refreshHost(false);
    // 3) incremental file scan in the background
    rescanFiles().catch((e) => status('走査エラー: ' + e.message));
  }
  init();
})();
