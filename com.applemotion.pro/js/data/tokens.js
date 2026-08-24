/**
 * tokens.js — the design system, single source of truth for the panel side.
 *
 * Every component reads its radius, spacing, type, shadow, glass and motion
 * from here, so the whole library looks like one product (§27). jsx/core/tokens.jsx
 * mirrors these values so the SVG preview and the After Effects output agree.
 *
 * Nothing in the panel hardcodes a pixel radius or a duration — it names a token.
 */
(function (global) {
  'use strict';

  /* ---- scales (§27) ----------------------------------------------------- */

  // Named steps. Components reference a step index or the raw value; the point
  // is that "medium radius" means the same thing on a card as on a button.
  var SPACING  = [4, 8, 12, 16, 20, 24, 32, 40, 48];
  var RADIUS   = [8, 12, 16, 20, 24, 32];
  var DURATION = [0.15, 0.25, 0.4, 0.6, 0.9, 1.2];

  /* ---- typography ------------------------------------------------------- */

  // Size in points at 1x, with the tracking Apple uses at each optical size.
  var TYPE = {
    largeTitle: { size: 46, weight: 'bold',     tracking: -30, leading: 52 },
    title:      { size: 32, weight: 'semibold', tracking: -20, leading: 38 },
    headline:   { size: 24, weight: 'semibold', tracking: -10, leading: 28 },
    body:       { size: 20, weight: null,       tracking: 0,   leading: 26 },
    callout:    { size: 18, weight: null,       tracking: 2,   leading: 24 },
    caption:    { size: 16, weight: null,       tracking: 4,   leading: 20 },
    footnote:   { size: 13, weight: null,       tracking: 12,  leading: 16 },
    numeric:    { size: 44, weight: 'bold',     tracking: -24, leading: 48 }
  };

  // Font families the panel can offer; the user picks a default (persisted).
  var FONTS = [
    { id: 'sf',        name: 'SF Pro',        stack: ['SF Pro Display', 'SF Pro Text', 'SFProDisplay-Regular'] },
    { id: 'sfrounded', name: 'SF Pro Rounded',stack: ['SF Pro Rounded', 'SFProRounded-Regular'] },
    { id: 'inter',     name: 'Inter',         stack: ['Inter', 'Inter-Regular'] },
    { id: 'helvetica', name: 'Helvetica Neue',stack: ['Helvetica Neue', 'HelveticaNeue'] },
    { id: 'system',    name: 'System',        stack: ['-apple-system', 'Segoe UI'] }
  ];

  /* ---- colour ----------------------------------------------------------- */

  var PALETTES = [
    { id: 'appleDark',   name: 'Apple Dark',   accent: '#0A84FF', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    { id: 'appleLight',  name: 'Apple Light',  accent: '#007AFF', surface: '#F2F2F7', text: '#1C1C1E', dark: false },
    { id: 'systemBlue',  name: 'System Blue',  accent: '#0A84FF', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    { id: 'systemGreen', name: 'System Green', accent: '#30D158', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    { id: 'systemRed',   name: 'System Red',   accent: '#FF453A', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    { id: 'systemOrange',name: 'System Orange',accent: '#FF9F0A', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    { id: 'systemPurple',name: 'System Purple',accent: '#BF5AF2', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    { id: 'systemPink',  name: 'System Pink',  accent: '#FF375F', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    { id: 'systemTeal',  name: 'System Teal',  accent: '#40C8E0', surface: '#1C1C1E', text: '#FFFFFF', dark: true },
    { id: 'glassNeutral',name: 'Glass Neutral',accent: '#8E8E93', surface: '#2C2C2E', text: '#FFFFFF', dark: true }
  ];

  // Semantic colours used by status variants (success / error / warning).
  var SEMANTIC = {
    success: '#30D158',
    error:   '#FF453A',
    warning: '#FF9F0A',
    info:    '#0A84FF'
  };

  /* ---- glass materials (§27, §5.8) -------------------------------------- */

  // Each material is a recipe the glass engine follows: how far it blurs what's
  // behind it, how much tint it lays down, how bright the edge light is, and a
  // saturation lift that makes real device glass look alive rather than grey.
  var GLASS = [
    { id: 'clear',   name: 'Clear Glass',   blur: 14, tintOpacity: 8,  border: 40, highlight: 55, saturation: 130, noise: 3 },
    { id: 'frosted', name: 'Frosted Glass', blur: 34, tintOpacity: 16, border: 34, highlight: 45, saturation: 118, noise: 5 },
    { id: 'dark',    name: 'Dark Glass',    blur: 26, tintOpacity: 42, border: 22, highlight: 28, saturation: 108, noise: 4 },
    { id: 'white',   name: 'White Glass',   blur: 26, tintOpacity: 30, border: 60, highlight: 70, saturation: 115, noise: 3 },
    { id: 'soft',    name: 'Soft Glass',    blur: 44, tintOpacity: 12, border: 26, highlight: 38, saturation: 122, noise: 6 },
    { id: 'liquid',  name: 'Liquid Glass',  blur: 20, tintOpacity: 10, border: 70, highlight: 85, saturation: 140, noise: 2 },
    { id: 'ultra',   name: 'Ultra Thin',    blur: 10, tintOpacity: 5,  border: 48, highlight: 60, saturation: 128, noise: 2 }
  ];

  /* ---- shadows (§27) ---------------------------------------------------- */

  // Elevation levels. A card at "raised" and a floating button share the same
  // physical light, so the whole set reads as one surface stack.
  var SHADOW = {
    none:     { opacity: 0,   distance: 0,  softness: 0,  direction: 180 },
    subtle:   { opacity: 45,  distance: 6,  softness: 24, direction: 180 },
    raised:   { opacity: 70,  distance: 14, softness: 44, direction: 180 },
    elevated: { opacity: 90,  distance: 22, softness: 64, direction: 180 },
    floating: { opacity: 100, distance: 32, softness: 88, direction: 180 }
  };

  /* ---- icon sizing ------------------------------------------------------ */

  var ICON = { sm: 22, md: 34, lg: 48, xl: 64, corner: 0.28 /* radius as fraction of size */ };

  /* ---- lookups ---------------------------------------------------------- */

  function byId(list, id, fallbackIndex) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[fallbackIndex || 0];
  }

  // Nearest scale step to an arbitrary value — lets sliders snap to the system.
  function nearest(scale, value) {
    var best = scale[0], bd = Math.abs(scale[0] - value);
    for (var i = 1; i < scale.length; i++) {
      var d = Math.abs(scale[i] - value);
      if (d < bd) { bd = d; best = scale[i]; }
    }
    return best;
  }

  global.TOKENS = {
    spacing: SPACING,
    radius: RADIUS,
    duration: DURATION,
    type: TYPE,
    fonts: FONTS,
    palettes: PALETTES,
    semantic: SEMANTIC,
    glass: GLASS,
    shadow: SHADOW,
    icon: ICON,
    nearest: nearest,
    fontById:    function (id) { return byId(FONTS, id, 0); },
    paletteById: function (id) { return byId(PALETTES, id, 0); },
    glassById:   function (id) { return byId(GLASS, id, 1); }
  };
})(window);
