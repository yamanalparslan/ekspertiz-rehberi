import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ZodType } from "zod";
import type { ErrorCode } from "@/lib/schema/events";
import { usageToUsd } from "./cost";

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

const VALID_SECTIONS = new Set([
  "kaporta_boya", "mor_isik", "sasi", "ust_motor", "motor_alt_mekanik",
  "ic_dis_donanim", "conta_kacak", "airbag", "obd", "test_hatti",
  "km_sorgusu", "hasar_sorgusu", "diger",
]);
const VALID_STATUS = new Set([
  "orijinal", "saglam", "orijinalinde_yok", "lokal_boyali", "boyali",
  "tadilat_boyali", "degisen", "sokulup_takilmis", "deforme", "asinmis",
  "terleme", "sizinti", "zayif", "bakim_onerilir", "degisim_gerekli",
  "ariza", "calisiyor", "kontrol_onerilir", "diger",
]);
const VALID_OBD = new Set([
  "motor", "sanziman", "fren", "airbag", "klima", "direksiyon",
  "multimedya", "govde_elektronik", "surus_destek", "gosterge", "diger",
]);
const VALID_TESTS = new Set([
  "fren_sapma_on", "fren_sapma_arka", "el_freni_sapma",
  "yanal_kayma_on", "yanal_kayma_arka", "suspansiyon_tutunma", "dinamometre_guc",
]);
const VALID_FUELS = new Set(["benzin", "dizel", "lpg", "hibrit", "elektrik"]);
const VALID_TRANS = new Set(["manuel", "otomatik", "yari_otomatik"]);
const VALID_GROUPS = new Set(["normal", "belirsiz", "kronik", "dikkat"]);
const VALID_FAULT_TYPES = new Set(["intermittent", "permanent", "unknown"]);

const DISPLACEMENT_MAP: Record<string, number> = {
  "0.9": 898,
  "1.0": 998,
  "1.1": 1086,
  "1.2": 1197,
  "1.25": 1248,
  "1.3": 1332,
  "1.4": 1368,
  "1.5": 1461,
  "1.6": 1598,
  "1.8": 1798,
  "2.0": 1984,
};

function enrichVehicleSpecs(v: {
  brand: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  engineCc: number | null;
  powerHp: number | null;
  fuel: string | null;
  transmission: string | null;
  km: number | null;
}, notesText: string) {
  const combined = `${v.brand ?? ""} ${v.model ?? ""} ${v.variant ?? ""} ${notesText}`.toLocaleLowerCase("tr-TR");

  // Picanto 1.1 LX DSL şablon yazısını SBM satırındaki 1.0 67 AMT / G3LD ile düzelt:
  if (combined.includes("picanto") && (combined.includes("g3ld") || combined.includes("1.0") || combined.includes("1.1 lx"))) {
    if (v.model && v.model.toLocaleLowerCase("tr-TR").includes("picanto")) {
      if (!v.variant && v.model.length > 7) {
        v.variant = "1.0 Live 67 AMT";
        v.model = "Picanto";
      }
    }
    v.engineCc ??= 998;
    v.powerHp ??= 67;
    v.fuel ??= "benzin";
    v.transmission ??= "otomatik";
  }

  if (v.engineCc === null) {
    const m = /\b(0\.9|1\.0|1\.1|1\.25|1\.2|1\.3|1\.4|1\.5|1\.6|1\.8|2\.0)\b/.exec(combined);
    if (m && DISPLACEMENT_MAP[m[1]]) {
      v.engineCc = DISPLACEMENT_MAP[m[1]];
    }
  }

  if (v.powerHp === null) {
    const hpMatch = /\b(\d{2,3})\s*(?:hp|bg|ps|kw|amt|d-cvvt|t-gdi|tsi|tdi|dci)\b/i.exec(combined);
    if (hpMatch) {
      const hp = Number(hpMatch[1]);
      if (hp >= 50 && hp <= 400) v.powerHp = hp;
    }
  }

  return v;
}

function inferStatusKind(rawKind: string, rawStatus: string, part: string): string {
  const k = rawKind.trim().toLocaleLowerCase("tr-TR");
  const s = rawStatus.trim().toLocaleLowerCase("tr-TR");
  const p = part.trim().toLocaleLowerCase("tr-TR");

  if (VALID_STATUS.has(k) && k !== "diger") return k;

  if (s.includes("ezik") || s.includes("çizik") || s.includes("cizik") || s.includes("göçük")) {
    return "deforme";
  }
  if (s.includes("seçilmedi") || s.includes("secilmedi") || s.includes("incelenmesi gerekli")) {
    return "kontrol_onerilir";
  }
  if ((p.includes("gerekli mi") || p.includes("mevcut mu") || p.includes("var mı")) && s.startsWith("evet")) {
    if (p.includes("conta kaçak") || p.includes("akrabanıza alır mısınız")) return "saglam";
    if (p.includes("ezik") || p.includes("çizik")) return "deforme";
    return "bakim_onerilir";
  }
  if (
    s === "iyi" ||
    s.startsWith("iyi ") ||
    s.startsWith("iyi:") ||
    s === "sorunsuz" ||
    s === "hasarsız" ||
    s === "hasarsiz" ||
    s === "normal" ||
    s === "사ğlam" ||
    s === "sağlam" ||
    s === "saglam" ||
    s === "temiz" ||
    s.startsWith("hayır") ||
    s.startsWith("hayir") ||
    s === "arıza kaydı yok" ||
    s === "yanmıyor"
  ) {
    return "saglam";
  }
  if (s === "orijinal" || s.startsWith("orijinal :") || s.startsWith("orijinal:")) {
    return "orijinal";
  }
  if (s === "yok" || s === "turbo yok") {
    if (p.includes("arıza") || p.includes("sızdırmaz") || p.includes("yağ") || p.includes("boşluk")) {
      return "saglam";
    }
    return "orijinalinde_yok";
  }
  return VALID_STATUS.has(k) ? k : "diger";
}

function coerceGeminiJson(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const o = input as Record<string, unknown>;

  // Interpretation çıktısı:
  if ("summary" in o || "checkList" in o) {
    const rawItems = Array.isArray(o.items) ? o.items : [];
    const rawCheck = Array.isArray(o.checkList) ? o.checkList : [];
    return {
      summary: String(o.summary ?? ""),
      items: rawItems
        .filter((it): it is Record<string, unknown> => Boolean(it && typeof it === "object"))
        .map((it) => ({
          itemId: String(it.itemId ?? it.id ?? ""),
          group: VALID_GROUPS.has(String(it.group)) ? String(it.group) : "belirsiz",
          title: String(it.title ?? ""),
          meaning: String(it.meaning ?? ""),
          whyItMatters: String(it.whyItMatters ?? ""),
          askSeller: typeof it.askSeller === "string" ? it.askSeller : null,
          priceItemId: typeof it.priceItemId === "string" ? it.priceItemId : null,
          priceNeed: typeof it.priceNeed === "string" ? it.priceNeed : null,
          chronicIssueId: typeof it.chronicIssueId === "string" ? it.chronicIssueId : null,
          generalUnverified: Boolean(it.generalUnverified ?? false),
        })),
      checkList: rawCheck
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
        .map((c) => ({
          title: String(c.title ?? ""),
          why: String(c.why ?? ""),
          chronicIssueId: typeof c.chronicIssueId === "string" ? c.chronicIssueId : null,
        })),
    };
  }

  // RawExtraction çıktısı:
  if ("isReport" in o || "vehicle" in o || "sectionsPresent" in o) {
    const v = (o.vehicle && typeof o.vehicle === "object" ? o.vehicle : {}) as Record<string, unknown>;
    const r = (o.report && typeof o.report === "object" ? o.report : {}) as Record<string, unknown>;
    const obd = (o.obd && typeof o.obd === "object" ? o.obd : {}) as Record<string, unknown>;
    const numOrNull = (x: unknown): number | null =>
      typeof x === "number" && Number.isFinite(x) ? x : null;
    const strOrNull = (x: unknown): string | null =>
      typeof x === "string" && x.trim() !== "" ? x : null;

    const expertNotes = (Array.isArray(o.expertNotes) ? o.expertNotes : []).map(String);
    return {
      isReport: Boolean(o.isReport ?? true),
      notReportReason: strOrNull(o.notReportReason),
      vehicle: enrichVehicleSpecs(
        {
          brand: strOrNull(v.brand),
          model: strOrNull(v.model),
          variant: strOrNull(v.variant),
          year: numOrNull(v.year),
          engineCc: numOrNull(v.engineCc),
          powerHp: numOrNull(v.powerHp),
          fuel: VALID_FUELS.has(String(v.fuel)) ? String(v.fuel) : null,
          transmission: VALID_TRANS.has(String(v.transmission)) ? String(v.transmission) : null,
          km: numOrNull(v.km),
        },
        expertNotes.join(" "),
      ),
      report: {
        firm: strOrNull(r.firm),
        reportNo: strOrNull(r.reportNo),
        date: strOrNull(r.date),
        package: strOrNull(r.package),
        platform: strOrNull(r.platform),
        onlineReportQrPresent: Boolean(r.onlineReportQrPresent ?? false),
      },
      sectionsPresent: (Array.isArray(o.sectionsPresent) ? o.sectionsPresent : [])
        .map(String)
        .filter((s) => VALID_SECTIONS.has(s)),
      items: (Array.isArray(o.items) ? o.items : [])
        .filter((it): it is Record<string, unknown> => Boolean(it && typeof it === "object"))
        .map((it) => {
          const part = String(it.part ?? "Bilinmeyen Parça");
          const rawStatus = String(it.rawStatus ?? "");
          return {
            section: VALID_SECTIONS.has(String(it.section)) ? String(it.section) : "diger",
            part,
            rawStatus,
            statusKind: inferStatusKind(String(it.statusKind ?? ""), rawStatus, part),
            note: strOrNull(it.note),
          };
        }),
      measurements: (Array.isArray(o.measurements) ? o.measurements : [])
        .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === "object" && VALID_TESTS.has(String(m.test))))
        .map((m) => ({
          test: String(m.test),
          position: strOrNull(m.position),
          value: numOrNull(m.value),
          unit: strOrNull(m.unit),
          performed: Boolean(m.performed ?? true),
          printedPassMin: numOrNull(m.printedPassMin),
          printedPassMax: numOrNull(m.printedPassMax),
        })),
      obd: {
        summary: (Array.isArray(obd.summary) ? obd.summary : [])
          .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
          .map((s) => ({
            system: VALID_OBD.has(String(s.system)) ? String(s.system) : "diger",
            unitName: String(s.unitName ?? ""),
            hasFault: Boolean(s.hasFault ?? false),
          })),
        rawFaults: (Array.isArray(obd.rawFaults) ? obd.rawFaults : [])
          .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === "object"))
          .map((f) => ({
            system: VALID_OBD.has(String(f.system)) ? String(f.system) : "diger",
            unitName: String(f.unitName ?? ""),
            code: String(f.code ?? ""),
            description: String(f.description ?? ""),
            type: VALID_FAULT_TYPES.has(String(f.type)) ? String(f.type) : "unknown",
          })),
      },
      kmHistory: (Array.isArray(o.kmHistory) ? o.kmHistory : [])
        .filter((k): k is Record<string, unknown> => Boolean(k && typeof k === "object" && typeof k.date === "string" && typeof k.km === "number"))
        .map((k) => ({ date: String(k.date), km: Number(k.km) })),
      damageRecords: (Array.isArray(o.damageRecords) ? o.damageRecords : [])
        .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === "object"))
        .map((d) => ({
          date: strOrNull(d.date),
          cause: strOrNull(d.cause),
          amountTry: numOrNull(d.amountTry),
        })),
      expertNotes: (Array.isArray(o.expertNotes) ? o.expertNotes : []).map(String),
      unreadable: (Array.isArray(o.unreadable) ? o.unreadable : []).map(String),
    };
  }

  return input;
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
                  maxOutputTokens: Math.min(params.max_tokens, 8192),
                  thinkingConfig: { thinkingBudget: 0 },
                  ...(priceTool ? {} : { responseMimeType: "application/json" }),
                },
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
