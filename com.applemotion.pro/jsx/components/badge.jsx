/**
 * badge.jsx — a small status pill. Variant only swaps the fill (solid, glass, or
 * a semantic colour) and the corner style; the label auto-sizes the pill.
 */

$.global.AMUI = $.global.AMUI || {};
AMUI.Components = AMUI.Components || {};

AMUI.Components.badge = (function () {
  var U = AMUI.U, T = AMUI.T;

  function create(p) {
    var parent = U.activeComp();
    var pal = T.palette(p.palette);
    var v = p.variant || 'pill';
    var text = String(p.label == null ? 'New' : p.label).toUpperCase();

    var color = pal.accent;
    if (v === 'success') color = T.semantic.success;
    else if (v === 'error') color = T.semantic.error;
    else if (v === 'warning') color = T.semantic.warning;

    var h = 52, w = Math.max(h + 20, 60 + text.length * 20);
    var square = v === 'square';
    var glass = v === 'glass';
    var r = square ? 12 : h / 2;

    var comp = U.makeComp('BADGE', w + 200, h + 160, parent);
    var ctrl = U.controller(comp);
    U.slider(ctrl, 'Radius', r);
    U.colorControl(ctrl, 'Accent', color);

    var sizeExpr = '[' + w + ', ' + h + ']';
    var roundExpr = 'Math.min(' + U.ref('Radius') + ', ' + (h / 2) + ')';
    var posExpr = '[thisComp.width/2, thisComp.height/2]';

    var fg = '#FFFFFF';
    if (glass) {
      AMUI.Glass.build(comp, { sizeExpr: sizeExpr, roundExpr: roundExpr, preset: 'clear', palette: p.palette,
        positionExpr: posExpr });
      fg = pal.dark ? '#FFFFFF' : '#1C1C1E';
    } else {
      U.roundRect(comp, { name: 'Fill', sizeExpr: sizeExpr, roundExpr: roundExpr,
        fill: color, fillExpr: U.colorExpr('Accent'), positionExpr: posExpr });
    }

    U.text(comp, { name: 'Label', text: text, size: h * 0.42, weight: 'bold', tracking: 10,
      color: fg, align: 'center', positionExpr: '[thisComp.width/2, thisComp.height/2 + ' + (h * 0.15) + ']' });

    ctrl.moveToBeginning();
    var layer = parent.layers.add(comp);
    layer.name = comp.name;
    if (glass) layer.collapseTransformation = true;
    layer.property('ADBE Transform Group').property('ADBE Position').setValue([parent.width / 2, parent.height / 2]);

    AMUI.Motion.animateLayer(layer, parent, p.anim);
    layer.selected = true;
    return comp.name + ' added';
  }

  return { create: create };
})();
