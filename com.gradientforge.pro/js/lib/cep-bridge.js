/**
 * cep-bridge.js
 * A small wrapper over the CEP runtime (window.__adobe_cep__).
 *
 * This intentionally replaces Adobe's CSInterface.js. We only need four things
 * — evalScript, extension path, host info, and theme colors — and a 40-line
 * bridge is easier to reason about than a vendored library.
 *
 * If it can't find a host (e.g. you opened index.html in a normal browser),
 * every call resolves against a mock so the UI is still developable.
 */
(function (global) {
  'use strict';

  var cep = global.__adobe_cep__ || null;
  var MOCK = !cep;

  function evalScript(script) {
    return new Promise(function (resolve) {
      if (MOCK) {
        console.log('[mock evalScript]', script);
        return resolve('OK|mock');
      }
      cep.evalScript(script, function (result) {
        resolve(typeof result === 'string' ? result : String(result));
      });
    });
  }

  /** Calls GF.api(action, paramsJson) inside ExtendScript. */
  function call(action, params) {
    var payload = JSON.stringify(JSON.stringify(params || {}));
    return evalScript('GF.api("' + action + '", ' + payload + ')').then(parseResult);
  }

  /** Host replies are "OK|payload" or "ERR|message" — keeps parsing trivial. */
  function parseResult(raw) {
    var str = String(raw == null ? '' : raw);
    if (str.indexOf('ERR|') === 0) {
      var err = new Error(str.slice(4));
      err.fromHost = true;
      throw err;
    }
    if (str.indexOf('OK|') === 0) return str.slice(3);
    if (str === 'EvalScript error.') throw new Error('ExtendScript failed to evaluate. Check jsx/host.jsx.');
    return str;
  }

  function extensionPath() {
    if (MOCK) return '';
    return cep.getSystemPath('extension');
  }

  function hostEnvironment() {
    if (MOCK) return { appName: 'AEFT', appVersion: '0.0', appSkinInfo: null };
    try {
      return JSON.parse(cep.getHostEnvironment());
    } catch (e) {
      return { appName: 'AEFT', appVersion: '0.0', appSkinInfo: null };
    }
  }

  /** Reads AE's own UI brightness so the panel sits inside the host, not on top of it. */
  function hostBackgroundLuma() {
    var env = hostEnvironment();
    var c = env && env.appSkinInfo && env.appSkinInfo.panelBackgroundColor;
    if (!c || !c.color) return null;
    return (c.color.red * 0.299 + c.color.green * 0.587 + c.color.blue * 0.114) / 255;
  }

  function onThemeChange(handler) {
    if (MOCK) return;
    try {
      cep.addEventListener('com.adobe.csxs.events.ThemeColorChanged', handler);
    } catch (e) { /* older runtimes */ }
  }

  function openURL(url) {
    if (MOCK) return global.open(url, '_blank');
    try {
      global.cep.util.openURLInDefaultBrowser(url);
    } catch (e) { /* no-op */ }
  }

  global.CEP = {
    isMock: MOCK,
    evalScript: evalScript,
    call: call,
    extensionPath: extensionPath,
    hostEnvironment: hostEnvironment,
    hostBackgroundLuma: hostBackgroundLuma,
    onThemeChange: onThemeChange,
    openURL: openURL
  };
})(window);
