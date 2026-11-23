# Ekspertiz Rehberi

Türkiye'de ikinci el araç ekspertiz raporunu (PDF ya da fotoğraflar) okuyup sade Türkçeyle açıklayan web uygulaması. Her madde "normal", "kronik", "dikkat" ya da "belirsiz" gruplarından birine konur; sabit kurallar taşıyıcı parçaları ve sınırı aşan ölçümleri en az "dikkat" yapar. Bilgi tabanı (kronik sorunlar, fiyat aralıkları) depodaki JSON dosyalarından gelir. Bilgilendirme amaçlıdır, uzman görüşü yerine geçmez.

Teknoloji: Next.js 16 (App Router), Cloudflare Workers (OpenNext), D1, Claude (`claude-opus-5-5`) ya da Gemini.

Durum: 1. aşama (yalnız sahibine açık test). Tasarım: [`docs/superpowers/specs/2026-11-23-ekspertiz-rapor-analizi-design.md`](docs/superpowers/specs/2026-11-23-ekspertiz-rapor-analizi-design.md), plan: [`docs/superpowers/plans/2026-11-23-ekspertiz-rehberi-asama1.md`](docs/superpowers/plans/2026-11-23-ekspertiz-rehberi-asama1.md). Uygulamada tasarımdan ayrılan yerler spesifikasyonun 20. bölümünde.

## Gereksinimler

- Node.js (Next.js 16 ve Vitest 5 için güncel LTS) ve npm
- Cloudflare hesabı ve `wrangler` (devDependency; `npx wrangler` ile çalışır). Yalnız yayın ve D1 için gerekir.
- Bir API anahtarı: Anthropic (`ANTHROPIC_API_KEY`) ya da Gemini (`GEMINI_API_KEY`). Anahtarsız deneme için çevrimdışı demo var (aşağıda).

## Kurulum

```
npm install
cp .dev.vars.example .dev.vars   # sonra değerleri doldurun
```

`.dev.vars` git'e girmez (`.gitignore`). `next dev` bu dosyayı okur; Cloudflare'de aynı değişkenler `wrangler secret put` ile verilir.

| Anahtar | Ne işe yarar | Zorunlu mu |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude yolu. İkisi de varsa bu seçilir. | `GEMINI_API_KEY` yoksa evet |
| `GEMINI_API_KEY` | Gemini yolu (`AIza…` ya da `AQ.…` ile başlayan anahtar). | `ANTHROPIC_API_KEY` yoksa evet |
| `EXTRACTION_HMAC_SECRET` | Okuma çıktısını imzalar (araç bilgisi düzeltilince yeniden yorumlama için). Üretimde zorunlu; yalnız `next dev`'de yoksa sabit bir geliştirme değeri kullanılır. Üretim için `openssl rand -hex 32`. | Üretimde evet |
| `GEMINI_MODEL` | Gemini birincil model. Varsayılan `gemini-3.8-flash`. | Hayır |
| `GEMINI_FALLBACK_MODEL` | Gemini tek yedek model. Varsayılan `gemini-3.6-flash`; `none` yedeği kapatır. | Hayır |
| `GEMINI_MAX_OUTPUT_TOKENS` | Gemini çıktı token sınırı. Varsayılan 65536. | Hayır |
| `DAILY_SPEND_CAP_USD` | Günlük harcama tavanı (USD). `wrangler.jsonc` içinde `"10"` olarak tanımlı; `.dev.vars` ile ezilebilir. Dolunca yeni analiz kabul edilmez. | Hayır |
| `OFFLINE_DEMO`, `OFFLINE_DEMO_PDF_SHA256` | Çevrimdışı demo (aşağıda). Yalnız `next dev`. | Hayır |

Not: `wrangler.jsonc` içindeki `DAILY_SPEND_CAP_USD` bir `var` olduğu için Cloudflare panelinde ya da dosyada değişir, `wrangler secret` ile değil.

### Çevrimdışı demo (API anahtarsız, yalnız geliştirme)

`NODE_ENV=development` iken ve `.dev.vars` içinde açıkça `OFFLINE_DEMO=1` varken ağ çağrısı yapılmaz; elle hazırlanmış 2021 Kia Picanto (RaporTürk) çıkarım kaydı döner. Yalnız tek bir PDF'i tanır; başka her dosya "rapor değil" sonucu verir. Üretimde bu yol kapalıdır.

PDF'in SHA-256 özetini alın ve `.dev.vars`'a yazın (virgülle birden çok özet verilebilir):

```
shasum -a 256 rapor.pdf
```

```
OFFLINE_DEMO=1
OFFLINE_DEMO_PDF_SHA256=<yukarıdaki özet>
```

Demo sonucu gerçek analizden ayırt edilemez görünür; değerlendirme sayılarına karıştırmayın.

## Yerel D1 ve bilgi tabanı

`next dev` Cloudflare bağlamını açar (`next.config.ts` içinde `initOpenNextCloudflareForDev`), yani yerel D1 (`.wrangler/` altında) kullanılabilir. Yerel D1 hazır değilse geliştirmede sessizce yalnız iki araçlık yedek bilgi tabanına (Picanto, BMW G20) düşülür; bu yüzden aşağıdaki adımları bir kez çalıştırın.

```
npx wrangler d1 migrations apply ekspertiz-kb --local
npm run kb:build
npx wrangler d1 execute ekspertiz-kb --local --file kb/seed.sql
```

- `migrations/0001_init.sql`: `vehicle_kb`, `generic_prices`, `price_cache`, `daily_spend` tabloları.
- `npm run kb:build`: `kb/vehicles/*.json` ve `kb/generic-prices.json` dosyalarını şemayla doğrular, `kb/seed.sql` üretir (`kb/seed.sql` git'e girmez). Seed yeniden çalıştırılabilir: yalnız `vehicle_kb` ve `generic_prices` tablolarını silip yeniden yazar; `price_cache` ve `daily_spend` kalır.
- Bilgi tabanı değiştiğinde `kb:build` ve `d1 execute` adımlarını yinelemeniz gerekir.

## Çalıştırma

```
npm run dev
```

- `http://localhost:3000/` : rapor yükleme ve analiz.
- `http://localhost:3000/ornek` : sabit örnek sonuç (kişisel veri içermeyen BMW 320i raporu; yapay zeka çağrısı yok). Yeniden üretmek için `npm run sample:build` (`src/lib/__fixtures__/bmw-320i-2021.result.json` yazar; gerçek hat fonksiyonlarını ve `kb/` dosyalarını kullanır, yorum metinleri elle yazılıdır).

## Test, tip denetimi, derleme

```
npm test               # vitest run
npm run typecheck      # next typegen && tsc --noEmit
npm run build          # next build
npm run preview        # OpenNext derlemesi + yerel Workers önizlemesi
```

## Bilgi tabanı iş akışı

Kayıtlar `kb/` altındaki JSON dosyalarında, git ile sürüm kontrolünde tutulur.

- `kb/vehicles/<id>.json`: bir model/nesil. `vehicle.id` dosya adıyla aynı olmak zorunda (`kb:build` aksi halde hata verir). İçinde `vehicle` (marka, model, nesil, yıl aralığı, motorlar, segment), `chronicIssues`, `priceItems`.
- `kb/generic-prices.json`: araçtan bağımsız fiyat kalemleri (lastik, akü gibi).
- `kb/firms.json`: ekspertiz firmaları ve rapor doğrulama bağlantıları.
- `kb/models.md`: hedef model listesi ve hangilerinin yazıldığı.

Kurallar:

- Her kronik sorun en az bir kaynak (`sources`: url, title, domain) ve `researchedAt` (YYYY-MM-DD) taşır. Her fiyat kalemi `source` ve `asOf` taşır. Uydurma kaynak yok; bulunamayan kayıt yazılmaz.
- Güven düzeyi alanla girilmez, kaynaklardan hesaplanır: birbirinden farklı en az iki bağımsız alan adı "yüksek", aksi halde "düşük" (tek kaynak). Şikayet siteleri (`sikayetvar.com`) kullanıcı bildirimi sayıldığı için güveni yükseltmez.
- 90 günden eski kayıtlar bayat sayılır; 12 aydan eski kronik kayıtlar yeniden araştırılmalıdır (spesifikasyon §10.4).
- `laborIncluded` kaynak söylemiyorsa `null` olur; tahmin yazılmaz.
- Kaynak bağlantılarının canlı olduğunu denetlemek için: `npm run kb:links`. Dosyaları değiştirmez; her bağlantı için `ok` / `DEAD` / `UNREACHABLE` basar. Ölü bağlantı varsa çıkış kodu 1 (captcha/403 gibi erişilemeyenler hata sayılmaz). Ağ gerektirir.

Yeni model ekleme:

1. `kb/vehicles/<marka-model-nesil>.json` oluşturun; mevcut bir dosyayı şablon alın. `aliases` alanına raporlarda geçen yazımları (örn. `320i`) ekleyin; eşleme harf büyüklüğü ve noktasız `i` farkını yok sayar.
2. `engines` listesine motor kodu, hacim (cc) ve yakıtı yazın. Kronik sorun `engineCodes` ile belirli motorlara bağlanabilir.
3. `npm run kb:build` (şema ve dosya adı denetimi), `npm run kb:links`, `npm test`.
4. Yerel D1'e yükleyin (yukarıdaki `d1 execute` adımı), `kb/models.md` durum sütununu güncelleyin.
5. Yayında: aynı seed dosyası uzak D1'e de yüklenmelidir (yayın listesi).

## Değerlendirme

Etiketli gerçek raporlarda hattı çalıştırır; en önemli ölçüt "dikkat" olması gereken hiçbir maddenin altta gösterilmemesidir (ihlalde çıkış kodu 1). Betik `scripts/eval.ts`, npm komutu `degerlendir`, veri klasörü `eval/`:

```
npm run degerlendir -- --cases ~/ekspertiz-eval
```

- Rapor fotoğrafları ve PDF'leri **depoya girmez**: `~/ekspertiz-eval/<vaka>/` altında durur. Etiketler `eval/labels/<vaka>.json` (klasör adıyla aynı) olarak depoda tutulur ve kişisel veri (plaka, şasi, ad, telefon) içermez. Fotoğraflar sete girmeden önce kişisel veriler karartılmalıdır.
- Gerçek model çağrısı yapar (harcama tavanı bu çalıştırma için 50 USD) ve API anahtarını ortamdan ya da `.dev.vars`'tan okar. Hangi sağlayıcı ve fiyat tablosunun kullanıldığı ilk satırda yazar; Claude ve Gemini sonuçlarını karıştırmayın.
- Ayrıntı, etiket biçimi ve çıkış kodları: [`eval/README.md`](eval/README.md).

## Canlı deneme (smoke)

Klasördeki rapor dosyalarını gerçek sağlayıcıyla okutur ve yalnızca özet basar (ham JSON basılmaz, kişisel veri taraması yapılır). Bilgi tabanını diskten (`kb/`) yükler, D1'e dokunmaz.

```
npm run smoke -- <klasör>                  # okuma + yorumlama özeti
npm run smoke -- <klasör> --extract-only   # yalnız okuma adımı
```

## Yayın listesi (Task 14): henüz yapılmadı

Bu adımlar sahibinin onayı gerektirir. Hiçbiri çalıştırılmadı; `wrangler.jsonc` içindeki `database_id` hâlâ sıfırlardan oluşuyor (`00000000-0000-0000-0000-000000000000`).

- [ ] `npx wrangler d1 create ekspertiz-kb`; çıkan `database_id` değerini `wrangler.jsonc` → `d1_databases[0].database_id` alanına yazın.
- [ ] `npx wrangler d1 migrations apply ekspertiz-kb --remote`
- [ ] `npm run kb:build`, sonra `npx wrangler d1 execute ekspertiz-kb --remote --file kb/seed.sql`
- [ ] Gizli değişkenler (her biri için komut değeri sorar):
  - `npx wrangler secret put ANTHROPIC_API_KEY` (ya da `GEMINI_API_KEY`; sağlayıcı notuna bakın)
  - `npx wrangler secret put EXTRACTION_HMAC_SECRET` (`openssl rand -hex 32` ile üretin)
  - Gemini kullanılacaksa isteğe bağlı: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_MAX_OUTPUT_TOKENS`
- [ ] `npm run deploy` (`opennextjs-cloudflare build` + `deploy`)
- [ ] Worker'ın workers.dev adresine Cloudflare Access koyun (yalnız sahibinin e-postası). Erişim kısıtı olmadan yayın açık olur ve harcama tavanından başka koruma yoktur.
- [ ] Doğrulama: girişsiz `curl -sI https://<worker>.workers.dev/` Access girişine (`cloudflareaccess.com`) yönlenmeli; telefondan örnek rapor yüklenmeli; D1'de `daily_spend` satırı artmalı.

Üretimde D1 bağlaması yoksa istekler reddedilir (harcama tavanı D1'de tutulur). Planın 14. görevindeki `kb:seed` betiği `package.json`'da yok; bunun yerine `kb:build` + `d1 execute` kullanın.

## Sağlayıcı notu: Claude mi, Gemini mi

Sağlayıcı anahtarın biçimine göre seçilir (`src/lib/claude/client.ts`): `AIza…` ya da `AQ.…` ile başlayan anahtar Gemini, diğerleri Anthropic sayılır. Sunucu önce `ANTHROPIC_API_KEY`'e, yoksa `GEMINI_API_KEY`'e bakar. Yanlış yere konmuş bir anahtar verinin beklenenden başka bir sağlayıcıya gitmesine yol açar; kontrol edin.

Sağlayıcıya giden veri:

- Okuma adımı: yüklenen rapor (PDF ya da fotoğraflar), tam olarak.
- Yorumlama adımı: okunan araç bilgisi, madde listesi, ölçümler, OBD kodları, uzman notları, bilgi tabanı kayıtları. Okuma şemasında plaka, şasi ve ad alanı yoktur, ama serbest metin alanlarına (not, ham ifade) kişisel veri karışmadığı garanti edilmez.
- Araç bilgisi düzeltilince yeniden yorumlama: düzeltilmiş araç bilgisi ve imzalı belirteçten doğrulanan okuma çıktısı (görseller yeniden gönderilmez).
- Fiyat araması (bilgi tabanında fiyat yoksa ya da 90 günden eskiyse): araç bilgisi ve aranacak kalemler; web araması (Claude'da `web_search`, Gemini'de Google Search grounding) kullanır.

Dosyalar sunucuda saklanmaz; günlüğe yalnız olay kodu, dosya sayısı, süre ve harcama yazılır.

Gemini ücretsiz katmanı uyarısı: Google'ın koşulları ücretsiz katmanda gönderilen içeriğin ürün geliştirmede kullanılabileceğini öngörür (güncel koşulları kendiniz doğrulayın). Gerçek rapor fotoğrafı (kişisel veri içerir) göndermeden önce ücretli katmana geçilmesi ve Google'ın veri işleme koşullarının gözden geçirilmesi gerekir. Karar henüz verilmedi (sahip kararı bekleniyor). Bu, spesifikasyondaki KVKK bölümünü (§13) da etkiler: yurt dışı aktarımın alıcısı Anthropic ya da Google olabilir. Arayüzdeki açık rıza metni sağlayıcıyı adıyla söylemiyor; herhangi bir dış test kullanıcısından önce bu eklenmelidir.

## Bilinen 1. aşama eksikleri

Bilerek ertelenenler ve henüz yapılmayanlar; 1. aşamada erişim Cloudflare Access ile yalnız sahibine kısıtlı olduğu için kabul edildi, herkese açık yayından önce kapanmalı:

- **Turnstile yok** (spesifikasyon §14).
- **Tarayıcı başına (3/gün) ve IP başına (15/gün) sınırlar yok.** Yalnızca uygulama genelinde günlük harcama tavanı var (`DAILY_SPEND_CAP_USD`).
- **Çift gönderim ve belirteç yeniden kullanımı:** yeniden yorumlama için verilen imzalı belirteç süresi içinde tekrar tekrar kullanılabilir; çift dokunma iki analizi başlatabilir.
- **KVKK aydınlatma metni sayfası yok** (§13); yalnız yükleme sırasındaki açık rıza kutusu var. Hukuki görüş 2. aşamaya bırakıldı.
- **Canlı fiyat sınırları:** web aramasıyla bulunan fiyatlar yalnızca o aramada gerçekten dönen kaynak alan adlarından birine bağlıysa tutulur, ama kaynaktaki sayının doğru okunduğu doğrulanmaz. Fiyatlar tahmindir, 90 gün önbelleğe alınır (D1 `price_cache`). Bilgi tabanındaki fiyatlar araştırma tarihini taşır ve eskiyebilir.
- Sunucu yanıtları (ön akış hataları dahil) HTTP 200 NDJSON olarak döner; güvenlik başlıkları (CSP vb.) tanımlı değil; sunucu istemcinin bildirdiği dosya türüne güveniyor (magic-byte denetimi yok). Ayrıntı: `.superpowers/sdd/2026-11-23-ekspertiz-rehberi-asama1/gap-audit.md`.
