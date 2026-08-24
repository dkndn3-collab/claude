/**
 * previews.js
 * Draws each component as inline SVG using the exact parameters that will be
 * sent to After Effects. The tile you click is a rendering of what you get —
 * not a screenshot that drifts out of date as the generator changes.
 */
(function (global) {
  'use strict';

  var L = global.LIBRARY;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // Several previews live in the DOM at once. Gradient ids must be unique or
  // url(#bg) resolves to whichever preview rendered first.
  var uid = 0;
  var ids = null;

  function backdrop(w, h, palette) {
    var dark = palette.id !== 'appleLight';
    var a = dark ? '#3A3A46' : '#D9DDE6';
    var b = dark ? '#15151A' : '#F7F8FB';
    return '' +
      '<defs>' +
        '<linearGradient id="' + ids.bg + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + a + '"/>' +
          '<stop offset="1" stop-color="' + b + '"/>' +
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

  /* ------------------------------------------------------------------ */

  function card(p, W, H) {
    var pal = L.paletteById(p.palette);
    var dark = pal.id !== 'appleLight';
    var ratio = Math.min(W / (p.width + 120), H / (p.height + 90));
    var cw = p.width * ratio, ch = p.height * ratio;
    var x = (W - cw) / 2, y = (H - ch) / 2;
    var r = Math.min(p.radius * ratio, Math.min(cw, ch) / 2);
    var pad = p.padding * ratio;
    var fg = dark ? '#FFFFFF' : '#1C1C1E';
    var fill = p.glass
      ? (dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.62)')
      : pal.surface;

    var s = backdrop(W, H, pal);
    if (p.shadow) {
      s += '<rect x="' + x + '" y="' + (y + 6) + '" width="' + cw + '" height="' + ch +
           '" rx="' + r + '" fill="#000" opacity="0.28"/>';
    }
    s += '<rect x="' + x + '" y="' + y + '" width="' + cw + '" height="' + ch + '" rx="' + r + '" fill="' + fill + '"/>';
    if (p.glass) {
      s += '<rect x="' + x + '" y="' + y + '" width="' + cw + '" height="' + ch + '" rx="' + r + '" fill="url(#' + ids.sheen + ')"/>';
      s += '<rect x="' + (x + 0.5) + '" y="' + (y + 0.5) + '" width="' + (cw - 1) + '" height="' + (ch - 1) +
           '" rx="' + r + '" fill="none" stroke="' + (dark ? '#FFFFFF' : '#FFFFFF') + '" stroke-opacity="0.4"/>';
    }

    var cx = x + pad, cy = y + pad;
    if (p.icon) {
      var is = Math.max(10, Math.min(ch * 0.24, 34));
      s += '<rect x="' + cx + '" y="' + cy + '" width="' + is + '" height="' + is +
           '" rx="' + (is * 0.28) + '" fill="' + pal.accent + '"/>';
      cy += is + 10;
    }
    if (p.title) {
      s += '<text x="' + cx + '" y="' + (cy + 11) + '" font-size="12" font-weight="600" fill="' + fg + '">' +
           esc(clip(p.title, 22)) + '</text>';
      cy += 18;
    }
    if (p.subtitle) {
      s += '<text x="' + cx + '" y="' + (cy + 9) + '" font-size="10" fill="' + fg + '" opacity="0.55">' +
           esc(clip(p.subtitle, 26)) + '</text>';
    }
    if (p.value) {
      var vSize = Math.max(13, Math.min(ch * 0.2, cw * 0.15, 26));
      s += '<text x="' + cx + '" y="' + (y + ch - pad) + '" font-size="' + vSize +
           '" font-weight="700" fill="' + fg + '" letter-spacing="-0.5">' + esc(clip(p.value, 12)) + '</text>';
    }
    return s;
  }

  function notification(p, W, H) {
    var pal = L.paletteById(p.palette);
    var dark = pal.id !== 'appleLight';
    var height = p.width * 0.24;
    var ratio = Math.min(W / (p.width + 90), H / (height + 90));
    var cw = p.width * ratio, ch = height * ratio;
    var x = (W - cw) / 2, y = (H - ch) / 2;
    var r = Math.min(p.radius * ratio, ch / 2);
    var fg = dark ? '#FFFFFF' : '#1C1C1E';
    var fill = p.glass
      ? (dark ? 'rgba(40,40,46,0.72)' : 'rgba(255,255,255,0.72)')
      : pal.surface;

    var s = backdrop(W, H, pal);
    if (p.shadow) {
      s += '<rect x="' + x + '" y="' + (y + 5) + '" width="' + cw + '" height="' + ch +
           '" rx="' + r + '" fill="#000" opacity="0.3"/>';
    }
    s += '<rect x="' + x + '" y="' + y + '" width="' + cw + '" height="' + ch + '" rx="' + r + '" fill="' + fill + '"/>';
    if (p.glass) {
      s += '<rect x="' + x + '" y="' + y + '" width="' + cw + '" height="' + ch + '" rx="' + r + '" fill="url(#' + ids.sheen + ')"/>';
      s += '<rect x="' + (x + 0.5) + '" y="' + (y + 0.5) + '" width="' + (cw - 1) + '" height="' + (ch - 1) +
           '" rx="' + r + '" fill="none" stroke="#FFFFFF" stroke-opacity="0.34"/>';
    }

    var is = ch * 0.58;
    var ix = x + ch * 0.21, iy = y + (ch - is) / 2;
    s += '<rect x="' + ix + '" y="' + iy + '" width="' + is + '" height="' + is +
         '" rx="' + (is * 0.26) + '" fill="' + pal.accent + '"/>';

    var tx = ix + is + 12;
    s += '<text x="' + tx + '" y="' + (y + ch * 0.36) + '" font-size="8" font-weight="600" letter-spacing="0.8" fill="' + fg + '" opacity="0.55">' +
         esc(clip(p.appName, 18)) + '</text>';
    s += '<text x="' + tx + '" y="' + (y + ch * 0.58) + '" font-size="11" font-weight="600" fill="' + fg + '">' +
         esc(clip(p.title, 20)) + '</text>';
    s += '<text x="' + tx + '" y="' + (y + ch * 0.79) + '" font-size="10" fill="' + fg + '" opacity="0.7">' +
         esc(clip(p.message, 30)) + '</text>';
    s += '<text x="' + (x + cw - ch * 0.21) + '" y="' + (y + ch * 0.36) + '" font-size="8" text-anchor="end" fill="' + fg + '" opacity="0.45">' +
         esc(clip(p.time, 8)) + '</text>';
    return s;
  }

  function toggle(p, W, H) {
    var pal = L.paletteById(p.palette);
    var tw = Math.min(p.size, 160), th = tw * 0.6;
    var ratio = Math.min(W / (tw + 260), H / (th + 120), 1.0);
    var w = tw * ratio, h = th * ratio;
    var showLabel = p.showLabel && p.label;
    var gap = showLabel ? Math.min(170, W * 0.42) : 0;
    var totalW = w + gap;
    var x = (W - totalW) / 2 + gap;
    var y = (H - h) / 2;
    var knob = h * 0.8;
    var fg = pal.id === 'appleLight' ? '#1C1C1E' : '#FFFFFF';

    var s = backdrop(W, H, pal);
    if (showLabel) {
      s += '<text x="' + ((W - totalW) / 2) + '" y="' + (y + h / 2 + 4) + '" font-size="12" font-weight="500" fill="' + fg + '">' +
           esc(clip(p.label, 20)) + '</text>';
    }
    s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (h / 2) +
         '" fill="' + (p.on ? pal.accent : 'rgba(120,120,128,0.5)') + '"/>';
    var inset = (h - knob) / 2;
    var kx = p.on ? x + w - knob - inset : x + inset;
    s += '<circle cx="' + (kx + knob / 2) + '" cy="' + (y + h / 2) + '" r="' + (knob / 2) + '" fill="#FFFFFF"/>';
    return s;
  }

  var RENDERERS = { card: card, notification: notification, toggle: toggle };

  /**
   * @param {string} id component id
   * @param {object} params current parameter values
   * @param {number} w svg viewBox width
   * @param {number} h svg viewBox height
   */
  function render(id, params, w, h) {
    w = w || 260; h = h || 150;
    uid++;
    ids = { bg: 'amui-bg-' + uid, sheen: 'amui-sheen-' + uid };
    var fn = RENDERERS[id];
    var body = fn ? fn(params, w, h) : '<rect width="' + w + '" height="' + h + '" fill="#222"/>';
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" ' +
           'preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">' + body + '</svg>';
  }

  global.PREVIEWS = { render: render };
})(window);
