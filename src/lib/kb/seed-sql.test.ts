import { expect, test } from "vitest";
import { toSeedSql } from "./seed-sql";
import type { PriceItem, VehicleKbFile } from "@/lib/schema/kb";

const price = (id: string, title: string): PriceItem => ({
  id,
  title,
  partType: "orijinal",
  laborIncluded: false,
  minTry: 1,
  maxTry: 2,
  segment: null,
  source: { url: "https://a.com", title: "t", domain: "a.com" },
  asOf: "2026-11-01",
});

const vehicle = (id: string, brand: string, description: string): VehicleKbFile => ({
  vehicle: {
    id, brand, model: "M", generation: "G", aliases: [], yearFrom: 2019, yearTo: 2026,
    engines: [], segment: "c",
  },
  chronicIssues: [
    {
      id: "x", system: "motor", title: "t", description, symptoms: [], matchKeywords: [],
      obdCodes: [], engineCodes: null, priceItemId: null, sources: [], researchedAt: "2026-11-01",
    },
  ],
  priceItems: [],
});

test("tek tırnak iki katına çıkarılır ve JSON geri okunabilir", () => {
  const sql = toSeedSql([vehicle("bmw-x", "BMW", "BMW'nin motoru")], { priceItems: [] });
  expect(sql).toContain("BMW''nin motoru");
  const m = sql.match(
    /INSERT OR REPLACE INTO vehicle_kb \(id, brand, json\) VALUES \('([^']*)', '([^']*)', '((?:[^']|'')*)'\);/,
  );
  expect(m).not.toBeNull();
  expect(m![1]).toBe("bmw-x");
  const json = JSON.parse(m![3].replace(/''/g, "'"));
  expect(json.chronicIssues[0].description).toBe("BMW'nin motoru");
});

test("marka normalize edilir (tr-TR küçük harf, ı -> i)", () => {
  const sql = toSeedSql([vehicle("a", "CIVIC İŞ", "d")], { priceItems: [] });
  expect(sql).toContain("VALUES ('a', 'civic iş',");
});

test("her araç ve her genel fiyat için bir ifade; tablolar önce silinir; harcama tablolarına dokunulmaz", () => {
  const sql = toSeedSql(
    [vehicle("a", "A", "d"), vehicle("b", "B", "d")],
    { priceItems: [price("g1", "Ö'rnek"), price("g2", "y"), price("g3", "z")] },
  );
  expect(sql.match(/INSERT OR REPLACE INTO vehicle_kb/g)).toHaveLength(2);
  expect(sql.match(/INSERT OR REPLACE INTO generic_prices/g)).toHaveLength(3);
  expect(sql).toContain("DELETE FROM vehicle_kb;");
  expect(sql).toContain("DELETE FROM generic_prices;");
  expect(sql).not.toMatch(/daily_spend|price_cache/);
});

test("boş girdi geçerli bir tohum üretir", () => {
  const sql = toSeedSql([], { priceItems: [] });
  expect(sql).toContain("DELETE FROM vehicle_kb;");
  expect(sql).not.toContain("INSERT");
});
