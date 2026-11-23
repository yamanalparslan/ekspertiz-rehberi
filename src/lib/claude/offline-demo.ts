import type { RawExtraction } from "@/lib/schema/extraction";
import type { Interpretation } from "@/lib/schema/interpretation";
import type { ClaudeLike } from "./client";

/**
 * Çevrimdışı demo (yalnız geliştirme): 2021 Kia Picanto Live 1.0 67 AMT (11.426 km)
 * örnek raporu için elle hazırlanmış çıkarım kaydı. Rapor numarası yer tutucudur.
 * Yalnız `NODE_ENV=development` ve `.dev.vars` içinde açıkça `OFFLINE_DEMO=1` varken
 * kullanılır; tanıdığı tek dosya, SHA-256 özeti `OFFLINE_DEMO_PDF_SHA256` ile verilen PDF'tir.
 */
export const PICANTO_RAW_EXTRACTION: RawExtraction = {
  isReport: true,
  notReportReason: null,
  vehicle: {
    brand: "Kia",
    model: "Picanto",
    variant: "Live 1.0 67 AMT (Formda: Picanto 1.1 LX DSL)",
    year: 2021,
    engineCc: 998,
    powerHp: 67,
    fuel: "benzin",
    transmission: "otomatik",
    km: 11426,
  },
  report: {
    firm: "RaporTürk",
    reportNo: "DEMO-0001",
    date: "2023-07-29",
    package: "Gümüş Paket",
    platform: "RaporTürk Dijital Ekspertiz",
    onlineReportQrPresent: true,
  },
  sectionsPresent: [
    "kaporta_boya",
    "sasi",
    "ust_motor",
    "motor_alt_mekanik",
    "ic_dis_donanim",
    "conta_kacak",
    "airbag",
    "obd",
    "km_sorgusu",
    "hasar_sorgusu",
  ],
  items: [
    // Şasi ve İskelet (Sayfa 7, 15, 16, 17)
    { section: "sasi", part: "Sağ Ön Şasi Ucu", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sol Ön Şasi Ucu", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sol Ön - Şasi", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sağ Ön - Şasi", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Arka Sağ Şasi", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Arka Sol Şasi", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sol Ön - Podye Sacı", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sağ Ön - Podye Sacı", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sol Ön - Kule", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sağ Ön - Kule", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Ön Panel", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Arka - İç Panel", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Arka Havuz İçi", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sol Frangart (Sol Üst Direk)", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sağ Frangart (Sağ Üst Direk)", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sol Ön - İç Direk", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sağ Ön İç Direk", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sol Orta İç Direk", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "sasi", part: "Sağ Orta İç Direk", rawStatus: "Orijinal", statusKind: "orijinal", note: null },

    // Airbag (Sayfa 7, 17, 18)
    {
      section: "airbag",
      part: "Airbag (Hava Yastıkları) Usta Kanaati",
      rawStatus: "Airbag paketi müşteri tarafından seçilmedi",
      statusKind: "kontrol_onerilir",
      note: "Airbag kontrol paketi uygulanmadıysa yetkili serviste incelenmesi gereklidir. OBD hava yastığı elektroniğinde arıza kaydı yok, gösterge airbag ışığı yanmıyor.",
    },

    // Kaporta - Boya (Sayfa 14, 15, 16, 17, 18)
    {
      section: "kaporta_boya",
      part: "Sol Arka - Çamurluk",
      rawStatus: "Orijinal, Ezik Mevcut : 70-90 µ (mikron)",
      statusKind: "deforme",
      note: "70-90 µm orijinal boya kalınlığı, panel üzerinde ezik mevcut (karalama kağıdında işaretli).",
    },
    {
      section: "kaporta_boya",
      part: "Sağ Arka Çamurluk",
      rawStatus: "Orijinal, Ezik Mevcut : 70-90 µ (mikron)",
      statusKind: "deforme",
      note: "70-90 µm orijinal boya kalınlığı, panel üzerinde ezik ve çizik mevcut.",
    },
    {
      section: "kaporta_boya",
      part: "Arka Bagaj",
      rawStatus: "Orijinal, Çizik : 70-90 µ (mikron)",
      statusKind: "deforme",
      note: "70-90 µm orijinal boya kalınlığı, bagaj kapağında çizik mevcut.",
    },
    {
      section: "kaporta_boya",
      part: "Sağ Ön Çamurluk",
      rawStatus: "Orijinal, Çizik : 70-90 µ (mikron)",
      statusKind: "deforme",
      note: "70-90 µm orijinal boya kalınlığı, çamurlukta çizik mevcut.",
    },
    {
      section: "kaporta_boya",
      part: "Ön Tampon",
      rawStatus: "Plastik Parça, Çizik",
      statusKind: "deforme",
      note: "Plastik parça üzerinde çizik mevcut.",
    },
    {
      section: "kaporta_boya",
      part: "Arka Tampon",
      rawStatus: "Plastik Parça, Çizik",
      statusKind: "deforme",
      note: "Plastik parça üzerinde çizik mevcut.",
    },
    { section: "kaporta_boya", part: "Ön Kaput", rawStatus: "Orijinal : 70-90 µ (mikron)", statusKind: "orijinal", note: "70-90 µm" },
    { section: "kaporta_boya", part: "Tavan", rawStatus: "Orijinal : 70-90 µ (mikron)", statusKind: "orijinal", note: "70-90 µm" },
    { section: "kaporta_boya", part: "Sol Ön - Çamurluk", rawStatus: "Orijinal : 70-90 µ (mikron)", statusKind: "orijinal", note: "70-90 µm" },
    { section: "kaporta_boya", part: "Sol Ön - Kapı", rawStatus: "Orijinal : 70-90 µ (mikron)", statusKind: "orijinal", note: "70-90 µm" },
    { section: "kaporta_boya", part: "Sol Arka - Kapı", rawStatus: "Orijinal : 70-90 µ (mikron)", statusKind: "orijinal", note: "70-90 µm" },
    { section: "kaporta_boya", part: "Sağ Ön Kapı", rawStatus: "Orijinal : 70-90 µ (mikron)", statusKind: "orijinal", note: "70-90 µm" },
    { section: "kaporta_boya", part: "Sağ Arka - Kapı", rawStatus: "Orijinal : 70-90 µ (mikron)", statusKind: "orijinal", note: "70-90 µm" },
    { section: "kaporta_boya", part: "Sağ Marşbiyel", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "kaporta_boya", part: "Sol Marşbiyel", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "kaporta_boya", part: "Ön - Cam", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "kaporta_boya", part: "Arka Cam", rawStatus: "Orijinal", statusKind: "orijinal", note: null },
    { section: "kaporta_boya", part: "Ön Panjur", rawStatus: "Sorunsuz", statusKind: "saglam", note: null },

    // Alt / Ön / Mekanik (Sayfa 11, 12, 13)
    {
      section: "motor_alt_mekanik",
      part: "Araca Rot-Balans Ayarı ya da Kontrolü Gerekli Mi?",
      rawStatus: "Evet (Gerekli)",
      statusKind: "bakim_onerilir",
      note: "Sayfa 13 alt-ön mekanik kontrolünde rot-balans ayarı veya kontrolü gerekli olarak işaretlenmiş.",
    },
    { section: "motor_alt_mekanik", part: "Debriyaj Balatası ve Kavrama Sistemi Durumu", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Motor Karteri Yağ Sızdırmalığı", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Şanzıman ve Diferansiyel Yağ Sızdırmazlığı", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Ön Krank Keçesi Yağ Sızdırmazlığı", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Arka Krank Keçesi Yağ Sızdırmazlığı", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Ön Fren Balata ve Diskler", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Arka Fren Balataları ve Diskler", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Motor ve Şanzıman Alt Takozları", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Direksiyon Kutusu Yağ Sızdırmazlığı", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Sol/Sağ Ön Amortisör ve Helezon Yayları", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Sol/Sağ Arka Amortisör ve Helezon Yayları", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Sol/Sağ Ön Salıncak Fişeği, Rotil ve Rot Başı", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Ön Aks ve Aks Körükleri", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "motor_alt_mekanik", part: "Egzoz Borusu ve Susturucu Genel Durumu", rawStatus: "İyi", statusKind: "saglam", note: null },

    // Üst Motor & Conta Kaçak (Sayfa 8, 9, 10, 20)
    { section: "ust_motor", part: "Motor Üst Bölge Yağ Sızdırmazlığı", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "ust_motor", part: "Triger Kayışı-Zinciri Ses Durumu", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "ust_motor", part: "V Kayışı Gergi Rulmanı Ses Durumu", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "ust_motor", part: "Klima Kompresörü ve Boruları", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "ust_motor", part: "Radyatör, Soğutma Fanları ve Hortumlar", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "ust_motor", part: "Akü Durumu (%)", rawStatus: "İyi : %80", statusKind: "saglam", note: "%80" },
    { section: "ust_motor", part: "Antifiriz Derecesi", rawStatus: "İyi : -30 °C", statusKind: "saglam", note: "-30 °C" },
    { section: "ust_motor", part: "Fren Hidroliği ve Ana Merkez Sızdırmazlığı", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "conta_kacak", part: "Conta Kaçak Testi", rawStatus: "Sorunsuz (Yapıldı)", statusKind: "saglam", note: "Kimyasal sıvı ile conta kaçak testi satın alınmış ve sorunsuz çıkmıştır." },

    // İç/Dış Donanım (Sayfa 12, 18)
    { section: "ic_dis_donanim", part: "Lastiklerin Genel Durumu", rawStatus: "İyi", statusKind: "saglam", note: null },
    { section: "ic_dis_donanim", part: "Kapı Fitil Lastikleri ve Kapı Gergileri", rawStatus: "İyi", statusKind: "saglam", note: null },
  ],
  measurements: [],
  obd: {
    summary: [
      { system: "airbag", unitName: "Hava Yastığı Elektroniği", hasFault: false },
      { system: "motor", unitName: "Motor Beyin Elektroniği", hasFault: false },
      { system: "fren", unitName: "ABS / ESP / ESR Elektroniği", hasFault: false },
      { system: "klima", unitName: "Klima Elektroniği", hasFault: false },
      { system: "direksiyon", unitName: "Elektrikli Direksiyon", hasFault: false },
      { system: "sanziman", unitName: "Şanzıman Elektroniği", hasFault: false },
      { system: "govde_elektronik", unitName: "Gövde Elektronik / Lastik Basınç", hasFault: false },
    ],
    rawFaults: [],
  },
  kmHistory: [{ date: "2023-07-29", km: 11426 }],
  damageRecords: [],
  expertNotes: [
    "SBM kayıtlarında geçmiş hasarı bulunmamıştır.",
    "Karalama kağıdı notu: Araçta nokta ezik ve çizikler mevcut.",
    "Airbag paketi müşteri tarafından seçilmedi; OBD'de airbag arıza kaydı yok, fiziki kontrol istenirse yetkili serviste incelenmelidir.",
    "Rapor 2. ve 4. sayfalarında model adı 'PICANTO 1.1 LX DSL' (Benzin/Otomatik), 3. ve 5. sayfalarındaki SBM sorgu satırında ise 'KIA PICANTO LIVE 1.0 67 AMT' ve motor numarası 'G3LD...' (1.0 DPI benzinli) olarak geçmektedir.",
  ],
  unreadable: [],
};

/** Demo sonuçlarının özeti bu önekle başlar; arayüz demo sonucunu gerçek analizle karıştırmaz. */
export const DEMO_SUMMARY_PREFIX = "DEMO — ";

export function buildPicantoInterpretation(payloadJson: string): Interpretation {
  const payload = JSON.parse(payloadJson) as {
    items: Array<{ id: string; section: string; part: string; rawStatus: string; statusKind: string; note: string | null }>;
    floors: Record<string, "normal" | "belirsiz" | "kronik" | "dikkat">;
  };

  const items: Interpretation["items"] = payload.items.map((it) => {
    const floor = payload.floors[it.id];
    if (it.section === "airbag") {
      return {
        itemId: it.id,
        group: floor ?? "dikkat",
        title: "Hava Yastıkları (Airbag) Fiziki Kontrolü Yapılmamış",
        meaning: "Müşteri Gümüş Paket kapsamında fiziki airbag söküm paketini seçmemiş; yalnızca OBD üzerinden elektronik kontrol yapılmış ve arıza kaydı görülmemiştir.",
        whyItMatters: "OBD'de arıza olmaması olumlu olsa da dirençle yanıltılmış veya fiziki işlem görmüş hava yastıkları yalnızca torpido/direksiyon fiziki kontrolüyle kesin anlaşılır.",
        askSeller: "Hava yastıklarına veya ön göğüse daha önce herhangi bir işlem yapıldı mı? Yetkili serviste airbag kontrolü yaptırabilir miyiz?",
        priceItemId: null,
        priceNeed: null,
        chronicIssueId: null,
        generalUnverified: false,
      };
    }
    if (it.part.includes("Rot-Balans")) {
      return {
        itemId: it.id,
        group: "dikkat",
        title: "Rot-Balans Ayarı / Kontrolü Gerekli",
        meaning: "Alt-ön mekanik incelemede ön takım elemanları (salıncak, rotil, rot başı, amortisörler) sağlam bulunmuş ancak araca rot-balans ayarı yapılması gerektiği işaretlenmiş.",
        whyItMatters: "Bozuk rot-balans ayarı direksiyonda çekme ve titreme yapar, lastiklerin düzensiz ve erken aşınmasına yol açar.",
        askSeller: "Direksiyonda sağa/sola çekme veya yüksek hızda titreme var mı, yakın zamanda kaldırıma temas oldu mu?",
        priceItemId: "generic-rot-balans-paket",
        priceNeed: null,
        chronicIssueId: null,
        generalUnverified: false,
      };
    }
    if (it.part.includes("Çamurluk") && it.rawStatus.includes("Ezik")) {
      return {
        itemId: it.id,
        group: "belirsiz",
        title: `${it.part} — Orijinal Boya (70-90 µm), Ezik Mevcut`,
        meaning: `Panelde boya veya değişim yok (70-90 mikron fabrika boyası), ancak yüzeyde ezik tespit edilmiş.`,
        whyItMatters: "Boya orijinal olduğu için değer kaybı yaratmamış; ezik boyasız göçük düzeltme (PDR) ile boyanmadan giderilebilir veya lokal işlem gerektirebilir.",
        askSeller: "Çamurluktaki ezik park halinde sürtme kaynaklı mı, boyasız göçük düzeltme (PDR) denendi mi?",
        priceItemId: "generic-boya-lokal",
        priceNeed: null,
        chronicIssueId: null,
        generalUnverified: false,
      };
    }
    return {
      itemId: it.id,
      group: "normal",
      title: `${it.part} (${it.rawStatus})`,
      meaning: `Panelin boyası tamamen orijinal (70-90 mikron) veya plastik tampon parçası; yalnızca yüzeysel çizik mevcut.`,
      whyItMatters: "İkinci el şehir içi araçta tampon ve dış panellerdeki yüzeysel çizikler yapısal bir kusur değildir; pasta-cila veya rötuşla giderilebilir.",
      askSeller: null,
      priceItemId: null,
      priceNeed: null,
      chronicIssueId: null,
      generalUnverified: false,
    };
  });

  return {
    summary:
      DEMO_SUMMARY_PREFIX +
      "2021 model Kia Picanto 1.0 Live 67 AMT (11.426 km) için RaporTürk tarafından 29.07.2023 tarihinde düzenlenen Gümüş Paket raporuna göre aracın tüm şasi, podye, direk ve metal kaporta panelleri orijinal boyalıdır (70-90 µm, değişen veya boyalı parça yoktur) ve SBM geçmiş hasar kaydı bulunmamaktadır. Motor, şanzıman, conta kaçak testi ve OBD elektronik taraması sorunsuzdur. Dikkat edilmesi gereken noktalar: (1) alt mekanikte rot-balans ayarı gerekli görülmüştür, (2) fiziki airbag kontrol paketi seçilmemiştir (OBD'de airbag hatası yoktur), (3) arka çamurluklarda orijinal boya üzerinde noktasal ezikler ve tampon/bagajda yüzeysel çizikler mevcuttur, (4) rapor tarihi Temmuz 2023 olduğu için güncel ekspertizle teyit edilmelidir.",
    items,
    checkList: [
      {
        title: "Soğuk çalıştırmada triger zinciri sesi kontrolü",
        why: "Kia Picanto 1.0 MPI motorda triger zinciri ve gergisinin aşınması listeleniyor; motor soğukken çalıştırılıp ilk saniyelerden sonra süren metalik zincir sesi olup olmadığı dinlenmelidir.",
        chronicIssueId: "picantoja-10mpi-triger-zinciri",
      },
      {
        title: "Motor altında yağ izi kontrolü",
        why: "Motor ve şanzıman birleşim yeri ile karter çevresinde yağ izi olup olmadığına bakılmalıdır.",
        chronicIssueId: "picantoja-10mpi-yag-sizintisi",
      },
      {
        title: "Kısa far ayarı kontrolü",
        why: "Araç karanlıkta bir duvara karşı park edilip iki farın kesme çizgisinin aynı yükseklikte olup olmadığına bakılmalıdır.",
        chronicIssueId: "picantoja-far-ayari",
      },
    ],
  };
}

const ZERO_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

type DemoBlock = { type?: string; text?: string; source?: { data?: string } };

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const NOT_DEMO_FILE: RawExtraction = {
  isReport: false,
  notReportReason: "Çevrimdışı demo yalnız tanımlı demo PDF dosyasını tanır.",
  vehicle: {
    brand: null,
    model: null,
    variant: null,
    year: null,
    engineCc: null,
    powerHp: null,
    fuel: null,
    transmission: null,
    km: null,
  },
  report: { firm: null, reportNo: null, date: null, package: null, platform: null, onlineReportQrPresent: false },
  sectionsPresent: [],
  items: [],
  measurements: [],
  obd: { summary: [], rawFaults: [] },
  kmHistory: [],
  damageRecords: [],
  expertNotes: [],
  unreadable: [],
};

/**
 * Ağ çağrısı yapmayan sahte istemci. Okuma adımında yalnız tek bir PDF yüklendiyse ve
 * baytlarının SHA-256 özeti `fixtureSha256` listesindeyse örnek çıkarımı döndürür;
 * başka her dosyada `isReport: false` döner. Harcama her zaman 0'dır.
 */
export function createOfflineDemoClient(opts: { fixtureSha256: string[] }): ClaudeLike {
  const known = new Set(opts.fixtureSha256.map((h) => h.trim().toLowerCase()).filter(Boolean));
  return {
    beta: {
      messages: {
        stream(params: { messages: Array<{ content: unknown }>; tools?: Array<{ name?: string }> }) {
          return {
            async finalMessage() {
              if ((params.tools ?? []).some((t) => t.name === "fiyatlari_kaydet")) {
                return {
                  stop_reason: "tool_use",
                  usage: ZERO_USAGE,
                  content: [{ type: "tool_use", id: "offline_price_1", name: "fiyatlari_kaydet", input: { fiyatlar: [] } }],
                };
              }
              const content = params.messages[0]?.content;
              const blocks: DemoBlock[] = Array.isArray(content) ? (content as DemoBlock[]) : [];
              const media = blocks.filter((b) => b.type === "document" || b.type === "image");
              if (media.length > 0) {
                let isFixture = false;
                if (media.length === 1 && media[0].type === "document" && known.size > 0) {
                  const hash = await sha256Hex(base64ToBytes(media[0].source?.data ?? ""));
                  isFixture = known.has(hash);
                }
                const raw = isFixture ? PICANTO_RAW_EXTRACTION : NOT_DEMO_FILE;
                return { stop_reason: "end_turn", usage: ZERO_USAGE, content: [{ type: "text", text: JSON.stringify(raw) }] };
              }
              const interp = buildPicantoInterpretation(String(blocks[0]?.text ?? "{}"));
              return { stop_reason: "end_turn", usage: ZERO_USAGE, content: [{ type: "text", text: JSON.stringify(interp) }] };
            },
          };
        },
      },
    },
  } as unknown as ClaudeLike;
}
