import { expect, test } from "vitest";
import type { ClaudeLike } from "./client";
import { AnalysisError, createClaude } from "./client";
import { lookupPrices } from "./prices";

const NOW = new Date("2026-11-23T10:00:00Z");
const vehicle = {
  brand: "BMW",
  model: "320i",
  variant: null,
  year: 2021,
  engineCc: 1597,
  powerHp: 170,
  fuel: "benzin",
  transmission: "otomatik",
  km: 135689,
} as never;

const USAGE = { input_tokens: 1000, output_tokens: 100 }; // 0.004 + 0.002 = 0.006 USD

// Sıradaki yanıtı döndüren sahte istemci; çağrı parametrelerini (kopya) kaydeder.
function seq(msgs: unknown[]) {
  let i = 0;
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (p: Record<string, unknown>) => {
          calls.push({ ...p, messages: [...(p.messages as unknown[])] });
          const m = msgs[i++];
          return {
            finalMessage: async () => {
              if (m instanceof Error) throw m;
              return m;
            },
          };
        },
      },
    },
  } as unknown as ClaudeLike;
  return { client, calls };
}

const row = (over: Record<string, unknown> = {}) => ({
  itemId: "a",
  title: "Arka çamurluk boyama (tek panel)",
  minTry: 4000,
  maxTry: 6000,
  partType: "belirtilmemis",
  laborIncluded: true,
  sourceUrl: "https://www.example.com/fiyat",
  sourceTitle: "Örnek fiyat listesi",
  ...over,
});

const searchResult = (...urls: string[]) => ({
  type: "web_search_tool_result",
  tool_use_id: "s1",
  content: urls.map((url) => ({ type: "web_search_result", url, title: "t", encrypted_content: "x", page_age: null })),
});
const toolMsg = (fiyatlar: unknown[], grounding: unknown[] = [searchResult("https://www.example.com/liste")]) => ({
  stop_reason: "tool_use",
  usage: USAGE,
  content: [
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } },
    ...grounding,
    { type: "tool_use", id: "t1", name: "fiyatlari_kaydet", input: { fiyatlar } },
  ],
});

const needs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ itemId: String.fromCharCode(97 + i), need: `ihtiyaç ${i}` }));

test("kaynaksız ve ters aralıklı fiyatlar atılır", async () => {
  const { client } = seq([
    toolMsg([
      row(),
      row({ itemId: "b", title: "Kaynaksız", sourceUrl: "" }),
      row({ itemId: "c", title: "Ters aralık", minTry: 9000, maxTry: 100 }),
    ]),
  ]);
  const out = await lookupPrices(client, { vehicle, needs: needs(3), vehicleKey: "bmw|320i" }, NOW);
  expect(out.prices).toHaveLength(1);
  expect(out.prices[0]).toEqual({
    id: "live-bmw-320i-arka-camurluk-boyama-tek-panel-2026-11-23",
    title: "Arka çamurluk boyama (tek panel)",
    partType: "belirtilmemis",
    laborIncluded: true,
    minTry: 4000,
    maxTry: 6000,
    segment: null,
    source: { url: "https://www.example.com/fiyat", title: "Örnek fiyat listesi", domain: "example.com" },
    asOf: "2026-11-23",
    forItemId: "a",
  });
  expect(out.usd).toBeCloseTo(0.006, 6);
});

test("http olmayan adres, sıfır değer ve bilinmeyen itemId atılır", async () => {
  const { client } = seq([
    toolMsg([
      row({ sourceUrl: "javascript:alert(1)" }),
      row({ title: "Sıfır", minTry: 0 }),
      row({ title: "Yabancı", itemId: "zzz" }),
      row({ title: "Eksik alan", minTry: undefined }),
    ]),
  ]);
  const out = await lookupPrices(client, { vehicle, needs: needs(1) }, NOW);
  expect(out.prices).toEqual([]);
});

test("farklı araç anahtarı, aynı başlık ve gün: kimlikler farklı", async () => {
  const run = async (vehicleKey: string) =>
    (await lookupPrices(seq([toolMsg([row()])]).client, { vehicle, needs: needs(1), vehicleKey }, NOW)).prices[0].id;
  const [a, b] = [await run("bmw|320i"), await run("audi|a3")];
  expect(a).not.toBe(b);
  expect(a).toBe("live-bmw-320i-arka-camurluk-boyama-tek-panel-2026-11-23");
  expect(b).toBe("live-audi-a3-arka-camurluk-boyama-tek-panel-2026-11-23");
});

test("aynı başlık iki kez gelirse kimlikler benzersiz kalır", async () => {
  const { client } = seq([toolMsg([row(), row({ itemId: "b" })])]);
  const out = await lookupPrices(client, { vehicle, needs: needs(2) }, NOW);
  expect(new Set(out.prices.map((p) => p.id)).size).toBe(2);
});

test("en fazla 5 ihtiyaç gönderilir", async () => {
  const { client, calls } = seq([toolMsg([])]);
  await lookupPrices(client, { vehicle, needs: needs(7) }, NOW);
  const content = (calls[0].messages as { content: { text: string }[] }[])[0].content[0].text;
  const sent = JSON.parse(content).needs as { itemId: string }[];
  expect(sent.map((n) => n.itemId)).toEqual(["a", "b", "c", "d", "e"]);
});

test("istek web_search_20260209 max_uses 5 içerir, output_config.format ve zorunlu tool_choice içermez", async () => {
  const { client, calls } = seq([toolMsg([])]);
  await lookupPrices(client, { vehicle, needs: needs(1) }, NOW);
  const p = calls[0] as Record<string, any>;
  expect(p.tools[0]).toMatchObject({
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 5,
    user_location: { country: "TR" },
  });
  expect(p.tools[1]).toMatchObject({ name: "fiyatlari_kaydet", strict: true, eager_input_streaming: true });
  expect(p.tools.some((t: { type?: string }) => t.type?.startsWith("code_execution"))).toBe(false);
  expect(p.output_config).toEqual({ effort: "medium" });
  expect(p.output_config).not.toHaveProperty("format");
  expect(p.tool_choice).toEqual({ type: "auto" });
  expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
  expect(p.fallbacks).toBe("default");
  expect(p).not.toHaveProperty("thinking");
});

test("pause_turn: asistan içeriği eklenip yeniden gönderilir, harcama toplanır", async () => {
  const paused = {
    stop_reason: "pause_turn",
    usage: USAGE,
    content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } }],
  };
  const { client, calls } = seq([paused, toolMsg([row()])]);
  const out = await lookupPrices(client, { vehicle, needs: needs(1) }, NOW);
  expect(calls).toHaveLength(2);
  const second = calls[1].messages as { role: string; content: unknown }[];
  expect(second).toHaveLength(2);
  expect(second[1]).toEqual({ role: "assistant", content: paused.content });
  expect(out.prices).toHaveLength(1);
  expect(out.usd).toBeCloseTo(0.012, 6);
});

test("en fazla 4 pause_turn turu: sonra invalid_output ve toplanan harcama", async () => {
  const paused = { stop_reason: "pause_turn", usage: USAGE, content: [] };
  const { client, calls } = seq([paused, paused, paused, paused, paused]);
  const err = await lookupPrices(client, { vehicle, needs: needs(1) }, NOW).catch((e) => e);
  expect(err).toBeInstanceOf(AnalysisError);
  expect(err).toMatchObject({ code: "invalid_output" });
  expect(err.usd).toBeCloseTo(0.024, 6);
  expect(calls).toHaveLength(4);
});

test("refusal, truncated, araç çağrısı yok ve SDK hatası AnalysisError olur", async () => {
  const refusal = { stop_reason: "refusal", usage: USAGE, content: [] };
  const trunc = { stop_reason: "max_tokens", usage: USAGE, content: [] };
  const noTool = { stop_reason: "end_turn", usage: USAGE, content: [{ type: "text", text: "fiyat 5 TL" }] };
  const run = (m: unknown) => lookupPrices(seq([m]).client, { vehicle, needs: needs(1) }, NOW).catch((e) => e);
  expect(await run(refusal)).toMatchObject({ code: "refusal", usd: expect.closeTo(0.006, 6) });
  expect(await run(trunc)).toMatchObject({ code: "truncated" });
  expect(await run(noTool)).toMatchObject({ code: "invalid_output" });
  expect(await run(new Error("ağ"))).toMatchObject({ code: "internal", usd: 0 });
});

test("Claude: kaynağı bu aramanın sonuçlarında görünmeyen satır atılır", async () => {
  const { client } = seq([
    toolMsg(
      [
        row(),
        row({ itemId: "b", title: "Uydurma kaynak", sourceUrl: "https://uydurma-fiyat.com/a" }),
        row({ itemId: "c", title: "Alt alan adı", sourceUrl: "https://shop.example.com/urun" }),
      ],
      [searchResult("https://www.example.com/liste"), { type: "web_search_tool_result", tool_use_id: "s2", content: { type: "web_search_tool_result_error", error_code: "unavailable" } }],
    ),
  ]);
  const out = await lookupPrices(client, { vehicle, needs: needs(3) }, NOW);
  expect(out.prices.map((p) => p.forItemId)).toEqual(["a", "c"]);
});

test("Claude: arama sonucu hiç yoksa hiçbir fiyat kabul edilmez", async () => {
  const { client } = seq([toolMsg([row()], [])]);
  expect((await lookupPrices(client, { vehicle, needs: needs(1) }, NOW)).prices).toEqual([]);
});

test("Claude: pause_turn öncesi turdaki arama sonuçları da sayılır", async () => {
  const paused = {
    stop_reason: "pause_turn",
    usage: USAGE,
    content: [
      { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } },
      searchResult("https://example.com/eski-tur"),
    ],
  };
  const { client } = seq([paused, toolMsg([row()], [])]);
  const out = await lookupPrices(client, { vehicle, needs: needs(1) }, NOW);
  expect(out.prices).toHaveLength(1);
});

test("Gemini: yalnız groundingChunks alan adlarındaki kaynaklar kalır; arama sorgusu faturalanır", async () => {
  const fiyatlar = [
    row(),
    row({ itemId: "b", title: "Uydurma", sourceUrl: "https://uydurma-fiyat.com/a" }),
  ];
  const fetchFn: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "```json\n" + JSON.stringify({ fiyatlar }) + "\n```" }] },
            groundingMetadata: {
              webSearchQueries: ["arka çamurluk boya fiyatı"],
              groundingChunks: [
                { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "example.com" } },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 },
      }),
      { status: 200 },
    );
  const client = createClaude("AIzaTest", { fetchFn, geminiModel: "gemini-3.8-flash" });
  const out = await lookupPrices(client, { vehicle, needs: needs(2) }, NOW);
  expect(out.prices.map((p) => p.forItemId)).toEqual(["a"]);
  expect(out.usd).toBeCloseTo((1000 * 1.5 + 100 * 7.5) / 1e6 + 0.014, 9);
});

test("ihtiyaç yoksa çağrı yapılmaz", async () => {
  const { client, calls } = seq([]);
  expect(await lookupPrices(client, { vehicle, needs: [] }, NOW)).toEqual({ prices: [], usd: 0 });
  expect(calls).toHaveLength(0);
});
