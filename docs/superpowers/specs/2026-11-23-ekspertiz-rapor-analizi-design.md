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
- Kullanıcı hesabı ve ödeme. Bunlar §17'deki açık soruya göre sonra eklenir.
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
- Claude'a giden istek en fazla 32 MB olabilir. PDF en fazla 600 sayfa olabilir. Ekspertiz raporları 2–10 sayfa olduğu için bu sınırlar sorun değildir. Uygulama yükleme sınırını 20 MB ve en fazla 10 fotoğraf olarak koyar.
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
3. Yükleme sonrası ilerleme gösterilir: "Rapor okunuyor", "Araç bilgileri bulundu", "Maddeler yorumlanıyor". Analiz 30–120 saniye sürebilir. Kullanıcı ekrana bakarken boş bir bekleme görmemelidir.
4. Araç bilgisi gösterilir. Kullanıcı yanlışı düzeltebilir (örneğin yanlış okunan motor tipi).
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
3. **Yorumlama.** Girdi: 1. adımın JSON'u ve 2. adımın kayıtları. Çıktı: her madde için grup, sade açıklama, neden önemli, tahmini maliyet aralığı ve kaynağı, satıcıya sorulacak soru. Ayrıca "Kontrol ettir" listesi, kısa genel özet ve güvenilirlik işaretleri.

Claude çağrı ayarları:

- Model `claude-opus-5-5`, adaptive thinking açık.
- Çıktı biçimi `output_config.format` ile JSON şemasına bağlanır (structured outputs).
- Effort: okuma adımında `medium`, yorumlama adımında `high`. Kesin değerler değerlendirme setiyle (§15) ayarlanır.
- Uzun süren yanıtlar için streaming kullanılır.
- Sunucu tarafı yedek model (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) açıktır. Böylece güvenlik sınıflandırıcısının nadir retlerinde istek başka modelle tamamlanır.
- Bilgi tabanında olmayan araçlar için yorumlama adımı modelin kendi bilgisini kullanır. Bu bilgiler "genel bilgi, doğrulanmamış" etiketi alır.
- Fiyat bilgi tabanında yoksa veya fiyat 90 günden eskiyse, yorumlama adımı web arama aracını (`web_search_20260209`) sınırlı sayıda (`max_uses`) kullanabilir. Bulunan fiyat kaynağıyla birlikte gösterilir.

Tahmini maliyet: Rapor başına yaklaşık 0,2–0,3 $. Fotoğraflı raporlarda ve web araması yapıldığında daha yüksek olabilir. Gerçek değer ilk testlerde ölçülür.

### 10.3 Bilgi tabanı şeması (öneri)

- `vehicles`: marka, model, kasa/nesil, yıl aralığı, motor kodu ve hacmi, yakıt, şanzıman, segment.
- `chronic_issues`: araç eşlemesi, sistem (motor, şanzıman, elektrik, ...), sorun açıklaması, belirtiler, raporda hangi maddeyle eşleştiği (anahtar kelimeler veya OBD kodları), tahmini maliyet kalemine bağlantı, kaynak, güven düzeyi, onay durumu, son güncelleme tarihi.
- `price_items`: iş kalemi (örneğin "debriyaj seti değişimi", "kapı boyama"), segment veya araç eşlemesi, parça tipi (orijinal / yan sanayi), işçilik dahil mi, en düşük ve en yüksek TL, şehir (opsiyonel), kaynak, tarih.

Kronik sorun ve fiyat kayıtları, her biri kaynak ve tarih bilgisiyle, depodaki JSON dosyalarında tutulur. `wrangler d1` ile veritabanına yüklenir. Sürüm kontrolü bu sayede git ile yapılır.

### 10.4 Bilgi tabanının doldurulması

- İlk hedef: Türkiye ikinci el pazarında en çok satılan yaklaşık 30 model. Liste bir sonraki adımda çıkarılacak.
- Claude, web araştırmasıyla her model için taslak kayıtlar hazırlar. Her kayıt kaynak bağlantısı taşır.
- Taslak kayıtlar "onaylanmamış" olarak işaretlenir. Bir insan kontrol edip onaylayana kadar arayüzde "doğrulanmamış" etiketiyle gösterilir.
- Kayıtları kimin onaylayacağı açık bir sorudur (§17).

## 11. Rapor güvenilirlik işaretleri

Uygulama "sahte" veya "gerçek" hükmü vermez. Yalnızca işaretleri listeler ve kullanıcıya nasıl doğrulayacağını söyler.

v1 işaretleri:

- **Rapor yaşı:** Rapor tarihi 30 günden eskiyse uyarı verilir. Eski raporlar düzenlenip yeniden kullanılabiliyor.
- **İç tutarlılık:** Araç yılı ve km uyumu, rapor tarihi ve araç yılı uyumu, tekrar eden veya çelişen maddeler (örneğin aynı parça hem "orijinal" hem "değişen").
- **PDF üst verisi:** Oluşturma ve değiştirme tarihleri farklı mı, belgeyi üreten yazılım bir görüntü veya PDF düzenleyici mi. Bu kontrol kodla yapılır. Yalnızca PDF yüklemelerinde çalışır.
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

## 14. Maliyet kontrolü ve kötüye kullanım

- Analizden önce Cloudflare Turnstile doğrulaması yapılır.
- IP başına günlük analiz sınırı vardır. Başlangıç değeri 3'tür ve ayarlanabilir.
- Dosya boyutu ve sayfa sayısı sınırlanır (§6).
- Yüklenen dosyanın ekspertiz raporu olmadığı anlaşılırsa, okuma adımı bunu bildirir ve yorumlama adımı çalışmaz.

## 15. Kalite ölçümü

- Gerçek raporlardan (farklı firmalar, PDF ve fotoğraf) 10–20 örneklik bir değerlendirme seti hazırlanır.
- Her örnek için beklenen gruplar elle işaretlenir. Bu işaretleri bilen bir kişinin kontrol etmesi gerekir.
- Ölçülenler: araç bilgisinin doğru okunması, maddelerin eksiksiz çıkarılması, grupların doğruluğu. En önemli ölçüt: hiçbir "Dikkat" maddesinin "Normal" olarak gösterilmemesi.
- İstem (prompt) veya model ayarı her değiştiğinde set yeniden çalıştırılır.

## 16. Verilen kararlar

Kullanıcının kararları:

- Uygulama web'de çalışacak.
- Yapay zeka yolu: A (Claude + bilgi tabanı). Fine-tune yok.
- Gruplar: normal, kronik, dikkat ve her biri için ortalama çözüm fiyatı.
- Sahte rapor için bir kontrol yolu bulunacak.
- Sorumluluğun kullanıcıda olduğu vurgulanacak.

Benim kararlarım (kullanıcı değiştirebilir):

- Önce mobil tasarım.
- "Belirsiz" grubu ve "Kontrol ettir" listesi eklendi.
- Altyapı: Next.js 16, Cloudflare Workers, D1, Turnstile.
- İki adımlı analiz hattı.
- Rapor ve sonuç sunucuda saklanmayacak.
- v1'de hesap ve ödeme yok.
- Güvenilirlik konusunda hüküm verilmeyecek, yalnızca işaret gösterilecek.
- Bilgi tabanı verisi JSON dosyalarında, git ile tutulacak.

## 17. Açık sorular

(Gözden geçirme sonrası doldurulacak.)

## 18. Uygulayıcıya bırakılanlar

- Dosya ve klasör yapısı, bileşen ayrımı.
- JSON şemalarının alan adları.
- Uzun süren analiz için yöntem: doğrudan akış (SSE) ya da Cloudflare Queues/Durable Objects. Ölçüm sonrası seçilir.
- PDF üst verisini okuyan kütüphane seçimi (Workers üzerinde çalışmalı).
- Görsel tasarım ayrıntıları (renk tonları, tipografi). Grupların renk anlamı korunmalıdır.
