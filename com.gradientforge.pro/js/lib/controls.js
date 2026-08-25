/**
 * controls.js — one labelled control, built from a parameter definition.
 *
 * Every parameter in the panel is one of these, described by the same shape —
 * `{ key, label, type, min, max, step, unit, options, placeholder }`. The
 * control writes straight back into `target[key]`, then calls `onChange(key)`.
 *
 * Types: number (slider + numeric field), bool (switch), select, color, text.
 */
(function (global) {
  'use strict';

  function field(p, target, onChange) {
    var el = document.createElement('div');
    el.className = 'field';
    el.dataset.key = p.key;

    var label = document.createElement('label');
    label.textContent = p.label + (p.unit ? ' (' + p.unit + ')' : '');
    label.setAttribute('for', 'f_' + p.key);
    el.appendChild(label);

    var control = document.createElement('div');
    control.className = 'control';
    control.appendChild(makeControl(p, target, onChange));
    el.appendChild(control);
    return el;
  }

  function makeControl(p, target, onChange) {
    var frag = document.createDocumentFragment();
    var fire = onChange || function () {};

    if (p.type === 'number') {
      var range = document.createElement('input');
      range.type = 'range';
      range.min = p.min; range.max = p.max; range.step = p.step || 1;
      range.value = target[p.key];
      var num = document.createElement('input');
      num.type = 'number';
      num.id = 'f_' + p.key;
      num.min = p.min; num.max = p.max; num.step = p.step || 1;
      num.value = target[p.key];
      var commit = function (v) {
        v = Math.max(p.min, Math.min(p.max, Number(v)));
        if (isNaN(v)) v = p.min;
        target[p.key] = v; range.value = v; num.value = v; fire(p.key);
      };
      range.addEventListener('input', function () { commit(range.value); });
      num.addEventListener('change', function () { commit(num.value); });
      frag.appendChild(range); frag.appendChild(num);

    } else if (p.type === 'bool') {
      var sw = document.createElement('button');
      sw.type = 'button'; sw.className = 'switch'; sw.id = 'f_' + p.key;
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!target[p.key]));
      sw.addEventListener('click', function () {
        target[p.key] = !target[p.key];
        sw.setAttribute('aria-checked', String(target[p.key]));
        fire(p.key);
      });
      frag.appendChild(sw);

    } else if (p.type === 'select') {
      var sel = document.createElement('select');
      sel.id = 'f_' + p.key;
      p.options.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value; opt.textContent = o.label;
        if (o.value === target[p.key]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { target[p.key] = sel.value; fire(p.key); });
      frag.appendChild(sel);

    } else if (p.type === 'color') {
      var col = document.createElement('input');
      col.type = 'color'; col.id = 'f_' + p.key; col.className = 'swatch';
      col.value = target[p.key];
      col.addEventListener('input', function () { target[p.key] = col.value; fire(p.key); });
      frag.appendChild(col);

    } else {
      var txt = document.createElement('input');
      txt.type = 'text'; txt.id = 'f_' + p.key; txt.value = target[p.key];
      if (p.placeholder) txt.placeholder = p.placeholder;
      txt.addEventListener('input', function () { target[p.key] = txt.value; fire(p.key); });
      frag.appendChild(txt);
    }
    return frag;
  }

  /** Push a value that changed elsewhere back into an already-built control. */
  function sync(root, key, value) {
    var f = root.querySelector('.field[data-key="' + key + '"]');
    if (!f) return;
    var range = f.querySelector('input[type=range]');
    var num = f.querySelector('input[type=number]');
    var sel = f.querySelector('select');
    var col = f.querySelector('input[type=color]');
    if (range) range.value = value;
    if (num) num.value = value;
    if (sel) sel.value = value;
    if (col) col.value = value;
  }

  global.CONTROLS = { field: field, control: makeControl, sync: sync };
})(window);
