import type { Extraction, StatusKind } from "@/lib/schema/extraction";
import {
  InterpretationSchema,
  type Group,
  type Interpretation,
} from "@/lib/schema/interpretation";
import type { Knowledge } from "@/lib/kb/match";
import { runStructured, type ClaudeLike } from "./client";
import { INTERPRETATION_SYSTEM } from "./prompts";

// Raporda sorun görülmeyen durumlar: tabanı yoksa şablonla "normal" sayılır, modele gönderilmez.
const CLEAN_STATUS: ReadonlySet<StatusKind> = new Set<StatusKind>([
  "orijinal",
  "saglam",
  "orijinalinde_yok",
  "calisiyor",
]);

type InterpretedItem = Interpretation["items"][number];

export function preclassify(
  e: Extraction,
  floors: Map<string, Group>,
): { done: InterpretedItem[]; remaining: Extraction["items"] } {
  const done: InterpretedItem[] = [];
  const remaining: Extraction["items"] = [];
  for (const item of e.items) {
    if (CLEAN_STATUS.has(item.statusKind) && !floors.has(item.id)) {
      done.push({
        itemId: item.id,
        group: "normal",
        title: item.part,
        meaning: `Raporda sorun görülmemiş: ${item.rawStatus}.`,
        whyItMatters: "",
        askSeller: null,
        priceItemId: null,
        priceNeed: null,
        chronicIssueId: null,
        generalUnverified: false,
      });
    } else {
      remaining.push(item);
    }
  }
  return { done, remaining };
}

export async function interpretReport(
  client: ClaudeLike,
  input: { extraction: Extraction; knowledge: Knowledge; floors: Map<string, Group> },
): Promise<{ interpretation: Interpretation; usd: number }> {
  const { extraction: e, knowledge: k, floors } = input;
  const { done, remaining } = preclassify(e, floors);

  const payload = {
    vehicle: e.vehicle,
    vehicleInferred: e.vehicleInferred ?? {},
    report: { firm: e.report.firm, date: e.report.date, package: e.report.package },
    sectionsPresent: e.sectionsPresent,
    items: remaining.map((i) => ({
      id: i.id,
      section: i.section,
      part: i.part,
      rawStatus: i.rawStatus,
      statusKind: i.statusKind,
      note: i.note,
    })),
    preclassifiedParts: done.map((d) => d.title),
    measurements: e.measurements,
    obd: e.obd,
    kmHistory: e.kmHistory,
    damageRecords: e.damageRecords,
    expertNotes: e.expertNotes,
    unreadable: e.unreadable,
    floors: Object.fromEntries(floors),
    knowledge: {
      chronicIssues: k.chronicIssues.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        confidence: c.confidence,
      })),
      priceItems: k.priceItems.map((p) => ({
        id: p.id,
        title: p.title,
        segment: p.segment,
        stale: p.stale,
      })),
    },
  };

  const { data, usd } = await runStructured(client, {
    system: INTERPRETATION_SYSTEM,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    schema: InterpretationSchema,
    effort: "high",
    maxTokens: 64000,
  });

  const doneIds = new Set(done.map((d) => d.itemId));
  return {
    interpretation: {
      ...data,
      items: [...done, ...data.items.filter((i) => !doneIds.has(i.itemId))],
    },
    usd,
  };
}
