import { expect, test } from "vitest";
import fixture from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { extractReport, type UploadFile } from "./extract";
import { EXTRACTION_SYSTEM } from "./prompts";
import { fakeClient, textMsg } from "./testing";

const jpeg: UploadFile = { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg" };
const pdf: UploadFile = { bytes: new Uint8Array([4, 5]), mediaType: "application/pdf" };

type Blocks = { type: string }[];
const blocksOf = (calls: Record<string, unknown>[]) =>
  (calls[0].messages as { content: Blocks }[])[0].content;

test("görseller image, PDF document bloğu olur; metin talimatı en sonda", async () => {
  const f = fakeClient(textMsg(JSON.stringify(fixture)));
  const r = await extractReport(f.client, [jpeg, jpeg, jpeg]);
  const content = blocksOf(f.calls);
  expect(content.map((b) => b.type)).toEqual(["image", "image", "image", "text"]);
  expect(content[0]).toMatchObject({
    source: { type: "base64", media_type: "image/jpeg", data: "AQID" },
  });
  expect(r.raw.vehicle.brand).toBe("BMW");
  expect(f.calls[0]).toMatchObject({ max_tokens: 32000, output_config: { effort: "medium" } });
  expect(f.calls[0].system).toEqual([
    { type: "text", text: EXTRACTION_SYSTEM, cache_control: { type: "ephemeral" } },
  ]);

  const g = fakeClient(textMsg(JSON.stringify(fixture)));
  await extractReport(g.client, [pdf]);
  const c2 = blocksOf(g.calls);
  expect(c2.map((b) => b.type)).toEqual(["document", "text"]);
  expect(c2[0]).toMatchObject({
    source: { type: "base64", media_type: "application/pdf", data: "BAU=" },
  });
});

test("sistem istemi gerekli kuralları içerir", () => {
  for (const s of [
    "unreadable",
    "rawStatus",
    "statusKind",
    "YYYY-MM-DD",
    "isReport",
    "printedPass",
    "mor_isik",
    "fren",
    "performed",
  ]) {
    expect(EXTRACTION_SYSTEM).toContain(s);
  }
});
