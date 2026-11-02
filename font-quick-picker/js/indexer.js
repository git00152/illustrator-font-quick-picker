'use strict';
// Font file indexer: reads only the sfnt directory, `name` and `OS/2` tables
// to map PostScript names to localized (ja/en) family/style names.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

const INDEX_VERSION = 3;   // 2: Latin classification (cls), 3: vendor/licence fields
const FONT_EXT = new Set(['.otf', '.ttf', '.ttc', '.otc']);
// 0 copyright, 1/2/16/17 family/style, 4 full name, 6 PostScript, 8 manufacturer, 13/14 licence text/URL
const WANT_IDS = new Set([0, 1, 2, 4, 6, 8, 13, 14, 16, 17]);
const SFNT_TAGS = new Set(['\x00\x01\x00\x00', 'OTTO', 'true']);

function dataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'FontQuickPicker');
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'FontQuickPicker');
}

// Fonts bundled inside Illustrator itself (Acumin/Myriad Variable Concept, ...)
function illustratorFontDirs() {
  const win = process.platform === 'win32';
  const base = win ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Adobe') : '/Applications';
  let apps = [];
  try { apps = fs.readdirSync(base).filter((n) => /^Adobe Illustrator/.test(n)); } catch (e) { /* none */ }
  return apps.map((a) => (win
    ? path.join(base, a, 'Support Files', 'Required', 'Fonts')
    : path.join(base, a, 'Adobe Illustrator.app', 'Contents', 'Required', 'Fonts')));
}

function defaultScanDirs() {
  const h = os.homedir();
  if (process.platform === 'win32') {
    const win = process.env.WINDIR || 'C:\\Windows';
    return illustratorFontDirs().concat([
      path.join(win, 'Fonts'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts'),
      path.join(process.env.APPDATA || '', 'Adobe', 'CoreSync', 'plugins', 'livetype'),
    ]);
  }
  return illustratorFontDirs().concat([
    '/System/Library/Fonts',
    '/Library/Fonts',
    path.join(h, 'Library', 'Fonts'),
    '/System/Library/AssetsV2',
    '/Library/Application Support/Adobe/Fonts',
    path.join(h, 'Library', 'Application Support', 'Adobe', 'CoreSync', 'plugins', 'livetype'),
  ]);
}

// Latin classification from OS/2 sFamilyClass, then PANOSE, then the name.
// Returns serif | sans | slab | script | mono | display | symbol | ''
function classify(fc, pan, name) {
  const n = String(name || '').toLowerCase();
  if (/mono|code|courier|consol/.test(n) || (pan[0] === 2 && pan[3] === 9)) return 'mono';
  if (fc === 5) return 'slab';
  if (fc >= 1 && fc <= 7) return 'serif';
  if (fc === 8) return 'sans';
  if (fc === 9) return 'display';
  if (fc === 10) return 'script';
  if (fc === 12) return 'symbol';
  if (pan[0] === 2) {
    if (pan[1] >= 11) return 'sans';   // 11-13 sans, 14 flared, 15 rounded
    if (pan[1] === 6) return 'slab';   // square serif
    if (pan[1] >= 2) return 'serif';
  }
  if (pan[0] === 3) return 'script';
  if (pan[0] === 4) return 'display';
  if (pan[0] === 5) return 'symbol';
  for (const [re, c] of NAME_HINTS) if (re.test(n)) return c;
  return '';
}

// Many fonts leave sFamilyClass/PANOSE empty; fall back to well-known names.
const NAME_HINTS = [
  [/emoji|symbol|dingbat|ornament|braille|stixintegrals|stixsize|stixvariants|webdings|wingdings/, 'symbol'],
  [/monaco|menlo/, 'mono'],
  [/slab|rockwell|clarendon|courier/, 'slab'],
  [/script|hand|brush|marker|noteworthy|savoye|zapfino|corsiva|party let|snell|chalkboard|chalkduster|apple chancery|parisienne/, 'script'],
  [/copperplate|herculanum|luminari|phosphate|engraved|stencil|trattatello|bradley/, 'display'],
  [/sans|gothic|grotesk|grotesque|helvetica|arial|avenir|futura|gill|frutiger|univers|\bdin|myriad|verdana|tahoma|geneva|optima|barlow|oswald|rubik|anton|hoves|sf pro|sf compact|roboto|inter\b|lato|montserrat|acumin|trebuchet|lucida grande|kohinoor|thonburi|sukhumvit|krungthep|silom|chonburi|pist/, 'sans'],
  [/serif|roman|antiqua|garamond|times|palatino|georgia|caslon|bodoni|didot|baskerville|cochin|hoefler|athelas|minion|stix|charter|century|myungjo|songti|stsong|mincho|book/, 'serif'],
];

function isLiveType(file) {
  return !!file && file.indexOf(path.sep + 'livetype' + path.sep) >= 0;
}

async function walk(dir, out, depth, topFilter) {
  let ents;
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < 8 && (!topFilter || topFilter(e.name))) await walk(p, out, depth + 1, null);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (FONT_EXT.has(ext) || (ext === '' && isLiveType(p))) out.push(p);
    }
  }
}

async function readAt(fh, pos, len) {
  const b = Buffer.alloc(len);
  const r = await fh.read(b, 0, len, pos);
  return b.slice(0, r.bytesRead);
}

function decodeName(buf, plat, enc) {
  if (plat === 0 || plat === 3) {
    if (buf.length % 2) return '';
    const c = Buffer.from(buf);
    c.swap16();
    return c.toString('utf16le');
  }
  if (plat === 1) {
    if (enc === 1) {
      try { return new TextDecoder('shift_jis').decode(buf); } catch (e) { return ''; }
    }
    if (enc === 0) return buf.toString('latin1');
  }
  return '';
}

function langOf(plat, lang) {
  if (plat === 3) {
    if (lang === 0x0411) return 'ja';
    if ((lang & 0xff) === 0x09) return 'en';
    return null;
  }
  if (plat === 1) {
    if (lang === 11) return 'ja';
    if (lang === 0) return 'en';
    return null;
  }
  if (plat === 0) return 'en';
  return null;
}

function parseName(b) {
  const out = {};
  if (b.length < 6) return out;
  const count = b.readUInt16BE(2);
  const so = b.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > b.length) break;
    const plat = b.readUInt16BE(r);
    const enc = b.readUInt16BE(r + 2);
    const lang = b.readUInt16BE(r + 4);
    const id = b.readUInt16BE(r + 6);
    const len = b.readUInt16BE(r + 8);
    const off = b.readUInt16BE(r + 10);
    if (!WANT_IDS.has(id)) continue;
    const l = langOf(plat, lang);
    if (!l) continue;
    const key = id + ':' + l;
    const prev = out[key];
    if (prev && prev.plat === 3) continue;
    const s = so + off;
    if (s + len > b.length) continue;
    const str = decodeName(b.slice(s, s + len), plat, enc).replace(/\0/g, '').trim();
    if (!str) continue;
    out[key] = { plat, str };
  }
  return out;
}

function pick(n, id, l) {
  const v = n[id + ':' + l];
  return v ? v.str : '';
}

async function parseFace(fh, off) {
  const hdr = await readAt(fh, off, 12);
  if (hdr.length < 12) return null;
  const n = hdr.readUInt16BE(4);
  if (n === 0 || n > 512) return null;
  const dir = await readAt(fh, off + 12, 16 * n);
  if (dir.length < 16 * n) return null;
  const tables = {};
  for (let i = 0; i < n; i++) {
    const t = dir.toString('latin1', i * 16, i * 16 + 4);
    tables[t] = { offset: dir.readUInt32BE(i * 16 + 8), length: dir.readUInt32BE(i * 16 + 12) };
  }
  if (!tables.name) return null;
  const names = parseName(await readAt(fh, tables.name.offset, Math.min(tables.name.length, 2 * 1024 * 1024)));
  const ps = pick(names, 6, 'en') || pick(names, 6, 'ja');
  if (!ps) return null;

  let weight = 400, width = 5, italic = false, jis = false, fc = 0, pan = [];
  const os2 = tables['OS/2'];
  if (os2) {
    const o = await readAt(fh, os2.offset, Math.min(os2.length, 100));
    if (o.length >= 64) {
      weight = o.readUInt16BE(4);
      width = o.readUInt16BE(6);
      italic = !!(o.readUInt16BE(62) & 1);
      fc = o.readUInt8(30);
      pan = Array.from(o.slice(32, 42));
    }
    if (o.length >= 82 && o.readUInt16BE(0) >= 1) {
      jis = !!(o.readUInt32BE(78) & (1 << 17));
    }
  }
  const famEn = pick(names, 16, 'en') || pick(names, 1, 'en');
  return {
    ps,
    famEn,
    famJa: pick(names, 16, 'ja') || pick(names, 1, 'ja'),
    styEn: pick(names, 17, 'en') || pick(names, 2, 'en'),
    styJa: pick(names, 17, 'ja') || pick(names, 2, 'ja'),
    weight, width, italic, jis,
    cls: classify(fc, pan, famEn + ' ' + ps),
    ...licenceInfo(names),
  };
}

async function parseFile(file) {
  let fh;
  try { fh = await fsp.open(file, 'r'); } catch (e) { return []; }
  try {
    const head = await readAt(fh, 0, 12);
    if (head.length < 12) return [];
    const tag = head.toString('latin1', 0, 4);
    let offsets = [0];
    if (tag === 'ttcf') {
      const cnt = head.readUInt32BE(8);
      if (cnt === 0 || cnt > 256) return [];
      const b = await readAt(fh, 12, 4 * cnt);
      offsets = [];
      for (let i = 0; i * 4 + 4 <= b.length; i++) offsets.push(b.readUInt32BE(i * 4));
    } else if (!SFNT_TAGS.has(tag)) {
      return [];
    }
    const out = [];
    for (let i = 0; i < offsets.length; i++) {
      try {
        const f = await parseFace(fh, offsets[i]);
        if (f) { f.index = i; out.push(f); }
      } catch (e) { /* broken face: skip */ }
    }
    return out;
  } finally {
    await fh.close();
  }
}

async function pool(items, limit, fn) {
  let i = 0;
  const workers = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push((async () => { while (i < items.length) await fn(items[i++]); })());
  }
  await Promise.all(workers);
}

function cacheFile() { return path.join(dataDir(), 'index.json'); }

async function loadCachedIndex() {
  try {
    const j = JSON.parse(await fsp.readFile(cacheFile(), 'utf8'));
    return j.version === INDEX_VERSION ? (j.files || {}) : {};
  } catch (e) { return {}; }
}

// Incremental: files with unchanged size+mtime reuse cached faces.
async function buildIndex(opts) {
  opts = opts || {};
  await fsp.mkdir(dataDir(), { recursive: true });
  const old = await loadCachedIndex();
  const roots = defaultScanDirs().concat(opts.extraDirs || []);
  const files = [];
  for (const r of roots) {
    const filt = path.basename(r) === 'AssetsV2' ? (n) => n.indexOf('com_apple_MobileAsset_Font') === 0 : null;
    await walk(r, files, 0, filt);
  }
  const uniq = Array.from(new Set(files));
  const next = {};
  let done = 0, parsed = 0;
  await pool(uniq, 16, async (f) => {
    try {
      const st = await fsp.stat(f);
      const o = old[f];
      if (o && o.size === st.size && o.mtime === st.mtimeMs) {
        next[f] = o;
      } else {
        next[f] = { size: st.size, mtime: st.mtimeMs, faces: await parseFile(f) };
        parsed++;
      }
      // Install time: copying keeps the font's own mtime/birthtime, but ctime
      // changes when the file is put into the folder.
      next[f].added = st.ctimeMs;
    } catch (e) { /* unreadable: skip */ }
    done++;
    if (opts.onProgress && done % 100 === 0) opts.onProgress(done, uniq.length);
  });
  await fsp.writeFile(cacheFile(), JSON.stringify({ version: INDEX_VERSION, files: next }));
  return { files: next, total: uniq.length, parsed };
}

// Illustrator saves composite fonts as files named after the font in
// <Adobe prefs>/<app version>/<locale>/Composite Fonts
async function compositeFontNames() {
  const base = process.platform === 'win32'
    ? path.join(process.env.APPDATA || '', 'Adobe')
    : path.join(os.homedir(), 'Library', 'Application Support', 'Adobe');
  const out = new Set();
  const dirs = async (p) => { try { return await fsp.readdir(p); } catch (e) { return []; } };
  for (const app of await dirs(base)) {
    for (const loc of await dirs(path.join(base, app))) {
      for (const f of await dirs(path.join(base, app, loc, 'Composite Fonts'))) {
        if (f[0] === '.' || /^Temp(\.localized)?$/.test(f)) continue;
        out.add(f);
        out.add(f.replace(/\.[^.]*$/, ''));
      }
    }
  }
  return out;
}

// Keeps only what vendorOf needs: licence kind, a Google hint, manufacturer, licence URL.
function licenceInfo(names) {
  const any = (id) => pick(names, id, 'en') || pick(names, id, 'ja');
  const copy = any(0), text = any(13), url = any(14);
  let lic = '';
  if (/^MPCD:/.test(text)) lic = 'mpcd';                                  // Morisawa licence id
  else if (/typekit\.com|fonts\.adobe\.com/i.test(url)) lic = 'typekit';
  else if (/open font licen[cs]e|\bOFL\b|scripts\.sil\.org/i.test(text + ' ' + url)) lic = 'ofl';
  else if (/apache licen[cs]e|apache\.org\/licenses/i.test(text + ' ' + url)) lic = 'apache';
  return {
    lic,
    // "The X Project Authors" is the Google Fonts copyright convention
    google: /google|googlefonts|project authors/i.test(copy + ' ' + any(8)),
    mfr: (any(8) || copy).slice(0, 80),
    apple: /\bApple\b/.test(copy),
    morisawa: /morisawa|モリサワ/i.test(copy + ' ' + any(8)),
    licUrl: lic === 'mpcd' ? '' : url.slice(0, 120),
  };
}

// Where the font comes from, judged from its location and its own licence fields.
// adobe | morisawa | google | ofl | mac | adobeapp | other
function vendorOf(file, f) {
  const p = file.split(path.sep).join('/');
  if (isLiveType(file) || f.lic === 'typekit') return 'adobe';
  if (f.lic === 'mpcd' || /\/MorisawaFonts\//.test(p)) return 'morisawa';
  if (/^\/System\/Library\//.test(p)) return 'mac';
  if (/\/Adobe\/Fonts\/|\/Required\/Fonts\//.test(p)) return 'adobeapp';   // installed with Adobe apps
  // FontBase installs Google Fonts into its own folder
  if (f.lic === 'ofl' || f.lic === 'apache') return f.google || /\/FontBase\//.test(p) ? 'google' : 'ofl';
  if (f.apple) return 'mac';
  if (f.morisawa) return 'morisawa';
  return 'other';
}

function toPsMap(files) {
  const map = Object.create(null);
  for (const file of Object.keys(files)) {
    const faces = files[file].faces || [];
    for (const f of faces) {
      const v = vendorOf(file, f);
      const m = map[f.ps];
      // the same PostScript name can come from several sources (e.g. a local copy
      // and Adobe Fonts); keep all of them, since which one Illustrator uses is unknown
      if (m) { if (m.vendors.indexOf(v) < 0) m.vendors.push(v); continue; }
      map[f.ps] = Object.assign({ file, added: files[file].added || 0, vendors: [v] }, f);
    }
  }
  return map;
}

module.exports = {
  dataDir, defaultScanDirs, buildIndex, loadCachedIndex, toPsMap, parseFile, isLiveType, classify, compositeFontNames, vendorOf,
};
