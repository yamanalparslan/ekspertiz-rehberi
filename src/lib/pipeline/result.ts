import type { Extraction } from "@/lib/schema/extraction";
import type { Group, Interpretation } from "@/lib/schema/interpretation";
import type { AnalysisResult, ResultItem, Signal } from "@/lib/schema/result";
import type { Knowledge } from "@/lib/kb/match";
import { GROUP_RANK, mergeGroup } from "@/lib/rules/floors";

const NOT_INTERPRETED = "Bu madde otomatik yorumlanamadı.";
const FIRM_MESSAGE = "Raporu firmanın kendi sorgu sayfasından doğrulayın.";

type Entry = { id: string; title: string };

// Okuma sırası: maddeler, ölçümler, ham arızalar.
function readingOrder(e: Extraction): Entry[] {
  return [
    ...e.items.map((i) => ({ id: i.id, title: i.part })),
    ...e.measurements.map((m) => ({
      id: m.id,
      title: [m.test.replace(/_/g, " "), m.position].filter(Boolean).join(" "),
    })),
    ...e.obd.rawFaults.map((f) => ({ id: f.id, title: `${f.unitName} ${f.code}` })),
  ];
}

export function buildResult(input: {
  extraction: Extraction;
  interpretation: Interpretation;
  knowledge: Knowledge;
  floors: Map<string, Group>;
  signals: Signal[];
}): AnalysisResult {
  const { extraction: e, interpretation, knowledge: k, floors } = input;

  const modelItems = new Map<string, Interpretation["items"][number]>();
  for (const it of interpretation.items) if (!modelItems.has(it.itemId)) modelItems.set(it.itemId, it);
  const prices = new Map(k.priceItems.map((p) => [p.id, p]));
  const issues = new Map(k.chronicIssues.map((c) => [c.id, c]));

  const items: ResultItem[] = readingOrder(e).map(({ id, title }) => {
    const m = modelItems.get(id);
    const floor = floors.get(id);
    if (!m) {
      const group = mergeGroup("belirsiz", floor);
      return {
        itemId: id,
        group,
        floorApplied: group !== "belirsiz",
        title,
        meaning: NOT_INTERPRETED,
        whyItMatters: "",
        askSeller: null,
        cost: null,
        chronic: null,
        generalUnverified: false,
      };
    }

    const group = mergeGroup(m.group, floor);
    const price = m.priceItemId === null ? undefined : prices.get(m.priceItemId);
    const issue = m.chronicIssueId === null ? undefined : issues.get(m.chronicIssueId);
    return {
      itemId: id,
      group,
      floorApplied: group !== m.group,
      title: m.title,
      meaning: m.meaning,
      whyItMatters: m.whyItMatters,
      askSeller: m.askSeller,
      cost: price
        ? {
            minTry: price.minTry,
            maxTry: price.maxTry,
            partType: price.partType,
            laborIncluded: price.laborIncluded,
            source: { url: price.source.url, title: price.source.title },
            asOf: price.asOf,
            stale: price.stale,
          }
        : null,
      chronic: issue
        ? {
            issueId: issue.id,
            confidence: issue.confidence,
            sources: issue.sources.map((s) => ({ url: s.url, title: s.title })),
          }
        : null,
      generalUnverified: issue
        ? false
        : m.chronicIssueId !== null || group === "kronik"
          ? true
          : m.generalUnverified,
    };
  });

  // Dikkat, kronik, belirsiz, normal; grup içinde okuma sırası (kararlı sıralama).
  const ordered = items
    .map((it, n) => ({ it, n }))
    .sort((a, b) => GROUP_RANK[b.it.group] - GROUP_RANK[a.it.group] || a.n - b.n)
    .map((x) => x.it);

  const counts: Record<Group, number> = { normal: 0, belirsiz: 0, kronik: 0, dikkat: 0 };
  for (const it of ordered) counts[it.group]++;

  // Kontrol listesi bilgi tabanı destekli olmalıdır.
  const checkList = interpretation.checkList.filter(
    (c) => c.chronicIssueId !== null && issues.has(c.chronicIssueId),
  );

  const signals = [...input.signals];
  if (k.firmVerifyUrl) {
    signals.push({
      code: "firma_dogrulama",
      level: "info",
      message: FIRM_MESSAGE,
      details: [k.firmVerifyUrl],
    });
  }

  return {
    vehicle: e.vehicle,
    ...(e.vehicleInferred && Object.keys(e.vehicleInferred).length > 0 ? { vehicleInferred: e.vehicleInferred } : {}),
    report: { firm: e.report.firm, reportNo: e.report.reportNo, date: e.report.date },
    summary: interpretation.summary,
    counts,
    items: ordered,
    checkList,
    signals,
  };
}
