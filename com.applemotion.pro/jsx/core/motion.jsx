/**
 * motion.jsx — one place that owns timing (mirrors js/data/motion.js).
 *
 * Every preset is the same ten parameters the panel exposes. Eased presets ride
 * a bezier; spring presets write a short keyframe pair and hand the settle to an
 * expression whose coefficients come from real spring physics — so the bounce
 * stays editable after the fact, and it matches the SVG preview exactly.
 */

$.global.AMUI = $.global.AMUI || {};

AMUI.Motion = (function () {
  var U = AMUI.U;

  /* ---- presets (numbers mirror js/data/motion.js) ----------------------- */
  var PRESETS = {
    appleEase:    { spring: false, easing: [0.32, 0.72, 0, 1],    duration: 0.60, delay: 0, stagger: 0.06, springStrength: 300, damping: 0.62, mass: 1.0, overshoot: 0,  direction: 'up',    amplitude: 60 },
    softEase:     { spring: false, easing: [0.25, 0.46, 0.45, 0.94], duration: 0.90, delay: 0, stagger: 0.08, springStrength: 220, damping: 0.7,  mass: 1.0, overshoot: 0,  direction: 'up',    amplitude: 48 },
    smoothEase:   { spring: false, easing: [0.45, 0, 0.55, 1],    duration: 0.60, delay: 0, stagger: 0.06, springStrength: 260, damping: 0.7,  mass: 1.0, overshoot: 0,  direction: 'scale', amplitude: 40 },
    fastOut:      { spring: false, easing: [0.16, 1, 0.3, 1],     duration: 0.40, delay: 0, stagger: 0.05, springStrength: 420, damping: 0.8,  mass: 1.0, overshoot: 0,  direction: 'up',    amplitude: 50 },
    softIn:       { spring: false, easing: [0.4, 0, 0.7, 0.25],   duration: 0.60, delay: 0, stagger: 0.06, springStrength: 200, damping: 0.75, mass: 1.0, overshoot: 0,  direction: 'fade',  amplitude: 0 },
    spring:       { spring: true,  easing: [0.34, 1.3, 0.5, 1],   duration: 0.90, delay: 0, stagger: 0.07, springStrength: 300, damping: 0.30, mass: 1.0, overshoot: 14, direction: 'up',    amplitude: 60 },
    gentleSpring: { spring: true,  easing: [0.3, 1.1, 0.5, 1],    duration: 0.80, delay: 0, stagger: 0.07, springStrength: 200, damping: 0.55, mass: 1.0, overshoot: 6,  direction: 'up',    amplitude: 44 },
    strongSpring: { spring: true,  easing: [0.3, 1.5, 0.4, 1],    duration: 0.80, delay: 0, stagger: 0.06, springStrength: 520, damping: 0.34, mass: 1.0, overshoot: 16, direction: 'scale', amplitude: 50 },
    snappy:       { spring: true,  easing: [0.2, 1.2, 0.3, 1],    duration: 0.50, delay: 0, stagger: 0.05, springStrength: 700, damping: 0.62, mass: 1.0, overshoot: 5,  direction: 'scale', amplitude: 40 },
    elastic:      { spring: true,  easing: [0.3, 1.8, 0.5, 1],    duration: 1.20, delay: 0, stagger: 0.08, springStrength: 240, damping: 0.14, mass: 1.1, overshoot: 26, direction: 'up',    amplitude: 70 }
  };

  function resolve(id, o) {
    var base = PRESETS[id] || PRESETS.appleEase;
    var out = {};
    for (var k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
    if (o) for (var j in o) if (o.hasOwnProperty(j) && o[j] != null && o[j] !== '') out[j] = o[j];
    out.id = id;
    return out;
  }

  /* ---- physics ---------------------------------------------------------- */
  function coeffs(p) {
    var mass = Math.max(0.05, p.mass || 1);
    var omega = Math.sqrt(Math.max(1, p.springStrength) / mass);
    var zeta = Math.min(0.999, Math.max(0.02, p.damping));
    return { omega: omega, freq: omega / (2 * Math.PI), decay: Math.max(0.5, zeta * omega), zeta: zeta };
  }

  /** Velocity-driven settle expression, coefficients baked as real numbers. */
  function springExpression(p) {
    var c = coeffs(p);
    var amp = Math.max(0.02, (p.overshoot || 8) / 100);
    return [
      '// Apple Motion UI — spring settle (strength ' + p.springStrength + ', damping ' + p.damping + ', mass ' + p.mass + ')',
      'amp = ' + amp.toFixed(4) + ';',
      'freq = ' + c.freq.toFixed(4) + ';',
      'decay = ' + c.decay.toFixed(4) + ';',
      'n = 0;',
      'if (numKeys > 0) {',
      '  n = nearestKey(time).index;',
      '  if (key(n).time > time) n--;',
      '}',
      'if (n > 0 && n === numKeys) {',
      '  t = time - key(n).time;',
      '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
      '  value + v * (amp * Math.sin(freq * t * Math.PI * 2) / Math.exp(decay * t));',
      '} else {',
      '  value;',
      '}'
    ].join('\n');
  }

  function transform(layer) { return layer.property('ADBE Transform Group'); }

  function startTimeFor(layer, comp) {
    return Math.max(layer.inPoint, Math.min(comp.time, layer.outPoint - 0.2));
  }

  function scaleBy(value, factor) {
    var out = [];
    for (var i = 0; i < value.length; i++) out.push(value[i] * factor);
    return out;
  }

  function entryOffset(direction, a) {
    a = a == null ? 60 : a;
    switch (direction) {
      case 'up':    return { tx: 0, ty: a,  scale: 1, translate: true };
      case 'down':  return { tx: 0, ty: -a, scale: 1, translate: true };
      case 'left':  return { tx: a, ty: 0,  scale: 1, translate: true };
      case 'right': return { tx: -a,ty: 0,  scale: 1, translate: true };
      case 'scale': return { tx: 0, ty: 0,  scale: Math.max(0.3, 1 - a / 200), translate: false };
      default:      return { tx: 0, ty: 0,  scale: 1, translate: false };
    }
  }

  /* ---- apply an entry to one layer -------------------------------------- */

  function applyToLayer(layer, comp, p, index) {
    var t0 = startTimeFor(layer, comp) + (p.delay || 0) + (index || 0) * (p.stagger || 0);
    var tr = transform(layer);
    var pos = tr.property('ADBE Position');
    var scale = tr.property('ADBE Scale');
    var opacity = tr.property('ADBE Opacity');
    var dur = Math.max(0.1, p.duration);
    var geo = entryOffset(p.direction, p.amplitude);

    // Opacity fade — every entry fades in over the first 60% of its duration.
    if (opacity.numKeys === 0) {
      U.setKeys(opacity, [t0, t0 + dur * 0.6], [0, 100]);
      U.easeBezier(opacity, p.easing);
    }

    if (p.direction === 'scale') {
      var s = scale.value;
      U.setKeys(scale, [t0, t0 + dur], [scaleBy(s, geo.scale), s]);
      if (p.spring) { U.ease(scale, 1, 20, 80); U.ease(scale, 2, 10, 20); scale.expression = springExpression(p); }
      else U.easeBezier(scale, p.easing);

    } else if (geo.translate) {
      var v = pos.value;
      var from = [v[0] + geo.tx, v[1] + geo.ty].concat(v.length > 2 ? [v[2]] : []);
      U.setKeys(pos, [t0, t0 + dur], [from, v]);
      if (p.spring) { U.ease(pos, 1, 20, 80); U.ease(pos, 2, 10, 20); pos.expression = springExpression(p); }
      else U.easeBezier(pos, p.easing);
    }
    // direction 'fade' is opacity only — already handled above.
  }

  /* ---- public: animate the layer a generator just built ----------------- */
  function animateLayer(layer, comp, anim) {
    if (!anim || !anim.preset || anim.preset === 'none') return;
    applyToLayer(layer, comp, resolve(anim.preset, anim), 0);
  }

  /* ---- public: apply a preset to the current selection ------------------ */
  function apply(presetId, overrides) {
    var comp = U.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select at least one layer to animate.');

    var p = resolve(presetId, overrides);
    var animated = 0;
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].locked) continue;
      applyToLayer(layers[i], comp, p, animated);
      animated++;
    }
    return animated + (animated === 1 ? ' layer' : ' layers') + ' animated · ' + presetId;
  }

  /** Offsets each selected layer's start in selection order. */
  function stagger(frames) {
    var comp = U.activeComp();
    var layers = comp.selectedLayers;
    if (layers.length < 2) throw new Error('Select two or more layers to stagger.');
    var step = (frames || 2) * comp.frameDuration;
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].locked) continue;
      layers[i].startTime = layers[i].startTime + i * step;
    }
    return layers.length + ' layers staggered by ' + (frames || 2) + ' frames';
  }

  return {
    apply: apply,
    animateLayer: animateLayer,
    stagger: stagger,
    resolve: resolve,
    springExpression: springExpression,
    presets: PRESETS
  };
})();
