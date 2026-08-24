/**
 * library.js — every component in the panel is defined here (§25, §26).
 *
 * A component is one entry with a shared, configurable shape: variants and
 * styles are data, not duplicated code (§26). The builder reads this file to
 * lay out its sections — Category · Component · Variant · Style · Content ·
 * Animation — and jsx/api.jsx looks up AMUI.Components[type] by id.
 *
 * Design values (palettes, glass materials, radii, durations) come from
 * TOKENS; animation presets come from MOTION. Nothing is hardcoded twice.
 */
(function (global) {
  'use strict';

  var TK = global.TOKENS;
  var M = global.MOTION;

  function opt(x) { return { value: x.id, label: x.name }; }
  var PALETTE_OPTS = TK.palettes.map(opt);
  var GLASS_OPTS = TK.glass.map(opt);

  // Shared parameter fragments, so every surface exposes the same radius/glass
  // controls with the same ranges — a card and a button round the same way.
  function radius(v)   { return { key: 'radius', label: 'Radius', type: 'number', value: v, min: 0, max: 64, step: 1, unit: 'px', group: 'style' }; }
  function palette(v)  { return { key: 'palette', label: 'Palette', type: 'select', value: v, options: PALETTE_OPTS, group: 'style' }; }
  function glassStyle(v){ return { key: 'glassPreset', label: 'Material', type: 'select', value: v, options: GLASS_OPTS, group: 'style', showIf: 'glass' }; }
  function shadow(v)   { return { key: 'shadow', label: 'Shadow', type: 'bool', value: v, group: 'style' }; }

  /* ---------------------------------------------------------------------- */
  /* Categories (§25 top-level grouping)                                     */
  /* ---------------------------------------------------------------------- */
  var CATEGORIES = [
    { id: 'all',  name: 'All' },
    { id: 'ui',   name: 'Core UI' },
    { id: 'data', name: 'Data' },
    { id: 'ios',  name: 'System UI' }
  ];

  /* ---------------------------------------------------------------------- */
  /* Components                                                              */
  /* ---------------------------------------------------------------------- */

  var COMPONENTS = [
    /* ---- Glass card --------------------------------------------------- */
    {
      id: 'card', name: 'Glass Card', category: 'ui',
      tags: ['card', 'glass', 'surface', 'kpi', 'stat', 'dashboard'],
      blurb: 'Rounded surface with icon, title, subtitle and value.',
      defaultAnim: 'spring',
      variants: [
        { id: 'basic',    name: 'Basic',    set: { glass: false, shadow: true,  palette: 'appleDark' } },
        { id: 'glass',    name: 'Glass',    set: { glass: true,  glassPreset: 'frosted', shadow: true } },
        { id: 'dark',     name: 'Dark',     set: { glass: false, palette: 'appleDark', shadow: true } },
        { id: 'light',    name: 'Light',    set: { glass: false, palette: 'appleLight', shadow: true } },
        { id: 'minimal',  name: 'Minimal',  set: { glass: false, shadow: false, icon: false } },
        { id: 'elevated', name: 'Elevated', set: { glass: true,  glassPreset: 'liquid', shadow: true } },
        { id: 'compact',  name: 'Compact',  set: { width: 300, height: 150, padding: 20 } },
        { id: 'large',    name: 'Large',    set: { width: 560, height: 300, padding: 36 } }
      ],
      params: [
        { key: 'variant', label: 'Variant', type: 'select', value: 'glass', options: null, group: 'variant' },
        { key: 'width',   label: 'Width',   type: 'number', value: 420, min: 120, max: 1600, step: 10, unit: 'px', group: 'content' },
        { key: 'height',  label: 'Height',  type: 'number', value: 220, min: 80,  max: 1200, step: 10, unit: 'px', group: 'content' },
        radius(24), { key: 'padding', label: 'Padding', type: 'number', value: 28, min: 0, max: 64, step: 1, unit: 'px', group: 'style' },
        { key: 'glass', label: 'Glass', type: 'bool', value: true, group: 'style' },
        glassStyle('frosted'),
        { key: 'blur', label: 'Blur', type: 'number', value: 34, min: 0, max: 120, step: 1, group: 'style', showIf: 'glass' },
        shadow(true),
        { key: 'icon', label: 'Icon', type: 'bool', value: true, group: 'content' },
        { key: 'title', label: 'Title', type: 'text', value: 'Monthly revenue', group: 'content' },
        { key: 'subtitle', label: 'Subtitle', type: 'text', value: 'Last 30 days', group: 'content' },
        { key: 'value', label: 'Value', type: 'text', value: '$48,920', group: 'content' },
        palette('appleDark')
      ]
    },

    /* ---- Button ------------------------------------------------------- */
    {
      id: 'button', name: 'Button', category: 'ui',
      tags: ['button', 'cta', 'action', 'pill', 'glass', 'ghost'],
      blurb: 'Tap target in seven variants, from filled to floating.',
      defaultAnim: 'snappy',
      variants: [
        { id: 'primary',   name: 'Primary',   set: { shadow: false } },
        { id: 'secondary', name: 'Secondary', set: { shadow: false } },
        { id: 'glass',     name: 'Glass',     set: { glass: true, glassPreset: 'clear', shadow: true } },
        { id: 'ghost',     name: 'Ghost',     set: { shadow: false } },
        { id: 'icon',      name: 'Icon',      set: { shadow: false } },
        { id: 'pill',      name: 'Pill',      set: { shadow: false } },
        { id: 'floating',  name: 'Floating',  set: { shadow: true } }
      ],
      params: [
        { key: 'variant', label: 'Variant', type: 'select', value: 'primary', options: null, group: 'variant' },
        { key: 'label', label: 'Label', type: 'text', value: 'Continue', group: 'content' },
        { key: 'width',  label: 'Width',  type: 'number', value: 260, min: 64, max: 800, step: 4, unit: 'px', group: 'content' },
        { key: 'height', label: 'Height', type: 'number', value: 64, min: 36, max: 120, step: 2, unit: 'px', group: 'content' },
        radius(16),
        { key: 'glass', label: 'Glass', type: 'bool', value: false, group: 'style' },
        glassStyle('clear'),
        shadow(false),
        palette('appleDark')
      ]
    },

    /* ---- Notification ------------------------------------------------- */
    {
      id: 'notification', name: 'Notification', category: 'ios',
      tags: ['notification', 'banner', 'alert', 'ios', 'push', 'toast'],
      blurb: 'iOS push banner: icon, app name, timestamp and message.',
      defaultAnim: 'gentleSpring',
      variants: [
        { id: 'minimal', name: 'Minimal', set: { glass: false, shadow: false } },
        { id: 'glass',   name: 'Glass',   set: { glass: true, glassPreset: 'dark', shadow: true } },
        { id: 'system',  name: 'System',  set: { glass: true, glassPreset: 'frosted', palette: 'appleLight' } },
        { id: 'dark',    name: 'Dark',    set: { glass: true, glassPreset: 'dark', palette: 'appleDark' } },
        { id: 'success', name: 'Success', set: { glass: true, glassPreset: 'dark' } },
        { id: 'error',   name: 'Error',   set: { glass: true, glassPreset: 'dark' } },
        { id: 'warning', name: 'Warning', set: { glass: true, glassPreset: 'dark' } }
      ],
      params: [
        { key: 'variant', label: 'Variant', type: 'select', value: 'glass', options: null, group: 'variant' },
        { key: 'width', label: 'Width', type: 'number', value: 700, min: 240, max: 1600, step: 10, unit: 'px', group: 'content' },
        radius(34),
        { key: 'appName', label: 'App name', type: 'text', value: 'MESSAGES', group: 'content' },
        { key: 'title', label: 'Title', type: 'text', value: 'Sarah Chen', group: 'content' },
        { key: 'message', label: 'Message', type: 'text', value: 'Sending over the final cut now', group: 'content' },
        { key: 'time', label: 'Time', type: 'text', value: 'now', group: 'content' },
        { key: 'glass', label: 'Glass', type: 'bool', value: true, group: 'style' },
        glassStyle('dark'),
        { key: 'blur', label: 'Blur', type: 'number', value: 26, min: 0, max: 120, step: 1, group: 'style', showIf: 'glass' },
        shadow(true),
        palette('appleDark')
      ]
    },

    /* ---- Toggle ------------------------------------------------------- */
    {
      id: 'toggle', name: 'Toggle Switch', category: 'ios',
      tags: ['toggle', 'switch', 'settings', 'control', 'ios'],
      blurb: 'Settings switch. One On/Off control drives track and knob.',
      defaultAnim: 'snappy',
      variants: [
        { id: 'default',  name: 'Default',  set: { size: 104, showLabel: false } },
        { id: 'large',    name: 'Large',    set: { size: 160, showLabel: false } },
        { id: 'labelled', name: 'Labelled', set: { size: 104, showLabel: true } }
      ],
      params: [
        { key: 'variant', label: 'Variant', type: 'select', value: 'labelled', options: null, group: 'variant' },
        { key: 'size', label: 'Track width', type: 'number', value: 104, min: 40, max: 400, step: 2, unit: 'px', group: 'content' },
        { key: 'on', label: 'Starts on', type: 'bool', value: false, group: 'content' },
        { key: 'animate', label: 'Animate the flip', type: 'bool', value: true, group: 'content' },
        { key: 'label', label: 'Label', type: 'text', value: 'Low Power Mode', group: 'content' },
        { key: 'showLabel', label: 'Show label', type: 'bool', value: true, group: 'content' },
        palette('systemGreen')
      ]
    },

    /* ---- Chart -------------------------------------------------------- */
    {
      id: 'chart', name: 'Chart', category: 'data',
      tags: ['chart', 'graph', 'bar', 'line', 'area', 'data', 'analytics'],
      blurb: 'Procedural bar / line / area chart that builds itself in.',
      defaultAnim: 'gentleSpring',
      variants: [
        { id: 'bars', name: 'Bars', set: { chartKind: 'bar' } },
        { id: 'line', name: 'Line', set: { chartKind: 'line' } },
        { id: 'area', name: 'Area', set: { chartKind: 'area' } }
      ],
      params: [
        { key: 'variant', label: 'Variant', type: 'select', value: 'bars', options: null, group: 'variant' },
        { key: 'chartKind', label: 'Kind', type: 'select', value: 'bar', group: 'hidden',
          options: [{ value: 'bar', label: 'Bar' }, { value: 'line', label: 'Line' }, { value: 'area', label: 'Area' }] },
        { key: 'width', label: 'Width', type: 'number', value: 560, min: 200, max: 1600, step: 10, unit: 'px', group: 'content' },
        { key: 'height', label: 'Height', type: 'number', value: 320, min: 120, max: 1000, step: 10, unit: 'px', group: 'content' },
        { key: 'bars', label: 'Points', type: 'number', value: 7, min: 3, max: 16, step: 1, group: 'content' },
        { key: 'seed', label: 'Shape (seed)', type: 'number', value: 4, min: 1, max: 40, step: 1, group: 'content' },
        palette('appleDark')
      ]
    },

    /* ---- Progress ----------------------------------------------------- */
    {
      id: 'progress', name: 'Progress', category: 'data',
      tags: ['progress', 'bar', 'ring', 'loader', 'meter'],
      blurb: 'Bar or ring that fills to a value as it animates in.',
      defaultAnim: 'gentleSpring',
      variants: [
        { id: 'bar',  name: 'Bar',  set: {} },
        { id: 'ring', name: 'Ring', set: {} }
      ],
      params: [
        { key: 'variant', label: 'Variant', type: 'select', value: 'bar', options: null, group: 'variant' },
        { key: 'value', label: 'Percent', type: 'number', value: 68, min: 0, max: 100, step: 1, unit: '%', group: 'content' },
        { key: 'width', label: 'Width', type: 'number', value: 480, min: 120, max: 1400, step: 10, unit: 'px', group: 'content' },
        palette('appleDark')
      ]
    },

    /* ---- Badge -------------------------------------------------------- */
    {
      id: 'badge', name: 'Badge', category: 'ui',
      tags: ['badge', 'tag', 'chip', 'label', 'pill', 'status'],
      blurb: 'Small status pill in solid, glass or semantic colours.',
      defaultAnim: 'snappy',
      variants: [
        { id: 'pill',    name: 'Pill',    set: {} },
        { id: 'square',  name: 'Square',  set: {} },
        { id: 'glass',   name: 'Glass',   set: {} },
        { id: 'success', name: 'Success', set: {} },
        { id: 'error',   name: 'Error',   set: {} },
        { id: 'warning', name: 'Warning', set: {} }
      ],
      params: [
        { key: 'variant', label: 'Variant', type: 'select', value: 'pill', options: null, group: 'variant' },
        { key: 'label', label: 'Text', type: 'text', value: 'New', group: 'content' },
        palette('systemBlue')
      ]
    }
  ];

  // Fill each component's `variant` param options from its own variants list.
  COMPONENTS.forEach(function (c) {
    if (!c.variants) return;
    var vp = c.params.filter(function (p) { return p.key === 'variant'; })[0];
    if (vp && !vp.options) vp.options = c.variants.map(function (v) { return { value: v.id, label: v.name }; });
  });

  /* ---------------------------------------------------------------------- */
  /* Helpers                                                                 */
  /* ---------------------------------------------------------------------- */

  function defaults(component) {
    var out = {};
    component.params.forEach(function (p) { out[p.key] = p.value; });
    return out;
  }

  function variantSet(component, variantId) {
    if (!component.variants) return {};
    for (var i = 0; i < component.variants.length; i++) {
      if (component.variants[i].id === variantId) return component.variants[i].set || {};
    }
    return {};
  }

  global.LIBRARY = {
    categories: CATEGORIES,
    palettes: TK.palettes,
    glassPresets: TK.glass,
    components: COMPONENTS,
    motion: M.presets,
    defaults: defaults,
    variantSet: variantSet,
    paletteById: TK.paletteById,
    glassById: TK.glassById,
    componentById: function (id) {
      for (var i = 0; i < COMPONENTS.length; i++) if (COMPONENTS[i].id === id) return COMPONENTS[i];
      return null;
    }
  };
})(window);
