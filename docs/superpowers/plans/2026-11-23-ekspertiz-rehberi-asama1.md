# Ekspertiz Rehberi 1. Aşama Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcının yüklediği ekspertiz raporu fotoğraflarını veya PDF'ini Claude ile okuyan, her maddeyi Normal, Kronik, Dikkat veya Belirsiz grubuna koyan, güvenilirlik işaretlerini gösteren ve yalnızca kullanıcıya açık olan bir web uygulaması.

**Architecture:** Next.js 16 App Router, OpenNext ile Cloudflare Workers üzerinde çalışır. Analiz hattı `src/lib/` altında, test edilebilir saf fonksiyonlardan oluşur. Bu fonksiyonlar iki Claude çağrısının (okuma ve yorumlama) etrafında çalışır. Bilgi tabanı ve günlük harcama D1'de tutulur. API uç noktaları ilerlemeyi NDJSON olayları olarak akıtır.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, `@opennextjs/cloudflare`, wrangler, Cloudflare D1, `@anthropic-ai/sdk`, zod 4, vitest, pdf-lib, jsqr.

**Spec:** `docs/superpowers/specs/2026-11-23-ekspertiz-rapor-analizi-design.md`

## Global Constraints

- Kütüphane API'si yazmadan önce context7 ile bakılır (kullanıcının CLAUDE.md kuralı). Özellikle Next.js 16, OpenNext, Tailwind 4 ve `@anthropic-ai/sdk` için.
- Yapılandırma CourtMax'i örnek alır (`~/projects/courtmax-padel`): `wrangler.jsonc` (`nodejs_compat`, `limits.cpu_ms: 30000`), `open-next.config.ts`, `vitest.config.mts` (node ortamı, `src/**/*.test.ts`, `@` diğer adı).
- Model: `claude-opus-5-5`. `thinking` parametresi gönderilmez (adaptive kendiliğinden açık). `temperature`, `top_p` ve `top_k` gönderilmez. Zorunlu `tool_choice` (`any`/`tool`) kullanılmaz.
- Her Claude çağrısı `client.beta.messages.stream(...)` ve `finalMessage()` ile yapılır. Her çağrıda `betas: ["server-side-fallback-2026-07-01"]` ve `fallbacks: "default"` bulunur.
- Effort: okuma `medium`, yorumlama `high`, fiyat araması `medium`.
- Maliyet hesabı (Opus 5.5): girdi 4 $/milyon token, çıktı 20 $/milyon token, önbellekten okuma 0,20 $/milyon token.
- Günlük harcama tavanı: `DAILY_SPEND_CAP_USD = 10`. Gün, Europe/Istanbul saatine göre hesaplanır.
- Yükleme sınırları: en fazla 25 görsel veya 1 PDF, toplam en fazla 20 MB. Kabul edilen türler `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Görseller tarayıcıda uzun kenarı 1568 px, JPEG kalitesi 0,85 olacak şekilde küçültülür.
- Gruplar: `normal | belirsiz | kronik | dikkat`. Ciddiyet sırası bu sıradır (0–3). Sonuç ekranında sıralama: dikkat, kronik, belirsiz, normal. Renkler: dikkat kırmızı, kronik turuncu, belirsiz gri, normal yeşil.
- Rapor yaşı uyarısı 30 günden sonra verilir. Fiyat 90 günden eskiyse "eski" sayılır. Kronik sorun kaydı 12 aydan eskiyse yeniden araştırılır.
- Okuma çıktısı jetonu HMAC-SHA256 ile imzalanır, 60 dakika geçerlidir ve tek bir ücretsiz yeniden yorumlama hakkı taşır.
- Gizli değişkenler `ANTHROPIC_API_KEY` ve `EXTRACTION_HMAC_SECRET` adıyla tutulur. Yerelde `.dev.vars` dosyasında (gitignore'da), Cloudflare'de `wrangler secret put` ile.
- Kişisel veri:
  - Okuma şemasında plaka, şasi numarası, ad, telefon ve TC alanı yoktur.
  - Kayıtlarda (log) yalnızca olay kodları ve sayılar bulunur.
  - Rapor fotoğrafları depoya girmez. Değerlendirme fotoğrafları `~/ekspertiz-eval/` altında, depo dışında durur.
  - Yüklenen dosyalar ve sonuçlar sunucuda saklanmaz.
- Arayüz metinleri Türkçedir. Sabit metinler `src/lib/copy.ts` içindeki şu değerlerle, harfiyen aynı olur:
  - `DISCLAIMER`: "Bu analiz yapay zekayla hazırlanmış, bilgilendirme amaçlı bir yorumdur. Ekspertiz raporunun veya bir uzmanın görüşünün yerine geçmez. Fiyatlar tahminidir ve değişebilir. Satın alma kararı ve bu karardan doğan tüm sorumluluk kullanıcıya aittir."
  - `CONSENT_DISCLAIMER`: "Sorumluluk notunu okudum ve kabul ediyorum."
  - `CONSENT_TRANSFER`: "Raporumun analiz için yurt dışındaki bir yapay zeka hizmetine aktarılmasını kabul ediyorum."
  - `CONSULT_EXPERT`: "Bir ustaya veya ekspertize danışın."
  - `CAP_REACHED`: "Bugünlük kapasite doldu, yarın tekrar deneyin."
  - `NOT_REPORT`: "Bu dosya bir ekspertiz raporu gibi görünmüyor."
  - `REINTERPRET_USED`: "Bu analiz için düzeltme hakkı kullanıldı."
  - `PRICE_MISSING`: "Fiyat bilgisi henüz yok."
  - `GENERAL_UNVERIFIED`: "genel bilgi, doğrulanmamış"
  - `INTERNET_SOURCED`: "internet kaynaklı"
  - `SINGLE_SOURCE`: "tek kaynak"
  - `STAGES`: `{ okuma: "Rapor okunuyor", arac: "Araç bilgileri bulundu", yorumlama: "Maddeler yorumlanıyor" }`
- Uygulama hiçbir yerde "al" veya "alma" hükmü vermez. Bir raporu "doğrulandı" veya "gerçek" diye etiketlemez.

## Review Focus

1. **Rapor olmayan dosya** (araba fotoğrafı, boş sayfa). Beklenen: `NOT_REPORT` mesajı. Yorumlama çağrısı yapılmaz. Harcamaya yalnızca okuma çağrısı yazılır. Test: Task 10, `runAnalysis` "not a report" testi.
2. **Eksik sayfalar** (kullanıcı raporun yalnızca bir kısmını yüklemiş). Beklenen: Eksik ana bölümler `eksik_bolum` işaretiyle listelenir. Hiçbir eksik bölüm "normal" sayılmaz. Test: Task 5, eksik bölüm testi.
3. **Analiz ortasında Claude reddi, kesilen çıktı veya ağ hatası.** Beklenen: Kullanıcıya Türkçe bir hata olayı gösterilir. O ana kadarki harcama kaydedilir. Arayüz bekleme durumunda takılı kalmaz. Test: Task 8 (`AnalysisError` kodları) ve Task 10 (hata olayı ve harcama kaydı).
4. **Modelin bir maddeyi sabit kuralın altına indirmesi veya bir maddeyi atlaması.** Beklenen: Kural kazanır. Atlanan madde "belirsiz" olarak eklenir. Test: Task 9, `buildResult` testleri.
5. **Aynı panelin hem Kaporta-Boya hem Mor Işık sayfasında olması.** Beklenen: Durumlar aynıysa madde tek görünür. Farklıysa Kaporta maddesi kalır ve `mor_isik_celiski` işareti verilir. Test: Task 3, `normalizeExtraction` testleri.

---

## Dosya Yapısı

| Dosya | Sorumluluk |
|---|---|
| `migrations/0001_init.sql` | D1 tabloları: `vehicle_kb`, `generic_prices`, `price_cache`, `daily_spend` |
| `kb/vehicles/*.json`, `kb/generic-prices.json`, `kb/firms.json`, `kb/models.md` | Bilgi tabanı kaynak kayıtları (git'te) |
| `scripts/build-kb-sql.ts` | `kb/**/*.json` dosyalarından `kb/seed.sql` üretir |
| `scripts/smoke-analyze.ts` | Yerel bir fotoğraf klasöründe hattı canlı çalıştırır |
| `scripts/eval.ts`, `eval/labels/*.json` | Değerlendirme seti çalıştırıcısı ve beklenen etiketler (kişisel veri içermez) |
| `src/lib/copy.ts` | Sabit Türkçe metinler |
| `src/lib/schema/{extraction,interpretation,kb,result,events}.ts` | zod şemaları ve tipler |
| `src/lib/normalize.ts` | Kimlik atama, Mor Işık tekilleştirme |
| `src/lib/rules/{thresholds,floors}.ts` | Sabit kurallar ve grup tabanları |
| `src/lib/signals/{signals,pdf-metadata}.ts` | Güvenilirlik işaretleri |
| `src/lib/kb/{match,confidence,d1}.ts` | Bilgi tabanı eşleme ve D1 okuma |
| `src/lib/claude/{client,cost,prompts,extract,interpret,prices}.ts` | Claude çağrıları |
| `src/lib/pipeline/{token,spend,upload,result,run}.ts` | Hat, jeton, harcama, yükleme doğrulama |
| `src/app/api/analyze/route.ts`, `src/app/api/reinterpret/route.ts` | NDJSON akışlı uç noktalar |
| `src/lib/client/{resize,qr,ndjson}.ts` | Tarayıcı yardımcıları |
| `src/app/page.tsx`, `src/components/*` | Yükleme, ilerleme, araç düzeltme ve sonuç ekranları |
| `src/lib/__fixtures__/bmw-320i-2021.extraction.json` | Örnek rapordan elle yazılmış, kişisel verisi temizlenmiş okuma çıktısı |

---

### Task 1: Proje iskeleti ve sabit metinler

**Files:**
- Create: `package.json`, `next.config.ts`, `open-next.config.ts`, `wrangler.jsonc`, `vitest.config.mts`, `tsconfig.json`, `postcss.config.mjs`, `.dev.vars.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/copy.ts`
- Modify: `.gitignore` (`.dev.vars`, `.open-next/`, `.wrangler/`, `kb/seed.sql` eklenir)
- Test: `src/lib/copy.test.ts`

**Interfaces:**
- Produces: `src/lib/copy.ts` içindeki sabitler (Global Constraints'teki adlar ve değerler). `npm` betikleri: `dev`, `build`, `typecheck`, `test`, `preview`, `deploy`.

- [ ] **Step 1:** `create-next-app` ile TypeScript, App Router, Tailwind 4 ve `src/` dizini seçilerek iskelet kurulur. Ardından `@opennextjs/cloudflare`, `wrangler`, `vitest`, `zod`, `@anthropic-ai/sdk`, `pdf-lib` ve `jsqr` eklenir. Komutlar context7'den kontrol edilir. Next.js geliştirme ortamında Cloudflare bağlamı için OpenNext belgesindeki `initOpenNextCloudflareForDev()` çağrısı `next.config.ts`'e eklenir.
- [ ] **Step 2: Failing test yazılır**

```ts
import { DISCLAIMER, CONSENT_TRANSFER, STAGES } from "@/lib/copy";
test("sabit metinler spesifikasyondaki gibi", () => {
  expect(DISCLAIMER).toMatch(/^Bu analiz yapay zekayla hazırlanmış/);
  expect(DISCLAIMER).toMatch(/tüm sorumluluk kullanıcıya aittir\.$/);
  expect(CONSENT_TRANSFER).toContain("yurt dışındaki bir yapay zeka hizmetine");
  expect(STAGES).toEqual({ okuma: "Rapor okunuyor", arac: "Araç bilgileri bulundu", yorumlama: "Maddeler yorumlanıyor" });
});
```

- [ ] **Step 3:** `npx vitest run src/lib/copy.test.ts` çalıştırılır. Beklenen: FAIL (modül yok).
- [ ] **Step 4:** `src/lib/copy.ts` yazılır. Değerler Global Constraints'ten harfiyen kopyalanır.
- [ ] **Step 5:** `npm test && npm run typecheck && npm run build` çalıştırılır. Beklenen: hepsi geçer.
- [ ] **Step 6:** Commit: `chore: scaffold Next.js 16 app on Cloudflare with fixed Turkish copy`

### Task 2: Şemalar ve örnek rapor fikstürü

**Files:**
- Create: `src/lib/schema/extraction.ts`, `src/lib/schema/interpretation.ts`, `src/lib/schema/result.ts`, `src/lib/schema/events.ts`, `src/lib/__fixtures__/bmw-320i-2021.extraction.json`
- Test: `src/lib/schema/extraction.test.ts`

**Interfaces:**
- Produces (`extraction.ts`):
  - `Section = "kaporta_boya" | "mor_isik" | "sasi" | "ust_motor" | "motor_alt_mekanik" | "ic_dis_donanim" | "conta_kacak" | "airbag" | "obd" | "test_hatti" | "km_sorgusu" | "hasar_sorgusu" | "diger"`
  - `StatusKind = "orijinal" | "saglam" | "orijinalinde_yok" | "lokal_boyali" | "boyali" | "tadilat_boyali" | "degisen" | "sokulup_takilmis" | "deforme" | "asinmis" | "terleme" | "sizinti" | "zayif" | "bakim_onerilir" | "degisim_gerekli" | "ariza" | "calisiyor" | "kontrol_onerilir" | "diger"`
  - `ObdSystem = "motor" | "sanziman" | "fren" | "airbag" | "klima" | "direksiyon" | "multimedya" | "govde_elektronik" | "surus_destek" | "gosterge" | "diger"`. ABS, ESP ve DSC `fren` sistemine eşlenir.
  - `MeasurementTest = "fren_sapma_on" | "fren_sapma_arka" | "el_freni_sapma" | "yanal_kayma_on" | "yanal_kayma_arka" | "suspansiyon_tutunma" | "dinamometre_guc"`
  - `RawExtractionSchema` (Claude'un döndürdüğü biçim, kimliksiz). `Extraction` ise kimlik atanmış biçimdir (Task 3).
- `RawExtraction` alanları:
  - `isReport: boolean` ve `notReportReason: string | null`
  - `vehicle: { brand, model, variant, year, engineCc, powerHp, fuel, transmission, km }`. Hepsi null olabilir. `fuel` için `benzin|dizel|lpg|hibrit|elektrik`, `transmission` için `manuel|otomatik|yari_otomatik` kullanılır.
  - `report: { firm, reportNo, date (YYYY-MM-DD), package, platform, onlineReportQrPresent: boolean }`
  - `sectionsPresent: Section[]`
  - `items: { section, part, rawStatus, statusKind, note }[]`
  - `measurements: { test, position, value, unit, performed, printedPassMin, printedPassMax }[]`
  - `obd: { summary: { system, unitName, hasFault }[], rawFaults: { system, unitName, code, description, type: "intermittent"|"permanent"|"unknown" }[] }`
  - `kmHistory: { date, km }[]` ve `damageRecords: { date, cause, amountTry }[]`
  - `expertNotes: string[]` ve `unreadable: string[]`
  - Plaka, şasi numarası ve kişi alanı yoktur.
- Produces (`interpretation.ts`):
  - `Group = "normal" | "belirsiz" | "kronik" | "dikkat"`
  - `InterpretationSchema`:
    - `summary: string`
    - `items: { itemId, group, title, meaning, whyItMatters, askSeller: string|null, priceItemId: string|null, priceNeed: string|null, chronicIssueId: string|null, generalUnverified: boolean }[]`
    - `checkList: { title, why, chronicIssueId: string|null }[]`
  - Fiyat rakamı şemada yoktur. Model yalnızca bilgi tabanındaki bir `priceItemId`'yi seçer.
- Produces (`result.ts`):
  - `SignalCode = "rapor_eski" | "km_tutarli" | "km_dusus" | "hasar_parca_uyumlu" | "hasar_parca_uyumsuz" | "degisen_var_hasar_yok" | "obd_ozet_celiski" | "eksik_bolum" | "mor_isik_celiski" | "qr_var" | "firma_dogrulama" | "pdf_duzenleyici" | "pdf_sonradan_degistirilmis"`
  - `Signal = { code: SignalCode; level: "ok" | "info" | "warn"; message: string; details: string[] }`
  - `ResultItem = { itemId, group, floorApplied: boolean, title, meaning, whyItMatters, askSeller, cost: { minTry, maxTry, partType, source: {url,title}, asOf, stale: boolean } | null, chronic: { issueId, confidence: "yuksek"|"dusuk", sources: {url,title}[] } | null, generalUnverified: boolean }`
  - `AnalysisResult = { vehicle, report: { firm, reportNo, date }, summary, counts: Record<Group, number>, items: ResultItem[], checkList, signals: Signal[] }`
- Produces (`events.ts`): `AnalysisEvent = { type: "stage", stage: "okuma"|"arac"|"yorumlama" } | { type: "vehicle", vehicle, token } | { type: "result", result: AnalysisResult } | { type: "error", code: ErrorCode, message: string }`. `ErrorCode = "cap_reached" | "not_report" | "refusal" | "truncated" | "invalid_output" | "upload_invalid" | "token_invalid" | "reinterpret_used" | "internal"`.

- [ ] **Step 1: Fikstür yazılır.** Kaynak: `~/Downloads/WhatsApp Unknown 2026-11-23 at 16.50.10/` altındaki 18 fotoğraf. Fikstür `RawExtraction` biçimindedir ve kişisel veri içermez. Şu değerleri içermelidir:
  - Araç ve rapor: `vehicle = { brand: "BMW", model: "320i", year: 2021, engineCc: 1597, powerHp: 170, fuel: "benzin", transmission: "otomatik", km: 135689 }`, `report.date = "2026-11-23"`, `report.firm = "Yavuzlar Oto Ekspertiz"`, `onlineReportQrPresent = true`.
  - Şasi bölümü: "Ön Panel" `degisen`, "Sol Üst Frangart" `lokal_boyali`, diğer 21 madde `orijinal` veya `saglam`.
  - Kaporta-Boya: "Motor Kaputu" ve "Ön Tampon" `degisen`, "Sol Arka Çamurluk" `tadilat_boyali` (not: "750+ µm"), "Arka Tampon" `lokal_boyali`. Mor Işık sayfasında aynı 15 panel aynı durumlarla yer alır.
  - Ölçümler:
    - Fren sapması: ön %8, arka %7, el freni %7. `printedPassMax` 30.
    - Yanal kayma: ön -2, arka 3 (m/km).
    - Süspansiyon tutunması: %78, %76, %72, %74. `printedPassMin` 40.
    - Dinamometre: `value 0`, `performed: false`.
  - OBD özeti: `motor`, `multimedya`, `direksiyon` ve `govde_elektronik` arızalı. `airbag`, `fren`, `sanziman`, `klima` ve `gosterge` arızasız.
  - Ham OBD arızaları (7): `101F01` motor intermittent, `482394` direksiyon intermittent, `800ABF` surus_destek intermittent, `031793` multimedya intermittent, `03179A` multimedya permanent, `B7F81A` multimedya permanent, `801127` klima intermittent.
  - `kmHistory = [{ date: "2024-09-03", km: 87870 }, { date: "2026-09-12", km: 130693 }]`
  - `damageRecords = [{ date: "2023-10-28", cause: "ERP-Çarpışma", amountTry: 263322.55 }, { date: "2024-05-30", cause: "Çarpışma", amountTry: 32400 }]`
- [ ] **Step 2: Failing test yazılır**

```ts
import fixture from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { RawExtractionSchema } from "@/lib/schema/extraction";
test("örnek rapor fikstürü şemaya uyar", () => {
  const r = RawExtractionSchema.parse(fixture);
  expect(r.vehicle.km).toBe(135689);
  expect(r.obd.rawFaults).toHaveLength(7);
  expect(r.measurements.find(m => m.test === "dinamometre_guc")?.performed).toBe(false);
});
test("şemada kişisel veri alanı yok", () => {
  const keys = JSON.stringify(z.toJSONSchema(RawExtractionSchema));
  for (const k of ["plate", "plaka", "vin", "sasiNo", "phone", "telefon", "tc", "name"]) expect(keys).not.toContain(`"${k}"`);
});
```

- [ ] **Step 3:** `npx vitest run src/lib/schema` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 4:** Şemalar Interfaces bölümündeki adlarla zod 4 kullanılarak yazılır. Bütün nesneler `z.strictObject` olur, çünkü yapılandırılmış çıktı `additionalProperties: false` ister. Sayı ve uzunluk kısıtı (`min`/`max`) konmaz.
- [ ] **Step 5:** Testler yeniden çalıştırılır. Beklenen: PASS.
- [ ] **Step 6:** Commit: `feat: add extraction, interpretation and result schemas with redacted sample fixture`

### Task 3: Okuma çıktısını normalleştirme

**Files:**
- Create: `src/lib/normalize.ts`
- Test: `src/lib/normalize.test.ts`

**Interfaces:**
- Consumes: `RawExtraction` (Task 2)
- Produces:
  - `normalizeExtraction(raw: RawExtraction): { extraction: Extraction; signals: Signal[] }`
  - `Extraction`, `RawExtraction` ile aynıdır, ek olarak her elemanda `id` bulunur: `items` için `i1..`, `measurements` için `m1..`, `rawFaults` için `f1..`. `Signal` tipi Task 2'den gelir.

- [ ] **Step 1: Failing testler yazılır**

```ts
test("kimlikler sırayla atanır", () => { /* fikstür: items[0].id === "i1", measurements[0].id === "m1", obd.rawFaults[0].id === "f1" */ });
test("Mor Işık maddesi Kaporta ile aynıysa düşer", () => {
  const { extraction, signals } = normalizeExtraction(fixture);
  expect(extraction.items.filter(i => i.section === "mor_isik")).toHaveLength(0);
  expect(signals.find(s => s.code === "mor_isik_celiski")).toBeUndefined();
});
test("Mor Işık durumu farklıysa Kaporta maddesi kalır ve işaret verilir", () => {
  // fikstürün kopyasında Mor Işık "Motor Kaputu" -> "orijinal"
  // beklenen: kaporta_boya "Motor Kaputu" degisen olarak kalır; signals içinde code "mor_isik_celiski", details ["Motor Kaputu"]
});
test("parça adları büyük/küçük harf ve Türkçe karakter farkına rağmen eşleşir", () => { /* "MOTOR KAPUTU" == "Motor Kaputu" (tr-TR küçük harf) */ });
```

- [ ] **Step 2:** `npx vitest run src/lib/normalize.test.ts` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** `normalizeExtraction` yazılır. Parça adları `toLocaleLowerCase("tr-TR")` ve boşluk sadeleştirmesiyle karşılaştırılır.
- [ ] **Step 4:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 5:** Commit: `feat: normalize extraction with ids and mor isik dedupe`

### Task 4: Sabit kural katmanı

**Files:**
- Create: `src/lib/rules/thresholds.ts`, `src/lib/rules/floors.ts`
- Test: `src/lib/rules/floors.test.ts`

**Interfaces:**
- Consumes: `Extraction`, `Group`
- Produces:
  - `GROUP_RANK: Record<Group, number>` (`normal: 0`, `belirsiz: 1`, `kronik: 2`, `dikkat: 3`)
  - `mergeGroup(model: Group, floor: Group | undefined): Group` (yüksek olan kazanır)
  - `computeFloors(e: Extraction, t?: Thresholds): Map<string, Group>` (anahtar `itemId`)
  - `DEFAULT_THRESHOLDS: Thresholds = { brakeImbalanceMaxPct: { value: 30, source }, suspensionGripMinPct: { value: 40, source }, sideSlipMaxAbsMPerKm: { value: number | null, source } }`
- Kurallar:
  1. `section === "sasi"` ve `statusKind` değeri `orijinal`, `saglam` veya `orijinalinde_yok` dışındaysa: `dikkat`.
  2. `section === "airbag"` ve aynı koşul: `dikkat`.
  3. Ham arızanın `system` değeri `airbag` veya `fren` ise: `dikkat`.
  4. Ölçümde `performed === false` ise: `belirsiz`.
  5. Ölçüm sınırı aşıyorsa: `dikkat`. Raporda basılı sınır (`printedPassMax`/`printedPassMin`) önce gelir, yoksa `DEFAULT_THRESHOLDS` kullanılır. Yanal kaymada mutlak değere bakılır.

- [ ] **Step 1: Yanal kayma için araştırma.** TÜVTÜRK muayene ölçütlerinde yanal kayma ve fren dengesizliği sınırı aranır. Bulunursa değer ve kaynak bağlantısı `thresholds.ts`'e yazılır. Yanal kayma için kaynak bulunamazsa `sideSlipMaxAbsMPerKm.value = null` olur ve kaynak alanına "bulunamadı" yazılır. Bu durumda bu ölçüm için kural yalnızca basılı sınırla çalışır.
- [ ] **Step 2: Failing testler yazılır**

```ts
const { extraction } = normalizeExtraction(fixture);
const floors = computeFloors(extraction);
const byPart = (p: string) => extraction.items.find(i => i.part === p)!.id;
test("şasi: değişen ön panel ve boyalı frangart dikkat", () => {
  expect(floors.get(byPart("Ön Panel"))).toBe("dikkat");
  expect(floors.get(byPart("Sol Üst Frangart"))).toBe("dikkat");
  expect(floors.get(byPart("Sol Ön Direk"))).toBeUndefined();
});
test("yapılmamış dinamometre belirsiz", () => { /* dinamometre ölçümünün id'si -> "belirsiz" */ });
test("fren %8 sınırın altında, kural yok; %31 dikkat", () => { /* fikstür ve fren_sapma_on=31 olan kopya */ });
test("basılı sınır varsayılandan önce gelir", () => { /* printedPassMax 20, değer 25 -> dikkat; varsayılan 30 olsa da */ });
test("airbag veya fren sistemindeki ham arıza dikkat", () => { /* rawFault system "fren" ekle -> dikkat */ });
test("mergeGroup kuralın altına inmez", () => {
  expect(mergeGroup("normal", "dikkat")).toBe("dikkat");
  expect(mergeGroup("dikkat", "belirsiz")).toBe("dikkat");
  expect(mergeGroup("kronik", undefined)).toBe("kronik");
});
```

- [ ] **Step 3:** `npx vitest run src/lib/rules` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 4:** `thresholds.ts` ve `floors.ts` yazılır.
- [ ] **Step 5:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 6:** Commit: `feat: add rule floors for structural parts, safety faults and measurements`

### Task 5: Güvenilirlik işaretleri

**Files:**
- Create: `src/lib/signals/signals.ts`, `src/lib/signals/pdf-metadata.ts`
- Test: `src/lib/signals/signals.test.ts`, `src/lib/signals/pdf-metadata.test.ts`

**Interfaces:**
- Consumes: `Extraction`, `Signal`
- Produces:
  - `computeSignals(e: Extraction, opts: { now: Date }): Signal[]`
  - `inspectPdfMetadata(bytes: Uint8Array): Promise<Signal[]>`
  - Kodlar Task 2'deki `SignalCode` tipinden gelir. `firma_dogrulama` kodu Task 9'da üretilir.
- Kurallar:
  - Rapor tarihi `now`'dan 30 günden eskiyse `rapor_eski` (warn).
  - Km geçmişinde rapor km'sinden büyük bir kayıt varsa ya da geçmiş kendi içinde azalıyorsa `km_dusus` (warn). Geçmiş varsa ve bunlar yoksa `km_tutarli` (ok).
  - "Değişmiş parça" demek, `degisen`, `boyali`, `lokal_boyali`, `tadilat_boyali` veya `sokulup_takilmis` durumunda bir parça demek.
  - Hasar kaydı var ama değişmiş parça yoksa `hasar_parca_uyumsuz` (warn).
  - Değişmiş parça var, hasar sorgusu bölümü var ama kayıt yoksa `degisen_var_hasar_yok` (info).
  - Hem hasar kaydı hem değişmiş parça varsa `hasar_parca_uyumlu` (ok). `details` alanında kayıt tarihleri ve tutarları yer alır.
  - Özet "arızasız" diyen bir sistemde ham arıza varsa `obd_ozet_celiski` (warn). `details` alanında sistem adları yer alır.
  - Ana bölümlerden (`kaporta_boya`, `sasi`, `ust_motor`, `motor_alt_mekanik`, `obd`, `test_hatti`) biri eksikse `eksik_bolum` (info). `details` alanında eksik bölümler yer alır.
  - `onlineReportQrPresent` ise `qr_var` (info).
  - PDF üreticisinde veya oluşturucusunda şunlardan biri geçiyorsa `pdf_duzenleyici` (warn): `photoshop`, `gimp`, `canva`, `ilovepdf`, `smallpdf`, `sejda`, `pdfescape`, `pdffiller`.
  - PDF değiştirme tarihi oluşturma tarihinden 24 saatten fazla sonraysa `pdf_sonradan_degistirilmis` (warn).

- [ ] **Step 1: Failing testler yazılır**

```ts
const now = new Date("2026-11-23T15:00:00+03:00");
test("örnek rapor: güncel, km tutarlı, hasar uyumlu, klimada OBD çelişkisi", () => {
  const codes = computeSignals(normalizeExtraction(fixture).extraction, { now });
  expect(codes.map(s => s.code)).toEqual(expect.arrayContaining(["km_tutarli", "hasar_parca_uyumlu", "obd_ozet_celiski", "qr_var"]));
  expect(codes.find(s => s.code === "obd_ozet_celiski")!.details).toEqual(["klima"]);
  expect(codes.map(s => s.code)).not.toContain("rapor_eski");
  expect(codes.map(s => s.code)).not.toContain("eksik_bolum");
});
test("eski rapor uyarı alır", () => { /* report.date "2026-10-01" -> rapor_eski */ });
test("km düşüşü yakalanır", () => { /* kmHistory son kayıt 140000 > 135689 -> km_dusus */ });
test("eksik sayfa: test hattı ve OBD yoksa eksik_bolum", () => { /* sectionsPresent'ten çıkar -> details ["obd","test_hatti"] */ });
// pdf-metadata.test.ts: pdf-lib ile üretici "Canva" olan PDF -> pdf_duzenleyici;
// oluşturma 2026-11-01, değiştirme 2026-11-20 -> pdf_sonradan_degistirilmis; temiz PDF -> []
```

- [ ] **Step 2:** `npx vitest run src/lib/signals` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** İki modül yazılır. PDF meta verisi pdf-lib ile okunur: `getProducer`, `getCreator`, `getCreationDate`, `getModificationDate`. Her `message` alanına kısa bir Türkçe cümle yazılır. Hiçbir mesaj "sahte" veya "gerçek" demez.
- [ ] **Step 4:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 5:** Commit: `feat: add report reliability signals and PDF metadata check`

### Task 6: Bilgi tabanı şeması, eşleme ve D1

**Files:**
- Create: `src/lib/schema/kb.ts`, `src/lib/kb/match.ts`, `src/lib/kb/confidence.ts`, `src/lib/kb/d1.ts`, `migrations/0001_init.sql`, `scripts/build-kb-sql.ts`
- Test: `src/lib/kb/match.test.ts`, `src/lib/kb/confidence.test.ts`

**Interfaces:**
- Produces (`kb.ts`):
  - `Source = { url, title, domain }`
  - `VehicleKbFile`:
    - `vehicle: { brand, model, generation, aliases: string[], yearFrom, yearTo, engines: { code, cc, fuel }[], segment: "a_b"|"c"|"d"|"e_premium"|"suv" }`
    - `chronicIssues: { id, system, title, description, symptoms: string[], matchKeywords: string[], obdCodes: string[], engineCodes: string[] | null, priceItemId: string | null, sources: Source[], researchedAt }[]`
    - `priceItems: PriceItem[]`
  - `PriceItem = { id, title, partType: "orijinal"|"yan_sanayi"|"belirtilmemis", laborIncluded: boolean, minTry, maxTry, segment: Segment | null, source: Source, asOf }`
  - `GenericPricesFile = { priceItems: PriceItem[] }`
  - `FirmsFile = { firms: { name, verifyUrl, note }[] }`
- Produces (`match.ts`, `confidence.ts`, `d1.ts`):
  - `KnowledgeQuery = { vehicle: Extraction["vehicle"]; firm: string | null }`
  - `matchKnowledge(kb: { vehicles: VehicleKbFile[]; generic: PriceItem[]; firms: FirmsFile["firms"] }, q: KnowledgeQuery, now: Date): Knowledge`
  - `Knowledge = { vehicleId: string | null, chronicIssues: (ChronicIssue & { confidence })[], priceItems: (PriceItem & { stale: boolean })[], firmVerifyUrl: string | null }`
  - `confidenceFromSources(sources: Source[]): "yuksek" | "dusuk"` (en az 2 farklı alan adı varsa "yuksek")
  - `loadKnowledge(db: D1Database, q: KnowledgeQuery, now: Date): Promise<Knowledge>`. `kb/firms.json` D1'e konmaz, statik olarak import edilir.
- D1 tabloları:
  - `vehicle_kb(id TEXT PRIMARY KEY, brand TEXT, json TEXT)`. `brand` değeri `tr-TR` küçük harfle tutulur.
  - `generic_prices(id TEXT PRIMARY KEY, json TEXT)`
  - `price_cache(id TEXT PRIMARY KEY, vehicle_id TEXT, json TEXT, as_of TEXT)`
  - `daily_spend(day TEXT PRIMARY KEY, usd REAL NOT NULL DEFAULT 0)`

- [ ] **Step 1: Failing testler yazılır**

```ts
test("marka ve modeli büyük/küçük harften bağımsız eşler; yıl aralığı dışını almaz", () => {
  // BMW 3 Serisi G20 (2019-2026, aliases ["320i","318i","320d"]) -> v {brand:"bmw", model:"320i", year:2021} eşleşir
  // year 2017 -> vehicleId null, yalnız generic fiyatlar döner
});
test("motor koduna bağlı kronik sorun yalnız o motorda gelir", () => { /* engineCodes ["B48A16"], engineCc 1597 eşleşir; 1998 cc eşleşmez */ });
test("90 günden eski fiyat stale işaretlenir", () => { /* asOf 2026-08-01, now 2026-11-23 -> stale true */ });
test("firma adı eşleşirse doğrulama adresi döner", () => { /* firms [{name:"Otorapor", verifyUrl:"https://..."}], firm "OTORAPOR" -> firmVerifyUrl dolu; "Yavuzlar Oto Ekspertiz" listede yoksa null */ });
test("güven: iki farklı alan adı yüksek, aynı alan adı iki kez düşük", () => {
  expect(confidenceFromSources([{domain:"a.com"},{domain:"b.com"}] as any)).toBe("yuksek");
  expect(confidenceFromSources([{domain:"a.com"},{domain:"a.com"}] as any)).toBe("dusuk");
});
```

- [ ] **Step 2:** `npx vitest run src/lib/kb` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** `kb.ts`, `match.ts`, `confidence.ts` ve `migrations/0001_init.sql` yazılır. `d1.ts` önce marka satırlarını çeker, ardından eşlemeyi `matchKnowledge`'a bırakır. `build-kb-sql.ts` her JSON dosyasını şemayla doğrular ve `INSERT OR REPLACE` satırları üretir.
- [ ] **Step 4:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 5:** Yerel D1 kontrolü: `npx wrangler d1 migrations apply ekspertiz-kb --local`. Beklenen: 4 tablo oluşur.
- [ ] **Step 6:** Commit: `feat: add knowledge base schema, matching and D1 migration`

### Task 7: Bilgi tabanı içeriği (internet araştırması)

**Files:**
- Create: `kb/models.md`, `kb/vehicles/<marka>-<model>-<nesil>.json`, `kb/generic-prices.json`, `kb/firms.json`
- Test: `src/lib/kb/content.test.ts`

**Interfaces:**
- Consumes: `VehicleKbFile`, `GenericPricesFile`, `FirmsFile` (Task 6)

- [ ] **Step 1: Failing içerik testi yazılır.** Test `kb/**/*.json` dosyalarının hepsini dolaşır ve şunları kontrol eder:
  - Her dosya şemaya uyar.
  - Her kronik sorunda en az 1 kaynak vardır ve `researchedAt` tarihi geçerlidir.
  - Her fiyat kaleminde `minTry ≤ maxTry` geçerlidir ve kaynak vardır.
  - Kimlikler tekildir.
  - `chronicIssues[].priceItemId` aynı dosyadaki veya `generic-prices.json` içindeki bir fiyat kalemine işaret eder.
  - `researchedAt` değeri bugünden 12 aydan eski olan kayıt varsa test kaydın kimliğini yazarak başarısız olur. Böylece eski kayıtlar yeniden araştırılmaya zorlanır.
- [ ] **Step 2:** `kb/models.md` yazılır. İçinde Türkiye ikinci el pazarında en çok satılan yaklaşık 30 model ve listenin kaynağı yer alır.
- [ ] **Step 3:** İlk 5 model web araştırmasıyla yazılır. BMW 3 Serisi G20 (B48A16 dahil) bunlardan biridir. Bunlarla birlikte `generic-prices.json` yazılır. En az şu kalemler bulunur: 4 lastik (segment başına), ön ve arka fren disk-balata, akü (BMW için kodlama dahil), panel boyama, lokal boya, rot-balans, yağ filtresi yuvası contası. Fiyatlar TL cinsindendir ve kaynak ile tarih taşır. Kaynağı olmayan bilgi yazılmaz.
- [ ] **Step 4:** `kb/firms.json` yazılır. Rapor sorgulama sayfası bulunabilen büyük firmalar listelenir (en az Otorapor). Her birinin sorgu adresi doğrulanır.
- [ ] **Step 5:** `npx vitest run src/lib/kb/content.test.ts` çalıştırılır. Beklenen: PASS.
- [ ] **Step 6:** Commit: `feat(kb): seed first 5 models, generic prices and firm links`
- [ ] **Step 7:** Kalan modeller için Step 3, 5 ve 6 beşer modellik gruplar halinde tekrarlanır, ta ki 30 model tamamlanana kadar. Her grup ayrı commit olur. Bu adım Task 8 ve sonrasıyla paralel yürüyebilir.

### Task 8: Claude istemcisi ve okuma çağrısı

**Files:**
- Create: `src/lib/claude/client.ts`, `src/lib/claude/cost.ts`, `src/lib/claude/prompts.ts`, `src/lib/claude/extract.ts`, `scripts/smoke-analyze.ts`
- Test: `src/lib/claude/client.test.ts`, `src/lib/claude/cost.test.ts`, `src/lib/claude/extract.test.ts`

**Interfaces:**
- Produces:
  - `createClaude(apiKey: string): Anthropic`
  - `class AnalysisError extends Error { code: ErrorCode }`
  - `runStructured<T>(client: ClaudeLike, p: { system: string; content: ContentBlockParam[]; schema: ZodType<T>; effort: "medium" | "high"; maxTokens: number }): Promise<{ data: T; usd: number }>`
  - `ClaudeLike = Pick<Anthropic, "beta">`. Testlerde sahte bir nesne kullanılır.
  - `usageToUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number`
  - `UploadFile = { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf" }`
  - `extractReport(client: ClaudeLike, files: UploadFile[]): Promise<{ raw: RawExtraction; usd: number }>`
- Okuma istemi (`EXTRACTION_SYSTEM`) şu kuralları içerir:
  - Yalnızca raporda yazanı çıkar, tahmin etme. Okunamayanı `unreadable` alanına yaz.
  - Plaka, şasi numarası, ad, telefon ve TC numarası yazma.
  - Ham durumu olduğu gibi `rawStatus` alanına yaz ve `statusKind` değerine eşle.
  - ABS, ESP ve DSC arızalarını `fren` sistemine eşle.
  - "135.689" gibi değerleri 135689 olarak yaz. Tarihleri YYYY-MM-DD biçiminde yaz.
  - Ölçüm 0 ise ve test yapılmamış görünüyorsa `performed: false` yaz.
  - Raporda basılı geçer/kalır sınırlarını `printedPass*` alanlarına yaz.
  - Dosya ekspertiz raporu değilse `isReport: false` yaz.
  - Bozuk Türkçe karakterli metni anlamına göre oku.

- [ ] **Step 1: Failing testler yazılır**

```ts
// client.test.ts: sahte client.beta.messages.stream(params) -> { finalMessage: async () => msg }, params kaydedilir
test("istek: model, yedek model, effort, sıcaklık yok", async () => {
  await runStructured(fake(okMsg('{"a":1}')), { system: "s", content: [], schema: z.strictObject({ a: z.number() }), effort: "medium", maxTokens: 32000 });
  expect(captured).toMatchObject({ model: "claude-opus-5-5", betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" } });
  expect(captured).not.toHaveProperty("temperature");
  expect(captured).not.toHaveProperty("thinking");
});
test("refusal -> AnalysisError refusal", ...);       // stop_reason "refusal"
test("max_tokens -> AnalysisError truncated", ...);  // stop_reason "max_tokens"
test("şemaya uymayan çıktı -> invalid_output", ...);
// cost.test.ts
test("maliyet", () => expect(usageToUsd({ input_tokens: 30000, output_tokens: 4000, cache_read_input_tokens: 10000 })).toBeCloseTo(0.12 + 0.08 + 0.002, 6));
// extract.test.ts
test("görseller image, PDF document bloğu olur; metin talimatı en sonda", ...); // 3 jpeg -> 3 image bloğu + 1 text; 1 pdf -> 1 document bloğu
```

- [ ] **Step 2:** `npx vitest run src/lib/claude` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** Modüller yazılır:
  - `runStructured`, `output_config.format` için `zodOutputFormat(schema)` (`@anthropic-ai/sdk/helpers/zod`) kullanır. Beta parametre tipi bunu kabul etmezse, önce context7'de beta karşılığı aranır.
  - Son metin bloğu `schema.safeParse(JSON.parse(text))` ile doğrulanır.
  - `stop_reason` kontrolü ayrıştırmadan önce yapılır.
  - Maliyet hata durumunda da hesaplanır ve `AnalysisError` içinde `usd` alanında taşınır.
- [ ] **Step 4:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 5 (kullanıcı adımı):** `.dev.vars` dosyasına `ANTHROPIC_API_KEY` girilmelidir. Anahtar Claude Console'dan alınır. Kullanıcı anahtarı sohbete yapıştırmaz, dosyaya kendisi yazar.
- [ ] **Step 6: Canlı deneme.** Komut: `npx tsx scripts/smoke-analyze.ts "$HOME/Downloads/WhatsApp Unknown 2026-11-23 at 16.50.10" --extract-only`. Beklenen:
  - Araç bilgisi fikstürle aynı.
  - En az 12 bölüm bulunmuş, ham OBD arızası 7.
  - Dinamometre `performed: false`.
  - Çıktıda plaka veya telefon yok.
  - Harcanan tutar ekrana yazılır.
- [ ] **Step 7:** Commit: `feat: add Claude client wrapper and report extraction call`

### Task 9: Yorumlama çağrısı ve sonuç birleştirme

**Files:**
- Create: `src/lib/claude/interpret.ts`, `src/lib/pipeline/result.ts`
- Modify: `src/lib/claude/prompts.ts` (`INTERPRETATION_SYSTEM` eklenir)
- Test: `src/lib/claude/interpret.test.ts`, `src/lib/pipeline/result.test.ts`

**Interfaces:**
- Consumes: `runStructured` (Task 8), `Extraction`, `Knowledge` (Task 6), `computeFloors`/`mergeGroup` (Task 4), `Signal` (Task 5)
- Produces:
  - `interpretReport(client: ClaudeLike, input: { extraction: Extraction; knowledge: Knowledge; floors: Map<string, Group> }): Promise<{ interpretation: Interpretation; usd: number }>`
  - `buildResult(input: { extraction: Extraction; interpretation: Interpretation; knowledge: Knowledge; floors: Map<string, Group>; signals: Signal[] }): AnalysisResult`
- Yorumlama istemi şunları içerir:
  - Spesifikasyon §8'deki grup tanımları ve örnekler.
  - Kararsız kalınırsa daha ciddi grubun seçileceği kuralı.
  - Hiçbir maddenin taban grubun altına indirilemeyeceği kuralı (tabanlar istemde verilir).
  - Fiyatın yalnızca `knowledge.priceItems` içinden seçileceği, uygun kalem yoksa `priceItemId: null` ve kısa bir `priceNeed` yazılacağı kuralı.
  - Kronik sorunun yalnızca `knowledge.chronicIssues` içinden seçileceği kuralı. Bilgi tabanında olmayan genel bilgi `generalUnverified: true` olarak işaretlenir.
  - `checkList` maddeleri, raporda görünmeyen bilgi tabanı kronik sorunlarından seçilir.
  - "Al" veya "alma" hükmü verilmez. Sade Türkçe kullanılır. Rapordaki sayılar aynen aktarılır.
  - Girdi yalnızca JSON metnidir. Görsel gönderilmez.
- `buildResult` kuralları:
  - Her `itemId` için grup `mergeGroup(model, floor)` olur. Taban uygulandıysa `floorApplied` true olur.
  - Okuma çıktısında olup yorumlamada olmayan her madde, ölçüm ve ham arıza `belirsiz` olarak eklenir. Başlık parça adıdır, açıklama "Bu madde otomatik yorumlanamadı." olur.
  - Fiyat rakamları yalnızca `knowledge.priceItems`'tan kopyalanır. Bilinmeyen bir `priceItemId` gelirse `cost: null` olur.
  - `chronic` alanı bilinen `chronicIssueId` ile doldurulur, `confidence` ve `sources` bilgi tabanından gelir. Bilinmeyen kimlik gelirse `chronic: null` ve `generalUnverified: true` olur.
  - Sıralama Global Constraints'teki gibidir. Grup içinde okuma sırası korunur. `counts` hesaplanır.
  - `knowledge.firmVerifyUrl` doluysa sinyallere `firma_dogrulama` (info) eklenir. Mesaj "Raporu firmanın kendi sorgu sayfasından doğrulayın." olur, `details` alanında adres yer alır.

- [ ] **Step 1: Failing testler yazılır**

```ts
test("model normal dese de şasi tabanı dikkat yapar", ...);        // floor dikkat, model normal -> dikkat, floorApplied true
test("atlanan madde belirsiz eklenir", ...);                         // yorumlamada f7 yok -> f7 belirsiz
test("bilgi tabanında olmayan fiyat kimliği fiyat göstermez", ...);   // priceItemId "uydurma" -> cost null
test("fiyat rakamları bilgi tabanından, stale bayrağıyla", ...);      // minTry/maxTry/asOf KB'den
test("sıralama dikkat, kronik, belirsiz, normal; sayımlar doğru", ...);
test("firma doğrulama adresi varsa firma_dogrulama sinyali eklenir", ...);
test("yorumlama isteği effort high ve görsel bloğu içermez", ...);    // interpret.test.ts, sahte istemci
```

- [ ] **Step 2:** `npx vitest run src/lib/claude/interpret.test.ts src/lib/pipeline/result.test.ts` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** `interpret.ts` ve `result.ts` yazılır.
- [ ] **Step 4:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 5: Canlı deneme.** Komut: `npx tsx scripts/smoke-analyze.ts "<aynı klasör>"`. Beklenen:
  - "Ön Panel" ve "Sol Üst Frangart" dikkat grubunda.
  - Dinamometre belirsiz grubunda.
  - Yağ terlemeleri kronik grubunda, BMW bilgi tabanı kaydına bağlı.
  - İşaretlerde `obd_ozet_celiski` var.
  - Toplam harcama ekrana yazılır.
- [ ] **Step 6:** Commit: `feat: add interpretation call and result builder with rule and price guards`

### Task 10: Analiz hattı, jeton, harcama ve API uç noktaları

**Files:**
- Create: `src/lib/pipeline/token.ts`, `src/lib/pipeline/spend.ts`, `src/lib/pipeline/upload.ts`, `src/lib/pipeline/run.ts`, `src/app/api/analyze/route.ts`, `src/app/api/reinterpret/route.ts`
- Test: `src/lib/pipeline/token.test.ts`, `src/lib/pipeline/spend.test.ts`, `src/lib/pipeline/upload.test.ts`, `src/lib/pipeline/run.test.ts`

**Interfaces:**
- Consumes: `extractReport`, `interpretReport`, `normalizeExtraction`, `computeFloors`, `computeSignals`, `inspectPdfMetadata`, `loadKnowledge`, `buildResult`, `AnalysisEvent`
- Produces:
  - `signExtraction(p: { extraction: Extraction; reinterpretsLeft: 0 | 1 }, secret: string, now: Date): Promise<string>`. Biçim: `base64url(json).base64url(hmac)`. Süre: 60 dakika.
  - `verifyExtraction(token: string, secret: string, now: Date): Promise<{ extraction: Extraction; reinterpretsLeft: 0 | 1 }>`. Hata durumunda `AnalysisError("token_invalid")` fırlatır.
  - `istanbulDay(now: Date): string` (YYYY-MM-DD)
  - `SpendStore = { get(day: string): Promise<number>; add(day: string, usd: number): Promise<void> }` ve `d1SpendStore(db: D1Database): SpendStore`
  - `validateUpload(files: { size: number; type: string }[]): void`. Geçersizse `AnalysisError("upload_invalid")` fırlatır.
  - `PipelineDeps = { claude: ClaudeLike; loadKnowledge: (q: KnowledgeQuery) => Promise<Knowledge>; spend: SpendStore; secret: string; now: () => Date; capUsd: number }`
  - `runAnalysis(d: PipelineDeps, files: UploadFile[], emit: (e: AnalysisEvent) => void): Promise<void>`
  - `runReinterpret(d: PipelineDeps, input: { token: string; vehicle: Extraction["vehicle"] }, emit): Promise<void>`
- Akış:
  1. Harcama tavanı kontrol edilir. Tavan dolduysa `cap_reached` olayı verilir ve hat durur.
  2. `stage okuma` olayı verilir ve okuma yapılır. Harcama kaydedilir.
  3. Rapor değilse `not_report` olayı verilir ve hat durur.
  4. Normalleştirme yapılır. Jeton imzalanır (`reinterpretsLeft: 1`). `stage arac` ve `vehicle` olayları verilir.
  5. Tabanlar, işaretler ve PDF işaretleri hesaplanır. Bilgi tabanı yüklenir.
  6. `stage yorumlama` olayı verilir ve yorumlama yapılır. Harcama kaydedilir.
  7. `buildResult` çalıştırılır ve `result` olayı verilir.
- Hata davranışı: Her `AnalysisError` Türkçe mesajla bir `error` olayına çevrilir. Hataya kadarki harcama yine kaydedilir.
- `runReinterpret`: Jeton doğrulanır. `reinterpretsLeft` 0 ise `reinterpret_used` olayı verilir. Değilse araç bilgisi değiştirilir ve akış 5. adımdan devam eder. Yeni jeton verilmez.
- Uç noktalar:
  - `POST /api/analyze` multipart `files[]` alır. `POST /api/reinterpret` JSON `{ token, vehicle }` alır.
  - Yanıt `Content-Type: application/x-ndjson`, gövdesi `ReadableStream` olur ve her olay bir satırdır.
  - `env` değerleri `getCloudflareContext()` ile okunur: `DB`, `ANTHROPIC_API_KEY`, `EXTRACTION_HMAC_SECRET`.
  - `console.log` yalnızca olay kodu, dosya sayısı, süre ve harcama yazar.

- [ ] **Step 1: Failing testler yazılır**

```ts
test("jeton: gidip gelir, değiştirilmiş jeton ve 61 dakikalık jeton reddedilir", ...);
test("istanbulDay 2026-11-23T22:30Z -> 2026-11-24", ...);
test("yükleme: 26 görsel, PDF+görsel, 21 MB ve image/gif reddedilir; 25 jpeg kabul", ...);
test("olay sırası: stage okuma, stage arac, vehicle, stage yorumlama, result", ...);  // sahte bağımlılıklar
test("rapor değil: not_report, yorumlama çağrılmaz, harcama bir kez eklenir", ...);
test("tavan dolu: cap_reached, okuma çağrılmaz", ...);
test("yorumlamada refusal: error refusal ve iki harcama kaydı", ...);
test("yeniden yorumlama hakkı bir kez", ...);  // ikinci çağrı reinterpret_used
```

- [ ] **Step 2:** `npx vitest run src/lib/pipeline` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** Modüller ve uç noktalar yazılır. HMAC için Web Crypto (`crypto.subtle`) kullanılır.
- [ ] **Step 4:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 5: Yerel uçtan uca deneme.** `npm run preview` çalıştırılır, ardından `curl -N -F files=@<foto1> ... http://localhost:8787/api/analyze` ile istek gönderilir. Beklenen: NDJSON olayları sırayla gelir, son satır `result` olur.
- [ ] **Step 6:** Commit: `feat: add analysis pipeline, signed reinterpretation and streaming API routes`

### Task 11: Arayüz

**Files:**
- Create: `src/lib/client/resize.ts`, `src/lib/client/qr.ts`, `src/lib/client/ndjson.ts`, `src/components/upload-form.tsx`, `src/components/progress.tsx`, `src/components/vehicle-card.tsx`, `src/components/result-view.tsx`, `src/components/signal-list.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/lib/client/ndjson.test.ts`, `src/lib/client/qr.test.ts`

**Interfaces:**
- Consumes: `AnalysisEvent`, `AnalysisResult`, `copy.ts`
- Produces:
  - `readNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: AnalysisEvent) => void): Promise<void>`
  - `resizeImage(file: File, maxEdge = 1568, quality = 0.85): Promise<Blob>`
  - `decodeQr(image: ImageData): string | null` (jsqr)
  - `qrLink(text: string): { url: string; domain: string } | null`
- Ekran davranışı (spesifikasyon §9):
  - İki onay kutusu (`CONSENT_DISCLAIMER`, `CONSENT_TRANSFER`) işaretlenmeden yükleme düğmesi pasif kalır.
  - Dosya girişi: `accept="image/*,application/pdf"`, `multiple`, kamera seçeneği.
  - Görseller küçültülür. Her görselde QR aranır, bulunan bağlantı ve alan adı "Rapor güvenilirlik işaretleri" bölümünde gösterilir.
  - İlerleme `STAGES` metinleriyle gösterilir.
  - `vehicle` olayı gelince araç kartı görünür. "Düzelt" formu `/api/reinterpret`'e gider.
  - Sonuç §9'daki taslağa uyar. Normal maddeler kapalı bir liste olarak gelir. Her dikkat maddesinde `CONSULT_EXPERT` yer alır.
  - Kronik maddelerde `INTERNET_SOURCED` ve kaynak bağlantıları gösterilir. Güven "dusuk" ise ayrıca `SINGLE_SOURCE` gösterilir.
  - Fiyat yoksa `PRICE_MISSING` gösterilir. Fiyat eskiyse tarih ve "güncel olmayabilir" notu gösterilir.
  - Sayfanın sonunda `DISCLAIMER` yer alır.
- Görünüm, ui-ux-pro-max ve frontend-design becerileriyle tasarlanır. Önce mobil, 390 px genişlik.

- [ ] **Step 1: Failing testler yazılır**

```ts
test("readNdjson parçalara bölünmüş satırları birleştirir", ...);   // '{"type":"st' + 'age","stage":"okuma"}\n' -> 1 olay
test("qrLink yalnız http(s) bağlantı kabul eder ve alan adını verir", () => {
  expect(qrLink("https://www.ornek.com/r/YAV-1")).toEqual({ url: "https://www.ornek.com/r/YAV-1", domain: "ornek.com" });
  expect(qrLink("javascript:alert(1)")).toBeNull();
});
```

- [ ] **Step 2:** `npx vitest run src/lib/client` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** Yardımcı modüller yazılır, testler geçirilir.
- [ ] **Step 4:** Bileşenler ve sayfa yazılır.
- [ ] **Step 5: Tarayıcı kontrolü.** chrome-devtools MCP kullanılır, `npm run preview` ile, 390×844 ve 1280×800 boyutlarında. Örnek rapor yüklenir. Beklenen:
  - Onay kutuları düğmeyi açıp kapatıyor.
  - İlerleme metinleri görünüyor.
  - Araç kartı sonuçtan önce geliyor.
  - Sıralama ve renkler doğru.
  - QR bağlantısı ve alan adı görünüyor.
  - Sorumluluk notu sayfanın sonunda.
  - Konsolda hata yok, yatay kaydırma yok.
  Ekran görüntüleri kullanıcıya gösterilir.
- [ ] **Step 6:** Commit: `feat: add mobile-first upload, progress and result UI`

### Task 12: Canlı fiyat araması

**Files:**
- Create: `src/lib/claude/prices.ts`
- Modify: `src/lib/pipeline/run.ts` (yorumlamadan sonra, `buildResult`'tan önce), `src/lib/kb/d1.ts` (`price_cache` okuma ve yazma)
- Test: `src/lib/claude/prices.test.ts`, `src/lib/pipeline/run.test.ts` (ek test)

**Interfaces:**
- Consumes: `Interpretation.items[].priceNeed`, `Knowledge`, `ClaudeLike`
- Produces:
  - `lookupPrices(client: ClaudeLike, input: { vehicle: Extraction["vehicle"]; needs: { itemId: string; need: string }[] }, now: Date): Promise<{ prices: (PriceItem & { forItemId: string })[]; usd: number }>`
  - `savePriceCache(db, vehicleId, prices)`. `loadKnowledge` önbellekteki 90 günden yeni fiyatları da döndürür.
  - `PipelineDeps` alanına `savePrices: (vehicleId: string | null, prices: PriceItem[]) => Promise<void>` eklenir. Testlerde sahte bir fonksiyon kullanılır.
- Çağrı ayrıntıları:
  - Araçlar: `{ type: "web_search_20260209", name: "web_search", max_uses: 5 }` ve sıkı (`strict: true`) bir özel araç: `fiyatlari_kaydet({ fiyatlar: { itemId, title, minTry, maxTry, partType, laborIncluded, sourceUrl, sourceTitle }[] })`.
  - `tool_choice` `auto` olur. İstem bu aracın çağrılmasını ister.
  - `output_config.format` kullanılmaz, çünkü kaynak gösterme ile uyumsuz.
  - `pause_turn` gelirse istek devam ettirilir.
  - Kaynak bağlantısı olmayan veya `minTry > maxTry` olan satırlar atılır.
  - En fazla 5 ihtiyaç gönderilir. Kalanlar `PRICE_MISSING` olarak kalır.

- [ ] **Step 1: Failing testler yazılır**

```ts
test("kaynaksız ve ters aralıklı fiyatlar atılır", ...);     // sahte yanıt: tool_use fiyatlari_kaydet 3 satır, 1 kaynaksız, 1 min>max -> 1 fiyat
test("en fazla 5 ihtiyaç gönderilir", ...);                  // 7 priceNeed -> istemde 5
test("istek web_search_20260209 max_uses 5 içerir, output_config.format içermez", ...);
test("hat: priceNeed olan madde canlı fiyatla dolar ve harcama eklenir", ...);  // run.test.ts
```

- [ ] **Step 2:** `npx vitest run src/lib/claude/prices.test.ts src/lib/pipeline/run.test.ts` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** `prices.ts`, hat entegrasyonu ve önbellek yazılır.
- [ ] **Step 4:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 5: Canlı deneme.** Örnek raporla çalıştırılır. Beklenen: Lastik ve fren gibi kalemlerde kaynaklı TL aralığı gelir. Toplam harcama rapor başına 0,5 $'ın altında kalır. Değer yazılır.
- [ ] **Step 6:** Commit: `feat: add sourced live price lookup with D1 cache`

### Task 13: Değerlendirme seti

**Files:**
- Create: `scripts/eval.ts`, `src/lib/eval/score.ts`, `eval/labels/bmw-320i-2021.json`, `eval/README.md`
- Test: `src/lib/eval/score.test.ts`

**Interfaces:**
- Consumes: `runAnalysis` (Task 10), `AnalysisResult`
- Produces:
  - `Label = { case: string; vehicle: Partial<Extraction["vehicle"]>; expected: { section: Section; part: string; group: Group }[]; mustBeDikkat: { section: Section; part: string }[] }`
  - `scoreCase(r: AnalysisResult, items: Extraction["items"], l: Label): { vehicleFieldsCorrect: number; vehicleFieldsTotal: number; groupAccuracy: number; dikkatShownBelow: string[] }`
  - `scripts/eval.ts --cases ~/ekspertiz-eval`: Her `<case>/` klasörü için hattı çalıştırır. Etiketi `eval/labels/<case>.json` dosyasından okur. Bir tablo ve toplam harcamayı yazar. Herhangi bir `dikkatShownBelow` boş değilse çıkış kodu 1 olur.

- [ ] **Step 1: Failing test yazılır**

```ts
test("dikkat olması gereken madde normal gösterilirse yakalanır", ...); // mustBeDikkat Ön Panel, sonuç normal -> dikkatShownBelow ["sasi/Ön Panel"]
test("grup doğruluğu oranı", ...);                                     // 4 beklenenden 3'ü doğru -> 0.75
```

- [ ] **Step 2:** `npx vitest run src/lib/eval` çalıştırılır. Beklenen: FAIL.
- [ ] **Step 3:** `score.ts` ve `eval.ts` yazılır. Örnek rapor fotoğrafları `~/ekspertiz-eval/bmw-320i-2021/` klasörüne kopyalanır (depo dışında). `eval/labels/bmw-320i-2021.json` için Claude bir öneri hazırlar, kullanıcı düzeltip onaylar (spesifikasyon §15). `mustBeDikkat` en az "Ön Panel" ve "Sol Üst Frangart"ı içerir.
- [ ] **Step 4:** Testler çalıştırılır. Beklenen: PASS.
- [ ] **Step 5:** `npx tsx scripts/eval.ts --cases ~/ekspertiz-eval` çalıştırılır. Beklenen: Çıkış kodu 0. Tablo ve harcama kullanıcıya gösterilir.
- [ ] **Step 6:** Commit: `feat: add eval runner with dikkat-below-floor gate`

### Task 14: Yayına alma ve erişim kısıtı

**Files:**
- Modify: `wrangler.jsonc` (`d1_databases` bağlaması `DB`, `ekspertiz-kb`), `package.json` (`kb:seed` betiği)
- Create: `docs/deploy.md`

**Interfaces:**
- Consumes: hepsi.

- [ ] **Step 1:** `npx wrangler d1 create ekspertiz-kb` çalıştırılır ve kimlik `wrangler.jsonc`'e yazılır. Ardından `npx wrangler d1 migrations apply ekspertiz-kb --remote` çalıştırılır. Son olarak `npm run kb:seed` çalıştırılır: önce `build-kb-sql`, sonra `wrangler d1 execute ekspertiz-kb --remote --file kb/seed.sql`.
- [ ] **Step 2 (kullanıcı adımı):** Kullanıcı şu iki komutu kendisi çalıştırır: `! npx wrangler secret put ANTHROPIC_API_KEY` ve `! npx wrangler secret put EXTRACTION_HMAC_SECRET`. İkincisi için `openssl rand -hex 32` ile üretilmiş değer kullanılır.
- [ ] **Step 3:** `npm run deploy` çalıştırılır. Ardından cloudflare MCP ile yapı ve hata kayıtları okunur. Beklenen: Worker yayında, hata yok.
- [ ] **Step 4:** Worker'ın workers.dev adresi için Cloudflare Access açılır. Politika yalnızca kullanıcının e-posta adresine izin verir. Yöntem Cloudflare belgesinden ve MCP'den kontrol edilir. Panel gerekiyorsa adımlar kullanıcıya verilir.
- [ ] **Step 5: Doğrulama.**
  - Giriş yapmadan `curl -sI https://<worker>.workers.dev/` isteği gönderilir. Beklenen: Access giriş yönlendirmesi, 302 ile `cloudflareaccess.com`'a.
  - Kullanıcı telefonundan örnek raporu yükler. Beklenen: Sonuç ekranı Task 11'deki gibi görünür.
  - D1'de `daily_spend` satırı artar.
- [ ] **Step 6:** `docs/deploy.md` yazılır: D1, gizli değişkenler, Access ve bilgi tabanı güncelleme adımları. Commit: `chore: deploy to Cloudflare Workers behind Access`
