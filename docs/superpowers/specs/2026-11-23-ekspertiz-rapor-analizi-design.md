# Ekspertiz Rapor Analizi: Tasarım Belgesi

- Tarih: 2026-11-23
- Durum: Taslak, onay bekliyor
- Çalışma adı: `ekspertiz-rehberi` (ürün adı henüz seçilmedi)

## 1. Amaç ve neden

İkinci el araç alan kişi ekspertiz raporunu alıyor ama okuyamıyor. "Lokal boyalı", "sökülüp takılmış", fren yüzdesi, yanal kayma, OBD arıza kodu gibi maddeler ona bir şey anlatmıyor. Hangi maddenin önemsiz, hangisinin ciddi olduğunu bilmiyor. Bu yüzden ya gereksiz yere vazgeçiyor ya da sorunlu bir aracı fark etmeden alıyor.

Bu web uygulamasında kullanıcı raporu yükler. Uygulama raporu maddelere ayırır ve her maddeyi sade Türkçeyle açıklar:

- Bu madde normal mi?
- Bu marka ve model için bilinen kronik bir sorun mu?
- Dikkat edilmesi gereken bir problem mi?
- Çözümün veya bakımın ortalama fiyatı ne kadar?

Uygulama ayrıca raporun sahte veya değiştirilmiş olabileceğine dair işaretleri gösterir. Her sonucun sonunda, son karar ve tüm sorumluluğun kullanıcıya ait olduğu açıkça yazılır.

## 2. Kullanıcı ve kullanım anı

- Birincil kullanıcı: Araç bilgisi az olan, ikinci el araç alıcısı.
- Kullanım anı (benim varsayımım): Kullanıcı çoğu zaman galeride veya ekspertiz firmasının önünde, elinde telefonla bekliyor. Bu yüzden arayüz önce mobil için tasarlanır. Rapor fotoğrafı telefon kamerasından yüklenebilmelidir.
- Ürün herkese açık bir web uygulaması olacak. Bu, kullanıcının sorumluluk notu isteğinden çıkan bir varsayım.

## 3. Hedefler (v1)

1. PDF veya fotoğraf (birden çok sayfa) olarak ekspertiz raporu yüklenebilir.
2. Rapordaki araç bilgisi (marka, model, yıl, motor, yakıt, şanzıman, km) ve rapor bilgisi (firma, rapor no, tarih) otomatik okunur. Kullanıcı yanlışları düzeltebilir.
3. Rapordaki her madde dört gruptan birine konur: Normal, Kronik, Dikkat, Belirsiz (tanımlar §8'de).
4. Her madde için sade açıklama, neden önemli olduğu, tahmini maliyet aralığı (TL) ve satıcıya sorulacak soru verilir.
5. Bu modelin raporda görünmeyen ama bilinen kronik sorunları, ayrı bir "Kontrol ettir" listesinde gösterilir.
6. Raporun güvenilirliğiyle ilgili işaretler gösterilir (§11).
7. Her sonuç ekranında sorumluluk notu bulunur (§12).
8. Uygulama Türkçedir ve telefonda rahat kullanılır.

## 4. Hedef dışı (v1'de yok)

- Mobil uygulama mağazası sürümü (iOS/Android). Uygulama web'de çalışır.
- Aracın piyasa değerini biçmek veya "bu fiyata değer" demek.
- Ekspertiz yerine geçmek ya da fotoğraftan hasar tespiti yapmak.
- Ödeme. Test aşamasında ödeme yoktur. Sorgu başına ödeme, yayından önceki 2. aşamada eklenir (§19).
- Model fine-tune etmek (bkz. §7).
- Bilgi tabanı için yönetim paneli. v1'de veriler dosyadan yüklenir.

## 5. Asla olmaması gerekenler

Uygulama teknik olarak çalışsa bile, aşağıdakilerden biri olursa başarısız sayılır:

- Kesin "al" veya "alma" hükmü vermek.
- Kaynağı olmayan bir kronik sorunu veya fiyatı kesin bilgi gibi sunmak. Bilinmeyen bilgi "Belirsiz" olarak işaretlenir, uydurulmaz.
- Bir raporu "doğrulandı" veya "gerçek" diye etiketlemek. Uygulama yalnızca işaret gösterir, hüküm vermez.
- Bir "Dikkat" maddesini (örneğin şasi veya direk değişimi) "Normal" diye göstermek. Emin olunamayan durumda daha ciddi grup seçilir.
- Kullanıcının raporunu veya kişisel verisini izinsiz saklamak.

## 6. Kısıtlar

- Web altyapısı, kullanıcının diğer projeleriyle (CourtMax, Lumind) aynıdır: Next.js 16, React 19, Tailwind 4, OpenNext ile Cloudflare Workers.
- Yapay zeka: Claude Opus 5.5 (`claude-opus-5-5`), resmi `@anthropic-ai/sdk` ile çağrılır.
- API hesabı: Test aşamasında kullanıcının kendi Anthropic hesabı kullanılır. Claude aboneliği (claude.ai, Claude Code) uygulamanın API çağrılarını karşılamaz. Claude Console'dan alınmış, ön ödemeli bir API anahtarı gerekir. Anahtar Cloudflare'de gizli değişken (secret) olarak tutulur, depoya yazılmaz.
- Claude'a giden istek en fazla 32 MB olabilir. PDF en fazla 600 sayfa olabilir. İlk gerçek örnek rapor 15 sayfa ve ek sorgu sayfalarıyla birlikte 18 fotoğraftan oluşuyor (§15.1). Uygulama en fazla 25 fotoğraf kabul eder. Fotoğraflar göndermeden önce tarayıcıda küçültülür. Kesin görsel sınırları uygulayıcı Claude belgelerinden doğrular.
- Fiyatlar TL cinsindendir ve enflasyon nedeniyle hızlı eskir. Her fiyatın bir tarihi olmalıdır.
- KVKK: Raporlarda plaka, şasi numarası ve bazen araç sahibinin adı bulunur.

## 7. Yaklaşımlar

Üç yol değerlendirildi. Kullanıcı A'yı seçti.

| Yol | Ne | Artı | Eksi |
|---|---|---|---|
| **A. Claude + kendi bilgi tabanı (seçilen)** | Rapor Claude'a gider. Kronik sorunlar ve fiyat aralıkları bizim veritabanımızdan gelir. Gerekirse Claude güncel fiyat için web'de arar. | En güçlü model. Bilgi doğru, kaynaklı ve modeli eğitmeden güncellenebilir. | Bilgi tabanını doldurmak emek ister. |
| B. Yalnızca Claude | Kronik sorun ve fiyat bilgisi modelin kendi bilgisinden gelir. | Birkaç günde çalışır. | Fiyatlar eskiyebilir. Az bilinen modellerde hata riski var. |
| C. Açık kaynak model + fine-tune, kendi sunucumuz | Kullanıcının ilk önerisi. | Model tamamen bizde olur. | Claude'dan belirgin şekilde zayıf. GPU maliyeti çıkar. Yüzlerce etiketli rapor gerekir ve elimizde yok. Aylar sürer. |

Fine-tune neden yok: Fine-tune modele üslup ve format öğretir, güncel bilgi öğretmez. Kronik sorun listesi ve TL fiyatları sürekli değişir. Bu bilgi bilgi tabanında daha iyi durur. C ancak gerçek kullanım verisi birikip Claude'un ölçülmüş bir eksiği görülürse yeniden düşünülür.

Uygulama sırası: Önce B gibi çalışan bir iskelet kurulur. Bilgi tabanında olmayan araçlar için bu yol her zaman yedek olarak kalır. Ardından bilgi tabanı eklenir ve doldurulur.

## 8. Madde grupları

| Grup | Renk | Tanım | Örnek |
|---|---|---|---|
| Normal | Yeşil | Aracın yaşı ve km'si için beklenen durum. Ciddi bir maliyet veya güvenlik riski yok. | 8 yaşında araçta arka tamponda lokal boya. |
| Kronik | Turuncu | Bu marka/model/motor için bilinen sorun. Raporda belirtisi var. | Belirli bir motorda bilinen enjektör arızası ve raporda ilgili arıza kodu. |
| Dikkat | Kırmızı | Güvenlik riski veya yüksek maliyet ihtimali var. Satın almadan önce açıklanmalı. | Direk veya şasi değişimi, airbag arıza kodu, fren dengesizliği. |
| Belirsiz | Gri | Rapordaki bilgi yetersiz, okunamıyor ya da yorumlamak için uzman gerekiyor. | Okunamayan ölçüm değeri. |

Kural: Model iki grup arasında kararsız kalırsa, daha ciddi olanı seçer.

"Kontrol ettir" listesi: Bu modelin raporda görünmeyen ama bilinen kronik sorunları ayrı bir listede gösterilir. Her birine "Ustaya şunu kontrol ettirin" notu eklenir.

## 9. Kullanıcı akışı

1. Açılış ekranında tek iş vardır: "Raporu yükle" (PDF seç veya fotoğraf çek).
2. Yüklemeden önce kullanıcı sorumluluk notunu okuduğunu onaylar (kutu işaretleme).
3. Yükleme sonrası ilerleme gösterilir: "Rapor okunuyor", "Araç bilgileri bulundu", "Maddeler yorumlanıyor". Araç bilgisi okunur okunmaz ekranda görünür. Yorumlama, kullanıcıyı beklemeden başlar. Analiz 30–120 saniye sürebilir. Kullanıcı ekrana bakarken boş bir bekleme görmemelidir.
4. Kullanıcı araç bilgisinde yanlış görürse düzeltir (örneğin yanlış okunan motor tipi). Düzeltmeden sonra yalnızca bilgi tabanı eşleme ve yorumlama yeniden çalışır. Rapor yeniden okunmaz. Her analizde bir düzeltme ücretsizdir ve günlük sınırdan düşmez. Sunucu veri saklamadığı için okuma adımının çıktısı tarayıcıya imzalı (HMAC) olarak gönderilir. Yeniden çalıştırma isteği bu imzayla gelir. Böylece bu uç nokta, rapor olmadan serbest bir Claude geçidi olarak kullanılamaz.
5. Sonuç ekranı açılır.

Sonuç ekranı taslağı (telefon):

```
┌──────────────────────────────────────┐
│ 2018 Fiat Egea 1.3 Multijet          │
│ 142.000 km · Rapor tarihi: 12.11.2026│
│ 2 Dikkat · 1 Kronik · 14 Normal      │
│ 1 Belirsiz                           │
├──────────────────────────────────────┤
│ [KIRMIZI] DİKKAT                     │
│ Sol ön direk: değişen                │
│ Ne demek: ...                        │
│ Neden önemli: ...                    │
│ Tahmini maliyet: ...                 │
│ Satıcıya sorun: ...                  │
├──────────────────────────────────────┤
│ [TURUNCU] KRONİK ...                 │
│ [YEŞİL] NORMAL (14) ▸ açılır liste   │
│ [GRİ] BELİRSİZ ...                   │
├──────────────────────────────────────┤
│ Ustaya kontrol ettirin (3)           │
│ Rapor güvenilirlik işaretleri        │
│ Sorumluluk notu                      │
└──────────────────────────────────────┘
```

Sıralama: Dikkat, Kronik, Belirsiz, Normal. Normal maddeler kapalı bir listede durur.

## 10. Mimari

### 10.1 Bileşenler

- **Web:** Next.js 16 (App Router), Cloudflare Workers üzerinde OpenNext ile çalışır.
- **Analiz API'si:** Aynı uygulamada bir route handler. Yüklenen dosyayı alır, Claude'u çağırır, sonucu akış (stream) olarak tarayıcıya gönderir.
- **Bilgi tabanı:** Cloudflare D1 (SQLite).
- **Kötüye kullanım koruması:** Cloudflare Turnstile ve IP başına günlük sınır (§14).
- **Dosya saklama:** Yok. Rapor bellekte işlenir ve Claude'a gönderilir. Sunucuda saklanmaz (§13).

### 10.2 Analiz hattı

Hat iki Claude çağrısından oluşur. Akışı kod yönetir (ajan değil):

1. **Okuma ve çıkarma.** Girdi: PDF (`document` bloğu) veya fotoğraflar (`image` blokları). Çıktı: yapılandırılmış JSON. İçeriği:
   - Araç bilgisi: marka, model, kasa/nesil, yıl, motor, yakıt, şanzıman, km.
   - Rapor bilgisi: firma, rapor no, tarih, ekspertiz paketi.
   - Maddeler listesi: bölüm (kaporta-boya, motor, fren, süspansiyon, alt takım, OBD, yol testi, iç-dış, diğer), parça veya test adı, rapordaki ham ifade, ölçüm değeri ve birimi.
   - Okunamayan alanlar ve güvenilirlik işaretleri için ham veri (§11).
2. **Bilgi tabanı eşleme (kod, yapay zeka yok).** Araç bilgisiyle D1'den ilgili kronik sorunlar ve fiyat aralıkları çekilir.
3. **Kural katmanı (kod, yapay zeka yok).** Bazı maddelerin en düşük grubu sabit kurallarla belirlenir. Model bu grubu yükseltebilir ama altına indiremez:
   - Taşıyıcı parçalarda (direk, şasi, podye, tavan, bagaj havuzu ve benzeri) "değişen" veya "işlem görmüş" bulgusu en az Dikkat olur.
   - Ölçülen değerler sınırı aşarsa en az Dikkat olur: fren dengesizliği, yanal kayma, amortisör etkinliği gibi.
   - Airbag, ABS ve ESP ile ilgili arıza kodları en az Dikkat olur.
   - Sınır değerleri önce raporda basılı sınırlardan alınır (§15.1). Raporda sınır yoksa TÜVTÜRK muayene ölçütleri kullanılır. Her değerin kaynağı yazılır. Değerler bir yapılandırma dosyasında tutulur.
4. **Yorumlama.** Girdi: 1. adımın JSON'u, 2. adımın kayıtları ve 3. adımın en düşük grupları. Çıktı: her madde için grup, sade açıklama, neden önemli, tahmini maliyet aralığı ve kaynağı, satıcıya sorulacak soru. Ayrıca "Kontrol ettir" listesi, kısa genel özet ve güvenilirlik işaretleri.

Claude çağrı ayarları:

- Model `claude-opus-5-5`, adaptive thinking açık.
- Çıktı biçimi `output_config.format` ile JSON şemasına bağlanır (structured outputs).
- Effort: okuma adımında `medium`, yorumlama adımında `high`. Kesin değerler değerlendirme setiyle (§15) ayarlanır.
- Uzun süren yanıtlar için streaming kullanılır.
- Sunucu tarafı yedek model (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) açıktır. Böylece güvenlik sınıflandırıcısının nadir retlerinde istek başka modelle tamamlanır.
- Bilgi tabanında olmayan araçlar için yorumlama adımı modelin kendi bilgisini kullanır. Bu bilgiler "genel bilgi, doğrulanmamış" etiketi alır.
- Fiyat bilgi tabanında yoksa veya fiyat 90 günden eskiyse, yorumlama adımı web arama aracını (`web_search_20260209`) sınırlı sayıda (`max_uses`) kullanabilir. Bulunan fiyat kaynağıyla birlikte gösterilir.

Tahmini maliyet: Rapor başına yaklaşık 0,2–0,5 $. Fotoğraflı raporlarda ve web araması yapıldığında daha yüksek olabilir. Gerçek değer ilk testlerde ölçülür.

### 10.3 Bilgi tabanı şeması (öneri)

- `vehicles`: marka, model, kasa/nesil, yıl aralığı, motor kodu ve hacmi, yakıt, şanzıman, segment.
- `chronic_issues`: araç eşlemesi, sistem (motor, şanzıman, elektrik, ...), sorun açıklaması, belirtiler, raporda hangi maddeyle eşleştiği (anahtar kelimeler veya OBD kodları), tahmini maliyet kalemine bağlantı, kaynak, güven düzeyi, onay durumu, son güncelleme tarihi.
- `price_items`: iş kalemi (örneğin "debriyaj seti değişimi", "kapı boyama"), segment veya araç eşlemesi, parça tipi (orijinal / yan sanayi), işçilik dahil mi, en düşük ve en yüksek TL, şehir (opsiyonel), kaynak, tarih.

Kronik sorun ve fiyat kayıtları, her biri kaynak ve tarih bilgisiyle, depodaki JSON dosyalarında tutulur. `wrangler d1` ile veritabanına yüklenir. Sürüm kontrolü bu sayede git ile yapılır.

### 10.4 Bilgi tabanının doldurulması

- İlk hedef: Türkiye ikinci el pazarında en çok satılan yaklaşık 30 model. Liste bir sonraki adımda çıkarılacak.
- Kronik sorunlar ve fiyatlar internet araştırmasıyla öğrenilir (kullanıcının kararı). İnsan uzman onayı yoktur.
- Claude, web araştırmasıyla her model için kayıtlar hazırlar. Her kayıt en az bir kaynak bağlantısı taşır.
- Güven düzeyi kaynak sayısına göre verilir. Aynı sorunu birbirinden bağımsız en az iki kaynak söylüyorsa (servis bülteni, geri çağırma, marka forumu, haber, ustaların yazıları gibi) güven "yüksek" olur. Tek kaynak varsa güven "düşük" olur.
- Arayüz her kronik sorunda "internet kaynaklı" etiketini ve kaynak bağlantılarını gösterir. Düşük güvenli kayıtlar ayrıca "tek kaynak" diye işaretlenir.
- Kayıtlar araştırma tarihini taşır. 12 aydan eski kayıtlar yeniden araştırılır.

## 11. Rapor güvenilirlik işaretleri

Uygulama "sahte" veya "gerçek" hükmü vermez. Yalnızca işaretleri listeler ve kullanıcıya nasıl doğrulayacağını söyler.

v1 işaretleri:

- **Rapor yaşı:** Rapor tarihi 30 günden eskiyse uyarı verilir. Eski raporlar düzenlenip yeniden kullanılabiliyor.
- **İç tutarlılık:** Araç yılı ve km uyumu, rapor tarihi ve araç yılı uyumu, tekrar eden veya çelişen maddeler (örneğin aynı parça hem "orijinal" hem "değişen").
- **PDF üst verisi:** Oluşturma ve değiştirme tarihleri farklı mı, belgeyi üreten yazılım bir görüntü veya PDF düzenleyici mi. Bu kontrol kodla yapılır. Yalnızca PDF yüklemelerinde çalışır.
- **Rapor içi çapraz kontroller:** Raporda bulunan ek sorgu sayfaları kendi içinde karşılaştırılır:
  - Rapordaki km ile TÜVTÜRK muayene kayıtlarındaki son km (geri alma var mı).
  - Sigorta hasar kayıtları (tarih, tutar) ile değişen ve boyalı parçalar (hasar kaydı ile parçalar uyumlu mu).
  - OBD özet sayfası ile arıza tespit cihazının ham çıktısı (özet "arıza yok" derken ham çıktıda arıza var mı).
  - Yapılmamış testler (örneğin 0 HP ölçülen dinamometre) "test yapılmamış" olarak gösterilir, sonuç gibi yorumlanmaz.
- **QR kod:** Raporda "online rapor" QR kodu varsa tarayıcıda çözülür. Kullanıcıya bağlantı ve bağlantının alan adı gösterilir. Kullanıcıya alan adının firmanın sitesi olup olmadığını kontrol etmesi söylenir.
- **Firma doğrulama yönlendirmesi:** Kullanıcıya raporu firmanın kendi sorgu sayfasından doğrulamasını söyler. Örneğin Otorapor'da plaka veya şasi numarasıyla geçmiş ekspertiz sorgusu yapılabiliyor. Firma sorgu bağlantıları bilgi tabanında tutulur.
- **Gelecekteki karekod:** Haberlere göre raporlara Taşıt Ekspertiz Bilgi Sistemi'ne bağlı bir karekod gelecek. Yürürlüğe girince, raporda karekod varsa kullanıcıya okutması söylenir. Bu madde v1 kapsamında değildir.

## 12. Sorumluluk notu

Yükleme öncesindeki onay kutusunda ve her sonuç ekranının sonunda şu metin (veya hukuki gözden geçirmeden sonraki hali) bulunur:

> Bu analiz yapay zekayla hazırlanmış, bilgilendirme amaçlı bir yorumdur. Ekspertiz raporunun veya bir uzmanın görüşünün yerine geçmez. Fiyatlar tahminidir ve değişebilir. Satın alma kararı ve bu karardan doğan tüm sorumluluk kullanıcıya aittir.

Ayrıca her "Dikkat" maddesinde "Bir ustaya veya ekspertize danışın" yönlendirmesi bulunur.

## 13. Kişisel veriler (KVKK)

- Yüklenen dosya sunucuda saklanmaz. Bellekte işlenir ve analiz için Claude API'ye gönderilir.
- Kayıtlarda (log) plaka, şasi numarası ve kişi adı tutulmaz.
- Sonuç tarayıcıda gösterilir. v1'de sonuç sunucuda saklanmaz. Sayfa kapanınca sonuç kaybolur.
- Herkese açık yayından önce bir aydınlatma metni gerekir. Bu metin, verinin yurt dışındaki bir yapay zeka hizmetine gönderildiğini belirtmelidir.
- Yükleme akışında, sorumluluk onayından ayrı bir açık rıza kutusu bulunur: "Raporumun analiz için yurt dışındaki bir yapay zeka hizmetine aktarılmasını kabul ediyorum."
- 2024 değişikliğinden sonra KVKK'nın yurt dışı aktarım kuralları (madde 9) yalnızca açık rızayla karşılanmayabilir. Herkese açık yayından önce hukuki görüş alınır (2. aşama, §19).

## 14. Maliyet kontrolü ve kötüye kullanım

- Analizden önce Cloudflare Turnstile doğrulaması yapılır.
- Tarayıcı başına (imzalı çerez) günlük analiz sınırı vardır. Başlangıç değeri 3'tür.
- IP başına sınır daha yüksektir, başlangıç değeri 15'tir. Mobil operatörler birçok telefonu aynı IP adresinin arkasına koyar (CGNAT). Düşük bir IP sınırı, galerideki gerçek kullanıcıları yanlışlıkla engeller.
- Uygulama genelinde günlük harcama tavanı vardır. Tavan dolunca yeni analiz kabul edilmez ve kullanıcıya "Bugünlük kapasite doldu, yarın tekrar deneyin" mesajı gösterilir. Test aşamasında tavan 10 $ ile başlar (§16).
- Tüm sınırlar yapılandırmadan değiştirilebilir.
- Dosya boyutu ve sayfa sayısı sınırlanır (§6).
- Yüklenen dosyanın ekspertiz raporu olmadığı anlaşılırsa, okuma adımı bunu bildirir ve yorumlama adımı çalışmaz.

## 15. Kalite ölçümü

- Gerçek raporlardan (farklı firmalar, PDF ve fotoğraf) 10–20 örneklik bir değerlendirme seti hazırlanır.
- Her örnek için beklenen gruplar elle işaretlenir. İşaretleri kullanıcı koyar. Claude bir öneri hazırlar, kullanıcı düzeltir.
- Ölçülenler: araç bilgisinin doğru okunması, maddelerin eksiksiz çıkarılması, grupların doğruluğu. En önemli ölçüt: hiçbir "Dikkat" maddesinin "Normal" olarak gösterilmemesi.
- İstem (prompt) veya model ayarı her değiştiğinde set yeniden çalıştırılır.

### 15.1 İlk örnek rapor: bulgular

Kullanıcı ilk gerçek raporu paylaştı: Yavuzlar Oto Ekspertiz, 2021 BMW 320i (1.6, 170 HP), 135.689 km, rapor tarihi 23.11.2026. Rapor, kağıt çıktının telefonla eğik açıdan çekilmiş 18 fotoğrafı olarak geldi. Holografik mühür yer yer parlama yapıyor.

Tasarıma etkileri:

- **Ana giriş fotoğraf olacak, PDF değil.** Okuma adımı eğik, parlamalı ve kısmen kırpılmış fotoğrafları okuyabilmelidir. Değerlendirme seti bu tür fotoğrafları içermelidir.
- **Bölümler:** Rapor özeti, Kaporta-Boya (µm ölçümlü, 16 kontrol), Mor ışık, Şasi/İç aksam (23), Üst motor (31), Motor alt ve mekanik (34), İç ve dış donanım (35), Conta kaçak testi, Airbag (13), OBD özeti ve cihazın ham arıza kodu çıktısı, Test hattı (dinamometre, süspansiyon, fren, yanal kayma), QR sorgulamalar, TÜVTÜRK km sorgusu, sigorta hasar sorgusu, fotoğraf galerisi. Okuma şeması bu bölümleri karşılamalıdır. Tanınmayan bölümler "diğer" olarak alınır.
- **Rapor kendi sınırlarını basıyor.** Örnekler: fren sapması %0–30 geçer, %31–100 kalır. Süspansiyon tutunması 0–20 arızalı, 80–100 mükemmel. Yanal kaymada iyi, kritik ve kötü bantları var. Kural katmanı (§10.2) önce raporda basılı sınırı kullanır. Raporda sınır yoksa yapılandırmadaki varsayılanı kullanır.
- **Firma başına okuyucu yazılmaz.** Rapor altında "ekspertiz.app ile hazırlanmıştır" yazıyor. Piyasada başka ekspertiz yazılımları da var (Goeksper, B2EL, ProNspect gibi). Bu yüzden tüm formatlar için tek bir genel okuma şeması kullanılır.
- **Ham OBD çıktısında Türkçe karakterler bozuk** ("Elektronii", "Grü alanı" gibi). Okuma adımı bozuk metni anlamına göre okumalıdır.
- **Raporda yoğun kişisel veri var:** Alıcı ve satıcının adı soyadı, açık telefon numaraları, maskeli TC kimlik numarası, plaka ve şasi numarası. Bu fotoğraflar depoya konmaz. Değerlendirme setine girmeden önce kişisel veriler karartılır. Bu durum 2. aşamadaki hukuki çalışmayı (§19) daha da önemli kılıyor.
- **Çapraz kontroller bu raporda işe yaradı** (§11):
  - Km tutarlı: Rapor 135.689 km, son TÜVTÜRK muayenesi 130.693 km (12.09.2026).
  - Hasar tutarlı: 28.10.2023 tarihli 263.322,55 TL'lik çarpışma kaydı ile değişen kaput, ön tampon, ön panel, farlar ve ön cam aynı önden darbeyi gösteriyor.
  - İç çelişki: OBD özet sayfası klima elektroniğinde "arıza kodu yok" diyor. Ham cihaz çıktısı klima karıştırma klapesi motorunda arıza gösteriyor.
  - Yapılmamış test: Dinamometre 0 HP ve %0 gösteriyor. Bu bir ölçüm değil, test yapılmamış.

## 16. Verilen kararlar

Kullanıcının kararları:

- Uygulama web'de çalışacak.
- Yapay zeka yolu: A (Claude + bilgi tabanı). Fine-tune yok.
- Gruplar: normal, kronik, dikkat ve her biri için ortalama çözüm fiyatı.
- Sahte rapor için bir kontrol yolu bulunacak.
- Sorumluluğun kullanıcıda olduğu vurgulanacak.
- Kronik sorunlar internet araştırmasıyla öğrenilecek. Uzman onayı yok.
- Test aşamasında kullanıcının kendi hesabı kullanılacak. Ürün sorgu başına ücretli olacak.
- KVKK ve hukuki konular yayından önce çözülecek.

Benim kararlarım (kullanıcı değiştirebilir):

- Önce mobil tasarım.
- "Belirsiz" grubu ve "Kontrol ettir" listesi eklendi.
- Altyapı: Next.js 16, Cloudflare Workers, D1, Turnstile.
- İki adımlı analiz hattı.
- Rapor ve sonuç sunucuda saklanmayacak.
- v1'de hesap ve ödeme yok.
- Güvenilirlik konusunda hüküm verilmeyecek, yalnızca işaret gösterilecek.
- Bilgi tabanı verisi JSON dosyalarında, git ile tutulacak.
- Araç bilgisi düzeltilirse yalnızca yorumlama yeniden çalışır. Bir düzeltme ücretsizdir. Okuma çıktısı HMAC ile imzalanır.
- Sabit kural katmanı, taşıyıcı parçaları ve sınırı aşan ölçümleri en az Dikkat grubunda tutar.
- Sınırlar tarayıcı başına (3), IP başına (15) ve uygulama genelinde günlük harcama tavanı olarak uygulanır.
- Yurt dışı aktarım için ayrı bir açık rıza kutusu bulunur.
- Test aşamasında uygulamaya erişim Cloudflare Access (e-posta ile giriş) ile yalnızca kullanıcıya açılır.
- Test aşamasında uygulama genelindeki günlük harcama tavanı 10 $ olarak başlar ve yapılandırmadan değiştirilebilir.
- Kronik sorun güven düzeyi kaynak sayısına göre verilir (§10.4).

## 17. Açık sorular

Tasarımı etkileyen açık soru kalmadı. Verilen cevaplar:

1. **Örnek raporlar:** İlk rapor geldi (§15.1). Değerlendirme seti için farklı firmalardan 10–20 rapor daha gerekiyor. Bunlar plan sırasında toplanır.
2. **Uzman:** Uzman yok. Kronik sorunlar internet araştırmasıyla öğrenilir (§10.4).
3. **Bütçe ve gelir:** Test aşamasında kullanıcının kendi hesabı kullanılır. Ürün sorgu başına ücretli olacak (§19).
4. **Hukuk:** Yayından önce çözülecek. O zamana kadar uygulama yalnızca kullanıcıya açık çalışır (§19).

Uygulamaya geçerken gereken: Claude Console'dan alınmış bir API anahtarı (§6).

## 18. Uygulayıcıya bırakılanlar

- Dosya ve klasör yapısı, bileşen ayrımı.
- JSON şemalarının alan adları.
- Uzun süren analiz için yöntem: doğrudan akış (SSE) ya da Cloudflare Queues/Durable Objects. Ölçüm sonrası seçilir.
- PDF üst verisini okuyan kütüphane seçimi (Workers üzerinde çalışmalı).
- Görsel tasarım ayrıntıları (renk tonları, tipografi). Grupların renk anlamı korunmalıdır.

## 19. Aşamalar

**1. aşama: Test (bu tasarımın kapsamı)**
- Uygulama yalnızca kullanıcıya açıktır (Cloudflare Access).
- API maliyetini kullanıcının kendi Anthropic hesabı karşılar.
- Kapsam: yükleme, analiz, sonuç ekranı, kural katmanı, güvenilirlik işaretleri, sorumluluk notu.
- Bilgi tabanı yaklaşık 30 model için internet araştırmasıyla doldurulur.
- Değerlendirme seti 10–20 rapora ulaşır.

**2. aşama: Yayın hazırlığı (ayrı tasarım gerekir)**
- Sorgu başına ödeme. Türkiye'de çalışan bir ödeme sağlayıcısı seçilir (iyzico, PayTR gibi). Hesap gerekip gerekmediği o tasarımda kararlaştırılır.
- KVKK hukuki görüşü, aydınlatma metni, yurt dışı aktarım için gereken yasal dayanak. Gerekirse kişisel verileri karartma adımı eklenir.
- Sorumluluk metninin hukuki gözden geçirmesi.

**3. aşama: Herkese açık yayın**
- Cloudflare Access kaldırılır. Turnstile, kullanım sınırları ve harcama tavanı devreye girer.
