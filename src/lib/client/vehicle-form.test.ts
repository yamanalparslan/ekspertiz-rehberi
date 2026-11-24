import { expect, test } from "vitest";
import { MAX_VEHICLE_TEXT, parseCorrectedVehicle } from "@/lib/pipeline/vehicle-input";
import type { Vehicle } from "@/lib/schema/result";
import { MAX_TEXT, maxYear, toDraft, validateDraft, type Draft } from "./vehicle-form";

const NOW = new Date("2026-11-24T12:00:00+03:00");

const base: Vehicle = {
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

const draft = (patch: Partial<Draft>): Draft => ({ ...toDraft(base), ...patch });
const errorsOf = (patch: Partial<Draft>) => {
  const r = validateDraft(draft(patch), NOW);
  return "errors" in r ? r.errors : {};
};
const vehicleOf = (patch: Partial<Draft>) => {
  const r = validateDraft(draft(patch), NOW);
  if (!("vehicle" in r)) throw new Error(JSON.stringify(r.errors));
  return r.vehicle;
};

test("raporlardaki gibi noktalı km kabul edilir: '135.689' -> 135689; birim ve boşluk yok sayılır", () => {
  expect(vehicleOf({ km: "135.689" }).km).toBe(135689);
  expect(vehicleOf({ km: "135 689 km" }).km).toBe(135689);
  expect(vehicleOf({ km: "0" }).km).toBe(0);
  expect(vehicleOf({ km: "" }).km).toBeNull();
});

test("motor hacmine litre yazılırsa 16 cc'ye dönmez, açık bir Türkçe hata verir", () => {
  expect(errorsOf({ engineCc: "1.6" }).engineCc).toBe("Litre değil, cc yazın: 1.6 L yaklaşık 1.600 cc eder.");
  expect(errorsOf({ engineCc: "1,3" }).engineCc).toMatch(/^Litre değil, cc yazın: 1\.3 L/);
  expect(errorsOf({ engineCc: "2.0 L" }).engineCc).toMatch(/^Litre değil/);
  expect(vehicleOf({ engineCc: "1.598" }).engineCc).toBe(1598);
  expect(vehicleOf({ engineCc: "1598 cc" }).engineCc).toBe(1598);
});

test("akla yatkınlık aralıkları: yıl, hacim, güç, km", () => {
  expect(errorsOf({ year: "1949" }).year).toBe("1950 ile 2027 arasında bir yıl yazın.");
  expect(errorsOf({ year: "2028" }).year).toMatch(/arasında/);
  expect(errorsOf({ year: "21" }).year).toMatch(/^Dört haneli/);
  expect(vehicleOf({ year: "2027" }).year).toBe(2027);
  expect(errorsOf({ engineCc: "499" }).engineCc).toBe("500 ile 8.000 cc arasında bir değer yazın.");
  expect(errorsOf({ engineCc: "8001" }).engineCc).toMatch(/arasında/);
  expect(errorsOf({ powerHp: "29" }).powerHp).toBe("30 ile 1.000 HP arasında bir değer yazın.");
  expect(vehicleOf({ powerHp: "170 hp" }).powerHp).toBe(170);
  expect(errorsOf({ km: "2.000.001" }).km).toBe("0 ile 2.000.000 km arasında bir değer yazın.");
  expect(errorsOf({ km: "12a" }).km).toBe("Yalnızca rakam girin.");
  expect(errorsOf({ km: "-5" }).km).toBe("Yalnızca rakam girin.");
});

test("metin alanları kırpılır, boş metin null olur, sınırı aşan metin hata verir", () => {
  expect(vehicleOf({ brand: "  BMW  ", variant: "  " })).toMatchObject({ brand: "BMW", variant: null });
  expect(errorsOf({ model: "x".repeat(MAX_TEXT + 1) }).model).toBe("En fazla 60 karakter yazın.");
});

test("istemcinin kabul ettiği her uç değeri sunucu da kabul eder; reddettiklerini sunucu da reddeder", () => {
  expect(MAX_TEXT).toBe(MAX_VEHICLE_TEXT);
  const accepted: Partial<Draft>[] = [
    { year: "1950" },
    { year: String(maxYear(NOW)) },
    { engineCc: "500" },
    { engineCc: "8000" },
    { powerHp: "30" },
    { powerHp: "1000" },
    { km: "0" },
    { km: "2.000.000" },
    { brand: "x".repeat(MAX_TEXT) },
  ];
  for (const p of accepted) expect(parseCorrectedVehicle(vehicleOf(p), NOW), JSON.stringify(p)).not.toBeNull();
  const rejected: [Partial<Draft>, Partial<Vehicle>][] = [
    [{ year: "1949" }, { year: 1949 }],
    [{ year: String(maxYear(NOW) + 1) }, { year: maxYear(NOW) + 1 }],
    [{ engineCc: "499" }, { engineCc: 499 }],
    [{ engineCc: "8001" }, { engineCc: 8001 }],
    [{ powerHp: "29" }, { powerHp: 29 }],
    [{ powerHp: "1001" }, { powerHp: 1001 }],
    [{ km: "2000001" }, { km: 2_000_001 }],
  ];
  for (const [p, v] of rejected) {
    expect(Object.keys(errorsOf(p)).length, JSON.stringify(p)).toBeGreaterThan(0);
    expect(parseCorrectedVehicle({ ...base, ...v }, NOW), JSON.stringify(v)).toBeNull();
  }
});
