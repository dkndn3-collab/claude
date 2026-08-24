/**
 * tokens.jsx — the design system values.
 * Mirrors js/data/library.js so the SVG preview and the AE output agree.
 */

$.global.AMUI = $.global.AMUI || {};

AMUI.T = (function () {
  var T = {};

  T.palettes = {
    appleDark:    { accent: '#0A84FF', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    appleLight:   { accent: '#007AFF', surface: '#F2F2F7', text: '#1C1C1E', dark: false },
    systemBlue:   { accent: '#0A84FF', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemGreen:  { accent: '#30D158', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemRed:    { accent: '#FF453A', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemOrange: { accent: '#FF9F0A', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    glassNeutral: { accent: '#8E8E93', surface: '#2C2C2E', text: '#FFFFFF', dark: true }
  };

  T.glass = {
    clear:   { blur: 14, tintOpacity: 8,  border: 40, highlight: 55 },
    frosted: { blur: 34, tintOpacity: 16, border: 34, highlight: 45 },
    dark:    { blur: 26, tintOpacity: 42, border: 22, highlight: 28 },
    white:   { blur: 26, tintOpacity: 30, border: 60, highlight: 70 },
    soft:    { blur: 44, tintOpacity: 12, border: 26, highlight: 38 },
    liquid:  { blur: 20, tintOpacity: 10, border: 70, highlight: 85 }
  };

  /** Type scale, in points at a 1x component. */
  T.type = {
    largeTitle: { size: 46, weight: 'bold',     tracking: -30 },
    title:      { size: 32, weight: 'semibold', tracking: -20 },
    headline:   { size: 24, weight: 'semibold', tracking: -10 },
    body:       { size: 20, weight: null,       tracking: 0 },
    caption:    { size: 16, weight: null,       tracking: 4 },
    footnote:   { size: 13, weight: null,       tracking: 12 },
    numeric:    { size: 44, weight: 'bold',     tracking: -24 }
  };

  T.palette = function (id) {
    return T.palettes[id] || T.palettes.appleDark;
  };

  T.glassPreset = function (id) {
    return T.glass[id] || T.glass.frosted;
  };

  return T;
})();
