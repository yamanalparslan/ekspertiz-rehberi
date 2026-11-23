import { expect, test } from "vitest";
import { matchKnowledge } from "./match";
import type { PriceItem, Source, VehicleKbFile } from "@/lib/schema/kb";
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
