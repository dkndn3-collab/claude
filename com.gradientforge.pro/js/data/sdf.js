/**
 * sdf.js — signed distance fields, on the GPU.
 *
 * One pipeline serves every geometry mode. A mode only decides what gets
 * rasterised; everything downstream is identical:
 *
 *   geometry → Canvas2D raster → seed pass → jump flood → SDF texture
 *
 * The distance transform is **jump flooding** (Rong & Tan): log2(N) passes,
 * each one looking at nine neighbours a halving step apart and keeping the
 * nearest boundary seed found so far. A CPU distance transform would be
 * correct and far too slow to keep the panel interactive.
 *
 * The field is rebuilt only when the geometry signature changes. Animation
 * never rebuilds it — the warp moves the *sample coordinate*, not the shape.
 *
 * Nothing is loaded from a file. The raster is drawn in-session from vector
 * geometry, which is why this does not break the zero-asset rule.
 *
 * Encoding, WebGL1-safe (no float textures required):
 *   seeds : R,G = seed x · 16 bit    B,A = seed y · 16 bit
 *           x = 1.0 exactly means "no seed yet"
 *   field : R,G = signed distance · 16 bit, in units of frame height,
 *                 mapped through d * 0.25 + 0.5 so ±2 heights fit
 *           B   = reserved for the along-the-boundary coordinate (step 2)
 *           A   = reserved for the glyph id (Letter mode)
 */
(function (global) {
  'use strict';

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUV;',
    'void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  /* ---- shared GLSL ------------------------------------------------------ */

  var PACK = [
    'vec2 pack16(float v){',
    '  v = clamp(v, 0.0, 1.0);',
    '  float hi = floor(v * 255.0);',
    '  float lo = floor((v * 255.0 - hi) * 255.0);',
    '  return vec2(hi, lo) / 255.0;',
    '}',
    'float unpack16(vec2 c){ return c.x + c.y / 255.0; }',
    'bool hasSeed(vec4 s){ return !(s.r > 0.999 && s.g > 0.999); }'
  ].join('\n');

  /**
   * Seed pass. A pixel is a boundary pixel when coverage changes across it.
   * The seed is then nudged along the coverage gradient to where coverage
   * would be exactly 0.5 — sub-pixel placement from the antialiased raster,
   * which is most of what keeps the finished field smooth.
   */
  var SEED = [
    'precision highp float;',
    'varying vec2 vUV;',
    'uniform sampler2D uCov;',
    'uniform sampler2D uParam;',
    'uniform vec2 uTexel;',
    'uniform float uOpen;',
    PACK,
    'void main(){',
    '  /* A closed shape seeds from its silhouette edge. An open path has no',
    '     silhouette, so the painted parameter band stands in for it and the',
    '     seeds land along the centre of the stroke. */',
    '  if (uOpen > 0.5) {',
    '    float here = step(0.35, texture2D(uCov, vUV).r);',
    '    if (here < 0.5) { gl_FragColor = vec4(1.0, 1.0, 0.0, 0.0); return; }',
    '    gl_FragColor = vec4(pack16(clamp(vUV.x, 0.0, 0.999)), pack16(clamp(vUV.y, 0.0, 0.999)));',
    '    return;',
    '  }',
    '  float c  = texture2D(uCov, vUV).r;',
    '  float l  = texture2D(uCov, vUV - vec2(uTexel.x, 0.0)).r;',
    '  float r  = texture2D(uCov, vUV + vec2(uTexel.x, 0.0)).r;',
    '  float d_ = texture2D(uCov, vUV - vec2(0.0, uTexel.y)).r;',
    '  float u  = texture2D(uCov, vUV + vec2(0.0, uTexel.y)).r;',
    '  float lo = min(min(l, r), min(min(d_, u), c));',
    '  float hi = max(max(l, r), max(max(d_, u), c));',
    '  if (lo > 0.5 || hi < 0.5) { gl_FragColor = vec4(1.0, 1.0, 0.0, 0.0); return; }',
    '  vec2 grad = vec2(r - l, u - d_) * 0.5;',
    '  float g2 = dot(grad, grad);',
    '  vec2 off = g2 > 1e-8 ? grad * ((0.5 - c) / g2) : vec2(0.0);',
    '  off = clamp(off, vec2(-1.0), vec2(1.0)) * uTexel;',
    '  vec2 pos = clamp(vUV + off, 0.0, 0.999);',
    '  gl_FragColor = vec4(pack16(pos.x), pack16(pos.y));',
    '}'
  ].join('\n');

  /** One jump-flood step: nine taps, keep the nearest seed. */
  var FLOOD = [
    'precision highp float;',
    'varying vec2 vUV;',
    'uniform sampler2D uPrev;',
    'uniform vec2 uTexel;',
    'uniform float uStep;',
    'uniform float uAspect;',
    PACK,
    'void main(){',
    '  vec4 best = texture2D(uPrev, vUV);',
    '  float bestD = 1e9;',
    '  if (hasSeed(best)) {',
    '    vec2 s = vec2(unpack16(best.rg), unpack16(best.ba));',
    '    vec2 dv = (s - vUV) * vec2(uAspect, 1.0);',
    '    bestD = dot(dv, dv);',
    '  }',
    '  for (int y = -1; y <= 1; y++) {',
    '    for (int x = -1; x <= 1; x++) {',
    '      vec2 o = vec2(float(x), float(y)) * uStep * uTexel;',
    '      vec4 c = texture2D(uPrev, vUV + o);',
    '      if (!hasSeed(c)) continue;',
    '      vec2 s = vec2(unpack16(c.rg), unpack16(c.ba));',
    '      vec2 dv = (s - vUV) * vec2(uAspect, 1.0);',
    '      float d = dot(dv, dv);',
    '      if (d < bestD) { bestD = d; best = c; }',
    '    }',
    '  }',
    '  gl_FragColor = best;',
    '}'
  ].join('\n');

  /** Resolve: distance to the nearest seed, signed by the coverage. */
  var RESOLVE = [
    'precision highp float;',
    'varying vec2 vUV;',
    'uniform sampler2D uSeed;',
    'uniform sampler2D uCov;',
    'uniform sampler2D uParam;',
    'uniform float uAspect;',
    'uniform float uOpen;',
    PACK,
    'void main(){',
    '  vec4 s = texture2D(uSeed, vUV);',
    '  float dist = 2.0;',
    '  vec2 p = vUV;',
    '  if (hasSeed(s)) {',
    '    p = vec2(unpack16(s.rg), unpack16(s.ba));',
    '    dist = length((p - vUV) * vec2(uAspect, 1.0));',
    '  }',
    '  // An open path has no interior, so nothing is ever inside it.',
    '  float inside = uOpen > 0.5 ? 0.0 : step(0.5, texture2D(uCov, vUV).r);',
    '  float signed_ = mix(dist, -dist, inside);',
    '  /* The along-the-boundary parameter is not computed here: it was painted',
    '     next to the boundary when the geometry was rasterised, so reading it',
    '     at the nearest seed gives every pixel the t of the point on the',
    '     outline it belongs to. Same trick carries the glyph id. */',
    '  vec4 par = texture2D(uParam, p);',
    '  gl_FragColor = vec4(pack16(signed_ * 0.25 + 0.5), par.g, par.b);',
    '}'
  ].join('\n');

  /* ====================================================================== */

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (global.console) console.error('SDF shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(gl, fragSrc) {
    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (global.console) console.error('SDF link:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function texture(gl, w, h, pixels) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels || null);
    return t;
  }

  /* ---- geometry rasterisation ------------------------------------------ */

  /**
   * Every mode reduces to the same two rasters:
   *
   *   fill  — the silhouette, white on black. Gives the sign of the distance.
   *   param — the same geometry painted with R = painted-here, G = the
   *           along-the-boundary parameter and B = the glyph id, laid down
   *           thick enough that a boundary seed always lands on it. R exists
   *           because t is legitimately 0 at the start of a path and so
   *           cannot double as the marker.
   *
   * A stroked polyline is how `t` gets painted: Canvas2D cannot stroke a path
   * with a gradient that follows it, so the outline is walked in short
   * segments and each one is stroked in its own colour.
   */

  function surface(w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    return { cv: cv, ctx: ctx };
  }

  /** Walk a polyline, stroking each segment with its own t. */
  function paintParam(ctx, pts, closed, width, id) {
    if (pts.length < 2) return;
    var total = 0, seg = [];
    for (var i = 0; i + 1 < pts.length; i++) {
      var d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      seg.push(d); total += d;
    }
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var blue = Math.round((id || 0) * 255);
    var run = 0;
    for (var k = 0; k + 1 < pts.length; k++) {
      var a = pts[k], b = pts[k + 1];
      var t0 = total ? run / total : 0;
      run += seg[k];
      var t1 = total ? run / total : 1;
      // Each segment carries a gradient from its own t0 to t1. Stroking it flat
      // would quantise t into one band per segment, and those bands show up as
      // hard wedges the moment Direction leans towards "along".
      var g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, 'rgb(255,' + Math.round(t0 * 255) + ',' + blue + ')');
      g.addColorStop(1, 'rgb(255,' + Math.round(t1 * 255) + ',' + blue + ')');
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }

  function tracePath(ctx, pts, closed) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (closed) ctx.closePath();
  }

  /* ---- shape outlines, as polylines ------------------------------------ */

  function shapeOutline(geom, w, h) {
    var aspect = w / h;
    var cx = (aspect * 0.5 + (geom.x || 0) / 100) * h;
    var cy = (0.5 - (geom.y || 0) / 100) * h;
    var r = Math.max(0.01, (geom.size || 40) / 100) * h * 0.5;
    var rot = (geom.rotate || 0) * Math.PI / 180;
    var pts = [];
    var i, a;

    function push(x, y) {
      pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot),
                cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }

    if (geom.shape === 'rect') {
      // Rounded rectangle, walked corner by corner so t runs evenly around it.
      var hw = r, hh = r * 0.72;
      var rad = Math.min(hw, hh) * Math.max(0, Math.min(1, (geom.corner || 0) / 100));
      var corners = [[hw - rad, hh - rad, 0], [-hw + rad, hh - rad, Math.PI / 2],
                     [-hw + rad, -hh + rad, Math.PI], [hw - rad, -hh + rad, -Math.PI / 2]];
      for (i = 0; i < 4; i++) {
        var c = corners[i];
        for (var k = 0; k <= 24; k++) {
          a = c[2] + (k / 24) * (Math.PI / 2);
          push(c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad);
        }
      }
    } else if (geom.shape === 'polygon' || geom.shape === 'star') {
      var sides = Math.max(3, Math.round(geom.sides || 5));
      var star = geom.shape === 'star';
      var inner = Math.max(0.05, Math.min(0.95, (geom.inner || 45) / 100));
      var steps = star ? sides * 2 : sides;
      var sub = 12;                       // points per edge, so t stays smooth
      for (i = 0; i <= steps * sub; i++) {
        var e = Math.floor(i / sub), f = (i % sub) / sub;
        var a0 = -Math.PI / 2 + (e / steps) * Math.PI * 2;
        var a1 = -Math.PI / 2 + ((e + 1) / steps) * Math.PI * 2;
        var r0 = (star && e % 2) ? r * inner : r;
        var r1 = (star && (e + 1) % 2) ? r * inner : r;
        var x0 = Math.cos(a0) * r0, y0 = Math.sin(a0) * r0;
        var x1 = Math.cos(a1) * r1, y1 = Math.sin(a1) * r1;
        push(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
      }
    } else {
      for (i = 0; i <= 192; i++) {
        a = (i / 192) * Math.PI * 2;
        push(Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    return pts;
  }

  /* ---- curve: anchors and handles into a polyline ---------------------- */

  function bezier(p0, c0, c1, p1, out, steps) {
    for (var i = 1; i <= steps; i++) {
      var t = i / steps, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * p1[0],
        u * u * u * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * p1[1]
      ]);
    }
  }

  /**
   * Anchors arrive in 0–1 of the frame ({ x, y, hx, hy } — the handle is an
   * offset, mirrored for a smooth anchor). Straight to pixels, then flattened.
   */
  function curveOutline(geom, w, h) {
    var nodes = geom.nodes || [];
    if (nodes.length < 2) return [];
    var scale = h, ox = 0;
    var px = nodes.map(function (n) {
      return {
        p: [n.x * scale + ox, n.y * scale],
        h: [(n.hx || 0) * scale, (n.hy || 0) * scale],
        corner: !!n.corner
      };
    });
    var pts = [px[0].p];
    var last = px.length - (geom.closed ? 0 : 1);
    for (var i = 0; i < last; i++) {
      var a = px[i], b = px[(i + 1) % px.length];
      bezier(a.p, [a.p[0] + a.h[0], a.p[1] + a.h[1]],
             [b.p[0] - b.h[0], b.p[1] - b.h[1]], b.p, pts, 24);
    }
    return pts;
  }

  /* ---- letters ---------------------------------------------------------- */

  var FALLBACK = '-apple-system, "SF Pro Display", "Segoe UI", Helvetica, Arial, sans-serif';

  /**
   * Glyph outlines come from the browser's own text rasteriser. In a real After
   * Effects plugin this is where the layer's text data would be read instead —
   * the glyph outlines are available from the source text layer, and the rest
   * of this pipeline would not change at all.
   */
  function letterGeometry(geom, w, h) {
    var lines = String(geom.text == null ? 'Type' : geom.text).split('\n');
    var size = Math.max(0.02, (geom.textSize || 26) / 100) * h;
    var track = (geom.tracking || 0) / 100 * size;
    var font = size + 'px ' + (geom.font ? geom.font + ', ' : '') + FALLBACK;

    var probe = document.createElement('canvas').getContext('2d');
    probe.font = font;

    var glyphs = [];
    var lineH = size * 1.16;
    var blockH = lines.length * lineH;
    var index = 0, count = 0;
    lines.forEach(function (line) { count += line.replace(/\s/g, '').length; });

    lines.forEach(function (line, li) {
      var widths = [], total = 0;
      for (var i = 0; i < line.length; i++) {
        var cw = probe.measureText(line[i]).width + track;
        widths.push(cw); total += cw;
      }
      var x = (w - total) / 2;
      var y = (h - blockH) / 2 + li * lineH + lineH * 0.78;
      for (var j = 0; j < line.length; j++) {
        if (line[j].trim()) {
          glyphs.push({ ch: line[j], x: x, y: y, w: widths[j], index: index++ });
        }
        x += widths[j];
      }
    });
    return { glyphs: glyphs, font: font, count: Math.max(1, count) };
  }

  /* ---- one raster per geometry mode ------------------------------------ */

  function rasterise(geom, w, h) {
    var fill = surface(w, h);
    var param = surface(w, h);
    var mode = geom.mode || 'shape';
    var band = Math.max(3, Math.round(h * 0.012));

    if (mode === 'letter') {
      var L = letterGeometry(geom, w, h);
      fill.ctx.font = L.font;
      fill.ctx.textAlign = 'left';
      fill.ctx.fillStyle = '#fff';
      param.ctx.font = L.font;
      param.ctx.textAlign = 'left';
      param.ctx.lineWidth = band;
      param.ctx.lineJoin = 'round';

      L.glyphs.forEach(function (g) {
        fill.ctx.fillText(g.ch, g.x, g.y);
        // G = position across this glyph's own box, B = which glyph it is.
        // Together they reconstruct both the continuous run across the word
        // and the per-letter ramp (see the shader).
        var id = L.count > 1 ? g.index / (L.count - 1) : 0;
        var grad = param.ctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
        grad.addColorStop(0, 'rgb(255,0,' + Math.round(id * 255) + ')');
        grad.addColorStop(1, 'rgb(255,255,' + Math.round(id * 255) + ')');
        param.ctx.fillStyle = grad;
        param.ctx.strokeStyle = grad;
        param.ctx.fillText(g.ch, g.x, g.y);
        param.ctx.strokeText(g.ch, g.x, g.y);
      });
      return { fill: fill.cv, param: param.cv, closed: true };
    }

    var pts = mode === 'curve' ? curveOutline(geom, w, h) : shapeOutline(geom, w, h);
    if (pts.length < 2) return { fill: fill.cv, param: param.cv, closed: false };

    var closed = mode === 'curve' ? !!geom.closed : true;
    if (closed) {
      fill.ctx.fillStyle = '#fff';
      tracePath(fill.ctx, pts, true);
      fill.ctx.fill();
    } else {
      // No interior to seed from, so the centreline itself is the boundary. It
      // is drawn a hair wide on purpose: a thick line would seed both of its
      // edges, and t would fan out between them.
      fill.ctx.strokeStyle = '#fff';
      fill.ctx.lineWidth = Math.max(1.4, h * 0.004);
      fill.ctx.lineCap = 'round';
      fill.ctx.lineJoin = 'round';
      tracePath(fill.ctx, pts, false);
      fill.ctx.stroke();
    }
    paintParam(param.ctx, pts, closed, band, 0);
    return { fill: fill.cv, param: param.cv, closed: closed };
  }

  /* ---- the pipeline ----------------------------------------------------- */

  function create(gl) {
    var progs = {
      seed: program(gl, SEED),
      flood: program(gl, FLOOD),
      resolve: program(gl, RESOLVE)
    };
    if (!progs.seed || !progs.flood || !progs.resolve) return null;

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var fbo = gl.createFramebuffer();
    var size = 0, aspect = 1;
    var cov = null, par = null, ping = null, pong = null, field = null;
    var signature = '';
    var passes = 0, builds = 0, open_ = false;

    function allocate(w, h) {
      [cov, par, ping, pong, field].forEach(function (t) { if (t) gl.deleteTexture(t); });
      cov = texture(gl, w, h);
      par = texture(gl, w, h);
      ping = texture(gl, w, h);
      pong = texture(gl, w, h);
      field = texture(gl, w, h);
      // The seed textures must not interpolate — a blended seed is not a seed.
      [ping, pong].forEach(function (t) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      });
    }

    function draw(prog, target, w, h) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /**
     * Rebuild only when the signature changes. `update` is called every frame
     * and is a cheap string compare on all but the first.
     */
    function update(geom, w, h) {
      // Everything the raster depends on, and nothing that only animates.
      var key = JSON.stringify([geom.mode, geom.shape, geom.size, geom.x, geom.y, geom.rotate,
                                geom.sides, geom.inner, geom.corner, geom.closed, geom.nodes,
                                geom.text, geom.font, geom.textSize, geom.tracking, w, h]);
      if (key === signature) return field;
      signature = key;
      builds++;

      if (w !== size || Math.abs(aspect - w / h) > 1e-6) { allocate(w, h); size = w; }
      aspect = w / h;

      var raster = rasterise(geom, w, h);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, cov);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster.fill);
      gl.bindTexture(gl.TEXTURE_2D, par);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster.param);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

      var texel = [1 / w, 1 / h];

      // 1 — seeds. An open curve has no silhouette, so the seed pass also
      //     looks at the parameter band: that band *is* its boundary.
      gl.useProgram(progs.seed);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, cov);
      gl.uniform1i(gl.getUniformLocation(progs.seed, 'uCov'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, par);
      gl.uniform1i(gl.getUniformLocation(progs.seed, 'uParam'), 1);
      gl.uniform1f(gl.getUniformLocation(progs.seed, 'uOpen'), raster.closed ? 0 : 1);
      gl.uniform2f(gl.getUniformLocation(progs.seed, 'uTexel'), texel[0], texel[1]);
      draw(progs.seed, ping, w, h);

      // 2 — jump flood: N/2, N/4 … 1
      passes = 0;
      var floodStep = gl.getUniformLocation(progs.flood, 'uStep');
      gl.useProgram(progs.flood);
      gl.uniform1i(gl.getUniformLocation(progs.flood, 'uPrev'), 0);
      gl.uniform2f(gl.getUniformLocation(progs.flood, 'uTexel'), texel[0], texel[1]);
      gl.uniform1f(gl.getUniformLocation(progs.flood, 'uAspect'), aspect);
      for (var k = Math.max(w, h) / 2; k >= 1; k /= 2) {
        gl.useProgram(progs.flood);
        gl.uniform1f(floodStep, Math.round(k));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, ping);
        draw(progs.flood, pong, w, h);
        var swap = ping; ping = pong; pong = swap;
        passes++;
      }

      // 3 — resolve to a signed distance
      gl.useProgram(progs.resolve);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ping);
      gl.uniform1i(gl.getUniformLocation(progs.resolve, 'uSeed'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, cov);
      gl.uniform1i(gl.getUniformLocation(progs.resolve, 'uCov'), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, par);
      gl.uniform1i(gl.getUniformLocation(progs.resolve, 'uParam'), 2);
      gl.uniform1f(gl.getUniformLocation(progs.resolve, 'uAspect'), aspect);
      gl.uniform1f(gl.getUniformLocation(progs.resolve, 'uOpen'), raster.closed ? 0 : 1);
      draw(progs.resolve, field, w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
      open_ = !raster.closed;
      return field;
    }

    return {
      update: update,
      get texture() { return field; },
      get passes() { return passes; },
      get builds() { return builds; },
      /** True when the geometry has no interior — an open curve. */
      get open() { return open_; },
      get signature() { return signature; }
    };
  }

  global.GRADIENT_SDF = { create: create, rasterise: rasterise };
})(window);
