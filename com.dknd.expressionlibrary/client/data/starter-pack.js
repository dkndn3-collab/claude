/**
 * Expression Library - Dahili Baslangic Paketi (Starter Pack)
 * 150 adet hazir expression. Kullanici bunlari silemez, sadece "kopyala > duzenle" ile
 * kendi kutuphanesine tureti alabilir.
 *
 * Parametre sozdizimi: {{parametreAdi=varsayilanDeger}}
 * Panel bu kaliplari otomatik tespit edip kullaniciya giris modali acar.
 */
(function (global) {
    var R = String.raw; // ters bolu (\) karakterlerinin regexlerde bozulmamasi icin

    global.EXP_STARTER_PACK = [

// ---------------------------------------------------------------- TRANSFORMATION
{ id:'e001', name:'2D to 3D Null', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'2D katmani 3D Null nesnesinin ekran koordinatlarina baglar.',
  code:R`thisComp.layer("{{katman=3D Layer Name}}").toComp([0,0,0]);` },

{ id:'e002', name:'Universal Position', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'Ust katman donusumlerinden bagimsiz mutlak kompozisyon koordinatini verir.',
  code:R`lay = thisLayer; lay.toComp(lay.anchorPoint);` },

{ id:'e003', name:'True Position of Parented Layer', cat:'Transformation', prop:'Position', req:'Parent Katman',
  desc:'Parent atanmis katmanin gercek dunya koordinatini kompozisyona yansitir.',
  code:R`targetLayer = thisComp.layer("{{katman=Parented Layer}}"); targetLayer.toComp(targetLayer.anchorPoint);` },

{ id:'e004', name:'Control Shape Layer Position with Null', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'Sekil katmanini Null ile yonetir, hiyerarsi kurmadan bagil konumu korur.',
  code:R`control = thisComp.layer("{{kontrol=Control NULL}}"); fromComp(control.toComp(control.anchorPoint));` },

{ id:'e005', name:'Center Anchor Point (Text)', cat:'Text & Typography', prop:'Anchor Point', req:'Yok',
  desc:'Metin degistikce Anchor Point i metin sinir kutusunun merkezinde kilitler.',
  code:R`r = sourceRectAtTime(); [r.left + r.width/2, r.top + r.height/2];` },

{ id:'e006', name:'Dynamic Anchor Point Lock', cat:'Transformation', prop:'Anchor Point', req:'Yok',
  desc:'Katman merkezini kosalere veya ortaya dinamik olarak hizalar.',
  code:R`box = sourceRectAtTime(); [box.left + box.width/2, box.top + box.height/2];` },

{ id:'e007', name:'Get Center of Comp', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'Kompozisyonun tam orta noktasini dinamik hesaplar.',
  code:R`[thisComp.width, thisComp.height] * 0.5;` },

{ id:'e008', name:'Position Between Two Layers', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'Katmani iki farkli katmanin tam ortasinda konumlandirir.',
  code:R`(thisComp.layer({{katmanA=1}}).position + thisComp.layer({{katmanB=2}}).position) / 2;` },

{ id:'e009', name:'Index Stack Vertical Offset', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'Katman indeksine gore cogaltilan nesneleri dikeyde esit aralikla dizer.',
  code:R`spacing = {{aralik=120}}; value + [0, spacing * (index - 1)];` },

{ id:'e010', name:'Random Start Position (Static)', cat:'Randomness', prop:'Position', req:'Yok',
  desc:'Katmanlari kompozisyon sinirlari icinde sabit rastgele noktalara yerlestirir.',
  code:R`margin = {{kenarBosluk=50}}; seedRandom(index, true); random([margin, margin], [thisComp.width - margin, thisComp.height - margin]);` },

{ id:'e011', name:'Circular Orbit Around Layer', cat:'Motion', prop:'Position', req:'Angle Control',
  desc:'Belirli bir yaricap ve hizda katman etrafinda dairesel yorunge cizer.',
  code:R`radius = {{yaricap=200}}; speed = {{hiz=1}}; angle = (time - inPoint) * speed * 2 * Math.PI; value + [Math.cos(angle)*radius, Math.sin(angle)*radius];` },

{ id:'e012', name:'DVD Screensaver Bounce', cat:'Motion', prop:'Position', req:'Yok',
  desc:'Klasik DVD logosu gibi kompozisyon kenarlarindan sekme hareketi uretir.',
  code:R`spd = {{hiz=400}}; b = sourceRectAtTime(); mx = thisComp.width - b.width; my = thisComp.height - b.height; x = (time*spd)%(2*mx); y = (time*spd*0.8)%(2*my); [x>mx ? 2*mx-x : x, y>my ? 2*my-y : y];` },

{ id:'e013', name:'Modulo Movement Loop', cat:'Looping', prop:'Position', req:'Yok',
  desc:'Modulo kullanarak belirli bir mesafede sifirlanan kesintisiz dogrusal hareket.',
  code:R`dur = {{sure=2}}; dist = {{mesafe=200}}; t = time % dur; value + [(t / dur) * dist, 0];` },

{ id:'e014', name:'Follow The Leader Delay', cat:'Parenting', prop:'Position', req:'Yok',
  desc:'Katmanin bir ustteki katmani belirli bir gecikmeyle takip etmesini saglar.',
  code:R`delay = {{gecikme=0.1}}; thisComp.layer(index - 1).position.valueAtTime(time - delay);` },

{ id:'e015', name:'Parent Position Delay (Frames)', cat:'Parenting', prop:'Position', req:'Parent Katman',
  desc:'Parent hareketini kare (frame) bazli gecikmeyle alt katmana aktarir.',
  code:R`delay = {{kare=5}}; parent.fromComp(toComp(anchorPoint, time - framesToTime(delay)));` },

{ id:'e016', name:'Pin Shape Layer to One Side', cat:'Transformation', prop:'Position', req:'Shape Layer',
  desc:'Seklin boyutu degisirken bir kenarini sabit tutar.',
  code:R`s = content("Rectangle 1").content("Rectangle Path 1"); [s.position[0] + s.size[0]/2, s.position[1]];` },

{ id:'e017', name:'Auto Grid Layout', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'Indeks numarasina gore katmanlari otomatik izgara (grid) duzenine dizer.',
  code:R`cols = {{sutun=5}}; spX = {{aralikX=200}}; spY = {{aralikY=200}}; i = index - 1; [(i % cols) * spX, Math.floor(i / cols) * spY];` },

{ id:'e018', name:'Ignore Parent Scale', cat:'Parenting', prop:'Scale', req:'Parent Katman',
  desc:'Ust katman olceklense bile bu katmanin boyutunu %100 sabit tutar.',
  code:R`s = []; ps = parent.transform.scale.value; for (i=0; i<ps.length; i++) s[i] = value[i]*100/ps[i]; s;` },

{ id:'e019', name:'Ignore Parent Scale (Deep)', cat:'Parenting', prop:'Scale', req:'Parent Katman',
  desc:'Cok seviyeli ic ice gecmis parent hiyerarsilerinde olcegi sabit tutar.',
  code:R`L = thisLayer; s = transform.scale.value; while(L.hasParent){ L = L.parent; for(i=0; i<s.length; i++) s[i]*=100/L.transform.scale.value[i]; } s;` },

{ id:'e020', name:'Auto Scale to Comp Size', cat:'Transformation', prop:'Scale', req:'Yok',
  desc:'Gorseli veya videoyu kompozisyon olculerine tam oturacak sekilde olcekler.',
  code:R`cw = thisComp.width; ch = thisComp.height; f = Math.min(cw/width, ch/height)*100; [f, f];` },

{ id:'e021', name:'Max Width Scale Constraint', cat:'Text & Typography', prop:'Scale', req:'Slider Control',
  desc:'Metin belirlenen piksel sinirini astiginda otomatik olarak kuculur.',
  code:R`maxW = effect("{{efekt=max-width}}")("Slider"); w = sourceRectAtTime(time, true).width; s = w>=maxW ? value[0]*maxW/w : value[0]; [s, s];` },

{ id:'e022', name:'Maintain Stroke Width', cat:'Shape Layers', prop:'Stroke Width', req:'Yok',
  desc:'Sekil buyutulup kucultuldugunde kontur cizgi kalinligini piksel olarak korur.',
  code:R`value / length(toComp([0,0]), toComp([0.7071, 0.7071]))||0.001;` },

{ id:'e023', name:'Maintain Stroke in 3D Space', cat:'Shape Layers', prop:'Stroke Width', req:'3D Camera',
  desc:'3D kameranin yakinlasma/uzaklasma durumunda kontur kalinligini korur.',
  code:R`cam = thisComp.activeCamera; d = length(cam.toWorld([0,0,0]), toWorld(anchorPoint)); value * (d / cam.cameraOption.focusDistance);` },

{ id:'e024', name:'Adaptive Text Box Size', cat:'Shape Layers', prop:'Size', req:'Ust katman metin olmali',
  desc:'Sekil katmanini metnin genislik ve yuksekligine gore padding ile boyutlandirir.',
  code:R`padX = {{padX=60}}; padY = {{padY=40}}; t = thisComp.layer(index - 1).sourceRectAtTime(); [t.width + padX*2, t.height + padY*2];` },

{ id:'e025', name:'Pulse Scale (Sine)', cat:'Motion', prop:'Scale', req:'Yok',
  desc:'Katmana nefes alma efekti gibi periyodik yumusak darbe animasyonu verir.',
  code:R`s = Math.sin(time * {{frekans=2}} * 2 * Math.PI) * {{genlik=10}}; value + [s, s];` },

{ id:'e026', name:'Exponential Growth Loop', cat:'Motion', prop:'Scale', req:'Yok',
  desc:'Periyodik olarak katlanarak buyuyen ve sifirlanan patlama dongusu.',
  code:R`dur = {{sure=2}}; t = (time - inPoint) % dur; factor = Math.pow(t / dur, 2); value + [factor*100, factor*100];` },

{ id:'e027', name:'Exponential Scale Fix', cat:'Motion', prop:'Scale', req:'2 Keyframe',
  desc:'Dogrusal olcek keyframe lerini dogal optik yakinlasma egrisine donusturur.',
  code:R`if (numKeys >= 2) { v1 = key(1).value[0]; v2 = key(2).value[0]; s = v1 * Math.pow(v2/v1, (time-key(1).time)/(key(2).time-key(1).time)); [s,s]; } else value;` },

{ id:'e028', name:'Squash & Stretch On Impact', cat:'Motion', prop:'Scale', req:'Yok',
  desc:'Carpisma ve temas noktalarinda hacmi koruyarak basilma-uzama efekti uretir.',
  code:R`t = time % {{periyot=1.5}}; s = Math.sin(t * 6 * Math.PI) / Math.exp(5 * t) * {{guc=20}}; [value[0] + s, value[1] - s];` },

{ id:'e029', name:'Proximity Scale Up', cat:'Transformation', prop:'Scale', req:'"Cursor" katmani',
  desc:'Fare imleci veya baska bir katman yaklastikca butonu buyutur.',
  code:R`d = length(position, thisComp.layer("{{hedef=Cursor}}").position); s = linear(d, 0, {{mesafe=300}}, {{maxOlcek=150}}, 100); [s, s];` },

{ id:'e030', name:'Ignore Parent Rotation', cat:'Parenting', prop:'Rotation', req:'Parent Katman',
  desc:'Ust katman donse dahi alt katmanin her zaman dik durmasini saglar.',
  code:R`value - parent.transform.rotation;` },

{ id:'e031', name:'Time Continuous Rotation', cat:'Motion', prop:'Rotation', req:'Yok',
  desc:'Keyframe olmadan saniyede sabit donus hareketi saglar.',
  code:R`time * {{dereceSaniye=360}};` },

{ id:'e032', name:'Stepped Clock Rotation', cat:'Motion', prop:'Rotation', req:'Yok',
  desc:'Mekanik saat yelkovani gibi her saniye kademeli atlama yapar.',
  code:R`angle = {{aci=15}}; durFr = 10 / (1 / thisComp.frameDuration); sec = Math.floor(time); ease(time, sec, sec + durFr, sec * angle, (sec + 1) * angle);` },

{ id:'e033', name:'Wheel Rotation by Distance', cat:'Motion', prop:'Rotation', req:'Slider Control',
  desc:'Katmanin X eksenindeki ilerlemesine gore tekerlegin tam tur atmasini saglar.',
  code:R`radius = effect("{{efekt=Wheel Radius}}")("Slider") / 2; linear(transform.position[0] % (2*Math.PI*radius), 0, 2*Math.PI*radius, 0, 360);` },

{ id:'e034', name:'Rolling Circle Rig', cat:'Motion', prop:'Rotation', req:'Ellipse Shape',
  desc:'Cember katmaninin zemin ustunde kaymadan yuvarlanmasini simule eder.',
  code:R`transform.position[0] - (content("Ellipse 1").content("Ellipse Path 1").size[0]/2) - transform.position[0]/2;` },

{ id:'e035', name:'Rolling Square Rig', cat:'Motion', prop:'Position', req:'Yok',
  desc:'Kare formundaki katmanin takla atarak zeminde yuvarlanma koordinatini yonetir.',
  code:R`sqW = sourceRectAtTime().width; rot = degreesToRadians(transform.rotation)*2; [position[0] + (sqW/2)*(transform.scale[0]/100)*transform.rotation/45, position[1] - Math.abs((Math.sqrt(2)*sqW/7)*Math.sin(rot))*(transform.scale[0]/100)];` },

{ id:'e036', name:'LookAt 2D Target', cat:'Transformation', prop:'Rotation', req:'Hedef katman',
  desc:'Katmanin yonunu hedef katmana cevirir (goz veya ok takibi).',
  code:R`delta = thisComp.layer("{{hedef=Target}}").position - position; radiansToDegrees(Math.atan2(delta[1], delta[0]));` },

{ id:'e037', name:'Oscillate Rotation (Pendulum)', cat:'Motion', prop:'Rotation', req:'Yok',
  desc:'Sarkac gibi iki aci arasinda yumusak sinus dalgasi salinimi yapar.',
  code:R`value + Math.sin(time * {{frekans=1.5}} * 2 * Math.PI) * {{aci=25}};` },

{ id:'e038', name:'Swinging Pendulum with Decay', cat:'Motion', prop:'Rotation', req:'Yok',
  desc:'Zamanla surtunmeyle yavaslayan gercekci sarkac durusu uretir.',
  code:R`{{aci=45}} * Math.cos(4 * Math.PI * time) * Math.exp(-{{sonumleme=0.5}} * time);` },

{ id:'e039', name:'Inherit Parent Opacity', cat:'Parenting', prop:'Opacity', req:'Parent Katman',
  desc:'Ust katmanin seffaflik degerini alt katmana dogrudan miras birakir.',
  code:R`(hasParent) ? parent.opacity : value;` },

{ id:'e040', name:'Invert Opacity of Layer', cat:'Parenting', prop:'Opacity', req:'Hedef katman',
  desc:'Baska bir katmanin gorunurlugu azaldikca bu katmani gorunur kilar.',
  code:R`linear(thisComp.layer("{{katman=Back}}").transform.opacity, 0, 100, 100, 0);` },

{ id:'e041', name:'Checkbox Opacity Toggle', cat:'Controls', prop:'Opacity', req:'Checkbox Control',
  desc:'Onay kutusu ile katmani 0 / 100 acip kapatir.',
  code:R`thisComp.layer("{{kontrolKatman=Controls}}").effect("{{efekt=Show Layer}}")("Checkbox") * 100;` },

{ id:'e042', name:'Dropdown Menu Switcher', cat:'Controls', prop:'Opacity', req:'Dropdown Menu Control',
  desc:'Katman adinin ilk karakterini acilir menu indeksiyle eslestirip gosterir.',
  code:R`select = thisComp.layer("{{kontrolKatman=CONTROLS}}").effect("{{efekt=Select}}")("Menu"); (select == parseInt(thisLayer.name[0])) ? value : 0;` },

{ id:'e043', name:'Auto Fade In/Out (Comp Range)', cat:'Motion', prop:'Opacity', req:'Yok',
  desc:'Katmanin In-point girisinde ve Out-point cikisinda otomatik kararir.',
  code:R`fade = {{sure=0.5}}; Math.min(linear(time, inPoint, inPoint + fade, 0, 100), linear(time, outPoint - fade, outPoint, 100, 0));` },

{ id:'e044', name:'Sharp Random Blink (0 or 100)', cat:'Randomness', prop:'Opacity', req:'Yok',
  desc:'Ara deger olmaksizin dijital on/off flas titremesi uretir.',
  code:R`Math.round(wiggle({{frekans=4}}, 50) / 100) * 100;` },

{ id:'e045', name:'Random Neon Flicker', cat:'Randomness', prop:'Opacity', req:'Yok',
  desc:'Bozuk neon lamba titremesi simulasyonu uretir.',
  code:R`seedRandom(index, false); random() > {{esik=0.85}} ? random(20, 100) : 100;` },

{ id:'e046', name:'3D Camera Distance Opacity', cat:'3D & Camera', prop:'Opacity', req:'3D Camera',
  desc:'Kameraya olan mesafeye gore katmanin gorunurlugunu eritir.',
  code:R`C = thisComp.activeCamera.toWorld([0,0,0]); P = toWorld(anchorPoint); linear(length(C, P), {{yakin=500}}, {{uzak=1500}}, 100, 0);` },

{ id:'e047', name:'Hide 3D Backface', cat:'3D & Camera', prop:'Opacity', req:'3D Katman',
  desc:'Kameraya arkasi donuk olan 3D katmanlari otomatik olarak gizler.',
  code:R`toCompVec([0, 0, 1])[2] > 0 ? value : 0;` },

// ---------------------------------------------------------------- RANDOMNESS
{ id:'e048', name:'Basic Wiggle', cat:'Randomness', prop:'Any', req:'Yok',
  desc:'Standart After Effects rastgele titresim ifadesi.',
  code:R`wiggle({{frekans=2}}, {{genlik=30}});` },

{ id:'e049', name:'Wiggle Controlled by Sliders', cat:'Randomness', prop:'Any', req:'Slider Control x2',
  desc:'Titresim frekansini ve genligini Slider denetleyicilerine baglar.',
  code:R`wiggle(effect("{{frekansEfekti=Frequency}}")("Slider"), effect("{{genlikEfekti=Amplitude}}")("Slider"));` },

{ id:'e050', name:'Loop a Wiggle (Seamless)', cat:'Looping', prop:'Any', req:'Yok',
  desc:'Belirli bir saniyede atlama yapmadan kusursuz donguye giren wiggle.',
  code:R`loopSec = {{donguSure=3}}; t = time % loopSec; linear(t, 0, loopSec, wiggle(2, 40, 1, 0.5, t), wiggle(2, 40, 1, 0.5, t - loopSec));` },

{ id:'e051', name:'Wiggle on One Dimension (X)', cat:'Randomness', prop:'Position', req:'Yok',
  desc:'Salinimi sadece X eksenine kisitlar, Y eksenini sabit tutar.',
  code:R`w = wiggle({{frekans=2}}, {{genlik=10}}); [w[0], value[1]];` },

{ id:'e052', name:'Wiggle on One Dimension (Y)', cat:'Randomness', prop:'Position', req:'Yok',
  desc:'Salinimi sadece Y eksenine kisitlar, X eksenini sabit tutar.',
  code:R`w = wiggle({{frekans=2}}, {{genlik=10}}); [value[0], w[1]];` },

{ id:'e053', name:'Wiggle Between Two Values', cat:'Randomness', prop:'Any (1D)', req:'Yok',
  desc:'Belirlenen minimum ve maksimum deger araligina kilitlenmis wiggle.',
  code:R`minVal = {{min=-10}}; maxVal = {{max=50}}; wiggle({{frekans=5}}, Math.abs(maxVal - minVal) / 2) + (maxVal + minVal) / 2;` },

{ id:'e054', name:'Posterize Wiggle (Stop Motion)', cat:'Randomness', prop:'Any', req:'Yok',
  desc:'Dusuk kare hizinda kesintili stop-motion hissi veren titreme.',
  code:R`posterizeTime({{fps=12}}); wiggle({{frekans=3}}, {{genlik=30}});` },

{ id:'e055', name:'Wiggle Based on Layer Speed', cat:'Randomness', prop:'Position', req:'Yok',
  desc:'Katman hareket etmediginde hareketsiz durur, hizlandikca titrer.',
  code:R`wiggle(5, linear(speed, 0, {{maxHiz=500}}, 0, {{maxGenlik=50}}));` },

{ id:'e056', name:'Frozen Random Value', cat:'Randomness', prop:'Any', req:'Yok',
  desc:'Timeline boyunca her karede degismeyen sabit rastgele deger uretir.',
  code:R`seedRandom(index, true); random({{min=0}}, {{max=100}});` },

{ id:'e057', name:'Gaussian Random Distribution', cat:'Randomness', prop:'Any', req:'Yok',
  desc:'Can egrisine gore ortalama etrafinda kumelenen dogal rastgele deger.',
  code:R`gaussRandom({{min=0}}, {{max=100}});` },

{ id:'e058', name:'Perlin Noise Float Drift', cat:'Randomness', prop:'Any', req:'Yok',
  desc:'Wiggle yerine daha yumusak ve akici suzulme dalgasi uretir.',
  code:R`noise(time * {{hiz=2}}) * {{genlik=60}};` },

// ---------------------------------------------------------------- LOOPING
{ id:'e059', name:'Loop In and Out Combined', cat:'Looping', prop:'Keyframed', req:'Keyframe',
  desc:'Keyframe animasyonunu hem ileriye hem geriye dogru sonsuz donguye sokar.',
  code:R`loopIn() + loopOut() - value;` },

{ id:'e060', name:'Standard loopOut Cycle', cat:'Looping', prop:'Keyframed', req:'Keyframe',
  desc:'Keyframeleri sonsuza kadar dongu halinde oynatir.',
  code:R`loopOut("cycle");` },

{ id:'e061', name:'loopOut PingPong', cat:'Looping', prop:'Keyframed', req:'Keyframe',
  desc:'Animasyonu ileri-geri pinpon seklinde surekli tekrar eder.',
  code:R`loopOut("pingpong");` },

{ id:'e062', name:'loopOut Offset', cat:'Looping', prop:'Keyframed', req:'Keyframe',
  desc:'Her donguda son keyframe degerini kumulatif ekleyerek ilerler.',
  code:R`loopOut("offset");` },

{ id:'e063', name:'loopOut Continue', cat:'Looping', prop:'Keyframed', req:'Keyframe',
  desc:'Son anahtar karedeki hiz ve yonu sonsuzluga dogru surdurur.',
  code:R`loopOut("continue");` },

{ id:'e064', name:'Loop Path Keyframes', cat:'Looping', prop:'Path', req:'Path Keyframe',
  desc:'Standart loopOut un calismadigi Shape veya Mask Path lerini donguye sokar.',
  code:R`if (numKeys > 1 && time > key(numKeys).time) { t1 = key(1).time; t2 = key(numKeys).time; valueAtTime(t1 + ((time - t2) % (t2 - t1))); } else value;` },

{ id:'e065', name:'Universal Path Loop', cat:'Looping', prop:'Path', req:'Path Keyframe',
  desc:'Hem Cycle hem PingPong destekleyen gelismis yol dongu motoru.',
  code:R`if (numKeys > 1){ dur = key(numKeys).time - key(1).time; t = ((time - key(1).time) % dur + dur) % dur; valueAtTime(t + key(1).time); } else value;` },

// ---------------------------------------------------------------- PHYSICS
{ id:'e066', name:'Inertial Bounce / Overshoot', cat:'Physics & Elasticity', prop:'Position', req:'Keyframe',
  desc:'Anahtar kare duruslarinda hizdan beslenen dogal yaylanma/sekme uretir.',
  code:R`amp = {{genlik=0.05}}; freq = {{frekans=4}}; decay = {{sonumleme=8}};
n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
t = n === 0 ? 0 : time - key(n).time;
if (n > 0 && t < 1) { v = velocityAtTime(key(n).time - 0.01); value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t); } else { value; }` },

{ id:'e067', name:'Text Animator Elastic Spring', cat:'Physics & Elasticity', prop:'Expression Selector', req:'Text Animator',
  desc:'Tipografi animatorunde harflerin elastik sekerek dizilmesini saglar.',
  code:R`t = time - (inPoint + (textIndex - 1)*{{gecikme=0.05}}); if(t < 0.12) linear(t, 0, 0.12, 100, 0); else 0 + (-100/0.12)*(Math.sin(t*4*Math.PI)/Math.exp(4*t)/(4*Math.PI));` },

{ id:'e068', name:'Physics Gravity Drop Bounce', cat:'Physics & Elasticity', prop:'Position', req:'Yok',
  desc:'Anahtar kare olmadan top dusmesi ve zeminden sonumlu ziplama simulasyonu.',
  code:R`t = time % {{periyot=2}}; floorY = {{zemin=900}}; h0 = {{yukseklik=100}}; [value[0], floorY - Math.abs(Math.cos(t*Math.PI)*(floorY-h0)*Math.pow(0.75, t*3))];` },

{ id:'e069', name:'Elastic Layer Tether', cat:'Physics & Elasticity', prop:'Position', req:'Hedef katman',
  desc:'Iki katmani elastik bir yay/lastik ile birbirine baglar.',
  code:R`leaderPos = thisComp.layer("{{lider=Leader}}").position.valueAtTime(time - {{gecikme=0.15}}); value + (leaderPos - value) * {{sertlik=0.5}};` },

{ id:'e070', name:'Expose Layer Speed', cat:'Motion', prop:'Slider', req:'Slider Control',
  desc:'Katmanin saniyedeki anlik piksel hizini skaler olarak olcer.',
  code:R`speed;` },

{ id:'e071', name:'Expose Layer Velocity', cat:'Motion', prop:'Any', req:'Yok',
  desc:'Katmanin anlik yon vektorunu [Vx, Vy] degerini dondurur.',
  code:R`velocity;` },

// ---------------------------------------------------------------- MARKERS
{ id:'e072', name:'Trigger on Layer Marker', cat:'Markers', prop:'Any', req:'Layer Marker',
  desc:'Katmana yerlestirilen her isaretcide belirlenen kodu tetikler.',
  code:R`n = 0; if (marker.numKeys > 0) { n = marker.nearestKey(time).index; if (marker.key(n).time > time) n--; } n == 0 ? value : valueAtTime(time - marker.key(n).time);` },

{ id:'e073', name:'Reverse on Marker Duration', cat:'Markers', prop:'Keyframed', req:'Layer Marker',
  desc:'Isaretci baslangicinda ileri oynatir, isaretcinin ortasinda geri sarar.',
  code:R`m = thisLayer.marker; if(m.numKeys>0){ n=m.nearestKey(time).index; if(m.key(n).time>time) n--; if(n>0){ tIn=m.key(n).time; tMid=tIn+m.key(n).duration/2; time<tMid ? valueAtTime(key(1).time+(time-tIn)) : valueAtTime(key(numKeys).time-(time-tMid)); }else value;}else value;` },

{ id:'e074', name:'Auto Fade Between 2 Markers', cat:'Markers', prop:'Opacity', req:'2 Layer Marker',
  desc:'1. markere kadar acilir, 2. marker ile cikis noktasi arasinda kararir.',
  code:R`if (marker.numKeys >= 2) linear(time, inPoint, marker.key(1).time, 0, 100) * linear(time, marker.key(2).time, outPoint, 1, 0); else value;` },

{ id:'e075', name:'Delay Keyframes with Slider', cat:'Controls', prop:'Keyframed', req:'Slider Control',
  desc:'Animasyonun baslama anini saniye cinsinden Slider ile geciktirir.',
  code:R`valueAtTime(time - thisComp.layer("{{kontrolKatman=Controls}}").effect("{{efekt=Delay}}")("Slider"));` },

{ id:'e076', name:'Delay Animation by Frames', cat:'Motion', prop:'Keyframed', req:'Keyframe',
  desc:'Keyframeleri sabit kare sayisi kadar zamanda oteler.',
  code:R`valueAtTime(time - {{kare=3}} * thisComp.frameDuration);` },

// ---------------------------------------------------------------- TEXT
{ id:'e077', name:'Counter (Fixed Decimals)', cat:'Text & Typography', prop:'Source Text', req:'Slider Control',
  desc:'Slider sayisini sabit ondalik basamakla metin olarak yazdirir.',
  code:R`effect("{{efekt=Slider Control}}")("Slider").value.toFixed({{basamak=2}});` },

{ id:'e078', name:'Counter (Comma Decimal)', cat:'Text & Typography', prop:'Source Text', req:'Slider Control',
  desc:'Ondalik ayraci olarak nokta yerine virgul kullanir.',
  code:R`parseFloat(effect("{{efekt=Slider Control}}")("Slider")).toFixed({{basamak=2}}).replace(".", ",");` },

{ id:'e079', name:'Counter with Currency/Prefix', cat:'Text & Typography', prop:'Source Text', req:'Slider Control',
  desc:'Sayinin onune ve sonuna para birimi veya yuzde simgesi ekler.',
  code:R`"{{onEk=$}}" + parseFloat(effect("{{efekt=Slider Control}}")("Slider")).toFixed(2) + "{{sonEk= /mo}}";` },

{ id:'e080', name:'Counter with Leading Zeros', cat:'Text & Typography', prop:'Source Text', req:'Slider Control',
  desc:'Sayinin basina sifir ekleyerek belirlenen basamaga tamamlar.',
  code:R`("000" + Math.floor(effect("{{efekt=Slider Control}}")("Slider"))).slice(-{{basamak=3}});` },

{ id:'e081', name:'Counter with Digit Grouping', cat:'Text & Typography', prop:'Source Text', req:'Slider Control',
  desc:'Binlik basamaklari bosluk veya virgulle ayirir.',
  code:R`parseFloat(effect("{{efekt=Slider Control}}")("Slider")).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "{{ayrac=,}}");` },

{ id:'e082', name:'Counter Bypass Limit', cat:'Text & Typography', prop:'Source Text', req:'Angle Control',
  desc:'Standart Slider in 1M limitini Angle Control kullanarak asar.',
  code:R`Math.round(effect("{{efekt=Angle Control}}")("Angle") / 360).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");` },

{ id:'e083', name:'Dynamic Counter (No Keys)', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Keyframe olmadan belirlenen surede baslangictan bitise sayar.',
  code:R`Math.round(linear(time, inPoint, inPoint + {{sure=3}}, {{baslangic=0}}, {{bitis=1000}}));` },

{ id:'e084', name:'Progress Percentage Readout', cat:'Text & Typography', prop:'Source Text', req:'Slider Control',
  desc:'Slider verisine gore "Progress: 85%" seklinde metin uretir.',
  code:R`"{{etiket=Progress: }}" + Math.round(effect("{{efekt=Slider Control}}")("Slider")) + "%";` },

{ id:'e085', name:'Typewriter with Flashing Cursor', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Yanip sonen imlec ile harf harf daktilo yazma efekti.',
  code:R`chars = Math.min(Math.floor((time - inPoint)*{{hiz=15}}), value.length); blink = Math.floor(time*2)%2===0 ? "_" : " "; value.substring(0, chars) + blink;` },

{ id:'e086', name:'Word-by-Word Write-On', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Metni harf yerine kelime kelime ekrana getirir.',
  code:R`words = value.split(" "); count = Math.min(Math.floor((time - inPoint)*{{hiz=2}}), words.length); words.slice(0, count).join(" ");` },

{ id:'e087', name:'Text Scramble Matrix Reveal', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Siber harf parazitleriyle metni zamanla cozen animasyon.',
  code:R`chars = "ABCDEF0123456789!@#$%"; tgt = value; prog = linear(time-inPoint, 0, {{sure=2}}, 0, tgt.length); out = ""; for(i=0; i<tgt.length; i++) out += (i<prog) ? tgt[i] : chars[Math.floor(random(chars.length))]; out;` },

{ id:'e088', name:'Matrix Binary Stream', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Ekrana surekli akan rastgele ikili kod dizisi uretir.',
  code:R`seedRandom(Math.floor(time * 10), true); s = ""; for (i=0; i<{{uzunluk=20}}; i++) s += Math.round(random()) + " "; s;` },

{ id:'e089', name:'Digital Timer (HH:MM:SS)', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Zamani bicimlendirilmis dijital saat / kronometreye cevirir.',
  code:R`sec = Math.floor(time); p = function(n){ return n < 10 ? "0" + n : n; }; p(Math.floor(sec/3600)) + ":" + p(Math.floor((sec%3600)/60)) + ":" + p(sec%60);` },

{ id:'e090', name:'Digital Timer (MM:SS.MS)', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Milisaniye hassasiyetinde dijital kronometre sayaci.',
  code:R`p = function(n){ return n < 10 ? "0" + n : n; }; p(Math.floor(time/60)) + ":" + p(Math.floor(time%60)) + "." + p(Math.floor((time%1)*100));` },

{ id:'e091', name:'Broadcast Timecode Counter', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Kare hassasiyetinde yayin standardi timecode dokumu uretir.',
  code:R`timeToTimecode(time, 1 / thisComp.frameDuration, false);` },

{ id:'e092', name:'Dynamic Current Date', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Sistemin guncel takvim tarihini DD/MM/YYYY olarak yazdirir.',
  code:R`d = new Date(); p = function(n){ return n < 10 ? '0' + n : n; }; p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();` },

{ id:'e093', name:'Days Left Countdown', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Hedeflenen bir tarihe kac gun kaldigini canli hesaplar.',
  code:R`Math.ceil((new Date("{{tarih=2026-12-25}}") - new Date()) / (1000*60*60*24)) + "{{etiket= Days Left}}";` },

{ id:'e094', name:'Character Counter', cat:'Text & Typography', prop:'Source Text', req:'Hedef metin katmani',
  desc:'Hedef metin katmanindaki karakter sayisini canli gosterir.',
  code:R`thisComp.layer("{{katman=Text Layer}}").text.sourceText.value.replace(/\s/g, "").length + " chars";` },

{ id:'e095', name:'Word Counter', cat:'Text & Typography', prop:'Source Text', req:'Hedef metin katmani',
  desc:'Metin blogu icindeki toplam kelime sayisini hesaplar.',
  code:R`thisComp.layer("{{katman=Script}}").text.sourceText.value.replace(/^\s+|\s+$/g,"").split(/\s+/).length + " words";` },

{ id:'e096', name:'Row / Line Counter', cat:'Text & Typography', prop:'Source Text', req:'Hedef metin katmani',
  desc:'Paragraftaki satir sayisini dinamik olarak bildirir.',
  code:R`thisComp.layer("{{katman=Paragraph}}").text.sourceText.value.split(/\r\n|\r|\n/).length + " lines";` },

{ id:'e097', name:'Convert Spaces to Line Breaks', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Bosluklari alt satira gecise cevirerek metni dikey formatlar.',
  code:R`value.replace(/\s+/g, "\n");` },

{ id:'e098', name:'Text Find and Replace', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Sablonlardaki belirli bir anahtar kelimeyi otomatik degistirir.',
  code:R`value.replace(/{{aranan=client}}/gi, "{{yeni=Partner}}");` },

{ id:'e099', name:'Mirror Text and Style', cat:'Text & Typography', prop:'Source Text', req:'Hedef metin katmani',
  desc:'Ana katmandan hem metni hem de tipografi stilini kopyalar.',
  code:R`thisComp.layer("{{katman=Master Text}}").text.sourceText;` },

{ id:'e100', name:'Get Comp Name as Text', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Kompozisyon adini otomatik olarak metin katmanina yazar.',
  code:R`thisComp.name;` },

// ---------------------------------------------------------------- MATH
{ id:'e101', name:'Linear Interpolation Remapper', cat:'Math', prop:'Any', req:'Slider Control',
  desc:'Girdi araligini orantili olarak baska bir araliga donusturur.',
  code:R`linear(effect("{{efekt=Slider Control}}")("Slider"), {{girisMin=0}}, {{girisMax=100}}, {{cikisMin=450}}, {{cikisMax=650}});` },

{ id:'e102', name:'Ease Interpolation Range', cat:'Math', prop:'Any', req:'Slider Control',
  desc:'Girdi degerlerini S-egrisi yumusatmasiyla yeniden haritalandirir.',
  code:R`ease(effect("{{efekt=Slider Control}}")("Slider"), {{girisMin=0}}, {{girisMax=100}}, {{cikisMin=0}}, {{cikisMax=1920}});` },

{ id:'e103', name:'Sine Wave Oscillation', cat:'Math', prop:'Any', req:'Yok',
  desc:'Periyodik salinim hareketleri icin temel sinus fonksiyonu.',
  code:R`Math.sin(time * {{frekans=1}} * 2 * Math.PI) * {{genlik=100}};` },

{ id:'e104', name:'Cosine Wave Oscillation', cat:'Math', prop:'Any', req:'Yok',
  desc:'Tepe noktasindan baslayan kosinus salinim formulu.',
  code:R`Math.cos(time * {{frekans=1}} * 2 * Math.PI) * {{genlik=100}};` },

{ id:'e105', name:'Multi-Frequency Harmonic', cat:'Math', prop:'Position', req:'Yok',
  desc:'Birden cok frekansi birlestirerek organik akiskan salinim uretir.',
  code:R`t = time; value + [Math.sin(t*2*Math.PI)*50 + Math.sin(t*4.6*Math.PI)*30 + Math.sin(t*7.4*Math.PI)*20, 0];` },

{ id:'e106', name:'Clamp Value Range', cat:'Math', prop:'Any', req:'Yok',
  desc:'Degerin belirlenen alt ve ust siniri asmasini engeller.',
  code:R`clamp(value, {{min=0}}, {{max=100}});` },

{ id:'e107', name:'Posterize Time Lock', cat:'Math', prop:'Any', req:'Yok',
  desc:'Katmanin yenilenme hizini ozel kare hizina kilitler.',
  code:R`posterizeTime({{fps=8}}); value;` },

// ---------------------------------------------------------------- EFFECTS & 3D
{ id:'e108', name:'Link Gradient to Comp Space', cat:'Effects & Color', prop:'Ramp Start', req:'Ramp efekti',
  desc:'Katman hareket etse de degrade baslangic ve bitisini ekranda kilitler.',
  code:R`toComp(value);` },

{ id:'e109', name:'Camera Focus Match (DoF)', cat:'3D & Camera', prop:'Focus Distance', req:'Camera + hedef',
  desc:'3D kameranin netligini hedef katmanin mesafesine kilitler.',
  code:R`target = thisComp.layer("{{hedef=Target Layer}}"); dot(target.toWorld(target.anchorPoint) - toWorld([0,0,0]), toWorldVec([0,0,1]));` },

{ id:'e110', name:'Magnifier Bulge Center', cat:'Effects & Color', prop:'Bulge Center', req:'Bulge efekti',
  desc:'Buyutec efekt merkezini buyutec katmaninin koordinatina baglar.',
  code:R`fromWorld(thisComp.layer("{{katman=Magnifier}}").position);` },

{ id:'e111', name:'Rainbow Hue Color Cycle', cat:'Effects & Color', prop:'Color', req:'Yok',
  desc:'Renk degerini gokkusagi tayfinda surekli ve puruzsuzce dondurur.',
  code:R`hslToRgb([(time * {{hiz=0.2}}) % 1, 1, 0.5, 1]);` },

{ id:'e112', name:'Single Corner Radius Box', cat:'Shape Layers', prop:'Roundness', req:'Rectangle Shape',
  desc:'Seklin secilen kosesini yuvarlatir.',
  code:R`{{yaricap=25}};` },

{ id:'e113', name:'Procedural Sine Wave Line', cat:'Shape Layers', prop:'Path', req:'Shape Layer',
  desc:'Eklentisiz dinamik animasyonlu sinus dalga cizgisi uretir.',
  code:R`pts = []; for (i=0; i<={{nokta=20}}; i++) pts.push([i*{{aralik=50}}, Math.sin(i*0.5 + time*{{hiz=5}})*{{genlik=40}}]); createPath(pts, [], [], false);` },

{ id:'e114', name:'Procedural Spiral Path', cat:'Shape Layers', prop:'Path', req:'Shape Layer',
  desc:'Matematiksel Arsimet spirali vektor patikasi cizer.',
  code:R`pts = []; for (th=0; th<{{tur=20}}; th+=0.2) pts.push([Math.cos(th+time)*th*15, Math.sin(th+time)*th*15]); createPath(pts, [], [], false);` },

{ id:'e115', name:'Heartbeat Pulse (Lub-Dub)', cat:'Motion', prop:'Scale', req:'Yok',
  desc:'Gercekci ikili kalp atis ritmi dalgasi uretir.',
  code:R`t = time % {{periyot=1.0}}; b = 0; if (t < 0.15) b = Math.sin(t/0.15*Math.PI)*{{guc=20}}; else if (t>=0.2 && t<0.35) b = Math.sin((t-0.2)/0.15*Math.PI)*12; value + [b, b];` },

// ---------------------------------------------------------------- METADATA
{ id:'e116', name:'Comp Aspect Ratio Slate', cat:'Metadata', prop:'Source Text', req:'Yok',
  desc:'Kompozisyon en/boy oranini dinamik yazar (16:9, 9:16).',
  code:R`function gcd(a, b){ return b ? gcd(b, a % b) : a; } d = gcd(thisComp.width, thisComp.height); (thisComp.width/d) + ":" + (thisComp.height/d);` },

{ id:'e117', name:'Comp Resolution & FPS Slate', cat:'Metadata', prop:'Source Text', req:'Yok',
  desc:'Cozunurluk ve kare hizini kalite kontrol slatelarinda gosterir.',
  code:R`thisComp.width + "x" + thisComp.height + " @ " + (1/thisComp.frameDuration).toFixed(2) + " fps";` },

{ id:'e118', name:'Total Layer Count Slate', cat:'Metadata', prop:'Source Text', req:'Yok',
  desc:'Kompozisyondaki toplam aktif katman sayisini yazdirir.',
  code:R`"Total Layers: " + thisComp.numLayers;` },

{ id:'e119', name:'Bounding Box Collision', cat:'Controls', prop:'Opacity', req:'"Collider" katmani',
  desc:'Iki katmanin sinir kutulari temas ettiginde tetikleme yapar.',
  code:R`r1 = sourceRectAtTime(); r2 = thisComp.layer("{{hedef=Collider}}").sourceRectAtTime(); p1 = position; p2 = thisComp.layer("{{hedef=Collider}}").position; !(p1[0]+r1.width<p2[0]||p1[0]>p2[0]+r2.width||p1[1]+r1.height<p2[1]||p1[1]>p2[1]+r2.height) ? 100 : 20;` },

{ id:'e120', name:'Weekday Visibility Trigger', cat:'Controls', prop:'Opacity', req:'Yok',
  desc:'Katmani sadece belirli bir haftanin gununde gorunur yapar.',
  code:R`new Date().getDay() === {{gun=5}} ? 100 : 0;` },

{ id:'e121', name:'Flip Sprite by Screen Center', cat:'Transformation', prop:'Scale', req:'Yok',
  desc:'Katman ekranin sagina gecince yatayda aynalama yapar.',
  code:R`position[0] > thisComp.width / 2 ? [-Math.abs(value[0]), value[1]] : [Math.abs(value[0]), value[1]];` },

{ id:'e122', name:'Link to Layer Above', cat:'Parenting', prop:'Any', req:'Yok',
  desc:'Katmani isim bagimsiz olarak bir ust katmana baglar.',
  code:R`thisComp.layer(index - 1).position;` },

{ id:'e123', name:'Link to Layer Below', cat:'Parenting', prop:'Any', req:'Yok',
  desc:'Katmani isim bagimsiz olarak bir alt katmana baglar.',
  code:R`thisComp.layer(index + 1).position;` },

{ id:'e124', name:'Throw Decelerating Drift', cat:'Motion', prop:'Position', req:'Yok',
  desc:'Firlatilan bir nesnenin surtunmeyle yavaslamasini simule eder.',
  code:R`value + [{{hiz=800}} * (1 - Math.exp(-1.5 * time)) / 1.5, 0];` },

{ id:'e125', name:'Falling Snow / Leaves Drift', cat:'Motion', prop:'Position', req:'Yok',
  desc:'Yagan kar veya dokulen yapraklarin salinarak dususelerini uretir.',
  code:R`seedRandom(index, true); [value[0] + Math.sin(time*random(1, 3))*random(20, 60), (value[1] + (time-inPoint)*random({{minHiz=100}}, {{maxHiz=250}})) % (thisComp.height + 100) - 50];` },

{ id:'e126', name:'Bell Shake & Ring Motion', cat:'Motion', prop:'Rotation', req:'Yok',
  desc:'Bildirim cani gibi periyodik araliklarla cingirak sarsintisi yapar.',
  code:R`t = time % {{periyot=4}}; t < 0.6 ? Math.sin(t * 30) * Math.exp(-t * 6) * {{aci=35}} : 0;` },

{ id:'e127', name:'Responsive Fullscreen Box', cat:'Shape Layers', prop:'Size', req:'Rectangle Shape',
  desc:'Sekil katmanini her zaman %100 kompozisyon ebadinda tutar.',
  code:R`[thisComp.width, thisComp.height];` },

{ id:'e128', name:'Constrain in Circle Bounds', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'Katmanin dairesel bir cercevenin disina cikmasini engeller.',
  code:R`center = [thisComp.width/2, thisComp.height/2]; v = value - center; length(v) > {{yaricap=300}} ? center + normalize(v)*{{yaricap=300}} : value;` },

{ id:'e129', name:'Color Blend by Position', cat:'Effects & Color', prop:'Color', req:'Yok',
  desc:'Katman ekranda saga dogru kaydikca rengini kirmizidan maviye cevirir.',
  code:R`linear(position[0], 0, thisComp.width, [1, 0.2, 0.2, 1], [0.2, 0.6, 1, 1]);` },

{ id:'e130', name:'Procedural Zig-Zag Line', cat:'Shape Layers', prop:'Path', req:'Shape Layer',
  desc:'Kodla parametrik testere disi / zikzak cizgisi cizer.',
  code:R`pts = []; for (i=0; i<={{nokta=20}}; i++) pts.push([i*{{aralik=40}}, (i%2===0 ? -{{yukseklik=20}} : {{yukseklik=20}})]); createPath(pts, [], [], false);` },

{ id:'e131', name:'Procedural Gear Cog Teeth', cat:'Shape Layers', prop:'Path', req:'Shape Layer',
  desc:'Parametrik mekanik disli cark formu uretir.',
  code:R`teeth = {{dis=12}}; pts = []; for (i=0; i<teeth*2; i++) { a = (i/(teeth*2))*Math.PI*2; r = (i%2===0 ? {{disR=140}} : {{icR=100}}); pts.push([Math.cos(a)*r, Math.sin(a)*r]); } createPath(pts, [], [], true);` },

{ id:'e132', name:'Procedural North Star Shape', cat:'Shape Layers', prop:'Path', req:'Shape Layer',
  desc:'Parlak 4 koseli kuzey yildizi vektor patikasi cizer.',
  code:R`pts = [[0,-150],[20,-20],[150,0],[20,20],[0,150],[-20,20],[-150,0],[-20,-20]]; createPath(pts, [], [], true);` },

{ id:'e133', name:'Procedural Candle Flame', cat:'Shape Layers', prop:'Path', req:'Shape Layer',
  desc:'Organik titresen damla formunda mum alevi yolu uretir.',
  code:R`pts = [[0, -100 + Math.sin(time*15)*5], [40, 20], [0, 50], [-40, 20]]; createPath(pts, [[-20,0],[0,-30],[20,0],[0,30]], [[20,0],[0,30],[-20,0],[0,-30]], true);` },

{ id:'e134', name:'Procedural Snowflake Crystal', cat:'Shape Layers', prop:'Path', req:'Shape Layer',
  desc:'Her katmanda farkli dallara sahip 6 eksenli kar tanesi geometrisi.',
  code:R`seedRandom(index, true); arm = random(100, 160); pts = []; for(a=0; a<6; a++) { ang = a*Math.PI/3; pts.push([Math.cos(ang)*arm, Math.sin(ang)*arm]); pts.push([0, 0]); } createPath(pts, [], [], false);` },

{ id:'e135', name:'DNA Double Helix Strand', cat:'Shape Layers', prop:'Path', req:'Shape Layer',
  desc:'3D perspektifte dalgalanan DNA heliks zinciri cizgisi olusturur.',
  code:R`pts = []; for (i=0; i<=30; i++) pts.push([i*35, Math.sin(time*3 + i*0.3)*60]); createPath(pts, [], [], false);` },

{ id:'e136', name:'Repeat Text Pattern', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Tipografi arka plani icin metni pes pese tekrarlar.',
  code:R`s = ""; for (i = 0; i < {{tekrar=10}}; i++) s += "{{metin=DESIGN }}"; s;` },

{ id:'e137', name:'Hanging Ornament Sway', cat:'Motion', prop:'Rotation', req:'Yok',
  desc:'Asili duran tabela veya lambanin ruzgarla salinimini saglar.',
  code:R`value + Math.sin(time * 1.5) * {{genlik=12}} + Math.sin(time * 3.8) * 4;` },

{ id:'e138', name:'Eye Blink Random Interval', cat:'Character Animation', prop:'Scale', req:'Yok',
  desc:'Karakter goz kapaklarinin rastgele araliklarla kirpilmasini saglar.',
  code:R`seedRandom(Math.floor(time/3), true); (time % random({{min=2}}, {{max=5}})) < 0.12 ? [value[0], 0] : value;` },

{ id:'e139', name:'Audio Reactive Scale Pulse', cat:'Audio & Reactive', prop:'Scale', req:'Audio Amplitude katmani',
  desc:'Katmanin muzik ritmine gore buyumesini saglar.',
  code:R`s = linear(thisComp.layer("{{katman=Audio Amplitude}}").effect("Both Channels")("Slider"), 0, {{esik=40}}, 100, {{maxOlcek=140}}); [s, s];` },

{ id:'e140', name:'Dynamic Light Drop Shadow', cat:'Effects & Color', prop:'Shadow Angle', req:'"Light Source" katmani',
  desc:'Isik kaynaginin konumuna gore golgenin acisini otomatik hesaplar.',
  code:R`d = position - thisComp.layer("{{isik=Light Source}}").position; radiansToDegrees(Math.atan2(d[1], d[0]));` },

{ id:'e141', name:'Auto Wiggle on Proximity', cat:'Randomness', prop:'Position', req:'"Cursor" katmani',
  desc:'Baska bir katman yaklastiginda panik halinde titreme baslatir.',
  code:R`wiggle(10, linear(length(position, thisComp.layer("{{hedef=Cursor}}").position), 50, 400, {{maxGenlik=30}}, 0));` },

{ id:'e142', name:'Scale Across Comp Duration', cat:'Motion', prop:'Scale', req:'Yok',
  desc:'Kompozisyon basindan sonuna kadar cok hafif ve kesintisiz zoom yapar.',
  code:R`s = linear(time, 0, thisComp.duration, {{baslangic=100}}, {{bitis=120}}); [s, s];` },

{ id:'e143', name:'In-Point Glitch Tremor', cat:'Motion', prop:'Position', req:'Yok',
  desc:'Katmanin sahneye girdigi ilk anlarda sert sarsinti uretir.',
  code:R`(time - inPoint) < {{sure=0.3}} ? wiggle(30, {{genlik=25}}) : value;` },

{ id:'e144', name:'Snap to Pixel Grid', cat:'Transformation', prop:'Position', req:'Yok',
  desc:'Koordinatlari tam sayiya yuvarlayarak alt piksel bulaniligini onler.',
  code:R`[Math.round(value[0]), Math.round(value[1])];` },

{ id:'e145', name:'Auto-Orient Along Velocity', cat:'Motion', prop:'Rotation', req:'Yok',
  desc:'Katmanin acisini her zaman hareket yonunun tegetine cevirir.',
  code:R`velocity[0] !== 0 || velocity[1] !== 0 ? radiansToDegrees(Math.atan2(velocity[1], velocity[0])) : value;` },

{ id:'e146', name:'Keep Upright on Curve', cat:'Motion', prop:'Scale', req:'Yok',
  desc:'Egimli yollarda ters donen nesnelerin bas asagi gorunmesini engeller.',
  code:R`transform.rotation > 90 && transform.rotation < 270 ? [value[0], -value[1]] : value;` },

{ id:'e147', name:'Checkbox Switcher (Value A/B)', cat:'Controls', prop:'Any', req:'Checkbox Control',
  desc:'Checkbox isaretliyse B degerini, degilse A degerini verir.',
  code:R`effect("{{efekt=Checkbox Control}}")("Checkbox").value ? {{degerB=100}} : {{degerA=0}};` },

{ id:'e148', name:'Text Uppercase Enforcer', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Girilen metni tamamen buyuk harfe donusturur.',
  code:R`value.toUpperCase();` },

{ id:'e149', name:'Text Truncator with Ellipsis', cat:'Text & Typography', prop:'Source Text', req:'Yok',
  desc:'Belirlenen karakterden uzun metinleri kesip sonuna uc nokta ekler.',
  code:R`value.length > {{limit=30}} ? value.substring(0, {{limit=30}}) + "..." : value;` },

{ id:'e150', name:'Speed Driven Blur Length', cat:'Motion', prop:'Blur Length', req:'Directional Blur',
  desc:'Katman hizlandikca motion blur etkisini dinamik olarak artirir.',
  code:R`speed * {{carpan=0.08}};` },

// -------------------------------- Dokumandaki "Plug-and-Play" bolumunden ek kayit
{ id:'e151', name:'Text Box Vertical Align', cat:'Shape Layers', prop:'Position', req:'Rectangle Shape',
  desc:'Duyarli metin kutusu rig inde cok satirli metinde dikey kaymayi onler.',
  code:R`x = value[0]; y = content("Rectangle 1").content("Rectangle Path 1").size[1]/2; [x, y];` }

    ];
})(window);
