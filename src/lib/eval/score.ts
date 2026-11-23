import { normalizePartName } from "@/lib/normalize";
import { GROUP_RANK } from "@/lib/rules/floors";
import type { Extraction, Section } from "@/lib/schema/extraction";
import type { Group } from "@/lib/schema/interpretation";
import type { AnalysisResult } from "@/lib/schema/result";

export type Label = {
  case: string;
  vehicle: Partial<Extraction["vehicle"]>;
  expected: { section: Section; part: string; group: Group }[];
  mustBeDikkat: { section: Section; part: string }[];
};

export type CaseScore = {
  vehicleFieldsCorrect: number;
  vehicleFieldsTotal: number;
  groupAccuracy: number;
  dikkatShownBelow: string[];
};

// Ölçümler madde listesinde değildir: "test_hatti" bölümünde, etiketteki `part`
// test kodudur ("dinamometre_guc") veya "<test kodu> <konum>" ("suspansiyon_tutunma sol ön").
export function scoreCase(
  r: AnalysisResult,
  items: Extraction["items"],
  l: Label,
  measurements: Extraction["measurements"] = [],
): CaseScore {
  const groupOf = (section: Section, part: string): Group | undefined => {
    const key = normalizePartName(part);
    let id: string | undefined;
    if (section === "test_hatti") {
      id = measurements.find(
        (m) => key === m.test || key === normalizePartName(`${m.test} ${m.position ?? ""}`),
      )?.id;
    }
    id ??= items.find((i) => i.section === section && normalizePartName(i.part) === key)?.id;
    return id === undefined ? undefined : r.items.find((ri) => ri.itemId === id)?.group;
  };

  const vehicleEntries = Object.entries(l.vehicle).filter(([, v]) => v !== undefined) as [
    keyof Extraction["vehicle"],
    string | number | null,
  ][];
  let vehicleFieldsCorrect = 0;
  for (const [k, want] of vehicleEntries) {
    const got = r.vehicle[k];
    const same =
      typeof want === "string" && typeof got === "string"
        ? normalizePartName(want) === normalizePartName(got)
        : want === got;
    if (same) vehicleFieldsCorrect++;
  }

  const right = l.expected.filter((e) => groupOf(e.section, e.part) === e.group).length;

  const dikkatShownBelow: string[] = [];
  for (const m of l.mustBeDikkat) {
    const g = groupOf(m.section, m.part);
    if (g === undefined) dikkatShownBelow.push(`eksik: ${m.section}/${m.part}`);
    else if (GROUP_RANK[g] < GROUP_RANK.dikkat) dikkatShownBelow.push(`${m.section}/${m.part}`);
  }

  return {
    vehicleFieldsCorrect,
    vehicleFieldsTotal: vehicleEntries.length,
    groupAccuracy: l.expected.length === 0 ? 1 : right / l.expected.length,
    dikkatShownBelow,
  };
}
