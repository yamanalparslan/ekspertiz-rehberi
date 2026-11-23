import type { GenericPricesFile, VehicleKbFile } from "@/lib/schema/kb";

/** SQL string literal: single quotes doubled. */
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Idempotent seed: clears vehicle_kb and generic_prices, then inserts every
 * row. Never touches price_cache or daily_spend.
 */
export function toSeedSql(vehicles: VehicleKbFile[], generic: GenericPricesFile): string {
  const lines: string[] = ["DELETE FROM vehicle_kb;", "DELETE FROM generic_prices;"];
  for (const v of vehicles) {
    lines.push(
      `INSERT OR REPLACE INTO vehicle_kb (id, brand, json) VALUES (${lit(v.vehicle.id)}, ${lit(
        v.vehicle.brand.toLocaleLowerCase("tr-TR").trim().replace(/\s+/g, " "),
      )}, ${lit(JSON.stringify(v))});`,
    );
  }
  for (const p of generic.priceItems) {
    lines.push(
      `INSERT OR REPLACE INTO generic_prices (id, json) VALUES (${lit(p.id)}, ${lit(JSON.stringify(p))});`,
    );
  }
  return lines.join("\n") + "\n";
}
