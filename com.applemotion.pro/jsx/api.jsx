/**
 * api.jsx — the only function the panel is allowed to call.
 *
 * Everything runs inside one undo group, so a component the user doesn't like
 * disappears with a single Cmd/Ctrl+Z. Replies are "OK|message" or
 * "ERR|message"; the panel shows the message verbatim in the status bar, so
 * error text is written for the person reading it, not for a log.
 */

$.global.AMUI = $.global.AMUI || {};

(function () {

  function ping() {
    var version = String(app.version).split('x')[0];
    var comp = null;
    try { comp = AMUI.U.activeComp(); } catch (e) {}
    return comp
      ? 'Connected · AE ' + version + ' · ' + comp.name
      : 'Connected · AE ' + version + ' · open a comp to start';
  }

  function create(p) {
    // Honour the panel's default-font choice for every text layer in this build.
    if (p.__font) AMUI.font = (AMUI.T.fonts[p.__font] || null);
    var type = p.__type;
    var generator = AMUI.Components[type];
    if (!generator) throw new Error('No generator for “' + type + '”.');
    return generator.create(p);
  }

  function dispatch(action, p) {
    switch (action) {
      case 'create': return create(p);
      case 'motion': return AMUI.Motion.apply(p.preset, p);
      case 'action': return AMUI.Actions.run(p.id);
      default: throw new Error('Unknown action: ' + action);
    }
  }

  AMUI.api = function (action, paramsJson) {
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

      var label = action === 'create'
        ? 'Apple Motion UI — create ' + (params.__type || 'component')
        : 'Apple Motion UI — ' + action;

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
