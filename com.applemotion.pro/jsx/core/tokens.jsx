/**
 * tokens.jsx — the design system values on the After Effects side.
 * Mirrors js/data/tokens.js so the SVG preview and the AE output agree (§27).
 */

$.global.AMUI = $.global.AMUI || {};

AMUI.T = (function () {
  var T = {};

  /* ---- scales ----------------------------------------------------------- */
  T.spacing  = [4, 8, 12, 16, 20, 24, 32, 40, 48];
  T.radius   = [8, 12, 16, 20, 24, 32];
  T.duration = [0.15, 0.25, 0.4, 0.6, 0.9, 1.2];

  /* ---- palettes --------------------------------------------------------- */
  T.palettes = {
    appleDark:    { accent: '#0A84FF', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    appleLight:   { accent: '#007AFF', surface: '#F2F2F7', text: '#1C1C1E', dark: false },
    systemBlue:   { accent: '#0A84FF', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemGreen:  { accent: '#30D158', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemRed:    { accent: '#FF453A', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemOrange: { accent: '#FF9F0A', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemPurple: { accent: '#BF5AF2', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemPink:   { accent: '#FF375F', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    systemTeal:   { accent: '#40C8E0', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    glassNeutral: { accent: '#8E8E93', surface: '#2C2C2E', text: '#FFFFFF', dark: true }
  };

  T.semantic = { success: '#30D158', error: '#FF453A', warning: '#FF9F0A', info: '#0A84FF' };

  /* ---- glass materials -------------------------------------------------- */
  T.glass = {
    clear:   { blur: 14, tintOpacity: 8,  border: 40, highlight: 55, saturation: 130 },
    frosted: { blur: 34, tintOpacity: 16, border: 34, highlight: 45, saturation: 118 },
    dark:    { blur: 26, tintOpacity: 42, border: 22, highlight: 28, saturation: 108 },
    white:   { blur: 26, tintOpacity: 30, border: 60, highlight: 70, saturation: 115 },
    soft:    { blur: 44, tintOpacity: 12, border: 26, highlight: 38, saturation: 122 },
    liquid:  { blur: 20, tintOpacity: 10, border: 70, highlight: 85, saturation: 140 },
    ultra:   { blur: 10, tintOpacity: 5,  border: 48, highlight: 60, saturation: 128 }
  };

  /* ---- shadows ---------------------------------------------------------- */
  T.shadow = {
    none:     { opacity: 0,   distance: 0,  softness: 0,  direction: 180 },
    subtle:   { opacity: 45,  distance: 6,  softness: 24, direction: 180 },
    raised:   { opacity: 70,  distance: 14, softness: 44, direction: 180 },
    elevated: { opacity: 90,  distance: 22, softness: 64, direction: 180 },
    floating: { opacity: 100, distance: 32, softness: 88, direction: 180 }
  };

  /* ---- type scale, in points at a 1x component -------------------------- */
  T.type = {
    largeTitle: { size: 46, weight: 'bold',     tracking: -30 },
    title:      { size: 32, weight: 'semibold', tracking: -20 },
    headline:   { size: 24, weight: 'semibold', tracking: -10 },
    body:       { size: 20, weight: null,       tracking: 0 },
    callout:    { size: 18, weight: null,       tracking: 2 },
    caption:    { size: 16, weight: null,       tracking: 4 },
    footnote:   { size: 13, weight: null,       tracking: 12 },
    numeric:    { size: 44, weight: 'bold',     tracking: -24 }
  };

  T.icon = { sm: 22, md: 34, lg: 48, xl: 64, corner: 0.28 };

  // PostScript base names for the fonts the panel offers; the suffix (-Bold,
  // -Semibold, -Regular) is added per weight. AE substitutes if one is missing.
  T.fonts = {
    sf:        'SFProDisplay',
    sfrounded: 'SFProRounded',
    inter:     'Inter',
    helvetica: 'HelveticaNeue',
    system:    'SFProDisplay'
  };

  /* ---- lookups ---------------------------------------------------------- */
  T.palette = function (id) { return T.palettes[id] || T.palettes.appleDark; };
  T.glassPreset = function (id) { return T.glass[id] || T.glass.frosted; };
  T.shadowPreset = function (id) { return T.shadow[id] || T.shadow.raised; };

  return T;
})();
