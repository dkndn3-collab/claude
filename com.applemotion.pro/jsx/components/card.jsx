/**
 * card.jsx — the glass card.
 *
 * Nothing is positioned with a baked pixel coordinate. Every layer reads Width,
 * Height and Padding off the CONTROLLER, so dragging one slider re-lays out the
 * whole card and the component stays editable after it's built.
 */

$.global.AMUI = $.global.AMUI || {};
AMUI.Components = AMUI.Components || {};

AMUI.Components.card = (function () {
  var U = AMUI.U, T = AMUI.T;

  /** Shared opening lines for every layout expression on this component. */
  var PRELUDE = [
    'w = ' + U.ref('Width') + ';',
    'h = ' + U.ref('Height') + ';',
    'p = ' + U.ref('Padding') + ';',
    'cx = thisComp.width / 2;',
    'cy = thisComp.height / 2;',
    'x0 = cx - w / 2 + p;',
    'y0 = cy - h / 2 + p;',
    'is = Math.min(64, h * 0.28);'
  ].join('\n') + '\n';

  function create(p) {
    var parent = U.activeComp();
    var pal = T.palette(p.palette);
    var glass = T.glassPreset(p.glassPreset);

    var comp = U.makeComp('CARD', p.width + 400, p.height + 320, parent);

    /* controller ------------------------------------------------------- */
    var ctrl = U.controller(comp);
    U.slider(ctrl, 'Width', p.width);
    U.slider(ctrl, 'Height', p.height);
    U.slider(ctrl, 'Radius', p.radius);
    U.slider(ctrl, 'Padding', p.padding);
    U.slider(ctrl, 'Blur', p.glass ? p.blur : 0);
    U.slider(ctrl, 'Shadow', p.shadow ? 100 : 0);
    U.colorControl(ctrl, 'Accent', pal.accent);

    var sizeExpr = '[' + U.ref('Width') + ', ' + U.ref('Height') + ']';
    var roundExpr = 'Math.min(' + U.ref('Radius') + ', Math.min(' +
                    U.ref('Width') + ', ' + U.ref('Height') + ') / 2)';

    /* shadow ----------------------------------------------------------- */
    if (p.shadow) {
      var shadow = U.roundRect(comp, {
        name: 'Shadow',
        sizeExpr: sizeExpr,
        roundExpr: roundExpr,
        fill: '#000000'
      });
      U.dropShadow(shadow, {
        opacity: 100, direction: 180, distance: 18, softness: 60,
        shadowOnly: true,
        opacityExpr: U.ref('Shadow') + ' * 1.2'
      });
    }

    /* surface ---------------------------------------------------------- */
    if (p.glass) {
      AMUI.Glass.build(comp, {
        sizeExpr: sizeExpr,
        roundExpr: roundExpr,
        preset: p.glassPreset,
        palette: p.palette
      });
    } else {
      U.roundRect(comp, {
        name: 'Background',
        sizeExpr: sizeExpr,
        roundExpr: roundExpr,
        fill: pal.surface
      });
    }

    /* content ---------------------------------------------------------- */
    if (p.icon) {
      U.roundRect(comp, {
        name: 'Icon',
        sizeExpr: PRELUDE + '[is, is]',
        roundExpr: PRELUDE + 'is * 0.28',
        fill: pal.accent,
        fillExpr: U.colorExpr('Accent'),
        positionExpr: PRELUDE + '[x0 + is / 2, y0 + is / 2]'
      });
    }

    var titleBaseline = p.icon ? 'y0 + is + 38' : 'y0 + 26';

    if (p.title) {
      U.text(comp, {
        name: 'Title',
        text: p.title,
        size: T.type.headline.size,
        weight: T.type.headline.weight,
        tracking: T.type.headline.tracking,
        color: pal.text,
        positionExpr: PRELUDE + '[x0, ' + titleBaseline + ']'
      });
    }

    if (p.subtitle) {
      U.text(comp, {
        name: 'Subtitle',
        text: p.subtitle,
        size: T.type.body.size,
        color: pal.text,
        opacity: 55,
        positionExpr: PRELUDE + '[x0, ' + titleBaseline + ' + 30]'
      });
    }

    if (p.value) {
      U.text(comp, {
        name: 'Value',
        text: p.value,
        size: T.type.numeric.size,
        weight: T.type.numeric.weight,
        tracking: T.type.numeric.tracking,
        color: pal.text,
        positionExpr: PRELUDE + '[x0, cy + h / 2 - p]'
      });
    }

    ctrl.moveToBeginning();

    /* place it in the user's comp -------------------------------------- */
    var layer = parent.layers.add(comp);
    layer.name = comp.name;
    if (p.glass) layer.collapseTransformation = true;   // lets the blur see through
    layer.property('ADBE Transform Group').property('ADBE Position')
         .setValue([parent.width / 2, parent.height / 2]);

    AMUI.Motion.animateLayer(layer, parent, p.anim);
    layer.selected = true;
    return comp.name + ' added';
  }

  return { create: create };
})();
