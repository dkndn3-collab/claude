/**
 * previews.js
 * Draws each component as inline SVG from the exact parameters that go to After
 * Effects — the tile is a rendering of what you get, not a screenshot that
 * drifts. Animatable pieces are wrapped in <g> groups with `pv-*` classes so
 * animator.js can play a real entrance on hover (§24).
 *
 *   .pv-root   the whole component      (entrance: slide / scale / fade)
 *   .pv-item   a content element        (staggered in)     data-i = order
 *   .pv-bar    a chart column           (grows from base)  data-i = order
 *   .pv-fill   a progress fill          (grows from left)
 *   .pv-knob / .pv-track   toggle parts (the flip)
 */
(function (global) {
  'use strict';

  var TK = global.TOKENS;

  function pal(id) { return TK.paletteById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // Unique gradient ids per render — several previews share the DOM at once.
  var uid = 0, ids = null;

  function backdrop(w, h, palette) {
    var dark = palette.dark !== false && palette.id !== 'appleLight';
    var a = dark ? '#3A3A46' : '#D9DDE6';
    var b = dark ? '#15151A' : '#F7F8FB';
    return '' +
      '<defs>' +
        '<linearGradient id="' + ids.bg + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/>' +
        '</linearGradient>' +
        '<linearGradient id="' + ids.sheen + '" x1="0" y1="0" x2="0.4" y2="1">' +
          '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.30"/>' +
          '<stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.04"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#' + ids.bg + ')"/>' +
      '<circle cx="' + (w * 0.18) + '" cy="' + (h * 0.82) + '" r="' + (h * 0.42) + '" fill="' + palette.accent + '" opacity="0.28"/>' +
      '<circle cx="' + (w * 0.86) + '" cy="' + (h * 0.16) + '" r="' + (h * 0.3) + '" fill="' + palette.accent + '" opacity="0.16"/>';
  }

  function glassFill(dark) {
    return dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.62)';
  }

  function surface(x, y, w, h, r, fill, glass, dark) {
    var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="' + fill + '"/>';
    if (glass) {
      s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#' + ids.sheen + ')"/>';
      s += '<rect x="' + (x + 0.5) + '" y="' + (y + 0.5) + '" width="' + (w - 1) + '" height="' + (h - 1) +
           '" rx="' + r + '" fill="none" stroke="#FFFFFF" stroke-opacity="0.4"/>';
    }
    return s;
  }

  function item(i, body) {
    return '<g class="pv-item" data-i="' + i + '">' + body + '</g>';
  }

  /* ------------------------------------------------------------------ card */

  function card(p, W, H) {
    var P = pal(p.palette), dark = P.dark !== false;
    var ratio = Math.min(W / (p.width + 120), H / (p.height + 90));
    var cw = p.width * ratio, ch = p.height * ratio;
    var x = (W - cw) / 2, y = (H - ch) / 2;
    var r = Math.min(p.radius * ratio, Math.min(cw, ch) / 2);
    var pad = p.padding * ratio;
    var fg = dark ? '#FFFFFF' : '#1C1C1E';
    var fill = p.glass ? glassFill(dark) : P.surface;

    var s = backdrop(W, H, P);
    var root = '';
    if (p.shadow) root += '<rect x="' + x + '" y="' + (y + 6) + '" width="' + cw + '" height="' + ch + '" rx="' + r + '" fill="#000" opacity="0.28"/>';
    root += surface(x, y, cw, ch, r, fill, p.glass, dark);

    var cx = x + pad, cy = y + pad;
    if (p.icon) {
      var is = Math.max(10, Math.min(ch * 0.24, 34));
      root += item(0, '<rect x="' + cx + '" y="' + cy + '" width="' + is + '" height="' + is + '" rx="' + (is * 0.28) + '" fill="' + P.accent + '"/>');
      cy += is + 10;
    }
    if (p.title) {
      root += item(1, '<text x="' + cx + '" y="' + (cy + 11) + '" font-size="12" font-weight="600" fill="' + fg + '">' + esc(clip(p.title, 22)) + '</text>');
      cy += 18;
    }
    if (p.subtitle) root += item(2, '<text x="' + cx + '" y="' + (cy + 9) + '" font-size="10" fill="' + fg + '" opacity="0.55">' + esc(clip(p.subtitle, 26)) + '</text>');
    if (p.value) {
      var vSize = Math.max(13, Math.min(ch * 0.2, cw * 0.15, 26));
      root += item(3, '<text x="' + cx + '" y="' + (y + ch - pad) + '" font-size="' + vSize + '" font-weight="700" fill="' + fg + '" letter-spacing="-0.5">' + esc(clip(p.value, 12)) + '</text>');
    }
    return s + '<g class="pv-root">' + root + '</g>';
  }

  /* ---------------------------------------------------------- notification */

  function notification(p, W, H) {
    var P = pal(p.palette), dark = P.dark !== false;
    var height = p.width * 0.24;
    var ratio = Math.min(W / (p.width + 90), H / (height + 90));
    var cw = p.width * ratio, ch = height * ratio;
    var x = (W - cw) / 2, y = (H - ch) / 2;
    var r = Math.min(p.radius * ratio, ch / 2);
    var fg = dark ? '#FFFFFF' : '#1C1C1E';
    var accent = statusAccent(p, P);
    var fill = p.glass ? (dark ? 'rgba(40,40,46,0.72)' : 'rgba(255,255,255,0.72)') : P.surface;

    var s = backdrop(W, H, P);
    var root = '';
    if (p.shadow) root += '<rect x="' + x + '" y="' + (y + 5) + '" width="' + cw + '" height="' + ch + '" rx="' + r + '" fill="#000" opacity="0.3"/>';
    root += surface(x, y, cw, ch, r, fill, p.glass, dark);

    var is = ch * 0.58, ix = x + ch * 0.21, iy = y + (ch - is) / 2;
    root += item(0, '<rect x="' + ix + '" y="' + iy + '" width="' + is + '" height="' + is + '" rx="' + (is * 0.26) + '" fill="' + accent + '"/>');
    var tx = ix + is + 12;
    root += item(1, '<text x="' + tx + '" y="' + (y + ch * 0.36) + '" font-size="8" font-weight="600" letter-spacing="0.8" fill="' + fg + '" opacity="0.55">' + esc(clip(p.appName, 18)) + '</text>');
    root += item(2, '<text x="' + tx + '" y="' + (y + ch * 0.58) + '" font-size="11" font-weight="600" fill="' + fg + '">' + esc(clip(p.title, 20)) + '</text>');
    root += item(3, '<text x="' + tx + '" y="' + (y + ch * 0.79) + '" font-size="10" fill="' + fg + '" opacity="0.7">' + esc(clip(p.message, 30)) + '</text>');
    root += item(4, '<text x="' + (x + cw - ch * 0.21) + '" y="' + (y + ch * 0.36) + '" font-size="8" text-anchor="end" fill="' + fg + '" opacity="0.45">' + esc(clip(p.time, 8)) + '</text>');
    return s + '<g class="pv-root">' + root + '</g>';
  }

  function statusAccent(p, P) {
    if (p.variant === 'success') return TK.semantic.success;
    if (p.variant === 'error') return TK.semantic.error;
    if (p.variant === 'warning') return TK.semantic.warning;
    return P.accent;
  }

  /* ---------------------------------------------------------------- toggle */

  function toggle(p, W, H) {
    var P = pal(p.palette);
    var tw = Math.min(p.size, 160), th = tw * 0.6;
    var ratio = Math.min(W / (tw + 260), H / (th + 120), 1.0);
    var w = tw * ratio, h = th * ratio;
    var showLabel = p.showLabel && p.label;
    var gap = showLabel ? Math.min(170, W * 0.42) : 0;
    var totalW = w + gap;
    var x = (W - totalW) / 2 + gap, y = (H - h) / 2;
    var knob = h * 0.8;
    var fg = P.id === 'appleLight' ? '#1C1C1E' : '#FFFFFF';
    var inset = (h - knob) / 2;
    var kx = p.on ? x + w - knob - inset : x + inset;

    var s = backdrop(W, H, P);
    var root = '';
    if (showLabel) root += item(0, '<text x="' + ((W - totalW) / 2) + '" y="' + (y + h / 2 + 4) + '" font-size="12" font-weight="500" fill="' + fg + '">' + esc(clip(p.label, 20)) + '</text>');
    root += '<rect class="pv-track" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (h / 2) +
            '" fill="' + (p.on ? P.accent : 'rgba(120,120,128,0.5)') + '"/>';
    root += '<circle class="pv-knob" cx="' + (kx + knob / 2) + '" cy="' + (y + h / 2) + '" r="' + (knob / 2) + '" fill="#FFFFFF"' +
            ' data-x-off="' + (x + inset + knob / 2) + '" data-x-on="' + (x + w - knob - inset + knob / 2) + '"/>';
    return s + '<g class="pv-root">' + root + '</g>';
  }

  /* ---------------------------------------------------------------- button */

  function button(p, W, H) {
    var P = pal(p.palette), dark = P.dark !== false;
    var v = p.variant || 'primary';
    var bw = Math.min(p.width || 260, W - 60), bh = (p.height || 64);
    var ratio = Math.min(W / (bw + 80), H / (bh + 80), 1);
    var w = bw * ratio, h = bh * ratio;
    var x = (W - w) / 2, y = (H - h) / 2;
    var pill = v === 'pill' || v === 'floating';
    var r = pill ? h / 2 : Math.min((p.radius || 16) * ratio, h / 2);

    var bg, fg = '#FFFFFF', stroke = null, glass = false;
    if (v === 'secondary') { bg = dark ? 'rgba(120,120,128,0.28)' : 'rgba(120,120,128,0.16)'; fg = P.accent; }
    else if (v === 'glass') { bg = glassFill(dark); glass = true; fg = dark ? '#FFFFFF' : '#1C1C1E'; }
    else if (v === 'ghost') { bg = 'none'; stroke = P.accent; fg = P.accent; }
    else { bg = P.accent; fg = '#FFFFFF'; } // primary, pill, floating, icon

    var s = backdrop(W, H, P);
    var root = '';
    if (v === 'floating') root += '<rect x="' + x + '" y="' + (y + 5) + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="#000" opacity="0.3"/>';
    if (v === 'icon') {
      var d = Math.min(w, h);
      x = (W - d) / 2; w = d; r = d / 2;
    }
    if (bg !== 'none') root += surface(x, y, w, h, r, bg, glass, dark);
    if (stroke) root += '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="' + r + '" fill="none" stroke="' + stroke + '" stroke-width="1.5"/>';

    if (v === 'icon') {
      var g = w * 0.32;
      root += item(0, '<path d="M' + (x + w / 2 - g / 2) + ' ' + (y + h / 2) + ' h' + g + ' M' + (x + w / 2) + ' ' + (y + h / 2 - g / 2) + ' v' + g + '" stroke="' + fg + '" stroke-width="2.2" stroke-linecap="round"/>');
    } else {
      root += item(0, '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" font-size="' + Math.max(11, h * 0.34) + '" font-weight="600" fill="' + fg + '">' + esc(clip(p.label || 'Button', 18)) + '</text>');
    }
    return s + '<g class="pv-root">' + root + '</g>';
  }

  /* ----------------------------------------------------------------- chart */

  function chart(p, W, H) {
    var P = pal(p.palette), dark = P.dark !== false;
    var pad = 22, x0 = pad, y1 = H - pad - 8, x1 = W - pad;
    var chW = x1 - x0, chH = y1 - (pad + 6);
    var data = p.data || [0.45, 0.68, 0.52, 0.81, 0.63, 0.95, 0.74];
    var kind = p.chartKind || 'bar';
    var fg = dark ? '#FFFFFF' : '#1C1C1E';

    var s = backdrop(W, H, P);
    // baseline grid
    var grid = '';
    for (var g = 0; g <= 3; g++) {
      var gy = (pad + 6) + chH * (g / 3);
      grid += '<line x1="' + x0 + '" y1="' + gy + '" x2="' + x1 + '" y2="' + gy + '" stroke="' + fg + '" stroke-opacity="0.08"/>';
    }
    var root = grid;

    if (kind === 'line' || kind === 'area') {
      var pts = data.map(function (d, i) {
        return [x0 + chW * (i / (data.length - 1)), y1 - chH * d];
      });
      var dPath = pts.map(function (pt, i) { return (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1); }).join(' ');
      if (kind === 'area') {
        root += '<path class="pv-area" d="' + dPath + ' L' + x1 + ' ' + y1 + ' L' + x0 + ' ' + y1 + ' Z" fill="' + P.accent + '" opacity="0.18"/>';
      }
      root += '<path class="pv-line" d="' + dPath + '" fill="none" stroke="' + P.accent + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
      pts.forEach(function (pt, i) {
        root += item(i, '<circle cx="' + pt[0].toFixed(1) + '" cy="' + pt[1].toFixed(1) + '" r="2.6" fill="' + P.accent + '"/>');
      });
    } else {
      var bw = chW / data.length * 0.62, gapW = chW / data.length;
      data.forEach(function (d, i) {
        var bh = Math.max(3, chH * d);
        var bx = x0 + gapW * i + (gapW - bw) / 2;
        var by = y1 - bh;
        root += '<rect class="pv-bar" data-i="' + i + '" x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + Math.min(3, bw / 2) + '" fill="' + P.accent + '"/>';
      });
    }
    return s + '<g class="pv-root">' + root + '</g>';
  }

  /* -------------------------------------------------------------- progress */

  function progress(p, W, H) {
    var P = pal(p.palette), dark = P.dark !== false;
    var frac = Math.max(0, Math.min(1, (p.value == null ? 68 : p.value) / 100));
    if (p.variant === 'ring') {
      var cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.28, sw = rad * 0.28;
      var circ = 2 * Math.PI * rad;
      var s2 = backdrop(W, H, P);
      var root2 = '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="none" stroke="' + (dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.1)') + '" stroke-width="' + sw + '"/>';
      root2 += '<circle class="pv-ring" cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="none" stroke="' + P.accent + '" stroke-width="' + sw + '" stroke-linecap="round"' +
               ' stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + (circ * (1 - frac)).toFixed(1) + '" data-circ="' + circ.toFixed(1) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      root2 += '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" font-size="16" font-weight="700" fill="' + (dark ? '#FFF' : '#1C1C1E') + '">' + Math.round(frac * 100) + '%</text>';
      return s2 + '<g class="pv-root">' + root2 + '</g>';
    }
    var pad = 34, bx = pad, bw = W - pad * 2, bh = 12, by = H / 2 - bh / 2;
    var s = backdrop(W, H, P);
    var root = '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="' + (bh / 2) + '" fill="' + (dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.1)') + '"/>';
    root += '<rect class="pv-fill" x="' + bx + '" y="' + by + '" width="' + (bw * frac).toFixed(1) + '" height="' + bh + '" rx="' + (bh / 2) + '" fill="' + P.accent + '" data-full="' + bw.toFixed(1) + '"/>';
    return s + '<g class="pv-root">' + root + '</g>';
  }

  /* ----------------------------------------------------------------- badge */

  function badge(p, W, H) {
    var P = pal(p.palette), dark = P.dark !== false;
    var accent = statusAccent(p, P);
    var text = p.label || 'NEW';
    var w = Math.min(W - 60, 40 + text.length * 9), h = 26;
    var x = (W - w) / 2, y = (H - h) / 2;
    var pill = p.variant !== 'square';
    var r = pill ? h / 2 : 8;
    var glass = p.variant === 'glass';
    var bg = glass ? glassFill(dark) : accent;
    var fg = glass ? (dark ? '#FFF' : '#1C1C1E') : '#FFFFFF';
    var s = backdrop(W, H, P);
    var root = surface(x, y, w, h, r, bg, glass, dark);
    root += item(0, '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="0.6" fill="' + fg + '">' + esc(clip(text.toUpperCase(), 12)) + '</text>');
    return s + '<g class="pv-root">' + root + '</g>';
  }

  var RENDERERS = {
    card: card, notification: notification, toggle: toggle,
    button: button, chart: chart, progress: progress, badge: badge
  };

  function render(id, params, w, h) {
    w = w || 260; h = h || 150;
    uid++;
    ids = { bg: 'amui-bg-' + uid, sheen: 'amui-sheen-' + uid };
    var fn = RENDERERS[id];
    var body = fn ? fn(params, w, h) : ('<rect width="' + w + '" height="' + h + '" fill="#222"/>' +
      '<text x="' + (w / 2) + '" y="' + (h / 2) + '" text-anchor="middle" fill="#888" font-size="12">' + esc(id) + '</text>');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" ' +
           'preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">' + body + '</svg>';
  }

  global.PREVIEWS = { render: render, renderers: RENDERERS };
})(window);
