// Gemini generateContent uyarlayıcısı: Anthropic `beta.messages.stream(...).finalMessage()`
// biçimini taklit eder; böylece runStructured ve lookupPrices sağlayıcıdan bağımsız kalır.
import type Anthropic from "@anthropic-ai/sdk";
import { geminiUsd, ProviderCallError, type Usage } from "./cost";
import { coerceGeminiJson, toGeminiResponseSchema } from "./gemini-coerce";

type ClaudeLike = Pick<Anthropic, "beta">;

export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
/** Varsayılan tek yedek (aynı fiyat, "Stable"). GEMINI_FALLBACK_MODEL=none yedeği kapatır. */
export const GEMINI_DEFAULT_FALLBACK_MODEL = "gemini-3.6-flash";
/** Gemini 3.x/4 çıktı sınırı (64K); GEMINI_MAX_OUTPUT_TOKENS ile değiştirilebilir. */
export const GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = 65_536;
/** Bir çağrının (yeniden denemeler dahil) toplam süre sınırı. */
export const GEMINI_DEADLINE_MS = 90_000;
const ATTEMPTS_PER_MODEL = 2;
const MAX_FETCHES = 6; // 2 model x 2 deneme + en fazla 2 düzeltme (şema / thinkingConfig)
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const API = "https://generativelanguage.googleapis.com/v1beta/models";

// Gemini 3 varsayılan medya çözünürlüğü: görsel 1120 token, PDF sayfası 560 + metin.
const TOKENS_PER_IMAGE = 1120;
const TOKENS_PER_PDF_PAGE = 1120;

const REFUSAL_FINISH = new Set([
  "SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII",
  "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION",
]);
const OK_FINISH = new Set(["STOP", "FINISH_REASON_UNSPECIFIED"]);

export type GeminiOptions = {
  model?: string;
  /** Yedek model; null ya da "none" ise yok. Verilmezse varsayılan yedek. */
  fallbackModel?: string | null;
  maxOutputTokens?: number;
  fetchFn?: typeof fetch;
  deadlineMs?: number;
  retryDelayMs?: number;
};

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

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    groundingMetadata?: GroundingMetadata;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    toolUsePromptTokenCount?: number;
  };
};
export type GroundingMetadata = {
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  webSearchQueries?: string[];
};

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1].trim() : t;
}

/** Ayrılmış "none"/boş değerler yedeği kapatır; tekrarlar atılır; en fazla iki model. */
export function geminiModelChain(model: string, fallback: string | null): string[] {
  const fb = fallback === null || fallback.trim() === "" || fallback.trim().toLowerCase() === "none" ? null : fallback.trim();
  return [...new Set([model.trim(), ...(fb ? [fb] : [])])].slice(0, 2);
}

function toUsage(model: string, data: GeminiResponse): Usage & { cache_creation_input_tokens: 0; cache_read_input_tokens: 0 } {
  const u = data.usageMetadata ?? {};
  const g = data.candidates?.[0]?.groundingMetadata;
  return {
    input_tokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
    output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    gemini: { model, searchQueries: (g?.webSearchQueries ?? []).filter((q) => q.trim() !== "").length },
  };
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const REDIRECT_HOSTS = new Set(["vertexaisearch.cloud.google.com"]);

/**
 * groundingChunks -> Claude `web_search_tool_result` bloğu. Gemini `web.uri` çoğunlukla
 * vertexaisearch yönlendirme adresidir ve `web.title` kaynak alan adıdır (belge örneği:
 * "uefa.com"); alan adı `domain` alanına konur. Yönlendirme dışı uri'nin ana makinesi de geçerlidir.
 */
export function groundingBlock(g: GroundingMetadata | undefined) {
  const results: { type: "web_search_result"; url: string; title: string; domain?: string }[] = [];
  for (const chunk of g?.groundingChunks ?? []) {
    const uri = chunk.web?.uri ?? "";
    const title = (chunk.web?.title ?? "").trim().toLowerCase().replace(/^www\./, "");
    let host: string | null = null;
    try {
      const h = new URL(uri).hostname.toLowerCase().replace(/^www\./, "");
      host = REDIRECT_HOSTS.has(h) ? null : h;
    } catch {
      host = null;
    }
    const domain = HOSTNAME.test(title) ? title : host;
    if (domain) results.push({ type: "web_search_result", url: uri, title, domain });
  }
  return { type: "web_search_tool_result", tool_use_id: "gemini_search", content: results };
}

function countPdfPages(b64: string): number {
  try {
    const bin = atob(b64);
    const pages = bin.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
    return Math.max(pages, Math.ceil(bin.length / 150_000), 1);
  } catch {
    return 1;
  }
}

/** Yanıt gelmeden kesilen istek için girdi tokenı tahmini (metin ~3 karakter/token). */
export function estimateInputTokens(body: Record<string, unknown>): number {
  let tokens = 0;
  const visit = (parts: unknown) => {
    for (const p of Array.isArray(parts) ? parts : []) {
      const part = p as { text?: string; inlineData?: { mimeType?: string; data?: string } };
      if (typeof part.text === "string") tokens += Math.ceil(part.text.length / 3);
      if (part.inlineData) {
        tokens +=
          part.inlineData.mimeType === "application/pdf"
            ? countPdfPages(part.inlineData.data ?? "") * TOKENS_PER_PDF_PAGE
            : TOKENS_PER_IMAGE;
      }
    }
  };
  visit((body.systemInstruction as { parts?: unknown } | undefined)?.parts);
  for (const c of Array.isArray(body.contents) ? body.contents : []) visit((c as { parts?: unknown }).parts);
  return tokens;
}

const isAbort = (e: unknown) =>
  e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createGeminiClient(apiKey: string, opts: GeminiOptions = {}): ClaudeLike {
  const fetchFn = opts.fetchFn ?? fetch;
  const models = geminiModelChain(
    opts.model ?? GEMINI_DEFAULT_MODEL,
    opts.fallbackModel === undefined ? GEMINI_DEFAULT_FALLBACK_MODEL : opts.fallbackModel,
  );
  const outputLimit = opts.maxOutputTokens && opts.maxOutputTokens > 0 ? opts.maxOutputTokens : GEMINI_DEFAULT_MAX_OUTPUT_TOKENS;
  const deadlineMs = opts.deadlineMs ?? GEMINI_DEADLINE_MS;
  const retryDelayMs = opts.retryDelayMs ?? 1500;

  async function call(params: StreamParams) {
    const sysTexts = (params.system ?? []).map((b) => b.text ?? "").filter(Boolean);
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
      const blocks = Array.isArray(m.content) ? (m.content as Record<string, unknown>[]) : [];
      const parts = blocks.map((b) => {
        if (b.type === "text") return { text: String(b.text ?? "") };
        if (b.type === "image" || b.type === "document") {
          const src = (b.source ?? {}) as { media_type?: string; data?: string };
          return { inlineData: { mimeType: src.media_type ?? "application/octet-stream", data: src.data ?? "" } };
        }
        return { text: JSON.stringify(b) };
      });
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });

    let body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: sysTexts.join("\n\n") }] },
      contents,
      generationConfig: {
        maxOutputTokens: Math.min(params.max_tokens, outputLimit),
        thinkingConfig: { thinkingBudget: 0 },
        ...(priceTool ? {} : { responseMimeType: "application/json" }),
        ...(nativeSchema ? { responseJsonSchema: nativeSchema } : {}),
      },
      ...(priceTool ? { tools: [{ googleSearch: {} }] } : {}),
    };
    const genCfg = () => body.generationConfig as Record<string, unknown>;
    // Yanıtı okunamayan ama gönderilmiş istek: girdi tahmini (+ istenirse çıktı sınırı, üst sınır).
    const sentUsd = (model: string, withOutput: boolean) => {
      const maxOut = Number(genCfg().maxOutputTokens);
      return geminiUsd(model, estimateInputTokens(body), withOutput && Number.isFinite(maxOut) ? maxOut : 0);
    };
    const dropFromConfig = (key: string, extraSystem?: string | null) => {
      const cfg = { ...genCfg() };
      delete cfg[key];
      body = {
        ...body,
        generationConfig: cfg,
        ...(extraSystem ? { systemInstruction: { parts: [{ text: [...sysTexts, extraSystem].join("\n\n") }] } } : {}),
      };
    };

    const deadline = AbortSignal.timeout(deadlineMs);
    let fetches = 0;
    let data: GeminiResponse | null = null;
    let usedModel = models[0];

    chain: for (const model of models) {
      let attempt = 0;
      while (attempt < ATTEMPTS_PER_MODEL && fetches < MAX_FETCHES) {
        if (deadline.aborted) throw new ProviderCallError("timeout", 0);
        fetches++;
        let res: Response;
        try {
          res = await fetchFn(`${API}/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(body),
            signal: deadline,
          });
        } catch (e) {
          // İstek gönderildi ve süre doldu: girdi ve üretilen çıktı faturalanmış olabilir; harcama
          // tavanı için girdi tahmini + çıktı sınırı (üst sınır) yazılır. Başka deneme/model yok.
          if (deadline.aborted || isAbort(e)) throw new ProviderCallError("timeout", sentUsd(model, true));
          // Ağ hatası: istek gönderilmiş olabilir (ayırt edilemez); girdi tahmini yazılır.
          throw new ProviderCallError("network", sentUsd(model, false));
        }
        if (res.ok) {
          try {
            data = (await res.json()) as GeminiResponse;
          } catch {
            // Yanıt geldi ama okunamadı: çıktı üretilmiş ve faturalanmıştır (üst sınır).
            throw new ProviderCallError("bad_response", sentUsd(model, true));
          }
          usedModel = model;
          break chain;
        }
        const status = res.status;
        const errText = status === 400 ? await res.text().catch(() => "") : "";
        if (status !== 400) await res.body?.cancel().catch(() => {});
        if (status === 400 && genCfg().responseJsonSchema !== undefined && /schema/i.test(errText)) {
          dropFromConfig("responseJsonSchema", schemaText);
          continue;
        }
        if (status === 400 && genCfg().thinkingConfig !== undefined && /thinking/i.test(errText)) {
          dropFromConfig("thinkingConfig");
          continue;
        }
        if (status === 404) continue chain; // model yok: yedeğe geç
        if (!RETRYABLE.has(status)) throw new ProviderCallError(`http_${status}`, 0);
        attempt++;
        if (attempt < ATTEMPTS_PER_MODEL) {
          try {
            await sleep(retryDelayMs * attempt, deadline);
          } catch {
            throw new ProviderCallError("timeout", 0);
          }
        }
      }
    }
    if (!data) throw new ProviderCallError("unavailable", 0);

    const usage = toUsage(usedModel, data);
    if (data.promptFeedback?.blockReason) return { stop_reason: "refusal", usage, content: [] };
    const cand = data.candidates?.[0];
    const finish = cand?.finishReason ?? "STOP";
    if (REFUSAL_FINISH.has(finish)) return { stop_reason: "refusal", usage, content: [] };
    if (finish === "MAX_TOKENS") return { stop_reason: "max_tokens", usage, content: [] };
    // Bilinmeyen/bozuk bitiş (OTHER, MALFORMED_*, ...): metin yok sayılır -> invalid_output.
    if (!cand || !OK_FINISH.has(finish)) return { stop_reason: "end_turn", usage, content: [] };

    const rawText = (cand.content?.parts ?? [])
      .filter((p) => p.thought !== true)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    const cleanText = stripJsonFence(rawText);

    if (priceTool) {
      let input: unknown;
      try {
        input = JSON.parse(cleanText);
      } catch {
        input = cleanText; // InputSchema bozuk girdiyi reddeder
      }
      return {
        stop_reason: "tool_use",
        usage,
        content: [
          // Temellendirme kaynakları Claude'un arama sonucu biçiminde: lookupPrices kaynak denetimi yapar.
          groundingBlock(cand.groundingMetadata),
          { type: "tool_use", id: "gemini_tool_1", name: "fiyatlari_kaydet", input },
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
    return { stop_reason: "end_turn", usage, content: finalText ? [{ type: "text", text: finalText }] : [] };
  }

  return {
    beta: {
      messages: {
        stream(params: StreamParams) {
          return { finalMessage: () => call(params) };
        },
      },
    },
  } as unknown as ClaudeLike;
}
