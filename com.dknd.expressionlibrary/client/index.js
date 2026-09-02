/**
 * Expression Library - Client (CEF / Node.js)
 * ---------------------------------------------------------------------------
 * Sorumluluklar:
 *   - Kutuphane verisini yonetmek (dahili starter pack + kullanici kayitlari)
 *   - Node 'fs' ile kullanici klasorune kalici JSON yazmak/okumak
 *   - Arama + kategori filtreleme
 *   - {{parametre=varsayilan}} sablonlarini cozumleyip modal acmak
 *   - CSInterface uzerinden ExtendScript (host/index.jsx) fonksiyonlarini cagirmak
 */
(function () {
'use strict';

// ===========================================================================
// 0. TEMEL KURULUM
// ===========================================================================
var cs = new CSInterface();

// Node modulleri (manifest'te --enable-nodejs ve --mixed-context acik olmali)
var nodeRequire = (typeof window.cep_node !== 'undefined' && window.cep_node.require)
    ? window.cep_node.require
    : (typeof require !== 'undefined' ? require : null);

var fs   = null;
var path = null;
try {
    if (nodeRequire) {
        fs   = nodeRequire('fs');
        path = nodeRequire('path');
    }
} catch (e) {
    fs = null;
}

var STORE_DIR  = null;
var STORE_FILE = null;

function initStoragePaths() {
    try {
        var base = cs.getSystemPath(SystemPath.USER_DATA);
        STORE_DIR  = joinPath(base, 'ExpressionLibrary');
        STORE_FILE = joinPath(STORE_DIR, 'library.json');
    } catch (e) {
        STORE_DIR = STORE_FILE = null;
    }
}

function joinPath(a, b) {
    if (path && path.join) { return path.join(a, b); }
    var sep = (a.indexOf('\\') !== -1 && a.indexOf('/') === -1) ? '\\' : '/';
    return a.replace(/[\\\/]+$/, '') + sep + b;
}


// ===========================================================================
// 1. DURUM (STATE)
// ===========================================================================
var STARTER = (window.EXP_STARTER_PACK || []).map(function (it) {
    it.builtin = true;
    return it;
});

var state = {
    userItems: [],      // kullanicinin ekledigi/duzenledigi kayitlar
    query: '',
    category: 'Tumu',
    editingId: null,
    pending: null       // parametre modali icin bekleyen kayit
};

var PROP_OPTIONS = [
    'Any', 'Any (1D)', 'Position', 'Anchor Point', 'Scale', 'Rotation', 'Opacity',
    'Source Text', 'Path', 'Stroke Width', 'Size', 'Color', 'Roundness',
    'Keyframed', 'Slider', 'Expression Selector', 'Focus Distance',
    'Blur Length', 'Ramp Start', 'Ramp End', 'Bulge Center', 'Shadow Angle'
];

function allItems() {
    return STARTER.concat(state.userItems);
}


// ===========================================================================
// 2. KALICI DEPOLAMA (PERSISTENCE)
// ===========================================================================
function ensureDir() {
    if (!fs || !STORE_DIR) { return false; }
    try {
        if (!fs.existsSync(STORE_DIR)) { fs.mkdirSync(STORE_DIR, { recursive: true }); }
        return true;
    } catch (e) {
        return false;
    }
}

function loadLibrary() {
    // 1. tercih: Node fs
    if (fs && STORE_FILE) {
        try {
            if (fs.existsSync(STORE_FILE)) {
                var raw = fs.readFileSync(STORE_FILE, 'utf8');
                var data = JSON.parse(raw);
                if (data && data.items instanceof Array) {
                    state.userItems = data.items;
                    return;
                }
            }
        } catch (e) {
            toast('Kutuphane okunamadi: ' + e.message, 'err');
        }
    }
    // 2. tercih (yedek): localStorage
    try {
        var ls = window.localStorage.getItem('expressionLibrary');
        if (ls) {
            var d2 = JSON.parse(ls);
            if (d2 && d2.items instanceof Array) { state.userItems = d2.items; }
        }
    } catch (e2) {}
}

function saveLibrary(silent) {
    var payload = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), items: state.userItems }, null, 2);
    var saved = false;

    if (fs && STORE_FILE && ensureDir()) {
        try {
            fs.writeFileSync(STORE_FILE, payload, 'utf8');
            saved = true;
        } catch (e) {
            toast('Diske yazilamadi: ' + e.message, 'err');
        }
    }
    try { window.localStorage.setItem('expressionLibrary', payload); } catch (e2) {}

    if (!silent) { toast(saved ? 'Kaydedildi' : 'Kaydedildi (yerel onbellek)', 'ok'); }
    return saved;
}


// ===========================================================================
// 3. PARAMETRE MOTORU  {{ad=varsayilan}}
// ===========================================================================
var PARAM_RE = /\{\{\s*([^}=\s][^}=]*?)\s*(?:=\s*([^}]*?)\s*)?\}\}/g;

/** Kod icindeki benzersiz parametreleri sirali olarak dondurur. */
function parseParams(code) {
    var out = [];
    var seen = {};
    var m;
    PARAM_RE.lastIndex = 0;
    while ((m = PARAM_RE.exec(code)) !== null) {
        var name = m[1];
        if (Object.prototype.hasOwnProperty.call(seen, name)) { continue; }
        seen[name] = true;
        out.push({ name: name, def: (m[2] === undefined ? '' : m[2]) });
    }
    return out;
}

/** values = { paramAdi: "deger" } ; verilmeyenler icin varsayilan kullanilir. */
function resolveCode(code, values) {
    values = values || {};
    return code.replace(PARAM_RE, function (full, name, def) {
        var v = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
        if (v === undefined || v === null || String(v).length === 0) {
            return def === undefined ? '' : def;
        }
        return String(v);
    });
}


// ===========================================================================
// 4. EXTENDSCRIPT KOPRUSU
// ===========================================================================
/** JSON'u ExtendScript'in guvenle ayristirabilecegi bir literal haline getirir. */
function toJsxLiteral(obj) {
    return JSON.stringify(obj).replace(/[\u2028\u2029]/g, function (c) {
        return '\\u' + c.charCodeAt(0).toString(16);
    });
}

function callHost(fn, arg, cb) {
    var script = arg === undefined ? fn + '()' : fn + '(' + toJsxLiteral(arg) + ')';
    cs.evalScript(script, function (raw) {
        var res;
        try {
            res = JSON.parse(raw);
        } catch (e) {
            res = { ok: false, error: 'Host yaniti okunamadi: ' + String(raw).substring(0, 200) };
        }
        if (cb) { cb(res); }
    });
}


// ===========================================================================
// 5. DOM KISAYOLLARI
// ===========================================================================
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined && text !== null) { n.textContent = text; }
    return n;
}

var toastTimer = null;
function toast(msg, kind) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    // reflow -> gecis animasyonu
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        t.classList.remove('show');
        setTimeout(function () { t.hidden = true; }, 200);
    }, 2600);
}


// ===========================================================================
// 6. RENDER
// ===========================================================================
// Turkce aksanlari katlar: kullanici "dongu" da yazsa "döngü" de yazsa ayni sonucu alir.
var TR_FOLD = { '\u00e7': 'c', '\u00c7': 'c', '\u011f': 'g', '\u011e': 'g', '\u0131': 'i', '\u0130': 'i',
                '\u00f6': 'o', '\u00d6': 'o', '\u015f': 's', '\u015e': 's', '\u00fc': 'u', '\u00dc': 'u' };

function fold(s) {
    return String(s).replace(/[\u00e7\u00c7\u011f\u011e\u0131\u0130\u00f6\u00d6\u015f\u015e\u00fc\u00dc]/g,
        function (c) { return TR_FOLD[c]; }).toLowerCase();
}

function matches(item, q) {
    if (!q) { return true; }
    var hay = fold(item.name + ' ' + item.cat + ' ' + item.prop + ' ' + (item.desc || '') + ' ' + item.code);
    var words = fold(q).split(/\s+/);
    for (var i = 0; i < words.length; i++) {
        if (words[i] && hay.indexOf(words[i]) === -1) { return false; }
    }
    return true;
}

function visibleItems() {
    var q = state.query;
    return allItems().filter(function (it) {
        if (state.category === 'Kendi Kayitlarim') { return !it.builtin && matches(it, q); }
        if (state.category !== 'Tumu' && it.cat !== state.category) { return false; }
        return matches(it, q);
    });
}

function renderChips() {
    var bar = $('chipBar');
    bar.innerHTML = '';

    var counts = {};
    allItems().forEach(function (it) { counts[it.cat] = (counts[it.cat] || 0) + 1; });

    var cats = Object.keys(counts).sort();
    var list = [{ label: 'Tumu', n: allItems().length }];
    if (state.userItems.length) { list.push({ label: 'Kendi Kayitlarim', n: state.userItems.length }); }
    cats.forEach(function (c) { list.push({ label: c, n: counts[c] }); });

    list.forEach(function (c) {
        var b = el('button', 'chip' + (state.category === c.label ? ' active' : ''));
        b.appendChild(document.createTextNode(c.label));
        b.appendChild(el('span', 'n', c.n));
        b.addEventListener('click', function () {
            state.category = c.label;
            renderChips();
            renderList();
        });
        bar.appendChild(b);
    });
}

function renderList() {
    var wrap = $('cardList');
    wrap.innerHTML = '';

    var items = visibleItems();
    $('emptyState').hidden = items.length > 0;
    $('countLabel').textContent = items.length + ' expression';

    items.forEach(function (item) {
        wrap.appendChild(buildCard(item));
    });
}

function buildCard(item) {
    var params = parseParams(item.code);

    var card = el('div', 'card');

    var top = el('div', 'card-top');
    var title = el('div', 'card-title');

    var nameRow = el('div', 'card-name');
    nameRow.appendChild(document.createTextNode(item.name));
    nameRow.appendChild(el('span', 'badge prop', item.prop || 'Any'));
    if (!item.builtin) { nameRow.appendChild(el('span', 'badge mine', 'ozel')); }
    if (params.length) { nameRow.appendChild(el('span', 'badge param', params.length + ' parametre')); }
    title.appendChild(nameRow);

    if (item.desc) { title.appendChild(el('p', 'card-desc', item.desc)); }
    if (item.req && item.req !== 'Yok') { title.appendChild(el('div', 'card-req', 'Gereksinim: ' + item.req)); }

    top.appendChild(title);
    card.appendChild(top);

    var pre = el('pre', 'card-code', item.code);
    card.appendChild(pre);

    // --- eylemler
    var actions = el('div', 'card-actions');

    var applyBtn = el('button', 'apply-btn', 'Uygula');
    applyBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (params.length) { openParamModal(item, params); }
        else { applyItem(item, item.code); }
    });
    actions.appendChild(applyBtn);

    if (params.length) {
        var fastBtn = el('button', 'mini-btn', 'Varsayilanla');
        fastBtn.title = 'Parametre sormadan varsayilan degerlerle uygula';
        fastBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            applyItem(item, resolveCode(item.code, {}));
        });
        actions.appendChild(fastBtn);
    }

    actions.appendChild(el('span', 'spacer'));

    var copyBtn = el('button', 'mini-btn', 'Kopyala');
    copyBtn.title = 'Cozumlenmis kodu panoya kopyala';
    copyBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        copyToClipboard(resolveCode(item.code, {}));
    });
    actions.appendChild(copyBtn);

    var editBtn = el('button', 'mini-btn', item.builtin ? 'Turet' : 'Duzenle');
    editBtn.title = item.builtin ? 'Kopyasini olusturup duzenle' : 'Duzenle';
    editBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openEditor(item, item.builtin);
    });
    actions.appendChild(editBtn);

    if (!item.builtin) {
        var delBtn = el('button', 'mini-btn danger', 'Sil');
        delBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (window.confirm('"' + item.name + '" silinsin mi?')) { deleteItem(item.id); }
        });
        actions.appendChild(delBtn);
    }

    card.appendChild(actions);

    // Karta tiklayinca kodu ac/kapat
    card.addEventListener('click', function () { card.classList.toggle('open'); });

    return card;
}


// ===========================================================================
// 7. UYGULAMA (APPLY)
// ===========================================================================
function applyItem(item, code) {
    var payload = {
        code:   code,
        target: item.prop || 'Any',
        name:   item.name,
        scope:  $('scopeSelect').value
    };

    callHost('EXP_apply', payload, function (res) {
        if (!res.ok) {
            var extra = (res.skipped && res.skipped.length) ? ' (' + res.skipped[0] + ')' : '';
            toast(res.error + extra, 'err');
            return;
        }
        var msg = res.applied + ' ozellige uygulandi';
        if (res.skipped && res.skipped.length) { msg += ' / ' + res.skipped.length + ' atlandi'; }
        toast(msg, 'ok');
        refreshContext();
    });
}

function copyToClipboard(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        toast('Kod panoya kopyalandi', 'ok');
    } catch (e) {
        toast('Kopyalanamadi', 'err');
    }
    document.body.removeChild(ta);
}


// ===========================================================================
// 8. PARAMETRE MODALI
// ===========================================================================
function openParamModal(item, params) {
    state.pending = { item: item, params: params };

    $('modalTitle').textContent = item.name;
    var fields = $('modalFields');
    fields.innerHTML = '';

    params.forEach(function (p) {
        var label = el('label');
        var cap = el('span', 'pname', p.name);
        label.appendChild(cap);

        var input = document.createElement('input');
        input.type = 'text';
        input.value = p.def;
        input.setAttribute('data-param', p.name);
        input.addEventListener('input', updateModalPreview);
        label.appendChild(input);

        fields.appendChild(label);
    });

    updateModalPreview();
    $('modalBackdrop').hidden = false;

    var first = fields.querySelector('input');
    if (first) { first.focus(); first.select(); }
}

function collectModalValues() {
    var vals = {};
    var inputs = $('modalFields').querySelectorAll('input[data-param]');
    for (var i = 0; i < inputs.length; i++) {
        vals[inputs[i].getAttribute('data-param')] = inputs[i].value;
    }
    return vals;
}

function updateModalPreview() {
    if (!state.pending) { return; }
    $('modalPreview').textContent = resolveCode(state.pending.item.code, collectModalValues());
}

function closeModal() {
    $('modalBackdrop').hidden = true;
    state.pending = null;
}


// ===========================================================================
// 9. EDITOR
// ===========================================================================
function showView(which) {
    $('viewList').hidden   = (which !== 'list');
    $('viewEditor').hidden = (which !== 'editor');
}

function openEditor(item, asCopy) {
    var isNew = !item;

    $('editorTitle').textContent = isNew ? 'Yeni Expression' : (asCopy ? 'Kopyadan Turet' : 'Duzenle');
    $('fName').value = isNew ? '' : (item.name + (asCopy ? ' (kopya)' : ''));
    $('fCat').value  = isNew ? '' : item.cat;
    $('fDesc').value = isNew ? '' : (item.desc || '');
    $('fReq').value  = isNew ? '' : (item.req || '');
    $('fCode').value = isNew ? '' : item.code;

    fillPropSelect(isNew ? 'Any' : (item.prop || 'Any'));
    fillCatDatalist();

    state.editingId = (isNew || asCopy) ? null : item.id;
    $('btnDelete').hidden = (isNew || asCopy);

    updateParamHint();
    showView('editor');
    $('fName').focus();
}

function fillPropSelect(selected) {
    var sel = $('fProp');
    sel.innerHTML = '';
    var opts = PROP_OPTIONS.slice();
    if (selected && opts.indexOf(selected) === -1) { opts.unshift(selected); }
    opts.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p;
        o.textContent = p;
        if (p === selected) { o.selected = true; }
        sel.appendChild(o);
    });
}

function fillCatDatalist() {
    var dl = $('catList');
    dl.innerHTML = '';
    var seen = {};
    allItems().forEach(function (it) {
        if (seen[it.cat]) { return; }
        seen[it.cat] = true;
        var o = document.createElement('option');
        o.value = it.cat;
        dl.appendChild(o);
    });
}

function updateParamHint() {
    var params = parseParams($('fCode').value);
    var hint = $('paramHint');
    hint.innerHTML = '';
    if (!params.length) {
        hint.textContent = 'Parametre yok. Ornek: wiggle({{frekans=2}}, {{genlik=30}});';
        return;
    }
    hint.appendChild(document.createTextNode('Tespit edilen parametreler: '));
    params.forEach(function (p, i) {
        if (i) { hint.appendChild(document.createTextNode(', ')); }
        hint.appendChild(el('b', null, p.name + ' = ' + p.def));
    });
}

function saveFromEditor() {
    var name = $('fName').value.replace(/^\s+|\s+$/g, '');
    var code = $('fCode').value.replace(/^\s+|\s+$/g, '');

    if (!name) { toast('Ad alani bos birakilamaz', 'err'); $('fName').focus(); return; }
    if (!code) { toast('Expression kodu bos birakilamaz', 'err'); $('fCode').focus(); return; }

    // Host tarafinda basit sozdizimi (parantez dengesi) kontrolu
    callHost('EXP_validate', resolveCode(code, {}), function (res) {
        if (!res.ok) {
            toast(res.error, 'err');
            return;
        }

        var record = {
            id:      state.editingId || ('u' + Date.now() + Math.floor(Math.random() * 1000)),
            name:    name,
            cat:     $('fCat').value.replace(/^\s+|\s+$/g, '') || 'Ozel',
            prop:    $('fProp').value,
            desc:    $('fDesc').value.replace(/^\s+|\s+$/g, ''),
            req:     $('fReq').value.replace(/^\s+|\s+$/g, '') || 'Yok',
            code:    code,
            builtin: false
        };

        if (state.editingId) {
            for (var i = 0; i < state.userItems.length; i++) {
                if (state.userItems[i].id === state.editingId) { state.userItems[i] = record; break; }
            }
        } else {
            state.userItems.push(record);
        }

        saveLibrary();
        state.editingId = null;
        renderChips();
        renderList();
        showView('list');
    });
}

function deleteItem(id) {
    state.userItems = state.userItems.filter(function (it) { return it.id !== id; });
    saveLibrary(true);
    if (state.category === 'Kendi Kayitlarim' && !state.userItems.length) { state.category = 'Tumu'; }
    renderChips();
    renderList();
    toast('Silindi', 'ok');
}


// ===========================================================================
// 10. DISA / ICE AKTAR
// ===========================================================================
function exportLibrary() {
    var json = JSON.stringify({ version: 1, items: state.userItems }, null, 2);
    if (!state.userItems.length) { toast('Disa aktarilacak ozel kayit yok', 'err'); return; }

    try {
        var r = window.cep.fs.showSaveDialogEx('Kutuphaneyi disa aktar', '', ['json'], 'expression-library.json');
        if (r && r.data) {
            if (fs) { fs.writeFileSync(r.data, json, 'utf8'); }
            else { window.cep.fs.writeFile(r.data, json); }
            toast('Disa aktarildi', 'ok');
            return;
        }
    } catch (e) {}
    copyToClipboard(json);
}

function importLibrary() {
    try {
        var r = window.cep.fs.showOpenDialogEx(false, false, 'JSON kutuphanesi sec', '', ['json']);
        if (!r || !r.data || !r.data.length) { return; }
        var file = (r.data instanceof Array) ? r.data[0] : r.data;
        var raw = fs ? fs.readFileSync(file, 'utf8') : window.cep.fs.readFile(file).data;
        var data = JSON.parse(raw);
        var incoming = (data && data.items instanceof Array) ? data.items : (data instanceof Array ? data : null);
        if (!incoming) { toast('Gecersiz dosya bicimi', 'err'); return; }

        var existing = {};
        state.userItems.forEach(function (it) { existing[it.id] = true; });

        var added = 0;
        incoming.forEach(function (it) {
            if (!it || !it.name || !it.code) { return; }
            var rec = {
                id:      (it.id && !existing[it.id]) ? it.id : ('u' + Date.now() + Math.floor(Math.random() * 10000) + added),
                name:    String(it.name),
                cat:     String(it.cat || 'Ozel'),
                prop:    String(it.prop || 'Any'),
                desc:    String(it.desc || ''),
                req:     String(it.req || 'Yok'),
                code:    String(it.code),
                builtin: false
            };
            state.userItems.push(rec);
            added++;
        });

        saveLibrary(true);
        renderChips();
        renderList();
        toast(added + ' kayit ice aktarildi', 'ok');
    } catch (e) {
        toast('Ice aktarilamadi: ' + e.message, 'err');
    }
}


// ===========================================================================
// 11. AE BAGLAM DURUMU
// ===========================================================================
var lastContextKey = '';

function refreshContext() {
    callHost('EXP_getContext', undefined, function (res) {
        var line = $('statusLine');
        if (!res.ok) {
            line.textContent = 'Host hatasi: ' + res.error;
            line.className = 'status warn';
            return;
        }
        if (!res.hasComp) {
            line.textContent = 'Aktif kompozisyon yok';
            line.className = 'status warn';
            return;
        }
        var txt = res.compName + ' - ' + res.layers.length + ' katman secili';
        if (res.props.length) { txt += ', ' + res.props.length + ' ozellik'; }
        line.textContent = txt;
        line.className = 'status' + (res.layers.length ? ' ok' : ' warn');
    });
}


// ===========================================================================
// 12. OLAY BAGLAMA (EVENT WIRING)
// ===========================================================================
function wire() {
    // --- arama
    var search = $('searchInput');
    search.addEventListener('input', function () {
        state.query = search.value.replace(/^\s+|\s+$/g, '');
        $('btnClearSearch').classList.toggle('show', state.query.length > 0);
        renderList();
    });
    $('btnClearSearch').addEventListener('click', function () {
        search.value = '';
        state.query = '';
        $('btnClearSearch').classList.remove('show');
        renderList();
        search.focus();
    });

    // --- ust bar
    $('btnRefresh').addEventListener('click', refreshContext);
    $('btnNew').addEventListener('click', function () { openEditor(null, false); });

    // --- editor
    $('btnBack').addEventListener('click', function () { showView('list'); });
    $('btnCancel').addEventListener('click', function () { showView('list'); });
    $('btnSave').addEventListener('click', saveFromEditor);
    $('fCode').addEventListener('input', updateParamHint);
    $('btnDelete').addEventListener('click', function () {
        if (state.editingId && window.confirm('Bu expression silinsin mi?')) {
            deleteItem(state.editingId);
            state.editingId = null;
            showView('list');
        }
    });

    // --- modal
    $('btnModalClose').addEventListener('click', closeModal);
    $('modalBackdrop').addEventListener('click', function (ev) {
        if (ev.target === $('modalBackdrop')) { closeModal(); }
    });
    $('btnUseDefaults').addEventListener('click', function () {
        if (!state.pending) { return; }
        var item = state.pending.item;
        closeModal();
        applyItem(item, resolveCode(item.code, {}));
    });
    $('btnApplyParams').addEventListener('click', function () {
        if (!state.pending) { return; }
        var item = state.pending.item;
        var code = resolveCode(item.code, collectModalValues());
        closeModal();
        applyItem(item, code);
    });

    // --- alt bar
    $('btnExport').addEventListener('click', exportLibrary);
    $('btnImport').addEventListener('click', importLibrary);
    $('btnClearExp').addEventListener('click', function () {
        callHost('EXP_clear', { target: '' }, function (res) {
            if (!res.ok) { toast(res.error, 'err'); return; }
            toast(res.cleared + ' expression temizlendi', 'ok');
        });
    });

    // --- klavye
    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
            if (!$('modalBackdrop').hidden) { closeModal(); }
            else if (!$('viewEditor').hidden) { showView('list'); }
        }
        if (ev.key === 'Enter' && !$('modalBackdrop').hidden) {
            ev.preventDefault();
            $('btnApplyParams').click();
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'f') {
            ev.preventDefault();
            showView('list');
            search.focus();
            search.select();
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's' && !$('viewEditor').hidden) {
            ev.preventDefault();
            saveFromEditor();
        }
    });

    // --- AE tarafindaki secim degisimini yakala
    window.addEventListener('focus', refreshContext);
    setInterval(refreshContext, 2000);
}


// ===========================================================================
// 13. BASLANGIC
// ===========================================================================
function boot() {
    initStoragePaths();
    loadLibrary();
    wire();
    renderChips();
    renderList();
    refreshContext();

    if (!fs) {
        toast('Node.js kapali: kayitlar yerel onbellege yazilacak', 'err');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

})();
