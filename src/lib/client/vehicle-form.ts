import type { Vehicle } from "@/lib/schema/result";

/** Düzeltme formundaki ham metinler. */
export type Draft = Record<
  "brand" | "model" | "variant" | "year" | "engineCc" | "powerHp" | "km" | "fuel" | "transmission",
  string
>;
export type DraftKey = keyof Draft;
export type FieldErrors = Partial<Record<DraftKey, string>>;

/** Sunucudaki sınırla aynı (src/lib/pipeline/vehicle-input.ts: MAX_VEHICLE_TEXT). */
export const MAX_TEXT = 60;

/** Sunucudaki aralıklarla aynı (vehicle-input.ts); eşitliği vehicle-form.test.ts denetler. */
export const RANGES = {
  year: { min: 1950 },
  engineCc: { min: 500, max: 8000 },
  powerHp: { min: 30, max: 1000 },
  km: { min: 0, max: 2_000_000 },
} as const;

export const toDraft = (v: Vehicle): Draft => ({
  brand: v.brand ?? "",
  model: v.model ?? "",
  variant: v.variant ?? "",
  year: v.year?.toString() ?? "",
  engineCc: v.engineCc?.toString() ?? "",
  powerHp: v.powerHp?.toString() ?? "",
  // Raporlardaki gibi noktalı ("135.689"); form noktayı binlik ayırıcı okur.
  km: v.km?.toLocaleString("tr-TR") ?? "",
  fuel: v.fuel ?? "",
  transmission: v.transmission ?? "",
});

/** Yıl sınırı sunucuyla aynı güne göre: İstanbul'daki yıl + 1. */
export function maxYear(now: Date): number {
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric" }).format(now);
  return Number(y) + 1;
}

const fmt = (n: number) => n.toLocaleString("tr-TR");

type Parsed = { value: number | null } | { error: string };

/**
 * Tam sayı alanı: nokta ve boşluk binlik ayırıcıdır ("135.689" -> 135689); sondaki birim
 * ("km", "cc", "hp") yok sayılır. Boşsa null.
 */
function parseNumber(raw: string, unit: RegExp): Parsed {
  const s = raw.trim().replace(unit, "").trim();
  if (s === "") return { value: null };
  const digits = s.replace(/[.\s]/g, "");
  if (!/^\d+$/.test(digits)) return { error: "Yalnızca rakam girin." };
  return { value: Number(digits) };
}

function inRange(p: Parsed, min: number, max: number, message: string): Parsed {
  if ("error" in p || p.value === null) return p;
  return p.value < min || p.value > max ? { error: message } : p;
}

function parseYear(raw: string, now: Date): Parsed {
  const max = maxYear(now);
  const s = raw.trim();
  if (s === "") return { value: null };
  if (!/^\d{4}$/.test(s)) return { error: `Dört haneli bir yıl yazın (${RANGES.year.min}–${max}).` };
  return inRange({ value: Number(s) }, RANGES.year.min, max, `${RANGES.year.min} ile ${max} arasında bir yıl yazın.`);
}

function parseEngine(raw: string): Parsed {
  // "1.6" ya da "1,6": litre yazılmış; nokta binlik ayırıcı sayılıp 16 cc olmasın.
  const litres = /^(\d)[.,](\d{1,2})\s*(l|lt|litre)?$/i.exec(raw.trim());
  if (litres) {
    const cc = Math.round(Number(`${litres[1]}.${litres[2]}`) * 10) * 100;
    return { error: `Litre değil, cc yazın: ${litres[1]}.${litres[2]} L yaklaşık ${fmt(cc)} cc eder.` };
  }
  const { min, max } = RANGES.engineCc;
  return inRange(parseNumber(raw, /\s*cc$/i), min, max, `${fmt(min)} ile ${fmt(max)} cc arasında bir değer yazın.`);
}

function parsePower(raw: string): Parsed {
  const { min, max } = RANGES.powerHp;
  return inRange(parseNumber(raw, /\s*(hp|bg|ps)$/i), min, max, `${fmt(min)} ile ${fmt(max)} HP arasında bir değer yazın.`);
}

function parseKm(raw: string): Parsed {
  const { min, max } = RANGES.km;
  return inRange(parseNumber(raw, /\s*km$/i), min, max, `${fmt(min)} ile ${fmt(max)} km arasında bir değer yazın.`);
}

function parseText(raw: string): { value: string | null } | { error: string } {
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length > MAX_TEXT) return { error: `En fazla ${MAX_TEXT} karakter yazın.` };
  return { value: t === "" ? null : t };
}

/**
 * Formu doğrular: sunucunun `vehicle_invalid` ile reddedeceği her değeri önceden, alanın
 * altında Türkçe bir mesajla yakalar. Geçerliyse gönderilecek aracı döner.
 */
export function validateDraft(d: Draft, now: Date): { vehicle: Vehicle } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const pick = <T>(key: DraftKey, p: { value: T } | { error: string }): T | null => {
    if ("error" in p) {
      errors[key] = p.error;
      return null;
    }
    return p.value;
  };
  const vehicle: Vehicle = {
    brand: pick("brand", parseText(d.brand)),
    model: pick("model", parseText(d.model)),
    variant: pick("variant", parseText(d.variant)),
    year: pick("year", parseYear(d.year, now)),
    engineCc: pick("engineCc", parseEngine(d.engineCc)),
    powerHp: pick("powerHp", parsePower(d.powerHp)),
    km: pick("km", parseKm(d.km)),
    fuel: d.fuel === "" ? null : (d.fuel as Vehicle["fuel"]),
    transmission: d.transmission === "" ? null : (d.transmission as Vehicle["transmission"]),
  };
  return Object.keys(errors).length > 0 ? { errors } : { vehicle };
}
