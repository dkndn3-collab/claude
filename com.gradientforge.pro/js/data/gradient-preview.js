/**
 * gradient-preview.js — the panel-side renderer.
 *
 * The mesh engine as a fragment shader: Gaussian-weighted colour points blended
 * in OKLab, a low-frequency domain warp, and dither on the way out (§4.5). It
 * is the reference implementation — jsx/engine.jsx reproduces it with native
 * After Effects layers, from the same numbers.
 *
 * Nothing here is loaded from disk. Every pixel is computed per frame.
 *
 * One WebGL context does all the work and blits into each target canvas, so a
 * grid of preset tiles plus a live hero costs one context, not seven.
 */
(function (global) {
  'use strict';

  var G = global.GRADIENTS;
  var MAX = G.maxColors;

  /* ====================================================================== */
  /* Shaders                                                                */
  /* ====================================================================== */

  var VERT = [
    'attribute vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    '',
    'uniform vec2  uRes;',
    'uniform float uPhase;      // 0..TAU, one full loop',
    'uniform float uTime;       // seconds, dither only',
    'uniform vec3  uCol[' + MAX + '];',
    'uniform vec2  uHome[' + MAX + '];',
    'uniform vec3  uOrb[' + MAX + '];   // radius, harmonic, angle',
    'uniform float uCount;',
    'uniform float uMotion;     // 0..1',
    'uniform float uBlend;      // 0..1  defined <-> soft',
    'uniform float uFlow;       // 0..1  domain warp',
    'uniform float uGrain;      // 0..1',
    'uniform float uSep;        // 0..1  soft field <-> distinct masses',
    'uniform float uSeed;',
    'uniform float uSpace;      // 0 OKLab · 1 HCL · 2 linear sRGB',
    '',
    'const float TAU = 6.28318530718;',
    '',
    '/* ---------- transfer functions ---------- */',
    'vec3 toLinear(vec3 c){',
    '  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));',
    '}',
    'vec3 toSRGB(vec3 c){',
    '  c = max(c, 0.0);',
    '  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c));',
    '}',
    '',
    '/* ---------- OKLab (Björn Ottosson) ---------- */',
    'vec3 lrgb2oklab(vec3 c){',
    '  float l = 0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b;',
    '  float m = 0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b;',
    '  float s = 0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b;',
    '  return vec3(',
    '    0.2104542553*pow(max(l,0.0),1.0/3.0) + 0.7936177850*pow(max(m,0.0),1.0/3.0) - 0.0040720468*pow(max(s,0.0),1.0/3.0),',
    '    1.9779984951*pow(max(l,0.0),1.0/3.0) - 2.4285922050*pow(max(m,0.0),1.0/3.0) + 0.4505937099*pow(max(s,0.0),1.0/3.0),',
    '    0.0259040371*pow(max(l,0.0),1.0/3.0) + 0.7827717662*pow(max(m,0.0),1.0/3.0) - 0.8086757660*pow(max(s,0.0),1.0/3.0));',
    '}',
    'vec3 oklab2lrgb(vec3 c){',
    '  float l_ = c.x + 0.3963377774*c.y + 0.2158037573*c.z;',
    '  float m_ = c.x - 0.1055613458*c.y - 0.0638541728*c.z;',
    '  float s_ = c.x - 0.0894841775*c.y - 1.2914855480*c.z;',
    '  float l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;',
    '  return vec3(',
    '     4.0767416621*l - 3.3077115913*m + 0.2309699292*s,',
    '    -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,',
    '    -0.0041960863*l - 0.7034186147*m + 1.7076147010*s);',
    '}',
    '',
    '/* ---------- noise — warp only, never colour (§4.5) ---------- */',
    'float hash21(vec2 p){',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash21(i);',
    '  float b = hash21(i + vec2(1.0, 0.0));',
    '  float c = hash21(i + vec2(0.0, 1.0));',
    '  float d = hash21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);',
    '}',
    '',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  float aspect = uRes.x / uRes.y;',
    '',
    '  /* Domain warp. The sample offset travels a CLOSED CIRCLE in noise space,',
    '     so the field is exactly back where it started at phase = TAU — a real',
    '     loop, no cross-fade. The frequency is deliberately low: high-frequency',
    '     warp is what makes a gradient read as smoke. */',
    '  vec2 orbit = vec2(cos(uPhase), sin(uPhase)) * uMotion;',
    '  float F = 1.15;',
    '  float n1 = vnoise(uv * F + orbit * 0.42 + uSeed);',
    '  float n2 = vnoise(uv * F + orbit.yx * vec2(-0.42, 0.42) + uSeed + 19.7);',
    '  vec2 q  = vec2(n1, n2) - 0.5;',
    '  float n3 = vnoise(uv * 0.72 + q * 0.9 + orbit * 0.3 + uSeed + 4.1);',
    '  float n4 = vnoise(uv * 0.72 + q * 0.9 - orbit * 0.3 + uSeed + 31.3);',
    '  vec2 p = uv + (vec2(n3, n4) - 0.5) * (uFlow * 0.85);',
    '',
    '  /* Gaussian-weighted blend of the colour points. C-infinity smooth, so',
    '     there is no seam and no banding structure to begin with. */',
    '  /* Separation tightens every point and thins the tail, so the colours',
    '     read as distinct masses instead of one continuous field. */',
    '  float sharp = mix(26.0, 3.2, uBlend) * (1.0 + uSep * 1.8);',
    '  float tail  = 0.34 * (1.0 - 0.9 * uSep);',
    '  vec3 acc = vec3(0.0);',
    '  float wsum = 0.0;',
    '  float chroma = 0.0;',
    '',
    '  for(int i = 0; i < ' + MAX + '; i++){',
    '    float fi = float(i);',
    '    float active = step(fi, uCount - 0.5);',
    '',
    '    float ph = uPhase * uOrb[i].y;',
    '    vec2 pos = uHome[i] + uOrb[i].x * uMotion *',
    '               vec2(cos(ph + uOrb[i].z), sin(ph + uOrb[i].z * 1.7));',
    '',
    '    vec2 d = (p - pos) * vec2(aspect, 1.0);',
    '    float q = dot(d, d) * sharp;',
    '    /* Gaussian core, plus an inverse-quadratic tail. A bare Gaussian',
    '       underflows far from every point, and where that happens the blend',
    '       snaps between whichever floor wins — a visible crease. The tail',
    '       never reaches zero, so distant areas fade into each other. */',
    '    float wt = (exp(-q) + tail / (1.0 + q * q * 4.0)) * active;',
    '',
    '    vec3 lab = lrgb2oklab(toLinear(uCol[i]));',
    '    if(uSpace > 1.5) lab = toLinear(uCol[i]);      // linear sRGB blend',
    '    acc    += lab * wt;',
    '    chroma += length(lrgb2oklab(toLinear(uCol[i])).yz) * wt;',
    '    wsum   += wt;',
    '  }',
    '',
    '  vec3 mixed = acc / max(wsum, 1e-5);',
    '  vec3 lin;',
    '  if(uSpace > 1.5){',
    '    lin = mixed;                                   // already linear light',
    '  } else if(uSpace > 0.5){',
    '    /* HCL: keep the weighted mean chroma instead of letting opposing hues',
    '       cancel each other out, which is what dulls an OKLab mean. */',
    '    float c = length(mixed.yz);',
    '    float target = chroma / max(wsum, 1e-5);',
    '    lin = oklab2lrgb(vec3(mixed.x, mixed.yz * (target / max(c, 1e-4))));',
    '  } else {',
    '    lin = oklab2lrgb(mixed);',
    '  }',
    '',
    '  vec3 col = toSRGB(lin);',
    '',
    '  /* Grain doubles as dither. Even at Grain = 0 a sub-LSB amount stays in,',
    '     because 8-bit output without dither WILL band on a smooth gradient. */',
    '  float g = hash21(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5;',
    '  col += g * (0.9/255.0 + uGrain * 0.055);',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ====================================================================== */
  /* One shared context                                                     */
  /* ====================================================================== */

  var gl = null, prog = null, U = null, surface = null, failed = false;
  var buf = {
    col:  new Float32Array(MAX * 3),
    home: new Float32Array(MAX * 2),
    orb:  new Float32Array(MAX * 3)
  };

  function init() {
    if (gl || failed) return !!gl;
    surface = document.createElement('canvas');
    surface.width = 480; surface.height = 270;
    try {
      gl = surface.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true })
        || surface.getContext('experimental-webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    } catch (e) { gl = null; }
    if (!gl) { failed = true; return false; }

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        if (global.console) console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { gl = null; failed = true; return false; }

    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (global.console) console.error(gl.getProgramInfoLog(prog));
      gl = null; failed = true; return false;
    }
    gl.useProgram(prog);

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    U = {};
    ['uRes', 'uPhase', 'uTime', 'uCount', 'uMotion', 'uBlend', 'uFlow', 'uGrain', 'uSep', 'uSeed', 'uSpace']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    U.uCol  = gl.getUniformLocation(prog, 'uCol[0]');
    U.uHome = gl.getUniformLocation(prog, 'uHome[0]');
    U.uOrb  = gl.getUniformLocation(prog, 'uOrb[0]');
    return true;
  }

  /* ====================================================================== */
  /* Render                                                                 */
  /* ====================================================================== */

  var SPACE_ID = { oklab: 0, hcl: 1, srgb: 2 };

  /**
   * Draw one frame of `params` into `canvas`.
   * @param {Number} t seconds into the loop
   */
  function render(canvas, params, t) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.max(24, Math.round((rect.width || 240) * dpr));
    var h = Math.max(16, Math.round((rect.height || 135) * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

    if (!init()) { fallback(canvas, params, w, h); return; }

    // The shared surface only has to be as big as the largest target.
    if (surface.width < w || surface.height < h) {
      surface.width = Math.max(surface.width, w);
      surface.height = Math.max(surface.height, h);
    }

    var r = G.resolve(params);
    var n = Math.min(r.colors.length, MAX);

    for (var i = 0; i < MAX; i++) {
      var k = Math.min(i, n - 1);
      var c = G.hexToRgb(r.colors[k]);
      buf.col[i * 3] = c[0]; buf.col[i * 3 + 1] = c[1]; buf.col[i * 3 + 2] = c[2];
      var pt = r.points[k];
      buf.home[i * 2] = pt.home[0]; buf.home[i * 2 + 1] = pt.home[1];
      buf.orb[i * 3] = pt.rad; buf.orb[i * 3 + 1] = pt.harm; buf.orb[i * 3 + 2] = pt.ang;
    }

    var phase = r.motion ? (t / Math.max(0.5, r.loop)) * G.TAU : 0;

    // Draw into the bottom-left of the shared surface — gl_FragCoord then
    // starts at 0, and that region is the last h rows of the canvas image.
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uPhase, phase);
    gl.uniform1f(U.uTime, t);
    gl.uniform3fv(U.uCol, buf.col);
    gl.uniform2fv(U.uHome, buf.home);
    gl.uniform3fv(U.uOrb, buf.orb);
    gl.uniform1f(U.uCount, n);
    gl.uniform1f(U.uMotion, r.motion / 100);
    gl.uniform1f(U.uBlend, r.blend / 100);
    gl.uniform1f(U.uFlow, r.flow / 100);
    gl.uniform1f(U.uGrain, r.grain / 100);
    gl.uniform1f(U.uSep, (r.separation || 0) / 100);
    gl.uniform1f(U.uSeed, (r.seed % 997) / 100);
    gl.uniform1f(U.uSpace, SPACE_ID[r.colorSpace] || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    var ctx = canvas.getContext('2d');
    ctx.drawImage(surface, 0, surface.height - h, w, h, 0, 0, w, h);
  }

  /**
   * No WebGL (a very old CEF, or a GPU-blocked host): draw the same colour
   * points as radial blobs. No warp and no per-pixel colour space, but the
   * palette and the layout still read correctly.
   */
  function fallback(canvas, params, w, h) {
    var r = G.resolve(params);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = r.colors[0];
    ctx.fillRect(0, 0, w, h);
    var radius = (0.35 + r.blend / 220) * Math.max(w, h);
    for (var i = 0; i < r.points.length; i++) {
      var pt = G.pointAt(r.points[i], 0, r.motion);
      var g = ctx.createRadialGradient(pt[0] * w, pt[1] * h, 0, pt[0] * w, pt[1] * h, radius);
      g.addColorStop(0, r.colors[i]);
      g.addColorStop(1, hexToRgba(r.colors[i], 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function hexToRgba(hex, a) {
    var c = G.hexToRgb(hex);
    return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' +
           Math.round(c[2] * 255) + ',' + a + ')';
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
   * Keep a canvas playing. `paramsFn` is read every frame, so dragging a slider
   * updates the animation in place.
   */
  function animate(canvas, paramsFn, fps) {
    stop(canvas);
    if (!start) start = performance.now();
    running.push({ canvas: canvas, params: paramsFn, interval: 1000 / (fps || 30), last: 0 });
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
    stopAll: stopAll,
    /** True once a GL context is up — asking for it is what brings it up. */
    get accelerated() { return init(); }
  };
})(window);
