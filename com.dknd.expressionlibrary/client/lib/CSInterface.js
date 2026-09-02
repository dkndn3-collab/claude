/**
 * CSInterface (minimal) - Adobe CEP 9.x
 * Bu dosya, panelin ihtiyac duydugu CEP API yuzeyini saglar.
 * Adobe'nin resmi CSInterface.js dosyasiyla API uyumludur; isterseniz
 * https://github.com/Adobe-CEP/CEP-Resources adresindeki tam surumle degistirebilirsiniz.
 */

function SystemPath() {}
SystemPath.USER_DATA        = 'userData';
SystemPath.COMMON_FILES     = 'commonFiles';
SystemPath.MY_DOCUMENTS     = 'myDocuments';
SystemPath.APPLICATION      = 'application';
SystemPath.EXTENSION        = 'extension';
SystemPath.HOST_APPLICATION = 'hostApplication';

function CSEvent(type, scope, appId, extensionId) {
    this.type = type;
    this.scope = scope;
    this.appId = appId;
    this.extensionId = extensionId;
    this.data = '';
}

function CSInterface() {}

CSInterface.prototype.hostEnvironment = (function () {
    try { return JSON.parse(window.__adobe_cep__.getHostEnvironment()); }
    catch (e) { return {}; }
})();

CSInterface.prototype.getHostEnvironment = function () {
    try { return JSON.parse(window.__adobe_cep__.getHostEnvironment()); }
    catch (e) { return {}; }
};

CSInterface.prototype.getOSInformation = function () {
    var ua = window.navigator.userAgent;
    if (ua.indexOf('Windows') >= 0) { return 'Windows'; }
    if (ua.indexOf('Mac') >= 0) { return 'Mac OS X'; }
    return 'Unknown';
};

CSInterface.prototype.evalScript = function (script, callback) {
    if (callback === null || callback === undefined) { callback = function () {}; }
    window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.getSystemPath = function (pathType) {
    var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
    if (this.getOSInformation().indexOf('Windows') >= 0) {
        path = path.replace('file:///', '');
    } else {
        path = path.replace('file://', '');
    }
    return path;
};

CSInterface.prototype.getExtensionID = function () {
    return window.__adobe_cep__.getExtensionId();
};

CSInterface.prototype.getApplicationID = function () {
    return this.getHostEnvironment().appId;
};

CSInterface.prototype.addEventListener = function (type, listener, obj) {
    window.__adobe_cep__.addEventListener(type, listener, obj);
};

CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    window.__adobe_cep__.removeEventListener(type, listener, obj);
};

CSInterface.prototype.dispatchEvent = function (event) {
    if (typeof event.data === 'object') { event.data = JSON.stringify(event.data); }
    window.__adobe_cep__.dispatchEvent(event);
};

CSInterface.prototype.closeExtension = function () {
    window.__adobe_cep__.closeExtension();
};

CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    return window.cep.util.openURLInDefaultBrowser(url);
};

CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    window.__adobe_cep__.requestOpenExtension(extensionId, params);
};

CSInterface.prototype.getHostCapabilities = function () {
    try { return JSON.parse(window.__adobe_cep__.getHostCapabilities()); }
    catch (e) { return {}; }
};

CSInterface.prototype.setWindowTitle = function (title) {
    window.__adobe_cep__.invokeSync('setWindowTitle', title);
};
