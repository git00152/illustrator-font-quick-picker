'use strict';
// JSON files in the panel's data folder. Writes go to a temporary file that is then
// renamed over the old one, and the previous version is kept as <name>.bak, so a crash
// or quit in the middle of a write never leaves only a broken file behind.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function tmpName(file) { return file + '.tmp-' + process.pid + '-' + Date.now(); }

async function writeJSONAtomic(file, obj) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = tmpName(file);
  await fsp.writeFile(tmp, JSON.stringify(obj));
  try { await fsp.copyFile(file, file + '.bak'); } catch (e) { /* first write */ }
  await fsp.rename(tmp, file);
}

function writeJSONAtomicSync(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = tmpName(file);
  fs.writeFileSync(tmp, JSON.stringify(obj));
  try { fs.copyFileSync(file, file + '.bak'); } catch (e) { /* first write */ }
  fs.renameSync(tmp, file);
}

// The file, else its backup, else dflt
async function readJSON(file, dflt) {
  for (const f of [file, file + '.bak']) {
    try { return JSON.parse(await fsp.readFile(f, 'utf8')); } catch (e) { /* next */ }
  }
  return dflt;
}

function createStore(dir) {
  const at = (name) => path.join(dir, name);
  return {
    dir,
    load: (name, dflt) => readJSON(at(name), dflt),
    save: (name, obj) => writeJSONAtomic(at(name), obj),
    saveSync: (name, obj) => writeJSONAtomicSync(at(name), obj),
  };
}

module.exports = { createStore, readJSON, writeJSONAtomic, writeJSONAtomicSync };
