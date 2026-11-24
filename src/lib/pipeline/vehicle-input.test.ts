import { expect, test } from "vitest";
import type { Vehicle } from "@/lib/schema/result";
import { parseCorrectedVehicle } from "./vehicle-input";

const NOW = new Date("2026-11-24T10:00:00+03:00");
const ok: Vehicle = {
  brand: "Fiat",
  model: "Egea",
  variant: "1.3 Multijet Urban",
  year: 2019,
  engineCc: 1248,
  powerHp: 95,
  fuel: "dizel",
  transmission: "manuel",
  km: 135689,
};
const parse = (over: Partial<Vehicle>) => parseCorrectedVehicle({ ...ok, ...over }, NOW);

test("geçerli araç bilgisi kırpılarak döner; boş metin null olur", () => {
  expect(parse({})).toEqual(ok);
  expect(parse({ brand: "  Fiat  ", model: " Egea ", variant: "   " })).toMatchObject({ brand: "Fiat", model: "Egea", variant: null });
  const nulls = { brand: null, model: null, variant: null, year: null, engineCc: null, powerHp: null, fuel: null, transmission: null, km: null };
  expect(parse(nulls)).toEqual(nulls);
});

test("sınırlar: yıl 1950..bu yıl+1, hacim 500..8000, güç 30..1000, km 0..2.000.000", () => {
  for (const year of [1950, 2027]) expect(parse({ year }), String(year)).not.toBeNull();
  for (const year of [1949, 2028, 2019.5, Number.NaN]) expect(parse({ year }), String(year)).toBeNull();
  for (const engineCc of [500, 8000]) expect(parse({ engineCc })).not.toBeNull();
  // "1.6" hacim alanına litre olarak girilirse 16 cc olmaz: reddedilir.
  for (const engineCc of [16, 1.6, 499, 8001, 1597.5]) expect(parse({ engineCc }), String(engineCc)).toBeNull();
  for (const powerHp of [30, 1000, 67.5]) expect(parse({ powerHp })).not.toBeNull();
  for (const powerHp of [29, 1001, Number.POSITIVE_INFINITY]) expect(parse({ powerHp }), String(powerHp)).toBeNull();
  for (const km of [0, 2_000_000]) expect(parse({ km })).not.toBeNull();
  for (const km of [-1, 2_000_001, 1.5]) expect(parse({ km }), String(km)).toBeNull();
});

test("metin alanları en fazla 60 karakter (kırpıldıktan sonra)", () => {
  expect(parse({ variant: "x".repeat(60) })).not.toBeNull();
  expect(parse({ variant: `  ${"x".repeat(60)}  ` })).not.toBeNull();
  expect(parse({ variant: "x".repeat(61) })).toBeNull();
  expect(parse({ brand: "b".repeat(61) })).toBeNull();
  expect(parse({ model: "m".repeat(200) })).toBeNull();
});
