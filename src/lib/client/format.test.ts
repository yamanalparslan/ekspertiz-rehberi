import { expect, test } from "vitest";
import type { ResultItem, Signal } from "@/lib/schema/result";
import {
  costLine,
  formatDate,
  formatKm,
  formatTry,
  parseWhole,
  signalDetails,
  vehicleTitle,
} from "./format";

type Cost = NonNullable<ResultItem["cost"]>;

const cost = (over: Partial<Cost> = {}): Cost => ({
  minTry: 21379,
  maxTry: 33200,
  partType: "belirtilmemis",
  laborIncluded: false,
  source: { url: "https://ornek.com/fiyat", title: "Fiyat listesi" },
  asOf: "2026-06-16",
  stale: false,
  ...over,
});

test("formatTry Türkçe binlik ayırıcı kullanır", () => {
  expect(formatTry(21379)).toBe("21.379");
  expect(formatTry(800)).toBe("800");
});

test("costLine aralığı, parça tipini ve işçilik durumunu yazar", () => {
  expect(costLine(cost())).toEqual({
    range: "21.379–33.200 TL",
    partType: "parça tipi belirtilmemiş",
    labor: "işçilik hariç",
    asOf: "Fiyat tarihi: 16.06.2026",
    stale: null,
  });
  expect(costLine(cost({ partType: "orijinal", laborIncluded: true })).partType).toBe("orijinal parça");
  expect(costLine(cost({ partType: "orijinal", laborIncluded: true })).labor).toBe("işçilik dahil");
  expect(costLine(cost({ partType: "yan_sanayi" })).partType).toBe("yan sanayi");
  expect(costLine(cost({ partType: "bilinmeyen" })).partType).toBe("parça tipi belirtilmemiş");
  expect(costLine(cost({ laborIncluded: null })).labor).toBe("işçilik bilgisi belirtilmemiş");
});

test("costLine eski fiyatta 'güncel olmayabilir' notu ekler", () => {
  const line = costLine(cost({ stale: true, asOf: "2025-09-21" }));
  expect(line.asOf).toBe("Fiyat tarihi: 21.09.2025");
  expect(line.stale).toBe("güncel olmayabilir");
});

test("costLine eşit uçlarda tek tutar yazar", () => {
  expect(costLine(cost({ minTry: 1500, maxTry: 1500 })).range).toBe("1.500 TL");
});

test("formatDate YYYY-MM-DD'yi GG.AA.YYYY yapar, tanımadığını olduğu gibi bırakır", () => {
  expect(formatDate("2026-11-23")).toBe("23.11.2026");
  expect(formatDate("23/11/2026")).toBe("23/11/2026");
});

test("formatKm ve vehicleTitle", () => {
  expect(formatKm(135689)).toBe("135.689 km");
  const v = {
    brand: "BMW",
    model: "320i",
    variant: null,
    year: 2021,
    engineCc: 1597,
    powerHp: 170,
    fuel: "benzin" as const,
    transmission: "otomatik" as const,
    km: 135689,
  };
  expect(vehicleTitle(v)).toBe("2021 BMW 320i");
  expect(vehicleTitle({ ...v, variant: "M Sport" })).toBe("2021 BMW 320i M Sport");
  expect(
    vehicleTitle({ ...v, brand: null, model: null, variant: null, year: null }),
  ).toBe("Araç bilgisi okunamadı");
});

test("parseWhole tam sayıları okur, noktalı binlik ayırıcıyı kabul eder", () => {
  expect(parseWhole("135.689")).toBe(135689);
  expect(parseWhole(" 2021 ")).toBe(2021);
  expect(parseWhole("")).toBeNull();
  expect(parseWhole("12a")).toBeNull();
  expect(parseWhole("-5")).toBeNull();
});

test("signalDetails kodları Türkçe adlara çevirir", () => {
  const s = (code: Signal["code"], details: string[]): Signal => ({
    code,
    level: "info",
    message: "",
    details,
  });
  expect(signalDetails(s("eksik_bolum", ["ust_motor", "test_hatti"]))).toEqual([
    "Üst motor",
    "Test hattı (fren, süspansiyon, yanal kayma)",
  ]);
  expect(signalDetails(s("obd_ozet_celiski", ["klima"]))).toEqual(["Klima"]);
  expect(signalDetails(s("rapor_eski", ["2026-09-01"]))).toEqual(["Rapor tarihi: 01.09.2026"]);
  expect(signalDetails(s("km_tutarli", []))).toEqual([]);
  expect(signalDetails(s("hasar_parca_uyumlu", ["2023-10-28 — Çarpışma — 32.400,00 TL"]))).toEqual([
    "2023-10-28 — Çarpışma — 32.400,00 TL",
  ]);
  // Bağlantılar ayrı gösterilir, ayrıntı listesine girmez.
  expect(signalDetails(s("firma_dogrulama", ["https://ornek.com/sorgu"]))).toEqual([]);
});
