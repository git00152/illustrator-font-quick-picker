'use strict';
// Preview faces for the list: FontFace loading (local() first, then the indexed font
// file) and, for fonts the panel cannot draw (Adobe Fonts usable only in Adobe apps,
// composite fonts), images that Illustrator renders (host.jsx fqp_render), cached per
// font and preview text in <data>/pv.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// font names go inside CSS strings inside HTML attributes: drop quotes and backslashes
function cssStr(s) { return String(s).replace(/["'\\\n<>&]/g, ''); }
function fileURL(p) { return 'file://' + encodeURI(p.split(path.sep).join('/')); }

// o: {
//   cfg,                 settings (previewText, previewSize)
//   dataDir,             panel data folder
//   isAdobeFontsPath,    indexer.isAdobeFontsPath (those files are never read)
//   renderInIllustrator(text, size, res, gray, items) -> Promise (host fqp_render)
//   onChange(),          redraw the list
//   status(msg), idle()  status line: a progress message / back to the normal line
//   allowed()            whether Illustrator may be asked to render now
// }
function createPreview(o) {
  const cfg = o.cfg;

  // ---------- FontFace loading ----------
  const aliasIds = new Map();
  function aliasOf(st) {
    let id = aliasIds.get(st.ps);
    if (!id) { id = 'fqp' + (aliasIds.size + 1); aliasIds.set(st.ps, id); }
    return id;
  }
  const loaded = new Map();      // alias -> { ok | failed, sys?, face?, bytes?, last }
  const pending = new Set();
  const queue = [];
  let active = 0, visible = new Set(), loadT = null, bufBytes = 0;
  // Faces read from font files stay in memory; the cap is in bytes because one
  // Japanese font file is often 10-20MB. Faces on screen are never evicted.
  const BUF_BYTES_MAX = 160 * 1024 * 1024, CONCURRENCY = 4;

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
      loadFace(st).finally(() => { active--; pending.delete(a); o.onChange(); pump(); });
    }
  }
  async function loadFace(st) {
    const a = aliasOf(st);
    let face = null, bytes = 0;
    // descriptors match the style, so the browser never synthesizes bold/italic
    const desc = { weight: String(st.weight || 400), style: st.italic ? 'italic' : 'normal' };
    if (st.local) {
      // older Chromium (CEP) does not always match the PostScript name, so the full
      // name is tried as well
      const src = Array.from(new Set([st.ps, st.full, st.ps.replace(/-/g, ' ')].filter(Boolean)))
        .map((n) => 'local("' + cssStr(n) + '")').join(', ');
      try { face = new FontFace(a, src, desc); await face.load(); } catch (e) { face = null; }
    }
    // only files the indexer found are read; Adobe Fonts files never are (see indexer)
    if (!face && st.file && st.index === 0 && !o.isAdobeFontsPath(st.file)) {
      try {
        const d = await fsp.readFile(st.file);   // a Buffer is a Uint8Array: no copy needed
        face = new FontFace(a, d, desc);
        await face.load();
        bytes = d.byteLength;
      } catch (e) { face = null; }
    }
    if (!face) {
      // last resort: the family as installed in the OS (CSS font-family plus weight/style)
      const sys = (st.fams || []).some(familyAvailable);
      loaded.set(a, sys ? { ok: true, sys: true, last: Date.now() } : { failed: true, last: Date.now() });
      return;
    }
    document.fonts.add(face);
    loaded.set(a, { ok: true, face, bytes, last: Date.now() });
    if (bytes) { bufBytes += bytes; evict(); }
  }
  function evict() {
    if (bufBytes <= BUF_BYTES_MAX) return;
    const c = Array.from(loaded.entries())
      .filter(([a, v]) => v.bytes && !visible.has(a))
      .sort((x, y) => x[1].last - y[1].last);
    while (bufBytes > BUF_BYTES_MAX && c.length) {
      const [a, v] = c.shift();
      document.fonts.delete(v.face);
      loaded.delete(a);
      bufBytes -= v.bytes;
    }
  }

  // A family is installed if text measures the same with two different fallbacks.
  const famAvail = new Map();
  const measureCtx = document.createElement('canvas').getContext('2d');
  function familyAvailable(name) {
    if (famAvail.has(name)) return famAvail.get(name);
    const w = (fb) => { measureCtx.font = '40px "' + cssStr(name) + '", ' + fb; return measureCtx.measureText('Hamburgefonstiv あ永 0123').width; };
    const ok = Math.abs(w('serif') - w('monospace')) < 0.5;
    famAvail.set(name, ok);
    return ok;
  }
  // CSS for a preview: the loaded face first, then the OS family with the style's weight
  function pvFont(a, st) {
    return 'font-family:\'' + a + '\',' + (st.fams || []).map((n) => '\'' + cssStr(n) + '\'').join(',')
      + (st.fams && st.fams.length ? ',' : '') + 'system-ui;font-weight:' + (st.weight || 400)
      + ';font-style:' + (st.italic ? 'italic' : 'normal');
  }
  function pvClass(a) {
    const L = loaded.get(a);
    return L && L.ok ? 'pv' : (L && L.failed ? 'pv failed' : 'pv pending');
  }

  // ---------- Illustrator-rendered previews ----------
  const PV_DIR = path.join(o.dataDir, 'pv');
  // Each batch opens and closes one temporary document in Illustrator, so batches are
  // large and only start once scrolling has stopped for a while.
  const AI_BATCH = 16, AI_SCROLL_WAIT = 800;
  // rendered at the preview size and the screen's pixel density, then shown 1:1
  // text color of the panel theme (CSS filters blur images in CEP's Chromium)
  function aiGray() { return document.body.classList.contains('light') ? 30 : 232; }
  function aiDpr() { return Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1))); }
  const aiState = new Map();   // png path -> 'ok' | 'pending' | 'fail'
  // A failed image is retried once after AI_RETRY_MS (a busy Illustrator or a passing
  // evalScript error should not leave the font without a preview for the session).
  const aiFail = new Map();    // png path -> { t, n }
  const AI_RETRY_MS = 30000;
  let aiWant = [], aiT = null, aiBusy = false, aiRetryT = null;
  function aiText() { return (cfg.previewText || ' ').slice(0, 60); }
  function aiPath(st) {
    const key = ['r3', st.ps, aiText(), cfg.previewSize, aiDpr(), aiGray()].join('\n');
    return path.join(PV_DIR, crypto.createHash('md5').update(key).digest('hex') + '.png');
  }
  function aiStatus(p) {
    let s = aiState.get(p);
    if (!s && fs.existsSync(p)) { s = 'ok'; aiState.set(p, s); }
    if (s === 'fail') {
      const f = aiFail.get(p);
      if (f && f.n < 2 && Date.now() - f.t > AI_RETRY_MS) { aiState.delete(p); s = undefined; }
    }
    return s;
  }
  // While the sample text or size is being edited, wait until the input has settled
  // (and IME conversion is finished) so half-typed text is not rendered and cached.
  const AI_SETTLE = 1500;
  let aiEditUntil = 0, aiComposing = false;
  function edited() { aiEditUntil = Date.now() + AI_SETTLE; }
  function setComposing(on) {
    aiComposing = on;
    if (on) clearTimeout(aiT); else { edited(); scheduleAi(); }
  }
  function scheduleAi() {
    clearTimeout(aiT);
    if (aiComposing || !aiWant.length) return;   // compositionend schedules again
    aiT = setTimeout(runAi, Math.max(AI_SCROLL_WAIT, aiEditUntil - Date.now()));
  }
  async function runAi() {
    // only while the user is working in the panel; resumes on focus / pointer enter
    if (aiBusy || !o.allowed()) return;
    const seen = new Set(), batch = [];
    for (const st of aiWant) {
      const p = aiPath(st);
      if (seen.has(p) || aiStatus(p)) continue;
      seen.add(p);
      batch.push([st.ps, p]);
      if (batch.length >= AI_BATCH) break;
    }
    if (!batch.length) return;
    aiBusy = true;
    batch.forEach(([, p]) => aiState.set(p, 'pending'));
    o.status('Illustrator でプレビューを作成中…（' + batch.length + '件）');
    try {
      await fsp.mkdir(PV_DIR, { recursive: true });
      await o.renderInIllustrator(aiText(), cfg.previewSize, 72 * aiDpr(), aiGray(), batch);
    } catch (e) { /* treated as failures below */ }
    let failed = false;
    batch.forEach(([, p]) => {
      let size = -1;
      try { size = fs.statSync(p).size; } catch (e) { /* not written */ }
      if (size >= 0) { aiState.set(p, 'ok'); aiFail.delete(p); } else {
        aiState.set(p, 'fail');
        const f = aiFail.get(p);
        aiFail.set(p, { t: Date.now(), n: f ? f.n + 1 : 1 });
        failed = true;
      }
      if (size > 0) aiBytes += size;
    });
    if (failed) {
      clearTimeout(aiRetryT);
      aiRetryT = setTimeout(o.onChange, AI_RETRY_MS + 100);
    }
    if (aiBytes > AI_CAP) pruneCache();
    aiBusy = false;
    o.idle();
    o.onChange();   // draws the images and queues the next batch if more are visible
  }
  // Cache limits: images unused for 30 days are dropped, and above AI_CAP the least
  // recently used go until the total is back under 90% of it (so it does not prune
  // again on the next batch). aiBytes tracks the total between scans.
  const AI_CAP = 75 * 1024 * 1024;
  let aiBytes = 0, aiPruning = false;
  async function pruneCache() {
    if (aiPruning) return;
    aiPruning = true;
    try {
      const limit = Date.now() - 30 * 864e5;
      const files = [];
      let total = 0;
      for (const n of await fsp.readdir(PV_DIR)) {
        const p = path.join(PV_DIR, n);
        try {
          const st = await fsp.stat(p);
          const used = Math.max(st.atimeMs, st.mtimeMs);
          if (used < limit) { await fsp.unlink(p); aiState.delete(p); continue; }
          files.push({ p, used, size: st.size });
          total += st.size;
        } catch (e) { /* removed meanwhile */ }
      }
      if (total > AI_CAP) {
        files.sort((a, b) => a.used - b.used);
        for (const f of files) {
          if (total <= AI_CAP * 0.9) break;
          try { await fsp.unlink(f.p); aiState.delete(f.p); total -= f.size; } catch (e) { /* gone */ }
        }
      }
      aiBytes = total;
    } catch (e) { /* no cache yet */ }
    aiPruning = false;
  }
  // Deletes every cached preview image; the visible ones are rendered again.
  // Returns { n, bytes }, or null while rendering or pruning is in progress.
  async function clearCache() {
    if (aiBusy || aiPruning) return null;
    clearTimeout(aiT);
    let n = 0, bytes = 0;
    try {
      for (const name of await fsp.readdir(PV_DIR)) {
        if (!name.endsWith('.png')) continue;
        const p = path.join(PV_DIR, name);
        try { bytes += (await fsp.stat(p)).size; await fsp.unlink(p); n++; } catch (e) { /* gone */ }
      }
    } catch (e) { /* no cache yet */ }
    aiState.clear();
    aiFail.clear();
    aiBytes = 0;
    aiEditUntil = Date.now() + 2500;   // keep the result readable before re-rendering starts
    return { n, bytes };
  }

  // ---------- per frame ----------
  let want = [];
  function beginFrame() { want = []; aiWant = []; }
  // Live text in the font when the panel can draw it; otherwise Illustrator's rendering
  // or a placeholder until it exists. pv: the preview text, already HTML-escaped.
  function html(tag, extra, st, size, pv) {
    const a = aliasOf(st);
    want.push(st);
    const L = loaded.get(a);
    if (L && L.failed) {
      const p = aiPath(st), s = aiStatus(p);
      if (s === 'ok') {
        // srcset's density descriptor keeps the image at its natural size (no
        // resampling); the smaller weight rows scale it with zoom
        const zoom = size === cfg.previewSize ? '' : ' style="zoom:' + (size / cfg.previewSize).toFixed(3) + '"';
        return '<' + tag + ' class="pv' + extra + '"><img class="pv-img" srcset="' + esc(fileURL(p)) + ' ' + aiDpr() + 'x"'
          + zoom + ' alt=""></' + tag + '>';
      }
      if (s !== 'fail') aiWant.push(st);
      return '<' + tag + ' class="pv ' + (s === 'fail' ? 'failed' : 'pending') + extra + '" style="font-size:' + size + 'px">'
        + (s === 'fail' ? 'プレビューを作成できません' : pv) + '</' + tag + '>';
    }
    return '<' + tag + ' class="' + pvClass(a) + extra + '" style="' + pvFont(a, st) + ';font-size:' + size + 'px">' + pv + '</' + tag + '>';
  }
  function endFrame() {
    if (want.length) scheduleLoads(want);
    scheduleAi();
  }

  return {
    html, beginFrame, endFrame, edited, setComposing, clearCache, pruneCache,
    resume: scheduleAi,
  };
}

module.exports = { createPreview, cssStr, fileURL };
