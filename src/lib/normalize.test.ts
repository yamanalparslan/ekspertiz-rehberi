import { expect, test } from "vitest";
import { normalizeExtraction } from "@/lib/normalize";
import { RawExtractionSchema, type RawExtraction } from "@/lib/schema/extraction";
import fixtureJson from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";

const fixture: RawExtraction = RawExtractionSchema.parse(fixtureJson);
const clone = (): RawExtraction => structuredClone(fixture);

test("kimlikler sırayla atanır", () => {
  const { extraction } = normalizeExtraction(fixture);
  expect(extraction.items[0].id).toBe("i1");
  expect(extraction.items[1].id).toBe("i2");
  expect(extraction.measurements[0].id).toBe("m1");
  expect(extraction.obd.rawFaults[0].id).toBe("f1");
  expect(extraction.obd.rawFaults.at(-1)!.id).toBe(`f${fixture.obd.rawFaults.length}`);
});

test("girdi değiştirilmez", () => {
  const before = JSON.stringify(fixture);
  normalizeExtraction(fixture);
  expect(JSON.stringify(fixture)).toBe(before);
});

test("Mor Işık maddesi Kaporta ile aynıysa düşer", () => {
  const { extraction, signals } = normalizeExtraction(fixture);
  expect(extraction.items.filter((i) => i.section === "mor_isik")).toHaveLength(0);
  expect(signals.find((s) => s.code === "mor_isik_celiski")).toBeUndefined();
});

test("Mor Işık durumu farklıysa Kaporta maddesi kalır ve işaret verilir", () => {
  const raw = clone();
  const mor = raw.items.find((i) => i.section === "mor_isik" && i.part === "Motor Kaputu")!;
  mor.statusKind = "orijinal";
  const { extraction, signals } = normalizeExtraction(raw);
  const kaput = extraction.items.find(
    (i) => i.section === "kaporta_boya" && i.part === "Motor Kaputu",
  );
  expect(kaput?.statusKind).toBe("degisen");
  expect(extraction.items.filter((i) => i.section === "mor_isik")).toHaveLength(0);
  const found = signals.filter((s) => s.code === "mor_isik_celiski");
  expect(found).toHaveLength(1);
  expect(found[0].details).toEqual(["Motor Kaputu"]);
  expect(found[0].level).toBe("warn");
});

test("parça adları büyük/küçük harf ve Türkçe karakter farkına rağmen eşleşir", () => {
  const raw = clone();
  raw.items.find((i) => i.section === "mor_isik" && i.part === "Motor Kaputu")!.part =
    "MOTOR KAPUTU";
  const { extraction, signals } = normalizeExtraction(raw);
  expect(extraction.items.filter((i) => i.section === "mor_isik")).toHaveLength(0);
  expect(signals.find((s) => s.code === "mor_isik_celiski")).toBeUndefined();
});

test("Kaporta karşılığı olmayan Mor Işık maddesi korunur", () => {
  const raw = clone();
  raw.items.find((i) => i.section === "mor_isik" && i.part === "Motor Kaputu")!.part =
    "Bagaj Kapağı Ek";
  const { extraction } = normalizeExtraction(raw);
  expect(
    extraction.items.filter((i) => i.section === "mor_isik").map((i) => i.part),
  ).toEqual(["Bagaj Kapağı Ek"]);
});
