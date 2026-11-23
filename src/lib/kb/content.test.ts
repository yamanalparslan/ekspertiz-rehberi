import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  FirmsFileSchema,
  GenericPricesFileSchema,
  VehicleKbFileSchema,
  type PriceItem,
  type Source,
} from "@/lib/schema/kb";

const KB_DIR = join(process.cwd(), "kb");
const TODAY = new Date().toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
function vehicleFiles(): string[] {
  return readdirSync(join(KB_DIR, "vehicles")).filter((f) => f.endsWith(".json"));
}
function validDate(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  const t = new Date(d + "T00:00:00Z");
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}
function twelveMonthsAgo(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
function checkSource(owner: string, s: Source) {
  const host = new URL(s.url).hostname.replace(/^www\./, "");
  expect(s.domain, `${owner}: domain must equal hostname of ${s.url}`).toBe(host);
}

const generic = GenericPricesFileSchema.parse(readJson(join(KB_DIR, "generic-prices.json")));
const firms = FirmsFileSchema.parse(readJson(join(KB_DIR, "firms.json")));
const vehicles = vehicleFiles().map((f) => ({
  file: f,
  data: VehicleKbFileSchema.parse(readJson(join(KB_DIR, "vehicles", f))),
}));

function allPriceItems(): PriceItem[] {
  return [...generic.priceItems, ...vehicles.flatMap((v) => v.data.priceItems)];
}

test("kb has content", () => {
  expect(vehicles.length).toBeGreaterThan(0);
  expect(generic.priceItems.length).toBeGreaterThan(0);
  expect(firms.firms.length).toBeGreaterThan(0);
});

test("vehicle file basename equals vehicle.id", () => {
  for (const v of vehicles) expect(v.file.replace(/\.json$/, "")).toBe(v.data.vehicle.id);
});

test("chronic issues: sources, dates, freshness", () => {
  const limit = twelveMonthsAgo();
  for (const { data } of vehicles) {
    for (const c of data.chronicIssues) {
      expect(c.sources.length, `${c.id}: needs at least 1 source`).toBeGreaterThanOrEqual(1);
      c.sources.forEach((s) => checkSource(c.id, s));
      expect(validDate(c.researchedAt), `${c.id}: invalid researchedAt`).toBe(true);
      expect(c.researchedAt <= TODAY, `${c.id}: researchedAt in the future`).toBe(true);
      expect(c.researchedAt >= limit, `${c.id}: researchedAt older than 12 months, re-research`).toBe(true);
    }
  }
});

test("price items: range, source, dates", () => {
  for (const p of allPriceItems()) {
    expect(p.minTry, `${p.id}: minTry must be > 0`).toBeGreaterThan(0);
    expect(p.maxTry, `${p.id}: maxTry must be > 0`).toBeGreaterThan(0);
    expect(p.minTry <= p.maxTry, `${p.id}: minTry > maxTry`).toBe(true);
    checkSource(p.id, p.source);
    expect(validDate(p.asOf), `${p.id}: invalid asOf`).toBe(true);
    expect(p.asOf <= TODAY, `${p.id}: asOf in the future`).toBe(true);
  }
});

test("ids are unique across all files", () => {
  const ids: string[] = [
    ...vehicles.map((v) => v.data.vehicle.id),
    ...vehicles.flatMap((v) => v.data.chronicIssues.map((c) => c.id)),
    ...allPriceItems().map((p) => p.id),
  ];
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(dup, `duplicate ids: ${dup.join(", ")}`).toEqual([]);
});

test("priceItemId resolves in same vehicle file or generic prices", () => {
  const genericIds = new Set(generic.priceItems.map((p) => p.id));
  for (const { data } of vehicles) {
    const own = new Set(data.priceItems.map((p) => p.id));
    for (const c of data.chronicIssues) {
      if (c.priceItemId === null) continue;
      expect(
        own.has(c.priceItemId) || genericIds.has(c.priceItemId),
        `${c.id}: unknown priceItemId ${c.priceItemId}`,
      ).toBe(true);
    }
  }
});
