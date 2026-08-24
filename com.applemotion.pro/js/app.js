/**
 * app.js — panel controller.
 *
 * Three views (components / motion / actions) render from LIBRARY, one search
 * box filters all of them, and a slide-up sheet collects parameters before
 * handing off to ExtendScript through CEP.call().
 */
(function () {
  'use strict';

  var L = window.LIBRARY;
  var P = window.PREVIEWS;

  var el = {
    search:      document.getElementById('search'),
    searchWrap:  document.getElementById('searchWrap'),
    searchClear: document.getElementById('searchClear'),
    tabs:        Array.prototype.slice.call(document.querySelectorAll('.tab')),
    views: {
      components: document.getElementById('view-components'),
      motion:     document.getElementById('view-motion'),
      actions:    document.getElementById('view-actions')
    },
    status:    document.getElementById('status'),
    statusMsg: document.getElementById('statusMsg'),
    sheet:      document.getElementById('sheet'),
    sheetTitle: document.getElementById('sheetTitle'),
    sheetSub:   document.getElementById('sheetSub'),
    sheetHero:  document.getElementById('sheetHero'),
    sheetFields:document.getElementById('sheetFields'),
    sheetBack:  document.getElementById('sheetBack'),
    sheetReset: document.getElementById('sheetReset'),
    sheetCreate:document.getElementById('sheetCreate')
  };

  var state = {
    view: 'components',
    query: '',
    component: null,   // the component definition currently in the sheet
    params: null       // its live parameter values
  };

  /* ---------------------------------------------------------------- theme */

  function applyHostTheme() {
    var luma = window.CEP.hostBackgroundLuma();
    if (luma == null) return;
    document.documentElement.setAttribute('data-theme', luma > 0.5 ? 'light' : 'dark');
  }

  /* --------------------------------------------------------------- status */

  var statusTimer = null;

  function setStatus(msg, state_) {
    clearTimeout(statusTimer);
    el.statusMsg.textContent = msg;
    el.status.setAttribute('data-state', state_ || 'idle');
    if (state_ === 'ok' || state_ === 'err') {
      statusTimer = setTimeout(function () {
        el.statusMsg.textContent = 'Ready';
        el.status.setAttribute('data-state', 'idle');
      }, 5000);
    }
  }

  /* -------------------------------------------------------------- filtering */

  function matches(haystack, query) {
    if (!query) return true;
    var text = haystack.join(' ').toLowerCase();
    return query.split(/\s+/).every(function (word) { return text.indexOf(word) !== -1; });
  }

  function filteredComponents() {
    return L.components.filter(function (c) {
      return matches([c.id, c.name, c.category, c.blurb].concat(c.tags), state.query);
    });
  }

  function filteredMotion() {
    return L.motion.filter(function (m) {
      return matches([m.id, m.name, m.category, m.blurb], state.query);
    });
  }

  function filteredActions() {
    return L.quickActions.filter(function (a) {
      return matches([a.id, a.name, a.blurb], state.query);
    });
  }

  /* --------------------------------------------------------------- render */

  function emptyState(what) {
    return '<div class="empty"><strong>No ' + what + ' match “' + escapeHtml(state.query) + '”</strong>' +
           'Try a shorter word, like “glass” or “spring”.</div>';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderComponents() {
    var list = filteredComponents();
    var view = el.views.components;
    if (!list.length) { view.innerHTML = emptyState('components'); return; }

    var html = '<div class="section-label"><span>Components</span><span>' + list.length + '</span></div><div class="grid">';
    list.forEach(function (c) {
      var art = P.render(c.id, L.defaults(c), 260, 146);
      html += '<button class="tile" data-component="' + c.id + '" title="' + escapeHtml(c.blurb) + '">' +
                '<span class="tile-art">' + art + '</span>' +
                '<span class="tile-meta">' +
                  '<span class="tile-name">' + escapeHtml(c.name) + '</span>' +
                  '<span class="tile-cat">' + escapeHtml(c.category) + '</span>' +
                '</span>' +
              '</button>';
    });
    view.innerHTML = html + '</div>';
  }

  /** Tiny curve thumbnail so each easing reads differently at a glance. */
  function curveArt(id) {
    var paths = {
      appleEase:    'M2,20 C10,20 12,2 32,2',
      spring:       'M2,20 C8,20 10,-3 15,4 C19,9 21,0 25,3 C28,5 29,2 32,2',
      smoothSpring: 'M2,20 C10,20 13,0 19,1 C24,2 27,3 32,2',
      overshoot:    'M2,20 C10,20 14,-2 20,0 C26,2 28,2 32,2',
      bounce:       'M2,20 C8,20 12,2 16,2 C19,2 19,9 22,9 C25,9 25,3 28,3 C30,3 30,2 32,2',
      elastic:      'M2,20 C7,20 9,-4 13,3 C16,8 18,-1 22,4 C25,8 27,0 32,2',
      fadeUp:       'M2,20 C12,20 14,4 32,2',
      scaleIn:      'M2,20 C9,20 13,3 32,2',
      blurIn:       'M2,20 C14,20 16,4 32,2',
      slideIn:      'M2,20 C11,20 13,3 32,2'
    };
    return '<svg viewBox="0 0 34 22" aria-hidden="true">' +
             '<path d="' + (paths[id] || paths.appleEase) + '" fill="none" ' +
             'stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/>' +
           '</svg>';
  }

  function renderMotion() {
    var list = filteredMotion();
    var view = el.views.motion;
    if (!list.length) { view.innerHTML = emptyState('presets'); return; }

    var html = '<div class="section-label"><span>Apply to selected layers</span><span>' + list.length + '</span></div>' +
               '<div class="row-list">';
    list.forEach(function (m) {
      html += '<button class="row" data-motion="' + m.id + '">' +
                '<span class="row-curve">' + curveArt(m.id) + '</span>' +
                '<span class="row-text">' +
                  '<span class="row-name">' + escapeHtml(m.name) + '</span>' +
                  '<span class="row-blurb">' + escapeHtml(m.blurb) + '</span>' +
                '</span>' +
                '<span class="row-dur">' + m.duration.toFixed(1) + 's</span>' +
              '</button>';
    });
    view.innerHTML = html + '</div>';
  }

  function renderActions() {
    var list = filteredActions();
    var view = el.views.actions;
    if (!list.length) { view.innerHTML = emptyState('actions'); return; }

    var html = '<div class="section-label"><span>Quick actions</span><span>' + list.length + '</span></div>' +
               '<div class="row-list">';
    list.forEach(function (a) {
      html += '<button class="row" data-action="' + a.id + '">' +
                '<span class="row-text">' +
                  '<span class="row-name">' + escapeHtml(a.name) + '</span>' +
                  '<span class="row-blurb">' + escapeHtml(a.blurb) + '</span>' +
                '</span>' +
              '</button>';
    });
    view.innerHTML = html + '</div>';
  }

  function renderAll() {
    renderComponents();
    renderMotion();
    renderActions();
  }

  /* ----------------------------------------------------------------- tabs */

  function showView(name) {
    state.view = name;
    el.tabs.forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.view === name));
    });
    Object.keys(el.views).forEach(function (k) {
      el.views[k].hidden = (k !== name);
    });
  }

  el.tabs.forEach(function (t) {
    t.addEventListener('click', function () { showView(t.dataset.view); });
  });

  /* --------------------------------------------------------------- search */

  el.search.addEventListener('input', function () {
    state.query = el.search.value.trim().toLowerCase();
    el.searchWrap.classList.toggle('has-value', !!el.search.value);
    renderAll();

    // Jump to whichever tab actually has hits, so one box searches everything.
    if (state.query) {
      if (filteredComponents().length) showView('components');
      else if (filteredMotion().length) showView('motion');
      else if (filteredActions().length) showView('actions');
    }
  });

  el.searchClear.addEventListener('click', function () {
    el.search.value = '';
    state.query = '';
    el.searchWrap.classList.remove('has-value');
    renderAll();
    el.search.focus();
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); el.search.select(); }
    if (e.key === 'Escape') {
      if (el.sheet.classList.contains('open')) closeSheet();
      else if (el.search.value) el.searchClear.click();
    }
  });

  /* ---------------------------------------------------------------- sheet */

  function openSheet(componentId) {
    var c = L.componentById(componentId);
    if (!c) return;
    state.component = c;
    state.params = L.defaults(c);
    el.sheetTitle.textContent = c.name;
    el.sheetSub.textContent = c.category + ' · builds a live precomp';
    buildFields();
    updateHero();
    el.sheet.classList.add('open');
    el.sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    el.sheet.classList.remove('open');
    el.sheet.setAttribute('aria-hidden', 'true');
  }

  function visible(param) {
    return !param.showIf || !!state.params[param.showIf];
  }

  function buildFields() {
    var c = state.component;
    el.sheetFields.innerHTML = '';

    c.params.forEach(function (p) {
      var field = document.createElement('div');
      field.className = 'field';
      field.dataset.key = p.key;

      var label = document.createElement('label');
      label.textContent = p.label;
      label.setAttribute('for', 'f_' + p.key);
      field.appendChild(label);

      var control = document.createElement('div');
      control.className = 'control';
      control.appendChild(buildControl(p));
      field.appendChild(control);

      el.sheetFields.appendChild(field);
    });

    refreshVisibility();
  }

  function buildControl(p) {
    var frag = document.createDocumentFragment();

    if (p.type === 'number') {
      var range = document.createElement('input');
      range.type = 'range';
      range.min = p.min; range.max = p.max; range.step = p.step || 1;
      range.value = state.params[p.key];

      var num = document.createElement('input');
      num.type = 'number';
      num.id = 'f_' + p.key;
      num.min = p.min; num.max = p.max; num.step = p.step || 1;
      num.value = state.params[p.key];

      function commit(v) {
        v = Math.max(p.min, Math.min(p.max, Number(v) || 0));
        state.params[p.key] = v;
        range.value = v; num.value = v;
        updateHero();
      }
      range.addEventListener('input', function () { commit(range.value); });
      num.addEventListener('change', function () { commit(num.value); });

      frag.appendChild(range);
      frag.appendChild(num);

    } else if (p.type === 'bool') {
      var sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'switch';
      sw.id = 'f_' + p.key;
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!state.params[p.key]));
      sw.addEventListener('click', function () {
        state.params[p.key] = !state.params[p.key];
        sw.setAttribute('aria-checked', String(state.params[p.key]));
        refreshVisibility();
        updateHero();
      });
      frag.appendChild(sw);

    } else if (p.type === 'select') {
      var sel = document.createElement('select');
      sel.id = 'f_' + p.key;
      p.options.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === state.params[p.key]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () {
        state.params[p.key] = sel.value;
        // Picking a glass style pulls its blur value in with it.
        if (p.key === 'glassPreset' && 'blur' in state.params) {
          state.params.blur = L.glassById(sel.value).blur;
          var blurField = el.sheetFields.querySelector('[data-key="blur"]');
          if (blurField) {
            blurField.querySelector('input[type=range]').value = state.params.blur;
            blurField.querySelector('input[type=number]').value = state.params.blur;
          }
        }
        updateHero();
      });
      frag.appendChild(sel);

    } else {
      var txt = document.createElement('input');
      txt.type = 'text';
      txt.id = 'f_' + p.key;
      txt.value = state.params[p.key];
      txt.addEventListener('input', function () {
        state.params[p.key] = txt.value;
        updateHero();
      });
      frag.appendChild(txt);
    }

    return frag;
  }

  function refreshVisibility() {
    state.component.params.forEach(function (p) {
      var node = el.sheetFields.querySelector('[data-key="' + p.key + '"]');
      if (node) node.hidden = !visible(p);
    });
  }

  var heroRaf = null;
  function updateHero() {
    if (heroRaf) cancelAnimationFrame(heroRaf);
    heroRaf = requestAnimationFrame(function () {
      el.sheetHero.innerHTML = P.render(state.component.id, state.params, 420, 236);
    });
  }

  el.sheetBack.addEventListener('click', closeSheet);

  el.sheetReset.addEventListener('click', function () {
    state.params = L.defaults(state.component);
    buildFields();
    updateHero();
    setStatus('Settings reset to defaults');
  });

  /* --------------------------------------------------------------- create */

  el.sheetCreate.addEventListener('click', function () {
    var c = state.component;
    var params = JSON.parse(JSON.stringify(state.params));
    params.__type = c.id;

    el.sheetCreate.disabled = true;
    setStatus('Creating ' + c.name.toLowerCase() + '…', 'busy');

    window.CEP.call('create', params)
      .then(function (payload) {
        setStatus(payload || (c.name + ' created'), 'ok');
        closeSheet();
      })
      .catch(function (err) {
        setStatus(err.message || 'Could not create the component', 'err');
      })
      .then(function () {
        el.sheetCreate.disabled = false;
      });
  });

  /* --------------------------------------------------- delegated tile clicks */

  document.getElementById('body').addEventListener('click', function (e) {
    var tile = e.target.closest('[data-component]');
    if (tile) { openSheet(tile.dataset.component); return; }

    var motion = e.target.closest('[data-motion]');
    if (motion) {
      var preset = motion.dataset.motion;
      setStatus('Applying ' + preset + '…', 'busy');
      window.CEP.call('motion', { preset: preset })
        .then(function (payload) { setStatus(payload || 'Motion applied', 'ok'); })
        .catch(function (err) { setStatus(err.message, 'err'); });
      return;
    }

    var action = e.target.closest('[data-action]');
    if (action) {
      var id = action.dataset.action;
      setStatus('Running ' + id + '…', 'busy');
      window.CEP.call('action', { id: id })
        .then(function (payload) { setStatus(payload || 'Done', 'ok'); })
        .catch(function (err) { setStatus(err.message, 'err'); });
    }
  });

  /* ------------------------------------------------------------------ boot */

  function boot() {
    applyHostTheme();
    window.CEP.onThemeChange(applyHostTheme);
    renderAll();
    showView('components');

    if (window.CEP.isMock) {
      setStatus('Preview mode — no After Effects host detected');
      return;
    }
    window.CEP.call('ping', {})
      .then(function (payload) { setStatus(payload || 'Connected', 'ok'); })
      .catch(function (err) { setStatus(err.message, 'err'); });
  }

  boot();
})();
