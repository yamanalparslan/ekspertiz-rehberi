import { expect, test } from "vitest";
import { normalizeExtraction } from "@/lib/normalize";
import { RawExtractionSchema, type RawExtraction } from "@/lib/schema/extraction";
import fixtureJson from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { computeFloors, mergeGroup } from "@/lib/rules/floors";

const fixture: RawExtraction = RawExtractionSchema.parse(fixtureJson);
const clone = (): RawExtraction => structuredClone(fixture);

const { extraction } = normalizeExtraction(fixture);
const floors = computeFloors(extraction);
const byPart = (p: string) => extraction.items.find((i) => i.part === p)!.id;

test("şasi: değişen ön panel ve boyalı frangart dikkat", () => {
  expect(floors.get(byPart("Ön Panel"))).toBe("dikkat");
  expect(floors.get(byPart("Sol Üst Frangart"))).toBe("dikkat");
  expect(floors.get(byPart("Sol Ön Direk"))).toBeUndefined();
});

test("yapılmamış dinamometre belirsiz", () => {
  const dyno = extraction.measurements.find((m) => m.test === "dinamometre_guc")!;
  expect(dyno.performed).toBe(false);
  expect(floors.get(dyno.id)).toBe("belirsiz");
});

test("fren %8 sınırın altında, kural yok; %31 dikkat", () => {
  const brake = extraction.measurements.find((m) => m.test === "fren_sapma_on")!;
  expect(brake.value).toBe(8);
  expect(floors.get(brake.id)).toBeUndefined();

  const raw = clone();
  raw.measurements.find((m) => m.test === "fren_sapma_on")!.value = 31;
  const n = normalizeExtraction(raw).extraction;
  const id = n.measurements.find((m) => m.test === "fren_sapma_on")!.id;
  expect(computeFloors(n).get(id)).toBe("dikkat");
});

test("basılı sınır varsayılandan önce gelir", () => {
  const raw = clone();
  const m = raw.measurements.find((x) => x.test === "fren_sapma_on")!;
  m.printedPassMax = 20;
  m.value = 25;
  const n = normalizeExtraction(raw).extraction;
  const id = n.measurements.find((x) => x.test === "fren_sapma_on")!.id;
  expect(computeFloors(n).get(id)).toBe("dikkat");
});

test("airbag veya fren sistemindeki ham arıza dikkat", () => {
  const raw = clone();
  raw.obd.rawFaults.push({
    system: "fren",
    unitName: "ABS",
    code: "C0035",
    description: "Tekerlek hız sensörü",
    type: "permanent",
  });
  const n = normalizeExtraction(raw).extraction;
  const id = n.obd.rawFaults.at(-1)!.id;
  expect(computeFloors(n).get(id)).toBe("dikkat");
});

test("mergeGroup kuralın altına inmez", () => {
  expect(mergeGroup("normal", "dikkat")).toBe("dikkat");
  expect(mergeGroup("dikkat", "belirsiz")).toBe("dikkat");
  expect(mergeGroup("kronik", undefined)).toBe("kronik");
});

test("okunamayan ölçüm değeri belirsiz", () => {
  const raw = clone();
  raw.measurements.find((x) => x.test === "fren_sapma_on")!.value = null;
  const n = normalizeExtraction(raw).extraction;
  const id = n.measurements.find((x) => x.test === "fren_sapma_on")!.id;
  expect(computeFloors(n).get(id)).toBe("belirsiz");
});

test("süspansiyon tutunma basılı alt sınırın altında dikkat", () => {
  const raw = clone();
  const m = raw.measurements.find((x) => x.test === "suspansiyon_tutunma")!;
  expect(m.printedPassMin).toBe(40);
  m.value = 39;
  const n = normalizeExtraction(raw).extraction;
  const id = n.measurements.find((x) => x.test === "suspansiyon_tutunma")!.id;
  expect(computeFloors(n).get(id)).toBe("dikkat");
});

test("yanal kayma: varsayılan sınır yoksa kural yok; verilen eşikle mutlak değer", () => {
  const raw = clone();
  raw.measurements.find((x) => x.test === "yanal_kayma_on")!.value = -9;
  const n = normalizeExtraction(raw).extraction;
  const id = n.measurements.find((x) => x.test === "yanal_kayma_on")!.id;
  expect(computeFloors(n).get(id)).toBeUndefined();
  const t = {
    brakeImbalanceMaxPct: { value: 30, source: "x" },
    suspensionGripMinPct: { value: 40, source: "x" },
    sideSlipMaxAbsMPerKm: { value: 5, source: "x" },
  };
  expect(computeFloors(n, t).get(id)).toBe("dikkat");

  const rawPrinted = clone();
  const ym = rawPrinted.measurements.find((x) => x.test === "yanal_kayma_on")!;
  ym.value = -9;
  ym.printedPassMax = 5;
  const np = normalizeExtraction(rawPrinted).extraction;
  const pid = np.measurements.find((x) => x.test === "yanal_kayma_on")!.id;
  expect(computeFloors(np).get(pid)).toBe("dikkat");
});

test("airbag calisiyor kural tetiklemez", () => {
  const raw = clone();
  raw.items.push({
    section: "airbag",
    part: "Sürücü Hava Yastığı",
    rawStatus: "Çalışıyor",
    statusKind: "calisiyor",
    note: null,
  });
  const n = normalizeExtraction(raw).extraction;
  const id = n.items.find((i) => i.part === "Sürücü Hava Yastığı")!.id;
  expect(computeFloors(n).get(id)).toBeUndefined();
});
