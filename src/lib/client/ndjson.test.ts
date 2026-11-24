import { expect, test } from "vitest";
import type { AnalysisEvent } from "@/lib/schema/events";
import { readEventResponse, readNdjson } from "./ndjson";

const errLine = (code: string, message: string) => JSON.stringify({ type: "error", code, message });

async function fromResponse(res: Response): Promise<AnalysisEvent[]> {
  const events: AnalysisEvent[] = [];
  await readEventResponse(res, (e) => events.push(e));
  return events;
}

test("readEventResponse: 2xx dışı yanıtın gövdesindeki hata kodunu okur (429, 413, 401)", async () => {
  const cap = errLine("cap_reached", "Bugünlük kapasite doldu, yarın tekrar deneyin.");
  expect(await fromResponse(new Response(cap, { status: 429 }))).toEqual([JSON.parse(cap)]);
  const big = errLine("upload_invalid", "x");
  expect((await fromResponse(new Response(big + "\n", { status: 413 })))[0]).toMatchObject({ code: "upload_invalid" });
  expect((await fromResponse(new Response(errLine("token_invalid", "x"), { status: 401 })))[0]).toMatchObject({
    code: "token_invalid",
  });
});

test("readEventResponse: 2xx dışı yanıtta hata olayı yoksa ya da gövde bizim değilse (ör. 502 HTML) hata fırlatır", async () => {
  await expect(fromResponse(new Response("<html>Bad gateway</html>", { status: 502 }))).rejects.toThrow();
  await expect(fromResponse(new Response("", { status: 500 }))).rejects.toThrow();
  await expect(fromResponse(new Response('{"type":"stage","stage":"okuma"}\n', { status: 500 }))).rejects.toThrow();
});

test("readEventResponse: 200 NDJSON akışını olduğu gibi okur", async () => {
  const body = '{"type":"stage","stage":"okuma"}\n' + errLine("refusal", "x") + "\n";
  const events = await fromResponse(new Response(body, { status: 200 }));
  expect(events.map((e) => e.type)).toEqual(["stage", "error"]);
});

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(typeof c === "string" ? enc.encode(c) : c);
      controller.close();
    },
  });
}

async function collect(chunks: (string | Uint8Array)[]): Promise<AnalysisEvent[]> {
  const events: AnalysisEvent[] = [];
  await readNdjson(streamOf(chunks), (e) => events.push(e));
  return events;
}

test("readNdjson parçalara bölünmüş satırları birleştirir", async () => {
  const events = await collect(['{"type":"st', 'age","stage":"okuma"}\n']);
  expect(events).toEqual([{ type: "stage", stage: "okuma" }]);
});

test("readNdjson bir parçadaki birden çok satırı ve sondaki yeni satırsız satırı okur", async () => {
  const events = await collect([
    '{"type":"stage","stage":"okuma"}\n\n{"type":"stage","stage":"okuma"}\n{"type":"stage",',
    '"stage":"arac"}',
  ]);
  expect(events.map((e) => e.type === "stage" && e.stage)).toEqual(["okuma", "okuma", "arac"]);
});

test("readNdjson parçalar arasında bölünmüş çok baytlı Türkçe karakteri bozmaz", async () => {
  const line = JSON.stringify({
    type: "error",
    code: "internal",
    message: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
  });
  const bytes = new TextEncoder().encode(line + "\n");
  const cut = bytes.indexOf(0xc5) + 1; // "ş" = c5 9f; split between its two bytes
  const events = await collect([bytes.slice(0, cut), bytes.slice(cut)]);
  expect(events).toEqual([
    { type: "error", code: "internal", message: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." },
  ]);
});

test("readNdjson şemaya uymayan satırda hata fırlatır", async () => {
  await expect(collect(['{"type":"stage","stage":"bilinmeyen"}\n'])).rejects.toThrow();
  await expect(collect(["bu json değil\n"])).rejects.toThrow();
});

test("readNdjson hatadan önceki olayları iletir", async () => {
  const events: AnalysisEvent[] = [];
  await expect(
    readNdjson(streamOf(['{"type":"stage","stage":"okuma"}\n', "{kırık\n"]), (e) => events.push(e)),
  ).rejects.toThrow();
  expect(events).toEqual([{ type: "stage", stage: "okuma" }]);
});
