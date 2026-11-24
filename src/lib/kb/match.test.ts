import { expect, test } from "vitest";
import egeaJson from "../../../kb/vehicles/fiat-egea-2015.json";
import fiestaJson from "../../../kb/vehicles/ford-fiesta-mk8.json";
import golfJson from "../../../kb/vehicles/volkswagen-golf-7.json";
import accentJson from "../../../kb/vehicles/hyundai-accent-blue.json";
import { matchKnowledge } from "./match";
import { VehicleKbFileSchema, type PriceItem, type Source, type VehicleKbFile } from "@/lib/schema/kb";
import type { Extraction } from "@/lib/schema/extraction";

const src = (domain: string): Source => ({ url: `https://${domain}/a`, title: "t", domain });

const price = (id: string, segment: PriceItem["segment"], asOf: string): PriceItem => ({
  id,
  title: id,
  partType: "belirtilmemis",
  laborIncluded: true,
  minTry: 1000,
  maxTry: 2000,
  segment,
  source: src("fiyat.com"),
  asOf,
});

const bmw: VehicleKbFile = {
  vehicle: {
    id: "bmw-3-serisi-g20",
    brand: "BMW",
    model: "3 Serisi",
    generation: "G20",
    aliases: ["320i", "318i", "320d"],
    yearFrom: 2019,
    yearTo: 2026,
    engines: [
      { code: "B48A16", cc: 1597, fuel: "benzin" },
      { code: "B48B20", cc: 1998, fuel: "benzin" },
    ],
    segment: "e_premium",
  },
  chronicIssues: [
    {
      id: "genel",
      system: "motor",
      title: "Genel sorun",
      description: "d",
      symptoms: [],
      matchKeywords: [],
      obdCodes: [],
      engineCodes: null,
      priceItemId: null,
      sources: [src("a.com"), src("www.b.com")],
      researchedAt: "2026-10-01",
    },
    {
      id: "b48a16-sorunu",
      system: "motor",
      title: "Motora özel",
      description: "d",
      symptoms: [],
      matchKeywords: [],
      obdCodes: [],
      engineCodes: ["B48A16"],
      priceItemId: "p-own",
      sources: [src("a.com")],
      researchedAt: "2026-10-01",
    },
  ],
  priceItems: [price("p-own", null, "2026-10-01")],
};

const generic: PriceItem[] = [
  price("g-null", null, "2026-10-01"),
  price("g-premium", "e_premium", "2026-10-01"),
  price("g-suv", "suv", "2026-10-01"),
  price("g-old", null, "2026-08-01"),
];

const kb = (firms: { name: string; verifyUrl: string; note: string }[] = []) => ({
  vehicles: [bmw],
  generic,
  firms,
});

const vehicle = (o: Partial<Extraction["vehicle"]>): Extraction["vehicle"] => ({
  brand: "bmw",
  model: "320i",
  variant: null,
  year: 2021,
  engineCc: null,
  powerHp: null,
  fuel: null,
  transmission: null,
  km: null,
  ...o,
});

const now = new Date("2026-11-23T12:00:00Z");

test("marka ve modeli büyük/küçük harften bağımsız eşler; yıl aralığı dışını almaz", () => {
  const hit = matchKnowledge(kb(), { vehicle: vehicle({ brand: " BMW ", model: "320İ" }), firm: null }, now);
  expect(hit.vehicleId).toBe("bmw-3-serisi-g20");
  expect(hit.chronicIssues.map((c) => c.id)).toContain("genel");

  const byModel = matchKnowledge(kb(), { vehicle: vehicle({ model: "3  serisi" }), firm: null }, now);
  expect(byModel.vehicleId).toBe("bmw-3-serisi-g20");

  const miss = matchKnowledge(kb(), { vehicle: vehicle({ year: 2017 }), firm: null }, now);
  expect(miss.vehicleId).toBeNull();
  expect(miss.chronicIssues).toEqual([]);
  expect(miss.priceItems.map((p) => p.id)).toEqual(["g-null", "g-old"]);

  const noYear = matchKnowledge(kb(), { vehicle: vehicle({ year: null }), firm: null }, now);
  expect(noYear.vehicleId).toBe("bmw-3-serisi-g20");

  const otherBrand = matchKnowledge(kb(), { vehicle: vehicle({ brand: "audi" }), firm: null }, now);
  expect(otherBrand.vehicleId).toBeNull();
});

test("ASCII büyük harf I (320I, CLIO) noktasız ı'ya düşmeden eşleşir; İ ve firma adı da eşleşir", () => {
  const m = (model: string) =>
    matchKnowledge(kb(), { vehicle: vehicle({ model }), firm: null }, now).vehicleId;
  expect(m("320I")).toBe("bmw-3-serisi-g20");
  expect(m("320İ")).toBe("bmw-3-serisi-g20");
  expect(m("320i")).toBe("bmw-3-serisi-g20");

  const clio = { ...bmw, vehicle: { ...bmw.vehicle, id: "renault-clio", brand: "Renault", model: "Clio", aliases: [] } };
  const k = { vehicles: [clio], generic: [], firms: [] };
  const q = (model: string) => ({ vehicle: vehicle({ brand: "RENAULT", model }), firm: null });
  expect(matchKnowledge(k, q("CLIO"), now).vehicleId).toBe("renault-clio");
  expect(matchKnowledge(k, q("Clio"), now).vehicleId).toBe("renault-clio");
});

test("motor koduna bağlı kronik sorun yalnız o motorda gelir", () => {
  const ids = (cc: number | null) =>
    matchKnowledge(kb(), { vehicle: vehicle({ engineCc: cc }), firm: null }, now).chronicIssues.map((c) => c.id);
  expect(ids(1597)).toContain("b48a16-sorunu");
  expect(ids(1998)).not.toContain("b48a16-sorunu");
  expect(ids(1998)).toContain("genel");
  expect(ids(null)).toContain("b48a16-sorunu");
});

test("fiyatlar: araca özel + segmenti uyan genel; segmenti uymayan gelmez", () => {
  const k = matchKnowledge(kb(), { vehicle: vehicle({}), firm: null }, now);
  expect(k.priceItems.map((p) => p.id)).toEqual(["p-own", "g-null", "g-premium", "g-old"]);
});

test("90 günden eski fiyat stale işaretlenir", () => {
  const k = matchKnowledge(kb(), { vehicle: vehicle({}), firm: null }, now);
  const stale = Object.fromEntries(k.priceItems.map((p) => [p.id, p.stale]));
  expect(stale["g-old"]).toBe(true); // 2026-08-01 -> 114 gün
  expect(stale["g-null"]).toBe(false);
});

test("kronik sorun güveni kaynak alan adlarından gelir", () => {
  const k = matchKnowledge(kb(), { vehicle: vehicle({ engineCc: 1597 }), firm: null }, now);
  const conf = Object.fromEntries(k.chronicIssues.map((c) => [c.id, c.confidence]));
  expect(conf["genel"]).toBe("yuksek");
  expect(conf["b48a16-sorunu"]).toBe("dusuk");
});

test("firma adı eşleşirse doğrulama adresi döner", () => {
  const firms = [{ name: "Otorapor", verifyUrl: "https://otorapor.example/dogrula", note: "" }];
  const q = (firm: string | null) => ({ vehicle: vehicle({}), firm });
  expect(matchKnowledge(kb(firms), q("OTORAPOR"), now).firmVerifyUrl).toBe("https://otorapor.example/dogrula");
  expect(matchKnowledge(kb(firms), q("Otorapor Oto Ekspertiz A.Ş."), now).firmVerifyUrl).toBe(
    "https://otorapor.example/dogrula",
  );
  expect(matchKnowledge(kb(firms), q("Yavuzlar Oto Ekspertiz"), now).firmVerifyUrl).toBeNull();
  expect(matchKnowledge(kb(firms), q(null), now).firmVerifyUrl).toBeNull();
});

test("firma adı 'içerir' eşleşmesi en az 4 karakter ister (kısa parça yanlış eşleşmez)", () => {
  const firms = [
    { name: "Otorapor", verifyUrl: "https://otorapor.example/dogrula", note: "" },
    { name: "TÜV", verifyUrl: "https://tuv.example", note: "" },
  ];
  const q = (firm: string) => ({ vehicle: vehicle({}), firm });
  // Rapordaki kısa/bozuk okuma ("Oto", "A") firma adının içinde geçse de eşleşmez.
  expect(matchKnowledge(kb(firms), q("Oto"), now).firmVerifyUrl).toBeNull();
  expect(matchKnowledge(kb(firms), q("A"), now).firmVerifyUrl).toBeNull();
  // KB'deki kısa ad ("TÜV") uzun firma metninin içinde geçse de eşleşmez; birebir eşleşme geçerli.
  expect(matchKnowledge(kb(firms), q("Satüv Oto Ekspertiz"), now).firmVerifyUrl).toBeNull();
  expect(matchKnowledge(kb(firms), q("tüv"), now).firmVerifyUrl).toBe("https://tuv.example");
  expect(matchKnowledge(kb(firms), q("Otor"), now).firmVerifyUrl).toBe("https://otorapor.example/dogrula");
});

// Gerçek bilgi tabanı dosyalarıyla motor eşleştirme toleransı.
const realKb = {
  vehicles: [egeaJson, fiestaJson, golfJson, accentJson].map((j) => VehicleKbFileSchema.parse(j)),
  generic: [],
  firms: [],
};
const issueIds = (o: Partial<Extraction["vehicle"]>, inferred?: { engineCc?: true; fuel?: true }) =>
  matchKnowledge(realKb, { vehicle: vehicle(o), firm: null, ...(inferred ? { inferred } : {}) }, now).chronicIssues.map(
    (c) => c.id,
  );

test("Fiesta 1.0 EcoBoost: 998 cc (KB 999) EcoBoost sorununu kaybetmez, dizel sorunu gelmez", () => {
  const ids = issueIds({ brand: "Ford", model: "Fiesta", year: 2018, engineCc: 998, fuel: "benzin" });
  expect(ids).toContain("fiesta-mk8-ecoboost-yag-pompasi-kayisi");
  expect(ids).not.toContain("fiesta-mk8-15tdci-egr");
});

test("Egea 1.3 Multijet: 1332 cc (KB 1248) motor adıyla dizel sorunlarını korur", () => {
  const ids = issueIds({ brand: "Fiat", model: "Egea", variant: "1.3 Multijet Urban", year: 2019, engineCc: 1332, fuel: "dizel" });
  expect(ids).toContain("egea-dizel-egr-dpf");
  expect(ids).toContain("egea-13-multijet-turbo-hortumu");
  expect(ids).not.toContain("egea-14-fire-yag-eksiltme");
  // Motor bilgisi model adında (KB takma adı "Egea 1.3" değil, "Egea 1.3 Multijet"): yine korunur.
  expect(issueIds({ brand: "Fiat", model: "Egea", variant: "Egea 1.3 Multijet", year: 2019, engineCc: 1332, fuel: "dizel" })).toContain(
    "egea-dizel-egr-dpf",
  );
});

test("Egea 1.6 E-torQ benzinli: 1598 cc dizel 1.6 Multijet ile aynı olsa da dizel EGR/DPF sorunu gelmez", () => {
  const ids = issueIds({ brand: "Fiat", model: "Egea", variant: "1.6 E-torQ Easy", year: 2018, engineCc: 1598, fuel: "benzin" });
  expect(ids).not.toContain("egea-dizel-egr-dpf");
  expect(ids).not.toContain("egea-13-multijet-turbo-hortumu");
  expect(ids).toContain("egea-debriyaj");
  // Hacim yok ama basılı yakıt benzin: dizel motor sorunları yine gelmez.
  expect(issueIds({ brand: "Fiat", model: "Egea", year: 2018, fuel: "benzin" })).not.toContain("egea-dizel-egr-dpf");
});

test("araç metni bir KB motorunu tanımlıyorsa hacim yedeği o motorla sınırlı: yakıt bilinmese de E-torQ dizel sorunu almaz", () => {
  // Yakıt basılı değil (ya da tahmini), hacim 1598: 1.6 Multijet ile aynı hacim.
  const ids = issueIds({ brand: "Fiat", model: "Egea", variant: "1.6 E-torQ Easy", year: 2018, engineCc: 1598, fuel: null });
  expect(ids).not.toContain("egea-dizel-egr-dpf");
  expect(ids).not.toContain("egea-13-multijet-turbo-hortumu");
  expect(ids).toContain("egea-debriyaj");
  const inferredFuel = issueIds(
    { brand: "Fiat", model: "Egea", variant: "1.6 E-torQ", year: 2018, engineCc: 1598, fuel: "dizel" },
    { fuel: true },
  );
  expect(inferredFuel).not.toContain("egea-dizel-egr-dpf");
  // Hacim de bilinmiyor: tanımlanan motor yine sınırlar.
  expect(issueIds({ brand: "Fiat", model: "Egea", variant: "1.6 E-torQ", year: 2018 })).not.toContain("egea-dizel-egr-dpf");
  // Tanımlanan motorun kendi sorunu gelir; motor tanımlanmazsa eski davranış (bilinmiyor = dışlama yok).
  expect(issueIds({ brand: "Fiat", model: "Egea", variant: "1.6 Multijet", year: 2018, fuel: null })).toContain("egea-dizel-egr-dpf");
  expect(issueIds({ brand: "Fiat", model: "Egea", year: 2018, engineCc: 1598, fuel: null })).toContain("egea-dizel-egr-dpf");
});

test("Golf 1.4 TSI 1368 cc (KB 1395) ve Accent 1.6 CRDi 1598 cc (KB 1582) ±30 cc toleransla eşleşir", () => {
  const golf = issueIds({ brand: "Volkswagen", model: "Golf", year: 2015, engineCc: 1368, fuel: "benzin" });
  expect(golf).toContain("golf7-tsi-yag-tuketimi");
  expect(golf).not.toContain("golf7-16tdi-devirdaim");
  const accent = issueIds({ brand: "Hyundai", model: "Accent Blue", year: 2014, engineCc: 1598, fuel: "dizel" });
  expect(accent).toContain("accentblue-16crdi-dpf-egr");
  const petrol = issueIds({ brand: "Hyundai", model: "Accent Blue", year: 2014, engineCc: 1396, fuel: "benzin" });
  expect(petrol).not.toContain("accentblue-16crdi-dpf-egr");
});

test("tahmini hacim ve yakıt eşleşmeyi daraltmaz (bilinmiyor sayılır)", () => {
  const base = { brand: "Fiat", model: "Egea", year: 2019, engineCc: 1332, fuel: "benzin" as const };
  // Basılı olsaydı 1332/benzin dizel sorunlarını dışlardı:
  expect(issueIds(base)).not.toContain("egea-dizel-egr-dpf");
  // Tahmini ise dışlamaz:
  const ids = issueIds(base, { engineCc: true, fuel: true });
  expect(ids).toContain("egea-dizel-egr-dpf");
  expect(ids).toContain("egea-14-fire-yag-eksiltme");
});
