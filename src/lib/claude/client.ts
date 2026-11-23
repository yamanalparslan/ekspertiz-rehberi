import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ZodType } from "zod";
import type { ErrorCode } from "@/lib/schema/events";
import { usageToUsd } from "./cost";
import { coerceGeminiJson, toGeminiResponseSchema } from "./gemini-coerce";

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
              // Şema yerel olarak (responseJsonSchema) gönderilir; reddedilirse metin talimatına düşülür.
              const nativeSchema = jsonSchema ? toGeminiResponseSchema(jsonSchema) : null;
              const schemaText = jsonSchema
                ? `Yanıtı YALNIZCA aşağıdaki JSON şemasına tam uyan geçerli bir JSON nesnesi olarak döndür (markdown veya açıklama ekleme):\n${JSON.stringify(jsonSchema)}`
                : null;

              if (jsonSchema) {
                sysTexts.push("Yanıtı YALNIZCA verilen JSON şemasına uyan geçerli bir JSON nesnesi olarak döndür.");
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
                  maxOutputTokens: Math.min(params.max_tokens, 8192),
                  thinkingConfig: { thinkingBudget: 0 },
                  ...(priceTool ? {} : { responseMimeType: "application/json" }),
                  ...(nativeSchema ? { responseJsonSchema: nativeSchema } : {}),
                },
              };
              const withoutNativeSchema = (b: Record<string, unknown>): Record<string, unknown> => {
                const genCfg = { ...(b.generationConfig as Record<string, unknown>) };
                delete genCfg.responseJsonSchema;
                return {
                  ...b,
                  systemInstruction: { parts: [{ text: [...sysTexts, schemaText].join("\n\n") }] },
                  generationConfig: genCfg,
                };
              };
              if (priceTool) {
                body.tools = [{ googleSearch: {} }];
              }

              const candidateModels = [model];
              try {
                const listRes = await fetchFn("https://generativelanguage.googleapis.com/v1beta/models", {
                  headers: { "x-goog-api-key": apiKey },
                  signal: AbortSignal.timeout(8_000),
                });
                if (listRes.ok) {
                  const listData = (await listRes.json()) as {
                    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
                  };
                  const discovered = (listData.models ?? [])
                    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
                    .map((m) => (m.name ?? "").replace(/^models\//, ""))
                    .filter(
                      (n) =>
                        n.startsWith("gemini-") &&
                        !n.includes("tts") &&
                        !n.includes("image") &&
                        !n.includes("embedding") &&
                        !n.includes("robotics") &&
                        !n.includes("computer-use") &&
                        !n.startsWith("gemini-1.") &&
                        !n.startsWith("gemini-2.0") &&
                        !n.startsWith("gemini-2.5"),
                    );
                  console.log("[Gemini Discovered Models]", discovered.join(", "));
                  candidateModels.push(...discovered);
                }
              } catch {
                // Model listesi alınamazsa varsayılan modelle devam et.
              }
              // Tekrarları kaldır.
              const modelsToTry = Array.from(new Set(candidateModels));

              let res: Response | null = null;
              const errors: string[] = [];

              for (const mName of modelsToTry) {
                const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mName)}:generateContent`;
                let reqBody = body;
                for (let attempt = 0; attempt < 3; attempt++) {
                  try {
                    const r = await fetchFn(genUrl, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
                      body: JSON.stringify(reqBody),
                      signal: AbortSignal.timeout(120_000),
                    });
                    if (r.ok) {
                      res = r;
                      break;
                    }
                    const errTxt = await r.text().catch(() => "");
                    errors.push(`${mName}#${attempt + 1}(${r.status}): ${errTxt.slice(0, 180)}`);
                    if (
                      r.status === 400 &&
                      /schema/i.test(errTxt) &&
                      (reqBody.generationConfig as Record<string, unknown>).responseJsonSchema !== undefined
                    ) {
                      reqBody = withoutNativeSchema(reqBody);
                      continue;
                    }
                    if (r.status === 400 && errTxt.includes("thinkingConfig") && attempt === 0) {
                      const genCfg = { ...(reqBody.generationConfig as Record<string, unknown>) };
                      delete genCfg.thinkingConfig;
                      reqBody = { ...reqBody, generationConfig: genCfg };
                      continue;
                    }
                    if (r.status === 503 && attempt < 2) {
                      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
                      continue;
                    }
                    break;
                  } catch (fetchErr) {
                    errors.push(`${mName}#${attempt + 1}(ERR): ${fetchErr instanceof Error ? fetchErr.message : "timeout"}`);
                    break;
                  }
                }
                if (res) break;
              }

              if (!res) {
                const errMsg = errors.join(" | ");
                console.error("[Gemini API Error]", errMsg);
                throw new Error(errMsg);
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

              let finalText = cleanText;
              if (cleanText) {
                try {
                  finalText = JSON.stringify(coerceGeminiJson(JSON.parse(cleanText)));
                } catch {
                  finalText = cleanText;
                }
              }

              return {
                stop_reason: "end_turn",
                usage,
                content: finalText ? [{ type: "text", text: finalText }] : [],
              };
            },
          };
        },
      },
    },
  } as unknown as ClaudeLike;
}

/**
 * Anahtara göre istemci: Gemini anahtarı (AIza… / AQ.…) Gemini uyarlayıcısını, diğerleri
 * Anthropic SDK'sını döndürür. Anahtar yoksa hata fırlatır; çevrimdışı demo yalnız
 * geliştirmede `OFFLINE_DEMO=1` ile `buildDeps` üzerinden açılır.
 */
export function createClaude(
  apiKey: string,
  opts?: { geminiModel?: string; fetchFn?: typeof fetch },
): ClaudeLike {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("createClaude: API anahtarı yok");
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
    console.error("[runStructured call error]", e instanceof Error ? e.message : e);
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
