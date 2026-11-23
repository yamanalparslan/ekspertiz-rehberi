import { expect, test } from "vitest";
import fixtureJson from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { normalizeExtraction } from "@/lib/normalize";
import { computeFloors } from "@/lib/rules/floors";
import { RawExtractionSchema } from "@/lib/schema/extraction";
import type { Interpretation } from "@/lib/schema/interpretation";
import type { Knowledge } from "@/lib/kb/match";
import { interpretReport } from "./interpret";
import { INTERPRETATION_SYSTEM } from "./prompts";
import { fakeClient, textMsg } from "./testing";

const { extraction } = normalizeExtraction(
  structuredClone(RawExtractionSchema.parse(fixtureJson)),
);
const floors = computeFloors(extraction);
const knowledge: Knowledge = {
  vehicleId: "bmw-3-serisi-g20",
  chronicIssues: [
    {
      id: "yag-filtre-govdesi",
      system: "motor",
      title: "Yağ filtre yuvası sızıntısı",
      description: "Conta zamanla sızdırır.",
      symptoms: [],
      matchKeywords: [],
      obdCodes: [],
      engineCodes: null,
      priceItemId: null,
      sources: [],
      researchedAt: "2026-01-01",
      confidence: "yuksek",
    },
  ],
  priceItems: [
    {
      id: "on-panel",
      title: "Ön panel",
      partType: "orijinal",
      laborIncluded: null,
      minTry: 11111,
      maxTry: 22222,
      segment: "c",
      source: { url: "https://x.example", title: "x", domain: "x.example" },
      asOf: "2026-10-01",
      stale: false,
    },
  ],
  firmVerifyUrl: null,
};
const idOf = (p: string) => extraction.items.find((i) => i.part === p)!.id;

async function run() {
  const model: Interpretation = { summary: "s", items: [], checkList: [] };
  const f = fakeClient(textMsg(JSON.stringify(model)));
  const r = await interpretReport(f.client, { extraction, knowledge, floors });
  return { f, r };
}

test("istek effort high, 64000 jeton, tek metin bloğu, görsel yok", async () => {
  const { f } = await run();
  expect(f.calls[0]).toMatchObject({ max_tokens: 64000, output_config: { effort: "high" } });
  expect(f.calls[0].system).toEqual([
    { type: "text", text: INTERPRETATION_SYSTEM, cache_control: { type: "ephemeral" } },
  ]);
  const content = (f.calls[0].messages as { content: { type: string; text?: string }[] }[])[0]
    .content;
  expect(content.map((b) => b.type)).toEqual(["text"]);
  expect(() => JSON.parse(content[0].text!)).not.toThrow();
});

test("orijinal ve tabansız madde önceden normal sınıflanır, istekte yoktur", async () => {
  const { f, r } = await run();
  const body = (f.calls[0].messages as { content: { text: string }[] }[])[0].content[0].text;
  const sent = JSON.parse(body) as {
    items: { id: string }[];
    measurements: unknown[];
    preclassifiedParts: string[];
    floors: Record<string, string>;
    knowledge: { priceItems: Record<string, unknown>[] };
  };
  const direk = idOf("Sol Ön Direk");
  const panel = idOf("Ön Panel");
  expect(sent.items.map((i) => i.id)).not.toContain(direk);
  expect(sent.items.map((i) => i.id)).toContain(panel);
  expect(sent.preclassifiedParts).toContain("Sol Ön Direk");
  expect(sent.floors[panel]).toBe("dikkat");
  expect(sent.measurements).toHaveLength(extraction.measurements.length);
  // TL rakamları modele gitmez.
  expect(body).not.toContain("11111");
  expect(sent.knowledge.priceItems[0]).not.toHaveProperty("minTry");

  const pre = r.interpretation.items.find((i) => i.itemId === direk)!;
  expect(pre).toMatchObject({
    group: "normal",
    title: "Sol Ön Direk",
    whyItMatters: "",
    askSeller: null,
    priceItemId: null,
    priceNeed: null,
    chronicIssueId: null,
    generalUnverified: false,
  });
  expect(pre.meaning).toMatch(/^Raporda sorun görülmemiş: .+\.$/);
  expect(r.usd).toBeGreaterThan(0);
});

test("sistem istemi gerekli kuralları içerir", () => {
  for (const s of [
    "kararsız kalırsan daha ciddi grubu seç",
    "alt sınır",
    "priceItemId",
    "generalUnverified",
    "checkList",
    'al" veya "alma',
    "aynen",
    "preclassifiedParts",
  ]) {
    expect(INTERPRETATION_SYSTEM.toLowerCase()).toContain(s.toLowerCase());
  }
});
