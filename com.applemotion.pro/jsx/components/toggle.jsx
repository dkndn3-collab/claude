/**
 * toggle.jsx — settings switch.
 *
 * One control, "On", runs from 0 to 1 and drives both the track colour and the
 * knob position. Animating the switch means keyframing that single value, which
 * is why it's a slider rather than a checkbox.
 */

$.global.AMUI = $.global.AMUI || {};
AMUI.Components = AMUI.Components || {};

AMUI.Components.toggle = (function () {
  var U = AMUI.U, T = AMUI.T;

  var RATIO = 0.6;    // track height as a fraction of track width

  var PRELUDE = [
    'w = ' + U.ref('Width') + ';',
    'h = w * ' + RATIO + ';',
    'on = ' + U.ref('On') + ';',
    'inset = h * 0.09;',
    'k = h - inset * 2;',
    'cx = thisComp.width / 2;',
    'cy = thisComp.height / 2;'
  ].join('\n') + '\n';

  function create(p) {
    var parent = U.activeComp();
    var pal = T.palette(p.palette);
    var height = p.size * RATIO;

    var comp = U.makeComp('TOGGLE', p.size + 360, height + 260, parent);

    var ctrl = U.controller(comp);
    U.slider(ctrl, 'Width', p.size);
    U.slider(ctrl, 'On', p.on ? 1 : 0);
    U.colorControl(ctrl, 'Accent', pal.accent);

    /* track ------------------------------------------------------------ */
    U.roundRect(comp, {
      name: 'Track',
      sizeExpr: PRELUDE + '[w, h]',
      roundExpr: PRELUDE + 'h / 2',
      fill: '#78788A',
      fillExpr: PRELUDE +
        'c = ' + U.ref('Accent') + ';\n' +
        'off = [0.47, 0.47, 0.5, 1];\n' +
        'mix = linear(on, 0, 1, off, [c[0], c[1], c[2], 1]);\n' +
        'mix.slice(0, value.length)',
      fillOpacityExpr: PRELUDE + 'linear(on, 0, 1, 55, 100)',
      positionExpr: PRELUDE + '[cx, cy]'
    });

    /* knob ------------------------------------------------------------- */
    U.circle(comp, {
      name: 'Knob',
      sizeExpr: PRELUDE + '[k, k]',
      fill: '#FFFFFF',
      positionExpr: PRELUDE +
        'x0 = cx - w / 2 + inset + k / 2;\n' +
        'x1 = cx + w / 2 - inset - k / 2;\n' +
        '[linear(on, 0, 1, x0, x1), cy]'
    });

    /* label ------------------------------------------------------------ */
    if (p.showLabel && p.label) {
      U.text(comp, {
        name: 'Label',
        text: p.label,
        size: Math.max(14, height * 0.52),
        weight: 'semibold',
        tracking: -10,
        color: pal.text,
        align: 'right',
        positionExpr: PRELUDE + '[cx - w / 2 - h * 0.5, cy + h * 0.18]'
      });
    }

    ctrl.moveToBeginning();

    /* the flip --------------------------------------------------------- */
    if (p.animate) {
      var onProp = ctrl.property('ADBE Effect Parade').property('On').property(1);
      var t0 = parent.time;
      onProp.setValueAtTime(t0, p.on ? 1 : 0);
      onProp.setValueAtTime(t0 + 0.42, p.on ? 0 : 1);
      U.appleEase(onProp);
    }

    var layer = parent.layers.add(comp);
    layer.name = comp.name;
    layer.property('ADBE Transform Group').property('ADBE Position')
         .setValue([parent.width / 2, parent.height / 2]);

    AMUI.Motion.animateLayer(layer, parent, p.anim);
    layer.selected = true;
    return comp.name + ' added';
  }

  return { create: create };
})();
