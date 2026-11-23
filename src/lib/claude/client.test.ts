import { APIConnectionError } from "@anthropic-ai/sdk";
import { expect, test } from "vitest";
import { z } from "zod";
import { AnalysisError, createClaude, runStructured } from "./client";
import { fakeClient, textMsg } from "./testing";

const schema = z.strictObject({ a: z.number() });
const base = { system: "s", content: [], schema, effort: "medium" as const, maxTokens: 32000 };

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

test("Gemini anahtarı (AIza...) ile createClaude: yapılandırılmış JSON yanıtı", async () => {
  let calledUrl = "";
  const fakeFetch: typeof fetch = async (input) => {
    calledUrl = String(input);
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
