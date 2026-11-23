import { expect, test } from "vitest";
import { z } from "zod";
import fixture from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { RawExtractionSchema } from "@/lib/schema/extraction";

test("örnek rapor fikstürü şemaya uyar", () => {
  const r = RawExtractionSchema.parse(fixture);
  expect(r.vehicle.km).toBe(135689);
  expect(r.obd.rawFaults).toHaveLength(7);
  expect(r.measurements.find((m) => m.test === "dinamometre_guc")?.performed).toBe(false);
});

test("şemada kişisel veri alanı yok", () => {
  const keys = JSON.stringify(z.toJSONSchema(RawExtractionSchema));
  for (const k of ["plate", "plaka", "vin", "sasiNo", "phone", "telefon", "tc", "name"]) {
    expect(keys).not.toContain(`"${k}"`);
  }
});
