/**
 * geometry.jsx — the three geometry sources, behind one interface.
 *
 * Every generator tab answers the same two questions:
 *
 *   probe(comp)  → { valid, reason }   can Create run right now, and if not, why
 *   read(comp)   → source              the thing it builds from, or an Error
 *                                      carrying the very message probe() gave
 *   matte(...)   → layer | null        what shapes the colour field, if anything
 *
 * That is the whole contract. `Create gradient` never asks which tab is open —
 * it asks the active source for its geometry, refuses with the source's own
 * reason when there isn't any, and otherwise hands the same colour field to
 * whatever the source wants to do with it.
 *
 * Mesh has no geometry: it is valid whenever a comp is open and its matte is
 * null, which is exactly what "the gradient fills the frame" means.
 *
 * Curve and Letter both shape the field with a track matte built from something
 * the user already has in the timeline — a mask path, a text layer. Nothing is
 * imported and nothing is rasterised to disk: the matte is a duplicate of their
 * own layer with native effects on it.
 */

$.global.GF = $.global.GF || {};

GF.Geom = (function () {
  var U = GF.U;

  /* ---------------------------------------------------------------- parts */

  function fx(layer, matchName, name) {
    var e;
    try { e = layer.property('ADBE Effect Parade').addProperty(matchName); }
    catch (err) { return null; }
    if (name) { try { e.name = name; } catch (err2) {} }
    return e;
  }

  function prop(group, index, matchName) {
    if (!group) return null;
    if (matchName) {
      try {
        var byName = group.property(matchName);
        if (byName) return byName;
      } catch (e) {}
    }
    try { return group.property(index); } catch (e2) { return null; }
  }

  function set(p, v) { if (p) { try { p.setValue(v); } catch (e) {} } }
  function expr(p, s) { if (p) { try { p.expression = s; } catch (e) {} } }

  function leaves(group, out) {
    out = out || [];
    for (var i = 1; i <= group.numProperties; i++) {
      var q = group.property(i);
      try {
        if (q.propertyType === PropertyType.PROPERTY) out.push(q);
        else leaves(q, out);
      } catch (e) {}
    }
    return out;
  }

  /** By value type, never by index — the one lookup that has to survive AE. */
  function colorOf(effect) {
    if (!effect) return null;
    var all = leaves(effect);
    for (var i = 0; i < all.length; i++) {
      try { if (all[i].propertyValueType === PropertyValueType.COLOR) return all[i]; } catch (e) {}
    }
    return null;
  }

  var WHITE = [1, 1, 1, 1];

  function firstOfType(effect, type) {
    if (!effect) return null;
    var all = leaves(effect);
    for (var i = 0; i < all.length; i++) {
      try { if (all[i].propertyValueType === type) return all[i]; } catch (e) {}
    }
    return null;
  }

  function uniqueName(comp, base) {
    var taken = {}, i;
    for (i = 1; i <= comp.numLayers; i++) taken[comp.layer(i).name] = true;
    if (!taken[base]) return base;
    var n = 2;
    while (taken[base + ' ' + n]) n++;
    return base + ' ' + n;
  }

  function stripEffects(layer) {
    try {
      var parade = layer.property('ADBE Effect Parade');
      while (parade.numProperties > 0) parade.property(1).remove();
    } catch (e) {}
  }

  /** A duplicate stands in for the user's layer, so their own is never touched. */
  function copyOf(layer, name) {
    var dup = layer.duplicate();
    dup.name = name;
    dup.enabled = true;
    stripEffects(dup);
    try { dup.motionBlur = false; } catch (e) {}
    return dup;
  }

  /**
   * Spread reads the same way in both geometry modes: how far the ramp reaches
   * off the outline, as a fraction of frame height. It stays a live slider on
   * the matte layer, because the matte sits outside the field's precomp and
   * expressions cannot see across that boundary.
   */
  function spreadControl(layer, geom) {
    geom = geom || {};
    U.slider(layer, 'Spread', geom.spread == null ? 34 : geom.spread);
    var blur = U.fastBlur(layer, 20, 'thisComp.height * (0.012 + effect("Spread")(1)/100 * 0.30)');
    try { blur.name = 'Falloff'; } catch (e) {}

    // Offset moves the edge the ramp is measured from, which is what Simple
    // Choker does to a matte: positive pulls it in, negative pushes it out.
    // The effect gets a name of its own — two effects called Offset on one
    // layer would make effect("Offset") ambiguous in every expression here.
    if (geom.offset !== undefined) {
      U.slider(layer, 'Offset', geom.offset || 0);
      var choke = fx(layer, 'ADBE Simple Choker', 'Edge');
      if (choke) {
        expr(prop(choke, 2, 'ADBE Simple Choker-0002'),
             'effect("Offset")(1)/100 * thisComp.height * 0.12');
      }
    }
  }

  /* ====================================================================== */
  /* mesh — no geometry at all                                              */
  /* ====================================================================== */

  var mesh = {
    id: 'mesh',
    label: 'Mesh',
    probe: function () { return { valid: true, reason: '' }; },
    read: function () { return { kind: 'mesh' }; },
    matte: function () { return null; }
  };

  /* ====================================================================== */
  /* curve — a mask path already in the timeline                            */
  /* ====================================================================== */

  var CURVE_REASON = 'Select a mask path first — draw a mask on any layer in the timeline.';

  /**
   * Every mask path in the comp, in timeline order. The panel's Path ▾ is this
   * list: a mask anywhere in the comp can be picked without hunting for it in
   * the timeline, and whatever is selected there is only the default.
   */
  function pathList(comp) {
    var out = [];
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var masks = U.masksOf(layer);
      for (var m = 0; m < masks.length; m++) {
        out.push({
          id: i + '/' + (m + 1),
          layer: layer,
          mask: masks[m],
          label: layer.name + ' · ' + masks[m].name
        });
      }
    }
    return out;
  }

  /**
   * Which path the build uses: the one the panel asked for if it is still
   * there, otherwise whatever is selected in the timeline, otherwise the first
   * one in the comp. The panel and the host resolve it the same way, so the
   * preview and the build can never end up on different curves.
   */
  function pickPath(comp, wantId) {
    var all = pathList(comp);
    if (!all.length) return null;
    var i;
    if (wantId) {
      for (i = 0; i < all.length; i++) if (all[i].id === wantId) return all[i];
    }
    var hit = U.pickMask(comp);
    if (hit) {
      for (i = 0; i < all.length; i++) {
        if (all[i].layer === hit.layer && all[i].mask === hit.mask) return all[i];
      }
    }
    return all[0];
  }

  var curve = {
    id: 'curve',
    label: 'Curve',

    probe: function (comp, want) {
      var all = pathList(comp);
      if (!all.length) return { valid: false, reason: CURVE_REASON, paths: [] };
      var pick = pickPath(comp, want && want.path);
      return { valid: true, reason: '', detail: pick.label, paths: all, pick: pick };
    },

    read: function (comp, want) {
      var pick = pickPath(comp, want && want.path);
      if (!pick) throw new Error(CURVE_REASON);
      var geom = U.maskNodes(comp, pick.layer, pick.mask);
      if (!geom) throw new Error('That mask has no path — “' + pick.label + '” is empty.');
      return { kind: 'curve', id: pick.id, layer: pick.layer, mask: pick.mask,
               label: pick.label, closed: geom.closed, nodes: geom.nodes };
    },

    /**
     * A closed path has an interior, so the matte is the region itself. An open
     * one has none, so it is stroked — the one native way to get pixels out of
     * an open path. Which of the two it is comes from the path, never from a
     * toggle the user has to remember to match.
     *
     * Either way the blur that follows is what turns the edge into a ramp.
     */
    matte: function (comp, source, p) {
      var layer = copyOf(source.layer, 'GF MATTE — Curve');
      var masks = U.masksOf(layer);
      var index = 1;
      for (var i = 0; i < masks.length; i++) {
        try { if (masks[i].name === source.mask.name) index = i + 1; } catch (e) {}
      }

      if (source.closed) {
        for (var m = 0; m < masks.length; m++) {
          try {
            masks[m].maskMode = (m + 1 === index) ? MaskMode.ADD : MaskMode.NONE;
            masks[m].maskFeather.setValue([0, 0]);
          } catch (e2) {}
        }
        set(colorOf(fx(layer, 'ADBE Fill', 'Matte')), WHITE);
      } else {
        var stroke = fx(layer, 'ADBE Stroke', 'Matte');
        if (stroke) {
          set(prop(stroke, 1, 'ADBE Stroke-0001'), index);            // Path
          set(prop(stroke, 2, 'ADBE Stroke-0002'), false);            // All Masks
          set(colorOf(stroke), WHITE);                                // Color
          expr(prop(stroke, 4, 'ADBE Stroke-0004'),                   // Brush Size
               'Math.max(1, thisComp.height * (0.004 + effect("Spread")(1)/100 * 0.06))');
          set(prop(stroke, 5, 'ADBE Stroke-0005'), 100);              // Brush Hardness
          set(prop(stroke, 6, 'ADBE Stroke-0006'), 100);              // Opacity
          set(prop(stroke, 10, 'ADBE Stroke-0010'), 2);               // Paint Style: transparent
        } else {
          // No Stroke effect on this install — fall back to the mask region.
          set(colorOf(fx(layer, 'ADBE Fill', 'Matte')), WHITE);
        }
      }

      spreadControl(layer, p.geometry);
      return layer;
    }
  };

  /* ====================================================================== */
  /* letter — a text layer already in the timeline                          */
  /* ====================================================================== */

  var LETTER_REASON = 'Select a text layer first — its type becomes the gradient, ' +
                      'and its edges become the volume. Any layer with an alpha works.';

  /**
   * The layer whose alpha the gradient takes. A text layer is what this is for
   * and what wins when several are selected, but the pipeline only ever reads
   * an alpha channel, so a shape layer or a masked solid works exactly as well
   * — which is why the source is a layer, not a text layer, in the code.
   */
  function pickLayer(comp) {
    var t = U.pickText(comp);
    if (t) return t;
    var layers = U.selectedLayers(comp);
    for (var i = 0; i < layers.length; i++) {
      // A null has no pixels, so it has no alpha to take.
      try { if (!layers[i].nullLayer) return layers[i]; } catch (e) { return layers[i]; }
    }
    return null;
  }

  var letter = {
    id: 'letter',
    label: 'Letter',

    probe: function (comp) {
      var l = pickLayer(comp);
      if (!l) return { valid: false, reason: LETTER_REASON };
      var out = { valid: true, reason: '', detail: '' };
      try { out.detail = l.name; } catch (e) {}
      // A text layer can hand the preview its actual words; nothing else can,
      // and the panel is told which case it is looking at.
      out.type = U.isText(l) ? U.textOf(comp, l) : null;
      out.isText = !!out.type;
      return out;
    },

    read: function (comp) {
      var l = pickLayer(comp);
      if (!l) throw new Error(LETTER_REASON);
      return { kind: 'letter', layer: l, label: l.name, isText: U.isText(l) };
    },

    /**
     * The matte stays crisp. Softening it would blur the type itself, and the
     * volume this mode is for lives *inside* the shape, not on its silhouette.
     */
    matte: function (comp, source) {
      var layer = copyOf(source.layer, uniqueName(comp, 'GF MATTE — Letter'));
      // Fill only guarantees the alpha is opaque white, so a coloured or
      // semi-transparent original still mattes cleanly.
      set(colorOf(fx(layer, 'ADBE Fill', 'Matte')), WHITE);
      return layer;
    },

    /**
     * Volume, out of two stock effects and nothing else.
     *
     * A height field is the layer's own alpha, filled white and blurred by
     * **Softness** — flat in the middle of a glyph, falling off across its
     * edge, so its slope is steepest exactly where the edge is. That is the
     * whole trick: CC Glass differentiates that field into surface normals
     * internally, which is where the bevel comes from.
     *
     *   Surface  the normals light the gradient — diffuse and specular, so the
     *            edges catch and the middle stays flat. Reads as embossed type.
     *   Refract  the normals push the gradient instead — Displacement Map for
     *            the broad bend, CC Glass for the sharp lip at the edge. Reads
     *            as type cut out of glass.
     *
     * Depth drives both. The height layer is switched off: After Effects reads
     * a map layer whether or not it is visible, and a white slab of type on top
     * of the gradient is not what anyone asked for.
     */
    shade: function (comp, source, p, placed) {
      var geom = p.geometry || {};
      var depth = geom.depth == null ? 55 : geom.depth;
      var refract = geom.style === 'refract';

      var name = uniqueName(comp, 'GF HEIGHT — Letter');
      var height = copyOf(source.layer, name);
      set(colorOf(fx(height, 'ADBE Fill', 'Height')), WHITE);

      U.slider(height, 'Depth', depth);
      U.slider(height, 'Softness', geom.softness == null ? 30 : geom.softness);
      var blur = U.fastBlur(height, 8,
        'thisComp.height * (0.002 + effect("Softness")(1)/100 * 0.045)');
      try { blur.name = 'Softness blur'; } catch (e) {}
      height.enabled = false;
      try { height.moveToEnd(); } catch (e) {}

      var R = function (which) {
        return 'thisComp.layer("' + name + '").effect("' + which + '")(1)';
      };
      var D = R('Depth');

      // Refract's broad bend: the height itself pushes the gradient sideways.
      if (refract) {
        var dm = fx(placed, 'ADBE Displacement Map', 'Refraction');
        if (dm) {
          set(firstOfType(dm, PropertyValueType.LAYER_INDEX), heightIndex(comp, height));
          set(prop(dm, 2, 'ADBE Displacement Map-0002'), 4);        // horizontal ← luminance
          expr(prop(dm, 3, 'ADBE Displacement Map-0003'),
               D + '/100 * thisComp.height * 0.10');
          set(prop(dm, 4, 'ADBE Displacement Map-0004'), 4);        // vertical ← luminance
          expr(prop(dm, 5, 'ADBE Displacement Map-0005'),
               D + '/100 * thisComp.height * 0.10');
          set(prop(dm, 7, 'ADBE Displacement Map-0007'), 2);        // repeat edge pixels
        }
      }

      var glass = fx(placed, 'CC Glass', refract ? 'Refract' : 'Surface');
      if (!glass) return height;

      set(firstOfType(glass, PropertyValueType.LAYER_INDEX), heightIndex(comp, height));
      set(byName(glass, 'Property'), 5);                             // read Lightness
      expr(byName(glass, 'Softness'),
           'thisComp.layer("' + name + '").effect("Softness")(1)/100 * 12');
      expr(byName(glass, 'Height'), D + '/100 * ' + (refract ? '45' : '80'));
      expr(byName(glass, 'Displacement'), D + '/100 * ' + (refract ? '70' : '12'));

      // Shading: Surface lights the edges, Refract mostly bends and only
      // catches a thin specular lip so the glass reads as glass.
      set(byName(glass, 'Light Intensity'), refract ? 62 : 100);
      set(byName(glass, 'Light Angle'), -60);
      set(byName(glass, 'Light Height'), refract ? 40 : 62);
      set(byName(glass, 'Ambient'), refract ? 78 : 52);
      set(byName(glass, 'Diffuse'), refract ? 22 : 58);
      set(byName(glass, 'Specular'), refract ? 26 : 42);
      set(byName(glass, 'Roughness'), refract ? 0.02 : 0.08);
      set(byName(glass, 'Metal'), refract ? 18 : 44);

      return height;
    }
  };

  /** CC Glass and Displacement Map both want the map layer's index. */
  function heightIndex(comp, layer) {
    try { return layer.index; } catch (e) { return 1; }
  }

  /**
   * Cycore effects are addressed by their visible parameter names — they have
   * no stable ADBE-style match names — so this is a name lookup with a
   * depth-first walk, and a miss costs one parameter rather than the build.
   */
  function byName(effect, label) {
    if (!effect) return null;
    var all = leaves(effect);
    for (var i = 0; i < all.length; i++) {
      try { if (all[i].name === label) return all[i]; } catch (e) {}
    }
    return null;
  }

  /* ====================================================================== */

  var SOURCES = { mesh: mesh, curve: curve, letter: letter };

  function sourceFor(mode) {
    return SOURCES[mode] || mesh;
  }

  /**
   * What every tab would say right now, as JSON — the panel asks for this on a
   * timer so a disabled Create can always name the thing that is missing,
   * rather than failing silently when it is pressed.
   */
  function probeAll(want) {
    want = want || {};
    var comp = null;
    try { comp = GF.U.activeComp(); } catch (e) {}
    var out = ['{"comp":' + (comp ? U.quote(comp.name) : 'null')];
    for (var id in SOURCES) {
      if (!SOURCES.hasOwnProperty(id)) continue;
      var r = comp ? SOURCES[id].probe(comp, want)
                   : { valid: false, reason: 'Open a composition first, then try again.' };
      var body = '"valid":' + (r.valid ? 'true' : 'false') +
                 ',"reason":' + U.quote(r.reason) +
                 ',"detail":' + U.quote(r.detail || '');

      // The Path ▾ list is small and always sent; the path's points are only
      // sent while the Curve tab is open, because that is the only time the
      // preview has anything to draw with them.
      if (id === 'curve' && r.paths) {
        var geom = (r.pick && want.mode === 'curve')
          ? U.maskNodes(comp, r.pick.layer, r.pick.mask) : null;
        // A mask with no path at all cannot be built from, whatever the list says.
        if (r.pick && want.mode === 'curve' && !geom) {
          body = '"valid":false,"reason":' +
                 U.quote('“' + r.pick.label + '” has no path yet — draw one, or pick another.') +
                 ',"detail":' + U.quote(r.detail || '');
        }
        var list = [];
        for (var i = 0; i < r.paths.length; i++) {
          list.push('{"id":' + U.quote(r.paths[i].id) + ',"label":' + U.quote(r.paths[i].label) + '}');
        }
        body += ',"paths":[' + list.join(',') + ']';
        if (r.pick) body += ',"id":' + U.quote(r.pick.id);
        if (geom) {
          body += ',"closed":' + (geom.closed ? 'true' : 'false') +
                  ',"nodes":' + U.nodesJSON(geom.nodes);
        }
      }
      // Letter hands the preview the words that are actually in the comp — the
      // panel cannot read glyph outlines, but it can at least set the same type.
      if (id === 'letter') {
        body += ',"isText":' + (r.isText ? 'true' : 'false');
        if (r.type) {
          body += ',"type":{"text":' + U.quote(r.type.text) +
                  ',"font":' + U.quote(r.type.font) +
                  ',"size":' + (Math.round(r.type.size * 100) / 100) +
                  ',"tracking":' + (Math.round(r.type.tracking * 100) / 100) + '}';
        } else {
          body += ',"type":null';
        }
      }
      out.push('"' + id + '":{' + body + '}');
    }
    return out.join(',') + '}';
  }

  return {
    sources: SOURCES,
    sourceFor: sourceFor,
    probeAll: probeAll
  };
})();
