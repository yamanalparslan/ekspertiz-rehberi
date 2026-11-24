import { expect, test } from "vitest";
import { d1SpendStore, parseCap } from "./spend";

test("d1SpendStore: get ve upsert ile add", async () => {
  const log: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          log.push({ sql, args });
          return { usd: 1.5 };
        },
        run: async () => {
          log.push({ sql, args });
        },
      }),
    }),
  };
  const s = d1SpendStore(db as never);
  expect(await s.get("2026-11-23")).toBe(1.5);
  await s.add("2026-11-23", 0.25);
  expect(log[1].sql).toContain("ON CONFLICT(day) DO UPDATE SET usd = usd + excluded.usd");
  expect(log[1].args).toEqual(["2026-11-23", 0.25]);
});

test("d1SpendStore: NaN, sonsuz ve negatif tutar yazılmaz (tavanı bozmaz)", async () => {
  const runs: unknown[][] = [];
  const db = {
    prepare: () => ({
      bind: (...args: unknown[]) => ({
        first: async () => null,
        run: async () => {
          runs.push(args);
        },
      }),
    }),
  };
  const s = d1SpendStore(db as never);
  for (const v of [Number.NaN, Number.POSITIVE_INFINITY, -0.5]) await s.add("2026-11-24", v);
  expect(runs).toEqual([]);
  await s.add("2026-11-24", 0.1);
  expect(runs).toEqual([["2026-11-24", 0.1]]);
});

test("d1SpendStore: kayıt yoksa 0", async () => {
  const db = {
    prepare: () => ({ bind: () => ({ first: async () => null, run: async () => {} }) }),
  };
  expect(await d1SpendStore(db as never).get("x")).toBe(0);
});

test("parseCap: eksik veya geçersizse 10", () => {
  expect(parseCap("5")).toBe(5);
  expect(parseCap(undefined)).toBe(10);
  expect(parseCap("abc")).toBe(10);
  expect(parseCap("-1")).toBe(10);
  expect(parseCap("0")).toBe(10);
});
