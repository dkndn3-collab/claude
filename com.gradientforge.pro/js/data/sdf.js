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
    'uniform vec2 uTexel;',
    PACK,
    'void main(){',
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
    'uniform float uAspect;',
    PACK,
    'void main(){',
    '  vec4 s = texture2D(uSeed, vUV);',
    '  float dist = 2.0;',
    '  if (hasSeed(s)) {',
    '    vec2 p = vec2(unpack16(s.rg), unpack16(s.ba));',
    '    dist = length((p - vUV) * vec2(uAspect, 1.0));',
    '  }',
    '  float inside = step(0.5, texture2D(uCov, vUV).r);',
    '  float signed_ = mix(dist, -dist, inside);',
    '  gl_FragColor = vec4(pack16(signed_ * 0.25 + 0.5), 0.0, 1.0);',
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
   * Draw the geometry white-on-black. Coordinates are the same ones the main
   * shader works in: x across [0, aspect], y down [0, 1].
   *
   * Shape only, for now — Curve and Letter add their own branches here and
   * change nothing downstream.
   */
  function rasterise(geom, w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    var aspect = w / h;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';

    // Positions are in height units, so a shape keeps its proportions when the
    // frame aspect changes. Positive Y is up on screen (the raster is uploaded
    // flipped), which is the direction a motion designer expects.
    var cx = (aspect * 0.5 + (geom.x || 0) / 100) * h;
    var cy = (0.5 - (geom.y || 0) / 100) * h;
    var r = Math.max(0.01, (geom.size || 40) / 100) * h * 0.5;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((geom.rotate || 0) * Math.PI / 180);

    if (geom.shape === 'ellipse') {
      // Equal pixel radii: round on screen whatever the frame aspect is.
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return cv;
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
    var cov = null, ping = null, pong = null, field = null;
    var signature = '';
    var passes = 0, builds = 0;

    function allocate(w, h) {
      [cov, ping, pong, field].forEach(function (t) { if (t) gl.deleteTexture(t); });
      cov = texture(gl, w, h);
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
      var key = [geom.shape, geom.size, geom.x, geom.y, geom.rotate, w, h].join('|');
      if (key === signature) return field;
      signature = key;
      builds++;

      if (w !== size || Math.abs(aspect - w / h) > 1e-6) { allocate(w, h); size = w; }
      aspect = w / h;

      var raster = rasterise(geom, w, h);
      gl.bindTexture(gl.TEXTURE_2D, cov);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

      var texel = [1 / w, 1 / h];

      // 1 — seeds
      gl.useProgram(progs.seed);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, cov);
      gl.uniform1i(gl.getUniformLocation(progs.seed, 'uCov'), 0);
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
      gl.uniform1f(gl.getUniformLocation(progs.resolve, 'uAspect'), aspect);
      draw(progs.resolve, field, w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
      return field;
    }

    return {
      update: update,
      get texture() { return field; },
      get passes() { return passes; },
      get builds() { return builds; },
      get signature() { return signature; }
    };
  }

  global.GRADIENT_SDF = { create: create, rasterise: rasterise };
})(window);
