/**
 * motion.js — the animation system, shared by the panel and (mirrored in
 * jsx/core/motion.jsx) by After Effects.
 *
 * Every preset is described by the same ten parameters the spec asks for:
 *
 *   duration        total time of the entrance (seconds)
 *   delay           wait before it starts (seconds)
 *   stagger         per-layer offset when several layers animate (seconds)
 *   easing          cubic-bezier curve for the non-spring presets
 *   springStrength  spring stiffness k  (higher = faster, snappier)
 *   damping         damping ratio ζ 0–1 (higher = fewer wobbles)
 *   mass            spring mass m       (higher = heavier, slower)
 *   overshoot       how far past the target it travels, %
 *   direction       up | down | left | right | scale | fade
 *   amplitude       travel distance in px (or scale intensity)
 *
 * The spring presets turn strength/damping/mass into the coefficients of a real
 * damped oscillator, so the same physics drives both the SVG preview and the
 * expression written onto the layer in After Effects — they can't drift apart.
 */
(function (global) {
  'use strict';

  /* ---- presets ---------------------------------------------------------- *
   * The ten named presets. `spring:false` presets ride a cubic-bezier ease;
   * `spring:true` presets settle on the damped-oscillator physics below.
   * Every preset still carries the full parameter set, so switching a card
   * from Apple Ease to Spring is just a change of numbers, never a code path. */

  var PRESETS = [
    { id: 'appleEase', name: 'Apple Ease', category: 'Ease', spring: false,
      easing: [0.32, 0.72, 0, 1], duration: 0.60, delay: 0, stagger: 0.06,
      springStrength: 300, damping: 0.62, mass: 1.0, overshoot: 0, direction: 'up', amplitude: 60,
      blurb: 'The house curve. Leaves quickly, arrives slowly.' },

    { id: 'softEase', name: 'Soft Ease', category: 'Ease', spring: false,
      easing: [0.25, 0.46, 0.45, 0.94], duration: 0.90, delay: 0, stagger: 0.08,
      springStrength: 220, damping: 0.7, mass: 1.0, overshoot: 0, direction: 'up', amplitude: 48,
      blurb: 'Gentle and unhurried. Nothing snaps.' },

    { id: 'smoothEase', name: 'Smooth Ease', category: 'Ease', spring: false,
      easing: [0.45, 0, 0.55, 1], duration: 0.60, delay: 0, stagger: 0.06,
      springStrength: 260, damping: 0.7, mass: 1.0, overshoot: 0, direction: 'scale', amplitude: 40,
      blurb: 'Even ease in and out. Balanced.' },

    { id: 'fastOut', name: 'Fast Out', category: 'Ease', spring: false,
      easing: [0.16, 1, 0.3, 1], duration: 0.40, delay: 0, stagger: 0.05,
      springStrength: 420, damping: 0.8, mass: 1.0, overshoot: 0, direction: 'up', amplitude: 50,
      blurb: 'Snaps out of the gate, decelerates hard.' },

    { id: 'softIn', name: 'Soft In', category: 'Ease', spring: false,
      easing: [0.4, 0, 0.7, 0.25], duration: 0.60, delay: 0, stagger: 0.06,
      springStrength: 200, damping: 0.75, mass: 1.0, overshoot: 0, direction: 'fade', amplitude: 0,
      blurb: 'Eases in gently. Good for fades.' },

    { id: 'spring', name: 'Spring', category: 'Spring', spring: true,
      easing: [0.34, 1.3, 0.5, 1], duration: 0.90, delay: 0, stagger: 0.07,
      springStrength: 300, damping: 0.30, mass: 1.0, overshoot: 14, direction: 'up', amplitude: 60,
      blurb: 'Springs to rest with a visible bounce.' },

    { id: 'gentleSpring', name: 'Gentle Spring', category: 'Spring', spring: true,
      easing: [0.3, 1.1, 0.5, 1], duration: 0.80, delay: 0, stagger: 0.07,
      springStrength: 200, damping: 0.55, mass: 1.0, overshoot: 6, direction: 'up', amplitude: 44,
      blurb: 'One soft overshoot, no wobble.' },

    { id: 'strongSpring', name: 'Strong Spring', category: 'Spring', spring: true,
      easing: [0.3, 1.5, 0.4, 1], duration: 0.80, delay: 0, stagger: 0.06,
      springStrength: 520, damping: 0.34, mass: 1.0, overshoot: 16, direction: 'scale', amplitude: 50,
      blurb: 'High-tension spring with real snap.' },

    { id: 'snappy', name: 'Snappy', category: 'Spring', spring: true,
      easing: [0.2, 1.2, 0.3, 1], duration: 0.50, delay: 0, stagger: 0.05,
      springStrength: 700, damping: 0.62, mass: 1.0, overshoot: 5, direction: 'scale', amplitude: 40,
      blurb: 'Very quick, barely a bounce. UI-grade.' },

    { id: 'elastic', name: 'Elastic', category: 'Spring', spring: true,
      easing: [0.3, 1.8, 0.5, 1], duration: 1.20, delay: 0, stagger: 0.08,
      springStrength: 240, damping: 0.14, mass: 1.1, overshoot: 26, direction: 'up', amplitude: 70,
      blurb: 'Long, loose, rubbery decay.' }
  ];

  /* ---- physics ---------------------------------------------------------- */

  /**
   * Turn the friendly spring parameters into the coefficients of a damped
   * oscillator. Returns { omega, freq, decay, zeta } — the identical numbers
   * are computed on the AE side, so preview and output share one motion.
   */
  function coeffs(p) {
    var mass = Math.max(0.05, p.mass || 1);
    var omega = Math.sqrt(Math.max(1, p.springStrength) / mass); // natural angular freq
    var zeta = Math.min(0.999, Math.max(0.02, p.damping));       // damping ratio
    var freq = omega / (2 * Math.PI);                            // Hz for the sine term
    var decay = Math.max(0.5, zeta * omega);                     // exponential rate
    return { omega: omega, freq: freq, decay: decay, zeta: zeta };
  }

  /**
   * Underdamped step response, normalised so f(0)=0 and f(∞)→1. Used to sample
   * the spring for the SVG preview; AE uses the same coefficients in expression
   * form. `overshootScale` lets the authored overshoot% nudge the peak.
   */
  function springValue(tau, c, overshootScale) {
    if (tau <= 0) return 0;
    var wd = c.omega * Math.sqrt(Math.max(0.0001, 1 - c.zeta * c.zeta)); // damped freq
    var env = Math.exp(-c.decay * tau);
    var osc = Math.cos(wd * tau) + (c.decay / wd) * Math.sin(wd * tau);
    var v = 1 - env * osc;
    // Bias the overshoot toward the authored value without breaking the settle.
    return 1 + (v - 1) * (overshootScale == null ? 1 : overshootScale);
  }

  /**
   * Sample a spring from `from` to `to` across `duration`, returning WAAPI-style
   * keyframes [{ offset, value }]. steps controls smoothness.
   */
  function springSamples(from, to, preset, steps) {
    steps = steps || 40;
    var c = coeffs(preset);
    // Scale so a bigger authored overshoot reads as a bigger peak in the preview.
    var oScale = 1 + (preset.overshoot || 0) / 40;
    var out = [];
    for (var i = 0; i <= steps; i++) {
      var off = i / steps;
      var tau = off * preset.duration;
      var f = i === steps ? 1 : springValue(tau, c, oScale);
      out.push({ offset: off, value: from + (to - from) * f });
    }
    return out;
  }

  function cubicBezierCss(b) {
    return 'cubic-bezier(' + b[0] + ',' + b[1] + ',' + b[2] + ',' + b[3] + ')';
  }

  /* ---- entry geometry --------------------------------------------------- */

  /** The start offset a direction implies, in preview units. */
  function entryOffset(direction, amplitude) {
    var a = amplitude == null ? 60 : amplitude;
    switch (direction) {
      case 'up':    return { tx: 0,  ty: a,  scale: 1, fade: true };
      case 'down':  return { tx: 0,  ty: -a, scale: 1, fade: true };
      case 'left':  return { tx: a,  ty: 0,  scale: 1, fade: true };
      case 'right': return { tx: -a, ty: 0,  scale: 1, fade: true };
      case 'scale': return { tx: 0,  ty: 0,  scale: Math.max(0.3, 1 - a / 200), fade: true };
      case 'fade':
      default:      return { tx: 0,  ty: 0,  scale: 1, fade: true };
    }
  }

  function byId(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }

  /** Merge a preset with per-component animation overrides. */
  function resolve(id, overrides) {
    var base = byId(id);
    var out = {};
    for (var k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
    if (overrides) for (var o in overrides) {
      if (overrides.hasOwnProperty(o) && overrides[o] != null && overrides[o] !== '') out[o] = overrides[o];
    }
    return out;
  }

  // The parameter descriptors the builder exposes as animation controls.
  var PARAMS = [
    { key: 'duration',       label: 'Duration',  type: 'number', min: 0.1, max: 3,    step: 0.05, unit: 's' },
    { key: 'delay',          label: 'Delay',     type: 'number', min: 0,   max: 2,    step: 0.05, unit: 's' },
    { key: 'stagger',        label: 'Stagger',   type: 'number', min: 0,   max: 0.5,  step: 0.01, unit: 's' },
    { key: 'direction',      label: 'Direction', type: 'select', options: [
        { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' },
        { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
        { value: 'scale', label: 'Scale' }, { value: 'fade', label: 'Fade' } ] },
    { key: 'amplitude',      label: 'Amplitude', type: 'number', min: 0,   max: 200,  step: 2,  unit: 'px' },
    { key: 'springStrength', label: 'Strength',  type: 'number', min: 40,  max: 900,  step: 10, spring: true },
    { key: 'damping',        label: 'Damping',   type: 'number', min: 0.05,max: 1,    step: 0.01, spring: true },
    { key: 'mass',           label: 'Mass',      type: 'number', min: 0.2, max: 4,    step: 0.1, spring: true },
    { key: 'overshoot',      label: 'Overshoot', type: 'number', min: 0,   max: 60,   step: 1,  unit: '%', spring: true }
  ];

  global.MOTION = {
    presets: PRESETS,
    params: PARAMS,
    byId: byId,
    resolve: resolve,
    coeffs: coeffs,
    springValue: springValue,
    springSamples: springSamples,
    entryOffset: entryOffset,
    cubicBezierCss: cubicBezierCss,
    defaults: function (id) {
      var p = byId(id), out = {};
      PARAMS.forEach(function (d) { out[d.key] = p[d.key]; });
      out.preset = id;
      return out;
    }
  };
})(window);
