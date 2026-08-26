/**
 * engine.jsx — builds the mesh gradient out of native After Effects parts.
 *
 * No footage, no imported file, no baked frame: solids, shape layers, stock
 * effects, and expressions that tie every parameter back to one controller.
 *
 *   GF CONTROLLER   Motion · Blend · Flow · Grain · Loop · Seed + the colours
 *   Grain           adjustment layer · Noise (never below one LSB of dither)
 *   Flow            adjustment layer · Turbulent Displace, low frequency
 *   Colour n…1      one soft colour point each: ellipse + Fast Box Blur,
 *                   position driven by a closed orbit expression
 *   Base            solid · Fill, the first colour under everything
 *
 * Why this shape and not a noise-into-colour-ramp chain (§4.5):
 *
 *   · noise only ever moves coordinates here — it never picks a colour, which
 *     is what makes the other approach read as smoke with a filter on it
 *   · colour is mixed 2D spatially between soft points, not through a 1D
 *     luminance lookup, so there are no bands and no dead mid-tones
 *   · mixing happens in linear light when the colour space asks for it, so
 *     blue↔orange does not pass through mud
 *   · the Noise effect keeps a dither floor even at Grain 0
 *
 * The panel's WebGL preview is the reference implementation. This reproduces
 * it with the pieces After Effects actually has: Gaussian weighting becomes a
 * blurred ellipse per colour, and the weighted average becomes an over
 * composite. Same colour points, same orbits, same loop.
 *
 * Effect sub-property indices differ between AE versions, so every read goes
 * through prop() — match name first, index as the fallback — and every write is
 * guarded: a version that disagrees loses one parameter, not the whole build.
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
    var e;
    try { e = layer.property('ADBE Effect Parade').addProperty(matchName); }
    catch (err) { return null; }
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

  /** Found by value type rather than index — the lookup that has to survive. */
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

  /* ====================================================================== */
  /* Build                                                                  */
  /* ====================================================================== */

  /**
   * The colour field — the mesh, and nothing about geometry.
   *
   * Every mode builds this identically: same points, same orbits, same loop.
   * What the geometry modes add on top is a matte, so there is one colour
   * pipeline in the plugin and not three that drift apart.
   */
  function field(comp, p) {
    var colors = p.colors || [];

    // Everything this build adds, so a flat build can be moved under the user's
    // existing layers as one group.
    var made = [];

    /* ---- controller ---------------------------------------------------- */

    var ctrlName = uniqueLayerName(comp, 'GF CONTROLLER');
    var ctrl = comp.layers.addNull();
    made.push(ctrl);
    ctrl.name = ctrlName;
    ctrl.label = 11;
    ctrl.enabled = false;
    ctrl.property('Transform').property('Position').setValue([comp.width / 2, comp.height / 2]);

    U.slider(ctrl, 'Motion', p.motion);
    U.slider(ctrl, 'Blend', p.blend);
    U.slider(ctrl, 'Flow', p.flow);
    U.slider(ctrl, 'Grain', p.grain);
    U.slider(ctrl, 'Separation', p.separation == null ? 40 : p.separation);
    U.slider(ctrl, 'Loop', p.loop);
    U.slider(ctrl, 'Seed', p.seed);
    for (var c = 0; c < colors.length; c++) U.colorControl(ctrl, 'Color ' + (c + 1), colors[c]);

    var R = function (name) {
      return 'thisComp.layer("' + ctrlName + '").effect("' + name + '")(1)';
    };
    function colorExpr(index) {
      return 'c = ' + R('Color ' + index) + ';\n[c[0], c[1], c[2], 1].slice(0, value.length)';
    }

    /**
     * The falloff, sized for THIS comp and THIS layout.
     *
     * It used to be a constant fraction of frame height, which is what put the
     * black holes there: the seed spreads the points further apart the fewer
     * of them there are, and a fixed disc then reached nowhere near the frame —
     * at two colours the points landed outside it entirely and 98% of the
     * frame was bare base colour. `base` comes from how far apart the points
     * actually ended up, `floor` from how far the frame's worst pixel is from
     * the nearest of them, and the floor is applied last so no Blend or
     * Separation setting can reopen a hole.
     *
     * Both are computed here, against the real comp aspect, and baked in —
     * the sliders they multiply stay live.
     */
    var sig = U.sigmaParts(p.points, comp.width / comp.height, p.motion);
    var SIGMA = 'thisComp.height * Math.max(' + sig.base.toFixed(6) +
                ' * (0.70 + 0.66 * ' + R('Blend') + '/100)' +
                ' * (1 - 0.40 * ' + R('Separation') + '/100), ' +
                sig.floor.toFixed(6) + ')';

    /* ---- base — the first colour, under everything ---------------------- */

    var base = solid(comp, 'Base');
    made.push(base);
    var baseFill = addFx(base, 'ADBE Fill', 'Base Colour');
    if (baseFill) {
      var bc = colorProps(baseFill)[0];
      set(bc, U.rgba(colors[0]));
      expr(bc, colorExpr(1));
    }

    /* ---- one soft colour point per stop --------------------------------- */

    for (var i = 0; i < colors.length; i++) {
      var pt = p.points[i];
      var layer = comp.layers.addShape();
      made.push(layer);
      layer.name = 'Colour ' + (i + 1);

      var group = layer.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
      group.name = 'Point';
      var vectors = group.property('ADBE Vectors Group');

      var ell = vectors.addProperty('ADBE Vector Shape - Ellipse');
      // Diameter: the disc's flat centre plus the blur's soft edge together
      // have to span the gap, which is what U.discRadius and U.discBlur are.
      expr(ell.property('ADBE Vector Ellipse Size'),
           's = ' + SIGMA + ' * ' + (U.discRadius * 2).toFixed(2) + ';\n[s, s]');

      var fill = vectors.addProperty('ADBE Vector Graphic - Fill');
      var fc = fill.property('ADBE Vector Fill Color');
      set(fc, U.rgba(colors[i]));
      expr(fc, colorExpr(i + 1));

      /**
       * The orbit closes: the rate is a whole harmonic of the loop, so at the
       * end of the cycle the point is exactly where it started. Motion scales
       * the radius, not the rate — Motion 0 is a true still and turning it up
       * can never break the loop (§4.5).
       */
      expr(layer.property('Transform').property('Position'),
        'home = [' + pt.home[0].toFixed(5) + ', ' + pt.home[1].toFixed(5) + '];\n' +
        'rad = ' + pt.rad.toFixed(5) + '; harm = ' + pt.harm + '; ang = ' + pt.ang.toFixed(5) + ';\n' +
        'm = ' + R('Motion') + '/100;\n' +
        'ph = time / Math.max(0.5, ' + R('Loop') + ') * Math.PI * 2 * harm;\n' +
        '[(home[0] + rad * m * Math.cos(ph + ang)) * thisComp.width,\n' +
        ' (home[1] + rad * m * Math.sin(ph + ang * 1.7)) * thisComp.height]');

      // A blurred disc is the closest native thing to a Gaussian falloff.
      U.fastBlur(layer, comp.height * 0.2, SIGMA + ' * ' + U.discBlur.toFixed(2));
    }

    /* ---- flow — one low-frequency warp over the whole field -------------- */

    var flow = solid(comp, 'Flow');
    made.push(flow);
    flow.adjustmentLayer = true;

    var td = addFx(flow, 'ADBE Turbulent Displace', 'Flow');
    if (td) {
      // Amplitude matches the preview's warp: up to 0.42 of the frame.
      expr(prop(td, 2, 'ADBE Turbulent Displace-0002'),
        R('Flow') + '/100 * 0.42 * thisComp.height');                       // Amount
      // Deliberately large: a high-frequency warp is what turns a gradient
      // into smoke, so Size stays big and Complexity stays at 1.
      expr(prop(td, 3, 'ADBE Turbulent Displace-0003'),
        'Math.max(120, thisComp.height * 0.32)');                            // Size
      set(prop(td, 5, 'ADBE Turbulent Displace-0005'), 1);                   // Complexity
      // The warp field itself is static; the sample point travels a closed
      // circle through it, which is what makes the loop exact.
      expr(prop(td, 6, 'ADBE Turbulent Displace-0006'),
        '(' + R('Seed') + ' % 360)');                                        // Evolution
      expr(prop(td, 4, 'ADBE Turbulent Displace-0004'),
        'm = ' + R('Motion') + '/100;\n' +
        't = time / Math.max(0.5, ' + R('Loop') + ') * Math.PI * 2;\n' +
        'amp = m * thisComp.width * 0.12;\n' +
        '[thisComp.width/2, thisComp.height/2] + [Math.cos(t), Math.sin(t)] * amp');
      var evoOpts = prop(td, 7, 'ADBE Turbulent Displace-0007');
      if (evoOpts) expr(prop(evoOpts, 3), 'Math.round(' + R('Seed') + ')');  // Random Seed
    }

    /* ---- grain — texture, and the dither that kills banding ------------- */

    var grain = solid(comp, 'Grain');
    made.push(grain);
    grain.adjustmentLayer = true;
    var noise = addFx(grain, 'ADBE Noise', 'Grain');
    if (noise) {
      // 0.35% is one 8-bit LSB. Even at Grain 0 the dither stays in, because a
      // smooth gradient without it WILL band on an 8-bit output (§4.5).
      expr(prop(noise, 1, 'ADBE Noise-0001'), '0.35 + ' + R('Grain') + ' * 0.055');
      set(prop(noise, 2, 'ADBE Noise-0002'), 0);        // Use Color Noise
      set(prop(noise, 3, 'ADBE Noise-0003'), 1);        // Clip Result Values
    }

    /* ---- assemble ------------------------------------------------------ */

    ctrl.moveToBeginning();
    return { made: made, ctrl: ctrl };
  }

  /* ====================================================================== */
  /* Create — one path, three geometry sources                              */
  /* ====================================================================== */

  /**
   * The panel calls this for every tab. It never branches on which tab is open:
   * it asks the mode's source for its geometry, and a source that has none to
   * give throws the same sentence the disabled button was already showing.
   */
  function create(p) {
    var parent = U.activeComp();
    var mode = (p.geometry && p.geometry.mode) || p.mode || 'mesh';
    var source = GF.Geom.sourceFor(mode);
    // The panel's geometry carries which path it picked, so the build and the
    // preview resolve to the same one even when the timeline selection moved.
    var geometry = source.read(parent, p.geometry || {});

    var colors = p.colors || [];
    if (colors.length < 2) throw new Error('A gradient needs at least two colours.');

    // A shaped gradient has to be matted, and a matte cuts one layer, not a
    // stack of six — so geometry modes always get their own comp.
    var shaped = mode !== 'mesh';
    var nested = shaped || !!p.precomp;

    var wanted = (p.name && p.name.length) ? p.name : 'GRADIENT — ' + p.label;
    var comp = nested ? U.makeComp(wanted, parent.width, parent.height, parent) : parent;

    var built = field(comp, p);
    var made = built.made;

    // OKLab and HCL both ask for mixing in linear light; this is as close as a
    // native composite gets to it.
    var blending = '';
    if (p.linear) {
      try {
        if (!app.project.linearBlending) {
          app.project.linearBlending = true;
          blending = ' · linear blending on';
        }
      } catch (e) { /* older AE without the project flag */ }
    }

    var count = made.length + ' native layers, 0 assets';

    if (!nested) {
      // Built straight into the comp — keep the stack together at the bottom,
      // in the order it was assembled.
      made.sort(function (a, b) { return a.index - b.index; });
      for (var m = 0; m < made.length; m++) { try { made[m].moveToEnd(); } catch (e) {} }
      built.ctrl.selected = true;
      return p.label + ' built into ' + comp.name + ' · ' + count + blending;
    }

    var placed = parent.layers.add(comp);
    placed.name = comp.name;
    placed.property('ADBE Transform Group').property('ADBE Position')
      .setValue([parent.width / 2, parent.height / 2]);

    var matte = source.matte(parent, geometry, p);
    if (!matte) {
      // A gradient with no geometry is a background: it goes under whatever is
      // already there.
      try { placed.moveToEnd(); } catch (e) {}
      placed.selected = true;
      return comp.name + ' added · ' + count + blending;
    }

    // The matte has to sit directly above what it cuts on every AE version,
    // whether or not this one has the newer track-matte API.
    try { matte.moveBefore(placed); } catch (e) {}
    if (!trackMatte(placed, matte)) {
      throw new Error('This After Effects version would not accept a track matte — ' +
                      'set “' + matte.name + '” as an alpha matte for “' + placed.name + '” by hand.');
    }

    // Some sources do more than cut a hole: Letter builds a height field and
    // lights the gradient through it. This runs after the matte is wired, so
    // the effects it adds sit under a stack that is already correct.
    var extra = '';
    if (typeof source.shade === 'function') {
      var made = source.shade(parent, geometry, p, placed);
      if (made) extra = ' · ' + made.name;
    }

    placed.selected = true;
    // Name the source: the user picked it from a list, so the confirmation has
    // to say which one it actually built from.
    return GF.Geom.sourceFor(mode).label + ' gradient added · ' +
           (geometry.label ? geometry.label + ' · ' : '') + count + extra + blending;
  }

  /** AE 23 replaced the track-matte property with a method; support both. */
  function trackMatte(layer, matte) {
    try {
      if (typeof layer.setTrackMatte === 'function') {
        layer.setTrackMatte(matte, TrackMatteType.ALPHA);
        return true;
      }
    } catch (e) {}
    try {
      layer.trackMatteType = TrackMatteType.ALPHA;
      return true;
    } catch (e2) {}
    return false;
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
