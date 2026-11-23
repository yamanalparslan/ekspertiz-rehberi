import type { Extraction, MeasurementTest, StatusKind } from "@/lib/schema/extraction";
import type { Group } from "@/lib/schema/interpretation";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/rules/thresholds";

export const GROUP_RANK: Record<Group, number> = {
  normal: 0,
  belirsiz: 1,
  kronik: 2,
  dikkat: 3,
};

// Yüksek ciddiyet kazanır: model sabit kuralın altına inemez.
export function mergeGroup(model: Group, floor: Group | undefined): Group {
  if (floor === undefined) return model;
  return GROUP_RANK[floor] > GROUP_RANK[model] ? floor : model;
}

const ORIGINAL_LIKE: ReadonlySet<StatusKind> = new Set<StatusKind>([
  "orijinal",
  "saglam",
  "orijinalinde_yok",
  "calisiyor",
]);

type Limit = { kind: "max" | "min"; value: number; abs: boolean };

function defaultLimit(test: MeasurementTest, t: Thresholds): Limit | null {
  switch (test) {
    case "fren_sapma_on":
    case "fren_sapma_arka":
    case "el_freni_sapma":
      return t.brakeImbalanceMaxPct.value === null
        ? null
        : { kind: "max", value: t.brakeImbalanceMaxPct.value, abs: false };
    case "suspansiyon_tutunma":
      return t.suspensionGripMinPct.value === null
        ? null
        : { kind: "min", value: t.suspensionGripMinPct.value, abs: false };
    case "yanal_kayma_on":
    case "yanal_kayma_arka":
      return t.sideSlipMaxAbsMPerKm.value === null
        ? null
        : { kind: "max", value: t.sideSlipMaxAbsMPerKm.value, abs: true };
    case "dinamometre_guc":
      return null;
  }
}

export function computeFloors(
  e: Extraction,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Map<string, Group> {
  const floors = new Map<string, Group>();
  const add = (id: string, g: Group) => floors.set(id, mergeGroup(g, floors.get(id)));

  for (const item of e.items) {
    if ((item.section === "sasi" || item.section === "airbag") && !ORIGINAL_LIKE.has(item.statusKind)) {
      add(item.id, "dikkat");
    }
  }

  for (const f of e.obd.rawFaults) {
    if (f.system === "airbag" || f.system === "fren") add(f.id, "dikkat");
  }

  for (const m of e.measurements) {
    if (!m.performed || m.value === null) {
      add(m.id, "belirsiz");
      continue;
    }
    const isSideSlip = m.test === "yanal_kayma_on" || m.test === "yanal_kayma_arka";
    const limits: Limit[] = [];
    if (m.printedPassMax !== null) limits.push({ kind: "max", value: Math.abs(m.printedPassMax), abs: isSideSlip });
    if (m.printedPassMin !== null) limits.push({ kind: "min", value: m.printedPassMin, abs: false });
    if (limits.length === 0) {
      const d = defaultLimit(m.test, t);
      if (d) limits.push(d);
    }
    for (const limit of limits) {
      const v = limit.abs ? Math.abs(m.value) : m.value;
      if (limit.kind === "max" ? v > limit.value : v < limit.value) add(m.id, "dikkat");
    }
  }

  return floors;
}
