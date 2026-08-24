/**
 * animator.js — plays a real entrance animation over a rendered preview (§24).
 *
 * The preview SVG marks its parts with pv-* classes; this drives them with the
 * Web Animations API using the *same* motion preset the component will get in
 * After Effects. Spring presets are sampled from the shared damped-oscillator
 * physics in motion.js, so the hover preview and the built layer move alike.
 *
 * Components choreograph themselves: a card scales/rises in and its content
 * staggers; a notification drops from the top; a chart builds its bars; a toggle
 * flips; a progress bar fills. That is what makes the library feel premium.
 */
(function (global) {
  'use strict';

  var M = global.MOTION;
  var supported = typeof Element !== 'undefined' && !!Element.prototype.animate;

  // Amplitude in the preview's own coordinate space — the component's px travel
  // scaled down so it reads inside a thumbnail.
  function pvAmp(a) { return Math.min(a == null ? 40 : a, 48); }

  function cb(p) { return p.spring ? 'linear' : M.cubicBezierCss(p.easing); }

  function setOrigin(el, origin) {
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = origin || 'center';
  }

  /** WAAPI keyframes for a transform channel, spring-sampled when needed. */
  function channelKeys(kind, from, to, p) {
    function tf(v) {
      return kind === 'scale' ? 'scale(' + v + ')'
           : kind === 'tx'    ? 'translateX(' + v + 'px)'
           :                    'translateY(' + v + 'px)';
    }
    if (p.spring) {
      return M.springSamples(from, to, p, 44).map(function (s) {
        return { offset: s.offset, transform: tf(s.value) };
      });
    }
    return [{ transform: tf(from) }, { transform: tf(to) }];
  }

  function timing(p, extraDelay, fraction) {
    return {
      duration: Math.max(80, p.duration * 1000 * (fraction || 1)),
      delay: (p.delay || 0) * 1000 + (extraDelay || 0),
      easing: cb(p),
      fill: 'both'
    };
  }

  var running = []; // active animations, so a new hover cancels the old

  function track(anim) { if (anim) running.push(anim); return anim; }

  function stop() {
    running.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    running = [];
  }

  /* ---- element-level moves ---------------------------------------------- */

  function fadeIn(el, p, delay, frac) {
    if (!el) return;
    track(el.animate([{ opacity: 0 }, { opacity: 1 }], timing(p, delay, frac || 0.6)));
  }

  function entrance(root, p) {
    if (!root) return;
    setOrigin(root, 'center');
    var amp = pvAmp(p.amplitude);
    fadeIn(root, p, 0, 0.6);
    if (p.direction === 'scale') {
      var from = Math.max(0.3, 1 - pvAmp(p.amplitude) / 120);
      track(root.animate(channelKeys('scale', from, 1, p), timing(p)));
    } else if (p.direction === 'up') {
      track(root.animate(channelKeys('ty', amp, 0, p), timing(p)));
    } else if (p.direction === 'down') {
      track(root.animate(channelKeys('ty', -amp, 0, p), timing(p)));
    } else if (p.direction === 'left') {
      track(root.animate(channelKeys('tx', amp, 0, p), timing(p)));
    } else if (p.direction === 'right') {
      track(root.animate(channelKeys('tx', -amp, 0, p), timing(p)));
    }
    // 'fade' is opacity only.
  }

  function staggerItems(scope, p) {
    var items = scope.querySelectorAll('.pv-item');
    for (var i = 0; i < items.length; i++) {
      var d = (p.delay || 0) * 1000 + 90 + i * Math.max(40, (p.stagger || 0.06) * 1000);
      setOrigin(items[i], 'center');
      track(items[i].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: d, easing: M.cubicBezierCss(p.easing), fill: 'both' }));
      track(items[i].animate([{ transform: 'translateY(6px)' }, { transform: 'translateY(0)' }], { duration: 320, delay: d, easing: M.cubicBezierCss(p.easing), fill: 'both' }));
    }
  }

  /* ---- per-component choreography --------------------------------------- */

  var CHOREO = {
    toggle: function (svg, p) {
      var knob = svg.querySelector('.pv-knob');
      var track_ = svg.querySelector('.pv-track');
      if (knob) {
        var xOff = parseFloat(knob.getAttribute('data-x-off'));
        var xOn = parseFloat(knob.getAttribute('data-x-on'));
        var drawn = parseFloat(knob.getAttribute('cx'));
        setOrigin(knob, 'center');
        var sp = M.resolve('snappy', { duration: Math.max(0.4, p.duration) });
        track(knob.animate(channelKeys('tx', xOff - drawn, xOn - drawn, sp), timing(sp)));
      }
      if (track_) {
        var accent = track_.getAttribute('fill');
        track(track_.animate(
          [{ fill: 'rgba(120,120,128,0.5)' }, { fill: accent }],
          { duration: Math.max(300, p.duration * 700), easing: 'ease-out', fill: 'both' }
        ));
      }
    },

    chart: function (svg, p) {
      var bars = svg.querySelectorAll('.pv-bar');
      var i, d;
      for (i = 0; i < bars.length; i++) {
        setOrigin(bars[i], 'bottom');
        d = (p.delay || 0) * 1000 + i * Math.max(50, (p.stagger || 0.07) * 1000);
        track(bars[i].animate(
          [{ transform: 'scaleY(0)', opacity: 0.4 }, { transform: 'scaleY(1)', opacity: 1 }],
          springOrEase(p, d)));
      }
      var line = svg.querySelector('.pv-line');
      if (line && line.getTotalLength) {
        var len = line.getTotalLength();
        line.style.strokeDasharray = len;
        track(line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: Math.max(500, p.duration * 1000), delay: (p.delay || 0) * 1000, easing: M.cubicBezierCss(p.easing), fill: 'both' }));
      }
      var area = svg.querySelector('.pv-area');
      if (area) track(area.animate([{ opacity: 0 }, { opacity: 0.18 }], timing(p, 200, 0.8)));
      var pts = svg.querySelectorAll('.pv-item');
      for (i = 0; i < pts.length; i++) {
        d = (p.delay || 0) * 1000 + 200 + i * 60;
        track(pts[i].animate([{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 300, delay: d, easing: M.cubicBezierCss(M.byId('spring').easing), fill: 'both' }));
        setOrigin(pts[i], 'center');
      }
    },

    progress: function (svg, p) {
      var fill = svg.querySelector('.pv-fill');
      if (fill) {
        setOrigin(fill, 'left');
        track(fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], springOrEase(p, 0)));
      }
      var ring = svg.querySelector('.pv-ring');
      if (ring) {
        var circ = parseFloat(ring.getAttribute('data-circ'));
        var target = parseFloat(ring.getAttribute('stroke-dashoffset'));
        track(ring.animate([{ strokeDashoffset: circ }, { strokeDashoffset: target }],
          { duration: Math.max(500, p.duration * 1000), delay: (p.delay || 0) * 1000, easing: M.cubicBezierCss(p.easing), fill: 'both' }));
      }
    }
  };

  function springOrEase(p, delay) {
    return {
      duration: Math.max(200, p.duration * 1000),
      delay: (p.delay || 0) * 1000 + (delay || 0),
      easing: p.spring ? 'cubic-bezier(0.34,1.4,0.5,1)' : M.cubicBezierCss(p.easing),
      fill: 'both'
    };
  }

  /* ---- public ----------------------------------------------------------- */

  /**
   * @param {Element} container  element that contains the rendered <svg>
   * @param {string}  id         component id
   * @param {object}  animParams { preset, duration, delay, ... } from the builder
   */
  function play(container, id, animParams) {
    if (!supported || !container) return;
    stop();
    var svg = container.querySelector('svg') || container;
    var p = M.resolve((animParams && animParams.preset) || 'appleEase', animParams);

    var special = CHOREO[id];
    if (special) { special(svg, p); return; }

    // Default: the whole component enters, then its content staggers in.
    entrance(svg.querySelector('.pv-root'), p);
    staggerItems(svg, p);
  }

  global.ANIMATOR = { play: play, stop: stop, supported: supported };
})(window);
