/**
 * app.js — the panel.
 *
 * Two rules shape the layout. From the spec: never more than five sliders on
 * the surface, preset first, and chrome that carries no colour of its own. From the
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
    allFilters: false,
    query: '',
    output: { precomp: true, name: '' },
    // What the host says is selected right now. Null until the first probe
    // answers — a button cannot claim a reason it has not been given.
    host: null,
    busy: false
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
        '<div class="chips-foot"><button class="chips-more" id="gfMore"></button></div>' +
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
          '<button class="ghost" id="gfFreeze">Export still frame</button>' +
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
    el.more = view.querySelector('#gfMore');
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
    el.hint = document.getElementById('gfHint');
    el.shuffle = view.querySelector('#gfShuffle');

    el.shuffle.addEventListener('click', shuffle);
    el.create.addEventListener('click', create);
    el.freeze.addEventListener('click', freeze);
    el.copy.addEventListener('click', copySettings);
    el.more.addEventListener('click', function () {
      state.allFilters = !state.allFilters;
      renderFilters();
    });
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
        // A different tab asks the host a different question — ask it now
        // rather than at the next tick, so Create updates with the tab.
        probeHost();
      });
      el.modes.appendChild(b);
    });
  }

  /** Geometry-specific controls, present only while that mode is active. */
  function renderGeometry() {
    var mode = state.params.mode;
    var fields = G.paramsOf('geometry', mode);
    var curve = mode === 'curve';
    el.geometry.hidden = !fields.length && !curve;
    el.geometry.innerHTML = '';
    if (curve) el.geometry.appendChild(pathPicker());
    fields.forEach(function (p) {
      el.geometry.appendChild(C.field(p, state.params, onChange));
    });
  }

  /**
   * Path ▾ — every mask path in the comp, listed by layer and mask name.
   *
   * The options are whatever the host reported on the last tick, so this is
   * built here rather than declared in the parameter schema. Picking one is the
   * only geometry decision the Curve tab has: the points, and whether the path
   * is closed, belong to the mask itself.
   */
  function pathPicker() {
    var curve = (state.host && state.host.curve) || {};
    var paths = curve.paths || [];
    var opts = paths.length
      ? paths.map(function (x) { return { value: x.id, label: x.label }; })
      : [{ value: '', label: state.host ? 'No mask paths in this comp' : 'Looking…' }];

    var field = C.field(
      { key: 'path', label: 'Path', type: 'select', options: opts },
      state.params,
      function () {
        // A different path is a different geometry — ask for its points now.
        state.params.nodes = [];
        clearPreset();
        probeHost();
      });
    var sel = field.querySelector('select');
    if (sel) {
      explain(sel, !paths.length,
              state.host ? 'There are no mask paths in this comp yet — draw one on any layer.'
                         : 'Waiting for After Effects to answer.',
              'Which mask path the gradient reads');
      sel.value = state.params.path || (curve.id || '');
    }
    return field;
  }

  /* --------------------------------------------------------------- library */

  function renderFilters() {
    el.filters.innerHTML = '';
    el.filters.classList.toggle('open', !!state.allFilters);
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

    // The chips wrap; two rows show, the rest are one click away. The toggle
    // lives outside the clipped list, or it would be the one chip nobody can
    // reach.
    el.more.textContent = state.allFilters ? 'Fewer' : 'More';
    el.more.hidden = el.filters.scrollHeight <= el.filters.clientHeight && !state.allFilters;
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

  var GEOM_KEYS = ['spread', 'direction', 'offset', 'path', 'nodes', 'closed',
                   'text', 'font', 'textSize', 'tracking', 'depth', 'softness', 'style'];
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

    syncCreate();

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

  /* ------------------------------------------------------- geometry sources */

  /**
   * One interface, three tabs (§3 of the change request):
   *
   *     geometry = activeSource().getGeometry()
   *     if (!geometry.isValid) → show the reason, stop
   *     applyGradient(geometry, readSharedParams())
   *
   * Create never branches on which tab is open. Each source answers for itself,
   * and a source with nothing to build from answers with the sentence the user
   * needs to read — never with silence, and never by quietly building a mesh
   * instead of what the tab promised.
   *
   * Validity is the host's call, not the panel's: geometry.jsx probes the real
   * selection and hands back the same reasons, so the disabled button and the
   * refused build can never disagree.
   */

  var OFFLINE = 'No After Effects here — the geometry tabs build from a layer in the timeline.';
  var WAITING = 'Looking for After Effects…';

  function hostSays(mode) {
    var h = state.host;
    if (!h) return { valid: false, reason: WAITING };
    if (h.offline) {
      return mode === 'mesh' ? { valid: true, reason: '' } : { valid: false, reason: OFFLINE };
    }
    if (!h.comp) return { valid: false, reason: 'Open a composition first, then try again.' };
    return h[mode] || { valid: false, reason: 'This tab has no source in the host build.' };
  }

  /** The shared half of every answer, so the three below only add their own. */
  function answer(mode, extra) {
    var r = hostSays(mode);
    var out = { kind: mode, isValid: !!r.valid, reason: r.reason || '', detail: r.detail || '' };
    for (var k in extra) if (extra.hasOwnProperty(k)) out[k] = extra[k];
    return out;
  }

  var SOURCES = {
    /** No geometry: the gradient is the frame. Valid whenever a comp is open. */
    mesh: {
      id: 'mesh',
      getGeometry: function () { return answer('mesh', {}); }
    },

    /**
     * A mask path the user already drew. The panel authors none of it: `path`
     * says which mask, and the points and the closed flag are the mask's own,
     * read back from the host. Sending the id along means the build resolves to
     * the very path the preview drew, even if the timeline selection has since
     * moved.
     */
    curve: {
      id: 'curve',
      getGeometry: function () {
        var p = state.params;
        return answer('curve', {
          path: p.path,
          nodes: p.nodes,
          closed: !!p.closed,
          spread: p.spread,
          direction: p.direction,
          offset: p.offset
        });
      }
    },

    /**
     * A layer the user already has — its alpha becomes the gradient's shape and
     * its edges become the volume. A text layer is the case this is for, and it
     * is the one that can hand the preview its actual words.
     */
    letter: {
      id: 'letter',
      getGeometry: function () {
        var p = state.params;
        return answer('letter', {
          spread: p.spread,
          direction: p.direction,
          depth: p.depth,
          softness: p.softness,
          style: p.style
        });
      }
    }
  };

  function activeSource() { return SOURCES[state.params.mode] || SOURCES.mesh; }

  /** Everything that is the same in every tab: palette, motion, loop, output. */
  function readSharedParams() {
    var out = G.resolve(JSON.parse(JSON.stringify(state.params)));
    out.precomp = !!state.output.precomp;
    out.name = (state.output.name || '').trim();
    var preset = state.params.preset ? G.presetById(state.params.preset) : null;
    if (preset) out.label = preset.name;
    return out;
  }

  function applyGradient(geometry, params) {
    // The tab's answer wins over anything resolve() guessed about geometry.
    for (var k in geometry) if (geometry.hasOwnProperty(k)) params.geometry[k] = geometry[k];
    params.geometry.mode = geometry.kind;
    params.mode = geometry.kind;

    state.busy = true;
    syncCreate();
    setStatus('Building gradient…', 'busy');
    return global.CEP.call('gradient', params)
      .then(function (msg) { setStatus(msg || 'Gradient created', 'ok'); })
      .catch(function (err) { setStatus(err.message || 'Could not build the gradient', 'err'); })
      .then(function () { state.busy = false; probeHost(); });
  }

  function create() {
    var geometry = activeSource().getGeometry();
    if (!geometry.isValid) { setStatus(geometry.reason, 'err'); return; }
    applyGradient(geometry, readSharedParams());
  }

  /* ------------------------------------------------- what the host can see */

  /**
   * Selection changes under the panel with no event to listen for, so the panel
   * asks. It is a read-only call: no undo group, nothing built, and a failure
   * only costs one tick.
   */
  var probeTimer = null;

  function probeHost() {
    if (global.CEP.isMock) {
      state.host = { offline: true };
      syncCreate();
      return Promise.resolve();
    }
    // Which tab is open decides how much comes back: the points of a mask path
    // are only worth sending while something is drawing them.
    var want = { mode: state.params.mode, path: state.params.path || '' };
    return global.CEP.call('selection', want).then(function (json) {
      try { state.host = JSON.parse(json); } catch (e) { state.host = { comp: null }; }
    }, function () {
      state.host = { comp: null };
    }).then(adoptPath).then(adoptType).then(syncCreate);
  }

  /**
   * Copy the host's path into the parameters the renderer reads.
   *
   * This is the join the Curve tab is built on: the preview and the build draw
   * the same mask because there is only one copy of it, and it came from the
   * timeline. Editing the mask in After Effects shows up here on the next tick.
   */
  /**
   * Take the selected text layer's own words, family and size.
   *
   * The panel cannot read After Effects' glyph outlines, so it re-sets the same
   * string in the browser's text engine — but it should at least be the same
   * string. A layer that is not type has no words to lend, and the preview
   * falls back to its name so there is still a shape to judge.
   */
  function adoptType() {
    if (state.params.mode !== 'letter') return;
    var l = (state.host && state.host.letter) || {};
    var next = l.type || (l.detail ? { text: l.detail, font: '', size: 26, tracking: 0 } : null);
    if (!next) return;
    var p = state.params;
    if (p.text === next.text && p.font === next.font &&
        Math.abs(p.textSize - next.size) < 0.01 && p.tracking === next.tracking) return;
    p.text = next.text;
    p.font = next.font;
    p.textSize = Math.max(2, Math.min(90, next.size));
    p.tracking = next.tracking;
    refresh();
  }

  function adoptPath() {
    if (state.params.mode !== 'curve') return;
    var curve = (state.host && state.host.curve) || {};
    var before = state.params.path;
    if (curve.id && curve.id !== state.params.path) state.params.path = curve.id;

    if (!curve.nodes) return;
    var same = state.params.closed === !!curve.closed &&
               JSON.stringify(state.params.nodes) === JSON.stringify(nodesOf(curve.nodes));
    if (same && before === state.params.path) return;

    state.params.nodes = nodesOf(curve.nodes);
    state.params.closed = !!curve.closed;
    renderGeometry();
    refresh();
  }

  /** The wire form is six numbers a point; the renderer wants them named. */
  function nodesOf(rows) {
    return (rows || []).map(function (r) {
      return { x: r[0], y: r[1], ox: r[2], oy: r[3], ix: r[4], iy: r[5] };
    });
  }

  function watchHost(on) {
    clearInterval(probeTimer);
    if (!on) return;
    probeHost();
    if (!global.CEP.isMock) probeTimer = setInterval(probeHost, 1500);
  }

  /**
   * A disabled control has to carry the reason it is disabled — in the tooltip
   * always, and on the surface where there is room for it. A control that is
   * off with no explanation reads as a bug.
   */
  function explain(node, blocked, reason, ready) {
    if (!node) return;
    node.disabled = blocked;
    node.title = blocked ? reason : (ready || '');
    node.setAttribute('aria-disabled', String(blocked));
  }

  /** Create's enabled state and the line under it are one decision. */
  function syncCreate() {
    var g = activeSource().getGeometry();
    var blocked = !g.isValid;

    explain(el.create, blocked || state.busy,
            state.busy ? 'Building…' : g.reason,
            'Build this gradient in After Effects');
    // busy is not the same as blocked: the reason still belongs to the source.
    if (state.busy && g.isValid) el.create.setAttribute('aria-disabled', 'false');

    var line = blocked ? g.reason : (g.detail ? 'Builds from ' + g.detail : '');
    el.hint.textContent = line;
    el.hint.hidden = !line;
    el.hint.setAttribute('data-state', blocked ? 'blocked' : 'ready');

    syncFreeze();
  }

  /** The same treatment for Export still frame, which needs a layer selected. */
  function syncFreeze() {
    if (!el.freeze) return;
    var h = state.host;
    var f = h && !h.offline ? h.freeze : null;
    if (!h) {
      explain(el.freeze, true, 'Looking for After Effects…');
    } else if (h.offline) {
      explain(el.freeze, true, 'No After Effects here — freezing happens in the comp.');
    } else {
      explain(el.freeze, !f || !f.valid, (f && f.reason) || 'Nothing to freeze.',
              'Freeze the selected gradient layer at the playhead');
    }
  }

  function freeze() {
    if (el.freeze.disabled) return;
    setStatus('Freezing…', 'busy');
    global.CEP.call('freeze', {})
      .then(function (msg) { setStatus(msg || 'Frozen', 'ok'); })
      .catch(function (err) { setStatus(err.message || 'Could not freeze the layer', 'err'); })
      .then(probeHost);
  }

  /**
   * Copy settings — everything, and only what applies.
   *
   * It is built from the same two calls Create uses, so it cannot drift from
   * what actually gets built: readSharedParams() for the palette and motion,
   * and the active source's getGeometry() for the rest. A Mesh copy carries no
   * Depth, a Curve copy carries the path it read, and a Letter copy carries the
   * layer and the type it took from it.
   */
  function settingsSnapshot() {
    var p = state.params;
    var shared = readSharedParams();
    var geom = activeSource().getGeometry();
    var preset = p.preset ? G.presetById(p.preset) : null;

    var out = {
      plugin: 'GradientForge ' + G.version,
      generator: p.mode,
      preset: preset ? preset.name : null,
      colorSpace: p.colorSpace.toUpperCase(),
      linearBlending: p.linearBlending !== false,
      colors: p.colors.slice(),
      motion: p.motion,
      flow: p.flow,
      grain: p.grain,
      loopSeconds: p.loop,
      seed: p.seed
    };

    if (p.mode === 'mesh') {
      out.blend = p.blend;
      out.separation = p.separation;
      // The placement the seed resolves to, so a copied gradient can be
      // checked against what was on screen rather than only re-derived.
      out.points = shared.points.map(function (pt) {
        return { home: pt.home.map(round4), radius: round4(pt.rad), harmonic: pt.harm };
      });
    }

    if (p.mode === 'curve') {
      out.path = pathRef();
      out.closed = !!p.closed;
      out.pointCount = (p.nodes || []).length;
      out.spread = p.spread;
      out.direction = p.direction;
      out.offset = p.offset;
    }

    if (p.mode === 'letter') {
      out.layer = layerRef();
      out.spread = p.spread;
      out.direction = p.direction;
      out.depth = p.depth;
      out.softness = p.softness;
      out.style = p.style;
    }

    out.output = { precomp: !!state.output.precomp, name: (state.output.name || '').trim() };
    // Anything the After Effects build does not honour yet is said here rather
    // than left to look like it was applied.
    if (p.mode !== 'mesh') out.previewOnly = ['direction'];
    if (!geom.isValid) out.note = geom.reason;
    return out;
  }

  function round4(v) { return Math.round(v * 10000) / 10000; }

  /** Which mask the Curve tab read, by id and by the name a human recognises. */
  function pathRef() {
    var curve = (state.host && state.host.curve) || {};
    var label = '';
    (curve.paths || []).forEach(function (x) { if (x.id === state.params.path) label = x.label; });
    if (!label) label = curve.detail || '';
    var parts = label.split(' · ');
    return {
      id: state.params.path || null,
      layer: parts[0] || null,
      mask: parts.length > 1 ? parts.slice(1).join(' · ') : null
    };
  }

  /** Which layer the Letter tab took, and the type it took from it. */
  function layerRef() {
    var l = (state.host && state.host.letter) || {};
    var out = { name: l.detail || null, isText: !!l.isText };
    if (l.isText || state.params.text) {
      out.type = {
        text: state.params.text,
        font: state.params.font || 'system',
        sizePercent: round4(state.params.textSize),
        tracking: state.params.tracking
      };
    }
    return out;
  }

  function copySettings() {
    var text = JSON.stringify(settingsSnapshot(), null, 2);

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

    // The preview is a live render and the probe is a live question; both stop
    // when the panel is not on screen.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { PV.stopAll(); watchHost(false); }
      else { refresh(); watchHost(true); }
    });

    watchHost(true);

    if (global.CEP.isMock) { setStatus('Preview mode — no After Effects host detected'); return; }
    global.CEP.call('ping', {})
      .then(function (msg) { setStatus(msg || 'Connected', 'ok'); })
      .catch(function (err) { setStatus(err.message, 'err'); });
  }
  boot();
})(window);
