/**
 * gradient.js — the Gradient tab (§7).
 *
 * A live preview at the top, presets under it, then the parameter set. Every
 * change re-renders the canvas immediately; Create sends the resolved payload
 * to jsx/gradient/engine.jsx, which assembles the native effect chain.
 *
 * The tab owns its own state, so nothing here touches the component builder.
 */
(function (global) {
  'use strict';

  var G = global.GRADIENTS, PV = global.GRADIENT_PREVIEW, C = global.CONTROLS;

  var el = {};
  var state = { params: G.fromPreset('aurora'), harmony: 'analogous', output: { precomp: true, name: '' } };
  var setStatus = function () {};
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ----------------------------------------------------------------- view */

  function build(view, statusFn) {
    setStatus = statusFn;
    view.innerHTML = '' +
      '<div class="gf-hero-wrap">' +
        '<canvas class="gf-hero" id="gfHero" data-q="hi"></canvas>' +
        '<div class="gf-hero-bar">' +
          '<button class="gf-pill" id="gfShuffle" title="New seed">Shuffle seed</button>' +
          '<span class="gf-badge" id="gfBadge"></span>' +
        '</div>' +
      '</div>' +
      '<p class="bnote" id="gfNote"></p>' +
      '<div class="section-label"><span>Presets</span><span>' + G.presets.length + '</span></div>' +
      '<div class="gf-presets" id="gfPresets"></div>' +
      '<div class="bsection"><div class="bsection-title">Colour stops</div>' +
        '<div class="gf-stops" id="gfStops"></div>' +
        '<div class="chips" id="gfHarmony"></div>' +
        '<p class="bnote" id="gfContrast"></p>' +
      '</div>' +
      '<div class="bsection"><div class="bsection-title">Generator</div><div id="gfFields"></div></div>' +
      '<div class="bsection"><div class="bsection-title">Output</div><div id="gfOutput"></div>' +
        '<p class="bnote">Nothing is imported: the layer stack is solids, native effects and expressions, ' +
        'so every value stays editable after it is built.</p>' +
      '</div>' +
      '<div class="gf-actions">' +
        '<button class="btn" id="gfFreeze" title="Freeze the selected gradient layer at the playhead">Freeze as still</button>' +
        '<button class="btn primary" id="gfCreate">Create gradient</button>' +
      '</div>';

    el.view = view;
    el.hero = view.querySelector('#gfHero');
    el.badge = view.querySelector('#gfBadge');
    el.note = view.querySelector('#gfNote');
    el.presets = view.querySelector('#gfPresets');
    el.stops = view.querySelector('#gfStops');
    el.harmony = view.querySelector('#gfHarmony');
    el.contrast = view.querySelector('#gfContrast');
    el.fields = view.querySelector('#gfFields');
    el.output = view.querySelector('#gfOutput');
    el.create = view.querySelector('#gfCreate');
    el.freeze = view.querySelector('#gfFreeze');
    el.shuffle = view.querySelector('#gfShuffle');

    el.shuffle.addEventListener('click', function () {
      state.params.seed = 1 + Math.floor(Math.random() * 9998);
      state.params.preset = null;
      C.sync(el.fields, 'seed', state.params.seed);
      renderPresets();
      refresh();
    });
    el.create.addEventListener('click', create);
    el.freeze.addEventListener('click', freeze);

    renderPresets();
    renderStops();
    renderHarmony();
    renderFields();
    renderOutput();
    refresh();
  }

  /* -------------------------------------------------------------- presets */

  function renderPresets() {
    el.presets.innerHTML = '';
    G.presets.forEach(function (pr) {
      var b = document.createElement('button');
      b.className = 'gf-preset' + (state.params.preset === pr.id ? ' on' : '');
      b.title = pr.name + ' · ' + G.modeById(pr.mode).name;
      var cv = document.createElement('canvas');
      cv.className = 'gf-preset-art';
      b.appendChild(cv);
      var name = document.createElement('span');
      name.className = 'gf-preset-name';
      name.textContent = pr.name;
      b.appendChild(name);
      b.addEventListener('click', function () {
        state.params = G.fromPreset(pr.id);
        renderPresets(); renderStops(); renderFields(); refresh();
      });
      el.presets.appendChild(b);
      // Each tile draws its own first frame — a rendering, never a thumbnail.
      requestAnimationFrame(function () {
        try { PV.render(cv, G.fromPreset(pr.id), 0); } catch (e) {}
      });
    });
  }

  /* ---------------------------------------------------------------- stops */

  function renderStops() {
    el.stops.innerHTML = '';
    state.params.colors.forEach(function (hex, i) {
      var wrap = document.createElement('div');
      wrap.className = 'gf-stop';

      var input = document.createElement('input');
      input.type = 'color';
      input.value = hex;
      input.title = 'Stop ' + (i + 1) + ' — ' + hex;
      input.addEventListener('input', function () {
        state.params.colors[i] = input.value;
        state.params.preset = null;
        renderPresets();
        refresh();
      });
      wrap.appendChild(input);

      if (state.params.colors.length > 2) {
        var rm = document.createElement('button');
        rm.className = 'gf-stop-rm';
        rm.textContent = '×';
        rm.title = 'Remove stop';
        rm.addEventListener('click', function () {
          state.params.colors.splice(i, 1);
          state.params.preset = null;
          renderPresets(); renderStops(); refresh();
        });
        wrap.appendChild(rm);
      }
      el.stops.appendChild(wrap);
    });

    if (state.params.colors.length < 8) {
      var add = document.createElement('button');
      add.className = 'gf-stop-add';
      add.textContent = '+';
      add.title = 'Add a colour stop (max 8)';
      add.addEventListener('click', function () {
        var c = state.params.colors;
        // The new stop continues the ramp rather than repeating it: one step
        // further along the current harmony from the last colour.
        c.push(G.palette(c[c.length - 1], state.harmony, 2)[1]);
        state.params.preset = null;
        renderPresets(); renderStops(); refresh();
      });
      el.stops.appendChild(add);
    }
  }

  function renderHarmony() {
    el.harmony.innerHTML = '';
    G.harmonies.forEach(function (h) {
      var b = document.createElement('button');
      b.className = 'chip' + (state.harmony === h.id ? ' on' : '');
      b.textContent = h.name;
      b.title = 'Rebuild the stops from the first colour, ' + h.name.toLowerCase();
      b.addEventListener('click', function () {
        state.harmony = h.id;
        state.params.colors = G.palette(state.params.colors[0], h.id, state.params.colors.length);
        state.params.preset = null;
        renderHarmony(); renderPresets(); renderStops(); refresh();
      });
      el.harmony.appendChild(b);
    });
  }

  /* --------------------------------------------------------------- fields */

  function renderFields() {
    el.fields.innerHTML = '';
    G.params.forEach(function (p) {
      el.fields.appendChild(C.field(p, state.params, onChange));
    });
    refreshVisibility();
  }

  function renderOutput() {
    el.output.innerHTML = '';
    el.output.appendChild(C.field(
      { key: 'precomp', label: 'Precomp', type: 'bool' },
      state.output,
      function () {}
    ));
    el.output.appendChild(C.field(
      { key: 'name', label: 'Name', type: 'text', placeholder: 'GRADIENT — ' + G.modeById(state.params.mode).name },
      state.output,
      function () {}
    ));
  }

  function onChange(key) {
    if (key === 'mode' || key === 'speed') refreshVisibility();
    if (key !== 'seed') state.params.preset = null;
    renderPresets();
    refresh();
  }

  function refreshVisibility() {
    G.params.forEach(function (p) {
      var node = el.fields.querySelector('.field[data-key="' + p.key + '"]');
      if (node) node.hidden = !G.visible(p, state.params);
    });
  }

  /* -------------------------------------------------------------- preview */

  function refresh() {
    var p = state.params;
    var r = G.resolve(p);

    el.badge.textContent = G.modeById(p.mode).name + ' · seed ' + p.seed +
      (p.speed ? ' · loops ' + p.loop + 's' : ' · still');

    var read = G.readability(p.colors);
    el.contrast.textContent = read.note;
    el.contrast.className = 'bnote' + (read.ok ? '' : ' warn');

    var stopWord = p.colors.length + ' stop' + (p.colors.length === 1 ? '' : 's');
    el.note.textContent = r.exact
      ? stopWord + ' · Gradient Ramp, exact ' + p.shape + ' · ' + G.modeById(p.mode).blurb
      : stopWord + ' → ' + r.colors.length + (r.extra ? ' + ' + r.extra.length : '') +
        ' anchors blended in ' + p.colorSpace.toUpperCase() + ' · ' + G.modeById(p.mode).blurb;

    PV.stop(el.hero);
    if (p.speed > 0 && !reduceMotion) {
      PV.animate(el.hero, function () { return state.params; }, 20);
    } else {
      PV.render(el.hero, p, 0);
    }
  }

  /* ---------------------------------------------------------------- build */

  function create() {
    var payload = G.resolve(JSON.parse(JSON.stringify(state.params)));
    payload.precomp = !!state.output.precomp;
    payload.name = (state.output.name || '').trim();

    el.create.disabled = true;
    setStatus('Building gradient…', 'busy');
    global.CEP.call('gradient', payload)
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

  /* ------------------------------------------------------------ lifecycle */

  function activate(on) {
    if (on) refresh();
    else PV.stop(el.hero);
  }

  global.GRADIENT_PANEL = { build: build, activate: activate };
})(window);
