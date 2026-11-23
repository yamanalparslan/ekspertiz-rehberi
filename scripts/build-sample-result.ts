// /ornek sayfasındaki örnek sonucu üretir: src/lib/__fixtures__/bmw-320i-2021.result.json
// Kullanım: npm run sample:build
//
// Gerçek hat fonksiyonları çalışır (normalizeExtraction, computeFloors, computeSignals,
// matchKnowledge, buildResult) ve bilgi tabanı diskten (kb/) okunur. Yalnızca yorum
// metinleri elle yazılmıştır; fiyatlar bilgi tabanındaki priceItemId üzerinden gelir.
// Okuma çıktısı, kişisel veri içermeyen BMW örneğinden seçilmiş bir alt kümedir.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { matchKnowledge, type KbData } from "../src/lib/kb/match";
import { normalizeExtraction } from "../src/lib/normalize";
import { buildResult } from "../src/lib/pipeline/result";
import { computeFloors } from "../src/lib/rules/floors";
import { RawExtractionSchema, type RawExtraction } from "../src/lib/schema/extraction";
import type { Interpretation } from "../src/lib/schema/interpretation";
import {
  FirmsFileSchema,
  GenericPricesFileSchema,
  VehicleKbFileSchema,
} from "../src/lib/schema/kb";
import { AnalysisResultSchema } from "../src/lib/schema/result";
import { computeSignals } from "../src/lib/signals/signals";

const root = join(import.meta.dirname, "..");
const fixtures = join(root, "src/lib/__fixtures__");
const NOW = new Date("2026-11-23T15:00:00+03:00");

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

function loadKb(): KbData {
  const dir = join(root, "kb/vehicles");
  return {
    vehicles: readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map((n) => VehicleKbFileSchema.parse(readJson(join(dir, n)))),
    generic: GenericPricesFileSchema.parse(readJson(join(root, "kb/generic-prices.json"))).priceItems,
    firms: FirmsFileSchema.parse(readJson(join(root, "kb/firms.json"))).firms,
  };
}

// Gösterilecek maddeler: [bölüm, parça]. Okuma sırası korunur.
const KEEP_ITEMS: [string, string][] = [
  ["kaporta_boya", "Sol Ön Kapı"],
  ["kaporta_boya", "Sol Arka Çamurluk"],
  ["kaporta_boya", "Tavan"],
  ["kaporta_boya", "Arka Tampon"],
  ["sasi", "Ön Panel"],
  ["sasi", "Sol Üst Frangart"],
  ["sasi", "Sol Ön Direk"],
  ["ust_motor", "Akü"],
  ["motor_alt_mekanik", "Fren Disk (Arka)"],
  ["motor_alt_mekanik", "Yağ Filtresi ve Soğutucusu"],
  ["ic_dis_donanim", "Lastik (Ön) Durum - Tarih"],
  ["ic_dis_donanim", "Klima ve Kalorifer Sistemi"],
];
const KEEP_TESTS = new Set(["fren_sapma_on", "dinamometre_guc"]);
const KEEP_FAULTS = new Set(["801127"]);

function trim(raw: RawExtraction): RawExtraction {
  const items = raw.items.filter((i) => KEEP_ITEMS.some(([s, p]) => i.section === s && i.part === p));
  if (items.length !== KEEP_ITEMS.length) throw new Error("örnek madde bulunamadı");
  return {
    ...raw,
    items,
    measurements: raw.measurements.filter((m) => KEEP_TESTS.has(m.test)),
    obd: { summary: raw.obd.summary, rawFaults: raw.obd.rawFaults.filter((f) => KEEP_FAULTS.has(f.code)) },
  };
}

type Entry = Omit<Interpretation["items"][number], "itemId">;
const entry = (e: Partial<Entry> & Pick<Entry, "group" | "title" | "meaning" | "whyItMatters">): Entry => ({
  askSeller: null,
  priceItemId: null,
  priceNeed: null,
  chronicIssueId: null,
  generalUnverified: false,
  ...e,
});

// Anahtar: madde parçası, ölçüm testi veya arıza kodu.
const TEXTS: Record<string, Entry> = {
  "Sol Ön Kapı": entry({
    group: "normal",
    title: "Sol ön kapı: orijinal",
    meaning: "Kapıda boya veya değişim izi bulunmamış.",
    whyItMatters: "Fabrika çıkışı parça; ek bir işlem gerekmiyor.",
  }),
  "Sol Arka Çamurluk": entry({
    group: "dikkat",
    title: "Sol arka çamurluk: tadilat boyalı",
    meaning:
      "Çamurluk düzeltilip boyanmış. Boya kalınlığı 750 mikronun üzerinde ölçülmüş; bu kalınlık genellikle macunlu onarıma işaret eder.",
    whyItMatters:
      "Arka çamurluk gövdeye kaynaklı bir parçadır. Kalın boya bu bölgenin darbe alıp onarıldığını gösterir. Onarımın kalitesi ve alttaki sacın durumu rapordan anlaşılmaz.",
    askSeller: "Sol arka çamurluk hangi hasardan sonra, nerede onarıldı? Onarımın faturası veya fotoğrafı var mı?",
  }),
  Tavan: entry({
    group: "normal",
    title: "Tavan: orijinal",
    meaning: "Tavanda boya veya değişim izi bulunmamış.",
    whyItMatters: "Tavanda işlem olsaydı devrilme gibi ağır bir hasarı düşündürebilirdi; burada böyle bir iz yok.",
  }),
  "Arka Tampon": entry({
    group: "normal",
    title: "Arka tampon: lokal boyalı",
    meaning: "Tamponun küçük bir bölgesine boya yapılmış.",
    whyItMatters:
      "Plastik tamponlarda park sıyrıkları için sık yapılan bir işlemdir; aracın taşıyıcı yapısını etkilemez.",
  }),
  "Ön Panel": entry({
    group: "dikkat",
    title: "Ön panel: değişen",
    meaning: "Farların ve radyatörün bağlandığı ön panel yenisiyle değiştirilmiş.",
    whyItMatters:
      "Ön panel çoğunlukla önden alınan bir darbeden sonra değiştirilir. Değişimin ve çevresindeki onarımın nasıl yapıldığı rapordan anlaşılmaz.",
    askSeller: "Ön panel neden değişti? Aynı hasarda başka hangi parçalar onarıldı?",
  }),
  "Sol Üst Frangart": entry({
    group: "dikkat",
    title: "Sol üst frangart: lokal boyalı",
    meaning: "Motor bölmesinin yanındaki taşıyıcı sacın (frangart) bir bölümü boyanmış.",
    whyItMatters:
      "Frangart aracın iskeletinin bir parçasıdır. Bu bölgedeki boya, önden gelen bir darbeden sonra onarım yapıldığını gösterebilir.",
    askSeller: "Sol üst frangarttaki boya hangi onarımdan kaldı? Sacta düzeltme yapıldı mı?",
  }),
  "Sol Ön Direk": entry({
    group: "normal",
    title: "Sol ön direk: orijinal",
    meaning: "Ön camın yanındaki taşıyıcı direkte boya veya değişim izi yok.",
    whyItMatters: "Direkler çarpışma güvenliği için önemli parçalardır; burada işlem görülmemiş.",
  }),
  Akü: entry({
    group: "belirsiz",
    title: "Akü: zayıf",
    meaning: "Raporda akünün zayıf olduğu yazıyor ama ölçüm değeri verilmemiş.",
    whyItMatters:
      "Zayıf akü özellikle soğuk havada çalıştırma sorunu yapabilir. Ne kadar zayıf olduğu ancak bir akü testiyle anlaşılır. Bu sınıftaki araçlarda genellikle AGM akü kullanılır.",
    askSeller: "Akü en son ne zaman değişti?",
    priceItemId: "generic-aku-70ah-agm",
    generalUnverified: true,
  }),
  "Fren Disk (Arka)": entry({
    group: "kronik",
    title: "Arka fren diskleri: aşınmış",
    meaning: "Arka fren disklerinde aşınma tespit edilmiş.",
    whyItMatters:
      "Bu modelde arka balata ve disklerin erken aşındığına dair kullanıcı bildirimleri var. Disk ve balata genellikle birlikte değiştirilir.",
    askSeller: "Arka disk ve balatalar en son ne zaman değişti?",
    priceItemId: "bmw-g20-arka-disk-balata-ozel-servis",
    chronicIssueId: "bmw-g20-arka-balata-erken-asinma",
  }),
  "Yağ Filtresi ve Soğutucusu": entry({
    group: "kronik",
    title: "Yağ filtresi ve soğutucusu: hafif terleme",
    meaning: "Yağ filtresi yuvası ve yağ soğutucusu çevresinde hafif yağ izi (terleme) görülmüş.",
    whyItMatters:
      "Bu motor ailesinde (B48) plastik yağ filtresi yuvasının ve contasının zamanla kaçak yaptığı bildiriliyor. Terleme şimdilik hafif olsa da zamanla artabilir.",
    askSeller: "Yağ filtresi yuvası veya contası daha önce değişti mi? Servis kaydı var mı?",
    chronicIssueId: "bmw-g20-yag-filtre-yuvasi-kacagi",
  }),
  "Lastik (Ön) Durum - Tarih": entry({
    group: "dikkat",
    title: "Ön lastikler: değişim gerekli (2020 üretimi)",
    meaning: "Ön lastikler 2020 üretimi ve raporda değişim gerekli yazıyor.",
    whyItMatters:
      "Eski veya aşınmış lastik fren mesafesini uzatır ve ıslak zeminde yol tutuşunu azaltır. Bu bir güvenlik konusudur.",
    askSeller: "Lastikler satıştan önce değiştirilecek mi?",
    priceItemId: "generic-lastik-4lu-e_premium",
  }),
  "Klima ve Kalorifer Sistemi": entry({
    group: "normal",
    title: "Klima ve kalorifer: çalışıyor",
    meaning: "Klima ve kalorifer kontrol sırasında çalışmış.",
    whyItMatters: "Anlık kontrolde sorun görülmemiş.",
  }),
  fren_sapma_on: entry({
    group: "normal",
    title: "Ön fren dengesi: %8 fark",
    meaning:
      "Sol ve sağ ön tekerleğin fren gücü arasındaki fark %8 ölçülmüş. Raporda basılı sınır %30.",
    whyItMatters: "Fark sınırın çok altında; frenlemede aracın bir yana çekmesi beklenmez.",
  }),
  dinamometre_guc: entry({
    group: "belirsiz",
    title: "Motor gücü (dinamometre): test yapılmamış",
    meaning:
      "Dinamometre sonucu 0 HP görünüyor. Bu, testin yapılmadığı anlamına gelir; motor gücünün sıfır olduğu anlamına gelmez.",
    whyItMatters: "Motor gücü hakkında rapordan bilgi edinilemiyor.",
    askSeller: "Güç testi yaptırmak mümkün mü?",
  }),
  "801127": entry({
    group: "belirsiz",
    title: "Klima klapesi motoru arıza kaydı (801127)",
    meaning:
      "Klima kontrol ünitesinde, arka karıştırma klapesi motorunun bloke olduğuna dair aralıklı bir arıza kaydı var.",
    whyItMatters:
      "Aralıklı kayıt geçmişte oluşmuş olabilir ve şu an sorun olmayabilir. Raporun özet sayfasında klima arızasız görünüyor; kaydın servis cihazıyla kontrol edilmesi gerekir.",
  }),
};

const raw = RawExtractionSchema.parse(readJson(join(fixtures, "bmw-320i-2021.extraction.json")));
const { extraction, signals: normSignals } = normalizeExtraction(trim(raw));
const floors = computeFloors(extraction);
const knowledge = matchKnowledge(loadKb(), { vehicle: extraction.vehicle, firm: extraction.report.firm }, NOW);

const keys: [string, string][] = [
  ...extraction.items.map((i): [string, string] => [i.id, i.part]),
  ...extraction.measurements.map((m): [string, string] => [m.id, m.test]),
  ...extraction.obd.rawFaults.map((f): [string, string] => [f.id, f.code]),
];
const interpretation: Interpretation = {
  summary:
    "Raporda dört madde dikkat istiyor: ön panel değişmiş, sol üst frangart ve sol arka çamurlukta onarım izi var, ön lastiklerin değişmesi gerekiyor. Yağ filtresi çevresindeki terleme ve aşınmış arka fren diskleri bu model için bilinen sorunlarla örtüşüyor. Dinamometre testi yapılmamış. Dikkat maddelerini satın alma kararından önce bir ustaya gösterin.",
  items: keys.map(([itemId, key]) => {
    const text = TEXTS[key];
    if (!text) throw new Error(`örnek yorum eksik: ${key}`);
    return { itemId, ...text };
  }),
  checkList: [
    {
      title: "Su pompası çevresinde sızıntı ve soğutma sıvısı seviyesi",
      why: "Bu motorda su pompası arızası bildirildiğine dair tek bir kaynak var. Raporda bu konuda bir bulgu yok.",
      chronicIssueId: "bmw-g20-su-pompasi",
    },
  ],
};

const signals = [...computeSignals(extraction, { now: NOW }), ...normSignals];
const result = AnalysisResultSchema.parse(
  buildResult({ extraction, interpretation, knowledge, floors, signals }),
);

const out = join(fixtures, "bmw-320i-2021.result.json");
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(`örnek sonuç yazıldı: ${result.items.length} madde, ${JSON.stringify(result.counts)}`);
