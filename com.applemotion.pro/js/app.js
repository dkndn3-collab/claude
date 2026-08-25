/**
 * app.js — panel controller.
 *
 * Four views (components / motion / gradient / actions). Component tiles play
 * their real entrance animation on hover (§24). Clicking one opens the builder
 * (§25): a live hero preview with a Play button, then Variant · Style ·
 * Content · Animation sections — every value flows to the same ExtendScript
 * call that builds the After Effects composition.
 *
 * The Gradient tab is self-contained in js/gradient.js; app.js only mounts it
 * and tells it when it is on screen.
 */
(function () {
  'use strict';

  var L = window.LIBRARY, P = window.PREVIEWS, M = window.MOTION, A = window.ANIMATOR, TK = window.TOKENS;
  var C = window.CONTROLS, GP = window.GRADIENT_PANEL;

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var el = {
    search:      document.getElementById('search'),
    searchWrap:  document.getElementById('searchWrap'),
    searchClear: document.getElementById('searchClear'),
    tabs:        Array.prototype.slice.call(document.querySelectorAll('.tab')),
    body:        document.getElementById('body'),
    views: {
      components: document.getElementById('view-components'),
      motion:     document.getElementById('view-motion'),
      gradient:   document.getElementById('view-gradient'),
      actions:    document.getElementById('view-actions')
    },
    status:    document.getElementById('status'),
    statusMsg: document.getElementById('statusMsg'),
    sheet:      document.getElementById('sheet'),
    sheetTitle: document.getElementById('sheetTitle'),
    sheetSub:   document.getElementById('sheetSub'),
    sheetHero:  document.getElementById('sheetHero'),
    sheetPlay:  document.getElementById('sheetPlay'),
    sheetSections: document.getElementById('sheetSections'),
    sheetBack:  document.getElementById('sheetBack'),
    sheetReset: document.getElementById('sheetReset'),
    sheetCreate:document.getElementById('sheetCreate')
  };

  var settings = loadSettings();

  var state = {
    view: 'components',
    query: '',
    category: 'all',
    component: null,
    params: null,
    anim: null
  };

  /* ------------------------------------------------------------ settings */

  function loadSettings() {
    var s = { font: 'sf' };
    try { var raw = localStorage.getItem('amui.settings'); if (raw) s = JSON.parse(raw); } catch (e) {}
    if (!s.font) s.font = 'sf';
    return s;
  }
  function saveSettings() {
    try { localStorage.setItem('amui.settings', JSON.stringify(settings)); } catch (e) {}
  }

  /* --------------------------------------------------------------- theme */

  function applyHostTheme() {
    var luma = window.CEP.hostBackgroundLuma();
    if (luma == null) return;
    document.documentElement.setAttribute('data-theme', luma > 0.5 ? 'light' : 'dark');
  }

  /* --------------------------------------------------------------- status */

  var statusTimer = null;
  function setStatus(msg, state_) {
    clearTimeout(statusTimer);
    el.statusMsg.textContent = msg;
    el.status.setAttribute('data-state', state_ || 'idle');
    if (state_ === 'ok' || state_ === 'err') {
      statusTimer = setTimeout(function () {
        el.statusMsg.textContent = 'Ready';
        el.status.setAttribute('data-state', 'idle');
      }, 5000);
    }
  }

  /* -------------------------------------------------------------- filtering */

  function matches(haystack, query) {
    if (!query) return true;
    var text = haystack.join(' ').toLowerCase();
    return query.split(/\s+/).every(function (w) { return text.indexOf(w) !== -1; });
  }
  function filteredComponents() {
    return L.components.filter(function (c) {
      if (state.category !== 'all' && c.category !== state.category) return false;
      return matches([c.id, c.name, c.category].concat(c.tags), state.query);
    });
  }
  function filteredMotion() {
    return M.presets.filter(function (m) { return matches([m.id, m.name, m.category, m.blurb], state.query); });
  }
  function filteredActions() {
    return QUICK_ACTIONS.filter(function (a) { return matches([a.id, a.name, a.blurb], state.query); });
  }

  var QUICK_ACTIONS = [
    { id: 'addGlass',  name: 'Add glass',  blurb: 'Frosts everything behind the selected layer.' },
    { id: 'addShadow', name: 'Add shadow', blurb: 'Apple-weight drop shadow.' },
    { id: 'center',    name: 'Center',     blurb: 'Centres selection in the comp.' },
    { id: 'stagger',   name: 'Stagger',    blurb: 'Offsets selected layers by 2 frames each.' },
    { id: 'precompose',name: 'Precompose', blurb: 'Wraps selection in a named precomp.' }
  ];

  /* --------------------------------------------------------------- helpers */

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function emptyState(what) {
    return '<div class="empty"><strong>No ' + what + ' match “' + escapeHtml(state.query) + '”</strong>' +
           'Try a shorter word, like “glass” or “spring”.</div>';
  }

  /* --------------------------------------------------------------- render */

  function renderComponents() {
    var view = el.views.components;
    var cats = '<div class="cats">' + L.categories.map(function (c) {
      return '<button class="chip' + (state.category === c.id ? ' on' : '') + '" data-cat="' + c.id + '">' + escapeHtml(c.name) + '</button>';
    }).join('') + '</div>';

    var list = filteredComponents();
    if (!list.length) { view.innerHTML = cats + emptyState('components'); return; }

    var html = cats + '<div class="section-label"><span>Components</span><span>' + list.length + '</span></div><div class="grid">';
    list.forEach(function (c) {
      var art = P.render(c.id, L.defaults(c), 260, 146);
      html += '<button class="tile" data-component="' + c.id + '" title="' + escapeHtml(c.blurb) + '">' +
                '<span class="tile-art">' + art + '</span>' +
                '<span class="tile-meta">' +
                  '<span class="tile-name">' + escapeHtml(c.name) + '</span>' +
                  '<span class="tile-cat">' + escapeHtml((c.variants ? c.variants.length + ' variants · ' : '')) + labelFor(c.category) + '</span>' +
                '</span>' +
              '</button>';
    });
    view.innerHTML = html + '</div>';
  }

  function labelFor(catId) {
    for (var i = 0; i < L.categories.length; i++) if (L.categories[i].id === catId) return L.categories[i].name;
    return catId;
  }

  /** A curve thumbnail drawn straight from the preset's own maths. */
  function curveArt(preset) {
    var W = 34, H = 22, x0 = 2, x1 = 32, yTop = 2, yBot = 20;
    function y(v) { return Math.max(-4, Math.min(H, yBot - v * (yBot - yTop))); }
    var d;
    if (preset.spring) {
      var pts = [];
      for (var i = 0; i <= 24; i++) {
        var t = i / 24;
        var v = M.springValue(t * preset.duration, M.coeffs(preset), 1 + (preset.overshoot || 0) / 40);
        pts.push((x0 + (x1 - x0) * t).toFixed(1) + ',' + y(v).toFixed(1));
      }
      d = 'M' + pts.join(' L');
    } else {
      var b = preset.easing;
      var c1x = x0 + (x1 - x0) * b[0], c1y = yBot + (yTop - yBot) * b[1];
      var c2x = x0 + (x1 - x0) * b[2], c2y = yBot + (yTop - yBot) * b[3];
      d = 'M' + x0 + ',' + yBot + ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + x1 + ',' + yTop;
    }
    return '<svg viewBox="0 0 34 22" aria-hidden="true"><path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function renderMotion() {
    var list = filteredMotion();
    var view = el.views.motion;
    if (!list.length) { view.innerHTML = emptyState('presets'); return; }
    var html = '<div class="section-label"><span>Apply to selected layers</span><span>' + list.length + '</span></div><div class="row-list">';
    list.forEach(function (m) {
      html += '<button class="row" data-motion="' + m.id + '">' +
                '<span class="row-curve">' + curveArt(m) + '</span>' +
                '<span class="row-text"><span class="row-name">' + escapeHtml(m.name) + '</span>' +
                '<span class="row-blurb">' + escapeHtml(m.blurb) + '</span></span>' +
                '<span class="row-dur">' + m.duration.toFixed(2) + 's</span>' +
              '</button>';
    });
    view.innerHTML = html + '</div>';
  }

  function renderActions() {
    var list = filteredActions();
    var view = el.views.actions;
    if (!list.length) { view.innerHTML = emptyState('actions'); return; }
    var html = '<div class="section-label"><span>Quick actions</span><span>' + list.length + '</span></div><div class="row-list">';
    list.forEach(function (a) {
      html += '<button class="row" data-action="' + a.id + '"><span class="row-text">' +
                '<span class="row-name">' + escapeHtml(a.name) + '</span>' +
                '<span class="row-blurb">' + escapeHtml(a.blurb) + '</span></span></button>';
    });
    view.innerHTML = html + '</div>';
  }

  function renderAll() { renderComponents(); renderMotion(); renderActions(); }

  /* ----------------------------------------------------------------- tabs */

  function showView(name) {
    state.view = name;
    el.tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.view === name)); });
    Object.keys(el.views).forEach(function (k) { el.views[k].hidden = (k !== name); });
    // The gradient preview is a live render — it only runs while it is visible.
    if (GP) GP.activate(name === 'gradient');
  }
  el.tabs.forEach(function (t) { t.addEventListener('click', function () { showView(t.dataset.view); }); });

  /* --------------------------------------------------------------- search */

  el.search.addEventListener('input', function () {
    state.query = el.search.value.trim().toLowerCase();
    el.searchWrap.classList.toggle('has-value', !!el.search.value);
    renderAll();
    if (state.query) {
      if (filteredComponents().length) showView('components');
      else if (filteredMotion().length) showView('motion');
      else if (filteredActions().length) showView('actions');
    }
  });
  el.searchClear.addEventListener('click', function () {
    el.search.value = ''; state.query = '';
    el.searchWrap.classList.remove('has-value');
    renderAll(); el.search.focus();
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); el.search.select(); }
    if (e.key === 'Escape') {
      if (el.sheet.classList.contains('open')) closeSheet();
      else if (el.search.value) el.searchClear.click();
    }
  });

  /* ---------------------------------------------------------------- sheet */

  function openSheet(componentId) {
    var c = L.componentById(componentId);
    if (!c) return;
    state.component = c;
    state.params = L.defaults(c);
    applyVariant(state.params.variant, true);          // seed variant defaults
    state.anim = M.defaults(c.defaultAnim || 'appleEase');
    el.sheetTitle.textContent = c.name;
    el.sheetSub.textContent = labelFor(c.category) + ' · builds a live precomp';
    buildSections();
    updateHero();
    el.sheet.classList.add('open');
    el.sheet.setAttribute('aria-hidden', 'false');
    setTimeout(playHero, 120);                          // greet with the animation
  }
  function closeSheet() {
    A.stop();
    el.sheet.classList.remove('open');
    el.sheet.setAttribute('aria-hidden', 'true');
  }

  function applyVariant(variantId, silent) {
    if (!state.component.variants) return;
    state.params.variant = variantId;
    var set = L.variantSet(state.component, variantId);
    for (var k in set) if (set.hasOwnProperty(k)) state.params[k] = set[k];
    if (!silent) { buildSections(); updateHero(); playHero(); }
  }

  function visible(param) {
    if (param.group === 'hidden') return false;
    return !param.showIf || !!state.params[param.showIf];
  }

  /* --- section + control building --------------------------------------- */

  function buildSections() {
    var c = state.component;
    el.sheetSections.innerHTML = '';

    if (c.variants) el.sheetSections.appendChild(variantSection(c));
    el.sheetSections.appendChild(groupSection('Content', paramsOf(c, 'content')));
    el.sheetSections.appendChild(groupSection('Style', paramsOf(c, 'style')));
    el.sheetSections.appendChild(animationSection());
    el.sheetSections.appendChild(settingsSection());
    refreshVisibility();
  }

  function paramsOf(c, group) {
    return c.params.filter(function (p) { return (p.group || 'content') === group; });
  }

  function sectionEl(title) {
    var s = document.createElement('div');
    s.className = 'bsection';
    var h = document.createElement('div');
    h.className = 'bsection-title';
    h.textContent = title;
    s.appendChild(h);
    return s;
  }

  function variantSection(c) {
    var s = sectionEl('Variant');
    var wrap = document.createElement('div');
    wrap.className = 'chips';
    c.variants.forEach(function (v) {
      var b = document.createElement('button');
      b.className = 'chip' + (state.params.variant === v.id ? ' on' : '');
      b.textContent = v.name;
      b.addEventListener('click', function () {
        applyVariant(v.id);
      });
      wrap.appendChild(b);
    });
    s.appendChild(wrap);
    return s;
  }

  function groupSection(title, params) {
    var s = sectionEl(title);
    if (!params.length) { s.style.display = 'none'; return s; }
    params.forEach(function (p) { s.appendChild(fieldFor(p, state.params, onParamChange)); });
    return s;
  }

  function animationSection() {
    var s = sectionEl('Animation');

    // preset chips
    var chips = document.createElement('div');
    chips.className = 'chips';
    M.presets.forEach(function (pr) {
      var b = document.createElement('button');
      b.className = 'chip anim' + (state.anim.preset === pr.id ? ' on' : '');
      b.innerHTML = '<span class="chip-curve">' + curveArt(pr) + '</span>' + pr.name;
      b.addEventListener('click', function () {
        state.anim = M.defaults(pr.id);
        buildSections(); updateHero(); playHero();
      });
      chips.appendChild(b);
    });
    s.appendChild(chips);

    var preset = M.byId(state.anim.preset);
    M.params.forEach(function (d) {
      if (d.spring && !preset.spring) return;          // hide spring-only controls
      s.appendChild(fieldFor(d, state.anim, function () { updateHero(); }));
    });
    return s;
  }

  function settingsSection() {
    var s = sectionEl('Default font');
    var d = { key: 'font', label: 'Font', type: 'select', options: TK.fonts.map(function (f) { return { value: f.id, label: f.name }; }) };
    var target = settings;
    s.appendChild(fieldFor(d, target, function () { saveSettings(); }));
    var note = document.createElement('p');
    note.className = 'bnote';
    note.textContent = 'Saved as your default for every component you create.';
    s.appendChild(note);
    return s;
  }

  /** Controls come from js/lib/controls.js — the gradient builder shares them. */
  function fieldFor(p, target, onChange) { return C.field(p, target, onChange); }

  function onParamChange(key) {
    // Picking a glass material pulls its blur value in with it.
    if (key === 'glassPreset' && 'blur' in state.params) {
      state.params.blur = L.glassById(state.params.glassPreset).blur;
      C.sync(el.sheetSections, 'blur', state.params.blur);
    }
    // A variant chip changes many params, but toggling glass etc. can leave the
    // chosen variant stale — that's fine, the variant chips reflect last pick.
    refreshVisibility();
    updateHero();
  }

  function refreshVisibility() {
    if (!state.component) return;
    state.component.params.forEach(function (p) {
      var node = el.sheetSections.querySelector('.field[data-key="' + p.key + '"]');
      if (node) node.hidden = !visible(p);
    });
  }

  /* --- hero preview ------------------------------------------------------ */

  var heroRaf = null;
  function updateHero() {
    if (heroRaf) cancelAnimationFrame(heroRaf);
    heroRaf = requestAnimationFrame(function () {
      el.sheetHero.innerHTML = P.render(state.component.id, state.params, 420, 236);
    });
  }
  function playHero() {
    if (reduceMotion || !A.supported) return;
    // Ensure the SVG exists before playing.
    if (!el.sheetHero.querySelector('svg')) updateHero();
    requestAnimationFrame(function () { A.play(el.sheetHero, state.component.id, state.anim); });
  }
  el.sheetPlay.addEventListener('click', function () { updateHero(); requestAnimationFrame(playHero); });

  el.sheetBack.addEventListener('click', closeSheet);
  el.sheetReset.addEventListener('click', function () {
    state.params = L.defaults(state.component);
    applyVariant(state.params.variant, true);
    state.anim = M.defaults(state.component.defaultAnim || 'appleEase');
    buildSections(); updateHero(); playHero();
    setStatus('Settings reset to defaults');
  });

  /* --------------------------------------------------------------- create */

  el.sheetCreate.addEventListener('click', function () {
    var c = state.component;
    var params = JSON.parse(JSON.stringify(state.params));
    params.__type = c.id;
    params.__font = settings.font;
    params.anim = JSON.parse(JSON.stringify(state.anim));

    el.sheetCreate.disabled = true;
    setStatus('Creating ' + c.name.toLowerCase() + '…', 'busy');
    window.CEP.call('create', params)
      .then(function (payload) { setStatus(payload || (c.name + ' created'), 'ok'); closeSheet(); })
      .catch(function (err) { setStatus(err.message || 'Could not create the component', 'err'); })
      .then(function () { el.sheetCreate.disabled = false; });
  });

  /* --------------------------------------------------- delegated clicks */

  el.body.addEventListener('click', function (e) {
    var cat = e.target.closest('[data-cat]');
    if (cat) { state.category = cat.dataset.cat; renderComponents(); return; }

    var tile = e.target.closest('[data-component]');
    if (tile) { openSheet(tile.dataset.component); return; }

    var motion = e.target.closest('[data-motion]');
    if (motion) {
      var preset = motion.dataset.motion;
      setStatus('Applying ' + preset + '…', 'busy');
      window.CEP.call('motion', M.defaults(preset))
        .then(function (payload) { setStatus(payload || 'Motion applied', 'ok'); })
        .catch(function (err) { setStatus(err.message, 'err'); });
      return;
    }
    var action = e.target.closest('[data-action]');
    if (action) {
      var id = action.dataset.action;
      setStatus('Running ' + id + '…', 'busy');
      window.CEP.call('action', { id: id })
        .then(function (payload) { setStatus(payload || 'Done', 'ok'); })
        .catch(function (err) { setStatus(err.message, 'err'); });
    }
  });

  // Hover-to-play on component tiles (§24). mouseover bubbles, so we dedupe by
  // tracking which tile is under the pointer and only replay on a new one.
  var lastTile = null;
  el.views.components.addEventListener('mouseover', function (e) {
    if (reduceMotion || !A.supported) return;
    var tile = e.target.closest ? e.target.closest('.tile') : null;
    if (!tile || tile === lastTile) return;
    lastTile = tile;
    var c = L.componentById(tile.dataset.component);
    if (!c) return;
    A.play(tile.querySelector('.tile-art'), c.id, M.defaults(c.defaultAnim || 'appleEase'));
  });
  el.views.components.addEventListener('mouseout', function (e) {
    var to = e.relatedTarget;
    if (!to || !to.closest || !to.closest('.tile')) lastTile = null;
  });

  /* ------------------------------------------------------------------ boot */

  function boot() {
    applyHostTheme();
    window.CEP.onThemeChange(applyHostTheme);
    renderAll();
    if (GP) GP.build(el.views.gradient, setStatus);
    showView('components');

    if (window.CEP.isMock) { setStatus('Preview mode — no After Effects host detected'); return; }
    window.CEP.call('ping', {})
      .then(function (payload) { setStatus(payload || 'Connected', 'ok'); })
      .catch(function (err) { setStatus(err.message, 'err'); });
  }
  boot();
})();
