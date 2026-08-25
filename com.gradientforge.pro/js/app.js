/**
 * app.js — the panel.
 *
 * Two rules shape the layout. From the spec: at most four sliders on the
 * surface, preset first, and chrome that carries no colour of its own. From the
 * material: the gradient is the subject, so it gets the largest, quietest
 * surface on screen and everything else recedes into thin glass around it.
 *
 * The library shelf holds 400+ palettes. Its tiles are rendered, never stored —
 * each one draws itself the first time it scrolls into view and then stays.
 */
(function (global) {
  'use strict';

  var G = global.GRADIENTS, PV = global.GRADIENT_PREVIEW, C = global.CONTROLS;

  var el = {};
  var state = {
    params: G.fromPreset('aurora'),
    harmony: 'analogous',
    filter: 'all',
    query: '',
    output: { precomp: true, name: '' }
  };
  var reduceMotion = false;
  try { reduceMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* --------------------------------------------------------------- status */

  var statusTimer = null;
  function setStatus(msg, kind) {
    clearTimeout(statusTimer);
    el.statusMsg.textContent = msg;
    el.status.setAttribute('data-state', kind || 'idle');
    if (kind === 'ok' || kind === 'err') {
      statusTimer = setTimeout(function () {
        el.statusMsg.textContent = 'Ready';
        el.status.setAttribute('data-state', 'idle');
      }, 5000);
    }
  }

  /* ---------------------------------------------------------------- theme */

  /** Follow the host's brightness — neutral either way, never coloured. */
  function applyHostTheme() {
    var luma = global.CEP.hostBackgroundLuma();
    if (luma == null) return;
    document.documentElement.setAttribute('data-theme', luma > 0.5 ? 'light' : 'dark');
  }

  /* ----------------------------------------------------------------- view */

  function build(view) {
    view.innerHTML = '' +
      '<section class="stage">' +
        '<canvas class="canvas" id="gfHero"></canvas>' +
        '<div class="stage-ring" aria-hidden="true"></div>' +
        '<div class="stage-info">' +
          '<span class="stage-name" id="gfName"></span>' +
          '<span class="stage-meta" id="gfMeta"></span>' +
        '</div>' +
      '</section>' +

      '<div class="modes" id="gfModes" role="tablist" aria-label="Generator"></div>' +
      '<section class="panel geometry" id="gfGeometry" hidden></section>' +

      '<section class="shelf">' +
        '<header class="shelf-head">' +
          '<span class="eyebrow">Library</span>' +
          '<span class="count" id="gfCount"></span>' +
        '</header>' +
        '<input class="search" id="gfSearch" type="text" spellcheck="false" autocomplete="off" ' +
               'placeholder="Search palettes">' +
        '<div class="chips" id="gfFilters"></div>' +
        '<div class="cards" id="gfCards"></div>' +
      '</section>' +

      '<section class="panel palette">' +
        '<div class="chips-row" id="gfStops"></div>' +
        '<button class="ghost" id="gfShuffle" title="New seed and a fresh palette">Shuffle</button>' +
      '</section>' +
      '<p class="note" id="gfContrast"></p>' +

      '<section class="panel controls" id="gfSliders"></section>' +

      '<details class="adv" id="gfAdv">' +
        '<summary><span class="eyebrow">Advanced</span></summary>' +
        '<div class="panel" id="gfAdvFields"></div>' +
        '<div class="panel" id="gfOutput"></div>' +
        '<div class="actions actions-sub">' +
          '<button class="ghost" id="gfFreeze" title="Freeze the selected gradient layer at the playhead">Export still frame</button>' +
        '</div>' +
        '<p class="note" id="gfEngine"></p>' +
        '<p class="note">Space picks how the preview takes its weighted mean. ' +
        'After Effects has no effect that composites in OKLab, so the build gets ' +
        'the exact colour points and — with Linear on — linear-light compositing, ' +
        'which is the part that keeps blue↔orange out of the mud.</p>' +
      '</details>';

    el.view = view;
    el.hero = view.querySelector('#gfHero');
    el.name = view.querySelector('#gfName');
    el.meta = view.querySelector('#gfMeta');
    el.modes = view.querySelector('#gfModes');
    el.geometry = view.querySelector('#gfGeometry');
    el.count = view.querySelector('#gfCount');
    el.search = view.querySelector('#gfSearch');
    el.filters = view.querySelector('#gfFilters');
    el.cards = view.querySelector('#gfCards');
    el.stops = view.querySelector('#gfStops');
    el.contrast = view.querySelector('#gfContrast');
    el.sliders = view.querySelector('#gfSliders');
    el.advFields = view.querySelector('#gfAdvFields');
    el.output = view.querySelector('#gfOutput');
    el.engine = view.querySelector('#gfEngine');
    el.freeze = view.querySelector('#gfFreeze');
    // The action bar lives outside the scroller, so it never scrolls away.
    el.create = document.getElementById('gfCreate');
    el.copy = document.getElementById('gfCopy');
    el.shuffle = view.querySelector('#gfShuffle');

    el.shuffle.addEventListener('click', shuffle);
    el.create.addEventListener('click', create);
    el.freeze.addEventListener('click', freeze);
    el.copy.addEventListener('click', copySettings);
    el.search.addEventListener('input', function () {
      state.query = el.search.value;
      renderCards();
    });

    renderModes();
    renderFilters();
    renderCards();
    renderStops();
    renderSliders();
    renderGeometry();
    renderAdvanced();
    refresh();
  }

  /* ----------------------------------------------------------------- mode */

  function renderModes() {
    el.modes.innerHTML = '';
    G.modes.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'seg' + (state.params.mode === m.id ? ' on' : '');
      b.textContent = m.name;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(state.params.mode === m.id));
      b.addEventListener('click', function () {
        if (state.params.mode === m.id) return;
        state.params.mode = m.id;
        // The visible slider set is what changes per mode — not its length.
        renderModes(); renderSliders(); renderGeometry(); renderAdvanced(); refresh();
      });
      el.modes.appendChild(b);
    });
  }

  /** Geometry-specific controls, present only while that mode is active. */
  function renderGeometry() {
    var fields = G.paramsOf('geometry', state.params.mode);
    el.geometry.hidden = !fields.length;
    el.geometry.innerHTML = '';
    fields.forEach(function (p) {
      el.geometry.appendChild(C.field(p, state.params, onChange));
    });
  }

  /* --------------------------------------------------------------- library */

  function renderFilters() {
    el.filters.innerHTML = '';
    G.filters.forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'chip' + (state.filter === f.id ? ' on' : '');
      b.textContent = f.name;
      b.addEventListener('click', function () {
        state.filter = f.id;
        renderFilters();
        renderCards();
        el.cards.scrollTop = 0;
      });
      el.filters.appendChild(b);
    });
  }

  /**
   * Tiles draw themselves when they scroll into view — 400+ canvases rendered
   * up front would stall the panel, and most of them are never looked at.
   */
  var watcher = null;
  function observer() {
    if (watcher || typeof IntersectionObserver === 'undefined') return watcher;
    watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        watcher.unobserve(entry.target);
        paint(entry.target);
      });
    }, { root: el.cards, rootMargin: '160px 0px' });
    return watcher;
  }

  var queue = [];
  var painting = false;
  function paint(card) {
    queue.push(card);
    if (painting) return;
    painting = true;
    requestAnimationFrame(function step() {
      // A few per frame: the shelf keeps scrolling while the tiles arrive.
      for (var n = 0; n < 3 && queue.length; n++) {
        var card = queue.shift();
        var pr = G.presetById(card.dataset.preset);
        if (!pr || card.__painted) continue;
        card.__painted = true;
        var cv = document.createElement('canvas');
        cv.className = 'card-art';
        card.insertBefore(cv, card.firstChild);
        try { PV.render(cv, G.fromPreset(pr.id), 0); } catch (e) {}
      }
      if (queue.length) requestAnimationFrame(step);
      else painting = false;
    });
  }

  function renderCards() {
    var list = G.search(state.query, state.filter);
    el.count.textContent = list.length;
    el.cards.innerHTML = '';
    queue.length = 0;
    watcher = null;

    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'note empty';
      empty.textContent = 'Nothing matches “' + state.query + '”.';
      el.cards.appendChild(empty);
      return;
    }

    var io = observer();
    list.forEach(function (pr) {
      var card = document.createElement('button');
      card.className = 'card' + (state.params.preset === pr.id ? ' on' : '');
      card.dataset.preset = pr.id;
      card.title = pr.name;

      var name = document.createElement('span');
      name.className = 'card-name';
      name.textContent = pr.name;
      card.appendChild(name);

      card.addEventListener('click', function () {
        // A preset is a palette and a motion profile; the generator mode is the
        // user's choice and survives loading one.
        var mode = state.params.mode;
        var geom = geometryOf(state.params);
        state.params = G.fromPreset(pr.id);
        state.params.mode = mode;
        restoreGeometry(state.params, geom);
        var on = el.cards.querySelector('.card.on');
        if (on) on.classList.remove('on');
        card.classList.add('on');
        renderStops(); syncControls(); refresh();
      });

      el.cards.appendChild(card);
      if (io) io.observe(card); else paint(card);
    });
  }

  var GEOM_KEYS = ['shape', 'size', 'spread', 'shapeX', 'shapeY', 'rotate', 'fill'];
  function geometryOf(p) {
    var out = {};
    GEOM_KEYS.forEach(function (k) { out[k] = p[k]; });
    return out;
  }
  function restoreGeometry(p, geom) {
    GEOM_KEYS.forEach(function (k) { if (geom[k] !== undefined) p[k] = geom[k]; });
  }

  /* --------------------------------------------------------------- palette */

  function renderStops() {
    el.stops.innerHTML = '';
    state.params.colors.forEach(function (hex, i) {
      var wrap = document.createElement('span');
      wrap.className = 'swatch';

      var input = document.createElement('input');
      input.type = 'color';
      input.value = hex;
      input.title = 'Colour ' + (i + 1) + ' — ' + hex;
      input.setAttribute('aria-label', 'Colour ' + (i + 1));
      input.addEventListener('input', function () {
        state.params.colors[i] = input.value;
        clearPreset();
        refresh();
      });
      wrap.appendChild(input);

      if (state.params.colors.length > 2) {
        var rm = document.createElement('button');
        rm.className = 'swatch-rm';
        rm.textContent = '×';
        rm.title = 'Remove colour';
        rm.addEventListener('click', function (ev) {
          ev.stopPropagation();
          state.params.colors.splice(i, 1);
          clearPreset(); renderStops(); refresh();
        });
        wrap.appendChild(rm);
      }
      el.stops.appendChild(wrap);
    });

    if (state.params.colors.length < G.maxColors) {
      var add = document.createElement('button');
      add.className = 'swatch-add';
      add.textContent = '+';
      add.title = 'Add a colour (max ' + G.maxColors + ')';
      add.addEventListener('click', function () {
        var c = state.params.colors;
        // The new colour continues the palette rather than repeating it.
        c.push(G.palette(c[c.length - 1], state.harmony, 2)[1]);
        clearPreset(); renderStops(); refresh();
      });
      el.stops.appendChild(add);
    }
  }

  function shuffle() {
    var rand = G.rng(Math.floor(Math.random() * 100000));
    state.params.seed = 1 + Math.floor(rand() * 9998);
    state.params.colors = G.randomPalette(state.params.colors.length, rand);
    clearPreset();
    renderStops();
    syncControls();
    refresh();
  }

  function clearPreset() {
    state.params.preset = null;
    var on = el.cards.querySelector('.card.on');
    if (on) on.classList.remove('on');
  }

  /* --------------------------------------------------------------- fields */

  function renderSliders() {
    el.sliders.innerHTML = '';
    G.paramsOf('main', state.params.mode).forEach(function (p) {
      el.sliders.appendChild(C.field(p, state.params, onChange));
    });
  }

  function renderAdvanced() {
    el.advFields.innerHTML = '';
    G.paramsOf('advanced', state.params.mode).forEach(function (p) {
      el.advFields.appendChild(C.field(p, state.params, onChange));
    });

    el.output.innerHTML = '';
    el.output.appendChild(C.field(
      { key: 'precomp', label: 'Precomp', type: 'bool' }, state.output, function () {}));
    el.output.appendChild(C.field(
      { key: 'name', label: 'Name', type: 'text', placeholder: 'GRADIENT — Mesh' },
      state.output, function () {}));
  }

  function onChange(key) {
    if (key !== 'precomp' && key !== 'name') clearPreset();
    refresh();
  }

  /** Push preset/shuffle changes back into the controls that show them. */
  function syncControls() {
    G.params.forEach(function (p) {
      C.sync(el.sliders, p.key, state.params[p.key]);
      C.sync(el.advFields, p.key, state.params[p.key]);
    });
  }

  /* -------------------------------------------------------------- preview */

  function refresh() {
    var p = state.params;
    var preset = p.preset ? G.presetById(p.preset) : null;

    el.name.textContent = preset ? preset.name : 'Custom';
    el.meta.textContent = (p.mode === 'mesh' ? '' : G.modeById(p.mode).name.toLowerCase() + ' · ') +
      (p.motion ? p.loop + 's loop' : 'still') + ' · ' +
      p.colors.length + ' colours · ' + p.seed;

    var read = G.readability(p.colors);
    el.contrast.textContent = read.note;
    el.contrast.className = 'note' + (read.ok ? '' : ' warn');

    // The After Effects build is the mesh engine. A geometry mode has no native
    // equivalent yet, so Create says so instead of quietly building a mesh.
    var native = p.mode === 'mesh';
    el.create.disabled = !native;
    el.create.title = native ? '' : 'The After Effects build covers Mesh so far — geometry modes are preview-only.';

    PV.stop(el.hero);
    if (p.motion > 0 && !reduceMotion) {
      PV.animate(el.hero, function () { return state.params; }, 30);
    } else {
      PV.render(el.hero, p, 0);
    }

    // Read after the first render — that is when the renderer knows whether it
    // got a GPU context.
    el.engine.textContent = 'Mesh · ' + p.colorSpace.toUpperCase() + ' · preview ' +
      (PV.accelerated ? 'on the GPU' : 'in software (no WebGL here)') +
      ' · the layer stack is solids, native effects and expressions — nothing is imported.';
  }

  /* ---------------------------------------------------------------- build */

  function payload() {
    var out = G.resolve(JSON.parse(JSON.stringify(state.params)));
    out.precomp = !!state.output.precomp;
    out.name = (state.output.name || '').trim();
    var preset = state.params.preset ? G.presetById(state.params.preset) : null;
    if (preset) out.label = preset.name;
    return out;
  }

  function create() {
    el.create.disabled = true;
    setStatus('Building gradient…', 'busy');
    global.CEP.call('gradient', payload())
      .then(function (msg) { setStatus(msg || 'Gradient created', 'ok'); })
      .catch(function (err) { setStatus(err.message || 'Could not build the gradient', 'err'); })
      .then(function () { el.create.disabled = false; });
  }

  function freeze() {
    setStatus('Freezing…', 'busy');
    global.CEP.call('freeze', {})
      .then(function (msg) { setStatus(msg || 'Frozen', 'ok'); })
      .catch(function (err) { setStatus(err.message || 'Could not freeze the layer', 'err'); });
  }

  /** Copy settings — the same numbers the host builds from. */
  function copySettings() {
    var p = state.params;
    var preset = p.preset ? G.presetById(p.preset) : null;
    var text = JSON.stringify({
      generator: 'mesh',
      preset: preset ? preset.name : null,
      colorSpace: p.colorSpace.toUpperCase(),
      colors: p.colors,
      motion: p.motion,
      blend: p.blend,
      flow: p.flow,
      grain: p.grain,
      separation: p.separation,
      loopSeconds: p.loop,
      seed: p.seed
    }, null, 2);

    var done = function () {
      var label = el.copy.textContent;
      el.copy.textContent = 'Copied';
      setTimeout(function () { el.copy.textContent = label; }, 1200);
    };
    try {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
    } catch (e) {
      legacyCopy(text, done);
    }
  }

  /** CEF without the async clipboard API still has execCommand. */
  function legacyCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { setStatus('Could not reach the clipboard', 'err'); }
    document.body.removeChild(ta);
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    el.status = document.getElementById('status');
    el.statusMsg = document.getElementById('statusMsg');

    applyHostTheme();
    global.CEP.onThemeChange(applyHostTheme);
    build(document.getElementById('view'));

    // The preview is a live render; pause it when the panel is not on screen.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) PV.stopAll(); else refresh();
    });

    if (global.CEP.isMock) { setStatus('Preview mode — no After Effects host detected'); return; }
    global.CEP.call('ping', {})
      .then(function (msg) { setStatus(msg || 'Connected', 'ok'); })
      .catch(function (err) { setStatus(err.message, 'err'); });
  }
  boot();
})(window);
