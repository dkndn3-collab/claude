/**
 * Expression Library - Client (CEF / Node.js)
 * ---------------------------------------------------------------------------
 * Katmanlar:
 *   1) Depolama    - Node 'fs' ile USER_DATA altina kalici JSON (localStorage yedegi)
 *   2) Parametre   - {{ad=varsayilan}} ayristirma / cozumleme
 *   3) Kopru       - CSInterface.evalScript ile host/index.jsx cagrilari
 *   4) UI          - liste, arama, cipler, kart secimi, modal, editor, status bar
 *
 * Not: ES5 sozdizimi kullanilir (CEP 9'un eski Chromium'u icin guvenli taban).
 */
(function () {
'use strict';

// ===========================================================================
// 1. KURULUM
// ===========================================================================
var cs = new CSInterface();

var nodeRequire = (typeof window.cep_node !== 'undefined' && window.cep_node.require)
    ? window.cep_node.require
    : (typeof require !== 'undefined' ? require : null);

var fs = null, npath = null;
try {
    if (nodeRequire) { fs = nodeRequire('fs'); npath = nodeRequire('path'); }
} catch (e) { fs = null; }

var STORE_DIR = null, STORE_FILE = null;

function joinPath(a, b) {
    if (npath && npath.join) { return npath.join(a, b); }
    var sep = (a.indexOf('\\') !== -1 && a.indexOf('/') === -1) ? '\\' : '/';
    return a.replace(/[\\\/]+$/, '') + sep + b;
}

function initStoragePaths() {
    try {
        var base = cs.getSystemPath(SystemPath.USER_DATA);
        STORE_DIR = joinPath(base, 'ExpressionLibrary');
        STORE_FILE = joinPath(STORE_DIR, 'library.json');
    } catch (e) { STORE_DIR = STORE_FILE = null; }
}


// ===========================================================================
// 2. DURUM
// ===========================================================================
var STARTER = (window.EXP_STARTER_PACK || []).map(function (it) { it.builtin = true; return it; });

var state = {
    userItems: [],
    favs: {},                 // { id: true }
    settings: { scope: 'auto', skip: false },
    query: '',
    category: 'All',
    activeId: null,           // secili kart
    visible: [],              // o an listelenen kayitlar
    editingId: null,
    pending: null,            // parametre modali icin
    lastError: ''
};

var PROP_OPTIONS = [
    'Any', 'Any (1D)', 'Position', 'Anchor Point', 'Scale', 'Rotation', 'Opacity',
    'Source Text', 'Path', 'Stroke Width', 'Size', 'Color', 'Roundness',
    'Keyframed', 'Slider', 'Expression Selector', 'Focus Distance',
    'Blur Length', 'Ramp Start', 'Ramp End', 'Bulge Center', 'Shadow Angle'
];

/** Dar panelde yer kazanmak icin kisa cip etiketleri. */
var CAT_LABEL = {
    'Transformation': 'Layout',
    'Motion': 'Motion',
    'Looping': 'Loops',
    'Text & Typography': 'Text',
    'Randomness': 'Random',
    'Shape Layers': 'Shape',
    'Parenting': 'Parent',
    'Physics & Elasticity': 'Physics',
    'Effects & Color': 'Color',
    '3D & Camera': '3D',
    'Character Animation': 'Character',
    'Audio & Reactive': 'Audio',
    'Metadata': 'Meta'
};

function catLabel(c) { return CAT_LABEL[c] || c; }
function allItems() { return STARTER.concat(state.userItems); }
function findItem(id) {
    var all = allItems();
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) { return all[i]; } }
    return null;
}


// ===========================================================================
// 3. KALICI DEPOLAMA
// ===========================================================================
function ensureDir() {
    if (!fs || !STORE_DIR) { return false; }
    try {
        if (!fs.existsSync(STORE_DIR)) { fs.mkdirSync(STORE_DIR, { recursive: true }); }
        return true;
    } catch (e) { return false; }
}

function adoptData(data) {
    if (!data) { return false; }
    if (data.items instanceof Array) { state.userItems = data.items; }
    if (data.favs instanceof Array) {
        state.favs = {};
        for (var i = 0; i < data.favs.length; i++) { state.favs[data.favs[i]] = true; }
    }
    if (data.settings) {
        if (data.settings.scope) { state.settings.scope = data.settings.scope; }
        state.settings.skip = !!data.settings.skip;
    }
    return true;
}

function loadLibrary() {
    if (fs && STORE_FILE) {
        try {
            if (fs.existsSync(STORE_FILE)) {
                if (adoptData(JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')))) { return; }
            }
        } catch (e) {
            setStatus('Kutuphane okunamadi: ' + e.message, 'err');
        }
    }
    try {
        var ls = window.localStorage.getItem('expressionLibrary');
        if (ls) { adoptData(JSON.parse(ls)); }
    } catch (e2) {}
}

function saveLibrary(silent) {
    var favs = [];
    for (var k in state.favs) { if (state.favs[k]) { favs.push(k); } }

    var payload = JSON.stringify({
        version: 2,
        updatedAt: new Date().toISOString(),
        items: state.userItems,
        favs: favs,
        settings: state.settings
    }, null, 2);

    var saved = false;
    if (fs && STORE_FILE && ensureDir()) {
        try { fs.writeFileSync(STORE_FILE, payload, 'utf8'); saved = true; }
        catch (e) { setStatus('Diske yazilamadi: ' + e.message, 'err'); }
    }
    try { window.localStorage.setItem('expressionLibrary', payload); } catch (e2) {}

    if (!silent) { setStatus(saved ? 'Kaydedildi' : 'Kaydedildi (yerel onbellek)', 'ok'); }
    return saved;
}


// ===========================================================================
// 4. PARAMETRE MOTORU  {{ad=varsayilan}}
// ===========================================================================
// Parametre ADININ cevresindeki bosluk yok sayilir; VARSAYILAN DEGER oldugu gibi
// alinir - "{{sonEk= /mo}}" gibi bosluk tasiyan varsayilanlar korunmali.
var PARAM_RE = /\{\{\s*([^}=\s][^}=]*?)\s*(?:=([^}]*))?\}\}/g;

function parseParams(code) {
    var out = [], seen = {}, m;
    PARAM_RE.lastIndex = 0;
    while ((m = PARAM_RE.exec(code)) !== null) {
        if (Object.prototype.hasOwnProperty.call(seen, m[1])) { continue; }
        seen[m[1]] = true;
        out.push({ name: m[1], def: (m[2] === undefined ? '' : m[2]) });
    }
    return out;
}

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
// 5. EXTENDSCRIPT KOPRUSU
// ===========================================================================
function toJsxLiteral(obj) {
    return JSON.stringify(obj).replace(/[\u2028\u2029]/g, function (c) {
        return '\\u' + c.charCodeAt(0).toString(16);
    });
}

function callHost(fn, arg, cb) {
    var script = arg === undefined ? fn + '()' : fn + '(' + toJsxLiteral(arg) + ')';
    cs.evalScript(script, function (raw) {
        var res;
        try { res = JSON.parse(raw); }
        catch (e) { res = { ok: false, error: 'Host yaniti okunamadi: ' + String(raw).substring(0, 200) }; }
        if (cb) { cb(res); }
    });
}


// ===========================================================================
// 6. DOM YARDIMCILARI
// ===========================================================================
function $(id) { return document.getElementById(id); }

function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined && text !== null) { n.textContent = text; }
    return n;
}

function on(node, evt, fn) { node.addEventListener(evt, fn, false); }


// ===========================================================================
// 7. STATUS BAR
// ===========================================================================
var statusTimer = null;
var idleText = 'Ready';

/** kind: 'idle' | 'ok' | 'err' | 'warn'.  'ok' 2 sn sonra idle'a doner. */
function setStatus(text, kind) {
    var bar = $('statusBar');
    kind = kind || 'idle';
    $('statusText').textContent = text;
    bar.setAttribute('data-kind', kind);
    bar.title = (kind === 'err') ? 'Hatayi panoya kopyalamak icin tiklayin' : text;

    if (kind === 'err') { state.lastError = text; }

    clearTimeout(statusTimer);
    // Basari 2 sn, bilgilendirme 4 sn sonra bosa doner. Hata ise kalicidir:
    // kullanici okuyup uzerine tiklayarak panoya kopyalayabilmeli.
    if (kind === 'ok' || kind === 'warn') {
        statusTimer = setTimeout(function () { setStatus(idleText, 'idle'); },
                                 kind === 'ok' ? 2000 : 4000);
    }
}

function setIdleText(text) {
    idleText = text;
    var bar = $('statusBar');
    if (bar.getAttribute('data-kind') === 'idle') {
        $('statusText').textContent = text;
        bar.title = text;
    }
}

function copyToClipboard(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
}


// ===========================================================================
// 8. FILTRELEME
// ===========================================================================
// Turkce aksanlari katlar: "dongu" da yazilsa "döngü" de yazilsa ayni sonuc.
var TR_FOLD = { 'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ı': 'i',
                'İ': 'i', 'ö': 'o', 'Ö': 'o', 'ş': 's', 'Ş': 's',
                'ü': 'u', 'Ü': 'u' };

function fold(s) {
    return String(s).replace(/[çÇğĞıİöÖşŞüÜ]/g,
        function (c) { return TR_FOLD[c]; }).toLowerCase();
}

function matches(item, q) {
    if (!q) { return true; }
    var hay = fold(item.name + ' ' + item.cat + ' ' + catLabel(item.cat) + ' ' +
                   item.prop + ' ' + (item.desc || '') + ' ' + item.code);
    var words = fold(q).split(/\s+/);
    for (var i = 0; i < words.length; i++) {
        if (words[i] && hay.indexOf(words[i]) === -1) { return false; }
    }
    return true;
}

function visibleItems() {
    var q = state.query, cat = state.category;
    return allItems().filter(function (it) {
        if (cat === 'Fav' && !state.favs[it.id]) { return false; }
        else if (cat === 'Mine' && it.builtin) { return false; }
        else if (cat !== 'All' && cat !== 'Fav' && cat !== 'Mine' && it.cat !== cat) { return false; }
        return matches(it, q);
    });
}


// ===========================================================================
// 9. RENDER
// ===========================================================================
function renderChips() {
    var bar = $('chipBar');
    bar.innerHTML = '';

    var counts = {}, all = allItems();
    all.forEach(function (it) { counts[it.cat] = (counts[it.cat] || 0) + 1; });

    var favCount = 0;
    for (var k in state.favs) { if (state.favs[k] && findItem(k)) { favCount++; } }

    var list = [{ key: 'All', label: 'All', n: all.length }];
    if (favCount) { list.push({ key: 'Fav', label: '★', n: favCount }); }
    if (state.userItems.length) { list.push({ key: 'Mine', label: 'Mine', n: state.userItems.length }); }

    Object.keys(counts).sort(function (a, b) {
        return catLabel(a).localeCompare(catLabel(b));
    }).forEach(function (c) { list.push({ key: c, label: catLabel(c), n: counts[c] }); });

    list.forEach(function (c) {
        var b = el('button', 'chip' + (state.category === c.key ? ' on' : ''));
        b.appendChild(document.createTextNode(c.label));
        b.appendChild(el('span', 'n', c.n));
        b.title = c.key === 'Fav' ? 'Favoriler' : c.key;
        on(b, 'click', function () {
            state.category = c.key;
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
    state.visible = items;

    $('countShown').textContent = items.length;
    $('countTotal').textContent = allItems().length;

    var isEmpty = items.length === 0;
    $('emptyState').hidden = !isEmpty;
    wrap.hidden = isEmpty;
    if (isEmpty) {
        $('emptyTerm').textContent = state.query ? '"' + state.query + '"' : '';
        $('btnAddFromSearch').hidden = !state.query;
    }

    // aktif kart artik listede yoksa secimi ilk karta tasi
    var stillThere = false;
    for (var i = 0; i < items.length; i++) { if (items[i].id === state.activeId) { stillThere = true; break; } }
    if (!stillThere) { state.activeId = items.length ? items[0].id : null; }

    items.forEach(function (item) { wrap.appendChild(buildCard(item)); });
    syncApplyButton();
}

function buildCard(item) {
    var params = parseParams(item.code);
    var isFav = !!state.favs[item.id];

    var card = el('div', 'card' + (item.id === state.activeId ? ' sel' : '') + (isFav ? ' fav' : ''));
    card.setAttribute('data-id', item.id);

    // --- ust satir: ad + rozet + kategori
    var top = el('div', 'c-top');
    top.appendChild(el('span', 'c-name', item.name));
    if (params.length) {
        var t = el('span', 'tag', params.length + ' params');
        t.title = params.map(function (p) { return p.name + '=' + p.def; }).join(', ');
        top.appendChild(t);
    }
    if (!item.builtin) { top.appendChild(el('span', 'tag mine', 'mine')); }
    top.appendChild(el('span', 'c-cat', catLabel(item.cat)));
    card.appendChild(top);

    // --- alt satir: tek satir ozet
    var desc = item.desc || item.code;
    var sub = el('div', 'c-desc', item.prop + ' · ' + desc);
    sub.title = item.name + '\n' + desc + '\n\n' + item.code;
    card.appendChild(sub);

    // --- mikro aksiyonlar
    var acts = el('div', 'c-acts');

    var star = el('button', 'c-act star' + (isFav ? ' on' : ''), isFav ? '★' : '☆');
    star.title = isFav ? 'Favorilerden cikar' : 'Favorilere ekle';
    on(star, 'click', function (ev) { ev.stopPropagation(); toggleFav(item.id); });
    acts.appendChild(star);

    var fork = el('button', 'c-act', item.builtin ? '⎇' : '✎');
    fork.title = item.builtin ? 'Turet (duzenlenebilir kopya)' : 'Duzenle';
    on(fork, 'click', function (ev) { ev.stopPropagation(); openEditor(item, item.builtin); });
    acts.appendChild(fork);

    if (!item.builtin) {
        var del = el('button', 'c-act danger', '✕');
        del.title = 'Sil';
        on(del, 'click', function (ev) {
            ev.stopPropagation();
            if (window.confirm('"' + item.name + '" silinsin mi?')) { deleteItem(item.id); }
        });
        acts.appendChild(del);
    }
    card.appendChild(acts);

    on(card, 'click', function () { selectCard(item.id); });
    on(card, 'dblclick', function () { selectCard(item.id); applyCard(item); });

    return card;
}

function selectCard(id) {
    if (state.activeId === id) { syncApplyButton(); return; }
    state.activeId = id;
    var nodes = $('cardList').querySelectorAll('.card');
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute('data-id') === id) { nodes[i].className += ' sel'; }
        else { nodes[i].className = nodes[i].className.replace(/\s*\bsel\b/, ''); }
    }
    syncApplyButton();
}

function syncApplyButton() {
    var item = state.activeId ? findItem(state.activeId) : null;
    var btn = $('btnApply');
    btn.disabled = !item;
    btn.textContent = 'Apply to Selected';
    btn.title = item ? ('Uygula: ' + item.name) : 'Once bir sablon secin';
}

function scrollActiveIntoView() {
    var node = $('cardList').querySelector('.card.sel');
    if (!node) { return; }
    var list = $('cardList');
    var top = node.offsetTop, bottom = top + node.offsetHeight;
    if (top < list.scrollTop) { list.scrollTop = top - 4; }
    else if (bottom > list.scrollTop + list.clientHeight) { list.scrollTop = bottom - list.clientHeight + 4; }
}

function moveSelection(delta) {
    if (!state.visible.length) { return; }
    var idx = -1;
    for (var i = 0; i < state.visible.length; i++) {
        if (state.visible[i].id === state.activeId) { idx = i; break; }
    }
    idx = (idx < 0) ? 0 : idx + delta;
    if (idx < 0) { idx = 0; }
    if (idx > state.visible.length - 1) { idx = state.visible.length - 1; }
    selectCard(state.visible[idx].id);
    scrollActiveIntoView();
}

function toggleFav(id) {
    if (state.favs[id]) { delete state.favs[id]; } else { state.favs[id] = true; }
    saveLibrary(true);
    renderChips();
    renderList();
}


// ===========================================================================
// 10. UYGULAMA
// ===========================================================================
function applyCard(item) {
    if (!item) { return; }
    var params = parseParams(item.code);
    if (params.length && !state.settings.skip) { openParamModal(item, params); }
    else { applyResolved(item, resolveCode(item.code, {})); }
}

function applyResolved(item, code) {
    setStatus('Uygulaniyor...', 'idle');
    callHost('EXP_apply', {
        code: code,
        target: item.prop || 'Any',
        name: item.name,
        scope: state.settings.scope
    }, function (res) {
        if (!res.ok) {
            var extra = (res.skipped && res.skipped.length) ? ' - ' + res.skipped[0] : '';
            setStatus(res.error + extra, 'err');
            return;
        }
        var msg = item.name + ' → ' + res.applied + ' ozellik';
        if (res.skipped && res.skipped.length) { msg += ' (' + res.skipped.length + ' atlandi)'; }
        setStatus(msg, 'ok');
        refreshContext();
    });
}


// ===========================================================================
// 11. PARAMETRE MODALI
// ===========================================================================
function openParamModal(item, params) {
    state.pending = { item: item, params: params };
    $('modalTitle').textContent = item.name;

    var grid = $('modalFields');
    grid.innerHTML = '';

    params.forEach(function (p) {
        grid.appendChild(el('label', 'pk', p.name));

        var cell = el('div', 'pv');
        var input = document.createElement('input');
        input.type = 'text';
        input.value = p.def;
        input.setAttribute('data-param', p.name);
        input.title = 'Varsayilan: ' + p.def;
        on(input, 'input', updateModalPreview);
        cell.appendChild(input);

        var reset = el('button', 'p-reset', '↺');
        reset.title = 'Varsayilana don (' + p.def + ')';
        on(reset, 'click', function () {
            input.value = p.def;
            input.focus();
            updateModalPreview();
        });
        cell.appendChild(reset);

        grid.appendChild(cell);
    });

    updateModalPreview();
    $('modalBackdrop').hidden = false;

    var first = grid.querySelector('input');
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
// 12. EDITOR
// ===========================================================================
function showView(which) {
    $('viewList').hidden = (which !== 'list');
    $('viewEditor').hidden = (which !== 'editor');
}

function openEditor(item, asCopy, presetName) {
    var isNew = !item;

    $('editorTitle').textContent = isNew ? 'Yeni Expression' : (asCopy ? 'Turet' : 'Duzenle');
    $('fName').value = isNew ? (presetName || '') : (item.name + (asCopy ? ' (kopya)' : ''));
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
    hint.appendChild(document.createTextNode(params.length + ' parametre: '));
    params.forEach(function (p, i) {
        if (i) { hint.appendChild(document.createTextNode(', ')); }
        hint.appendChild(el('b', null, p.name + ' = ' + p.def));
    });
}

function trim(s) { return String(s).replace(/^\s+|\s+$/g, ''); }

function saveFromEditor() {
    var name = trim($('fName').value);
    var code = trim($('fCode').value);

    if (!name) { setStatus('Ad alani bos birakilamaz', 'err'); $('fName').focus(); return; }
    if (!code) { setStatus('Expression kodu bos birakilamaz', 'err'); $('fCode').focus(); return; }

    callHost('EXP_validate', resolveCode(code, {}), function (res) {
        if (!res.ok) { setStatus(res.error, 'err'); return; }

        var record = {
            id:      state.editingId || ('u' + Date.now() + Math.floor(Math.random() * 1000)),
            name:    name,
            cat:     trim($('fCat').value) || 'Ozel',
            prop:    $('fProp').value,
            desc:    trim($('fDesc').value),
            req:     trim($('fReq').value) || 'Yok',
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
        state.activeId = record.id;
        renderChips();
        renderList();
        showView('list');
    });
}

function deleteItem(id) {
    state.userItems = state.userItems.filter(function (it) { return it.id !== id; });
    delete state.favs[id];
    saveLibrary(true);
    if (state.category === 'Mine' && !state.userItems.length) { state.category = 'All'; }
    renderChips();
    renderList();
    setStatus('Silindi', 'ok');
}


// ===========================================================================
// 13. DISA / ICE AKTAR
// ===========================================================================
function exportLibrary() {
    if (!state.userItems.length) { setStatus('Disa aktarilacak ozel kayit yok', 'err'); return; }
    var json = JSON.stringify({ version: 2, items: state.userItems }, null, 2);
    try {
        var r = window.cep.fs.showSaveDialogEx('Kutuphaneyi disa aktar', '', ['json'], 'expression-library.json');
        if (r && r.data) {
            if (fs) { fs.writeFileSync(r.data, json, 'utf8'); }
            else { window.cep.fs.writeFile(r.data, json); }
            setStatus('Disa aktarildi', 'ok');
            return;
        }
    } catch (e) {}
    var copied = copyToClipboard(json);
    setStatus(copied ? 'Dosya secilmedi - JSON panoya kopyalandi' : 'Disa aktarilamadi',
              copied ? 'ok' : 'err');
}

function importLibrary() {
    try {
        var r = window.cep.fs.showOpenDialogEx(false, false, 'JSON kutuphanesi sec', '', ['json']);
        if (!r || !r.data || !r.data.length) { return; }
        var file = (r.data instanceof Array) ? r.data[0] : r.data;
        var raw = fs ? fs.readFileSync(file, 'utf8') : window.cep.fs.readFile(file).data;
        var data = JSON.parse(raw);
        var incoming = (data && data.items instanceof Array) ? data.items : (data instanceof Array ? data : null);
        if (!incoming) { setStatus('Gecersiz dosya bicimi', 'err'); return; }

        var existing = {};
        state.userItems.forEach(function (it) { existing[it.id] = true; });

        var added = 0;
        incoming.forEach(function (it) {
            if (!it || !it.name || !it.code) { return; }
            state.userItems.push({
                id:      (it.id && !existing[it.id]) ? it.id : ('u' + Date.now() + Math.floor(Math.random() * 10000) + added),
                name:    String(it.name),
                cat:     String(it.cat || 'Ozel'),
                prop:    String(it.prop || 'Any'),
                desc:    String(it.desc || ''),
                req:     String(it.req || 'Yok'),
                code:    String(it.code),
                builtin: false
            });
            added++;
        });

        saveLibrary(true);
        renderChips();
        renderList();
        setStatus(added + ' kayit ice aktarildi', 'ok');
    } catch (e) {
        setStatus('Ice aktarilamadi: ' + e.message, 'err');
    }
}


// ===========================================================================
// 14. AE BAGLAM DURUMU
// ===========================================================================
function refreshContext() {
    callHost('EXP_getContext', undefined, function (res) {
        if (!res.ok) { setIdleText('Host hatasi: ' + res.error); return; }
        if (!res.hasComp) { setIdleText('Aktif kompozisyon yok'); return; }

        var txt = res.compName + ' · ' + res.layers.length + ' katman';
        if (res.props.length) { txt += ' · ' + res.props.length + ' ozellik'; }
        setIdleText(txt);
    });
}


// ===========================================================================
// 15. OLAY BAGLAMA
// ===========================================================================
function isTypingTarget(node) {
    if (!node) { return false; }
    var t = node.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';
}

function wire() {
    var search = $('searchInput');

    // ---- arama
    on(search, 'input', function () {
        state.query = trim(search.value);
        $('btnClearSearch').className = 's-clear' + (state.query ? ' on' : '');
        $('searchKbd').className = state.query ? 'off' : '';
        renderList();
    });
    on(search, 'focus', function () { $('searchKbd').className = 'off'; });
    on(search, 'blur', function () { if (!state.query) { $('searchKbd').className = ''; } });
    on(search, 'keydown', function (ev) {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); moveSelection(1); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveSelection(-1); }
        else if (ev.key === 'Enter') { ev.preventDefault(); applyCard(findItem(state.activeId)); }
    });
    on($('btnClearSearch'), 'click', function () {
        search.value = '';
        state.query = '';
        $('btnClearSearch').className = 's-clear';
        renderList();
        search.focus();
    });

    // ---- header menusu
    on($('btnMenu'), 'click', function (ev) {
        ev.stopPropagation();
        $('menuPop').hidden = !$('menuPop').hidden;
    });
    on(document, 'click', function () { $('menuPop').hidden = true; });
    on($('menuPop'), 'click', function (ev) {
        var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
        $('menuPop').hidden = true;
        if (act === 'refresh') { refreshContext(); setStatus('Secim yenilendi', 'ok'); }
        else if (act === 'export') { exportLibrary(); }
        else if (act === 'import') { importLibrary(); }
        else if (act === 'clear') {
            callHost('EXP_clear', { target: '' }, function (res) {
                if (!res.ok) { setStatus(res.error, 'err'); return; }
                setStatus(res.cleared + ' expression temizlendi', 'ok');
            });
        }
    });

    // ---- mod + skip
    var scope = $('scopeSelect');
    scope.value = state.settings.scope;
    on(scope, 'change', function () {
        state.settings.scope = scope.value;
        saveLibrary(true);
    });

    var skip = $('skipPrompts');
    skip.checked = state.settings.skip;
    on(skip, 'change', function () {
        state.settings.skip = skip.checked;
        saveLibrary(true);
        setStatus(skip.checked ? 'Parametre modali atlanacak' : 'Parametre modali acilacak', 'ok');
    });

    // ---- ana aksiyonlar
    on($('btnApply'), 'click', function () { applyCard(findItem(state.activeId)); });
    on($('btnNew'), 'click', function () { openEditor(null, false); });
    on($('btnAddFromSearch'), 'click', function () { openEditor(null, false, state.query); });

    // ---- status bar: hatayi panoya kopyala
    on($('statusBar'), 'click', function () {
        if ($('statusBar').getAttribute('data-kind') !== 'err' || !state.lastError) { return; }
        if (copyToClipboard(state.lastError)) { setStatus('Hata panoya kopyalandi', 'ok'); }
    });

    // ---- editor
    on($('btnBack'), 'click', function () { showView('list'); });
    on($('btnCancel'), 'click', function () { showView('list'); });
    on($('btnSave'), 'click', saveFromEditor);
    on($('fCode'), 'input', updateParamHint);
    on($('btnDelete'), 'click', function () {
        if (state.editingId && window.confirm('Bu expression silinsin mi?')) {
            deleteItem(state.editingId);
            state.editingId = null;
            showView('list');
        }
    });

    // ---- modal
    on($('btnModalClose'), 'click', closeModal);
    on($('modalBackdrop'), 'click', function (ev) {
        if (ev.target === $('modalBackdrop')) { closeModal(); }
    });
    on($('btnUseDefaults'), 'click', function () {
        if (!state.pending) { return; }
        var item = state.pending.item;
        closeModal();
        applyResolved(item, resolveCode(item.code, {}));
    });
    on($('btnApplyParams'), 'click', function () {
        if (!state.pending) { return; }
        var item = state.pending.item;
        var code = resolveCode(item.code, collectModalValues());
        closeModal();
        applyResolved(item, code);
    });

    // ---- global klavye
    on(document, 'keydown', function (ev) {
        var modalOpen = !$('modalBackdrop').hidden;
        var editorOpen = !$('viewEditor').hidden;

        if (ev.key === 'Escape') {
            if (modalOpen) { closeModal(); }
            else if (editorOpen) { showView('list'); }
            else if (state.query) { $('btnClearSearch').click(); }
            return;
        }

        if (modalOpen) {
            if (ev.key === 'Enter') { ev.preventDefault(); $('btnApplyParams').click(); }
            return;
        }

        if (editorOpen) {
            if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
                ev.preventDefault();
                saveFromEditor();
            }
            return;
        }

        // '/' -> aramaya odaklan
        if (ev.key === '/' && !isTypingTarget(ev.target)) {
            ev.preventDefault();
            $('searchInput').focus();
            $('searchInput').select();
            return;
        }

        if (!isTypingTarget(ev.target)) {
            if (ev.key === 'ArrowDown') { ev.preventDefault(); moveSelection(1); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveSelection(-1); }
            else if (ev.key === 'Enter') { ev.preventDefault(); applyCard(findItem(state.activeId)); }
        }
    });

    // ---- AE secim degisimini yakala
    on(window, 'focus', refreshContext);
    setInterval(refreshContext, 2000);
}


// ===========================================================================
// 16. BASLANGIC
// ===========================================================================
function boot() {
    initStoragePaths();
    loadLibrary();
    wire();
    renderChips();
    renderList();
    refreshContext();
    if (!fs) { setStatus('Node.js kapali - kayitlar yerel onbellege yazilacak', 'warn'); }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
} else {
    boot();
}

})();
