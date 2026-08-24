/**
 * glass.jsx
 *
 * Real glass, not a translucent fill: an adjustment layer blurs whatever sits
 * behind the component, an alpha matte confines that blur to the component's
 * silhouette, and a tint plus a hairline highlight sit on top.
 *
 * The component precomp is set to Collapse Transformations by the generator so
 * the adjustment layer reaches the layers underneath it in the parent comp.
 * Layers are added bottom-up — each new layer lands on top of the last.
 */

$.global.AMUI = $.global.AMUI || {};

AMUI.Glass = (function () {
  var U = AMUI.U, T = AMUI.T;

  /**
   * @param {CompItem} comp        component precomp
   * @param {Object}   o           { sizeExpr, roundExpr, preset, palette }
   * @returns {Object} the created layers
   */
  function build(comp, o) {
    var g = T.glassPreset(o.preset);
    var pal = T.palette(o.palette);
    var out = {};

    /* 1 — blur what's behind ------------------------------------------- */
    var blur = comp.layers.addSolid([0, 0, 0], 'Glass Blur', comp.width, comp.height, 1);
    blur.adjustmentLayer = true;
    U.fastBlur(blur, g.blur, U.ref('Blur'));
    // Real device glass lifts the saturation of what shows through it, so it
    // reads as living colour rather than flat grey. Lift = material saturation.
    if (g.saturation && g.saturation !== 100) {
      try {
        var hs = blur.property('ADBE Effect Parade').addProperty('ADBE HUE SATURATION');
        hs.name = 'Glass Vibrance';
        hs.property('ADBE HUE SATURATION-0004').setValue(g.saturation - 100); // Master Saturation
      } catch (e) { /* older AE without this matchName — skip, still looks fine */ }
    }
    out.blur = blur;

    /* 2 — clip it to the shape ----------------------------------------- */
    var matte = U.roundRect(comp, {
      name: 'Glass Matte',
      sizeExpr: o.sizeExpr,
      roundExpr: o.roundExpr,
      fill: '#FFFFFF',
      positionExpr: o.positionExpr
    });
    U.alphaMatte(blur, matte);
    out.matte = matte;

    /* 3 — tint ---------------------------------------------------------- */
    // Dark glass tints toward the surface colour; everything else lifts white.
    var tintColor = (o.preset === 'dark') ? pal.surface : '#FFFFFF';
    var tint = U.roundRect(comp, {
      name: 'Tint',
      sizeExpr: o.sizeExpr,
      roundExpr: o.roundExpr,
      fill: tintColor,
      fillOpacity: g.tintOpacity,
      positionExpr: o.positionExpr
    });
    out.tint = tint;

    /* 4 — edge light ---------------------------------------------------- */
    var highlight = U.roundRect(comp, {
      name: 'Highlight',
      sizeExpr: o.sizeExpr + ' - [2,2]',
      roundExpr: o.roundExpr,
      stroke: '#FFFFFF',
      strokeWidth: 2,
      strokeOpacity: g.border,
      positionExpr: o.positionExpr
    });
    out.highlight = highlight;

    return out;
  }

  return { build: build };
})();
