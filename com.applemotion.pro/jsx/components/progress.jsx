/**
 * progress.jsx — bar or ring meter that fills to its value as it animates in.
 *
 * The fill is driven off a CONTROLLER "Value" (0–100). A bar grows from the left
 * by scaling a left-anchored fill; a ring draws on with Trim Paths. Both stay
 * editable — drag Value afterward and the fill (and its animation target) follow.
 */

$.global.AMUI = $.global.AMUI || {};
AMUI.Components = AMUI.Components || {};

AMUI.Components.progress = (function () {
  var U = AMUI.U, T = AMUI.T;

  function create(p) {
    var parent = U.activeComp();
    var pal = T.palette(p.palette);
    var value = Math.max(0, Math.min(100, p.value == null ? 68 : p.value));
    var ring = p.variant === 'ring';
    var anim = AMUI.Motion.resolve((p.anim && p.anim.preset) || 'gentleSpring', p.anim);
    var t0 = parent.time + (anim.delay || 0);
    var dur = Math.max(0.2, anim.duration);

    var comp, ctrl;

    if (ring) {
      var d = 320, sw = 34;
      comp = U.makeComp('PROGRESS', d + 200, d + 200, parent);
      ctrl = U.controller(comp);
      U.slider(ctrl, 'Value', value);
      U.colorControl(ctrl, 'Accent', pal.accent);
      var cx = comp.width / 2, cy = comp.height / 2, rad = d / 2;

      var track = U.circle(comp, { name: 'Ring Track', size: [d, d], positionExpr: '[' + cx + ',' + cy + ']' });
      strokeOnly(track, pal.dark ? '#48484A' : '#C7C7CC', sw, 40);

      var val = U.circle(comp, { name: 'Ring Value', size: [d, d], positionExpr: '[' + cx + ',' + cy + ']' });
      strokeOnly(val, pal.accent, sw, 100);
      val.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group')
         .property('ADBE Vector Graphic - Stroke').property('ADBE Vector Stroke Color').expression = U.colorExpr('Accent');
      val.property('ADBE Transform Group').property('ADBE Rotation').setValue(-90);
      var trim = val.property('ADBE Root Vectors Group').addProperty('ADBE Vector Filter - Trim');
      var end = trim.property('ADBE Vector Trim End');
      end.expression = U.ref('Value');           // resting value tracks the controller
      U.setKeys(end, [t0, t0 + dur], [0, value]); // animate up to it
      if (anim.spring) { U.ease(end, 1, 20, 80); U.ease(end, 2, 10, 20); }
      else U.easeBezier(end, anim.easing);

      U.text(comp, { name: 'Label', text: Math.round(value) + '%', size: d * 0.22, weight: 'bold',
        tracking: -20, color: pal.text, align: 'center', positionExpr: '[' + cx + ',' + (cy + d * 0.08) + ']' });

    } else {
      var W = p.width, h = 18;
      comp = U.makeComp('PROGRESS', W + 200, h + 200, parent);
      ctrl = U.controller(comp);
      U.slider(ctrl, 'Width', W);
      U.slider(ctrl, 'Value', value);
      U.colorControl(ctrl, 'Accent', pal.accent);
      var midY = comp.height / 2, xL = (comp.width - W) / 2;

      U.roundRect(comp, { name: 'Track', sizeExpr: '[' + U.ref('Width') + ', ' + h + ']', round: h / 2,
        fill: pal.dark ? '#48484A' : '#C7C7CC', fillOpacity: 40, positionExpr: '[' + (comp.width / 2) + ',' + midY + ']' });

      var fill = U.roundRect(comp, { name: 'Fill', sizeExpr: '[' + U.ref('Width') + ', ' + h + ']', round: h / 2,
        fill: pal.accent, fillExpr: U.colorExpr('Accent') });
      // Left-anchor the fill: rect offset right of the layer origin, origin at xL.
      fill.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group')
          .property(1).property('ADBE Vector Rect Position').expression = '[' + U.ref('Width') + ' / 2, 0]';
      fill.property('ADBE Transform Group').property('ADBE Position').setValue([xL, midY]);
      var sx = fill.property('ADBE Transform Group').property('ADBE Scale');
      sx.expression = 's = ' + U.ref('Value') + ' / 100; [s * 100, 100]';
      U.setKeys(sx, [t0, t0 + dur], [[0, 100], [value, 100]]);
      if (anim.spring) { U.ease(sx, 1, 20, 80); U.ease(sx, 2, 10, 20); }
      else U.easeBezier(sx, anim.easing);
    }

    ctrl.moveToBeginning();
    var layer = parent.layers.add(comp);
    layer.name = comp.name;
    layer.property('ADBE Transform Group').property('ADBE Position').setValue([parent.width / 2, parent.height / 2]);
    layer.selected = true;
    return comp.name + ' added';
  }

  // Strip the fill a circle() added and give the layer a centred stroke ring.
  function strokeOnly(layer, hex, width, opacity) {
    var vectors = layer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group');
    try { vectors.property('ADBE Vector Graphic - Fill').remove(); } catch (e) {}
    var st = vectors.addProperty('ADBE Vector Graphic - Stroke');
    st.property('ADBE Vector Stroke Color').setValue(AMUI.U.rgba(hex));
    st.property('ADBE Vector Stroke Width').setValue(width);
    st.property('ADBE Vector Stroke Opacity').setValue(opacity);
    try { st.property('ADBE Vector Stroke Line Cap').setValue(2); } catch (e) {}
  }

  return { create: create };
})();
