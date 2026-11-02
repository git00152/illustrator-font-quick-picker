// Font Quick Picker - host side (ExtendScript / ES3)

function fqp_esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\x00-\x1f]/g, " ");
}

function fqp_count() {
    return String(app.textFonts.length);
}

// Returns JSON: [["PostScriptName","Family","Style","QuickDrawName"], ...]
// qdName is the localized menu name on some systems (e.g. Japanese names)
function fqp_list() {
    var tf = app.textFonts;
    var n = tf.length;
    var a = [];
    for (var i = 0; i < n; i++) {
        try {
            var f = tf[i];
            var qd = "";
            try { qd = f.qdName; } catch (e2) {}
            a.push('["' + fqp_esc(f.name) + '","' + fqp_esc(f.family) + '","' + fqp_esc(f.style) + '","' + fqp_esc(qd) + '"]');
        } catch (e) {
            // skip fonts Illustrator cannot describe
        }
    }
    return "[" + a.join(",") + "]";
}

// Illustrator can silently ignore an assignment, so read it back
function fqp_setFont(range, font) {
    range.characterAttributes.textFont = font;
    try {
        return range.characterAttributes.textFont.name === font.name;
    } catch (e) {
        return true; // mixed attributes cannot be read back
    }
}

function fqp_applyItem(item, font) {
    var c = 0;
    try {
        if (item.typename === "TextFrame") {
            return fqp_setFont(item.textRange, font) ? 1 : 0;
        }
        if (item.typename === "GroupItem") {
            for (var j = 0; j < item.pageItems.length; j++) {
                c += fqp_applyItem(item.pageItems[j], font);
            }
        }
    } catch (e) {
        // locked or hidden items are skipped
    }
    return c;
}

// Returns "OK:<count>" or "ERR:<code>"
function fqp_apply(ps) {
    if (app.documents.length === 0) return "ERR:NODOC";
    var font;
    try {
        font = app.textFonts.getByName(ps);
    } catch (e) {
        return "ERR:NOFONT";
    }
    var sel = app.activeDocument.selection;
    if (sel && sel.typename === "TextRange") {
        try {
            return fqp_setFont(sel, font) ? "OK:1" : "ERR:NOTAPPLIED";
        } catch (e) {
            return "ERR:EXC " + e.message;
        }
    }
    if (!sel || sel.length === 0) return "ERR:NOSEL";
    var count = 0, hasText = false;
    for (var i = 0; i < sel.length; i++) {
        try { if (fqp_hasText(sel[i])) hasText = true; } catch (e) {}
        count += fqp_applyItem(sel[i], font);
    }
    if (count > 0) return "OK:" + count;
    return hasText ? "ERR:NOTAPPLIED" : "ERR:NOTEXT";
}

function fqp_hasText(item) {
    if (item.typename === "TextFrame") return true;
    if (item.typename === "GroupItem") {
        for (var j = 0; j < item.pageItems.length; j++) {
            if (fqp_hasText(item.pageItems[j])) return true;
        }
    }
    return false;
}

function fqp_firstFrame(item) {
    if (item.typename === "TextFrame") return item;
    if (item.typename === "GroupItem") {
        for (var j = 0; j < item.pageItems.length; j++) {
            var f = fqp_firstFrame(item.pageItems[j]);
            if (f) return f;
        }
    }
    return null;
}

// Contents of the selected text (first 200 chars, line breaks as spaces), or ""
function fqp_selText() {
    try {
        if (app.documents.length === 0) return "";
        var s = app.activeDocument.selection;
        var t = "";
        if (s && s.typename === "TextRange") t = s.contents;
        else if (s && s.length > 0) {
            for (var i = 0; i < s.length && !t; i++) {
                var f = fqp_firstFrame(s[i]);
                if (f) t = f.contents;
            }
        }
        return String(t).replace(/[\r\n\u0003]+/g, " ").substr(0, 200);
    } catch (e) {
        return "";
    }
}

// Renders previews for fonts the panel cannot draw itself (Adobe Fonts available only
// to Adobe apps, composite fonts): Illustrator sets `text` in each font in a temporary
// document and captures it as a transparent PNG. items: [[postScriptName, pngPath], ...]
// The temporary document is closed unsaved and the previous document is re-activated.
// res: capture resolution in ppi (72 x the panel's device pixel ratio), so the PNG is
// shown 1:1 without resampling. Returns "OK:<rendered count>".
// gray: text color 0-255, matching the panel theme (no recoloring in the panel).
function fqp_render(text, size, res, gray, items) {
    var prev = app.documents.length ? app.activeDocument : null;
    var oldLevel = app.userInteractionLevel;
    var doc = null, done = 0;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    try {
        doc = app.documents.add(DocumentColorSpace.RGB, 2000, 400);
        var ink = new RGBColor();
        ink.red = gray; ink.green = gray; ink.blue = gray;
        var opts = new ImageCaptureOptions();
        opts.antiAliasing = true;
        opts.transparency = true;
        opts.resolution = res;
        for (var i = 0; i < items.length; i++) {
            var tf = null;
            try {
                tf = doc.textFrames.add();
                tf.contents = text;
                var ca = tf.textRange.characterAttributes;
                ca.textFont = app.textFonts.getByName(items[i][0]);
                ca.size = size;
                ca.fillColor = ink;
                var b = tf.visibleBounds;   // [left, top, right, bottom]
                doc.imageCapture(new File(items[i][1]), [b[0] - 2, b[1] + 2, b[2] + 2, b[3] - 2], opts);
                done++;
            } catch (e) {
                // font missing or capture failed: the panel shows it as unavailable
            }
            if (tf) { try { tf.remove(); } catch (e2) {} }
        }
    } catch (e) {
    }
    if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {} }
    if (prev) { try { prev.activate(); } catch (e) {} }
    app.userInteractionLevel = oldLevel;
    return "OK:" + done;
}

// PostScript name of the first selected text, or ""
function fqp_current() {
    try {
        if (app.documents.length === 0) return "";
        var s = app.activeDocument.selection;
        var tr = null;
        if (s && s.typename === "TextRange") tr = s;
        else if (s && s.length > 0 && s[0].typename === "TextFrame") tr = s[0].textRange;
        if (!tr) return "";
        return tr.characterAttributes.textFont.name;
    } catch (e) {
        return "";
    }
}
