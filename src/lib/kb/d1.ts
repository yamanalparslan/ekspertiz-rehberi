import firmsJson from "../../../kb/firms.json";
import {
  FirmsFileSchema,
  GenericPricesFileSchema,
  VehicleKbFileSchema,
  type PriceItem,
  type VehicleKbFile,
} from "@/lib/schema/kb";
import { matchKnowledge, norm, type Knowledge, type KnowledgeQuery } from "./match";

/** Minimal structural subset of Cloudflare's D1Database (prepare/bind/all). */
export type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
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

  return matchKnowledge({ vehicles, generic, firms }, q, now);
}
