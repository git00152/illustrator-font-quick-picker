'use strict';
// Pure data logic (no DOM): family grouping, normalization, search.

function norm(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\-_・･.]/g, '');
}

function guessWeight(style) {
  const s = String(style || '').toLowerCase();
  const table = [
    [/thin|hairline|w0|w1\b/, 100], [/extra ?light|ultra ?light|w2\b/, 200], [/light|w3\b/, 300],
    [/medium|w5\b/, 500], [/semi ?bold|demi|w6\b/, 600], [/extra ?bold|ultra ?bold|w8\b/, 800],
    [/black|heavy|w9\b/, 900], [/bold|w7\b/, 700],
  ];
  for (const [re, w] of table) if (re.test(s)) return w;
  return 400;
}

// A font Illustrator lists but no font file provides is a composite font when its name
// matches a saved composite font file, or is not a valid (ASCII) PostScript name.
function isComposite(ps, family, m, compNames) {
  if (m) return false;
  return !!(compNames && (compNames.has(ps) || compNames.has(family))) || /[^\x00-\x7f]/.test(ps);
}

// host: [[ps, family, style], ...] from Illustrator; psMap: from indexer.toPsMap
// compNames: Set of composite font names (indexer.compositeFontNames)
function buildFamilies(host, psMap, isLiveType, compNames) {
  const fams = new Map();
  // vendors by family name, for styles without a file of their own (named instances
  // of a variable font have PostScript names that no file declares)
  const famVendors = new Map();
  for (const ps in psMap) {
    const m = psMap[ps];
    for (const n of [m.famEn, m.famJa]) {
      if (!n) continue;
      const vs = famVendors.get(n) || new Set();
      m.vendors.forEach((v) => vs.add(v));
      famVendors.set(n, vs);
    }
  }
  for (const row of host) {
    const ps = row[0], hf = row[1], hs = row[2];
    const m = psMap[ps];
    const comp = isComposite(ps, hf, m, compNames);
    const key = m ? (m.famEn || m.famJa || hf) : (comp ? 'comp:' + hf : hf);
    let f = fams.get(key);
    if (!f) {
      f = { key, nameJa: '', nameEn: '', styles: [], jis: false, comp, vendors: [] };
      fams.set(key, f);
    }
    if (m) {
      if (!f.nameJa && m.famJa) f.nameJa = m.famJa;
      if (!f.nameEn && m.famEn) f.nameEn = m.famEn;
      if (m.jis) f.jis = true;
    }
    if (!f.nameEn) f.nameEn = hf;
    if (comp && !f.nameJa && /[^\x00-\x7f]/.test(hf)) f.nameJa = hf;
    const vs = m ? m.vendors : Array.from(famVendors.get(hf) || []);
    for (const v of vs) if (f.vendors.indexOf(v) < 0) f.vendors.push(v);
    if (m && !f.mfr) { f.mfr = m.mfr; f.licUrl = m.licUrl; }
    f.styles.push({
      ps,
      name: m ? (m.styJa || m.styEn || hs) : hs,
      nameEn: m ? (m.styEn || hs) : hs,
      weight: m ? m.weight : guessWeight(hs),
      added: m ? m.added || 0 : 0,
      width: m ? m.width : 5,
      italic: m ? m.italic : /italic|oblique/i.test(hs),
      file: m ? m.file : null,
      index: m ? m.index : 0,
      local: !comp,
      cls: m && m.cls || '',
    });
  }

  const out = [];
  for (const f of fams.values()) {
    if (f.nameJa) f.jis = true;
    f.styles.sort((a, b) => (a.width - b.width) || (a.italic - b.italic) || (a.weight - b.weight));
    let def = 0, best = 1e9;
    f.styles.forEach((s, i) => {
      const d = Math.abs(s.weight - 400) + (s.italic ? 1000 : 0) + Math.abs(s.width - 5) * 100;
      if (d < best) { best = d; def = i; }
    });
    f.def = def;
    f.cur = def;
    // Latin classification of the family: the default style's, else any style's
    f.added = Math.max(0, ...f.styles.map((s) => s.added));
    f.cls = f.jis || f.comp ? '' : (f.styles[def].cls || (f.styles.find((s) => s.cls) || {}).cls || '');
    f.display = f.nameJa || f.nameEn;
    f.nDisplay = norm(f.display);
    f.nEn = norm(f.nameEn);
    // vendors in display order; names are searchable ("モリサワ", "google", ...)
    f.vendors.sort((a, b) => VENDOR_ORDER.indexOf(a) - VENDOR_ORDER.indexOf(b));
    const parts = [f.nameJa, f.nameEn, f.key].concat(f.vendors.map((v) => VENDORS[v].label + ' ' + v));
    for (const s of f.styles) parts.push(s.ps, s.name, s.nameEn);
    f.search = parts.map(norm).join('|');
    out.push(f);
  }
  const coll = new Intl.Collator('ja');
  out.sort((a, b) => coll.compare(a.nameEn, b.nameEn));
  return out;
}

// Multi-token AND match; prefix matches on display/English name rank first.
function search(families, query, favSet) {
  const toks = String(query || '').trim().split(/\s+/).map(norm).filter(Boolean);
  if (!toks.length) return families.slice();
  const hits = [];
  for (let i = 0; i < families.length; i++) {
    const f = families[i];
    let ok = true;
    for (const t of toks) if (f.search.indexOf(t) < 0) { ok = false; break; }
    if (!ok) continue;
    let score = 0;
    const t0 = toks[0];
    if (f.nDisplay === t0 || f.nEn === t0) score += 4;
    else if (f.nDisplay.indexOf(t0) === 0 || f.nEn.indexOf(t0) === 0) score += 2;
    if (favSet && favSet.has(f.key)) score += 1;
    hits.push({ score, i, f });
  }
  hits.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  return hits.map((h) => h.f);
}

// Category filters for the tabs. 'ja' / 'en' / 'comp' are mutually exclusive.
function category(f) {
  return f.comp ? 'comp' : (f.jis ? 'ja' : 'en');
}

// Geometry of the virtual list: n rows of height H, where row openIdx (-1: none)
// is followed by an extra block of height X (the expanded weights).
function listGeometry(n, H, openIdx, X) {
  const ex = openIdx >= 0 ? X : 0;
  const end = (openIdx + 1) * H;   // bottom of the open row
  return {
    total: n * H + ex,
    top: (i) => i * H + (openIdx >= 0 && i > openIdx ? ex : 0),
    // row index whose header or expanded block covers y
    indexAt: (y) => {
      let i;
      if (openIdx < 0 || y < end) i = Math.floor(y / H);
      else if (y < end + ex) i = openIdx;
      else i = Math.floor((y - ex) / H);
      return Math.max(0, Math.min(n - 1, i));
    },
  };
}

// Font sources (indexer.vendorOf), shown as badges to judge whether a font may be used
const VENDORS = {
  adobe: { label: 'Adobe', desc: 'Adobe Fonts（Creative Cloud のライセンス）' },
  morisawa: { label: 'モリサワ', desc: 'モリサワ（Morisawa Fonts / Passport のライセンス）' },
  google: { label: 'Google', desc: 'Google Fonts（SIL OFL などのオープンライセンス）' },
  ofl: { label: 'OFL', desc: 'オープンライセンス（SIL OFL / Apache）' },
  adobeapp: { label: 'Ai同梱', desc: 'Adobe アプリに同梱' },
  mac: { label: 'macOS', desc: 'macOS に同梱' },
  other: { label: '他', desc: 'その他（製造元・ライセンスを確認）' },
};
const VENDOR_ORDER = Object.keys(VENDORS);

module.exports = { norm, guessWeight, buildFamilies, search, category, isComposite, listGeometry, VENDORS };
