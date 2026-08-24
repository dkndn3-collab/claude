/**
 * chart.jsx — a procedural chart that builds itself in (§24, §30).
 *
 * Bars: one shape layer each, anchored at its base so a Scale-Y keyframe pair
 * grows it up from the axis, staggered across the series. Line / Area: a single
 * path with a Trim-Paths draw-on. The data is generated from a seed so the shape
 * is reproducible and the whole thing stays a real, editable AE composition —
 * no baked frames.
 */

$.global.AMUI = $.global.AMUI || {};
AMUI.Components = AMUI.Components || {};

AMUI.Components.chart = (function () {
  var U = AMUI.U, T = AMUI.T;

  function rng(seed) {
    var s = (seed || 1) * 9301 + 49297;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function series(n, seed) {
    var r = rng(seed), out = [], prev = 0.5;
    for (var i = 0; i < n; i++) {
      prev = Math.max(0.18, Math.min(1, prev + (r() - 0.45) * 0.6));
      out.push(prev);
    }
    return out;
  }

  function create(p) {
    var parent = U.activeComp();
    var pal = T.palette(p.palette);
    var kind = p.chartKind || 'bar';
    var W = p.width, H = p.height;
    var n = Math.max(3, Math.round(p.bars || 7));
    var data = series(n, p.seed || 4);

    var comp = U.makeComp('CHART', W + 200, H + 160, parent);
    var ctrl = U.controller(comp);
    U.slider(ctrl, 'Width', W);
    U.slider(ctrl, 'Height', H);
    U.colorControl(ctrl, 'Accent', pal.accent);

    var padX = 40, padTop = 30, padBot = 34;
    var x0 = (comp.width - W) / 2 + padX;
    var x1 = (comp.width + W) / 2 - padX;
    var yBase = (comp.height + H) / 2 - padBot;
    var chH = H - padTop - padBot;
    var chW = x1 - x0;

    /* baseline ---------------------------------------------------------- */
    U.roundRect(comp, { name: 'Axis', size: [chW, 2], round: 1, fill: pal.text,
      fillOpacity: 16, positionExpr: '[' + ((x0 + x1) / 2) + ', ' + yBase + ']' });

    var anim = AMUI.Motion.resolve((p.anim && p.anim.preset) || 'gentleSpring', p.anim);
    var t0 = parent.time + (anim.delay || 0);
    var perStep = Math.max(0.03, anim.stagger || 0.06);
    var dur = Math.max(0.2, anim.duration);

    if (kind === 'bar') {
      var gap = chW / n;
      var bw = gap * 0.6;
      for (var i = 0; i < n; i++) {
        var barH = Math.max(4, chH * data[i]);
        var bx = x0 + gap * i + gap / 2;
        var bar = U.roundRect(comp, {
          name: 'Bar ' + (i + 1),
          size: [bw, barH],
          round: Math.min(bw / 2, 6),
          fill: pal.accent,
          fillExpr: U.colorExpr('Accent')
        });
        // Anchor the rect above the layer origin so the origin sits on the axis;
        // scaling the layer's Y then grows the bar up from the baseline.
        bar.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group')
           .property(1).property('ADBE Vector Rect Position').setValue([0, -barH / 2]);
        bar.property('ADBE Transform Group').property('ADBE Position').setValue([bx, yBase]);
        var sc = bar.property('ADBE Transform Group').property('ADBE Scale');
        var ts = t0 + i * perStep;
        U.setKeys(sc, [ts, ts + dur], [[100, 0], [100, 100]]);
        if (anim.spring) { U.ease(sc, 1, 20, 80); U.ease(sc, 2, 10, 20); sc.expression = AMUI.Motion.springExpression(anim); }
        else U.easeBezier(sc, anim.easing);
      }
    } else {
      // line / area path through the points
      var verts = [];
      for (var j = 0; j < n; j++) verts.push([x0 + chW * (j / (n - 1)), yBase - chH * data[j]]);

      if (kind === 'area') {
        var poly = comp.layers.addShape();
        poly.name = 'Area';
        var ag = poly.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group').property('ADBE Vectors Group');
        var ashape = ag.addProperty('ADBE Vector Shape - Group').property('ADBE Vector Shape');
        var averts = verts.concat([[x1, yBase], [x0, yBase]]);
        var apath = new Shape(); apath.vertices = averts; apath.closed = true;
        ashape.setValue(apath);
        var afill = ag.addProperty('ADBE Vector Graphic - Fill');
        afill.property('ADBE Vector Fill Color').setValue(U.rgba(pal.accent));
        afill.property('ADBE Vector Fill Color').expression = U.colorExpr('Accent');
        afill.property('ADBE Vector Fill Opacity').setValue(20);
        var aop = poly.property('ADBE Transform Group').property('ADBE Opacity');
        U.setKeys(aop, [t0 + dur * 0.3, t0 + dur], [0, 100]); U.easeBezier(aop, anim.easing);
      }

      var line = comp.layers.addShape();
      line.name = 'Line';
      var lg = line.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group').property('ADBE Vectors Group');
      var lshape = lg.addProperty('ADBE Vector Shape - Group').property('ADBE Vector Shape');
      var lpath = new Shape(); lpath.vertices = verts; lpath.closed = false;
      lshape.setValue(lpath);
      var lstroke = lg.addProperty('ADBE Vector Graphic - Stroke');
      lstroke.property('ADBE Vector Stroke Color').setValue(U.rgba(pal.accent));
      lstroke.property('ADBE Vector Stroke Color').expression = U.colorExpr('Accent');
      lstroke.property('ADBE Vector Stroke Width').setValue(Math.max(3, H * 0.012));
      try { lstroke.property('ADBE Vector Stroke Line Cap').setValue(2); } catch (e) {}
      try { lstroke.property('ADBE Vector Stroke Line Join').setValue(2); } catch (e) {}
      // draw-on with Trim Paths
      var trim = line.property('ADBE Root Vectors Group').addProperty('ADBE Vector Filter - Trim');
      var end = trim.property('ADBE Vector Trim End');
      U.setKeys(end, [t0, t0 + dur], [0, 100]); U.easeBezier(end, anim.easing);
    }

    ctrl.moveToBeginning();

    var layer = parent.layers.add(comp);
    layer.name = comp.name;
    layer.property('ADBE Transform Group').property('ADBE Position').setValue([parent.width / 2, parent.height / 2]);
    layer.selected = true;
    return comp.name + ' added';
  }

  return { create: create };
})();
