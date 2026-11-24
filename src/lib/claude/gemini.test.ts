import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { AnalysisError, createClaude, runStructured } from "./client";
import { geminiUsd, usageToUsd } from "./cost";

const schema = z.strictObject({ a: z.number() });
const base = { system: "s", content: [], schema, effort: "medium" as const, maxTokens: 32000 };

type Reply = { status: number; body?: unknown } | "hang";
// Sahte generateContent: istekleri kaydeder; "hang" isteği iptal sinyaline kadar bekletir.
function fake(replies: Reply[]) {
  const calls: { url: string; body: Record<string, any> }[] = [];
  let i = 0;
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r === "hang") {
      return new Promise((_res, rej) => {
        const sig = init?.signal;
        const abort = () => rej(sig?.reason ?? new DOMException("aborted", "AbortError"));
        if (sig?.aborted) abort();
        else sig?.addEventListener("abort", abort);
      });
    }
    return Promise.resolve(new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status }));
  };
  return { fetchFn, calls };
}
const ok = (text: string, usageMetadata: Record<string, number> = { promptTokenCount: 10, candidatesTokenCount: 5 }, extra: object = {}) => ({
  status: 200,
  body: { candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }], usageMetadata, ...extra },
});
const finish = (finishReason: string) => ({
  status: 200,
  body: { candidates: [{ finishReason, content: { parts: [{ text: '{"a":1}' }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 10 } },
});
const client = (f: ReturnType<typeof fake>, o: Record<string, unknown> = {}) =>
  createClaude("AIzaTest", { fetchFn: f.fetchFn, retryDelayMs: 0, ...o });

afterEach(() => vi.restoreAllMocks());

test("maliyet: düşünme ve araç istemi tokenları faturaya girer", async () => {
  const f = fake([ok('{"a":1}', { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 5000 })]);
  const r = await runStructured(client(f, { geminiModel: "gemini-3.8-flash" }), base);
  // gemini-3.8-flash: 1,50 $ girdi / 7,50 $ çıktı (düşünme dahil) milyon token başına.
  expect(r.usd).toBeCloseTo((1000 * 1.5 + 5100 * 7.5) / 1e6, 9);
  expect(r.usd).toBeGreaterThan((1000 * 1.5 + 100 * 7.5) / 1e6);

  const g = fake([ok('{"a":1}', { promptTokenCount: 1000, toolUsePromptTokenCount: 2000, candidatesTokenCount: 100 })]);
  const r2 = await runStructured(client(g, { geminiModel: "gemini-3.8-flash" }), base);
  expect(r2.usd).toBeCloseTo((3000 * 1.5 + 100 * 7.5) / 1e6, 9);
});

test("fiyat tablosu: aileye göre; bilinmeyen model Opus fiyatıyla (üst sınır) hesaplanır", () => {
  expect(geminiUsd("gemini-3.5-flash-lite", 1e6, 1e6)).toBeCloseTo(0.3 + 2.5, 6);
  expect(geminiUsd("gemini-3.8-flash", 1e6, 1e6)).toBeCloseTo(1.5 + 7.5, 6);
  expect(geminiUsd("gemini-3.1-pro-preview", 1e6, 1e6)).toBeCloseTo(4 + 18, 6);
  expect(geminiUsd("gemini-99-mystery", 1e6, 1e6)).toBeCloseTo(4 + 20, 6);
  // Arama sorgusu başına 14 $/1000.
  expect(geminiUsd("gemini-3.8-flash", 0, 0, 2)).toBeCloseTo(0.028, 6);
  // Anthropic kullanımı değişmez.
  expect(usageToUsd({ input_tokens: 1e6, output_tokens: 0 })).toBeCloseTo(4, 6);
});

test("model listesi keşfi yok: yalnız yapılandırılan model ve tek yedek denenir", async () => {
  const f = fake([ok('{"a":1}')]);
  await runStructured(client(f, { geminiModel: "gemini-x-flash" }), base);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-x-flash:generateContent");
});

test("hep 503: çağrı sayısı sınırlı (2 model x 2 deneme), sonuç internal", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const f = fake([{ status: 503, body: { error: { message: "overloaded: secret body" } } }]);
  const e = await runStructured(client(f, { geminiModel: "m1", geminiFallbackModel: "m2" }), base).catch((x) => x);
  expect(e).toBeInstanceOf(AnalysisError);
  expect(e.code).toBe("internal");
  expect(e.usd).toBe(0);
  expect(f.calls).toHaveLength(4);
  expect(f.calls.map((c) => c.url.match(/models\/([^:]+)/)![1])).toEqual(["m1", "m1", "m2", "m2"]);
  // Günlükte yanıt gövdesi ya da model listesi yok.
  const logged = JSON.stringify([...log.mock.calls, ...err.mock.calls]);
  expect(logged).not.toContain("secret body");
});

test("yedek 'none' ise tek model", async () => {
  const f = fake([{ status: 503 }]);
  await runStructured(client(f, { geminiModel: "m1", geminiFallbackModel: "none" }), base).catch(() => {});
  expect(f.calls).toHaveLength(2);
});

test("404 (model yok) yedeğe geçer", async () => {
  const f = fake([{ status: 404 }, ok('{"a":3}')]);
  const r = await runStructured(client(f, { geminiModel: "m1", geminiFallbackModel: "m2" }), base);
  expect(r.data).toEqual({ a: 3 });
  expect(f.calls.map((c) => c.url.match(/models\/([^:]+)/)![1])).toEqual(["m1", "m2"]);
});

test("zaman aşımı: başka deneme ya da model yok; gönderilen girdi için tahmini harcama yazılır", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const f = fake(["hang", ok('{"a":1}')]);
  const e = await runStructured(
    client(f, { geminiModel: "gemini-3.8-flash", geminiFallbackModel: "m2", deadlineMs: 30 }),
    { ...base, system: "x".repeat(3000) },
  ).catch((x) => x);
  expect(e).toBeInstanceOf(AnalysisError);
  expect(e.code).toBe("internal");
  expect(f.calls).toHaveLength(1);
  // En az sistem metni (3000 karakter ≈ 1000 token) x girdi fiyatı.
  expect(e.usd).toBeGreaterThanOrEqual((1000 * 1.5) / 1e6);
});

test("zaman aşımı tahmini çıktı üst sınırını da içerir (harcama tavanı için üst sınır)", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const f = fake(["hang"]);
  const e = await runStructured(
    client(f, { geminiModel: "gemini-3.8-flash", geminiFallbackModel: "none", deadlineMs: 30 }),
    { ...base, system: "x".repeat(3000) },
  ).catch((x) => x);
  expect(e.code).toBe("internal");
  // Girdi tahmini (≥1000 token) + istenen çıktı sınırı (32000 token) x Flash fiyatları.
  expect(e.usd).toBeGreaterThanOrEqual((1000 * 1.5 + 32000 * 7.5) / 1e6);
});

test("gönderimden sonra ağ hatası: girdi tahmini harcamaya yazılır (0 değil)", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetchFn: typeof fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const e = await runStructured(
    createClaude("AIzaTest", { fetchFn, geminiModel: "gemini-3.8-flash", geminiFallbackModel: "none", retryDelayMs: 0 }),
    { ...base, system: "x".repeat(3000) },
  ).catch((x) => x);
  expect(e).toBeInstanceOf(AnalysisError);
  expect(e.code).toBe("internal");
  expect(e.usd).toBeGreaterThanOrEqual((1000 * 1.5) / 1e6);
});

test("tek bir genel süre sınırı yeniden denemeleri de kapsar", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const f = fake([{ status: 503 }]);
  const started = Date.now();
  const e = await runStructured(
    client(f, { geminiModel: "m1", geminiFallbackModel: "m2", deadlineMs: 40, retryDelayMs: 1000 }),
    base,
  ).catch((x) => x);
  expect(e.code).toBe("internal");
  expect(Date.now() - started).toBeLessThan(900);
  expect(f.calls).toHaveLength(1);
});

test("finishReason eşlemesi: güvenlik/SPII/alıntı -> refusal, MAX_TOKENS -> truncated, diğerleri -> invalid_output", async () => {
  const code = async (r: Reply) => (await runStructured(client(fake([r])), base).catch((x) => x)).code;
  expect(await code(finish("SAFETY"))).toBe("refusal");
  expect(await code(finish("SPII"))).toBe("refusal");
  expect(await code(finish("RECITATION"))).toBe("refusal");
  expect(await code(finish("PROHIBITED_CONTENT"))).toBe("refusal");
  expect(await code(finish("MAX_TOKENS"))).toBe("truncated");
  expect(await code(finish("MALFORMED_RESPONSE"))).toBe("invalid_output");
  expect(await code(finish("OTHER"))).toBe("invalid_output");
  expect(
    await code({ status: 200, body: { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 5 } } }),
  ).toBe("refusal");
  // Ret de faturalanır.
  const e = await runStructured(client(fake([finish("SAFETY")])), base).catch((x) => x);
  expect(e.usd).toBeGreaterThan(0);
});

test("maxOutputTokens 8192 ile kırpılmaz: isteğin max_tokens'ı ve modelin çıktı sınırı", async () => {
  const f = fake([ok('{"a":1}')]);
  await runStructured(client(f), base);
  expect(f.calls[0].body.generationConfig.maxOutputTokens).toBe(32000);
  const g = fake([ok('{"a":1}')]);
  await runStructured(client(g, { geminiMaxOutputTokens: 16000 }), base);
  expect(g.calls[0].body.generationConfig.maxOutputTokens).toBe(16000);
  const h = fake([ok('{"a":1}')]);
  await runStructured(client(h), { ...base, maxTokens: 200000 });
  expect(h.calls[0].body.generationConfig.maxOutputTokens).toBe(65536);
});
