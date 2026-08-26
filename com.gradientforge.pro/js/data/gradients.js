/**
 * gradients.js — the engine's data and maths (§5).
 *
 * The hard rule: **no gradient is ever an asset**. There is no bitmap, no baked
 * preview, no imported .grd — every gradient is a set of numbers turned into
 * pixels twice: once in the panel (WebGL, see gradient-preview.js) and once in
 * After Effects (native layer stack, see jsx/engine.jsx).
 *
 * One engine, per §5.1: a **mesh** — 2–5 colour points blended by Gaussian
 * weight in OKLab, with a low-frequency domain warp. §4.5 is the reason it is
 * built this way and not the other way:
 *
 *   · noise is a coordinate warp, never a colour source — high-frequency noise
 *     that gets coloured reads as smoke, not as a gradient
 *   · colour is mixed 2D spatially between points, never through a 1D
 *     luminance lookup, so there are no bands and no dead mid-tones
 *   · mixing happens in linear light / OKLab, so blue↔orange does not pass
 *     through mud
 *   · the output always carries at least one LSB of dither
 *
 * This file owns what the two renderers have to agree on: the parameter set,
 * the presets, colour interpolation, and resolve() — which places the colour
 * points from the seed so the preview and the After Effects build put them in
 * exactly the same spot.
 */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  /* ====================================================================== */
  /* Seeded randomness — same seed, same gradient, forever (§5.3)           */
  /* ====================================================================== */

  /** mulberry32: small, fast, and identical in every JS engine we run in. */
  function rng(seed) {
    var a = (seed | 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ====================================================================== */
  /* Colour                                                                 */
  /* ====================================================================== */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function hexToRgb(hex) {
    hex = String(hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [
      parseInt(hex.substr(0, 2), 16) / 255,
      parseInt(hex.substr(2, 2), 16) / 255,
      parseInt(hex.substr(4, 2), 16) / 255
    ];
  }

  function rgbToHex(c) {
    function ch(v) {
      var s = Math.round(clamp(v, 0, 1) * 255).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + ch(c[0]) + ch(c[1]) + ch(c[2]);
  }

  /* ---- sRGB ⇄ linear ---------------------------------------------------- */

  function toLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function toSrgb(v)   { return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }

  /* ---- OKLab (Björn Ottosson) ------------------------------------------ */

  function rgbToOklab(c) {
    var r = toLinear(c[0]), g = toLinear(c[1]), b = toLinear(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }

  function oklabToRgb(lab) {
    var l_ = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
    var m_ = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
    var s_ = lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2];
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
      clamp(toSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), 0, 1),
      clamp(toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), 0, 1),
      clamp(toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0, 1)
    ];
  }

  /* ---- HCL — polar OKLab (hue · chroma · lightness) ---------------------- */

  function rgbToHcl(c) {
    var lab = rgbToOklab(c);
    return [
      (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360,
      Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]),
      lab[0]
    ];
  }

  function hclToRgb(hcl) {
    var a = hcl[0] * Math.PI / 180;
    return oklabToRgb([hcl[2], Math.cos(a) * hcl[1], Math.sin(a) * hcl[1]]);
  }

  /* ---- two-colour interpolation (palettes, adding a stop) ---------------- */

  function lerp(a, b, t) { return a + (b - a) * t; }

  /** Hue takes the short way round, so blue→red never detours through green. */
  function lerpHue(a, b, t) {
    var d = ((b - a) % 360 + 540) % 360 - 180;
    return a + d * t;
  }

  function mix(hexA, hexB, t, spaceId) {
    var a, b, v;
    t = clamp(t, 0, 1);
    if (spaceId === 'srgb') {
      a = hexToRgb(hexA); b = hexToRgb(hexB);
      return rgbToHex([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
    }
    if (spaceId === 'hcl') {
      a = rgbToHcl(hexToRgb(hexA)); b = rgbToHcl(hexToRgb(hexB));
      return rgbToHex(hclToRgb([lerpHue(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]));
    }
    a = rgbToOklab(hexToRgb(hexA)); b = rgbToOklab(hexToRgb(hexB));
    v = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    return rgbToHex(oklabToRgb(v));
  }

  /* ---- palette generation (§5.2) ---------------------------------------- */

  var HARMONIES = [
    { id: 'analogous',     name: 'Analogous',     offsets: [-26, 0, 24, 48, 70] },
    { id: 'complementary', name: 'Complementary', offsets: [0, 22, 180, 202, 158] },
    { id: 'triadic',       name: 'Triadic',       offsets: [0, 120, 240, 60, 300] },
    { id: 'monochrome',    name: 'Monochrome',    offsets: [0, 0, 0, 0, 0] }
  ];

  /**
   * A harmonious palette from one base colour. Lightness and chroma walk across
   * the set in HCL, so the stops read as a designed ramp rather than as N hues
   * at the same brightness.
   */
  function palette(baseHex, harmonyId, count) {
    var h = HARMONIES.filter(function (x) { return x.id === harmonyId; })[0] || HARMONIES[0];
    var base = rgbToHcl(hexToRgb(baseHex));
    count = clamp(count || 3, 2, 5);
    var out = [];
    for (var i = 0; i < count; i++) {
      var t = count === 1 ? 0 : i / (count - 1);
      var hue = base[0] + h.offsets[i % h.offsets.length];
      var chroma = base[1] * (harmonyId === 'monochrome' ? 1 - 0.3 * t : 0.75 + 0.5 * (1 - t));
      var light = clamp(base[2] * (0.55 + 0.75 * t), 0.06, 0.97);
      out.push(rgbToHex(hclToRgb([hue, chroma, light])));
    }
    return out;
  }

  /** Shuffle's palette: one hue family, lightness climbing across the set. */
  function randomPalette(count, rand) {
    rand = rand || Math.random;
    var baseH = rand() * 360;
    var spread = 20 + rand() * 60;
    var out = [];
    for (var i = 0; i < count; i++) {
      var hue = (baseH + (i - (count - 1) / 2) * spread + 360) % 360;
      var chroma = 0.04 + rand() * 0.13;
      var light = clamp(0.16 + (i / Math.max(count - 1, 1)) * 0.66 + (rand() * 0.1 - 0.05), 0.06, 0.94);
      out.push(rgbToHex(hclToRgb([hue, chroma, light])));
    }
    return out;
  }

  /* ---- contrast (§5.2 readability warning) ------------------------------- */

  function relativeLuminance(hex) {
    var c = hexToRgb(hex);
    return 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
  }

  function contrastRatio(hexA, hexB) {
    var a = relativeLuminance(hexA), b = relativeLuminance(hexB);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** Would text survive on top of this gradient? Worst stop, both polarities. */
  function readability(colors) {
    var white = Infinity, black = Infinity;
    colors.forEach(function (s) {
      white = Math.min(white, contrastRatio(s, '#FFFFFF'));
      black = Math.min(black, contrastRatio(s, '#000000'));
    });
    var best = Math.max(white, black);
    var round = Math.round(best * 10) / 10;
    return {
      onWhite: white,
      onBlack: black,
      text: white >= black ? 'white' : 'black',
      ratio: best,
      ok: best >= 4.5,
      note: best >= 4.5
        ? round + ':1 against ' + (white >= black ? 'white' : 'black') + ' text'
        : 'Low contrast — text over this needs a scrim (' + round + ':1)'
    };
  }

  /* ====================================================================== */
  /* Parameters (§7) — four sliders on the surface, the rest under Advanced  */
  /* ====================================================================== */

  /**
   * All three mix in linear light — the difference is the space the weighted
   * mean is taken in. This is a preview-side choice: no native After Effects
   * effect composites in OKLab, so the build gets exact colour points and
   * linear-light compositing instead (see the README).
   */
  var SPACE_OPTS = [
    { value: 'oklab', label: 'OKLab' },
    { value: 'hcl',   label: 'HCL' },
    { value: 'srgb',  label: 'Linear RGB' }
  ];

  /**
   * Generator modes. Mesh blends colour points; the geometry modes drive the
   * same colour pipeline from a signed distance field instead. Curve and
   * Letter are the same pipeline with a different rasteriser and land next.
   */
  var MODES = [
    { id: 'mesh',   name: 'Mesh' },
    { id: 'curve',  name: 'Curve' },
    { id: 'letter', name: 'Letter' }
  ];

  var GEOMETRY_MODES = ['curve', 'letter'];

  var FONT_OPTS = [
    { value: '',                    label: 'System' },
    { value: 'Georgia',             label: 'Georgia' },
    { value: 'Times New Roman',     label: 'Times' },
    { value: 'Helvetica Neue',      label: 'Helvetica' },
    { value: 'Impact',              label: 'Impact' },
    { value: 'Courier New',         label: 'Courier' }
  ];

  /**
   * `modes` limits a parameter to the generators it means something for, which
   * is how the visible slider set changes per mode instead of growing. Mesh
   * shows four; Shape shows five, the ceiling.
   */
  var PARAMS = [
    { key: 'motion', label: 'Motion', type: 'number', value: 34, min: 0, max: 100, step: 1, group: 'main',
      blurb: '0 = still · above 0 = animated, loop guaranteed' },
    { key: 'blend',  label: 'Blend',  type: 'number', value: 62, min: 0, max: 100, step: 1, group: 'main',
      modes: ['mesh'], blurb: 'how far the colours reach into each other' },
    { key: 'spread', label: 'Spread', type: 'number', value: 34, min: 1, max: 100, step: 1, group: 'main',
      modes: GEOMETRY_MODES, blurb: 'how far the ramp reaches from the outline' },
    { key: 'direction', label: 'Direction', type: 'number', value: 0, min: 0, max: 100, step: 1,
      group: 'main', modes: GEOMETRY_MODES,
      blurb: '0 = colour crosses the outline · 100 = colour runs along it' },
    { key: 'offset', label: 'Offset', type: 'number', value: 0, min: -100, max: 100, step: 1,
      group: 'main', modes: ['curve'],
      blurb: 'moves the edge the ramp is measured from — in, or out' },
    { key: 'perLetter', label: 'Per letter', type: 'number', value: 0, min: 0, max: 100, step: 1,
      group: 'main', modes: ['letter'],
      blurb: '0 = one ramp across the word · 100 = a full ramp per glyph' },
    { key: 'flow',   label: 'Flow',   type: 'number', value: 28, min: 0, max: 100, step: 1, group: 'main',
      advancedIn: ['letter'], blurb: 'how much the shape bends and drifts' },
    /* `advancedIn` is how a control steps back without disappearing: it is a
       main slider in most modes and moves under Advanced in the ones that need
       the room. Five on the surface, always. */
    { key: 'grain',  label: 'Grain',  type: 'number', value: 18, min: 0, max: 100, step: 1,
      group: 'main', advancedIn: ['letter', 'curve'],
      blurb: 'texture, and the dither that kills banding' },

    { key: 'separation', label: 'Separation', type: 'number', value: 40, min: 0, max: 100, step: 1,
      group: 'advanced', modes: ['mesh'] },
    { key: 'textSize', label: 'Text size', type: 'number', value: 26, min: 5, max: 60, step: 1,
      group: 'advanced', modes: ['letter'] },
    { key: 'tracking', label: 'Tracking', type: 'number', value: 0, min: -20, max: 60, step: 1,
      group: 'advanced', modes: ['letter'] },
    { key: 'loop',       label: 'Loop', type: 'number', value: 12, min: 2, max: 60, step: 1, unit: 's', group: 'advanced' },
    { key: 'seed',       label: 'Seed',        type: 'number', value: 431, min: 1, max: 9999, step: 1, group: 'advanced' },
    { key: 'colorSpace', label: 'Space', type: 'select', value: 'oklab', options: SPACE_OPTS, group: 'advanced' },
    { key: 'linearBlending', label: 'Linear', type: 'bool', value: true, group: 'advanced' },

    /* Geometry row — shown only while a geometry mode is active. The Curve
       tab's Path ▾ is built at render time instead, because its options are
       whatever masks the comp has at that moment. */
    { key: 'text',  label: 'Text',  type: 'text', value: 'Gradient',
      group: 'geometry', modes: ['letter'], placeholder: 'Type something' },
    { key: 'font',  label: 'Font',  type: 'select', value: '', options: FONT_OPTS,
      group: 'geometry', modes: ['letter'] }
  ];

  /* ====================================================================== */
  /* Presets — parameter sets, not assets. Each one costs zero bytes.       */
  /* ====================================================================== */

  var SIGNATURE = [
    { id: 'aurora', name: 'Aurora', tags: 'signature blue teal cinematic calm',
      colors: ['#0b2a4a', '#1f7a8c', '#5ee6c0', '#0b2a4a'],
      set: { motion: 34, blend: 62, flow: 28, separation: 30, grain: 18, seed: 431 } },
    { id: 'silk',   name: 'Silk',   tags: 'signature beige soft warm minimal',
      colors: ['#f3e2d4', '#e0b8a0', '#c78a7a'],
      set: { motion: 16, blend: 78, flow: 14, separation: 18, grain: 26, seed: 1187 } },
    { id: 'petrol', name: 'Petrol', tags: 'signature dark blue cold premium',
      colors: ['#05070d', '#122a4d', '#2f6fb5', '#7fd4ff'],
      set: { motion: 42, blend: 52, flow: 40, separation: 45, grain: 14, seed: 2042 } },
    { id: 'ember',  name: 'Ember',  tags: 'signature warm fire orange dark',
      colors: ['#1a0806', '#7a1f14', '#e0602a', '#f2b544'],
      set: { motion: 28, blend: 58, flow: 34, separation: 38, grain: 20, seed: 3316 } },
    { id: 'fog',    name: 'Fog',    tags: 'signature gray minimal muted soft',
      colors: ['#c9ccd1', '#9aa0a8', '#6e747c', '#dfe2e6'],
      set: { motion: 12, blend: 84, flow: 10, separation: 12, grain: 34, seed: 655 } },
    { id: 'ultra',  name: 'Ultra',  tags: 'signature purple magenta neon bright',
      colors: ['#12002e', '#5b0fa8', '#c72bd6', '#ff9ae0'],
      set: { motion: 38, blend: 56, flow: 32, separation: 52, grain: 16, seed: 4820 } }
  ];

  // The database (js/data/library.js) sits behind the six signature sets. It is
  // 408 more palettes and motion profiles — still numbers, still zero assets.
  var LIB = global.LIBRARY || { presets: [], filters: [] };
  var PRESETS = SIGNATURE.concat(LIB.presets);

  var FILTERS = [{ id: 'all', name: 'All' }, { id: 'signature', name: 'Signature' }]
    .concat((LIB.filters || []).map(function (f) {
      return { id: f, name: f.charAt(0).toUpperCase() + f.slice(1) };
    }));

  /** Free-text over name and tags, plus the active filter chip. */
  function search(query, filter) {
    var words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    return PRESETS.filter(function (pr) {
      if (filter && filter !== 'all' && (pr.tags || '').indexOf(filter) === -1) return false;
      if (!words.length) return true;
      var hay = (pr.name + ' ' + (pr.tags || '')).toLowerCase();
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
      return true;
    });
  }

  /* ====================================================================== */
  /* Helpers                                                                */
  /* ====================================================================== */

  var MAX_COLORS = 5;

  function defaults() {
    var out = {};
    PARAMS.forEach(function (p) { out[p.key] = p.value; });
    out.colors = SIGNATURE[0].colors.slice();
    out.preset = null;
    out.mode = 'mesh';
    // Curve's geometry is not authored in the panel: `path` is which mask in
    // the comp it reads, and `nodes`/`closed` are that mask's own path, kept
    // here so the preview and the build work from one copy of it.
    out.path = '';
    out.nodes = [];
    out.closed = false;
    return out;
  }

  function fromPreset(id) {
    var pr = presetById(id);
    if (!pr) return defaults();
    var p = defaults();
    p.colors = pr.colors.slice();
    for (var k in pr.set) if (pr.set.hasOwnProperty(k)) p[k] = pr.set[k];
    p.preset = pr.id;
    return p;
  }

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  /** The parameters of one group that apply to one mode. */
  function paramsOf(group, mode) {
    mode = mode || 'mesh';
    return PARAMS.filter(function (p) {
      if (p.modes && p.modes.indexOf(mode) === -1) return false;
      var demoted = p.advancedIn && p.advancedIn.indexOf(mode) !== -1;
      if (group === 'advanced') return p.group === 'advanced' || demoted;
      return p.group === group && !demoted;
    });
  }

  function modeById(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return MODES[0];
  }

  /* ====================================================================== */
  /* resolve() — where the colour points go                                 */
  /* ====================================================================== */

  /**
   * Places one colour point per stop and hands the placement to both renderers,
   * so the panel and After Effects put the same colour in the same corner.
   *
   * Each point sits on a home position around the centre and orbits it. The
   * orbit's rate is a whole harmonic (1, 2 or 3 turns per loop), which is what
   * makes the loop exact: at the end of the cycle every point is back where it
   * started, so no cross-fade is needed anywhere (§4.5).
   *
   * Motion scales the orbit radius rather than the rate — so Motion 0 is a true
   * still, and turning Motion up never breaks the loop.
   */
  function resolve(p) {
    var colors = (p.colors || []).slice(0, MAX_COLORS);
    var n = colors.length;
    var rand = rng(p.seed);
    var points = [];

    /**
     * Home positions are spread **evenly** around the circle with one seeded
     * rotation and a small jitter, not drawn independently. Independent angles
     * let two points land on top of each other, and then one colour becomes a
     * blob sitting in a field of the other — which is what a two-colour palette
     * with one dark end looked like: a hole.
     *
     * How far out they sit depends on how many there are. Two colours want to
     * read as a sweep across the frame, so their homes go outside it and the
     * frame shows the transition; five colours want to sit inside it.
     */
    var homeR = n <= 2 ? 0.78 : n === 3 ? 0.46 : 0.30;
    var turn = rand() * TAU;

    for (var i = 0; i < n; i++) {
      var ang = turn + (i / Math.max(n, 1)) * TAU + (rand() - 0.5) * (TAU / Math.max(n, 1)) * 0.45;
      var rad = (0.16 + 0.20 * rand()) * (n <= 2 ? 0.5 : 1);
      var harm = 1 + Math.floor(rand() * 3);          // 1, 2 or 3 — integer, so it loops
      points.push({
        home: [0.5 + homeR * Math.cos(ang), 0.5 + homeR * Math.sin(ang)],
        rad: rad,
        harm: harm,
        ang: ang
      });
    }

    return {
      label: p.preset ? (presetById(p.preset) || {}).name : modeById(p.mode).name,
      mode: p.mode || 'mesh',
      // Everything the SDF pipeline needs, and nothing the shader needs to
      // know about — the rasteriser reads this, the colour pipeline does not.
      geometry: {
        mode: p.mode || 'mesh',
        path: p.path || '',
        nodes: p.nodes || [],
        closed: !!p.closed,
        text: p.text,
        font: p.font,
        textSize: p.textSize,
        tracking: p.tracking,
        glyphCount: glyphCount(p),
        spread: p.spread,
        direction: p.direction,
        offset: p.offset,
        perLetter: p.perLetter
      },
      colors: colors,
      points: points,
      // Points that sit far apart need a correspondingly wider falloff, or the
      // middle of the frame belongs to neither of them.
      reach: n <= 2 ? 0.30 : n === 3 ? 0.62 : 1,
      motion: p.motion,
      blend: p.blend,
      flow: p.flow,
      separation: p.separation,
      grain: p.grain,
      loop: p.loop,
      seed: p.seed,
      colorSpace: p.colorSpace,
      // Whether the build may switch the project to linear blending. It is the
      // one lever that gets After Effects close to how the preview mixes, and
      // it is a project-wide setting, so the user gets an explicit switch
      // rather than a silent side effect.
      linear: p.linearBlending !== false
    };
  }

  /** Glyphs the text will produce — the shader needs it to rebuild the run. */
  function glyphCount(p) {
    return String(p.text == null ? '' : p.text).replace(/\s/g, '').length || 1;
  }

  /** Where a colour point sits at a given point in the loop, 0–1 of the frame. */
  function pointAt(point, phase, motion) {
    var m = motion / 100;
    return [
      point.home[0] + point.rad * m * Math.cos(point.harm * phase + point.ang),
      point.home[1] + point.rad * m * Math.sin(point.harm * phase + point.ang * 1.7)
    ];
  }

  /* ====================================================================== */

  global.GRADIENTS = {
    TAU: TAU,
    maxColors: MAX_COLORS,
    modes: MODES,
    geometryModes: GEOMETRY_MODES,
    params: PARAMS,
    presets: PRESETS,
    signature: SIGNATURE,
    filters: FILTERS,
    search: search,
    profiles: LIB.profiles || {},
    harmonies: HARMONIES,
    spaces: SPACE_OPTS,
    defaults: defaults,
    fromPreset: fromPreset,
    presetById: presetById,
    paramsOf: paramsOf,
    modeById: modeById,
    resolve: resolve,
    pointAt: pointAt,

    rng: rng,
    mix: mix,
    palette: palette,
    randomPalette: randomPalette,
    readability: readability,
    contrastRatio: contrastRatio,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    rgbToOklab: rgbToOklab,
    oklabToRgb: oklabToRgb,
    rgbToHcl: rgbToHcl,
    hclToRgb: hclToRgb
  };
})(window);
