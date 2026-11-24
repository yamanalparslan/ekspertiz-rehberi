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

test("loadKnowledge: önbellek satırının bayatlığı isStale ile hesaplanır (zorla false değil)", async () => {
  // SQL sınırı gün/saat dilimi farkıyla 90 günü aşan ya da tarihi bozuk bir satır döndürebilir.
  const old = { ...price, id: "live-old", asOf: "2026-08-01" };
  const bad = { ...price, id: "live-bad", asOf: "dün" };
  const { db } = fakeDb([{ json: JSON.stringify(price) }, { json: JSON.stringify(old) }, { json: JSON.stringify(bad) }]);
  const k = await loadKnowledge(db, { vehicle: { brand: "BMW", model: "320i" } as never, firm: null }, NOW);
  const stale = (id: string) => k.priceItems.find((p) => p.id === id)?.stale;
  expect(stale(price.id)).toBe(false);
  expect(stale("live-old")).toBe(true);
  expect(stale("live-bad")).toBe(true);
});

test("loadKnowledge: marka yoksa önbellek sorgulanmaz", async () => {
  const { db, log } = fakeDb([]);
  await loadKnowledge(db, { vehicle: { brand: null, model: null } as never, firm: null }, NOW);
  expect(log.some((l) => l.sql.includes("price_cache"))).toBe(false);
});

test("savePriceCache: iki araç iki ayrı satır; aynı aracın yeniden yazımı yerinde günceller, vehicle_id değişmez", async () => {
  // Bellekte price_cache benzetimi: INSERT ... ON CONFLICT(id) DO UPDATE SET json, as_of.
  const rows = new Map<string, { vehicle_id: string; json: string }>();
  const db: D1Like = {
    prepare: (sql) => ({
      bind: (...a) => ({
        all: async () => ({ results: [] as never[] }),
        run: async () => {
          expect(sql).not.toMatch(/DO UPDATE SET[^;]*vehicle_id/);
          const [id, vid, json] = a as string[];
          const ex = rows.get(id);
          rows.set(id, { vehicle_id: ex ? ex.vehicle_id : vid, json });
          return {};
        },
      }),
    }),
  };
  const bmw = { ...price, id: "live-bmw-320i-x-2026-11-01" };
  const audi = { ...price, id: "live-audi-a3-x-2026-11-01" };
  await savePriceCache(db, "bmw|320i", [bmw]);
  await savePriceCache(db, "audi|a3", [audi]);
  expect(rows.size).toBe(2);
  await savePriceCache(db, "bmw|320i", [{ ...bmw, minTry: 7 }]);
  expect(rows.size).toBe(2);
  expect(JSON.parse(rows.get(bmw.id)!.json).minTry).toBe(7);
  expect(rows.get(bmw.id)!.vehicle_id).toBe("bmw|320i");
  expect(rows.get(audi.id)!.vehicle_id).toBe("audi|a3");
});

test("savePriceCache: upsert, parametreli", async () => {
  const { db, log } = fakeDb([]);
  await savePriceCache(db, "bmw|320i", [price]);
  expect(log).toHaveLength(1);
  expect(log[0].sql).toContain("ON CONFLICT(id)");
  expect(log[0].args).toEqual([price.id, "bmw|320i", JSON.stringify(price), "2026-11-01"]);
});
