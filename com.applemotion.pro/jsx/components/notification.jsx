/**
 * notification.jsx — iOS push banner.
 *
 * Height is derived from width (banners keep a fixed proportion on device), so
 * the panel only exposes one size control and the layout can't drift off-spec.
 */

$.global.AMUI = $.global.AMUI || {};
AMUI.Components = AMUI.Components || {};

AMUI.Components.notification = (function () {
  var U = AMUI.U, T = AMUI.T;

  var RATIO = 0.24;   // banner height as a fraction of width

  var PRELUDE = [
    'w = ' + U.ref('Width') + ';',
    'h = w * ' + RATIO + ';',
    'cx = thisComp.width / 2;',
    'cy = thisComp.height / 2;',
    'p = h * 0.21;',
    'is = h * 0.58;',
    'x0 = cx - w / 2 + p;',
    'x1 = cx + w / 2 - p;',
    'tx = x0 + is + h * 0.17;'
  ].join('\n') + '\n';

  function create(p) {
    var parent = U.activeComp();
    var pal = T.palette(p.palette);
    var height = p.width * RATIO;

    var comp = U.makeComp('NOTIFICATION', p.width + 400, height + 320, parent);

    var ctrl = U.controller(comp);
    U.slider(ctrl, 'Width', p.width);
    U.slider(ctrl, 'Radius', p.radius);
    U.slider(ctrl, 'Blur', p.glass ? p.blur : 0);
    U.slider(ctrl, 'Shadow', p.shadow ? 100 : 0);
    U.colorControl(ctrl, 'Accent', pal.accent);

    var sizeExpr = 'w = ' + U.ref('Width') + ';\n[w, w * ' + RATIO + ']';
    var roundExpr = 'Math.min(' + U.ref('Radius') + ', ' + U.ref('Width') + ' * ' + (RATIO / 2) + ')';

    if (p.shadow) {
      var shadow = U.roundRect(comp, {
        name: 'Shadow',
        sizeExpr: sizeExpr,
        roundExpr: roundExpr,
        fill: '#000000'
      });
      U.dropShadow(shadow, {
        opacity: 100, direction: 180, distance: 14, softness: 48,
        shadowOnly: true,
        opacityExpr: U.ref('Shadow') + ' * 1.1'
      });
    }

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

    /* app icon --------------------------------------------------------- */
    U.roundRect(comp, {
      name: 'App Icon',
      sizeExpr: PRELUDE + '[is, is]',
      roundExpr: PRELUDE + 'is * 0.26',
      fill: pal.accent,
      fillExpr: U.colorExpr('Accent'),
      positionExpr: PRELUDE + '[x0 + is / 2, cy]'
    });

    /* text ------------------------------------------------------------- */
    U.text(comp, {
      name: 'App Name',
      text: String(p.appName || '').toUpperCase(),
      size: T.type.footnote.size,
      weight: 'semibold',
      tracking: T.type.footnote.tracking,
      color: pal.text,
      opacity: 55,
      positionExpr: PRELUDE + '[tx, cy - h * 0.16]'
    });

    U.text(comp, {
      name: 'Title',
      text: p.title,
      size: T.type.headline.size * 0.8,
      weight: 'semibold',
      tracking: T.type.headline.tracking,
      color: pal.text,
      positionExpr: PRELUDE + '[tx, cy + h * 0.06]'
    });

    U.text(comp, {
      name: 'Message',
      text: p.message,
      size: T.type.body.size * 0.85,
      color: pal.text,
      opacity: 75,
      positionExpr: PRELUDE + '[tx, cy + h * 0.28]'
    });

    U.text(comp, {
      name: 'Time',
      text: p.time,
      size: T.type.footnote.size,
      color: pal.text,
      opacity: 45,
      align: 'right',
      positionExpr: PRELUDE + '[x1, cy - h * 0.16]'
    });

    ctrl.moveToBeginning();

    var layer = parent.layers.add(comp);
    layer.name = comp.name;
    if (p.glass) layer.collapseTransformation = true;
    layer.property('ADBE Transform Group').property('ADBE Position')
         .setValue([parent.width / 2, parent.height * 0.22]);

    layer.selected = true;
    return comp.name + ' added';
  }

  return { create: create };
})();
