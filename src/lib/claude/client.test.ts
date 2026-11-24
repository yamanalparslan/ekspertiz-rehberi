import { APIConnectionError } from "@anthropic-ai/sdk";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { AnalysisError, createClaude, providerLabel, runStructured } from "./client";
import { fakeClient, textMsg } from "./testing";

const schema = z.strictObject({ a: z.number() });
const base = { system: "s", content: [], schema, effort: "medium" as const, maxTokens: 32000 };

afterEach(() => vi.restoreAllMocks());

test("istek: model, yedek model, effort, sıcaklık yok", async () => {
  const { client, calls } = fakeClient(textMsg('{"a":1}'));
  const r = await runStructured(client, base);
  expect(r.data).toEqual({ a: 1 });
  expect(calls[0]).toMatchObject({
    model: "claude-opus-5-5",
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_tokens: 32000,
    output_config: { effort: "medium", format: { type: "json_schema" } },
    system: [{ type: "text", text: "s", cache_control: { type: "ephemeral" } }],
  });
  for (const k of ["temperature", "top_p", "top_k", "thinking", "tool_choice"]) {
    expect(calls[0]).not.toHaveProperty(k);
  }
});

test("fallback bloklarında son metin bloğu okunur", async () => {
  const msg = {
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [
      { type: "text", text: "red" },
      { type: "fallback" },
      { type: "text", text: '{"a":2}' },
    ],
  };
  const r = await runStructured(fakeClient(msg).client, base);
  expect(r.data).toEqual({ a: 2 });
});

async function fails(msg: unknown) {
  return runStructured(fakeClient(msg).client, base).catch((e) => e);
}

test("refusal -> AnalysisError refusal, maliyet taşınır", async () => {
  const e = await fails(textMsg("", "refusal", { input_tokens: 1000000, output_tokens: 0 }));
  expect(e).toBeInstanceOf(AnalysisError);
  expect(e.code).toBe("refusal");
  expect(e.usd).toBeCloseTo(4, 6);
});

test("max_tokens -> AnalysisError truncated", async () => {
  const e = await fails(textMsg('{"a":', "max_tokens"));
  expect(e).toBeInstanceOf(AnalysisError);
  expect(e.code).toBe("truncated");
  expect(e.usd).toBeGreaterThan(0);
});

test("şemaya uymayan çıktı -> invalid_output", async () => {
  const e = await fails(textMsg('{"a":"x"}'));
  expect(e.code).toBe("invalid_output");
  expect(e.usd).toBeGreaterThan(0);
});

test("bozuk JSON ve metinsiz yanıt -> invalid_output", async () => {
  expect((await fails(textMsg("not json"))).code).toBe("invalid_output");
  const empty = { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [] };
  expect((await fails(empty)).code).toBe("invalid_output");
});

test("SDK hatası -> internal, cause korunur", async () => {
  const err = new APIConnectionError({ message: "boom" });
  const client = {
    beta: {
      messages: {
        stream: () => ({
          finalMessage: async () => {
            throw err;
          },
        }),
      },
    },
  } as never;
  const e = await runStructured(client, base).catch((x) => x);
  expect(e.code).toBe("internal");
  expect(e.usd).toBe(0);
  expect(e.cause).toBe(err);
});

test("akış ortasında SDK/ağ hatası: o ana kadarki kısmi kullanım harcamaya yazılır", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const err = new APIConnectionError({ message: "boom" });
  // SDK akışı hata verince currentMessage son anlık görüntüyü (message_start/delta kullanımı) taşır.
  const client = {
    beta: {
      messages: {
        stream: () => ({
          currentMessage: { usage: { input_tokens: 10_000, output_tokens: 500, cache_read_input_tokens: 0 } },
          finalMessage: async () => {
            throw err;
          },
        }),
      },
    },
  } as never;
  const e = await runStructured(client, base).catch((x) => x);
  expect(e).toBeInstanceOf(AnalysisError);
  expect(e.code).toBe("internal");
  expect(e.usd).toBeCloseTo((10_000 * 4 + 500 * 20) / 1e6, 9);
});

test("Gemini anahtarı (AIza...) ile createClaude: yapılandırılmış JSON yanıtı", async () => {
  let calledUrl = "";
  const fakeFetch: typeof fetch = async (input) => {
    const u = String(input);
    if (u.endsWith("/v1beta/models")) {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }
    calledUrl = u;
    return new Response(
      JSON.stringify({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: '```json\n{"a":42}\n```' }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const client = createClaude("AIzaSyTestKey123", { fetchFn: fakeFetch });
  const r = await runStructured(client, base);
  expect(r.data).toEqual({ a: 42 });
  expect(calledUrl).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
});

test("betik etiketi hangi sağlayıcının ve hangi fiyat tablosunun kullanıldığını söyler", () => {
  expect(providerLabel("sk-ant-test")).toBe("anthropic claude-opus-5-5 (girdi 4 $/Mtok, çıktı 20 $/Mtok)");
  expect(providerLabel("AIzaTest", { geminiModel: "gemini-3.8-flash" })).toBe(
    "gemini gemini-3.8-flash (girdi 1.5 $/Mtok, çıktı 7.5 $/Mtok)",
  );
  expect(providerLabel("AIzaTest", { geminiModel: "gemini-yeni" })).toContain("üst sınır");
});

test("SDK hatası günlüğe yalnız ad/durum olarak yazılır, ileti yazılmaz", async () => {
  const err = Object.assign(new Error("gizli yanıt gövdesi"), { status: 529 });
  const spy = (await import("vitest")).vi.spyOn(console, "error").mockImplementation(() => {});
  const client = { beta: { messages: { stream: () => ({ finalMessage: async () => { throw err; } }) } } } as never;
  await runStructured(client, base).catch(() => {});
  const logged = JSON.stringify(spy.mock.calls);
  expect(logged).not.toContain("gizli");
  expect(logged).toContain("529");
  spy.mockRestore();
});

// Gemini generateContent sahtesi: istek gövdelerini kaydeder, sıradaki yanıtı döndürür.
function geminiFetch(responses: Array<{ status: number; body: unknown }>) {
  const bodies: Record<string, any>[] = [];
  const urls: string[] = [];
  let i = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const u = String(input);
    if (u.endsWith("/v1beta/models")) return new Response(JSON.stringify({ models: [] }), { status: 200 });
    urls.push(u);
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  };
  return { fetchFn, bodies, urls };
}
const okBody = (text: string) => ({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

const nested = z.strictObject({
  kind: z.enum(["x", "y"]),
  list: z.array(z.enum(["x", "y"])),
  note: z.string().nullable(),
});

test("Gemini: şema yerel olarak responseJsonSchema ile gönderilir ($ref yok, enum tipli)", async () => {
  const g = geminiFetch([{ status: 200, body: okBody('{"kind":"x","list":["y"],"note":null}') }]);
  const r = await runStructured(createClaude("AIzaTest", { fetchFn: g.fetchFn }), { ...base, schema: nested });
  expect(r.data).toEqual({ kind: "x", list: ["y"], note: null });
  const cfg = g.bodies[0].generationConfig;
  expect(cfg.responseMimeType).toBe("application/json");
  const s = JSON.stringify(cfg.responseJsonSchema);
  expect(s).not.toContain("$ref");
  expect(s).not.toContain("$defs");
  expect(cfg.responseJsonSchema.properties.kind).toMatchObject({ type: "string", enum: ["x", "y"] });
  expect(cfg.responseJsonSchema.properties.list.items).toMatchObject({ type: "string", enum: ["x", "y"] });
  // Şema yerel gönderildiğinde sistem metnine ayrıca kopyalanmaz.
  expect(g.bodies[0].systemInstruction.parts[0].text).not.toContain('"properties"');
});

test("Gemini: şema 400 ile reddedilirse bir kez şemasız (metin talimatlı) yeniden denenir", async () => {
  const g = geminiFetch([
    { status: 400, body: { error: { code: 400, message: "Invalid value at 'generation_config.response_json_schema'" } } },
    { status: 200, body: okBody('{"a":7}') },
  ]);
  const r = await runStructured(createClaude("AIzaTest", { fetchFn: g.fetchFn }), base);
  expect(r.data).toEqual({ a: 7 });
  expect(g.bodies).toHaveLength(2);
  expect(g.bodies[1].generationConfig.responseJsonSchema).toBeUndefined();
  expect(g.bodies[1].generationConfig.responseMimeType).toBe("application/json");
  expect(g.bodies[1].systemInstruction.parts[0].text).toContain('"properties"');
});
