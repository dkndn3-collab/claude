# Expression Library — After Effects CEP Paneli

After Effects timeline'inda sectiginiz katman veya ozelliklere tek tikla gelismis
expression atayan, kendi expression'larinizi ekleyip duzenleyebildiginiz,
`{{parametre=varsayilan}}` sablonlarini dinamik olarak ayarlayabildiginiz
modern ve minimal bir panel eklentisi.

- **151 hazir expression** (dahili starter pack, 98 tanesi parametrik)
- Kategori cipleri + coklu kelime arama
- Parametre modali ("Uygula") veya tek tikla "Varsayilanla" uygulama
- Coklu katman secimine toplu uygulama + akilli property eslestirme
- Tek `Undo` grubu (Cmd/Ctrl+Z ile tum islem geri alinir)
- Kullanici kayitlari icin diske kalici JSON depolama (Node.js `fs`)

---

## 1. Klasor Hiyerarsisi

```
com.dknd.expressionlibrary/
├── CSXS/
│   └── manifest.xml          # Eklenti kimligi, boyutlar, CSXS 9.0, Node.js runtime
├── host/
│   └── index.jsx             # ExtendScript motoru (AE tarafi)
├── client/
│   ├── index.html            # UI iskeleti
│   ├── style.css             # AE karanlik temasi
│   ├── index.js              # Istemci mantigi (filtre, fs, parametre, CSInterface)
│   ├── lib/
│   │   └── CSInterface.js    # CEP kopru kutuphanesi
│   └── data/
│       └── starter-pack.js   # 151 expression'lik dahili veritabani
├── .debug                    # Chrome remote debug (localhost:8791)
└── install.sh                # macOS icin tek komutluk kurulum
```

---

## 2. Kurulum

### 2.1 PlayerDebugMode (imzasiz eklentiye izin verme)

Adobe, imzalanmamis (unsigned) eklentileri varsayilan olarak yuklemez.
Once **After Effects'i kapatin**, sonra:

**macOS** — Terminal:
```bash
defaults write com.adobe.CSXS.9  PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
killall cfprefsd
```

**Windows** — `regedit`:
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.9   → String (REG_SZ)  PlayerDebugMode = 1
HKEY_CURRENT_USER\Software\Adobe\CSXS.10  → String (REG_SZ)  PlayerDebugMode = 1
HKEY_CURRENT_USER\Software\Adobe\CSXS.11  → String (REG_SZ)  PlayerDebugMode = 1
HKEY_CURRENT_USER\Software\Adobe\CSXS.12  → String (REG_SZ)  PlayerDebugMode = 1
```
veya CMD ile:
```cmd
reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
```

> Hangi CSXS surumunun gerektigini bilmiyorsaniz hepsini yazin — zararsizdir.
> AE 2019–2020 → CSXS.9, AE 2021–2022 → CSXS.10, AE 2023 → CSXS.11, AE 2024+ → CSXS.12

### 2.2 Klasoru kopyalama

`com.dknd.expressionlibrary` klasorunun **tamamini** su konuma kopyalayin:

| Platform | Yol |
| --- | --- |
| macOS (kullanici) | `~/Library/Application Support/Adobe/CEP/extensions/` |
| macOS (sistem) | `/Library/Application Support/Adobe/CEP/extensions/` |
| Windows (kullanici) | `C:\Users\<KULLANICI>\AppData\Roaming\Adobe\CEP\extensions\` |
| Windows (sistem) | `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\` |

macOS'ta bunu otomatik yapmak icin:
```bash
./install.sh
```

### 2.3 Paneli acma

After Effects'i yeniden baslatin →
**Window > Extensions > Expression Library**

---

## 3. Kullanim

1. Timeline'da bir veya birden fazla **katman** secin.
   (Istege bagli: dogrudan bir **property** de secebilirsiniz — Position, Scale, bir efekt slider'i vb.)
2. Panelde arama yapin veya kategori cipine tiklayin.
3. Karta tiklayarak kodu genisletip inceleyin.
4. **Uygula**'ya basin:
   - Kod parametre iceriyorsa modal acilir, degerleri girip uygularsiniz.
   - Parametre yoksa dogrudan uygulanir.
   - **Varsayilanla** butonu modal acmadan varsayilan degerlerle uygular.

### Uygulama modu (Scope)

| Mod | Davranis |
| --- | --- |
| **Otomatik** | Timeline'da elle property sectiyseniz ona, secmediyseniz sablonun hedef ozelligine uygular. |
| **Sadece secili ozelliklere** | Yalnizca timeline'da isaretledigin property'lere uygular. |
| **Sablonun hedef ozelligine** | Property secimini yok sayar, kartin `Position`, `Source Text` vb. hedefini katmanda arayip bulur. |

### Parametre sozdizimi

Kendi expression'inizi yazarken degistirilebilir degerleri sarmalayin:

```javascript
wiggle({{frekans=2}}, {{genlik=30}});
thisComp.layer("{{hedef=Target}}").position;
```

Panel bunlari otomatik tespit eder, kart uzerinde `2 parametre` rozeti gosterir ve
uygulama aninda giris modali acar. Ayni parametre adini birden fazla kez kullanabilirsiniz —
tek bir input ile hepsi degisir.

Parametre **adinin** cevresindeki bosluklar yok sayilir, **varsayilan deger** ise oldugu gibi
alinir. Boylece bosluk tasiyan varsayilanlar korunur:

```javascript
"{{onEk=$}}" + n.toFixed(2) + "{{sonEk= /mo}}";   // -> "$5.00 /mo"  (bastaki bosluk korunur)
```

### Kisayollar

| Tus | Islev |
| --- | --- |
| `Ctrl/Cmd + F` | Arama kutusuna odaklan |
| `Ctrl/Cmd + S` | Editorde kaydet |
| `Enter` | Parametre modalinda uygula |
| `Esc` | Modali / editoru kapat |

---

## 4. Veri Saklama

Kullanicinin ekledigi ve duzenledigi expression'lar su dosyada tutulur:

| Platform | Yol |
| --- | --- |
| macOS | `~/Library/Application Support/com.dknd.expressionlibrary.panel/ExpressionLibrary/library.json` |
| Windows | `C:\Users\<KULLANICI>\AppData\Roaming\com.dknd.expressionlibrary.panel\ExpressionLibrary\library.json` |

> Tam yol `CSInterface.getSystemPath(SystemPath.USER_DATA)` ile calisma aninda cozulur;
> AE surumune gore kucuk farkliliklar gosterebilir.

Node.js herhangi bir sebeple devre disiysa panel otomatik olarak `localStorage`
yedegine duser ve durumu bildirir. Alt bardaki **Disa aktar / Ice aktar** ile
kutuphanenizi JSON olarak tasiyabilirsiniz.

Dahili 151 kayit **salt okunurdur**; bir kartta **Turet**'e basmak onun duzenlenebilir
bir kopyasini olusturur.

---

## 5. Mimari

```
client/index.js ──(CSInterface.evalScript)──▶ host/index.jsx ──▶ After Effects DOM
       ▲                                             │
       └──────────── JSON string yanit ◀──────────────┘
```

- Client, gonderecegi veriyi `JSON.stringify` ile bir ExtendScript **object literal**'ine
  cevirir (`EXP_apply({"code":"...","target":"Position"})`), boylece kacis (escaping)
  sorunlari olmaz.
- Host tarafinda native `JSON` bulunmadigi icin `EXPJSON.stringify` adinda kucuk bir
  serializer yer alir; her fonksiyon **her zaman** `{ok:true|false, ...}` JSON string dondurur.
- Tum yazma islemleri `app.beginUndoGroup` / `endUndoGroup` arasindadir ve `try/catch`
  ile korunur; hata durumunda undo grubu kapatilir.

### Host API

| Fonksiyon | Aciklama |
| --- | --- |
| `EXP_getContext()` | Aktif komp, secili katmanlar ve secili property'ler |
| `EXP_apply(payload)` | `{code, target, name, scope}` ile expression atar |
| `EXP_clear(payload)` | Secili property'lerin expression'ini siler |
| `EXP_validate(code)` | Parantez dengesi kontrolu (kaydetmeden once) |

### Property eslestirme

`Position`, `Scale`, `Rotation`, `Opacity`, `Anchor Point` gibi hedefler dogrudan
`ADBE Transform Group` uzerinden; `Source Text` `ADBE Text Properties` uzerinden cozulur.
`Path`, `Stroke Width`, `Size`, `Color`, `Bulge Center`, `Focus Distance` gibi hedefler icin
katmanin `Effects`, `Contents`, `Masks`, `Text` ve `Camera Options` agaclarinda
`matchName`/`name` bazli derin arama yapilir. Bulunan her property `canSetExpression`
ile dogrulanir; kabul etmeyenler atlanir ve panelde rapor edilir.

---

## 6. Kaynak Dokumandan Sapmalar

Starter pack, verilen expression veritabanindaki **150 kaydin tamamini** icerir
(tablo No 1-150 -> `e001`-`e150`). Ek olarak dokumanin "Plug-and-Play" bolumundeki
duyarli metin kutusu hizalama kodu `e151` olarak eklenmistir.

Asagidaki kayitlarin kodu, **After Effects'in ExtendScript (ES3) motorunda calisabilmesi
icin** dokumandakinden bilincli olarak farklidir:

| No | Dokumandaki | Kutuphanedeki | Neden |
| --- | --- | --- | --- |
| 89, 90, 92, 116 | `n => ...` (arrow function) | `function (n) { ... }` | ExtendScript arrow function desteklemez |
| 95 | `.trim()` | `.replace(/^\s+|\s+$/g, "")` | ExtendScript'te `String.trim` yok |
| 136 | `"DESIGN ".repeat(10)` | `for` dongusu ile birlestirme | ExtendScript'te `String.repeat` yok |
| 112 | `... .roundness = 25;` | `25;` (hedef: Roundness) | Expression baska bir property'e atama yapamaz; deger dogrudan Roundness'a uygulanir |
| 16 | `pinTo = "left";` satiri | kaldirildi | Kullanilmayan degisken, sonucu etkilemiyor |
| 103, 104 | `time * 2 * Math.PI` | `time * {{frekans=1}} * 2 * Math.PI` | Frekans parametrik hale getirildi (matematiksel olarak ayni) |

## 7. Sorun Giderme

| Belirti | Cozum |
| --- | --- |
| Panel menude gorunmuyor | PlayerDebugMode yazilmadi veya AE yeniden baslatilmadi. Klasor adinin `com.dknd.expressionlibrary` oldugundan emin olun. |
| Panel bos / beyaz | `.debug` dosyasi mevcut oldugu icin Chrome'da `localhost:8791` adresini acip konsol hatasina bakin. |
| "Node.js kapali" uyarisi | `manifest.xml` icindeki `--enable-nodejs` ve `--mixed-context` parametrelerini kontrol edin; CEP 9+ gerekir. |
| "Aktif kompozisyon yok" | Project panelinden bir kompozisyon acin (sadece secmek yetmez). |
| "... ozelligi bulunamadi" | Sablonun hedefi katmanda yok (orn. Source Text bir shape layer'da). Property'i timeline'da elle secip **Sadece secili ozelliklere** modunu kullanin. |
| Expression kirmizi hata veriyor | Kod, gereksinim sutununda belirtilen katman/efekti bekliyor olabilir (orn. `Slider Control`, `Cursor` adli katman). Kart uzerindeki "Gereksinim" satirina bakin. |

---

## 8. Test

Sahte (mock) After Effects DOM'u uzerinde calisan regresyon testi:

```bash
node test/host.test.js
```

Kapsam:
- `canSetExpression` dogrulamasi ve derin property arama (Source Text, Stroke Width,
  Size, Slider; 3 seviye ic ice shape agaci)
- `scope: auto` modunda elle secili property onceligi
- Coklu katmana toplu uygulama ve hedef bulunamayinca temiz hata
- Hata durumunda undo grubunun kapanmasi
- `EXP_validate` icin string / regex literal / satir ve blok yorum atlama
- 150 starter pack kaydinin tamami: parametre kalintisi yok, dogrulamadan geciyor,
  client -> host JSON koprusunde kod bit bit ayni kaliyor

### Uctan uca UI testi

Paneli gercek Chromium'da, sahte CEP koprusu (`window.__adobe_cep__`) ve sahte
After Effects DOM'u ile surer:

```bash
npm i playwright-core
node test/ui.test.js          # gerekirse: CHROMIUM_PATH=/yol/chrome node test/ui.test.js
```

Kapsam: 151 kartin render'i, arama (Turkce aksan katlamasi dahil), kategori
cipleri, parametre modali (varsayilanlar, canli onizleme, uygulama), coklu
katmana toplu atama, undo grubu temizligi, hedef property eslestirmesi,
regex kacislarinin tarayici -> host boyunca korunmasi, editorden kayit,
kalicilik (yeniden yuklemede korunma) ve silme.

## 9. Dagitim (ZXP)

Panel imzasiz olarak PlayerDebugMode ile calisir. Baskalarina dagitmak icin
[ZXPSignCmd](https://github.com/Adobe-CEP/CEP-Resources) ile imzalayin:

```bash
ZXPSignCmd -selfSignedCert TR Istanbul "Studio" "Studio" parola cert.p12
ZXPSignCmd -sign com.dknd.expressionlibrary ExpressionLibrary.zxp cert.p12 parola -tsa http://timestamp.digicert.com
```
