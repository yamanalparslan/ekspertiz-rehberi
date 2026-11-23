import { expect, test } from "vitest";
import { loadKnowledge, savePriceCache, type D1Like } from "./d1";

const NOW = new Date("2026-11-23T10:00:00Z");
const price = {
  id: "live-x-2026-11-01",
  title: "X",
  partType: "belirtilmemis",
  laborIncluded: null,
  minTry: 1,
  maxTry: 2,
  segment: null,
  source: { url: "https://a.com", title: "t", domain: "a.com" },
  asOf: "2026-11-01",
} as const;

function fakeDb(cacheRows: unknown[]) {
  const log: { sql: string; args: unknown[] }[] = [];
  const db: D1Like = {
    prepare: (sql) => ({
      bind: (...args) => {
        log.push({ sql, args });
        return {
          all: async () => ({ results: (sql.includes("price_cache") ? cacheRows : []) as never[] }),
          run: async () => ({}),
        };
      },
    }),
  };
  return { db, log };
}

test("loadKnowledge: price_cache satırları araç anahtarı ve 90 gün sınırıyla, parametreli okunur", async () => {
  const { db, log } = fakeDb([{ json: JSON.stringify(price) }, { json: "bozuk" }]);
  const k = await loadKnowledge(
    db,
    { vehicle: { brand: "BMW", model: "320i" } as never, firm: null },
    NOW,
  );
  const q = log.find((l) => l.sql.includes("price_cache"));
  expect(q?.args).toEqual(["bmw|320i", "2026-08-25"]);
  expect(q?.sql).not.toContain("bmw");
  expect(k.priceItems.find((p) => p.id === price.id)).toMatchObject({ stale: false, minTry: 1 });
});

test("loadKnowledge: marka yoksa önbellek sorgulanmaz", async () => {
  const { db, log } = fakeDb([]);
  await loadKnowledge(db, { vehicle: { brand: null, model: null } as never, firm: null }, NOW);
  expect(log.some((l) => l.sql.includes("price_cache"))).toBe(false);
});

test("savePriceCache: upsert, parametreli", async () => {
  const { db, log } = fakeDb([]);
  await savePriceCache(db, "bmw|320i", [price]);
  expect(log).toHaveLength(1);
  expect(log[0].sql).toContain("ON CONFLICT(id)");
  expect(log[0].args).toEqual([price.id, "bmw|320i", JSON.stringify(price), "2026-11-01"]);
});
