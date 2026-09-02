// host/index.jsx icin sahte (mock) After Effects DOM ile entegrasyon testi
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'host', 'index.jsx'), 'utf8');

const PropertyType = { PROPERTY: 6612, INDEXED_GROUP: 6613, NAMED_GROUP: 6614 };

function P(name, matchName, canSet = true) {
  return { name, matchName, propertyType: PropertyType.PROPERTY, canSetExpression: canSet, expression: '' };
}
function G(name, matchName, children) {
  const g = {
    name, matchName, propertyType: PropertyType.NAMED_GROUP,
    get numProperties() { return children.length; },
    property(k) {
      if (typeof k === 'number') return children[k - 1];
      return children.find(c => c.matchName === k || c.name === k) || null;
    }
  };
  children.forEach(c => { c.parentProperty = g; });
  return g;
}
function Layer(name, index, groups, selectedProperties = []) {
  const l = {
    name, index, selectedProperties,
    property(k) { return groups.find(g => g.matchName === k || g.name === k) || null; },
    get numProperties() { return groups.length; }
  };
  groups.forEach(g => { g.parentProperty = l; });
  return l;
}

const xf = () => G('Transform', 'ADBE Transform Group', [
  P('Anchor Point', 'ADBE Anchor Point'), P('Position', 'ADBE Position'),
  P('Scale', 'ADBE Scale'), P('Rotation', 'ADBE Rotate Z'), P('Opacity', 'ADBE Opacity')
]);

// --- Katmanlar
const textLayer = Layer('Baslik', 1, [xf(),
  G('Text', 'ADBE Text Properties', [P('Source Text', 'ADBE Text Document')])]);

const strokeW = P('Stroke Width', 'ADBE Vector Stroke Width');
const shapeLayer = Layer('Kutu', 2, [xf(),
  G('Contents', 'ADBE Root Vectors Group', [
    G('Rectangle 1', 'ADBE Vector Group', [
      G('Contents', 'ADBE Vectors Group', [
        G('Rectangle Path 1', 'ADBE Vector Shape - Rect', [
          P('Size', 'ADBE Vector Rect Size'), P('Roundness', 'ADBE Vector Rect Roundness')]),
        G('Stroke 1', 'ADBE Vector Graphic - Stroke', [strokeW])])])])]);

const fxLayer = Layer('Kontrol', 3, [xf(),
  G('Effects', 'ADBE Effect Parade', [
    G('Slider Control', 'ADBE Slider Control', [P('Slider', 'ADBE Slider Control-0001')])])]);

// Position'i expression kabul etmeyen (orn. kilitli) katman
const lockedXf = G('Transform', 'ADBE Transform Group', [P('Position', 'ADBE Position', false)]);
const lockedLayer = Layer('Kilitli', 4, [lockedXf]);

// Kullanicinin timeline'da elle sectigi property
const manualProp = P('Bulge Height', 'ADBE Bulge-0002');
const manualLayer = Layer('Elle Secili', 5, [xf(),
  G('Effects', 'ADBE Effect Parade', [G('Bulge', 'ADBE Bulge', [manualProp])])], [manualProp]);

let comp;
function CompItem() {}
const app = {
  undoStack: [],
  beginUndoGroup(n) { this.undoStack.push(n); },
  endUndoGroup() { this.undoStack.pop(); },
  get project() { return { activeItem: comp }; }
};

const ctx = vm.createContext({ app, CompItem, PropertyType, comp: null });
vm.runInContext(src, ctx);

function setComp(layers) {
  comp = Object.create(CompItem.prototype);
  comp.name = 'Test Comp'; comp.numLayers = layers.length; comp.selectedLayers = layers;
}
const call = (fn, arg) => JSON.parse(vm.runInContext(`${fn}(${JSON.stringify(arg)})`, ctx));

let pass = 0, fail = 0;
function check(label, cond, info) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + '  -> ' + JSON.stringify(info)); }
}

console.log('\n== canSetExpression / derin property arama ==');

setComp([textLayer]);
let r = call('EXP_apply', { code: 'value.toUpperCase();', target: 'Source Text', name: 't', scope: 'target' });
check('Source Text -> ADBE Text Document', r.ok && r.applied === 1 && textLayer.property('ADBE Text Properties').property('ADBE Text Document').expression === 'value.toUpperCase();', r);

setComp([shapeLayer]);
r = call('EXP_apply', { code: 'value/2;', target: 'Stroke Width', name: 't', scope: 'target' });
check('Stroke Width -> 3 seviye derinde bulundu', r.ok && r.applied === 1 && strokeW.expression === 'value/2;', r);

r = call('EXP_apply', { code: '[thisComp.width, thisComp.height];', target: 'Size', name: 't', scope: 'target' });
check('Size -> ADBE Vector Rect Size', r.ok && r.applied === 1, r);

setComp([fxLayer]);
r = call('EXP_apply', { code: 'speed;', target: 'Slider', name: 't', scope: 'target' });
check('Slider -> efekt agacinda bulundu', r.ok && r.applied === 1, r);

setComp([lockedLayer]);
r = call('EXP_apply', { code: 'wiggle(2,30);', target: 'Position', name: 't', scope: 'target' });
check('canSetExpression=false -> reddedildi, atlandi', !r.ok && r.skipped.length === 1, r);
check('hata durumunda undo grubu kapatildi', app.undoStack.length === 0, app.undoStack);

setComp([manualLayer]);
r = call('EXP_apply', { code: 'wiggle(2,30);', target: 'Any', name: 't', scope: 'auto' });
check('auto modu: elle secili property onceliklendi', r.ok && manualProp.expression === 'wiggle(2,30);', r);

setComp([textLayer, shapeLayer, fxLayer]);
r = call('EXP_apply', { code: 'wiggle(3,25);', target: 'Position', name: 't', scope: 'target' });
check('coklu katmana toplu uygulama (3/3)', r.ok && r.applied === 3, r);

setComp([shapeLayer]);
r = call('EXP_apply', { code: 'x;', target: 'Focus Distance', name: 't', scope: 'target' });
check('bulunamayan hedef -> temiz hata mesaji', !r.ok && /bulunamadi/.test(r.skipped[0]), r);

r = call('EXP_getContext');
check('EXP_getContext calisiyor', r.ok && r.hasComp && r.compName === 'Test Comp', r);

console.log('\n== EXP_validate ==');
check('dengesiz parantez yakalandi', !call('EXP_validate', 'wiggle(2, 30;').ok);
check('string icindeki parantez yok sayildi', call('EXP_validate', 'value.replace(/x/g, "(");').ok);
check('regex literal icindeki parantez yok sayildi', call('EXP_validate', 'value.replace(/\\(/g, "");').ok);
check('regex karakter sinifi [)] yok sayildi', call('EXP_validate', 'value.split(/[()]/);').ok);
check('yorum satirindaki parantez yok sayildi', call('EXP_validate', 'value; // burada ) var').ok);
check('blok yorum yok sayildi', call('EXP_validate', '/* ) */ value;').ok);
check('bolme islemi regex sanilmadi', call('EXP_validate', 'a = (1 + 2) / 3;').ok);
check('kapanmamis regex yakalandi', !call('EXP_validate', 'value.replace(/abc, "");').ok);

console.log('\n== 150 starter pack kaydinin tamami ==');
global.window = {};
require(require('path').join(__dirname, '..', 'client', 'data', 'starter-pack.js'));
const RE = /\{\{\s*([^}=\s][^}=]*?)\s*(?:=\s*([^}]*?)\s*)?\}\}/g;
const resolve = (c, v = {}) => c.replace(RE, (f, n, d) => {
  const x = v[n];
  return (x === undefined || x === '') ? (d === undefined ? '' : d) : String(x);
});
let bad = [];
for (const it of window.EXP_STARTER_PACK) {
  const code = resolve(it.code);
  // 1) parametre kalintisi yok
  if (/\{\{|\}\}/.test(code)) bad.push(it.id + ' parametre kalintisi');
  // 2) host dogrulamasindan gecmeli
  const v = call('EXP_validate', code);
  if (!v.ok) bad.push(it.id + ' validate: ' + v.error);
  // 3) client -> host JSON kopru turu: kod bit bit ayni kalmali
  const payload = { code, target: it.prop, name: it.name, scope: 'auto' };
  const roundTrip = JSON.parse(JSON.stringify(payload)).code;
  if (roundTrip !== code) bad.push(it.id + ' JSON kopru bozulmasi');
}
check('150 kaydin tamami: parametre + validate + JSON kopru', bad.length === 0, bad.slice(0, 5));

console.log('\n== regex kacislari (String.raw) ==');
const e81 = window.EXP_STARTER_PACK.find(x => x.id === 'e081');
const out81 = resolve(e81.code, { ayrac: ' ' });
check('e081 ters bolu korundu', out81.includes(String.fromCharCode(92) + 'B(?=(' + String.fromCharCode(92) + 'd{3})+(?!' + String.fromCharCode(92) + 'd))'), out81);
check('e081 kullanici degeri uygulandi', out81.includes('"' + ' ' + '"'), out81);
const e97 = window.EXP_STARTER_PACK.find(x => x.id === 'e097');
check('e097 satir sonu kacisi metin olarak korundu', e97.code.includes(String.fromCharCode(92) + 'n'), e97.code);
const e96 = window.EXP_STARTER_PACK.find(x => x.id === 'e096');
check('e096 regex alternasyonu bozulmadi', resolve(e96.code).includes('/' + String.fromCharCode(92) + 'r' + String.fromCharCode(92) + 'n|' + String.fromCharCode(92) + 'r|' + String.fromCharCode(92) + 'n/'), e96.code);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
