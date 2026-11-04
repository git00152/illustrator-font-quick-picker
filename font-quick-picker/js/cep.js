'use strict';
// Every call into CEP and Illustrator goes through this file, so the rest of the panel
// does not depend on the CEP runtime directly (and a UXP port replaces only this file
// and store.js). Uses the runtime's own window.__adobe_cep__ object, as CSInterface.js does.

function rt() { return window.__adobe_cep__; }

// ExtendScript is ES3: U+2028/U+2029 end a string literal there, unlike in JSON
function jsxArg(v) {
  return JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const EVAL_ERROR = 'EvalScript error.';
function isError(r) { return r == null || r === EVAL_ERROR; }

function evalRaw(code) {
  return new Promise((res) => {
    try { rt().evalScript(code, (r) => res(r)); } catch (e) { res(EVAL_ERROR); }
  });
}
// call('fqp_apply', 'Helvetica') -> evaluates fqp_apply("Helvetica") in host.jsx
function call(fn, ...args) { return evalRaw(fn + '(' + args.map(jsxArg).join(',') + ')'); }

function panelBackground() {
  const env = JSON.parse(rt().getHostEnvironment());
  return env.appSkinInfo.panelBackgroundColor.color;
}

function addEventListener(type, fn) {
  try { rt().addEventListener(type, fn); return true; } catch (e) { return false; }
}
function onThemeChange(fn) { return addEventListener('com.adobe.csxs.events.ThemeColorChanged', fn); }

// handler receives the clicked item's menuId
function setFlyoutMenu(xml, handler) {
  try {
    rt().invokeSync('setPanelFlyoutMenu', xml);
  } catch (e) { return false; }
  return addEventListener('com.adobe.csxs.events.flyoutMenuClicked', (ev) => {
    let d = ev && ev.data;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (e) { d = { menuId: (/menuId["\s:=>]+"?(\w+)/.exec(d) || [])[1] }; }
    }
    handler(d && d.menuId);
  });
}

function registerKeyEventsInterest(list) {
  try { rt().registerKeyEventsInterest(JSON.stringify(list)); return true; } catch (e) { return false; }
}

// Opens a web page in the user's browser. Only http(s): URLs can come from font files
// (name ID 14), which anyone can write, so other schemes are never handed to the OS.
function safeWebURL(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch (e) { return null; }
}
function openURL(u) {
  const ok = safeWebURL(u);
  if (!ok) return false;
  try { window.cep.util.openURLInDefaultBrowser(ok); return true; } catch (e) { return false; }
}

module.exports = {
  jsxArg, isError, evalRaw, call, panelBackground, onThemeChange,
  setFlyoutMenu, registerKeyEventsInterest, safeWebURL, openURL,
};
