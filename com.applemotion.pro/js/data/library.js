/**
 * library.js
 * Every component, parameter and motion preset in the panel is defined here.
 * The browser UI and the parameter form are both generated from this file —
 * adding a component means adding an entry here plus a generator in jsx/components/.
 */
(function (global) {
  'use strict';

  var PALETTES = [
    { id: 'appleDark',   name: 'Apple Dark',   accent: '#0A84FF', surface: '#1C1C1E', text: '#FFFFFF' },
    { id: 'appleLight',  name: 'Apple Light',  accent: '#007AFF', surface: '#F2F2F7', text: '#1C1C1E' },
    { id: 'systemBlue',  name: 'System Blue',  accent: '#0A84FF', surface: '#1C1C1E', text: '#FFFFFF' },
    { id: 'systemGreen', name: 'System Green', accent: '#30D158', surface: '#1C1C1E', text: '#FFFFFF' },
    { id: 'systemRed',   name: 'System Red',   accent: '#FF453A', surface: '#1C1C1E', text: '#FFFFFF' },
    { id: 'systemOrange',name: 'System Orange',accent: '#FF9F0A', surface: '#1C1C1E', text: '#FFFFFF' },
    { id: 'glassNeutral',name: 'Glass Neutral',accent: '#8E8E93', surface: '#2C2C2E', text: '#FFFFFF' }
  ];

  var GLASS_PRESETS = [
    { id: 'clear',   name: 'Clear Glass',   blur: 14, tintOpacity: 8,  border: 40, highlight: 55 },
    { id: 'frosted', name: 'Frosted Glass', blur: 34, tintOpacity: 16, border: 34, highlight: 45 },
    { id: 'dark',    name: 'Dark Glass',    blur: 26, tintOpacity: 42, border: 22, highlight: 28 },
    { id: 'white',   name: 'White Glass',   blur: 26, tintOpacity: 30, border: 60, highlight: 70 },
    { id: 'soft',    name: 'Soft Glass',    blur: 44, tintOpacity: 12, border: 26, highlight: 38 },
    { id: 'liquid',  name: 'Liquid Glass',  blur: 20, tintOpacity: 10, border: 70, highlight: 85 }
  ];

  /* ---------------------------------------------------------------------- */
  /* Components                                                              */
  /* ---------------------------------------------------------------------- */

  var COMPONENTS = [
    {
      id: 'card',
      name: 'Glass card',
      category: 'UI',
      tags: ['card', 'glass', 'surface', 'kpi', 'stat', 'dashboard'],
      blurb: 'Rounded surface with icon, title, subtitle and value. Responsive to width and height.',
      params: [
        { key: 'width',    label: 'Width',    type: 'number', value: 420, min: 120, max: 1600, step: 10, unit: 'px' },
        { key: 'height',   label: 'Height',   type: 'number', value: 220, min: 80,  max: 1200, step: 10, unit: 'px' },
        { key: 'radius',   label: 'Radius',   type: 'number', value: 28,  min: 0,   max: 200,  step: 1,  unit: 'px' },
        { key: 'padding',  label: 'Padding',  type: 'number', value: 28,  min: 0,   max: 160,  step: 1,  unit: 'px' },
        { key: 'glass',    label: 'Glass',    type: 'bool',   value: true },
        { key: 'glassPreset', label: 'Glass style', type: 'select', value: 'frosted', options: GLASS_PRESETS.map(mapOpt), showIf: 'glass' },
        { key: 'blur',     label: 'Blur',     type: 'number', value: 34,  min: 0,   max: 120,  step: 1, showIf: 'glass' },
        { key: 'shadow',   label: 'Shadow',   type: 'bool',   value: true },
        { key: 'icon',     label: 'Icon',     type: 'bool',   value: true },
        { key: 'title',    label: 'Title',    type: 'text',   value: 'Monthly revenue' },
        { key: 'subtitle', label: 'Subtitle', type: 'text',   value: 'Last 30 days' },
        { key: 'value',    label: 'Value',    type: 'text',   value: '$48,920' },
        { key: 'palette',  label: 'Palette',  type: 'select', value: 'appleDark', options: PALETTES.map(mapOpt) }
      ]
    },
    {
      id: 'notification',
      name: 'Notification banner',
      category: 'iOS',
      tags: ['notification', 'banner', 'alert', 'ios', 'push', 'toast'],
      blurb: 'iOS-style push banner with app icon, app name, timestamp and message.',
      params: [
        { key: 'width',    label: 'Width',    type: 'number', value: 700, min: 240, max: 1600, step: 10, unit: 'px' },
        { key: 'radius',   label: 'Radius',   type: 'number', value: 34,  min: 0,   max: 120,  step: 1,  unit: 'px' },
        { key: 'appName',  label: 'App name', type: 'text',   value: 'MESSAGES' },
        { key: 'title',    label: 'Title',    type: 'text',   value: 'Sarah Chen' },
        { key: 'message',  label: 'Message',  type: 'text',   value: 'Sending over the final cut now' },
        { key: 'time',     label: 'Time',     type: 'text',   value: 'now' },
        { key: 'glass',    label: 'Glass',    type: 'bool',   value: true },
        { key: 'glassPreset', label: 'Glass style', type: 'select', value: 'dark', options: GLASS_PRESETS.map(mapOpt), showIf: 'glass' },
        { key: 'blur',     label: 'Blur',     type: 'number', value: 26,  min: 0,   max: 120, step: 1, showIf: 'glass' },
        { key: 'shadow',   label: 'Shadow',   type: 'bool',   value: true },
        { key: 'palette',  label: 'Palette',  type: 'select', value: 'appleDark', options: PALETTES.map(mapOpt) }
      ]
    },
    {
      id: 'toggle',
      name: 'Toggle switch',
      category: 'iOS',
      tags: ['toggle', 'switch', 'settings', 'control', 'ios'],
      blurb: 'Settings-row switch. The knob and track colour are driven by one On/Off control.',
      params: [
        { key: 'size',     label: 'Track width', type: 'number', value: 104, min: 40, max: 400, step: 2, unit: 'px' },
        { key: 'on',       label: 'Starts on',   type: 'bool',   value: false },
        { key: 'animate',  label: 'Animate the flip', type: 'bool', value: true },
        { key: 'label',    label: 'Label',       type: 'text',   value: 'Low Power Mode' },
        { key: 'showLabel',label: 'Show label',  type: 'bool',   value: true },
        { key: 'palette',  label: 'Palette',     type: 'select', value: 'systemGreen', options: PALETTES.map(mapOpt) }
      ]
    }
  ];

  /* ---------------------------------------------------------------------- */
  /* Motion presets — applied to whatever layers are selected                */
  /* ---------------------------------------------------------------------- */

  var MOTION = [
    { id: 'appleEase',   name: 'Apple ease',   category: 'Ease',   duration: 0.6,  blurb: 'The house curve. Slow out, fast settle.' },
    { id: 'spring',      name: 'Spring',       category: 'Spring', duration: 0.9,  blurb: 'Springs to rest with visible bounce.' },
    { id: 'smoothSpring',name: 'Smooth spring',category: 'Spring', duration: 0.8,  blurb: 'One soft overshoot, no wobble.' },
    { id: 'overshoot',   name: 'Overshoot',    category: 'Spring', duration: 0.7,  blurb: 'Passes the target once, comes back.' },
    { id: 'bounce',      name: 'Bounce',       category: 'Spring', duration: 1.0,  blurb: 'Heavier, gravity-flavoured settle.' },
    { id: 'elastic',     name: 'Elastic',      category: 'Spring', duration: 1.2,  blurb: 'Long decay, loose and rubbery.' },
    { id: 'fadeUp',      name: 'Fade up',      category: 'Entry',  duration: 0.7,  blurb: 'Rises and fades in from below.' },
    { id: 'scaleIn',     name: 'Scale in',     category: 'Entry',  duration: 0.6,  blurb: 'Grows from 88% with an Apple ease.' },
    { id: 'blurIn',      name: 'Blur in',      category: 'Entry',  duration: 0.8,  blurb: 'Focus pull plus fade.' },
    { id: 'slideIn',     name: 'Slide in',     category: 'Entry',  duration: 0.7,  blurb: 'Enters from off-frame left.' }
  ];

  var QUICK_ACTIONS = [
    { id: 'addGlass',  name: 'Add glass',  blurb: 'Frosts everything behind the selected layer.' },
    { id: 'addShadow', name: 'Add shadow', blurb: 'Apple-weight drop shadow.' },
    { id: 'center',    name: 'Center',     blurb: 'Centres selection in the comp.' },
    { id: 'stagger',   name: 'Stagger',    blurb: 'Offsets selected layers by 2 frames each.' },
    { id: 'precompose',name: 'Precompose', blurb: 'Wraps selection in a named precomp.' }
  ];

  function mapOpt(p) { return { value: p.id, label: p.name }; }

  function defaults(component) {
    var out = {};
    component.params.forEach(function (p) { out[p.key] = p.value; });
    return out;
  }

  global.LIBRARY = {
    palettes: PALETTES,
    glassPresets: GLASS_PRESETS,
    components: COMPONENTS,
    motion: MOTION,
    quickActions: QUICK_ACTIONS,
    defaults: defaults,
    paletteById: function (id) {
      for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i].id === id) return PALETTES[i];
      return PALETTES[0];
    },
    glassById: function (id) {
      for (var i = 0; i < GLASS_PRESETS.length; i++) if (GLASS_PRESETS[i].id === id) return GLASS_PRESETS[i];
      return GLASS_PRESETS[1];
    },
    componentById: function (id) {
      for (var i = 0; i < COMPONENTS.length; i++) if (COMPONENTS[i].id === id) return COMPONENTS[i];
      return null;
    }
  };
})(window);
