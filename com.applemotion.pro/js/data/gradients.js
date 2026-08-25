/**
 * gradients.js — the procedural gradient engine (GradientForge MVP, §5).
 *
 * The hard rule of this feature: **no gradient is ever an asset**. There is no
 * bitmap, no baked preview, no imported .grd — every gradient here is a set of
 * numbers that gets turned into pixels twice: once in the panel (canvas, see
 * gradient-preview.js) and once in After Effects (native effect chain, see
 * jsx/gradient/engine.jsx). Same parameters, same seed, same result.
 *
 * This file owns the parts that have to agree between those two renderers:
 *   · the parameter schema and the presets (parameters only — zero bytes each)
 *   · colour interpolation in RGB / HSL / OKLab / HCL
 *   · the seeded RNG, so a seed reproduces a gradient exactly (§5.3)
 *   · resolve(), which turns panel parameters into the payload the host builds
 *
 * Perceptual interpolation lives here rather than in ExtendScript on purpose:
 * After Effects blends colour in sRGB, so we subdivide the user's stops in
 * OKLab/HCL first and hand the host colours it only has to blend over short
 * distances — where sRGB and OKLab agree to the eye.
 */
(function (global) {
  'use strict';

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

  /* ---- HSL --------------------------------------------------------------- */

  function rgbToHsl(c) {
    var r = c[0], g = c[1], b = c[2];
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0, s = 0, l = (max + min) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
        : max === g ? (b - r) / d + 2
        : (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }

  function hslToRgb(hsl) {
    var h = ((hsl[0] % 360) + 360) % 360 / 360, s = clamp(hsl[1], 0, 1), l = clamp(hsl[2], 0, 1);
    if (!s) return [l, l, l];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function hue(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
  }

  /* ---- HCL — polar OKLab (hue · chroma · lightness) ---------------------- */

  function rgbToHcl(c) {
    var lab = rgbToOklab(c);
    var chroma = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
    var hue = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
    return [(hue + 360) % 360, chroma, lab[0]];
  }

  function hclToRgb(hcl) {
    var a = hcl[0] * Math.PI / 180;
    return oklabToRgb([hcl[2], Math.cos(a) * hcl[1], Math.sin(a) * hcl[1]]);
  }

  /* ---- interpolation ----------------------------------------------------- */

  function lerp(a, b, t) { return a + (b - a) * t; }

  /** Hue takes the short way round, so blue→red never detours through green. */
  function lerpHue(a, b, t) {
    var d = ((b - a) % 360 + 540) % 360 - 180;
    return a + d * t;
  }

  var SPACES = {
    rgb: {
      to: function (c) { return c; },
      from: function (v) { return [clamp(v[0], 0, 1), clamp(v[1], 0, 1), clamp(v[2], 0, 1)]; },
      mix: function (a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    },
    hsl: {
      to: rgbToHsl, from: hslToRgb,
      mix: function (a, b, t) { return [lerpHue(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    },
    oklab: {
      to: rgbToOklab, from: oklabToRgb,
      mix: function (a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    },
    hcl: {
      to: rgbToHcl, from: hclToRgb,
      mix: function (a, b, t) { return [lerpHue(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    }
  };

  function space(id) { return SPACES[id] || SPACES.oklab; }

  /** Blend two hex colours in the given space. */
  function mix(hexA, hexB, t, spaceId) {
    var sp = space(spaceId);
    return rgbToHex(sp.from(sp.mix(sp.to(hexToRgb(hexA)), sp.to(hexToRgb(hexB)), clamp(t, 0, 1))));
  }

  /** Sample an evenly-spaced stop list at 0–1. */
  function sample(stops, t, spaceId) {
    if (!stops.length) return '#000000';
    if (stops.length === 1) return stops[0];
    t = clamp(t, 0, 1) * (stops.length - 1);
    var i = Math.min(Math.floor(t), stops.length - 2);
    return mix(stops[i], stops[i + 1], t - i, spaceId);
  }

  /** Resample a stop list to exactly n colours — the perceptual step (§5.2). */
  function resample(stops, n, spaceId) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(sample(stops, n === 1 ? 0 : i / (n - 1), spaceId));
    return out;
  }

  /** 256-entry lookup, so the preview interpolates once per render, not per pixel. */
  function lut(stops, spaceId, size) {
    size = size || 256;
    var sp = space(spaceId), out = new Array(size);
    var pts = stops.map(function (h) { return sp.to(hexToRgb(h)); });
    for (var i = 0; i < size; i++) {
      var t = (i / (size - 1)) * (pts.length - 1);
      var k = Math.min(Math.floor(t), pts.length - 2);
      var c = sp.from(sp.mix(pts[k], pts[k + 1], t - k));
      out[i] = [c[0] * 255, c[1] * 255, c[2] * 255];
    }
    return out;
  }

  /* ---- palette generation (§5.2) ---------------------------------------- */

  var HARMONIES = [
    { id: 'analogous',     name: 'Analogous',     offsets: [-28, 0, 26, 52] },
    { id: 'complementary', name: 'Complementary', offsets: [0, 24, 180, 204] },
    { id: 'triadic',       name: 'Triadic',       offsets: [0, 120, 240, 60] },
    { id: 'monochrome',    name: 'Monochrome',    offsets: [0, 0, 0, 0] }
  ];

  /**
   * Build a harmonious palette from one base colour. Lightness and chroma walk
   * across the set in HCL so the stops read as a designed ramp, not four hues
   * at the same brightness.
   */
  function palette(baseHex, harmonyId, count) {
    var h = HARMONIES.filter(function (x) { return x.id === harmonyId; })[0] || HARMONIES[0];
    var base = rgbToHcl(hexToRgb(baseHex));
    count = clamp(count || 3, 2, 8);
    var out = [];
    for (var i = 0; i < count; i++) {
      var t = count === 1 ? 0 : i / (count - 1);
      var hue = base[0] + h.offsets[i % h.offsets.length];
      var chroma = base[1] * (harmonyId === 'monochrome' ? 1 - 0.35 * t : 0.75 + 0.5 * (1 - t));
      var light = clamp(base[2] * (0.62 + 0.62 * t), 0.06, 0.97);
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

  /**
   * Would text survive on top of this gradient? Checks every stop against both
   * white and black and reports the safer of the two, WCAG-style.
   */
  function readability(stops) {
    var white = Infinity, black = Infinity;
    stops.forEach(function (s) {
      white = Math.min(white, contrastRatio(s, '#FFFFFF'));
      black = Math.min(black, contrastRatio(s, '#000000'));
    });
    var best = Math.max(white, black);
    return {
      onWhite: white,
      onBlack: black,
      text: white >= black ? 'white' : 'black',
      ratio: best,
      ok: best >= 4.5,
      note: best >= 4.5
        ? Math.round(best * 10) / 10 + ':1 against ' + (white >= black ? 'white' : 'black') + ' text'
        : 'Low contrast — text over this needs a scrim (' + (Math.round(best * 10) / 10) + ':1)'
    };
  }

  /* ====================================================================== */
  /* Modes and parameters (§5.1)                                            */
  /* ====================================================================== */

  var MODES = [
    { id: 'linear', name: 'Linear',      blurb: 'Exact geometric ramp — linear or radial, the speed reference.' },
    { id: 'noise',  name: 'Noise Field', blurb: 'Fractal turbulence warps the ramp into organic colour fields.' },
    { id: 'flow',   name: 'Flow Field',  blurb: 'A second noise layer advects the colour — the fluid look.' }
  ];

  var SPACE_OPTS = [
    { value: 'rgb',   label: 'RGB' },
    { value: 'hsl',   label: 'HSL' },
    { value: 'oklab', label: 'OKLab' },
    { value: 'hcl',   label: 'HCL' }
  ];

  /**
   * Every mode shares this parameter set (§5.1). `showIf` mirrors the builder
   * convention in library.js: a key that has to be truthy, or `mode:<id>` for
   * a mode-specific control.
   */
  var PARAMS = [
    { key: 'mode',     label: 'Mode',       type: 'select', value: 'noise', options: MODES.map(function (m) { return { value: m.id, label: m.name }; }), group: 'mode' },
    { key: 'shape',    label: 'Shape',      type: 'select', value: 'linear', options: [{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }], group: 'shape' },
    { key: 'angle',    label: 'Angle',      type: 'number', value: 135, min: 0, max: 360, step: 1, unit: '°', group: 'shape' },
    { key: 'spread',   label: 'Spread',     type: 'number', value: 100, min: 20, max: 220, step: 1, unit: '%', group: 'shape' },

    { key: 'seed',     label: 'Seed',       type: 'number', value: 1204, min: 1, max: 9999, step: 1, group: 'field' },
    { key: 'scale',    label: 'Scale',      type: 'number', value: 55, min: 0, max: 100, step: 1, group: 'field' },
    { key: 'complexity', label: 'Complexity', type: 'number', value: 40, min: 0, max: 100, step: 1, group: 'field' },
    { key: 'warp',     label: 'Warp',       type: 'number', value: 45, min: 0, max: 100, step: 1, group: 'field' },
    { key: 'softness', label: 'Softness',   type: 'number', value: 26, min: 0, max: 100, step: 1, group: 'field' },
    { key: 'grain',    label: 'Grain',      type: 'number', value: 4, min: 0, max: 30, step: 1, unit: '%', group: 'field' },

    { key: 'speed',    label: 'Speed',      type: 'number', value: 24, min: 0, max: 100, step: 1, group: 'motion' },
    { key: 'loop',     label: 'Loop',       type: 'number', value: 8, min: 1, max: 30, step: 0.5, unit: 's', group: 'motion' },

    { key: 'colorSpace', label: 'Blend in', type: 'select', value: 'oklab', options: SPACE_OPTS, group: 'color' }
  ];

  /* ====================================================================== */
  /* Presets — parameter sets, not assets. Each one costs zero bytes.       */
  /* ====================================================================== */

  var PRESETS = [
    {
      id: 'aurora', name: 'Aurora', mode: 'flow',
      colors: ['#06121F', '#0A84FF', '#30D158', '#B5FFE1'],
      set: { scale: 62, complexity: 52, warp: 58, softness: 34, speed: 28, loop: 10, angle: 120 }
    },
    {
      id: 'sunset', name: 'Sunset Drift', mode: 'noise',
      colors: ['#2B1055', '#FF375F', '#FF9F0A'],
      set: { scale: 58, complexity: 34, warp: 46, softness: 30, speed: 18, loop: 12, angle: 155 }
    },
    {
      id: 'ocean', name: 'Deep Ocean', mode: 'flow',
      colors: ['#001B29', '#00527A', '#40C8E0'],
      set: { scale: 70, complexity: 44, warp: 52, softness: 38, speed: 22, loop: 14, angle: 90 }
    },
    {
      id: 'ember', name: 'Ember', mode: 'noise',
      colors: ['#180000', '#8B1A00', '#FF6B00', '#FFD08A'],
      set: { scale: 40, complexity: 62, warp: 66, softness: 20, grain: 8, speed: 30, loop: 8, angle: 90 }
    },
    {
      id: 'mint', name: 'Mint Glass', mode: 'noise',
      colors: ['#E8FFF6', '#9BE8D2', '#40C8E0'],
      set: { scale: 74, complexity: 26, warp: 30, softness: 46, grain: 2, speed: 12, loop: 16, angle: 200 }
    },
    {
      id: 'nebula', name: 'Nebula', mode: 'flow',
      colors: ['#05010F', '#3A0CA3', '#BF5AF2', '#FF375F', '#FFD6FF'],
      set: { scale: 50, complexity: 70, warp: 62, softness: 28, grain: 6, speed: 26, loop: 12, angle: 45 }
    },
    {
      id: 'dusk', name: 'Dusk Linear', mode: 'linear',
      colors: ['#1C1C4E', '#5A3FBF', '#FF9F0A'],
      set: { shape: 'linear', angle: 115, spread: 130, warp: 0, softness: 0, grain: 3, speed: 0 }
    },
    {
      id: 'halo', name: 'Halo', mode: 'linear',
      colors: ['#FFFFFF', '#B8C6FF', '#0A2A6B'],
      set: { shape: 'radial', angle: 90, spread: 120, warp: 12, softness: 12, grain: 2, speed: 8, loop: 10 }
    },
    {
      id: 'graphite', name: 'Graphite', mode: 'noise',
      colors: ['#0E0E10', '#2C2C2E', '#5A5A61'],
      set: { scale: 66, complexity: 30, warp: 34, softness: 40, grain: 10, speed: 10, loop: 20, angle: 160 }
    },
    {
      id: 'slate', name: 'Slate', mode: 'linear',
      colors: ['#F2F4F8', '#5A6B86'],
      set: { shape: 'linear', angle: 120, spread: 115, warp: 0, softness: 0, grain: 2, speed: 0 }
    },
    {
      id: 'peach', name: 'Peach Fizz', mode: 'noise',
      colors: ['#FFF1E6', '#FFC2A1', '#FF7B6B', '#7A2E5E'],
      set: { scale: 60, complexity: 38, warp: 50, softness: 32, speed: 16, loop: 12, angle: 210 }
    }
  ];

  /* ====================================================================== */
  /* Helpers                                                                */
  /* ====================================================================== */

  var DEFAULT_COLORS = ['#2B1055', '#7597DE', '#FFB86C'];

  function defaults() {
    var out = {};
    PARAMS.forEach(function (p) { out[p.key] = p.value; });
    out.colors = DEFAULT_COLORS.slice();
    out.preset = null;
    return out;
  }

  function fromPreset(id) {
    var pr = presetById(id);
    if (!pr) return defaults();
    var p = defaults();
    p.mode = pr.mode;
    p.colors = pr.colors.slice();
    for (var k in pr.set) if (pr.set.hasOwnProperty(k)) p[k] = pr.set[k];
    p.preset = pr.id;
    return p;
  }

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  function modeById(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return MODES[0];
  }

  /** Whether a parameter is relevant to the current mode. */
  function visible(param, p) {
    if (param.group === 'shape' && p.mode !== 'linear') return param.key === 'angle';
    if (param.key === 'loop' && !p.speed) return false;
    if (param.group === 'field' && p.mode === 'linear') {
      return param.key === 'softness' || param.key === 'grain' || param.key === 'warp' || param.key === 'seed';
    }
    return true;
  }

  /* ====================================================================== */
  /* resolve() — panel parameters → what both renderers actually draw       */
  /* ====================================================================== */

  /**
   * After Effects has no scriptable multi-stop gradient: Colorama's output
   * cycle and a shape layer's gradient stops are both unreachable from
   * ExtendScript. So the colour base is built from the two effects that *are*
   * scriptable, and this function decides which:
   *
   *   · exactly 2 stops in Linear mode → Gradient Ramp (mathematically exact)
   *   · anything else                  → 4-Color Gradient, fed 4 colours we
   *                                      resampled perceptually, plus a second
   *                                      4-Color Gradient layer for stops 5–8
   *                                      mixed in through a noise luma matte
   *
   * The seeded point offsets are computed here so the panel preview and the AE
   * build place the colour anchors identically.
   */
  function resolve(p) {
    var stops = (p.colors || DEFAULT_COLORS).slice(0, 8);
    var exact = p.mode === 'linear' && stops.length <= 2;
    var quadCount = stops.length > 4 ? 8 : 4;

    var quads = exact ? resample(stops, 2, p.colorSpace) : resample(stops, quadCount, p.colorSpace);
    var rand = rng(p.seed);

    // Seeded anchor jitter, as a fraction of the gradient's extent. Linear mode
    // keeps the anchors on the axis; the organic modes spread them out.
    var jitter = p.mode === 'linear' ? 0 : 0.26;
    function offsets(n, salt) {
      var out = [];
      for (var i = 0; i < n; i++) {
        out.push([
          (rand() - 0.5) * 2 * jitter,
          (rand() - 0.5) * 2 * jitter * (salt ? 1.3 : 1)
        ]);
      }
      return out;
    }

    var base = quads.slice(0, 4);
    var extra = quads.length > 4 ? quads.slice(4, 8) : null;

    return {
      label: p.preset ? (presetById(p.preset) || {}).name : modeById(p.mode).name,
      mode: p.mode,
      shape: p.shape,
      exact: exact,
      angle: p.angle,
      spread: p.spread,
      seed: p.seed,
      scale: p.scale,
      complexity: p.complexity,
      warp: p.mode === 'linear' ? Math.min(p.warp, 25) : p.warp,
      softness: p.softness,
      grain: p.grain,
      speed: p.speed,
      loop: p.loop,
      colorSpace: p.colorSpace,
      stops: stops,
      colors: base,
      extra: extra,
      offsets: offsets(4, false),
      extraOffsets: extra ? offsets(4, true) : null,
      // Evolution start, so a still (Speed 0) still differs seed to seed.
      phase: Math.round(rand() * 360)
    };
  }

  /* ====================================================================== */

  global.GRADIENTS = {
    modes: MODES,
    params: PARAMS,
    presets: PRESETS,
    harmonies: HARMONIES,
    spaces: SPACE_OPTS,
    defaults: defaults,
    fromPreset: fromPreset,
    presetById: presetById,
    modeById: modeById,
    visible: visible,
    resolve: resolve,

    rng: rng,
    mix: mix,
    sample: sample,
    resample: resample,
    lut: lut,
    palette: palette,
    readability: readability,
    contrastRatio: contrastRatio,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex
  };
})(window);
