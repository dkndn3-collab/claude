/**
 * motion.jsx — one place that owns timing.
 *
 * Entry presets write keyframes and ease them. Spring presets write a short
 * keyframe pair and then hand the settle to an expression, so the bounce stays
 * editable after the fact instead of being baked into fifty keyframes.
 */

$.global.AMUI = $.global.AMUI || {};

AMUI.Motion = (function () {
  var U = AMUI.U;

  var SPRINGS = {
    spring:       { amp: 0.12, freq: 2.8, decay: 5.5, abs: false, dur: 0.9 },
    smoothSpring: { amp: 0.06, freq: 2.0, decay: 7.0, abs: false, dur: 0.8 },
    overshoot:    { amp: 0.10, freq: 1.2, decay: 6.5, abs: false, dur: 0.7 },
    bounce:       { amp: 0.18, freq: 2.2, decay: 4.0, abs: true,  dur: 1.0 },
    elastic:      { amp: 0.22, freq: 3.4, decay: 2.6, abs: false, dur: 1.2 }
  };

  /** Overshoot-after-last-keyframe expression, written with real numbers in it. */
  function springExpression(s) {
    var sine = s.abs ? 'Math.abs(Math.sin(freq * t * Math.PI * 2))' : 'Math.sin(freq * t * Math.PI * 2)';
    return [
      '// Apple Motion UI — ' + (s.abs ? 'bounce' : 'spring') + ' settle',
      'amp = ' + s.amp + ';',
      'freq = ' + s.freq + ';',
      'decay = ' + s.decay + ';',
      'n = 0;',
      'if (numKeys > 0) {',
      '  n = nearestKey(time).index;',
      '  if (key(n).time > time) n--;',
      '}',
      'if (n > 0) {',
      '  t = time - key(n).time;',
      '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
      '  value + v * (amp * ' + sine + ' / Math.exp(decay * t));',
      '} else {',
      '  value;',
      '}'
    ].join('\n');
  }

  function transform(layer) {
    return layer.property('ADBE Transform Group');
  }

  function startTimeFor(layer, comp) {
    // Start where the layer starts, unless the playhead is already past it.
    return Math.max(layer.inPoint, Math.min(comp.time, layer.outPoint - 0.2));
  }

  /* ------------------------------------------------------------- presets */

  function applyEntry(layer, comp, preset) {
    var t0 = startTimeFor(layer, comp);
    var tr = transform(layer);
    var pos = tr.property('ADBE Position');
    var scale = tr.property('ADBE Scale');
    var opacity = tr.property('ADBE Opacity');

    if (preset === 'fadeUp') {
      var p = pos.value;
      U.setKeys(pos, [t0, t0 + 0.7], [[p[0], p[1] + 60].concat(p.length > 2 ? [p[2]] : []), p]);
      U.appleEase(pos);
      U.setKeys(opacity, [t0, t0 + 0.45], [0, 100]);
      U.appleEase(opacity);

    } else if (preset === 'scaleIn') {
      var s = scale.value;
      U.setKeys(scale, [t0, t0 + 0.6], [scaleBy(s, 0.88), s]);
      U.appleEase(scale);
      U.setKeys(opacity, [t0, t0 + 0.35], [0, 100]);
      U.appleEase(opacity);

    } else if (preset === 'blurIn') {
      var fx = layer.property('ADBE Effect Parade').addProperty('ADBE Gaussian Blur 2');
      fx.name = 'Blur In';
      U.setKeys(fx.property(1), [t0, t0 + 0.8], [40, 0]);
      U.appleEase(fx.property(1));
      U.setKeys(opacity, [t0, t0 + 0.5], [0, 100]);
      U.appleEase(opacity);

    } else if (preset === 'slideIn') {
      var q = pos.value;
      var off = [q[0] - comp.width * 0.3, q[1]].concat(q.length > 2 ? [q[2]] : []);
      U.setKeys(pos, [t0, t0 + 0.7], [off, q]);
      U.appleEase(pos);
      U.setKeys(opacity, [t0, t0 + 0.3], [0, 100]);
      U.appleEase(opacity);

    } else { // appleEase — re-ease whatever keyframes the layer already has
      var touched = 0;
      var props = [pos, scale, opacity, tr.property('ADBE Rotate Z')];
      for (var i = 0; i < props.length; i++) {
        if (props[i] && props[i].numKeys > 1) { U.appleEase(props[i]); touched++; }
      }
      if (!touched) {
        // Nothing to re-time, so give it the house entrance instead.
        U.setKeys(opacity, [t0, t0 + 0.6], [0, 100]);
        U.appleEase(opacity);
      }
    }
  }

  function applySpring(layer, comp, preset) {
    var s = SPRINGS[preset];
    var t0 = startTimeFor(layer, comp);
    var tr = transform(layer);
    var scale = tr.property('ADBE Scale');
    var opacity = tr.property('ADBE Opacity');

    var base = scale.value;
    U.setKeys(scale, [t0, t0 + 0.28], [scaleBy(base, 0.72), base]);
    U.ease(scale, 1, 20, 80);
    U.ease(scale, 2, 10, 20);
    scale.expression = springExpression(s);

    if (opacity.numKeys === 0 && opacity.value === 100) {
      U.setKeys(opacity, [t0, t0 + 0.2], [0, 100]);
      U.appleEase(opacity);
    }
  }

  function scaleBy(value, factor) {
    var out = [];
    for (var i = 0; i < value.length; i++) out.push(value[i] * factor);
    return out;
  }

  /* ---------------------------------------------------------------- api */

  function apply(preset) {
    var comp = U.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select at least one layer to animate.');

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer.locked) continue;
      if (SPRINGS[preset]) applySpring(layer, comp, preset);
      else applyEntry(layer, comp, preset);
    }
    return layers.length + (layers.length === 1 ? ' layer' : ' layers') + ' animated';
  }

  /** Offsets each selected layer in selection order. */
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
    stagger: stagger,
    springExpression: springExpression,
    springs: SPRINGS
  };
})();
