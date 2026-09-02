/**
 * Expression Library - ExtendScript Host
 * After Effects tarafinda calisan tum mantik burada.
 *
 * Client (CEF) tarafi bu dosyadaki fonksiyonlari CSInterface.evalScript ile cagirir.
 * Tum fonksiyonlar HER ZAMAN bir JSON string dondurur -> { ok: Boolean, ... }
 */

/* global app, PropertyType, PropertyValueType */

// ============================================================================
// 1) MINI JSON SERIALIZER (ExtendScript'te native JSON yoktur)
// ============================================================================
var EXPJSON = (function () {

    function escapeString(s) {
        var out = '"';
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            var code = s.charCodeAt(i);
            switch (c) {
                case '"':  out += '\\"';  break;
                case '\\': out += '\\\\'; break;
                case '\b': out += '\\b';  break;
                case '\f': out += '\\f';  break;
                case '\n': out += '\\n';  break;
                case '\r': out += '\\r';  break;
                case '\t': out += '\\t';  break;
                default:
                    if (code < 32 || code > 126) {
                        var hex = code.toString(16);
                        while (hex.length < 4) { hex = '0' + hex; }
                        out += '\\u' + hex;
                    } else {
                        out += c;
                    }
            }
        }
        return out + '"';
    }

    function stringify(value) {
        var t = typeof value;
        if (value === null || value === undefined) { return 'null'; }
        if (t === 'number')  { return isFinite(value) ? String(value) : 'null'; }
        if (t === 'boolean') { return value ? 'true' : 'false'; }
        if (t === 'string')  { return escapeString(value); }

        if (value instanceof Array) {
            var arr = [];
            for (var i = 0; i < value.length; i++) { arr.push(stringify(value[i])); }
            return '[' + arr.join(',') + ']';
        }

        if (t === 'object') {
            var parts = [];
            for (var k in value) {
                if (!value.hasOwnProperty(k)) { continue; }
                if (typeof value[k] === 'function') { continue; }
                parts.push(escapeString(String(k)) + ':' + stringify(value[k]));
            }
            return '{' + parts.join(',') + '}';
        }
        return 'null';
    }

    return { stringify: stringify };
})();

function _ok(obj) {
    obj = obj || {};
    obj.ok = true;
    return EXPJSON.stringify(obj);
}

function _err(message, extra) {
    var obj = extra || {};
    obj.ok = false;
    obj.error = String(message);
    return EXPJSON.stringify(obj);
}


// ============================================================================
// 2) HEDEF OZELLIK (TARGET PROPERTY) HARITASI
// ============================================================================
var EXP_TRANSFORM_MAP = {
    'position':          'ADBE Position',
    'position (2d)':     'ADBE Position',
    'position / scale':  'ADBE Position',
    'anchor point':      'ADBE Anchor Point',
    'scale':             'ADBE Scale',
    'scale (y)':         'ADBE Scale',
    'rotation':          'ADBE Rotate Z',
    'orientation':       'ADBE Orientation',
    'opacity':           'ADBE Opacity'
};

// Transform disindaki hedefler icin isim/matchName adaylari (kucuk harf, "icerir" mantigi)
var EXP_SEARCH_MAP = {
    'source text':       ['adbe text document', 'source text'],
    'path':              ['adbe vector shape', 'adbe mask shape', 'path'],
    'stroke width':      ['adbe vector stroke width', 'stroke width'],
    'size':              ['adbe vector rect size', 'adbe vector ellipse size', 'adbe vector star outer radius', 'size'],
    'color':             ['adbe vector fill color', 'adbe vector stroke color', 'color'],
    'focus distance':    ['adbe camera focus distance', 'focus distance'],
    'blur length':       ['blur length', 'adbe motion blur length'],
    'ramp start/end':    ['start of ramp', 'adbe ramp start pt'],
    'ramp start':        ['start of ramp', 'adbe ramp start pt'],
    'ramp end':          ['end of ramp', 'adbe ramp end pt'],
    'bulge center':      ['bulge center', 'adbe bulge center'],
    'shadow angle':      ['direction', 'adbe drop shadow-0002'],
    'slider':            ['adbe slider control-0001', 'slider'],
    'expression selector': ['adbe text expressible amount', 'amount'],
    'roundness':         ['adbe vector rect roundness', 'roundness']
};

// Bu hedefler "serbest"tir: once secili property'ler, yoksa Position'a duser.
var EXP_GENERIC_TARGETS = {
    'any': true, 'any (1d)': true, 'keyframed': true, 'auto': true, '': true
};

function _normTarget(t) {
    return String(t === undefined || t === null ? '' : t).toLowerCase().replace(/^\s+|\s+$/g, '');
}

/** Bir property gercekten expression alabilir mi? */
function _isSettable(prop) {
    try {
        return !!prop && prop.propertyType === PropertyType.PROPERTY && prop.canSetExpression === true;
    } catch (e) {
        return false;
    }
}

/**
 * Katman agacinda (Effects, Contents, Masks, Text...) isim veya matchName'e gore
 * expression atanabilir ilk property'leri arar.
 */
function _deepFind(group, needles, results, depth) {
    if (depth > 8 || results.length > 0) { return results; }
    var count = 0;
    try { count = group.numProperties; } catch (e) { return results; }

    for (var i = 1; i <= count; i++) {
        var p = null;
        try { p = group.property(i); } catch (e) { continue; }
        if (!p) { continue; }

        var nm = '', mn = '';
        try { nm = String(p.name).toLowerCase(); } catch (e) {}
        try { mn = String(p.matchName).toLowerCase(); } catch (e) {}

        for (var n = 0; n < needles.length; n++) {
            var needle = needles[n];
            if ((mn && mn.indexOf(needle) !== -1) || (nm && nm === needle) || (nm && nm.indexOf(needle) !== -1)) {
                if (_isSettable(p)) {
                    results.push(p);
                    return results;
                }
            }
        }

        try {
            if (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP) {
                _deepFind(p, needles, results, depth + 1);
                if (results.length > 0) { return results; }
            }
        } catch (e) {}
    }
    return results;
}

/** Hedef etikete gore katman uzerindeki property'leri cozumler. */
function _resolveProps(layer, targetLabel) {
    var t = _normTarget(targetLabel);
    var found = [];

    // 1) Transform grubu (hizli yol)
    if (EXP_TRANSFORM_MAP.hasOwnProperty(t)) {
        try {
            var tg = layer.property('ADBE Transform Group');
            var p = tg ? tg.property(EXP_TRANSFORM_MAP[t]) : null;
            if (_isSettable(p)) { found.push(p); return found; }
            // Rotation 3D katmanda Z Rotation olabilir
            if (t === 'rotation' && tg) {
                var pz = tg.property('ADBE Rotate Z');
                if (_isSettable(pz)) { found.push(pz); return found; }
            }
        } catch (e) {}
    }

    // 2) Source Text (hizli yol)
    if (t === 'source text') {
        try {
            var tp = layer.property('ADBE Text Properties');
            var st = tp ? tp.property('ADBE Text Document') : null;
            if (_isSettable(st)) { found.push(st); return found; }
        } catch (e) {}
    }

    // 3) Derin arama
    var needles = EXP_SEARCH_MAP.hasOwnProperty(t) ? EXP_SEARCH_MAP[t] : (t ? [t] : []);
    if (needles.length) {
        var roots = ['ADBE Effect Parade', 'ADBE Root Vectors Group', 'ADBE Mask Parade',
                     'ADBE Text Properties', 'ADBE Camera Options Group', 'ADBE Light Options Group'];
        for (var r = 0; r < roots.length && found.length === 0; r++) {
            var root = null;
            try { root = layer.property(roots[r]); } catch (e) { root = null; }
            if (root) { _deepFind(root, needles, found, 0); }
        }
        if (found.length === 0) { _deepFind(layer, needles, found, 0); }
    }

    return found;
}

/** Timeline'da kullanicinin elle sectigi property'ler. */
function _selectedProps(layer) {
    var out = [];
    var sel = [];
    try { sel = layer.selectedProperties; } catch (e) { return out; }
    for (var i = 0; i < sel.length; i++) {
        if (_isSettable(sel[i])) { out.push(sel[i]); }
    }
    return out;
}

function _propPath(prop) {
    var parts = [];
    var p = prop;
    var guard = 0;
    try {
        while (p && guard < 20) {
            guard++;
            if (!p.parentProperty) { break; }
            parts.unshift(String(p.name));
            p = p.parentProperty;
        }
    } catch (e) {}
    return parts.join(' > ');
}


// ============================================================================
// 3) PUBLIC API - Client tarafindan cagrilir
// ============================================================================

/** Aktif kompozisyon + secim durumunu dondurur. */
function EXP_getContext() {
    try {
        var comp = app.project ? app.project.activeItem : null;
        if (!comp || !(comp instanceof CompItem)) {
            return _ok({ hasComp: false, compName: '', layers: [], props: [] });
        }

        var layers = [];
        var props = [];
        var sel = comp.selectedLayers;

        for (var i = 0; i < sel.length; i++) {
            var L = sel[i];
            layers.push({ index: L.index, name: String(L.name) });
            var sp = _selectedProps(L);
            for (var j = 0; j < sp.length; j++) {
                props.push({ layer: String(L.name), path: _propPath(sp[j]), name: String(sp[j].name) });
            }
        }

        return _ok({
            hasComp: true,
            compName: String(comp.name),
            numLayers: comp.numLayers,
            layers: layers,
            props: props
        });
    } catch (e) {
        return _err(e.toString());
    }
}

/**
 * Expression uygular.
 * payload = {
 *   code:   String  (uygulanacak expression),
 *   target: String  ("Position", "Source Text", "Any" ...),
 *   name:   String  (undo grubu / rapor icin),
 *   scope:  "auto" | "selection" | "target"
 * }
 */
function EXP_apply(payload) {
    var undoOpen = false;
    try {
        if (!payload || typeof payload.code !== 'string' || payload.code.length === 0) {
            return _err('Uygulanacak expression kodu bos.');
        }

        var comp = app.project ? app.project.activeItem : null;
        if (!comp || !(comp instanceof CompItem)) {
            return _err('Aktif bir kompozisyon bulunamadi.');
        }

        var selLayers = comp.selectedLayers;
        if (!selLayers || selLayers.length === 0) {
            return _err('Hicbir katman secili degil.');
        }

        var target = _normTarget(payload.target);
        var scope  = payload.scope || 'auto';
        var code   = payload.code;
        var label  = payload.name ? String(payload.name) : 'Expression';

        app.beginUndoGroup('Expression Library: ' + label);
        undoOpen = true;

        var applied = 0;
        var details = [];
        var skipped = [];

        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            var targets = [];

            var userSel = _selectedProps(layer);

            if (scope === 'selection') {
                targets = userSel;
            } else if (scope === 'target') {
                targets = _resolveProps(layer, target);
            } else {
                // auto: kullanici elle property sectiyse ona saygi duy,
                // aksi halde sablonun hedef property'sini bul.
                if (userSel.length > 0) {
                    targets = userSel;
                } else if (EXP_GENERIC_TARGETS.hasOwnProperty(target)) {
                    targets = _resolveProps(layer, 'position');
                } else {
                    targets = _resolveProps(layer, target);
                }
            }

            if (!targets || targets.length === 0) {
                skipped.push(String(layer.name) + ' - "' + (payload.target || 'Any') + '" ozelligi bulunamadi');
                continue;
            }

            for (var j = 0; j < targets.length; j++) {
                var prop = targets[j];
                try {
                    if (!_isSettable(prop)) {
                        skipped.push(String(layer.name) + ' - ' + String(prop.name) + ' expression kabul etmiyor');
                        continue;
                    }
                    prop.expression = code;
                    applied++;
                    details.push(String(layer.name) + ' > ' + String(prop.name));
                } catch (inner) {
                    skipped.push(String(layer.name) + ' > ' + String(prop.name) + ' - ' + inner.toString());
                }
            }
        }

        app.endUndoGroup();
        undoOpen = false;

        if (applied === 0) {
            return _err('Hicbir ozellige uygulanamadi.', { skipped: skipped });
        }

        return _ok({ applied: applied, details: details, skipped: skipped });

    } catch (e) {
        if (undoOpen) { try { app.endUndoGroup(); } catch (e2) {} }
        return _err(e.toString());
    }
}

/** Secili katmanlardaki hedef property'lerin expression'ini temizler. */
function EXP_clear(payload) {
    var undoOpen = false;
    try {
        var comp = app.project ? app.project.activeItem : null;
        if (!comp || !(comp instanceof CompItem)) { return _err('Aktif bir kompozisyon bulunamadi.'); }

        var selLayers = comp.selectedLayers;
        if (!selLayers || selLayers.length === 0) { return _err('Hicbir katman secili degil.'); }

        app.beginUndoGroup('Expression Library: Temizle');
        undoOpen = true;

        var cleared = 0;
        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            var targets = _selectedProps(layer);
            if (targets.length === 0 && payload && payload.target) {
                targets = _resolveProps(layer, payload.target);
            }
            for (var j = 0; j < targets.length; j++) {
                try {
                    if (targets[j].expressionEnabled || targets[j].expression !== '') {
                        targets[j].expression = '';
                        cleared++;
                    }
                } catch (e3) {}
            }
        }

        app.endUndoGroup();
        undoOpen = false;
        return _ok({ cleared: cleared });
    } catch (e) {
        if (undoOpen) { try { app.endUndoGroup(); } catch (e2) {} }
        return _err(e.toString());
    }
}

/** Panelden gelen kodu sadece dogrular (uygulamadan sozdizimi kontrolu). */
function EXP_validate(code) {
    try {
        if (typeof code !== 'string' || !code.length) { return _err('Kod bos.'); }
        // Basit denge kontrolu: parantez / kose parantez / suslu parantez
        var pairs = { '(': ')', '[': ']', '{': '}' };
        var stack = [];
        var inStr = null;
        for (var i = 0; i < code.length; i++) {
            var c = code.charAt(i);
            if (inStr) {
                if (c === '\\') { i++; continue; }
                if (c === inStr) { inStr = null; }
                continue;
            }
            if (c === '"' || c === "'") { inStr = c; continue; }
            if (pairs[c]) { stack.push(pairs[c]); continue; }
            if (c === ')' || c === ']' || c === '}') {
                if (stack.pop() !== c) { return _err('Sozdizimi hatasi: dengesiz "' + c + '" (karakter ' + (i + 1) + ')'); }
            }
        }
        if (stack.length) { return _err('Sozdizimi hatasi: kapanmamis parantez var.'); }
        return _ok({ valid: true });
    } catch (e) {
        return _err(e.toString());
    }
}
