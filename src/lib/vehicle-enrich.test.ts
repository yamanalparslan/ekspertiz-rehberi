import { expect, test } from "vitest";
import { EXTRACTION_SYSTEM } from "@/lib/claude/prompts";
import { coerceGeminiJson } from "@/lib/claude/gemini-coerce";
import { normalizeExtraction } from "@/lib/normalize";
import { RawExtractionSchema, type RawExtraction } from "@/lib/schema/extraction";
import { enrichVehicle } from "./vehicle-enrich";

type V = RawExtraction["vehicle"];
const v = (o: Partial<V>): V => ({
  brand: "Fiat",
  model: "Egea",
  variant: null,
  year: 2019,
  engineCc: null,
  powerHp: null,
  fuel: null,
  transmission: null,
  km: null,
  ...o,
});

test("varyanttaki hacim ve yakıt ipucu tahmini olarak işaretlenir", () => {
  const r = enrichVehicle(v({ variant: "1.3 Multijet Urban" }));
  expect(r.vehicle.engineCc).toBe(1332);
  expect(r.vehicle.fuel).toBe("dizel");
  expect(r.inferred).toEqual({ engineCc: true, fuel: true });
});

test("raporda basılı değerler asla değiştirilmez ve tahmini sayılmaz; model değişmez", () => {
  const r = enrichVehicle(
    v({ model: "PICANTO 1.1 LX DSL", variant: "1.3 Multijet 95 HP", engineCc: 1248, fuel: "benzin", powerHp: 90 }),
  );
  expect(r.vehicle).toMatchObject({ model: "PICANTO 1.1 LX DSL", engineCc: 1248, fuel: "benzin", powerHp: 90 });
  expect(r.inferred).toEqual({});
});

test("kW yalnız birim açıkça yazıyorsa HP'ye çevrilir (x1.36); birimsiz sayıdan güç çıkarılmaz", () => {
  expect(enrichVehicle(v({ variant: "1.0 TSI 81 kW" })).vehicle.powerHp).toBe(110);
  expect(enrichVehicle(v({ variant: "1.6 TDI 120 PS" })).vehicle.powerHp).toBe(120);
  expect(enrichVehicle(v({ variant: "1.6 TDI 120 BG" })).vehicle.powerHp).toBe(120);
  const amt = enrichVehicle(v({ brand: "Kia", model: "Picanto", variant: "Live 1.0 67 AMT" }));
  expect(amt.vehicle.powerHp).toBeNull();
  expect(amt.inferred.powerHp).toBeUndefined();
  expect(enrichVehicle(v({ variant: "1.4 TSI 125 tsi" })).vehicle.powerHp).toBeNull();
});

test("çelişen yakıt ipuçlarında yakıt tahmin edilmez; elektrikli araca hacim yazılmaz", () => {
  expect(enrichVehicle(v({ variant: "1.6 TDI TSI" })).vehicle.fuel).toBeNull();
  const ev = enrichVehicle(v({ brand: "Togg", model: "T10X", variant: "V2 RWD 1.0", fuel: "elektrik" }));
  expect(ev.vehicle.engineCc).toBeNull();
});

test("ekspertiz notları teknik veri kaynağı değildir (lastik 1.6 mm motor hacmi olmaz)", () => {
  const raw = RawExtractionSchema.parse({
    isReport: true,
    notReportReason: null,
    vehicle: v({ variant: null }),
    report: { firm: null, reportNo: null, date: null, package: null, platform: null, onlineReportQrPresent: false },
    sectionsPresent: [],
    items: [],
    measurements: [],
    obd: { summary: [], rawFaults: [] },
    kmHistory: [],
    damageRecords: [],
    expertNotes: ["Lastik diş derinliği 1.6 mm", "Motor 1.4 TSI 92 kW değil"],
    unreadable: [],
  });
  const { extraction } = normalizeExtraction(raw);
  expect(extraction.vehicle.engineCc).toBeNull();
  expect(extraction.vehicle.powerHp).toBeNull();
  expect(extraction.vehicleInferred).toBeUndefined();
});

test("normalizeExtraction tahmini alanları vehicleInferred ile taşır", () => {
  const raw = RawExtractionSchema.parse({
    isReport: true,
    notReportReason: null,
    vehicle: v({ variant: "1.3 Multijet" }),
    report: { firm: null, reportNo: null, date: null, package: null, platform: null, onlineReportQrPresent: false },
    sectionsPresent: [],
    items: [],
    measurements: [],
    obd: { summary: [], rawFaults: [] },
    kmHistory: [],
    damageRecords: [],
    expertNotes: [],
    unreadable: [],
  });
  const { extraction } = normalizeExtraction(raw);
  expect(extraction.vehicle.engineCc).toBe(1332);
  expect(extraction.vehicleInferred).toEqual({ engineCc: true, fuel: true });
});

test("Gemini dönüştürücüsü araç bilgisini zenginleştirmez (Picanto özel durumu yok, notlar kullanılmaz)", () => {
  const out = RawExtractionSchema.parse(
    coerceGeminiJson({
      isReport: true,
      vehicle: { brand: "KIA", model: "PICANTO 1.1 LX DSL", variant: null },
      report: {},
      expertNotes: ["SBM: KIA PICANTO LIVE 1.0 67 AMT, motor no G3LD", "Lastik 1.6 mm"],
    }),
  );
  expect(out.vehicle).toMatchObject({
    model: "PICANTO 1.1 LX DSL",
    variant: null,
    engineCc: null,
    powerHp: null,
    fuel: null,
    transmission: null,
  });
});

test("okuma talimatı yalnız basılı değeri ister; fabrika verisi doldurma kuralı yok", () => {
  expect(EXTRACTION_SYSTEM).not.toMatch(/mutlaka doldur/);
  expect(EXTRACTION_SYSTEM).not.toMatch(/B48 320i/);
  expect(EXTRACTION_SYSTEM).toMatch(/yalnızca raporda basılı/i);
});
