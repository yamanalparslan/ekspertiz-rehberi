import type { Extraction, RawExtraction } from "@/lib/schema/extraction";
import type { Signal } from "@/lib/schema/result";
import { enrichVehicle } from "@/lib/vehicle-enrich";

export function normalizePartName(s: string): string {
  return s.toLocaleLowerCase("tr-TR").trim().replace(/\s+/g, " ");
}
const normalizePart = normalizePartName;

export function normalizeExtraction(raw: RawExtraction): {
  extraction: Extraction;
  signals: Signal[];
} {
  const kaporta = new Map<string, RawExtraction["items"][number]>();
  for (const item of raw.items) {
    if (item.section !== "kaporta_boya") continue;
    const key = normalizePart(item.part);
    if (!kaporta.has(key)) kaporta.set(key, item);
  }

  const conflicting = new Set<RawExtraction["items"][number]>();
  const kept = raw.items.filter((item) => {
    if (item.section !== "mor_isik") return true;
    const match = kaporta.get(normalizePart(item.part));
    if (!match) return true;
    if (match.statusKind !== item.statusKind) conflicting.add(match);
    return false;
  });

  const signals: Signal[] = [];
  if (conflicting.size > 0) {
    signals.push({
      code: "mor_isik_celiski",
      level: "warn",
      message: "Mor ışık sonucu kaporta-boya sonucuyla çelişiyor.",
      details: raw.items.filter((i) => conflicting.has(i)).map((i) => i.part),
    });
  }

  // Basılı olmayan hacim/güç/yakıt model-varyant adından tahmin edilir ve işaretlenir.
  const { vehicle, inferred } = enrichVehicle(raw.vehicle);

  const extraction: Extraction = {
    ...structuredClone(raw),
    vehicle,
    ...(Object.keys(inferred).length > 0 ? { vehicleInferred: inferred } : {}),
    items: kept.map((item, n) => ({ id: `i${n + 1}`, ...structuredClone(item) })),
    measurements: raw.measurements.map((m, n) => ({ id: `m${n + 1}`, ...structuredClone(m) })),
    obd: {
      summary: structuredClone(raw.obd.summary),
      rawFaults: raw.obd.rawFaults.map((f, n) => ({ id: `f${n + 1}`, ...structuredClone(f) })),
    },
  };
  return { extraction, signals };
}
