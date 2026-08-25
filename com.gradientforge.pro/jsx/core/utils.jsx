/**
 * utils.jsx — the primitives the gradient engine is built from.
 *
 * Deliberately small: comps, colour conversion, the three expression controls
 * the controller needs, and one blur. Property lookups use numeric indices
 * rather than English names wherever possible, so the panel keeps working on
 * localised installs of After Effects.
 */

$.global.GF = $.global.GF || {};

GF.U = (function () {
  var U = {};

  /* ---------------------------------------------------------------- project */

  U.activeComp = function () {
    var item = app.project.activeItem;
    if (!item || !(item instanceof CompItem)) {
      throw new Error('Open a composition first, then try again.');
    }
    return item;
  };

  /** A comp for the gradient itself, matching the comp it will sit in. */
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

  /* --------------------------------------------------------------- effects */

  U.fastBlur = function (layer, amount, expr) {
    var fx = layer.property('ADBE Effect Parade').addProperty('ADBE Box Blur2');
    fx.property(1).setValue(amount);                    // Blur Radius
    if (expr) fx.property(1).expression = expr;
    try { fx.property(2).setValue(3); } catch (e) {}    // Iterations — 3 reads as gaussian
    try { fx.property(4).setValue(true); } catch (e) {} // Repeat Edge Pixels
    return fx;
  };

  return U;
})();
