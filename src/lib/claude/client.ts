import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ZodType } from "zod";
import type { ErrorCode } from "@/lib/schema/events";
import { usageToUsd } from "./cost";
import { buildPicantoInterpretation, PICANTO_RAW_EXTRACTION } from "./offline-demo";

export const MODEL = "claude-opus-5-5";
const BETAS: ["server-side-fallback-2026-07-01"] = ["server-side-fallback-2026-07-01"];

export type ClaudeLike = Pick<Anthropic, "beta">;
export type ContentBlockParam = BetaContentBlockParam;

export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";

type StreamParams = {
  max_tokens: number;
  system?: Array<{ type: string; text?: string }>;
  messages: Array<{ role: string; content: unknown }>;
  tools?: Array<{ name?: string; input_schema?: unknown }>;
  output_config?: {
    effort?: "medium" | "high";
    format?: { type?: string; schema?: unknown; json_schema?: { schema?: unknown } };
  };
};

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1].trim() : t;
}

function createGeminiClaudeLike(
  apiKey: string,
  opts?: { geminiModel?: string; fetchFn?: typeof fetch },
): ClaudeLike {
  const fetchFn = opts?.fetchFn ?? fetch;
  const model = opts?.geminiModel ?? process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL;

  return {
    beta: {
      messages: {
        stream(params: StreamParams) {
          return {
            async finalMessage() {
              const sysTexts = (params.system ?? [])
                .map((b) => b.text ?? "")
                .filter(Boolean);
              const fmt = params.output_config?.format;
              const jsonSchema = fmt?.schema ?? fmt?.json_schema?.schema;
              const priceTool = (params.tools ?? []).find((t) => t.name === "fiyatlari_kaydet");

              if (jsonSchema) {
                sysTexts.push(
                  `Yanıtı YALNIZCA aşağıdaki JSON şemasına tam uyan geçerli bir JSON nesnesi olarak döndür (markdown veya açıklama ekleme):\n${JSON.stringify(jsonSchema)}`,
                );
              } else if (priceTool) {
                sysTexts.push(
                  `Arama sonuçlarını YALNIZCA {"fiyatlar": [...]} biçiminde geçerli bir JSON nesnesi olarak döndür. Şema:\n${JSON.stringify(priceTool.input_schema)}`,
                );
              }

              const contents = params.messages.map((m) => {
                const blocks = Array.isArray(m.content) ? m.content : [];
                const parts = blocks.map((b: Record<string, unknown>) => {
                  if (b.type === "text") return { text: String(b.text ?? "") };
                  if (b.type === "image" || b.type === "document") {
                    const src = (b.source ?? {}) as { media_type?: string; data?: string };
                    return {
                      inlineData: {
                        mimeType: src.media_type ?? "application/octet-stream",
                        data: src.data ?? "",
                      },
                    };
                  }
                  return { text: JSON.stringify(b) };
                });
                return {
                  role: m.role === "assistant" ? "model" : "user",
                  parts,
                };
              });

              const body: Record<string, unknown> = {
                systemInstruction: {
                  parts: [{ text: sysTexts.join("\n\n") }],
                },
                contents,
                generationConfig: {
                  maxOutputTokens: params.max_tokens,
                  ...(priceTool ? {} : { responseMimeType: "application/json" }),
                },
              };
              if (priceTool) {
                body.tools = [{ googleSearch: {} }];
              }

              const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
              const vtxUrl = `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

              let res = await fetchFn(genUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
                body: JSON.stringify(body),
              });
              if (!res.ok) {
                const firstErr = await res.text().catch(() => "");
                const altRes = await fetchFn(vtxUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
                  body: JSON.stringify(body),
                });
                if (altRes.ok) {
                  res = altRes;
                } else {
                  const secondErr = await altRes.text().catch(() => "");
                  const errMsg = `Gemini HTTP ${res.status}: ${firstErr.slice(0, 250)} | Alt HTTP ${altRes.status}: ${secondErr.slice(0, 250)}`;
                  console.error("[Gemini API Error]", errMsg);
                  throw new Error(errMsg);
                }
              }
              const data = (await res.json()) as {
                candidates?: Array<{
                  finishReason?: string;
                  content?: { parts?: Array<{ text?: string }> };
                }>;
                usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
              };

              const cand = data.candidates?.[0];
              const finish = cand?.finishReason ?? "STOP";
              const usage = {
                input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
                output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              };

              if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
                return { stop_reason: "refusal", usage, content: [] };
              }
              if (finish === "MAX_TOKENS") {
                return { stop_reason: "max_tokens", usage, content: [] };
              }

              const rawText = (cand?.content?.parts ?? [])
                .map((p) => p.text ?? "")
                .join("")
                .trim();
              const cleanText = stripJsonFence(rawText);

              if (priceTool) {
                let parsedInput: unknown = { fiyatlar: [] };
                try {
                  parsedInput = JSON.parse(cleanText);
                } catch {
                  // Bozuk JSON durumunda InputSchema veya üst katman yakalar.
                  parsedInput = cleanText;
                }
                return {
                  stop_reason: "tool_use",
                  usage,
                  content: [
                    {
                      type: "tool_use",
                      id: "gemini_tool_1",
                      name: "fiyatlari_kaydet",
                      input: parsedInput,
                    },
                  ],
                };
              }

              return {
                stop_reason: "end_turn",
                usage,
                content: cleanText ? [{ type: "text", text: cleanText }] : [],
              };
            },
          };
        },
      },
    },
  } as unknown as ClaudeLike;
}

function createOfflineDemoClaudeLike(): ClaudeLike {
  return {
    beta: {
      messages: {
        stream(params: StreamParams) {
          return {
            async finalMessage() {
              const priceTool = (params.tools ?? []).find((t) => t.name === "fiyatlari_kaydet");
              const usage = {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              };
              if (priceTool) {
                return {
                  stop_reason: "tool_use",
                  usage,
                  content: [{ type: "tool_use", id: "offline_price_1", name: "fiyatlari_kaydet", input: { fiyatlar: [] } }],
                };
              }
              const blocks = Array.isArray(params.messages[0]?.content) ? params.messages[0].content : [];
              const hasMedia = blocks.some(
                (b: Record<string, unknown>) => b.type === "document" || b.type === "image",
              );
              if (hasMedia) {
                return {
                  stop_reason: "end_turn",
                  usage,
                  content: [{ type: "text", text: JSON.stringify(PICANTO_RAW_EXTRACTION) }],
                };
              }
              const firstText = String((blocks[0] as { text?: string } | undefined)?.text ?? "{}");
              const interp = buildPicantoInterpretation(firstText);
              return {
                stop_reason: "end_turn",
                usage,
                content: [{ type: "text", text: JSON.stringify(interp) }],
              };
            },
          };
        },
      },
    },
  } as unknown as ClaudeLike;
}

export function createClaude(
  apiKey: string,
  opts?: { geminiModel?: string; fetchFn?: typeof fetch },
): ClaudeLike {
  if (!apiKey || apiKey === "offline-local-demo") {
    return createOfflineDemoClaudeLike();
  }
  if (apiKey.startsWith("AIza") || apiKey.startsWith("AQ.")) {
    return createGeminiClaudeLike(apiKey, opts);
  }
  return new Anthropic({ apiKey });
}

export class AnalysisError extends Error {
  readonly code: ErrorCode;
  /** O ana kadar harcanan tutar (USD); bilinmiyorsa 0. */
  readonly usd: number;
  constructor(code: ErrorCode, usd: number, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = "AnalysisError";
    this.code = code;
    this.usd = usd;
  }
}

export async function runStructured<T>(
  client: ClaudeLike,
  p: {
    system: string;
    content: ContentBlockParam[];
    schema: ZodType<T>;
    effort: "medium" | "high";
    maxTokens: number;
  },
): Promise<{ data: T; usd: number }> {
  let msg;
  try {
    msg = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: p.maxTokens,
        betas: BETAS,
        fallbacks: "default",
        system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: p.content }],
        output_config: { effort: p.effort, format: betaZodOutputFormat(p.schema) },
      })
      .finalMessage();
  } catch (e) {
    throw new AnalysisError("internal", 0, "claude call failed", { cause: e });
  }

  const usd = usageToUsd(msg.usage);
  if (msg.stop_reason === "refusal") throw new AnalysisError("refusal", usd);
  if (msg.stop_reason === "max_tokens") throw new AnalysisError("truncated", usd);

  // Yedek modelde yanıt birden çok blok içerebilir: son metin bloğu geçerlidir.
  let text: string | undefined;
  for (const b of msg.content) if (b.type === "text") text = b.text;
  if (text === undefined) throw new AnalysisError("invalid_output", usd, "no text block");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new AnalysisError("invalid_output", usd, "invalid JSON", { cause: e });
  }
  const parsed = p.schema.safeParse(json);
  if (!parsed.success) {
    throw new AnalysisError("invalid_output", usd, "schema mismatch", { cause: parsed.error });
  }
  return { data: parsed.data, usd };
}
