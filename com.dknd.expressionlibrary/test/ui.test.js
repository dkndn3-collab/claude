// Panelin istemci yarisini gercek Chromium'da, sahte CEP koprusu + sahte AE DOM'u ile surer.
const { chromium } = require('playwright-core');
const fsx = require('fs'), vm = require('vm'), pathx = require('path');

const EXT = pathx.join(__dirname, '..');

// ---------------------------------------------------------------- sahte AE DOM
const PropertyType = { PROPERTY: 6612, INDEXED_GROUP: 6613, NAMED_GROUP: 6614 };
const P = (name, matchName, canSet = true) =>
  ({ name, matchName, propertyType: PropertyType.PROPERTY, canSetExpression: canSet, expression: '' });
function G(name, matchName, children) {
  const g = { name, matchName, propertyType: PropertyType.NAMED_GROUP,
    get numProperties() { return children.length; },
    property(k) { return typeof k === 'number' ? children[k - 1]
      : (children.find(c => c.matchName === k || c.name === k) || null); } };
  children.forEach(c => { c.parentProperty = g; });
  return g;
}
const xf = () => G('Transform', 'ADBE Transform Group', [
  P('Anchor Point', 'ADBE Anchor Point'), P('Position', 'ADBE Position'),
  P('Scale', 'ADBE Scale'), P('Rotation', 'ADBE Rotate Z'), P('Opacity', 'ADBE Opacity')]);

const sliderProp = P('Slider', 'ADBE Slider Control-0001');
const textProp = P('Source Text', 'ADBE Text Document');
const layerA = { name: 'Logo', index: 1, selectedProperties: [],
  property(k) { return this._g.find(g => g.matchName === k) || null; },
  _g: [xf(), G('Effects', 'ADBE Effect Parade', [G('Slider Control', 'ADBE Slider Control', [sliderProp])])] };
const layerB = { name: 'Baslik', index: 2, selectedProperties: [],
  property(k) { return this._g.find(g => g.matchName === k) || null; },
  _g: [xf(), G('Text', 'ADBE Text Properties', [textProp])] };

function CompItem() {}
const comp = Object.create(CompItem.prototype);
comp.name = 'MAIN_COMP'; comp.numLayers = 2; comp.selectedLayers = [layerA, layerB];
const app = { undoStack: [], beginUndoGroup(n) { this.undoStack.push(n); }, endUndoGroup() { this.undoStack.pop(); },
  project: { activeItem: comp } };

const hostCtx = vm.createContext({ app, CompItem, PropertyType });
vm.runInContext(fsx.readFileSync(pathx.join(EXT, 'host', 'index.jsx'), 'utf8'), hostCtx);
const evalHost = (script) => { try { return vm.runInContext(script, hostCtx); }
                               catch (e) { return JSON.stringify({ ok: false, error: e.message }); } };

// ---------------------------------------------------------------- kontroller
let pass = 0, fail = 0;
const check = (label, cond, info) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); }
};
const getPos = (l) => l.property('ADBE Transform Group').property('ADBE Position').expression;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 420, height: 720 } });

  page.on('pageerror', e => { fail++; console.log('  FAIL  sayfa hatasi: ' + e.message); });

  await page.exposeFunction('__hostEval', (s) => evalHost(s));
  await page.exposeFunction('__peek', (what) => ({
    layerAPos: getPos(layerA), layerBPos: getPos(layerB),
    slider: sliderProp.expression, text: textProp.expression,
    undoDepth: app.undoStack.length
  }[what]));

  await page.addInitScript(() => {
    window.__adobe_cep__ = {
      evalScript: (script, cb) => { window.__hostEval(script).then(r => cb(r)); },
      getSystemPath: () => 'file:///tmp/fake-userdata',
      getHostEnvironment: () => JSON.stringify({ appId: 'AEFT', appVersion: '24.0' }),
      getExtensionId: () => 'com.dknd.expressionlibrary.panel',
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
      closeExtension: () => {}, getHostCapabilities: () => '{}', invokeSync: () => {}
    };
    window.cep = { util: { openURLInDefaultBrowser: () => {} }, fs: {} };
  });

  await page.goto('file://' + pathx.join(EXT, 'client', 'index.html'));
  await page.waitForSelector('.card');

  console.log('\n== Panel acilisi ==');
  check('150 kart render edildi', await page.locator('.card').count() === 150);
  check('sayac dogru', (await page.textContent('#countLabel')) === '150 expression');
  await page.waitForFunction(() => document.getElementById('statusLine').textContent.indexOf('MAIN_COMP') !== -1, null, { timeout: 5000 });
  check('durum satiri AE baglamini gosteriyor', (await page.textContent('#statusLine')).includes('MAIN_COMP - 2 katman secili'));
  check('kategori cipleri olustu', await page.locator('.chip').count() > 10);

  console.log('\n== Arama ve filtreleme ==');
  await page.fill('#searchInput', 'wiggle');
  await page.waitForFunction(() => document.querySelectorAll('.card').length < 150);
  const wiggleCount = await page.locator('.card').count();
  check('arama daralt: "wiggle" -> ' + wiggleCount + ' kart', wiggleCount > 3 && wiggleCount < 20);
  await page.fill('#searchInput', 'd\u00f6ng\u00fc');
  await page.waitForTimeout(150);
  const trCount = await page.locator('.card').count();
  check('Turkce aksanli arama "d\u00f6ng\u00fc" -> ' + trCount + ' kart', trCount >= 5);
  await page.fill('#searchInput', 'saya\u00e7');
  await page.waitForTimeout(150);
  check('Turkce aksanli arama "saya\u00e7" sonuc veriyor', await page.locator('.card').count() >= 1);
  await page.fill('#searchInput', 'counter slider');
  await page.waitForTimeout(150);
  const multi = await page.locator('.card').count();
  check('coklu kelime aramasi -> ' + multi + ' kart', multi >= 3);
  await page.click('#btnClearSearch');
  check('temizle -> 150', await page.locator('.card').count() === 150);

  await page.locator('.chip', { hasText: 'Looping' }).first().click();
  const loopCount = await page.locator('.card').count();
  check('kategori cipi "Looping" -> ' + loopCount + ' kart', loopCount > 3 && loopCount < 20);
  await page.locator('.chip', { hasText: 'Tumu' }).first().click();

  console.log('\n== Parametre modali ==');
  await page.fill('#searchInput', 'Basic Wiggle');
  const card = page.locator('.card').first();
  await card.locator('.apply-btn').click();
  await page.waitForSelector('#modalBackdrop:not([hidden])');
  check('modal acildi', await page.isVisible('#modalBackdrop'));
  const inputs = page.locator('#modalFields input');
  check('2 parametre alani', await inputs.count() === 2);
  check('varsayilanlar dolu', (await inputs.nth(0).inputValue()) === '2' && (await inputs.nth(1).inputValue()) === '30');
  check('onizleme cozumlendi', (await page.textContent('#modalPreview')) === 'wiggle(2, 30);');

  await inputs.nth(0).fill('7');
  await inputs.nth(1).fill('115');
  check('onizleme canli guncellendi', (await page.textContent('#modalPreview')) === 'wiggle(7, 115);');

  await page.click('#btnApplyParams');
  await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
  check('toast basari mesaji', (await page.textContent('#toast')).includes('uygulandi'), await page.textContent('#toast'));
  check('AE katman 1 Position = wiggle(7, 115);', (await page.evaluate(() => window.__peek('layerAPos'))) === 'wiggle(7, 115);');
  check('AE katman 2 Position = wiggle(7, 115);  (toplu uygulama)', (await page.evaluate(() => window.__peek('layerBPos'))) === 'wiggle(7, 115);');
  check('undo grubu kapatildi', (await page.evaluate(() => window.__peek('undoDepth'))) === 0);

  console.log('\n== Regex kacislari (uctan uca) ==');
  await page.fill('#searchInput', 'Digit Grouping');
  await page.locator('.card').first().locator('.mini-btn', { hasText: 'Varsayilanla' }).click();
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => window.__peek('text'));
  const BS = String.fromCharCode(92);
  check('ters bolu tarayici -> host boyunca korundu (Source Text hedefi)',
    applied.includes(BS + 'B(?=(' + BS + 'd{3})+(?!' + BS + 'd))'), applied);

  console.log('\n== Hedef property eslestirme ==');
  await page.fill('#searchInput', 'Uppercase Enforcer');
  await page.selectOption('#scopeSelect', 'target');
  await page.locator('.card').first().locator('.apply-btn').click();
  await page.waitForTimeout(300);
  check('Source Text hedefi metin katmanina gitti',
    (await page.evaluate(() => window.__peek('text'))) === 'value.toUpperCase();');
  await page.selectOption('#scopeSelect', 'auto');

  console.log('\n== Editor: ekle / kalici kayit / sil ==');
  await page.click('#btnClearSearch');
  await page.click('#btnNew');
  await page.waitForSelector('#viewEditor:not([hidden])');
  await page.fill('#fName', 'Test Kaydi');
  await page.fill('#fCat', 'Ozel');
  await page.fill('#fCode', 'value.replace(/\\(/g, "") + {{ek=!}};');
  check('parametre ipucu tespit etti', (await page.textContent('#paramHint')).includes('ek = !'), await page.textContent('#paramHint'));
  await page.click('#btnSave');
  await page.waitForSelector('#viewList:not([hidden])');
  check('regex iceren kod EXP_validate\'ten gecti (kaydedildi)', await page.locator('.card').count() === 151);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('expressionLibrary') || '{}'));
  check('localStorage yedegine yazildi', stored.items && stored.items.length === 1 && stored.items[0].name === 'Test Kaydi', stored.items);

  await page.reload();
  await page.waitForSelector('.card');
  check('yeniden yuklemede kayit korundu (kalicilik)', await page.locator('.card').count() === 151);
  check('"Kendi Kayitlarim" cipi olustu', await page.locator('.chip', { hasText: 'Kendi Kayitlarim' }).count() === 1);

  await page.screenshot({ path: pathx.join(require('os').tmpdir(), 'expression-library-panel.png') });

  page.on('dialog', d => d.accept());
  await page.fill('#searchInput', 'Test Kaydi');
  await page.locator('.card').first().locator('.mini-btn.danger').click();
  await page.waitForTimeout(300);
  await page.click('#btnClearSearch');
  check('silme calisti -> 150', await page.locator('.card').count() === 150);

  await browser.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
