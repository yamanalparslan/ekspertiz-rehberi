import type { Vehicle } from "@/lib/schema/result";
import { istanbulDay } from "./spend";

/** Düzeltme formundan gelen metin alanlarının en uzun hâli (kırpıldıktan sonra). */
export const MAX_VEHICLE_TEXT = 60;

const inRange = (v: number, min: number, max: number, integer: boolean) =>
  Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));

/**
 * Kullanıcının düzelttiği araç bilgisini sunucuda sınırlar (bu metinler yorumlama istemine
 * girer: istem enjeksiyonu ve maliyet yüzeyi). Geçerliyse kırpılmış kopyayı, değilse null döner.
 * Yıl 1950..bu yıl+1 (İstanbul), hacim 500..8000 cc, güç 30..1000 HP, km 0..2.000.000;
 * yıl, hacim ve km tam sayı; metinler en fazla 60 karakter, boş metin null olur.
 */
export function parseCorrectedVehicle(v: Vehicle, now: Date): Vehicle | null {
  const text = (s: string | null): string | null | undefined => {
    if (s === null) return null;
    const t = s.trim().replace(/\s+/g, " ");
    if (t.length > MAX_VEHICLE_TEXT) return undefined;
    return t === "" ? null : t;
  };
  const brand = text(v.brand);
  const model = text(v.model);
  const variant = text(v.variant);
  if (brand === undefined || model === undefined || variant === undefined) return null;

  const maxYear = Number(istanbulDay(now).slice(0, 4)) + 1;
  if (v.year !== null && !inRange(v.year, 1950, maxYear, true)) return null;
  if (v.engineCc !== null && !inRange(v.engineCc, 500, 8000, true)) return null;
  if (v.powerHp !== null && !inRange(v.powerHp, 30, 1000, false)) return null;
  if (v.km !== null && !inRange(v.km, 0, 2_000_000, true)) return null;

  return { ...v, brand, model, variant };
}
