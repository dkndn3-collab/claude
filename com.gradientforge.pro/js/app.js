/**
 * app.js — the panel (§7).
 *
 * The layout follows one rule from the spec: **at most four sliders on the
 * surface.** Everything else is a preset, a button, or lives under Advanced.
 * Preset first, slider second — nobody should have to find a good gradient by
 * turning knobs from zero.
 *
 * The chrome is deliberately achromatic. The gradient is the only colour on
 * screen, because a coloured interface would bias the colour judgement this
 * panel exists to support.
 */
(function (global) {
  'use strict';

  var G = global.GRADIENTS, PV = global.GRADIENT_PREVIEW, C = global.CONTROLS;

  var el = {};
  var state = {
    params: G.fromPreset('aurora'),
    harmony: 'analogous',
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
      '<div class="gf-hero-wrap">' +
        '<canvas class="gf-hero" id="gfHero"></canvas>' +
        '<div class="gf-hero-bar"><span class="gf-badge" id="gfBadge"></span></div>' +
      '</div>' +

      '<div class="gf-presets" id="gfPresets"></div>' +

      '<div class="gf-palette">' +
        '<div class="gf-stops" id="gfStops"></div>' +
        '<button class="btn" id="gfShuffle" title="New seed and a fresh palette">Shuffle</button>' +
      '</div>' +
      '<p class="bnote" id="gfContrast"></p>' +

      '<div class="gf-sliders" id="gfSliders"></div>' +

      '<div class="gf-actions">' +
        '<button class="btn" id="gfCopy" title="Copy the parameters as JSON">Copy settings</button>' +
        '<button class="btn primary" id="gfCreate">Create gradient</button>' +
      '</div>' +

      '<details class="gf-adv" id="gfAdv">' +
        '<summary>Advanced</summary>' +
        '<div id="gfAdvFields"></div>' +
        '<div id="gfOutput"></div>' +
        '<div class="gf-actions gf-actions-sub">' +
          '<button class="btn" id="gfFreeze" title="Freeze the selected gradient layer at the playhead">Export still frame</button>' +
        '</div>' +
        '<p class="bnote" id="gfEngine"></p>' +
        '<p class="bnote">Space picks how the preview takes its weighted mean. ' +
        'After Effects has no effect that composites in OKLab, so the build gets ' +
        'the exact colour points and — with Linear on — linear-light compositing, ' +
        'which is the part that keeps blue↔orange out of the mud.</p>' +
      '</details>';

    el.view = view;
    el.hero = view.querySelector('#gfHero');
    el.badge = view.querySelector('#gfBadge');
    el.presets = view.querySelector('#gfPresets');
    el.stops = view.querySelector('#gfStops');
    el.contrast = view.querySelector('#gfContrast');
    el.sliders = view.querySelector('#gfSliders');
    el.advFields = view.querySelector('#gfAdvFields');
    el.output = view.querySelector('#gfOutput');
    el.engine = view.querySelector('#gfEngine');
    el.create = view.querySelector('#gfCreate');
    el.freeze = view.querySelector('#gfFreeze');
    el.copy = view.querySelector('#gfCopy');
    el.shuffle = view.querySelector('#gfShuffle');

    el.shuffle.addEventListener('click', shuffle);
    el.create.addEventListener('click', create);
    el.freeze.addEventListener('click', freeze);
    el.copy.addEventListener('click', copySettings);

    renderPresets();
    renderStops();
    renderSliders();
    renderAdvanced();
    refresh();
  }

  /* -------------------------------------------------------------- presets */

  function renderPresets() {
    el.presets.innerHTML = '';
    G.presets.forEach(function (pr) {
      var b = document.createElement('button');
      b.className = 'gf-preset' + (state.params.preset === pr.id ? ' on' : '');
      b.title = pr.name;
      var cv = document.createElement('canvas');
      cv.className = 'gf-preset-art';
      b.appendChild(cv);
      var name = document.createElement('span');
      name.className = 'gf-preset-name';
      name.textContent = pr.name;
      b.appendChild(name);
      b.addEventListener('click', function () {
        state.params = G.fromPreset(pr.id);
        renderPresets(); renderStops(); syncControls(); refresh();
      });
      el.presets.appendChild(b);
      // Each tile draws its own first frame — a rendering, never a thumbnail.
      requestAnimationFrame(function () {
        try { PV.render(cv, G.fromPreset(pr.id), 0); } catch (e) {}
      });
    });
  }

  /* ------------------------------------------------------------- palette */

  function renderStops() {
    el.stops.innerHTML = '';
    state.params.colors.forEach(function (hex, i) {
      var wrap = document.createElement('div');
      wrap.className = 'gf-stop';

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
        rm.className = 'gf-stop-rm';
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
      add.className = 'gf-stop-add';
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
    var on = el.presets.querySelector('.gf-preset.on');
    if (on) on.classList.remove('on');
  }

  /* --------------------------------------------------------------- fields */

  function renderSliders() {
    el.sliders.innerHTML = '';
    G.paramsOf('main').forEach(function (p) {
      el.sliders.appendChild(C.field(p, state.params, onChange));
      if (p.blurb) {
        var note = document.createElement('p');
        note.className = 'gf-slider-note';
        note.textContent = p.blurb;
        el.sliders.appendChild(note);
      }
    });
  }

  function renderAdvanced() {
    el.advFields.innerHTML = '';
    G.paramsOf('advanced').forEach(function (p) {
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

    el.badge.textContent = (p.motion ? 'loops ' + p.loop + 's' : 'still') +
      ' · ' + p.colors.length + ' colours · seed ' + p.seed;

    var read = G.readability(p.colors);
    el.contrast.textContent = read.note;
    el.contrast.className = 'bnote' + (read.ok ? '' : ' warn');

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

  /** Copy settings — the same numbers the host builds from (§7). */
  function copySettings() {
    var p = state.params;
    var text = JSON.stringify({
      generator: 'mesh',
      colorSpace: p.colorSpace.toUpperCase(),
      colors: p.colors,
      motion: p.motion,
      blend: p.blend,
      flow: p.flow,
      grain: p.grain,
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
