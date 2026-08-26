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
    allFilters: false,
    selected: -1,
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
        '<canvas class="pen" id="gfPen" hidden tabindex="0" ' +
                'aria-label="Curve editor: click to add a point, drag to bend it"></canvas>' +
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
    el.pen = view.querySelector('#gfPen');
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
    el.shuffle = view.querySelector('#gfShuffle');

    el.shuffle.addEventListener('click', shuffle);
    el.create.addEventListener('click', create);
    el.freeze.addEventListener('click', freeze);
    el.copy.addEventListener('click', copySettings);
    el.more.addEventListener('click', function () {
      state.allFilters = !state.allFilters;
      renderFilters();
    });
    el.pen.addEventListener('pointerdown', penDown);
    el.pen.addEventListener('pointermove', penMove);
    el.pen.addEventListener('pointerup', penUp);
    el.pen.addEventListener('pointercancel', penUp);
    el.pen.addEventListener('keydown', penKey);
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
    var mode = state.params.mode;
    var fields = G.paramsOf('geometry', mode);
    var pen = mode === 'curve';
    el.geometry.hidden = !fields.length && !pen;
    el.geometry.innerHTML = '';
    fields.forEach(function (p) {
      el.geometry.appendChild(C.field(p, state.params, onChange));
    });
    if (pen) el.geometry.appendChild(penTools());
    el.pen.hidden = !pen;
    if (pen) drawPen();
  }

  function penTools() {
    var row = document.createElement('div');
    row.className = 'tools';

    var hint = document.createElement('span');
    hint.className = 'tool-hint';
    hint.textContent = state.params.nodes.length
      ? state.params.nodes.length + (state.params.closed ? ' points · closed' : ' points')
      : 'Click the canvas to draw';
    row.appendChild(hint);

    function tool(label, title, fn, on) {
      var b = document.createElement('button');
      b.className = 'tool' + (on ? ' on' : '');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      row.appendChild(b);
      return b;
    }

    var sel = state.selected;
    var node = sel >= 0 ? state.params.nodes[sel] : null;
    if (node) {
      tool(node.corner ? 'Corner' : 'Smooth',
           'Toggle the selected point between smooth and corner',
           function () { node.corner = !node.corner; onGeometry(); }, true);
      tool('Delete', 'Remove the selected point', function () {
        state.params.nodes.splice(sel, 1);
        state.selected = -1;
        onGeometry();
      });
    }
    tool(state.params.closed ? 'Open' : 'Close', 'Close or open the path', function () {
      if (state.params.nodes.length > 2) { state.params.closed = !state.params.closed; onGeometry(); }
    }, state.params.closed);
    tool('Clear', 'Start again', function () {
      state.params.nodes = []; state.params.closed = false; state.selected = -1; onGeometry();
    });
    return row;
  }

  /* ------------------------------------------------------------- pen tool */

  /**
   * A minimal pen: click to place a point, drag while placing to pull its
   * handles, drag a point to move it, drag a handle to reshape, click the first
   * point to close. Everything lands in `params.nodes`, in 0–1 of the frame
   * height, which is the same space the rasteriser reads.
   */
  var drag = null;

  function penSpace(ev) {
    var r = el.pen.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.height, y: (ev.clientY - r.top) / r.height, h: r.height };
  }

  function hitTest(pt) {
    var nodes = state.params.nodes, tol = 14 / (el.pen.getBoundingClientRect().height || 1);
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (Math.hypot(n.x - pt.x, n.y - pt.y) < tol) return { node: i, handle: false };
      if (!n.corner && i === state.selected &&
          Math.hypot(n.x + (n.hx || 0) - pt.x, n.y + (n.hy || 0) - pt.y) < tol) {
        return { node: i, handle: true };
      }
    }
    return null;
  }

  function penDown(ev) {
    if (state.params.mode !== 'curve') return;
    ev.preventDefault();
    el.pen.focus();
    var pt = penSpace(ev);
    var hit = hitTest(pt);

    if (hit) {
      // Clicking the first point closes the path.
      if (!hit.handle && hit.node === 0 && state.params.nodes.length > 2 && !state.params.closed) {
        state.params.closed = true;
        state.selected = 0;
        onGeometry();
        return;
      }
      state.selected = hit.node;
      drag = { index: hit.node, handle: hit.handle, moved: false };
    } else {
      state.params.nodes.push({ x: pt.x, y: pt.y, hx: 0, hy: 0, corner: false });
      state.selected = state.params.nodes.length - 1;
      drag = { index: state.selected, handle: true, fresh: true, moved: false };
    }
    el.pen.setPointerCapture(ev.pointerId);
    onGeometry();
  }

  function penMove(ev) {
    if (!drag) return;
    var pt = penSpace(ev);
    var n = state.params.nodes[drag.index];
    if (!n) return;
    if (drag.handle) {
      n.hx = pt.x - n.x; n.hy = pt.y - n.y;
      n.corner = false;
    } else {
      n.x = pt.x; n.y = pt.y;
    }
    drag.moved = true;
    onGeometry();
  }

  function penUp(ev) {
    if (!drag) return;
    // A click with no drag is a corner point, not a smooth one with zero pull.
    var n = state.params.nodes[drag.index];
    if (n && drag.fresh && !drag.moved) n.corner = true;
    try { el.pen.releasePointerCapture(ev.pointerId); } catch (e) {}
    drag = null;
    onGeometry();
  }

  function penKey(ev) {
    if (state.params.mode !== 'curve') return;
    var nodes = state.params.nodes;
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && state.selected >= 0) {
      nodes.splice(state.selected, 1);
      state.selected = -1;
      ev.preventDefault();
      onGeometry();
    } else if (ev.key === 'Escape') {
      state.selected = -1;
      onGeometry();
    } else if (ev.key === 'Enter' && nodes.length > 2) {
      state.params.closed = !state.params.closed;
      onGeometry();
    }
  }

  function onGeometry() {
    clearPreset();
    renderGeometry();
    refresh();
  }

  /** The editor's own overlay: points, handles and the path between them. */
  function drawPen() {
    var rect = el.pen.getBoundingClientRect();
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(rect.width * dpr)), h = Math.max(2, Math.round(rect.height * dpr));
    if (el.pen.width !== w || el.pen.height !== h) { el.pen.width = w; el.pen.height = h; }
    var ctx = el.pen.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    var nodes = state.params.nodes, s = rect.height * dpr;
    if (!nodes.length) return;

    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(nodes[0].x * s, nodes[0].y * s);
    var last = nodes.length - (state.params.closed ? 0 : 1);
    for (var i = 0; i < last; i++) {
      var a = nodes[i], b = nodes[(i + 1) % nodes.length];
      ctx.bezierCurveTo((a.x + (a.hx || 0)) * s, (a.y + (a.hy || 0)) * s,
                        (b.x - (b.hx || 0)) * s, (b.y - (b.hy || 0)) * s, b.x * s, b.y * s);
    }
    ctx.stroke();

    nodes.forEach(function (n, i) {
      var on = i === state.selected;
      if (on && !n.corner) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(n.x * s, n.y * s);
        ctx.lineTo((n.x + (n.hx || 0)) * s, (n.y + (n.hy || 0)) * s);
        ctx.stroke();
        dot((n.x + (n.hx || 0)) * s, (n.y + (n.hy || 0)) * s, 3.5 * dpr, 'rgba(255,255,255,0.75)');
      }
      dot(n.x * s, n.y * s, (on ? 5 : 4) * dpr, on ? '#fff' : 'rgba(255,255,255,0.8)');
    });

    function dot(x, y, r, fill) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke();
    }
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

  var GEOM_KEYS = ['spread', 'direction', 'fill', 'nodes', 'closed', 'text', 'font',
                   'textSize', 'tracking', 'perLetter', 'seam'];
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

    if (!el.pen.hidden) drawPen();

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
