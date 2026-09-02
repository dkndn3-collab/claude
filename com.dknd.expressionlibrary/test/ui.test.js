// Panelin istemci yarisini gercek Chromium'da, sahte CEP koprusu + sahte AE DOM'u ile surer.
//   npm i playwright-core && node test/ui.test.js
//   (gerekirse) CHROMIUM_PATH=/yol/chrome node test/ui.test.js
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

const textProp = P('Source Text', 'ADBE Text Document');
const mkLayer = (name, index, groups) => ({
  name, index, selectedProperties: [], _g: groups,
  property(k) { return this._g.find(g => g.matchName === k) || null; }
});
const layerA = mkLayer('Logo', 1, [xf(),
  G('Effects', 'ADBE Effect Parade', [G('Slider Control', 'ADBE Slider Control', [P('Slider', 'ADBE Slider Control-0001')])])]);
const layerB = mkLayer('Baslik', 2, [xf(), G('Text', 'ADBE Text Properties', [textProp])]);

function CompItem() {}
const comp = Object.create(CompItem.prototype);
comp.name = 'MAIN_COMP'; comp.numLayers = 2; comp.selectedLayers = [layerA, layerB];
const app = { undoStack: [], beginUndoGroup(n) { this.undoStack.push(n); }, endUndoGroup() { this.undoStack.pop(); },
  project: { activeItem: comp } };

const hostCtx = vm.createContext({ app, CompItem, PropertyType });
vm.runInContext(fsx.readFileSync(pathx.join(EXT, 'host', 'index.jsx'), 'utf8'), hostCtx);
const evalHost = (s) => { try { return vm.runInContext(s, hostCtx); }
                          catch (e) { return JSON.stringify({ ok: false, error: e.message }); } };

// ---------------------------------------------------------------- kontroller
let pass = 0, fail = 0;
const check = (label, cond, info) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); }
};
const getPos = (l) => l.property('ADBE Transform Group').property('ADBE Position').expression;
const BS = String.fromCharCode(92);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
  page.on('pageerror', e => { fail++; console.log('  FAIL  sayfa hatasi: ' + e.message); });

  await page.exposeFunction('__hostEval', (s) => evalHost(s));
  await page.exposeFunction('__peek', (what) => ({
    a: getPos(layerA), b: getPos(layerB), text: textProp.expression, undo: app.undoStack.length
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

  const TOTAL = await page.locator('.card').count();
  const status = () => page.textContent('#statusText');

  console.log('\n== Duzen ve olculer ==');
  const box = async (sel) => (await page.locator(sel).first().boundingBox());
  check('header 36px', Math.round((await box('.hdr')).height) === 36);
  check('search+chips 70px', Math.round((await box('.filterbar')).height) === 70);
  check('mode bar 28px', Math.round((await box('.modebar')).height) === 28);
  check('action footer 42px', Math.round((await box('.actions')).height) === 42);
  check('status bar 18px', Math.round((await box('.statusbar')).height) === 18);
  const ch = (await box('.card')).height;
  check('kart yuksekligi 44-48px araliginda -> ' + ch, ch >= 44 && ch <= 48, ch);
  check('kart listesi kalan alani dolduruyor', (await box('.list')).height > 300);

  console.log('\n== Header / sayac ==');
  check('versiyon etiketi', (await page.textContent('.ver')) === 'v1.0');
  check('toplam sablon sayisi', (await page.textContent('#countTotal')) === String(TOTAL));
  check('gosterilen sayisi', (await page.textContent('#countShown')) === String(TOTAL));

  console.log('\n== Status bar ==');
  await page.waitForFunction(() => document.getElementById('statusText').textContent.indexOf('MAIN_COMP') !== -1, null, { timeout: 8000 });
  check('bosta AE baglamini gosteriyor', (await status()).includes('MAIN_COMP · 2 katman'));
  check('bosta kind=idle', (await page.getAttribute('#statusBar', 'data-kind')) === 'idle');

  console.log('\n== Arama ve "/" kisayolu ==');
  await page.locator('#cardList').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  check('"/" arama kutusuna odaklandi', await page.evaluate(() => document.activeElement.id) === 'searchInput');
  await page.keyboard.type('wiggle');
  await page.waitForFunction(() => document.querySelectorAll('.card').length < 100);
  const wig = await page.locator('.card').count();
  check('arama daralt "wiggle" -> ' + wig, wig > 3 && wig < 20);
  check('sayac filtreye gore guncellendi', (await page.textContent('#countShown')) === String(wig));
  await page.fill('#searchInput', 'döngü');
  await page.waitForTimeout(120);
  check('Turkce aksanli arama "döngü" sonuc veriyor', (await page.locator('.card').count()) >= 5);

  console.log('\n== Empty state ==');
  await page.fill('#searchInput', 'zzzz-yok-boyle-birsey');
  await page.waitForSelector('#emptyState:not([hidden])');
  check('bos durum gosterildi', await page.isVisible('#emptyState'));
  check('aranan terim gosteriliyor', (await page.textContent('#emptyTerm')).includes('zzzz-yok'));
  await page.click('#btnAddFromSearch');
  await page.waitForSelector('#viewEditor:not([hidden])');
  check('"+ Yeni Olarak Ekle" editoru aranan adla acti',
    (await page.inputValue('#fName')) === 'zzzz-yok-boyle-birsey');
  await page.click('#btnBack');
  await page.click('#btnClearSearch');
  check('temizle -> tum kartlar', (await page.locator('.card').count()) === TOTAL);

  console.log('\n== Kart secimi ve Apply to Selected ==');
  check('acilista ilk kart secili', (await page.locator('.card.sel').count()) === 1);
  await page.fill('#searchInput', 'Basic Wiggle');
  await page.waitForTimeout(120);
  const card = page.locator('.card').first();
  await card.click();
  check('kart secildi (sel)', (await card.getAttribute('class')).includes('sel'));
  check('Apply butonu aktiflesti', !(await page.locator('#btnApply').isDisabled()));
  check('Apply etiketi', (await page.textContent('#btnApply')) === 'Apply to Selected');

  await page.click('#btnApply');
  await page.waitForSelector('#modalBackdrop:not([hidden])');
  check('parametreli kart modal acti', await page.isVisible('#modalBackdrop'));

  console.log('\n== Parametre modali ==');
  const keys = page.locator('#modalFields .pk');
  const inputs = page.locator('#modalFields input');
  check('iki sutunlu form: 2 ad + 2 input', (await keys.count()) === 2 && (await inputs.count()) === 2);
  check('ilk input otomatik odaklandi', (await page.evaluate(() => document.activeElement.getAttribute('data-param'))) === 'frekans');
  check('varsayilanlar dolu', (await inputs.nth(0).inputValue()) === '2' && (await inputs.nth(1).inputValue()) === '30');
  check('onizleme cozumlendi', (await page.textContent('#modalPreview')) === 'wiggle(2, 30);');

  await inputs.nth(0).fill('7');
  await inputs.nth(1).fill('115');
  check('onizleme canli guncellendi', (await page.textContent('#modalPreview')) === 'wiggle(7, 115);');

  await page.locator('#modalFields .p-reset').first().click();
  check('↺ varsayilana dondurdu', (await inputs.nth(0).inputValue()) === '2');
  check('↺ sonrasi onizleme guncel', (await page.textContent('#modalPreview')) === 'wiggle(2, 115);');
  await inputs.nth(0).fill('7');

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('modalBackdrop').hidden);
  check('Enter uygulamayi tetikledi', (await page.evaluate(() => window.__peek('a'))) === 'wiggle(7, 115);');
  check('iki katmana da uygulandi', (await page.evaluate(() => window.__peek('b'))) === 'wiggle(7, 115);');
  check('undo grubu kapatildi', (await page.evaluate(() => window.__peek('undo'))) === 0);
  check('status yesil basari', (await page.getAttribute('#statusBar', 'data-kind')) === 'ok');
  check('status mesaji sablon adini iceriyor', (await status()).includes('Basic Wiggle'));

  console.log('\n== Esc ile modal kapanmasi ==');
  await page.click('#btnApply');
  await page.waitForSelector('#modalBackdrop:not([hidden])');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('modalBackdrop').hidden);
  check('Esc modali kapatti', await page.locator('#modalBackdrop').isHidden());

  console.log('\n== Skip Prompts + cift tiklama ==');
  await page.locator('.sw').click();
  check('switch acildi', await page.isChecked('#skipPrompts'));
  await page.fill('#searchInput', 'Digit Grouping');
  await page.waitForTimeout(120);
  await page.locator('.card').first().dblclick();
  await page.waitForTimeout(350);
  check('cift tiklama modal acmadan uyguladi', await page.locator('#modalBackdrop').isHidden());
  const applied = await page.evaluate(() => window.__peek('text'));
  check('Source Text hedefine gitti', applied.indexOf('replace') !== -1, applied);
  check('regex ters bolusu tarayici -> host korundu',
    applied.includes(BS + 'B(?=(' + BS + 'd{3})+(?!' + BS + 'd))'), applied);

  console.log('\n== Hata durumu: status kirmizi + panoya kopyala ==');
  await page.evaluate(() => { window.__adobe_cep__.evalScript = (s, cb) => cb(JSON.stringify({ ok: false, error: 'TEST HATASI' })); });
  await page.click('#btnApply');
  await page.waitForFunction(() => document.getElementById('statusBar').getAttribute('data-kind') === 'err');
  check('hata kirmizi gosterildi', (await status()).includes('TEST HATASI'));
  check('hata durumu tiklanabilir (title)', (await page.getAttribute('#statusBar', 'title')).includes('panoya'));
  await page.reload();
  await page.waitForSelector('.card');

  console.log('\n== Favori (yildiz) ==');
  await page.fill('#searchInput', 'Basic Wiggle');
  await page.waitForTimeout(120);
  await page.locator('.card').first().hover();
  await page.locator('.card .c-act.star').first().click();
  await page.waitForTimeout(150);
  check('kart favori isaretlendi', (await page.locator('.card').first().getAttribute('class')).includes('fav'));
  check('★ cipi olustu', (await page.locator('.chip', { hasText: '★' }).count()) === 1);
  await page.click('#btnClearSearch');
  await page.locator('.chip', { hasText: '★' }).first().click();
  check('★ cipi sadece favoriyi listeliyor', (await page.locator('.card').count()) === 1);

  console.log('\n== Ayar kaliciligi ==');
  await page.selectOption('#scopeSelect', 'target');
  await page.waitForTimeout(150);
  await page.reload();
  await page.waitForSelector('.card');
  check('Skip Prompts yeniden yuklemede korundu', await page.isChecked('#skipPrompts'));
  check('mod secimi korundu', (await page.inputValue('#scopeSelect')) === 'target');
  check('favori korundu', (await page.locator('.chip', { hasText: '★' }).count()) === 1);
  await page.selectOption('#scopeSelect', 'auto');
  await page.locator('.sw').click();

  console.log('\n== Editor: ekle / kalicilik / sil ==');
  await page.click('#btnNew');
  await page.waitForSelector('#viewEditor:not([hidden])');
  await page.fill('#fName', 'Test Kaydi');
  await page.fill('#fCat', 'Ozel');
  await page.fill('#fCode', 'value.replace(/\\(/g, "") + {{ek=!}};');
  check('parametre ipucu tespit etti', (await page.textContent('#paramHint')).includes('ek = !'));
  await page.click('#btnSave');
  await page.waitForSelector('#viewList:not([hidden])');
  check('regex iceren kod dogrulamadan gecti', (await page.locator('.card').count()) === TOTAL + 1);
  check('Mine cipi olustu', (await page.locator('.chip', { hasText: 'Mine' }).count()) === 1);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('expressionLibrary') || '{}'));
  check('diske/onbellege yazildi', stored.items && stored.items.length === 1 && stored.items[0].name === 'Test Kaydi');

  await page.reload();
  await page.waitForSelector('.card');
  check('yeniden yuklemede korundu', (await page.locator('.card').count()) === TOTAL + 1);

  await page.screenshot({ path: pathx.join(require('os').tmpdir(), 'expression-library-panel.png') });

  page.on('dialog', d => d.accept());
  await page.fill('#searchInput', 'Test Kaydi');
  await page.waitForTimeout(120);
  await page.locator('.card').first().hover();
  await page.locator('.card .c-act.danger').first().click();
  await page.waitForTimeout(250);
  await page.click('#btnClearSearch');
  check('silme calisti', (await page.locator('.card').count()) === TOTAL);

  await browser.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
