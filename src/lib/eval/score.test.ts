import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { normalizePartName } from "@/lib/normalize";
import type { Extraction } from "@/lib/schema/extraction";
import type { Group } from "@/lib/schema/interpretation";
import type { AnalysisResult } from "@/lib/schema/result";
import { parseLabel, scoreCase, type Label } from "./score";

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

test("aynı bölüm/parça adıyla birden çok madde: en düşük grup sayılır (ilki değil)", () => {
  const dup = [item("d1", "ic_dis_donanim", "Lastik Durum"), item("d2", "ic_dis_donanim", "lastik  durum")];
  const must = label({ mustBeDikkat: [{ section: "ic_dis_donanim", part: "Lastik Durum" }] });
  // İlk eşleşme dikkat, ikincisi normal: dikkat altında gösterilen sayılır.
  expect(scoreCase(result({ d1: "dikkat", d2: "normal" }), dup, must).dikkatShownBelow).toEqual(["ic_dis_donanim/Lastik Durum"]);
  expect(scoreCase(result({ d1: "dikkat", d2: "dikkat" }), dup, must).dikkatShownBelow).toEqual([]);
  // Grup doğruluğunda da en düşük grup kullanılır.
  const exp = label({ expected: [{ section: "ic_dis_donanim", part: "Lastik Durum", group: "dikkat" }] });
  expect(scoreCase(result({ d1: "dikkat", d2: "belirsiz" }), dup, exp).groupAccuracy).toBe(0);
  // Eşleşen maddelerden biri sonuçta yoksa yine "eksik" sayılmaz; olanlar değerlendirilir.
  expect(scoreCase(result({ d2: "dikkat" }), dup, must).dikkatShownBelow).toEqual([]);
});

test("ölçümde aynı test kodu birden çok konumda: test kodu etiketi en düşük grubu alır", () => {
  const ms = ["sol ön", "sağ ön"].map((position, n) => ({
    id: `m${n + 1}`,
    test: "suspansiyon_tutunma" as const,
    position,
    value: 50,
    unit: "%",
    performed: true,
    printedPassMin: 40,
    printedPassMax: null,
  }));
  const s = scoreCase(
    result({ m1: "dikkat", m2: "normal" }),
    [],
    label({ mustBeDikkat: [{ section: "test_hatti", part: "suspansiyon_tutunma" }] }),
    ms,
  );
  expect(s.dikkatShownBelow).toEqual(["test_hatti/suspansiyon_tutunma"]);
});

test("etiket dosyası şemayla doğrulanır", () => {
  const good = { case: "x", vehicle: { brand: "BMW", year: 2021 }, expected: [], mustBeDikkat: [] };
  expect(parseLabel(good)).toEqual(good);
  expect(() => parseLabel({ ...good, expected: [{ section: "sasi", part: "Ön Panel", group: "kirmizi" }] })).toThrow();
  expect(() => parseLabel({ ...good, mustBeDikkat: [{ section: "şasi", part: "Ön Panel" }] })).toThrow();
  expect(() => parseLabel({ ...good, vehicle: { year: "2021" } })).toThrow();
  expect(() => parseLabel({ vehicle: {}, expected: [] })).toThrow();
  expect(() => parseLabel({ ...good, plaka: "34 ABC 123" })).toThrow();
});

test("depodaki tüm etiket dosyaları şemaya uyar ve adları vaka adıyla aynı", () => {
  const dir = join(process.cwd(), "eval", "labels");
  const files = readdirSync(dir).filter((n) => n.endsWith(".json"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const l = parseLabel(JSON.parse(readFileSync(join(dir, f), "utf8")));
    expect(`${l.case}.json`).toBe(f);
  }
});

test("normalizePartName tr-TR küçük harf, kırpma, boşluk sadeleştirme", () => {
  expect(normalizePartName("  Ön   PANEL ")).toBe("ön panel");
  expect(normalizePartName("ISI")).toBe("ısı");
});
