/**
 * actions.jsx — the small operations that work on whatever is selected.
 */

$.global.AMUI = $.global.AMUI || {};

AMUI.Actions = (function () {
  var U = AMUI.U;

  function selection(min) {
    var comp = U.activeComp();
    var layers = comp.selectedLayers;
    if (layers.length < (min || 1)) {
      throw new Error(min > 1
        ? 'Select ' + min + ' or more layers first.'
        : 'Select a layer first.');
    }
    return { comp: comp, layers: layers };
  }

  /** Frosts everything behind the selected layer, clipped to its own alpha. */
  function addGlass() {
    var s = selection(1);
    var comp = s.comp;
    var count = 0;

    for (var i = 0; i < s.layers.length; i++) {
      var layer = s.layers[i];
      if (layer.locked || layer.nullLayer) continue;

      var matte = layer.duplicate();
      matte.moveAfter(layer);
      matte.name = layer.name + ' — Glass Matte';

      var blur = comp.layers.addSolid([0, 0, 0], layer.name + ' — Glass Blur',
                                      comp.width, comp.height, 1);
      blur.adjustmentLayer = true;
      blur.moveAfter(matte);
      U.fastBlur(blur, 32);
      U.alphaMatte(blur, matte);
      count++;
    }
    if (!count) throw new Error('Nothing to frost — pick a visible layer.');
    return count === 1 ? 'Glass added' : 'Glass added to ' + count + ' layers';
  }

  function addShadow() {
    var s = selection(1);
    for (var i = 0; i < s.layers.length; i++) {
      if (s.layers[i].locked) continue;
      U.dropShadow(s.layers[i], { opacity: 90, direction: 180, distance: 16, softness: 52 });
    }
    return 'Shadow added';
  }

  function center() {
    var s = selection(1);
    var cx = s.comp.width / 2, cy = s.comp.height / 2;
    for (var i = 0; i < s.layers.length; i++) {
      var pos = s.layers[i].property('ADBE Transform Group').property('ADBE Position');
      if (pos.numKeys > 0 || pos.expression) continue;   // don't clobber animation
      var v = pos.value;
      pos.setValue(v.length > 2 ? [cx, cy, v[2]] : [cx, cy]);
    }
    return 'Centred in comp';
  }

  function precompose() {
    var s = selection(1);
    var indices = [];
    for (var i = 0; i < s.layers.length; i++) indices.push(s.layers[i].index);
    var name = U.uniqueName(s.layers.length === 1 ? s.layers[0].name + ' Group' : 'Group');
    s.comp.layers.precompose(indices, name, true);
    return 'Precomposed as ' + name;
  }

  function run(id) {
    switch (id) {
      case 'addGlass':   return addGlass();
      case 'addShadow':  return addShadow();
      case 'center':     return center();
      case 'stagger':    return AMUI.Motion.stagger(2);
      case 'precompose': return precompose();
      default: throw new Error('Unknown action: ' + id);
    }
  }

  return { run: run };
})();
