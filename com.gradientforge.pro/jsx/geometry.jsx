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

  var LETTER_REASON = 'Select a text layer first — the gradient fills the type you already have.';

  var letter = {
    id: 'letter',
    label: 'Letter',

    probe: function (comp) {
      var t = U.pickText(comp);
      if (!t) return { valid: false, reason: LETTER_REASON };
      var name = '';
      try { name = t.name; } catch (e) {}
      return { valid: true, reason: '', detail: name };
    },

    read: function (comp) {
      var t = U.pickText(comp);
      if (!t) throw new Error(LETTER_REASON);
      return { kind: 'letter', layer: t, label: t.name };
    },

    matte: function (comp, source, p) {
      var layer = copyOf(source.layer, 'GF MATTE — Letter');
      // The glyphs' own alpha is the matte; Fill only guarantees it is opaque
      // white, so a coloured or semi-transparent original still mattes cleanly.
      set(colorOf(fx(layer, 'ADBE Fill', 'Matte')), WHITE);
      spreadControl(layer, p.geometry);
      return layer;
    }
  };

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
