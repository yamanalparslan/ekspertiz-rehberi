import { expect, test } from "vitest";
import fixtureJson from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { normalizeExtraction } from "@/lib/normalize";
import { computeFloors } from "@/lib/rules/floors";
import { RawExtractionSchema, type Extraction } from "@/lib/schema/extraction";
import type { Group, Interpretation } from "@/lib/schema/interpretation";
import { AnalysisResultSchema } from "@/lib/schema/result";
import type { Knowledge } from "@/lib/kb/match";
import { buildResult } from "./result";

const { extraction } = normalizeExtraction(
  structuredClone(RawExtractionSchema.parse(fixtureJson)),
);
const floors = computeFloors(extraction);

const knowledge: Knowledge = {
  vehicleId: "v",
  chronicIssues: [
    {
      id: "k1",
      system: "motor",
      title: "Kronik bir",
      description: "d",
      symptoms: [],
      matchKeywords: [],
      obdCodes: [],
      engineCodes: null,
      priceItemId: null,
      sources: [{ url: "https://a.example", title: "A", domain: "a.example" }],
      researchedAt: "2026-01-01",
      confidence: "yuksek",
    },
  ],
  priceItems: [
    {
      id: "p1",
      title: "Ön panel",
      partType: "yan_sanayi",
      laborIncluded: true,
      minTry: 1000,
      maxTry: 2000,
      segment: "c",
      source: { url: "https://p.example", title: "P", domain: "p.example" },
      asOf: "2025-01-01",
      stale: true,
    },
  ],
  firmVerifyUrl: null,
};

const idOf = (p: string) => extraction.items.find((i) => i.part === p)!.id;
const mk = (
  itemId: string,
  group: Group,
  over: Partial<Interpretation["items"][number]> = {},
): Interpretation["items"][number] => ({
  itemId,
  group,
  title: `t-${itemId}`,
  meaning: "m",
  whyItMatters: "w",
  askSeller: null,
  priceItemId: null,
  priceNeed: null,
  chronicIssueId: null,
  generalUnverified: false,
  ...over,
});
const interp = (
  items: Interpretation["items"],
  checkList: Interpretation["checkList"] = [],
): Interpretation => ({ summary: "özet", items, checkList });
const build = (i: Interpretation, k: Knowledge = knowledge) =>
  buildResult({ extraction, interpretation: i, knowledge: k, floors, signals: [] });
const find = (r: ReturnType<typeof build>, id: string) => r.items.find((x) => x.itemId === id)!;
const slim = (n: number): Extraction => ({
  ...extraction,
  items: extraction.items.slice(0, n),
  measurements: [],
  obd: { ...extraction.obd, rawFaults: [] },
});

test("model normal dese de şasi tabanı dikkat yapar", () => {
  const id = idOf("Ön Panel");
  const it = find(build(interp([mk(id, "normal")])), id);
  expect(it.group).toBe("dikkat");
  expect(it.floorApplied).toBe(true);
  expect(find(build(interp([mk(id, "dikkat")])), id).floorApplied).toBe(false);
});

test("atlanan madde belirsiz eklenir", () => {
  const id = idOf("Sol Ön Direk");
  const r = build(interp([]));
  expect(find(r, id)).toMatchObject({
    group: "belirsiz",
    title: "Sol Ön Direk",
    meaning: "Bu madde otomatik yorumlanamadı.",
  });
  expect(find(r, extraction.measurements[0].id).meaning).toBe("Bu madde otomatik yorumlanamadı.");
  const total =
    extraction.items.length + extraction.measurements.length + extraction.obd.rawFaults.length;
  expect(r.items).toHaveLength(total);
  expect(AnalysisResultSchema.safeParse(r).success).toBe(true);
});

test("bilgi tabanında olmayan fiyat kimliği fiyat göstermez", () => {
  const id = idOf("Ön Panel");
  expect(find(build(interp([mk(id, "dikkat", { priceItemId: "uydurma" })])), id).cost).toBeNull();
});

test("fiyat rakamları bilgi tabanından, stale bayrağıyla", () => {
  const id = idOf("Ön Panel");
  const cost = find(build(interp([mk(id, "dikkat", { priceItemId: "p1" })])), id).cost;
  expect(cost).toEqual({
    minTry: 1000,
    maxTry: 2000,
    partType: "yan_sanayi",
    laborIncluded: true,
    source: { url: "https://p.example", title: "P" },
    asOf: "2025-01-01",
    stale: true,
  });
});

test("kronik kimlik: bilinen bağlanır, bilinmeyen genel doğrulanmamış olur", () => {
  const a = idOf("Ön Panel");
  const b = idOf("Sol Ön Direk");
  const r = build(
    interp([mk(a, "kronik", { chronicIssueId: "k1" }), mk(b, "kronik", { chronicIssueId: "yok" })]),
  );
  expect(find(r, a).chronic).toEqual({
    issueId: "k1",
    confidence: "yuksek",
    sources: [{ url: "https://a.example", title: "A" }],
  });
  expect(find(r, b).chronic).toBeNull();
  expect(find(r, b).generalUnverified).toBe(true);
});

test("checkList yalnızca bilgi tabanı destekli maddeleri tutar", () => {
  const r = build(
    interp(
      [],
      [
        { title: "a", why: "w", chronicIssueId: "k1" },
        { title: "b", why: "w", chronicIssueId: "yok" },
        { title: "c", why: "w", chronicIssueId: null },
      ],
    ),
  );
  expect(r.checkList.map((c) => c.title)).toEqual(["a"]);
});

test("sıralama dikkat, kronik, belirsiz, normal; sayımlar doğru", () => {
  const ids = extraction.items.slice(0, 4).map((i) => i.id);
  const groups: Group[] = ["normal", "belirsiz", "kronik", "normal"];
  const r = buildResult({
    extraction: slim(4),
    interpretation: interp(ids.map((id, n) => mk(id, groups[n]))),
    knowledge,
    floors: new Map<string, Group>([[ids[3], "dikkat"]]),
    signals: [],
  });
  expect(r.items.map((i) => i.group)).toEqual(["dikkat", "kronik", "belirsiz", "normal"]);
  expect(r.items[0].itemId).toBe(ids[3]);
  expect(r.counts).toEqual({ dikkat: 1, kronik: 1, belirsiz: 1, normal: 1 });
  expect(r.summary).toBe("özet");
});

test("grup içinde okuma sırası korunur", () => {
  const ids = extraction.items.slice(0, 3).map((i) => i.id);
  const r = buildResult({
    extraction: slim(3),
    interpretation: interp(ids.map((id) => mk(id, "normal"))),
    knowledge,
    floors: new Map(),
    signals: [],
  });
  expect(r.items.map((i) => i.itemId)).toEqual(ids);
});

test("firma doğrulama adresi varsa firma_dogrulama sinyali eklenir", () => {
  const r = build(interp([]), { ...knowledge, firmVerifyUrl: "https://firma.example/sorgu" });
  expect(r.signals.find((x) => x.code === "firma_dogrulama")).toEqual({
    code: "firma_dogrulama",
    level: "info",
    message: "Raporu firmanın kendi sorgu sayfasından doğrulayın.",
    details: ["https://firma.example/sorgu"],
  });
  expect(build(interp([])).signals.some((x) => x.code === "firma_dogrulama")).toBe(false);
});

test("araç ve rapor bilgisi okumadan gelir", () => {
  const r = build(interp([]));
  expect(r.vehicle).toEqual(extraction.vehicle);
  expect(r.report).toEqual({
    firm: extraction.report.firm,
    reportNo: extraction.report.reportNo,
    date: extraction.report.date,
  });
});
