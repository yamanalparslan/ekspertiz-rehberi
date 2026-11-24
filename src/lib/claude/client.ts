import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ZodType } from "zod";
import type { ErrorCode } from "@/lib/schema/events";
import { geminiRates, ProviderCallError, usageToUsd, type Usage } from "./cost";
import { createGeminiClient, GEMINI_DEFAULT_MODEL } from "./gemini";

export const MODEL = "claude-opus-5-5";
const BETAS: ["server-side-fallback-2026-07-01"] = ["server-side-fallback-2026-07-01"];

export type ClaudeLike = Pick<Anthropic, "beta">;
export type ContentBlockParam = BetaContentBlockParam;
export { GEMINI_DEFAULT_MODEL };

export type Provider = "anthropic" | "gemini";

export const providerOf = (apiKey: string): Provider =>
  apiKey.startsWith("AIza") || apiKey.startsWith("AQ.") ? "gemini" : "anthropic";

export type CreateClaudeOptions = {
  /** Gemini: birincil model (yoksa GEMINI_MODEL ortam değişkeni, o da yoksa varsayılan). */
  geminiModel?: string;
  /** Gemini: en fazla bir yedek; "none" kapatır (yoksa GEMINI_FALLBACK_MODEL, o da yoksa varsayılan). */
  geminiFallbackModel?: string;
  /** Gemini: modelin çıktı token sınırı (yoksa GEMINI_MAX_OUTPUT_TOKENS, o da yoksa 65536). */
  geminiMaxOutputTokens?: number;
  fetchFn?: typeof fetch;
  deadlineMs?: number;
  retryDelayMs?: number;
};

/**
 * Anahtara göre istemci: Gemini anahtarı (AIza… / AQ.…) Gemini uyarlayıcısını, diğerleri
 * Anthropic SDK'sını döndürür. Anahtar yoksa hata fırlatır; çevrimdışı demo yalnız
 * geliştirmede `OFFLINE_DEMO=1` ile `buildDeps` üzerinden açılır.
 */
export function createClaude(apiKey: string, opts: CreateClaudeOptions = {}): ClaudeLike {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("createClaude: API anahtarı yok");
  }
  if (providerOf(apiKey) === "gemini") {
    const envMax = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
    return createGeminiClient(apiKey, {
      model: opts.geminiModel || process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
      fallbackModel: opts.geminiFallbackModel ?? process.env.GEMINI_FALLBACK_MODEL,
      maxOutputTokens: opts.geminiMaxOutputTokens ?? (Number.isFinite(envMax) && envMax > 0 ? envMax : undefined),
      fetchFn: opts.fetchFn,
      deadlineMs: opts.deadlineMs,
      retryDelayMs: opts.retryDelayMs,
    });
  }
  return new Anthropic({ apiKey });
}

/**
 * Betikler (smoke/değerlendirme) için: çalışacak sağlayıcı, model ve harcamanın hangi fiyat
 * tablosuyla hesaplanacağı. Gemini kullanımında `usageToUsd` Gemini tablosunu kendisi seçer.
 */
export function providerLabel(apiKey: string, opts: { geminiModel?: string } = {}): string {
  if (providerOf(apiKey) === "anthropic") {
    return `anthropic ${MODEL} (girdi 4 $/Mtok, çıktı 20 $/Mtok)`;
  }
  const model = opts.geminiModel || process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  const r = geminiRates(model);
  return `gemini ${model} (girdi ${r.input} $/Mtok, çıktı ${r.output} $/Mtok${r.upperBound ? ", bilinmeyen model: Opus fiyatı üst sınır" : ""})`;
}

/** Günlük sözleşmesi: yalnız hata adı ve kodu/durumu; ileti ya da yanıt gövdesi yazılmaz. */
export function logProviderError(e: unknown): void {
  const name = e instanceof Error ? e.name : "unknown";
  const reason = e instanceof ProviderCallError ? e.reason : undefined;
  const status =
    e && typeof e === "object" && "status" in e && typeof (e as { status?: unknown }).status === "number"
      ? (e as { status: number }).status
      : undefined;
  console.error(JSON.stringify({ event: "llm_error", name, ...(reason ? { reason } : {}), ...(status ? { status } : {}) }));
}

/**
 * Akış yarıda hata verdiyse SDK akışının son anlık görüntüsündeki (message_start / message_delta)
 * kısmi kullanım; yoksa 0. Gemini uyarlayıcısı bu alanı taşımaz (tahmini ProviderCallError.usd'dedir).
 */
export function partialStreamUsd(stream: unknown): number {
  try {
    const u = (stream as { currentMessage?: { usage?: Usage | null } | null } | undefined)?.currentMessage?.usage;
    if (!u || typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number") return 0;
    const usd = usageToUsd(u);
    return Number.isFinite(usd) && usd > 0 ? usd : 0;
  } catch {
    return 0;
  }
}

/** Başarısız çağrıda o ana kadarki (tahmini) harcama: sağlayıcı tahmini ya da akıştaki kısmi kullanım. */
export const failedCallUsd = (e: unknown, stream?: unknown): number =>
  Math.max(e instanceof ProviderCallError && Number.isFinite(e.usd) ? e.usd : 0, partialStreamUsd(stream));

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
  let stream: unknown;
  try {
    const s = client.beta.messages.stream({
      model: MODEL,
      max_tokens: p.maxTokens,
      betas: BETAS,
      fallbacks: "default",
      system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: p.content }],
      output_config: { effort: p.effort, format: betaZodOutputFormat(p.schema) },
    });
    stream = s;
    msg = await s.finalMessage();
  } catch (e) {
    logProviderError(e);
    throw new AnalysisError("internal", failedCallUsd(e, stream), "claude call failed", { cause: e });
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
