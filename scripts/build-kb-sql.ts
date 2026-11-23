import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import { toSeedSql } from "../src/lib/kb/seed-sql";
import {
  GenericPricesFileSchema,
  VehicleKbFileSchema,
  type VehicleKbFile,
} from "../src/lib/schema/kb";

const root = join(import.meta.dirname, "..", "kb");

function readJson<S extends z.ZodType>(path: string, schema: S): z.infer<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${path}: invalid JSON (${(e as Error).message})`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${path}: schema validation failed\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

const vehicleDir = join(root, "vehicles");
mkdirSync(vehicleDir, { recursive: true });

const vehicles: VehicleKbFile[] = [];
for (const file of readdirSync(vehicleDir).filter((f) => f.endsWith(".json")).sort()) {
  const path = join(vehicleDir, file);
  const v = readJson(path, VehicleKbFileSchema);
  if (v.vehicle.id !== basename(file, ".json")) {
    throw new Error(`${path}: vehicle.id "${v.vehicle.id}" must equal the file name`);
  }
  vehicles.push(v);
}
const generic = readJson(join(root, "generic-prices.json"), GenericPricesFileSchema);

writeFileSync(join(root, "seed.sql"), toSeedSql(vehicles, generic));
console.log(`kb/seed.sql written: ${vehicles.length} vehicles, ${generic.priceItems.length} generic prices`);
