// Font Quick Picker - host side (ExtendScript / ES3)

function fqp_esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\x00-\x1f]/g, " ");
}

function fqp_count() {
    return String(app.textFonts.length);
}

// Returns JSON: [["PostScriptName","Family","Style"], ...]
function fqp_list() {
    var tf = app.textFonts;
    var n = tf.length;
    var a = [];
    for (var i = 0; i < n; i++) {
        try {
            var f = tf[i];
            a.push('["' + fqp_esc(f.name) + '","' + fqp_esc(f.family) + '","' + fqp_esc(f.style) + '"]');
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
