import { expect, test } from "vitest";
import { normalizePartName } from "@/lib/normalize";
import type { Extraction } from "@/lib/schema/extraction";
import type { Group } from "@/lib/schema/interpretation";
import type { AnalysisResult } from "@/lib/schema/result";
import { scoreCase, type Label } from "./score";

const VEHICLE: AnalysisResult["vehicle"] = {
  brand: "BMW",
  model: "320i",
  variant: null,
  year: 2021,
  engineCc: 1597,
  powerHp: 170,
  fuel: "benzin",
  transmission: "otomatik",
  km: 135689,
};

function item(id: string, section: Extraction["items"][number]["section"], part: string) {
  return { id, section, part, rawStatus: "x", statusKind: "degisen" as const, note: null };
}

function result(groups: Record<string, Group>, vehicle = VEHICLE): AnalysisResult {
  return {
    vehicle,
    report: { firm: null, reportNo: null, date: null },
    summary: "",
    counts: { normal: 0, belirsiz: 0, kronik: 0, dikkat: 0 },
    items: Object.entries(groups).map(([itemId, group]) => ({
      itemId,
      group,
      floorApplied: false,
      title: itemId,
      meaning: "",
      whyItMatters: "",
      askSeller: null,
      cost: null,
      chronic: null,
      generalUnverified: false,
    })),
    checkList: [],
    signals: [],
  };
}

const ITEMS = [
  item("i1", "sasi", "Ön Panel"),
  item("i2", "kaporta_boya", "Tavan"),
  item("i3", "kaporta_boya", "Arka Tampon"),
  item("i4", "kaporta_boya", "Motor Kaputu"),
];

const label = (over: Partial<Label> = {}): Label => ({
  case: "t",
  vehicle: {},
  expected: [],
  mustBeDikkat: [],
  ...over,
});

test("dikkat olması gereken madde normal gösterilirse yakalanır", () => {
  const s = scoreCase(
    result({ i1: "normal" }),
    ITEMS,
    label({ mustBeDikkat: [{ section: "sasi", part: "Ön Panel" }] }),
  );
  expect(s.dikkatShownBelow).toEqual(["sasi/Ön Panel"]);
});

test("dikkat gösterilen madde yakalanmaz", () => {
  const s = scoreCase(
    result({ i1: "dikkat" }),
    ITEMS,
    label({ mustBeDikkat: [{ section: "sasi", part: "ön  panel " }] }),
  );
  expect(s.dikkatShownBelow).toEqual([]);
});

test("eşleşen madde yoksa eksik: önekiyle bildirilir", () => {
  const s = scoreCase(
    result({}),
    ITEMS,
    label({ mustBeDikkat: [{ section: "sasi", part: "Sol Üst Frangart" }] }),
  );
  expect(s.dikkatShownBelow).toEqual(["eksik: sasi/Sol Üst Frangart"]);
});

test("grup doğruluğu oranı", () => {
  const s = scoreCase(
    result({ i1: "dikkat", i2: "normal", i3: "normal", i4: "normal" }),
    ITEMS,
    label({
      expected: [
        { section: "sasi", part: "Ön Panel", group: "dikkat" },
        { section: "kaporta_boya", part: "Tavan", group: "normal" },
        { section: "kaporta_boya", part: "Arka Tampon", group: "normal" },
        { section: "kaporta_boya", part: "Motor Kaputu", group: "dikkat" },
      ],
    }),
  );
  expect(s.groupAccuracy).toBe(0.75);
});

test("eksik beklenen madde yanlış sayılır", () => {
  const s = scoreCase(
    result({ i2: "normal" }),
    ITEMS,
    label({
      expected: [
        { section: "kaporta_boya", part: "Tavan", group: "normal" },
        { section: "sasi", part: "Yok Panel", group: "normal" },
      ],
    }),
  );
  expect(s.groupAccuracy).toBe(0.5);
});

test("araç alanları yalnızca etikette olanlar için karşılaştırılır", () => {
  const s = scoreCase(
    result({}, { ...VEHICLE, km: 1 }),
    [],
    label({ vehicle: { brand: " bmw", model: "320i", year: 2021, km: 135689 } }),
  );
  expect(s.vehicleFieldsTotal).toBe(4);
  expect(s.vehicleFieldsCorrect).toBe(3);
});

test("ölçümler test_hatti bölümünde test kodu (+ konum) ile eşleşir", () => {
  const measurements = [
    { id: "m1", test: "dinamometre_guc" as const, position: "motor", value: 0, unit: "HP", performed: false, printedPassMin: null, printedPassMax: null },
    { id: "m2", test: "suspansiyon_tutunma" as const, position: "Sol Ön", value: 78, unit: "%", performed: true, printedPassMin: 40, printedPassMax: null },
  ];
  const s = scoreCase(
    result({ m1: "belirsiz", m2: "dikkat" }),
    [],
    label({
      expected: [
        { section: "test_hatti", part: "dinamometre_guc", group: "belirsiz" },
        { section: "test_hatti", part: "suspansiyon_tutunma sol ön", group: "normal" },
      ],
    }),
    measurements,
  );
  expect(s.groupAccuracy).toBe(0.5);
});

test("normalizePartName tr-TR küçük harf, kırpma, boşluk sadeleştirme", () => {
  expect(normalizePartName("  Ön   PANEL ")).toBe("ön panel");
  expect(normalizePartName("ISI")).toBe("ısı");
});
