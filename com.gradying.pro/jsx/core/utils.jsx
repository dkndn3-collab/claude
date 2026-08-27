/**
 * utils.jsx — the primitives the gradient engine is built from.
 *
 * Deliberately small: comps, colour conversion, the three expression controls
 * the controller needs, and one blur. Property lookups use numeric indices
 * rather than English names wherever possible, so the panel keeps working on
 * localised installs of After Effects.
 */

$.global.GY = $.global.GY || {};

GY.U = (function () {
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

  /* ------------------------------------------------------------ the falloff */

  /**
   * How wide each colour point's disc has to be, for THIS comp.
   *
   * A deliberate second copy of GRADIENTS.sigmaParts() — ExtendScript cannot
   * load the panel's modules, and the alternative was baking a number computed
   * against a guessed frame shape. A cross-check test asserts the two
   * implementations agree to 1e-9 over every preset and a range of aspects, so
   * they cannot drift apart quietly.
   *
   * Why it exists at all: the build is an over-composite of finite discs, not
   * the preview's normalised mean, so a pixel out of every disc's range falls
   * through to the base solid — one flat colour. `floor` is what stops that,
   * and it is applied after Blend and Separation so neither can reopen a hole.
   */
  var OVERLAP = 0.40, COVER = 0.35;

  U.discRadius = 2.00;      // ellipse radius = sigma * this
  U.discBlur   = 1.00;      // blur radius    = sigma * this

  function pointAt(point, phase, motion) {
    var m = motion / 100;
    return [
      point.home[0] + point.rad * m * Math.cos(point.harm * phase + point.ang),
      point.home[1] + point.rad * m * Math.sin(point.harm * phase + point.ang * 1.7)
    ];
  }

  U.sigmaParts = function (points, aspect, motion) {
    var TAU = Math.PI * 2;
    var phases = [0, 0.25, 0.5, 0.75];
    var worst = 0, gx, gy, i, j, ph, dx, dy, d;

    for (gy = 0; gy <= 16; gy++) {
      for (gx = 0; gx <= 16; gx++) {
        var x = gx / 16, y = gy / 16, best = Infinity;
        for (ph = 0; ph < phases.length; ph++) {
          for (i = 0; i < points.length; i++) {
            var at = pointAt(points[i], phases[ph] * TAU, motion || 0);
            dx = (x - at[0]) * aspect; dy = y - at[1];
            d = Math.sqrt(dx * dx + dy * dy);
            if (d < best) best = d;
          }
        }
        if (best > worst) worst = best;
      }
    }

    var total = 0;
    if (points.length < 2) {
      total = points.length;
    } else {
      for (i = 0; i < points.length; i++) {
        var near = Infinity;
        for (j = 0; j < points.length; j++) {
          if (i === j) continue;
          dx = (points[i].home[0] - points[j].home[0]) * aspect;
          dy = points[i].home[1] - points[j].home[1];
          d = Math.sqrt(dx * dx + dy * dy);
          if (d < near) near = d;
        }
        total += near;
      }
    }
    var space = points.length < 2 ? 1 : total / points.length;

    var floor = worst * COVER;
    return { base: Math.max(space * OVERLAP, floor), floor: floor };
  };

  /* ------------------------------------------------------------ selection */

  /** The layers the user has selected, or [] — never throws on an empty comp. */
  U.selectedLayers = function (comp) {
    try { return comp.selectedLayers || []; } catch (e) { return []; }
  };

  /** Every mask on a layer, in timeline order. */
  U.masksOf = function (layer) {
    var out = [];
    try {
      var group = layer.property('ADBE Mask Parade');
      if (!group) return out;
      for (var i = 1; i <= group.numProperties; i++) out.push(group.property(i));
    } catch (e) {}
    return out;
  };

  /**
   * The mask the user means. An explicitly selected mask wins; otherwise the
   * first mask on the first selected layer that has one. Returns null rather
   * than throwing, because the panel asks this question on a timer.
   */
  U.pickMask = function (comp) {
    var i, j, sel;
    try {
      sel = comp.selectedProperties || [];
      for (i = 0; i < sel.length; i++) {
        var p = sel[i], hops = 0;
        // A selected mask path, or the mask group itself — walk up to the mask.
        while (p && hops++ < 4) {
          if (p.matchName === 'ADBE Mask Atom') {
            return { layer: p.propertyGroup(p.propertyDepth), mask: p };
          }
          try { p = p.parentProperty; } catch (e2) { p = null; }
        }
      }
    } catch (e3) {}

    var layers = U.selectedLayers(comp);
    for (i = 0; i < layers.length; i++) {
      var masks = U.masksOf(layers[i]);
      for (j = 0; j < masks.length; j++) {
        // A mask set to None still draws a path — it just isn't cutting anything.
        return { layer: layers[i], mask: masks[j] };
      }
    }
    return null;
  };

  U.isText = function (layer) {
    try { return !!layer.property('ADBE Text Properties'); } catch (e) { return false; }
  };

  /** The first selected text layer, or null. */
  U.pickText = function (comp) {
    var layers = U.selectedLayers(comp);
    for (var i = 0; i < layers.length; i++) if (U.isText(layers[i])) return layers[i];
    return null;
  };

  /* ------------------------------------------------------------ mask paths */

  /**
   * A point in the layer's own space, in comp pixels.
   *
   * Newer After Effects does this for us. Older ones do not, so the fallback is
   * the transform written out by hand — anchor, scale, rotation, position, in
   * that order, which is the order AE applies them.
   */
  U.layerToComp = function (layer, pt) {
    try {
      if (typeof layer.sourcePointToComp === 'function') {
        var v = layer.sourcePointToComp(pt);
        if (v && v.length >= 2 && !isNaN(v[0])) return [v[0], v[1]];
      }
    } catch (e) {}

    var t = layer.property('ADBE Transform Group');
    function val(name, fallback) {
      try {
        var q = t.property(name);
        return q ? q.value : fallback;
      } catch (e2) { return fallback; }
    }
    var anchor = val('ADBE Anchor Point', [0, 0]);
    var pos    = val('ADBE Position', [0, 0]);
    var scale  = val('ADBE Scale', [100, 100]);
    var rot    = val('ADBE Rotate Z', 0);

    var x = (pt[0] - anchor[0]) * (scale[0] / 100);
    var y = (pt[1] - anchor[1]) * (scale[1] / 100);
    var a = (rot || 0) * Math.PI / 180;
    var ca = Math.cos(a), sa = Math.sin(a);
    return [pos[0] + x * ca - y * sa, pos[1] + x * sa + y * ca];
  };

  /**
   * A mask path as the panel's renderer wants it: comp space over frame
   * height, with After Effects' own in and out tangents kept separate. The
   * panel had a pen tool with one symmetric handle per point; a real mask does
   * not work that way, and forcing it to would redraw the user's curve wrongly.
   *
   * `closed` is read from the path, never asked of the user.
   */
  U.maskNodes = function (comp, layer, mask) {
    var shape;
    try { shape = mask.property('ADBE Mask Shape').value; } catch (e) { return null; }
    if (!shape || !shape.vertices || !shape.vertices.length) return null;

    var v = shape.vertices, inT = shape.inTangents || [], outT = shape.outTangents || [];
    var s = comp.height || 1;
    var nodes = [];
    for (var i = 0; i < v.length; i++) {
      var c = U.layerToComp(layer, v[i]);
      // Tangents are offsets, so they take the transform without the origin.
      var o = U.layerToComp(layer, [v[i][0] + (outT[i] ? outT[i][0] : 0),
                                    v[i][1] + (outT[i] ? outT[i][1] : 0)]);
      var n = U.layerToComp(layer, [v[i][0] + (inT[i] ? inT[i][0] : 0),
                                    v[i][1] + (inT[i] ? inT[i][1] : 0)]);
      nodes.push({
        x: c[0] / s, y: c[1] / s,
        ox: (o[0] - c[0]) / s, oy: (o[1] - c[1]) / s,
        ix: (n[0] - c[0]) / s, iy: (n[1] - c[1]) / s
      });
    }
    return { closed: !!shape.closed, nodes: nodes };
  };

  /** Six numbers per point, at raster precision — the panel never sees more. */
  function r5(v) {
    v = Math.round((v || 0) * 100000) / 100000;
    return isNaN(v) ? 0 : v;
  }

  U.nodesJSON = function (nodes) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      out.push('[' + r5(n.x) + ',' + r5(n.y) + ',' + r5(n.ox) + ',' + r5(n.oy) +
               ',' + r5(n.ix) + ',' + r5(n.iy) + ']');
    }
    return '[' + out.join(',') + ']';
  };

  /* ------------------------------------------------------------ text layers */

  /**
   * The type on a text layer, as the panel's rasteriser needs it.
   *
   * The panel cannot read After Effects' glyph outlines, so it re-sets the same
   * string in the browser's own text engine. Reading the string, family and
   * size from the layer is what keeps the two close: the preview shows the
   * words that are actually in the comp, not a placeholder the user typed
   * twice. Size comes back as a percentage of frame height, which is the unit
   * the panel's Text size has always been in.
   */
  U.textOf = function (comp, layer) {
    var doc;
    try { doc = layer.property('ADBE Text Properties').property('ADBE Text Document').value; }
    catch (e) { return null; }
    if (!doc) return null;

    function pick(names, fallback) {
      for (var i = 0; i < names.length; i++) {
        try {
          var v = doc[names[i]];
          if (v !== undefined && v !== null && v !== '') return v;
        } catch (e2) {}
      }
      return fallback;
    }

    var size = Number(pick(['fontSize'], 60)) || 60;
    return {
      text: String(pick(['text'], '')),
      // fontFamily is the human name a browser can match; font is the
      // PostScript name, which it usually cannot.
      font: String(pick(['fontFamily', 'font'], '')),
      size: size / (comp.height || 1) * 100,
      tracking: Number(pick(['tracking'], 0)) || 0
    };
  };

  /** ExtendScript has no JSON — this is the only escaping the replies need. */
  U.quote = function (s) {
    s = String(s == null ? '' : s);
    var out = '', c;
    for (var i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (c === '"' || c === '\\') out += '\\' + c;
      else if (c < ' ') out += ' ';
      else out += c;
    }
    return '"' + out + '"';
  };

  /* --------------------------------------------------------------- effects */

  U.fastBlur = function (layer, amount, expr, repeatEdge) {
    var fx = layer.property('ADBE Effect Parade').addProperty('ADBE Box Blur2');
    fx.property(1).setValue(amount);                    // Blur Radius
    if (expr) fx.property(1).expression = expr;
    try { fx.property(2).setValue(3); } catch (e) {}    // Iterations — 3 reads as gaussian
    /* Repeat Edge Pixels exists to stop a full-frame layer darkening at its
       border. A colour point is a small disc on a transparent layer and has to
       fade OUT, so repeating its edge is at best pointless and at worst clamps
       the blur inside the layer bounds. Off unless the caller asks. */
    try { fx.property(4).setValue(!!repeatEdge); } catch (e) {}
    return fx;
  };

  /**
   * The palette's mean colour — what the base solid falls back to.
   *
   * Averaged in **linear light**. A component mean of the sRGB values is not
   * the same thing and can come out darker than every colour it averaged:
   * pure red and pure blue mean to a purple whose luminance is below both.
   * That would put a dark patch back exactly where this is supposed to stop
   * one appearing, so the conversion is not optional.
   */
  function toLin(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function toSrgb(v) { return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }

  U.meanColor = function (hexes) {
    var r = 0, g = 0, b = 0;
    for (var i = 0; i < hexes.length; i++) {
      var c = U.hex(hexes[i]);
      r += toLin(c[0]); g += toLin(c[1]); b += toLin(c[2]);
    }
    var n = Math.max(hexes.length, 1);
    function ch(v) {
      var s = Math.round(Math.max(0, Math.min(1, toSrgb(v / n))) * 255).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + ch(r) + ch(g) + ch(b);
  };

  return U;
})();
