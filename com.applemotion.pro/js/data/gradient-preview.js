/**
 * gradient-preview.js — the panel-side renderer.
 *
 * Draws the same gradient After Effects will build, in a <canvas>, from the
 * same parameters and the same seed. Nothing here is loaded from disk: the
 * pixels are computed per frame from value noise and the resolved colour set,
 * which is the whole point of the feature (§1).
 *
 * It mirrors the AE chain stage for stage:
 *
 *   AE                                   here
 *   ──────────────────────────────────   ──────────────────────────────────
 *   Gradient Ramp / 4-Color Gradient   → exact ramp / inverse-square blend
 *   Turbulent Displace                 → fbm domain warp
 *   Displacement Map from FIELD (flow) → second-order warp
 *   Fast Box Blur (Softness)           → render scale + smoothed upscale
 *   Noise (Grain)                      → per-pixel jitter
 *
 * The loop is seamless the same way AE's is: evolution walks a circle in noise
 * space, so t = 0 and t = loop land on the same sample.
 */
(function (global) {
  'use strict';

  var G = global.GRADIENTS;

  /* ---------------------------------------------------------------- noise */

  function hash(x, y, seed) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function vnoise(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
    var c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  function fbm(x, y, octaves, seed) {
    var sum = 0, norm = 0, amp = 0.5, f = 1;
    for (var i = 0; i < octaves; i++) {
      sum += amp * vnoise(x * f, y * f, seed + i * 1013);
      norm += amp;
      f *= 2;
      amp *= 0.5;
    }
    return sum / norm;
  }

  /* -------------------------------------------------------------- geometry */

  /**
   * Colour anchors, in aspect-corrected 0–1 space. Identical maths to the
   * expression the AE build writes onto each 4-Color Gradient point, so an
   * anchor sits in the same place in both renderers.
   */
  function anchors(r, offsets, aspect) {
    var a = r.angle * Math.PI / 180;
    var dir = [Math.cos(a), Math.sin(a)];
    var ext = (r.spread / 100) * Math.max(aspect, 1);
    var cx = aspect / 2, cy = 0.5;
    var n = offsets.length;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (n === 1 ? 0.5 : i / (n - 1)) - 0.5;
      pts.push([
        cx + dir[0] * t * ext + offsets[i][0] * ext,
        cy + dir[1] * t * ext + offsets[i][1] * ext
      ]);
    }
    return pts;
  }

  /* --------------------------------------------------------------- render */

  var LUT_SIZE = 192;

  /**
   * Render one frame.
   * @param {HTMLCanvasElement} canvas  display canvas
   * @param {Object} params             panel parameters (pre-resolve)
   * @param {Number} t                  seconds into the loop
   */
  function render(canvas, params, t) {
    var r = G.resolve(params);
    var rect = canvas.getBoundingClientRect();
    var dw = Math.max(32, Math.round(rect.width || canvas.width || 240));
    var dh = Math.max(18, Math.round(rect.height || canvas.height || 135));
    if (canvas.width !== dw || canvas.height !== dh) { canvas.width = dw; canvas.height = dh; }

    // Softness is bought by rendering smaller and letting the upscale blur it —
    // cheap, and it keeps the preview responsive while a slider is moving.
    var quality = canvas.dataset.q === 'hi' ? 1 : 0.62;
    var scale = (1 - r.softness / 150) * quality;
    var w = Math.max(12, Math.round(Math.min(dw, 230) * scale));
    var h = Math.max(8, Math.round(w * dh / dw));

    var buf = canvas.__gfBuf;
    if (!buf || buf.width !== w || buf.height !== h) {
      buf = canvas.__gfBuf = document.createElement('canvas');
      buf.width = w; buf.height = h;
      canvas.__gfImg = null;
    }
    var bctx = buf.getContext('2d');
    var img = canvas.__gfImg && canvas.__gfImg.width === w ? canvas.__gfImg : (canvas.__gfImg = bctx.createImageData(w, h));
    var data = img.data;

    var aspect = w / h;
    var table = r.exact ? G.lut(r.colors, r.colorSpace, LUT_SIZE) : null;
    var quad = r.colors.map(G.hexToRgb);
    var quadExtra = r.extra ? r.extra.map(G.hexToRgb) : null;
    var pts = anchors(r, r.offsets, aspect);
    var ptsExtra = r.extraOffsets ? anchors(r, r.extraOffsets, aspect) : null;

    var octaves = 1 + Math.round(r.complexity / 20);
    var freq = 0.6 + (100 - r.scale) / 22;          // small Scale = busy field
    var warp = (r.warp / 100) * 0.85;
    var grain = r.grain / 100;
    var seed = r.seed | 0;

    // Seamless loop: evolution walks a circle in noise space (§5.3).
    var phase = (r.phase / 360) * Math.PI * 2;
    var revolutions = Math.max(1, Math.round(r.speed / 12));
    var ang = r.speed ? phase + (t / Math.max(0.1, r.loop)) * revolutions * Math.PI * 2 : phase;
    var ex = Math.cos(ang) * 1.4, ey = Math.sin(ang) * 1.4;

    var a = r.angle * Math.PI / 180;
    var dir = [Math.cos(a), Math.sin(a)];
    var ext = (r.spread / 100) * Math.max(aspect, 1);
    var cx = aspect / 2, cy = 0.5;

    var rand = G.rng(seed + 7);
    var noiseSeed = seed;

    for (var py = 0, i = 0; py < h; py++) {
      var vy = (py + 0.5) / h;
      for (var px = 0; px < w; px++, i += 4) {
        var vx = (px + 0.5) / w * aspect;
        var x = vx, y = vy;

        if (r.mode !== 'linear' && warp > 0) {
          var wx = fbm(x * freq + ex, y * freq + ey, octaves, noiseSeed) - 0.5;
          var wy = fbm(x * freq + ex + 5.2, y * freq + ey + 1.7, octaves, noiseSeed + 91) - 0.5;
          if (r.mode === 'flow') {
            // Displacement Map from an animated FIELD layer: the warp is itself
            // pushed around by a second, slower field.
            var fx = fbm(x * freq * 0.45 - ex, y * freq * 0.45 - ey, Math.max(1, octaves - 1), noiseSeed + 313) - 0.5;
            wx += fx * 1.25;
            wy += (fbm(x * freq * 0.45 - ex + 9.1, y * freq * 0.45 - ey + 3.3, Math.max(1, octaves - 1), noiseSeed + 577) - 0.5) * 1.25;
          }
          x += wx * warp * 1.6;
          y += wy * warp * 1.6;
        }

        var cr, cg, cb;

        if (table) {
          var g;
          if (r.shape === 'radial') {
            g = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / (ext / 2);
          } else {
            g = 0.5 + ((x - cx) * dir[0] + (y - cy) * dir[1]) / ext;
          }
          var c = table[Math.max(0, Math.min(LUT_SIZE - 1, Math.round(g * (LUT_SIZE - 1))))];
          cr = c[0]; cg = c[1]; cb = c[2];
        } else {
          var acc = blend(quad, pts, x, y);
          cr = acc[0]; cg = acc[1]; cb = acc[2];
          if (quadExtra) {
            // Stops 5–8 arrive through a noise luma matte, exactly as the AE
            // build mixes its second 4-Color Gradient layer.
            var m = fbm(x * freq * 0.8 + ex, y * freq * 0.8 + ey, Math.max(1, octaves - 1), noiseSeed + 4001);
            m = Math.max(0, Math.min(1, (m - 0.34) * 2.4));
            var acc2 = blend(quadExtra, ptsExtra, x, y);
            cr += (acc2[0] - cr) * m;
            cg += (acc2[1] - cg) * m;
            cb += (acc2[2] - cb) * m;
          }
          cr *= 255; cg *= 255; cb *= 255;
        }

        if (grain) {
          var n = (rand() - 0.5) * grain * 180;
          cr += n; cg += n; cb += n;
        }

        data[i]     = cr < 0 ? 0 : cr > 255 ? 255 : cr;
        data[i + 1] = cg < 0 ? 0 : cg > 255 ? 255 : cg;
        data[i + 2] = cb < 0 ? 0 : cb > 255 ? 255 : cb;
        data[i + 3] = 255;
      }
    }

    bctx.putImageData(img, 0, 0);

    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(buf, 0, 0, w, h, 0, 0, dw, dh);
  }

  /** Inverse-square weighting between four colour anchors — 4-Color Gradient. */
  function blend(colors, pts, x, y) {
    var wsum = 0, r = 0, g = 0, b = 0;
    for (var i = 0; i < pts.length; i++) {
      var dx = x - pts[i][0], dy = y - pts[i][1];
      var w = 1 / (dx * dx + dy * dy + 0.012);
      wsum += w;
      r += colors[i][0] * w;
      g += colors[i][1] * w;
      b += colors[i][2] * w;
    }
    return [r / wsum, g / wsum, b / wsum];
  }

  /* ------------------------------------------------------------ animation */

  var running = [];
  var raf = null;
  var start = 0;

  function tick(now) {
    raf = null;
    if (!running.length) return;
    var t = (now - start) / 1000;
    for (var i = 0; i < running.length; i++) {
      var job = running[i];
      if (now - job.last < job.interval) continue;
      job.last = now;
      var p = job.params();
      if (!p) continue;
      try { render(job.canvas, p, t); } catch (e) { /* keep the loop alive */ }
    }
    raf = requestAnimationFrame(tick);
  }

  /**
   * Keep a canvas playing its gradient. `paramsFn` is read every frame, so
   * dragging a slider updates the animation in place.
   */
  function animate(canvas, paramsFn, fps) {
    stop(canvas);
    if (!start) start = performance.now();
    running.push({ canvas: canvas, params: paramsFn, interval: 1000 / (fps || 20), last: 0 });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function stop(canvas) {
    running = running.filter(function (j) { return j.canvas !== canvas; });
  }

  function stopAll() { running = []; }

  global.GRADIENT_PREVIEW = {
    render: render,
    animate: animate,
    stop: stop,
    stopAll: stopAll
  };
})(window);
