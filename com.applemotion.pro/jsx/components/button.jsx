/**
 * button.jsx — one shared button, seven variants (§26).
 *
 * The variant only changes fill / stroke / radius, never the structure: a
 * CONTROLLER carries Width, Height, Radius and Accent, and the shape and label
 * read off it, so every variant stays editable and on-system after it's built.
 */

$.global.AMUI = $.global.AMUI || {};
AMUI.Components = AMUI.Components || {};

AMUI.Components.button = (function () {
  var U = AMUI.U, T = AMUI.T;

  function create(p) {
    var parent = U.activeComp();
    var pal = T.palette(p.palette);
    var v = p.variant || 'primary';
    var isIcon = v === 'icon';
    var w = isIcon ? p.height : p.width;

    var comp = U.makeComp('BUTTON', w + 300, p.height + 240, parent);

    var ctrl = U.controller(comp);
    U.slider(ctrl, 'Width', w);
    U.slider(ctrl, 'Height', p.height);
    U.slider(ctrl, 'Radius', (v === 'pill' || v === 'floating') ? p.height / 2 : p.radius);
    U.colorControl(ctrl, 'Accent', pal.accent);

    var sizeExpr = '[' + U.ref('Width') + ', ' + U.ref('Height') + ']';
    var roundExpr = 'Math.min(' + U.ref('Radius') + ', ' + U.ref('Height') + ' / 2)';

    /* shadow (floating / glass) --------------------------------------- */
    if (p.shadow || v === 'floating') {
      var sh = U.roundRect(comp, { name: 'Shadow', sizeExpr: sizeExpr, roundExpr: roundExpr, fill: '#000000' });
      U.dropShadow(sh, { opacity: 100, direction: 180, distance: v === 'floating' ? 22 : 12, softness: v === 'floating' ? 64 : 40, shadowOnly: true });
    }

    /* surface --------------------------------------------------------- */
    var fg = '#FFFFFF';
    if (v === 'glass') {
      AMUI.Glass.build(comp, { sizeExpr: sizeExpr, roundExpr: roundExpr, preset: p.glassPreset || 'clear', palette: p.palette });
      fg = pal.dark ? '#FFFFFF' : '#1C1C1E';
    } else if (v === 'secondary') {
      U.roundRect(comp, { name: 'Background', sizeExpr: sizeExpr, roundExpr: roundExpr, fill: '#808088', fillOpacity: 24 });
      fg = pal.accent;
    } else if (v === 'ghost') {
      U.roundRect(comp, { name: 'Outline', sizeExpr: sizeExpr, roundExpr: roundExpr,
        stroke: pal.accent, strokeWidth: 2, fillExpr: null });
      fg = pal.accent;
    } else { // primary, pill, floating, icon
      U.roundRect(comp, { name: 'Fill', sizeExpr: sizeExpr, roundExpr: roundExpr,
        fill: pal.accent, fillExpr: U.colorExpr('Accent') });
      fg = '#FFFFFF';
    }

    /* label / glyph --------------------------------------------------- */
    if (isIcon) {
      U.text(comp, { name: 'Glyph', text: '+', size: p.height * 0.5, weight: 'semibold',
        color: fg, align: 'center', positionExpr: '[thisComp.width/2, thisComp.height/2 + ' + (p.height * 0.18) + ']' });
    } else {
      U.text(comp, {
        name: 'Label', text: p.label || 'Button',
        size: Math.max(16, p.height * 0.34), weight: 'semibold', tracking: -6,
        color: fg, align: 'center',
        positionExpr: '[thisComp.width/2, thisComp.height/2 + ' + (p.height * 0.12) + ']'
      });
    }

    ctrl.moveToBeginning();

    var layer = parent.layers.add(comp);
    layer.name = comp.name;
    if (v === 'glass') layer.collapseTransformation = true;
    layer.property('ADBE Transform Group').property('ADBE Position').setValue([parent.width / 2, parent.height / 2]);

    AMUI.Motion.animateLayer(layer, parent, p.anim);
    layer.selected = true;
    return comp.name + ' added';
  }

  return { create: create };
})();
