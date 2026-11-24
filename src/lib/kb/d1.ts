import firmsJson from "../../../kb/firms.json";
import {
  FirmsFileSchema,
  GenericPricesFileSchema,
  PriceItemSchema,
  VehicleKbFileSchema,
  type PriceItem,
  type VehicleKbFile,
} from "@/lib/schema/kb";
import { istanbulDay } from "@/lib/pipeline/spend";
import { isStale, matchKnowledge, norm, priceCacheKey, type Knowledge, type KnowledgeQuery } from "./match";

const CACHE_DAYS = 90;

/** Minimal structural subset of Cloudflare's D1Database (prepare/bind/all). */
export type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
  };
};

const firms = FirmsFileSchema.parse(firmsJson).firms;

export async function loadKnowledge(
  db: D1Like,
  q: KnowledgeQuery,
  now: Date,
): Promise<Knowledge> {
  const brand = q.vehicle.brand === null ? null : norm(q.vehicle.brand);

  let vehicles: VehicleKbFile[] = [];
  if (brand !== null && brand !== "") {
    const rows = await db
      .prepare("SELECT json FROM vehicle_kb WHERE brand = ?")
      .bind(brand)
      .all<{ json: string }>();
    vehicles = rows.results.map((r) => VehicleKbFileSchema.parse(JSON.parse(r.json)));
  }

  const genericRows = await db
    .prepare("SELECT json FROM generic_prices")
    .bind()
    .all<{ json: string }>();
  const generic: PriceItem[] = genericRows.results.map(
    (r) => GenericPricesFileSchema.shape.priceItems.element.parse(JSON.parse(r.json)),
  );

  const knowledge = matchKnowledge({ vehicles, generic, firms }, q, now);

  const key = priceCacheKey(knowledge.vehicleId, q.vehicle);
  if (key === null) return knowledge;
  const cutoff = istanbulDay(new Date(now.getTime() - CACHE_DAYS * 24 * 60 * 60 * 1000));
  const cached = await db
    .prepare("SELECT json FROM price_cache WHERE vehicle_id = ? AND as_of >= ?")
    .bind(key, cutoff)
    .all<{ json: string }>();
  const have = new Set(knowledge.priceItems.map((p) => p.id));
  for (const row of cached.results) {
    let parsed;
    try {
      parsed = PriceItemSchema.safeParse(JSON.parse(row.json));
    } catch {
      continue;
    }
    if (!parsed.success || have.has(parsed.data.id)) continue;
    have.add(parsed.data.id);
    // Bayatlık bilgi tabanıyla aynı kuralla (90 gün, okunamayan tarih bayat) hesaplanır.
    knowledge.priceItems.push({ ...parsed.data, stale: isStale(parsed.data.asOf, now) });
  }
  return knowledge;
}

export async function savePriceCache(db: D1Like, vehicleKey: string, prices: PriceItem[]): Promise<void> {
  for (const p of prices) {
    await db
      .prepare(
        "INSERT INTO price_cache (id, vehicle_id, json, as_of) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, as_of = excluded.as_of",
      )
      .bind(p.id, vehicleKey, JSON.stringify(p), p.asOf)
      .run();
  }
}
