import { z } from "zod";
import { normalizePartName } from "@/lib/normalize";
import { GROUP_RANK } from "@/lib/rules/floors";
import { RawExtractionSchema, SectionSchema, type Extraction } from "@/lib/schema/extraction";
import { GroupSchema, type Group } from "@/lib/schema/interpretation";
import type { AnalysisResult } from "@/lib/schema/result";

/** Etiket dosyası (eval/labels/<vaka>.json) şeması: bilinmeyen alan ve geçersiz bölüm/grup reddedilir. */
export const LabelSchema = z.strictObject({
  case: z.string(),
  vehicle: RawExtractionSchema.shape.vehicle.partial(),
  expected: z.array(z.strictObject({ section: SectionSchema, part: z.string(), group: GroupSchema })),
  mustBeDikkat: z.array(z.strictObject({ section: SectionSchema, part: z.string() })),
});
export type Label = z.infer<typeof LabelSchema>;

/** Etiket JSON'unu doğrular; geçersizse hata fırlatır. */
export function parseLabel(json: unknown): Label {
  return LabelSchema.parse(json);
}

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
  // Aynı adla birden çok eşleşme (yinelenen satır, birden çok konumlu ölçüm) varsa EN DÜŞÜK
  // grup sayılır: bir kopyanın "dikkat" altında gösterilmesi gözden kaçmasın.
  const groupOf = (section: Label["expected"][number]["section"], part: string): Group | undefined => {
    const key = normalizePartName(part);
    let ids: string[] = [];
    if (section === "test_hatti") {
      ids = measurements
        .filter((m) => key === m.test || key === normalizePartName(`${m.test} ${m.position ?? ""}`))
        .map((m) => m.id);
    }
    if (ids.length === 0) {
      ids = items.filter((i) => i.section === section && normalizePartName(i.part) === key).map((i) => i.id);
    }
    const groups = ids
      .map((id) => r.items.find((ri) => ri.itemId === id)?.group)
      .filter((g): g is Group => g !== undefined);
    if (groups.length === 0) return undefined;
    return groups.reduce((min, g) => (GROUP_RANK[g] < GROUP_RANK[min] ? g : min));
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
