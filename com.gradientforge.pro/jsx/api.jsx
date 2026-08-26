/**
 * api.jsx — the only function the panel is allowed to call.
 *
 * Everything runs inside one undo group, so a gradient the user doesn't like
 * disappears with a single Cmd/Ctrl+Z. Replies are "OK|message" or
 * "ERR|message"; the panel shows the message verbatim in the status bar, so
 * error text is written for the person reading it, not for a log.
 */

$.global.GF = $.global.GF || {};

(function () {

  function ping() {
    var version = String(app.version).split('x')[0];
    var comp = null;
    try { comp = GF.U.activeComp(); } catch (e) {}
    return comp
      ? 'Connected · AE ' + version + ' · ' + comp.name
      : 'Connected · AE ' + version + ' · open a comp to start';
  }

  function dispatch(action, p) {
    switch (action) {
      case 'gradient': return GF.Gradient.create(p);
      case 'freeze':   return GF.Gradient.freeze();
      default: throw new Error('Unknown action: ' + action);
    }
  }

  GF.api = function (action, paramsJson) {
    try {
      if (action === 'ping') return 'OK|' + ping();

      var params = {};
      if (paramsJson) {
        try {
          params = eval('(' + paramsJson + ')');
        } catch (parseError) {
          throw new Error('Those settings could not be read. Reopen the panel and try again.');
        }
      }

      // Read-only, called on a timer: it must never open an undo group and
      // never throw, or a disabled button loses the reason it is disabled.
      if (action === 'selection') return 'OK|' + GF.Geom.probeAll(params);

      var label = action === 'gradient'
        ? 'GradientForge — ' + (params.label || 'gradient')
        : 'GradientForge — ' + action;

      var result;
      app.beginUndoGroup(label);
      try {
        result = dispatch(action, params);
      } finally {
        app.endUndoGroup();
      }
      return 'OK|' + result;

    } catch (err) {
      var msg = (err && err.message) ? err.message : String(err);
      return 'ERR|' + msg;
    }
  };
})();
