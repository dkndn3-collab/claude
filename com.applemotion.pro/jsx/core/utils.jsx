/**
 * utils.jsx — the primitives every generator is built from.
 *
 * Property lookups use numeric indices rather than English names wherever
 * possible, so the panel keeps working on localised installs of After Effects.
 */

$.global.AMUI = $.global.AMUI || {};

AMUI.U = (function () {
  var U = {};

  /* ---------------------------------------------------------------- project */

  U.activeComp = function () {
    var item = app.project.activeItem;
    if (!item || !(item instanceof CompItem)) {
      throw new Error('Open a composition first, then try again.');
    }
    return item;
  };

  /** A comp only for the component itself, sized with room to grow. */
  U.makeComp = function (name, w, h, parentComp) {
    return app.project.items.addComp(
      U.uniqueName(name),
      Math.max(4, Math.round(w)),
      Math.max(4, Math.round(h)),
      1,
      Math.max(parentComp.duration, 5),
      parentComp.frameRate
    );
  };

  U.uniqueName = function (base) {
    var taken = {};
    for (var i = 1; i <= app.project.numItems; i++) taken[app.project.item(i).name] = true;
    if (!taken[base]) return base;
    var n = 2;
    while (taken[base + ' ' + n]) n++;
    return base + ' ' + n;
  };

  /* ------------------------------------------------------------------ color */

  /** "#0A84FF" -> [0.039, 0.518, 1] in AE's 0–1 space. */
  U.hex = function (hex) {
    hex = String(hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [
      parseInt(hex.substr(0, 2), 16) / 255,
      parseInt(hex.substr(2, 2), 16) / 255,
      parseInt(hex.substr(4, 2), 16) / 255
    ];
  };

  U.rgba = function (hex) {
    var c = U.hex(hex);
    return [c[0], c[1], c[2], 1];
  };

  /* --------------------------------------------------------------- controls */

  function addControl(layer, matchName, name) {
    var fx = layer.property('ADBE Effect Parade').addProperty(matchName);
    fx.name = name;
    return fx;
  }

  U.slider = function (layer, name, value) {
    var fx = addControl(layer, 'ADBE Slider Control', name);
    fx.property(1).setValue(value);
    return fx;
  };

  U.checkbox = function (layer, name, value) {
    var fx = addControl(layer, 'ADBE Checkbox Control', name);
    fx.property(1).setValue(value ? 1 : 0);
    return fx;
  };

  U.colorControl = function (layer, name, hex) {
    var fx = addControl(layer, 'ADBE Color Control', name);
    fx.property(1).setValue(U.rgba(hex));
    return fx;
  };

  /** Reference string used inside generated expressions. */
  U.CTRL = 'thisComp.layer("CONTROLLER")';
  U.ref = function (name) { return U.CTRL + '.effect("' + name + '")(1)'; };

  /**
   * Colour properties are 3 channels in some AE versions and 4 in others.
   * Trimming to `value.length` makes one expression valid in both.
   */
  U.colorExpr = function (controlName) {
    return 'c = ' + U.ref(controlName) + ';\n[c[0], c[1], c[2], 1].slice(0, value.length)';
  };

  /* ---------------------------------------------------------------- layers */

  U.controller = function (comp) {
    var nul = comp.layers.addNull();
    nul.name = 'CONTROLLER';
    nul.label = 9;            // a distinct colour so it reads at a glance
    nul.enabled = false;      // nothing to render, it only carries values
    nul.property('Transform').property('Position').setValue([comp.width / 2, comp.height / 2]);
    return nul;
  };

  /**
   * Rounded rectangle shape layer.
   * opts: name, sizeExpr, roundExpr, fill (hex), opacity, stroke (hex),
   *       strokeWidth, positionExpr
   */
  U.roundRect = function (comp, opts) {
    var layer = comp.layers.addShape();
    layer.name = opts.name;

    var group = layer.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
    group.name = 'Shape';
    var vectors = group.property('ADBE Vectors Group');

    var rect = vectors.addProperty('ADBE Vector Shape - Rect');
    if (opts.size) rect.property('ADBE Vector Rect Size').setValue(opts.size);
    if (opts.sizeExpr) rect.property('ADBE Vector Rect Size').expression = opts.sizeExpr;
    if (opts.round != null) rect.property('ADBE Vector Rect Roundness').setValue(opts.round);
    if (opts.roundExpr) rect.property('ADBE Vector Rect Roundness').expression = opts.roundExpr;

    if (opts.fill) {
      var fill = vectors.addProperty('ADBE Vector Graphic - Fill');
      fill.property('ADBE Vector Fill Color').setValue(U.rgba(opts.fill));
      if (opts.fillExpr) fill.property('ADBE Vector Fill Color').expression = opts.fillExpr;
      if (opts.fillOpacity != null) fill.property('ADBE Vector Fill Opacity').setValue(opts.fillOpacity);
      if (opts.fillOpacityExpr) fill.property('ADBE Vector Fill Opacity').expression = opts.fillOpacityExpr;
    }

    if (opts.stroke) {
      var stroke = vectors.addProperty('ADBE Vector Graphic - Stroke');
      stroke.property('ADBE Vector Stroke Color').setValue(U.rgba(opts.stroke));
      stroke.property('ADBE Vector Stroke Width').setValue(opts.strokeWidth || 1);
      if (opts.strokeOpacity != null) stroke.property('ADBE Vector Stroke Opacity').setValue(opts.strokeOpacity);
      if (opts.strokeOpacityExpr) stroke.property('ADBE Vector Stroke Opacity').expression = opts.strokeOpacityExpr;
    }

    var pos = layer.property('Transform').property('Position');
    if (opts.positionExpr) pos.expression = opts.positionExpr;
    else pos.setValue([comp.width / 2, comp.height / 2]);

    return layer;
  };

  /** Circle shape layer, sized by expression. */
  U.circle = function (comp, opts) {
    var layer = comp.layers.addShape();
    layer.name = opts.name;

    var group = layer.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
    group.name = 'Shape';
    var vectors = group.property('ADBE Vectors Group');

    var ell = vectors.addProperty('ADBE Vector Shape - Ellipse');
    if (opts.size) ell.property('ADBE Vector Ellipse Size').setValue(opts.size);
    if (opts.sizeExpr) ell.property('ADBE Vector Ellipse Size').expression = opts.sizeExpr;

    var fill = vectors.addProperty('ADBE Vector Graphic - Fill');
    fill.property('ADBE Vector Fill Color').setValue(U.rgba(opts.fill || '#FFFFFF'));
    if (opts.fillExpr) fill.property('ADBE Vector Fill Color').expression = opts.fillExpr;

    var pos = layer.property('Transform').property('Position');
    if (opts.positionExpr) pos.expression = opts.positionExpr;
    else pos.setValue([comp.width / 2, comp.height / 2]);

    return layer;
  };

  var FONT_STACK = ['SF Pro Display', 'SF Pro Text', 'SFProDisplay-Regular', 'Helvetica Neue', 'Segoe UI', 'Arial'];

  /**
   * Point text layer.
   * opts: name, text, size, color (hex), weight ('bold'|'semibold'|null),
   *       tracking, align ('left'|'right'|'center'), positionExpr, opacity
   */
  U.text = function (comp, opts) {
    var layer = comp.layers.addText(String(opts.text == null ? '' : opts.text));
    layer.name = opts.name;

    var prop = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var td = prop.value;
    td.text = String(opts.text == null ? '' : opts.text);
    td.fontSize = opts.size || 24;
    td.applyFill = true;
    td.applyStroke = false;
    td.fillColor = U.hex(opts.color || '#FFFFFF');

    var wanted = opts.font || pickFont(opts.weight);
    try { td.font = wanted; } catch (e) { /* host substitutes */ }
    try { td.tracking = opts.tracking || 0; } catch (e) {}
    try {
      td.justification = opts.align === 'right' ? ParagraphJustification.RIGHT_JUSTIFY
                       : opts.align === 'center' ? ParagraphJustification.CENTER_JUSTIFY
                       : ParagraphJustification.LEFT_JUSTIFY;
    } catch (e) {}
    prop.setValue(td);

    if (opts.positionExpr) {
      layer.property('Transform').property('Position').expression = opts.positionExpr;
    }
    if (opts.opacity != null) {
      layer.property('Transform').property('Opacity').setValue(opts.opacity);
    }
    return layer;
  };

  function pickFont(weight) {
    var suffix = weight === 'bold' ? '-Bold' : weight === 'semibold' ? '-Semibold' : '-Regular';
    // AE resolves by PostScript name; fall back through the stack if missing.
    return FONT_STACK[0].replace(/\s/g, '') + suffix;
  }

  /* --------------------------------------------------------------- effects */

  U.fastBlur = function (layer, amount, expr) {
    var fx = layer.property('ADBE Effect Parade').addProperty('ADBE Box Blur2');
    fx.property(1).setValue(amount);                 // Blur Radius
    if (expr) fx.property(1).expression = expr;
    try { fx.property(2).setValue(3); } catch (e) {} // Iterations — 3 reads as gaussian
    try { fx.property(4).setValue(true); } catch (e) {} // Repeat Edge Pixels
    return fx;
  };

  U.dropShadow = function (layer, opts) {
    opts = opts || {};
    var fx = layer.property('ADBE Effect Parade').addProperty('ADBE Drop Shadow');
    try { fx.property(1).setValue(U.hex(opts.color || '#000000')); } catch (e) {}
    fx.property(2).setValue(opts.opacity == null ? 90 : opts.opacity);   // 0–255
    fx.property(3).setValue(opts.direction == null ? 180 : opts.direction);
    fx.property(4).setValue(opts.distance == null ? 14 : opts.distance);
    fx.property(5).setValue(opts.softness == null ? 44 : opts.softness);
    if (opts.opacityExpr) fx.property(2).expression = opts.opacityExpr;
    if (opts.shadowOnly) { try { fx.property(6).setValue(true); } catch (e) {} }
    return fx;
  };

  /* ---------------------------------------------------------------- mattes */

  /** Uses the modern API where available, the pre-23.0 property otherwise. */
  U.alphaMatte = function (layer, matteLayer) {
    try {
      if (typeof layer.setTrackMatte === 'function') {
        layer.setTrackMatte(matteLayer, TrackMatteType.ALPHA);
        return;
      }
    } catch (e) {}
    try {
      layer.trackMatteType = TrackMatteType.ALPHA;
      matteLayer.enabled = false;
    } catch (e2) {}
  };

  /* ---------------------------------------------------------------- timing */

  U.setKeys = function (prop, times, values) {
    for (var i = 0; i < times.length; i++) prop.setValueAtTime(times[i], values[i]);
  };

  /** Influence in 0.1–100. Apple's curve is a short exit and a long settle. */
  U.ease = function (prop, keyIndex, inInfluence, outInfluence) {
    var dim = 1;
    try { dim = prop.value instanceof Array ? prop.value.length : 1; } catch (e) {}
    function build(inf) {
      var arr = [];
      for (var i = 0; i < dim; i++) arr.push(new KeyframeEase(0, Math.max(0.1, Math.min(100, inf))));
      return arr;
    }
    try {
      prop.setTemporalEaseAtKey(keyIndex, build(inInfluence), build(outInfluence));
    } catch (e) {
      try {
        prop.setTemporalEaseAtKey(keyIndex,
          [new KeyframeEase(0, inInfluence)], [new KeyframeEase(0, outInfluence)]);
      } catch (e2) {}
    }
  };

  /** The house curve: leaves quickly, arrives slowly. */
  U.appleEase = function (prop) {
    if (prop.numKeys < 2) return;
    U.ease(prop, 1, 20, 16);
    U.ease(prop, prop.numKeys, 84, 20);
  };

  return U;
})();
