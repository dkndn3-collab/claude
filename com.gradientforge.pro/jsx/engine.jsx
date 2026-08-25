/**
 * engine.jsx — builds the gradient out of native After Effects parts.
 *
 * No footage, no imported file, no baked frame: a few solids, a stack of stock
 * effects, and expressions that tie every parameter back to one controller.
 * The panel sends numbers; this file turns them into a layer stack you can keep
 * editing afterwards.
 *
 *   GF CONTROLLER    every parameter as a slider or colour control
 *   Grain            adjustment layer · Noise
 *   Warp             adjustment layer · Displacement Map + CC Vector Blur (flow)
 *                                       Turbulent Displace + Fast Box Blur
 *   Colour B         4-Color Gradient for stops 5–8, mixed through…
 *   Mix Matte        …a Fractal Noise luma matte
 *   Colour A         Gradient Ramp (2 stops, exact) or 4-Color Gradient
 *   FIELD            Fractal Noise, video off — the flow mode's vector source
 *
 * Two constraints shaped this design and are worth knowing before changing it:
 *
 * 1. After Effects has no scriptable multi-stop gradient. Colorama's output
 *    cycle and a shape layer's gradient stops cannot be written from
 *    ExtendScript, so the colour base is Gradient Ramp (exactly 2 stops) or
 *    4-Color Gradient (4 anchors) — which is why the panel resamples the user's
 *    2–8 stops perceptually before sending them here.
 *
 * 2. Effect sub-property indices differ between AE versions. Every read goes
 *    through prop(), which tries the match name first and falls back to the
 *    index, and every write is guarded — a version that disagrees loses one
 *    parameter rather than the whole build.
 */

$.global.GF = $.global.GF || {};

GF.Gradient = (function () {
  var U = GF.U;

  /* ====================================================================== */
  /* Defensive property access                                              */
  /* ====================================================================== */

  function prop(group, index, matchName) {
    if (!group) return null;
    if (matchName) {
      try {
        var byName = group.property(matchName);
        if (byName) return byName;
      } catch (e) { /* older/newer AE — fall through to the index */ }
    }
    try { return group.property(index); } catch (e2) { return null; }
  }

  function set(p, v) { if (p) { try { p.setValue(v); } catch (e) {} } }
  function expr(p, s) { if (p) { try { p.expression = s; } catch (e) {} } }

  function addFx(layer, matchName, name) {
    var parade = layer.property('ADBE Effect Parade');
    var e;
    try { e = parade.addProperty(matchName); } catch (err) { return null; }
    if (name) { try { e.name = name; } catch (err2) {} }
    return e;
  }

  /** Every leaf property of an effect, in panel order. */
  function leaves(group, out) {
    out = out || [];
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      try {
        if (p.propertyType === PropertyType.PROPERTY) out.push(p);
        else leaves(p, out);
      } catch (e) { /* skip anything the host will not describe */ }
    }
    return out;
  }

  /**
   * Colour and point controls found by value type rather than by index — the
   * one lookup that has to survive every AE version, since it is how the
   * colours get onto the gradient at all.
   */
  function ofType(effect, types) {
    var all = leaves(effect), out = [];
    for (var i = 0; i < all.length; i++) {
      try {
        for (var t = 0; t < types.length; t++) {
          if (all[i].propertyValueType === types[t]) { out.push(all[i]); break; }
        }
      } catch (e) {}
    }
    return out;
  }

  function colorProps(effect) { return ofType(effect, [PropertyValueType.COLOR]); }
  function pointProps(effect) { return ofType(effect, [PropertyValueType.TwoD_SPATIAL, PropertyValueType.TwoD]); }

  function uniqueLayerName(comp, base) {
    var taken = {};
    for (var i = 1; i <= comp.numLayers; i++) taken[comp.layer(i).name] = true;
    if (!taken[base]) return base;
    var n = 2;
    while (taken[base + ' ' + n]) n++;
    return base + ' ' + n;
  }

  function solid(comp, name) {
    return comp.layers.addSolid([0, 0, 0], name, comp.width, comp.height, 1);
  }

  function lumaMatte(layer, matteLayer) {
    try {
      if (typeof layer.setTrackMatte === 'function') {
        layer.setTrackMatte(matteLayer, TrackMatteType.LUMA);
        return;
      }
    } catch (e) {}
    try {
      layer.trackMatteType = TrackMatteType.LUMA;
      matteLayer.enabled = false;
    } catch (e2) {}
  }

  /* ====================================================================== */
  /* Build                                                                  */
  /* ====================================================================== */

  function create(p) {
    var parent = U.activeComp();
    var wanted = (p.name && p.name.length) ? p.name : 'GRADIENT — ' + p.label;
    var comp = p.precomp ? U.makeComp(wanted, parent.width, parent.height, parent) : parent;

    // Everything this build adds, so a flat build can be moved under the
    // user's existing layers as one group.
    var made = [];

    var ctrlName = uniqueLayerName(comp, 'GF CONTROLLER');
    var ctrl = comp.layers.addNull();
    made.push(ctrl);
    ctrl.name = ctrlName;
    ctrl.label = 11;
    ctrl.enabled = false;
    ctrl.property('Transform').property('Position').setValue([comp.width / 2, comp.height / 2]);

    /* ---- the controller carries every parameter (§5.4) ----------------- */
    U.slider(ctrl, 'Angle', p.angle);
    U.slider(ctrl, 'Spread', p.spread);
    U.slider(ctrl, 'Scale', p.scale);
    U.slider(ctrl, 'Complexity', p.complexity);
    U.slider(ctrl, 'Warp', p.warp);
    U.slider(ctrl, 'Softness', p.softness);
    U.slider(ctrl, 'Grain', p.grain);
    U.slider(ctrl, 'Speed', p.speed);
    U.slider(ctrl, 'Loop', p.loop);
    U.slider(ctrl, 'Seed', p.seed);

    var stops = p.colors.concat(p.extra || []);
    for (var s = 0; s < stops.length; s++) U.colorControl(ctrl, 'Color ' + (s + 1), stops[s]);

    var R = function (name) {
      return 'thisComp.layer("' + ctrlName + '").effect("' + name + '")(1)';
    };
    function colorExpr(index) {
      return 'c = ' + R('Color ' + index) + ';\n[c[0], c[1], c[2], 1].slice(0, value.length)';
    }

    /* ---- shared expression fragments ----------------------------------- */

    // Everything geometric derives from Angle and Spread, so dragging either
    // one in the Effect Controls panel re-lays the whole gradient out.
    var GEO = 'c = [thisComp.width/2, thisComp.height/2];\n' +
              'a = degreesToRadians(' + R('Angle') + ');\n' +
              'd = [Math.cos(a), Math.sin(a)];\n' +
              'ext = Math.max(thisComp.width, thisComp.height) * ' + R('Spread') + '/100;\n';

    var CYCLES = 'Math.max(1, Math.round(' + R('Speed') + '/12))';

    /**
     * Seamless loop (§5.3): evolution covers a whole number of revolutions per
     * loop, and Cycle Evolution is switched on with the same number — so the
     * last frame of the loop is the first frame again, exactly.
     */
    function evolution(phase) {
      if (!p.speed) return String(phase);
      return 'dur = Math.max(0.1, ' + R('Loop') + ');\n' +
             'rev = ' + CYCLES + ';\n' +
             phase + ' + (time/dur) * rev * 360';
    }

    function setEvolutionOptions(effect, groupIndex, groupMatch, seedSalt) {
      var g = prop(effect, groupIndex, groupMatch);
      if (!g) return;
      set(prop(g, 1), 1);                                   // Cycle Evolution on
      expr(prop(g, 2), CYCLES);                             // Cycle (in Revolutions)
      expr(prop(g, 3), 'Math.round(' + R('Seed') + ') + ' + seedSalt);
    }

    /* ---- 4-Color Gradient, anchored on the Angle/Spread axis ----------- */

    function quad(layer, colors, offsets, firstColorIndex) {
      var fx = addFx(layer, 'ADBE 4ColorGradient', 'Colour Blend');
      if (!fx) throw new Error('This After Effects install has no 4-Color Gradient effect.');

      var pts = pointProps(fx), cols = colorProps(fx);
      for (var i = 0; i < 4; i++) {
        var t = (i / 3) - 0.5;
        var o = (offsets && offsets[i]) || [0, 0];
        if (pts[i]) {
          expr(pts[i], GEO +
            'o = [' + o[0].toFixed(4) + ', ' + o[1].toFixed(4) + '];\n' +
            'c + d * (' + t.toFixed(4) + ' * ext) + o * ext');
        }
        if (cols[i]) expr(cols[i], colorExpr(firstColorIndex + Math.min(i, colors.length - 1)));
      }
      // Blend widens the falloff between anchors; Softness already reads as
      // "how soft is this gradient", so it drives both.
      var blend = prop(fx, 2);
      if (blend && blend.propertyValueType === PropertyValueType.OneD) {
        expr(blend, '100 + ' + R('Softness') + ' * 2');
      }
      return fx;
    }

    /* ---- FIELD — the flow mode's vector source ------------------------- */

    var field = null;
    if (p.mode === 'flow') {
      field = solid(comp, 'FIELD');
      made.push(field);
      var fn = addFx(field, 'ADBE Fractal Noise', 'Field Noise');
      if (fn) {
        set(prop(fn, 4, 'ADBE Fractal Noise-0004'), 120);    // Contrast
        set(prop(fn, 5, 'ADBE Fractal Noise-0005'), -10);    // Brightness
        var xf = prop(fn, 7, 'ADBE Fractal Noise-0007');     // Transform group
        if (xf) expr(prop(xf, 3), '40 + ' + R('Scale') + ' * 2.6');   // Scale
        expr(prop(fn, 8, 'ADBE Fractal Noise-0008'),
          'Math.max(1, Math.round(' + R('Complexity') + '/22))');     // Complexity
        expr(prop(fn, 10, 'ADBE Fractal Noise-0010'), evolution(p.phase));
        setEvolutionOptions(fn, 11, 'ADBE Fractal Noise-0011', 0);
      }
      field.enabled = false;         // eye off — it is a map source, not an image
      field.label = 8;
    }

    /* ---- Colour A — the base ------------------------------------------- */

    var colorA = solid(comp, 'Colour Base');
    made.push(colorA);

    if (p.exact) {
      // Two stops in Linear mode: Gradient Ramp is mathematically exact and
      // costs almost nothing to render.
      var ramp = addFx(colorA, 'ADBE Ramp', 'Ramp');
      if (ramp) {
        var rPts = pointProps(ramp), rCols = colorProps(ramp);
        var half = (p.shape === 'radial') ? 'c' : 'c - d * (ext/2)';
        if (rPts[0]) expr(rPts[0], GEO + half);
        if (rPts[1]) expr(rPts[1], GEO + 'c + d * (ext/2)');
        if (rCols[0]) expr(rCols[0], colorExpr(1));
        if (rCols[1]) expr(rCols[1], colorExpr(2));
        set(prop(ramp, 5, 'ADBE Ramp-0005'), p.shape === 'radial' ? 2 : 1);  // Ramp Shape
        set(prop(ramp, 6, 'ADBE Ramp-0006'), 2);                             // Ramp Scatter
      }
    } else {
      quad(colorA, p.colors, p.offsets, 1);
    }

    /* ---- Colour B — stops 5–8, mixed in through a noise matte ---------- */

    if (p.extra) {
      var colorB = solid(comp, 'Colour Mix');
      made.push(colorB);
      quad(colorB, p.extra, p.extraOffsets, 5);

      var matte = comp.layers.addSolid([1, 1, 1], 'Mix Matte', comp.width, comp.height, 1);
      made.push(matte);
      var mn = addFx(matte, 'ADBE Fractal Noise', 'Mix Noise');
      if (mn) {
        set(prop(mn, 4, 'ADBE Fractal Noise-0004'), 60);
        var mxf = prop(mn, 7, 'ADBE Fractal Noise-0007');
        if (mxf) expr(prop(mxf, 3), '80 + ' + R('Scale') + ' * 3.2');
        expr(prop(mn, 8, 'ADBE Fractal Noise-0008'),
          'Math.max(1, Math.round(' + R('Complexity') + '/30))');
        expr(prop(mn, 10, 'ADBE Fractal Noise-0010'), evolution((p.phase + 140) % 360));
        setEvolutionOptions(mn, 11, 'ADBE Fractal Noise-0011', 4001);
      }
      lumaMatte(colorB, matte);
    }

    /* ---- Warp — one adjustment layer over the colour ------------------- */

    var warp = solid(comp, 'Warp');
    made.push(warp);
    warp.adjustmentLayer = true;

    // Layer-index properties are bound once the stack is final — adding a layer
    // above FIELD would otherwise point them at the wrong layer.
    var fieldRefs = [];

    if (p.mode === 'flow' && field) {
      var dm = addFx(warp, 'ADBE Displacement Map', 'Flow Displace');
      if (dm) {
        fieldRefs.push(prop(dm, 1, 'ADBE Displacement Map-0001'));
        expr(prop(dm, 3, 'ADBE Displacement Map-0003'), R('Warp') + ' * 1.6');  // Max Horizontal
        expr(prop(dm, 5, 'ADBE Displacement Map-0005'), R('Warp') + ' * 1.6');  // Max Vertical
      }
      // Smears the colour along the field's own gradient — the fluid read.
      var vb = addFx(warp, 'CC Vector Blur', 'Flow Smear');
      if (vb) {
        expr(prop(vb, 2), R('Warp') + ' * 0.28');   // Amount
        fieldRefs.push(prop(vb, 5));                // Vector Map
      }
    }

    if (p.mode !== 'linear' || p.warp > 0) {
      var td = addFx(warp, 'ADBE Turbulent Displace', 'Turbulence');
      if (td) {
        expr(prop(td, 2, 'ADBE Turbulent Displace-0002'), R('Warp') + ' * 2.4');       // Amount
        expr(prop(td, 3, 'ADBE Turbulent Displace-0003'), '20 + ' + R('Scale') + ' * 1.6'); // Size
        expr(prop(td, 5, 'ADBE Turbulent Displace-0005'),
          'Math.max(1, Math.round(' + R('Complexity') + '/22))');                      // Complexity
        expr(prop(td, 6, 'ADBE Turbulent Displace-0006'), evolution((p.phase + 60) % 360));
        setEvolutionOptions(td, 7, 'ADBE Turbulent Displace-0007', 17);
        if (p.speed) {
          // A circular drift loops as cleanly as the evolution does.
          expr(prop(td, 4, 'ADBE Turbulent Displace-0004'),
            'c = [thisComp.width/2, thisComp.height/2];\n' +
            'dur = Math.max(0.1, ' + R('Loop') + ');\n' +
            'amp = ' + R('Warp') + ' * 1.2;\n' +
            't = time/dur * Math.PI * 2;\n' +
            'c + [Math.sin(t), Math.cos(t)] * amp');
        }
      }
    }

    U.fastBlur(warp, p.softness * 0.55, R('Softness') + ' * 0.55');

    /* ---- Grain — kills the banding a smooth ramp shows on 8-bit -------- */

    if (p.grain > 0) {
      var grain = solid(comp, 'Grain');
      made.push(grain);
      grain.adjustmentLayer = true;
      var noise = addFx(grain, 'ADBE Noise', 'Grain');
      if (noise) {
        expr(prop(noise, 1, 'ADBE Noise-0001'), R('Grain'));   // Amount of Noise
        set(prop(noise, 2, 'ADBE Noise-0002'), 0);             // Use Color Noise
        set(prop(noise, 3, 'ADBE Noise-0003'), 1);             // Clip Result Values
      }
    }

    /* ---- assemble ------------------------------------------------------ */

    ctrl.moveToBeginning();

    for (var f = 0; f < fieldRefs.length; f++) set(fieldRefs[f], field.index);

    var count = made.length + ' native layers, 0 assets';

    if (p.precomp) {
      var layer = parent.layers.add(comp);
      layer.name = comp.name;
      layer.property('ADBE Transform Group').property('ADBE Position')
        .setValue([parent.width / 2, parent.height / 2]);
      // A gradient is a background: it goes under whatever is already there.
      try { layer.moveToEnd(); } catch (e) {}
      layer.selected = true;
      return comp.name + ' added · ' + count;
    }

    // Built straight into the comp — keep the stack together at the bottom,
    // in the order it was assembled.
    made.sort(function (a, b) { return a.index - b.index; });
    for (var m = 0; m < made.length; m++) { try { made[m].moveToEnd(); } catch (e) {} }

    ctrl.selected = true;
    return p.label + ' built into ' + comp.name + ' · ' + count;

  }

  /* ====================================================================== */
  /* Freeze — the still export (§5.3), without going near the render queue  */
  /* ====================================================================== */

  function freeze() {
    var comp = U.activeComp();
    var sel = comp.selectedLayers;
    if (!sel.length) throw new Error('Select the gradient layer to freeze, then try again.');

    var frozen = 0;
    for (var i = 0; i < sel.length; i++) {
      var layer = sel[i];
      if (!layer.canSetTimeRemapEnabled) continue;
      var t = comp.time - layer.startTime;
      layer.timeRemapEnabled = true;
      var tr = layer.property('ADBE Time Remapping');
      while (tr.numKeys > 0) tr.removeKey(1);
      tr.setValue(Math.max(0, t));
      layer.outPoint = comp.duration;
      frozen++;
    }
    if (!frozen) throw new Error('That layer cannot be frozen — select the gradient precomp layer.');
    return frozen === 1 ? 'Frozen at the playhead — still, and still editable'
                        : frozen + ' layers frozen at the playhead';
  }

  return { create: create, freeze: freeze };
})();
