import { z } from "zod";
import type { BetaMessageParam, BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Extraction } from "@/lib/schema/extraction";
import type { PriceItem } from "@/lib/schema/kb";
import { istanbulDay } from "@/lib/pipeline/spend";
import { AnalysisError, failedCallUsd, logProviderError, MODEL, type ClaudeLike } from "./client";
import { usageToUsd } from "./cost";

const BETAS: ["server-side-fallback-2026-07-01"] = ["server-side-fallback-2026-07-01"];
const MAX_NEEDS = 5;
const MAX_TURNS = 4;
const TOOL_NAME = "fiyatlari_kaydet";

export type LivePrice = PriceItem & { forItemId: string };

const RowSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  minTry: z.number(),
  maxTry: z.number(),
  partType: z.enum(["orijinal", "yan_sanayi", "belirtilmemis"]),
  laborIncluded: z.boolean().nullable(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
});
// Eager input streaming eksik/bozuk girdi üretebilir: ayrıştırılan girdi burada doğrulanır.
const InputSchema = z.object({ fiyatlar: z.array(z.unknown()) });

const SAVE_TOOL: BetaToolUnion = {
  name: TOOL_NAME,
  description:
    "Web aramasında bulunan, kaynağı olan TL fiyat aralıklarını kaydeder. Kaynağı olmayan veya bulunamayan kalemi listeye koyma.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["fiyatlar"],
    properties: {
      fiyatlar: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["itemId", "title", "minTry", "maxTry", "partType", "laborIncluded", "sourceUrl", "sourceTitle"],
          properties: {
            itemId: { type: "string" },
            title: { type: "string" },
            minTry: { type: "number" },
            maxTry: { type: "number" },
            partType: { type: "string", enum: ["orijinal", "yan_sanayi", "belirtilmemis"] },
            laborIncluded: { type: ["boolean", "null"] },
            sourceUrl: { type: "string" },
            sourceTitle: { type: "string" },
          },
        },
      },
    },
  },
};

const TOOLS: BetaToolUnion[] = [
  {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 5,
    user_location: { type: "approximate", country: "TR", timezone: "Europe/Istanbul" },
  },
  SAVE_TOOL,
];

export const PRICE_SYSTEM = `Sen Türkiye'deki ikinci el araç onarım ve parça fiyatlarını araştıran bir yardımcısın.

GÖREV
- Kullanıcı mesajındaki her ihtiyaç için güncel TL fiyat aralığını web_search aracıyla ara. Aramayı mutlaka yap; fiyatı hafızandan yazma.
- Sonuçları en sonda ${TOOL_NAME} aracını çağırarak bildir. Cevabı düz metin olarak yazma.

KURALLAR
- Yalnızca bir web sayfasında gördüğün fiyatı yaz. Kaynağı olmayan, tahmin ettiğin veya uydurduğun fiyat yazma; bulamadığın kalemi listeye koyma.
- Her satırın sourceUrl alanı fiyatı gördüğün sayfanın tam http(s) adresi olur, sourceTitle alanı sayfanın başlığıdır.
- minTry ve maxTry Türk lirası cinsinden pozitif sayıdır ve minTry <= maxTry olmalıdır.
- title, işi araç markasından bağımsız ve genel anlatır (ör. "Arka çamurluk boyama (tek panel)"), çünkü kayıt başka analizlerde yeniden kullanılacak.
- partType: kaynak orijinal parça diyorsa "orijinal", yan sanayi diyorsa "yan_sanayi", belirtmiyorsa "belirtilmemis". laborIncluded: işçilik dahilse true, değilse false, kaynak söylemiyorsa null.
- itemId alanına isteğin içindeki itemId değerini aynen yaz.`;

export function slug(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function domainOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Bu aramada gerçekten dönen sonuçların alan adları: Claude `web_search_tool_result`
 * blokları; Gemini uyarlayıcısı groundingChunks'ı aynı biçimde (alan adı `domain` alanında) verir.
 */
function collectGroundedDomains(content: readonly unknown[], into: Set<string>): void {
  for (const block of content) {
    const b = block as { type?: string; content?: unknown };
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content as { type?: string; url?: unknown; domain?: unknown }[]) {
      if (r.type !== "web_search_result") continue;
      const fromField = typeof r.domain === "string" ? r.domain.trim().toLowerCase().replace(/^www\./, "") : null;
      const d = fromField && HOST_RE.test(fromField) ? fromField : typeof r.url === "string" ? domainOf(r.url) : null;
      if (d) into.add(d);
    }
  }
}

// Ülke kodlu alan adlarında genel ikinci düzey etiketler ("com.tr", "co.uk"): tek başına kayıt
// edilebilir bir alan adı değildir (kamu son eki).
const GENERIC_SLD = new Set([
  "com", "net", "org", "gov", "edu", "gen", "web", "bel", "biz", "info", "av", "dr", "k12", "pol",
  "tsk", "kep", "co", "ac", "or", "ne", "go", "mil", "nom", "ltd", "plc",
]);

/** En az iki etiketli ve "com.tr" gibi çıplak bir kamu son eki olmayan ana makine adı. */
function isRegistrable(host: string): boolean {
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((l) => l === "")) return false;
  return !(labels.length === 2 && GENERIC_SLD.has(labels[0]) && labels[1].length === 2);
}

/**
 * Satırın alan adı, arama sonuçlarındaki kayıt edilebilir bir alan adıyla aynı ya da onun alt
 * alan adı mı? Üst alan adı (arama "shop.example.com.tr", satır "example.com.tr") ve kamu son
 * eki ("com.tr") temellendirilmiş sayılmaz.
 */
function isGrounded(domain: string, grounded: ReadonlySet<string>): boolean {
  for (const g of grounded) {
    if (!isRegistrable(g)) continue;
    if (domain === g || domain.endsWith(`.${g}`)) return true;
  }
  return false;
}

function toPrices(
  rawRows: unknown[],
  ids: Set<string>,
  asOf: string,
  vehicleKey: string | null,
  grounded: ReadonlySet<string>,
): LivePrice[] {
  const scope = slug(vehicleKey ?? "") || "genel";
  const out: LivePrice[] = [];
  const used = new Set<string>();
  for (const raw of rawRows) {
    const r = RowSchema.safeParse(raw);
    if (!r.success) continue;
    const row = r.data;
    const domain = domainOf(row.sourceUrl);
    if (domain === null || !ids.has(row.itemId)) continue;
    // Kaynak bu turdaki arama sonuçlarında yoksa (uydurma/hafızadan) atılır ve önbelleğe girmez.
    if (!isGrounded(domain, grounded)) continue;
    if (!Number.isFinite(row.minTry) || !Number.isFinite(row.maxTry)) continue;
    if (row.minTry <= 0 || row.maxTry <= 0 || row.minTry > row.maxTry) continue;
    const title = row.title.trim();
    if (slug(title) === "") continue;
    const base = `live-${scope}-${slug(title)}-${asOf}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    out.push({
      id,
      title,
      partType: row.partType,
      laborIncluded: row.laborIncluded,
      minTry: row.minTry,
      maxTry: row.maxTry,
      segment: null,
      source: { url: row.sourceUrl, title: row.sourceTitle, domain },
      asOf,
      forItemId: row.itemId,
    });
  }
  return out;
}

export async function lookupPrices(
  client: ClaudeLike,
  input: {
    vehicle: Extraction["vehicle"];
    needs: { itemId: string; need: string }[];
    /** price_cache anahtarı; fiyat kimliğine girer, böylece araçlar arası çakışma olmaz. */
    vehicleKey?: string | null;
  },
  now: Date,
): Promise<{ prices: LivePrice[]; usd: number }> {
  const needs = input.needs.slice(0, MAX_NEEDS);
  if (needs.length === 0) return { prices: [], usd: 0 };

  const messages: BetaMessageParam[] = [
    { role: "user", content: [{ type: "text", text: JSON.stringify({ vehicle: input.vehicle, needs }) }] },
  ];
  let usd = 0;
  const grounded = new Set<string>();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let msg;
    let stream: unknown;
    try {
      const s = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: BETAS,
        fallbacks: "default",
        system: [{ type: "text", text: PRICE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [...messages],
        tools: TOOLS,
        tool_choice: { type: "auto" },
        output_config: { effort: "medium" },
      });
      stream = s;
      msg = await s.finalMessage();
    } catch (e) {
      logProviderError(e);
      // Yarıda kalan turun kısmi kullanımı (varsa) da harcamaya girer.
      throw new AnalysisError("internal", usd + failedCallUsd(e, stream), "claude call failed", { cause: e });
    }
    usd += usageToUsd(msg.usage);
    collectGroundedDomains(msg.content, grounded);
    if (msg.stop_reason === "refusal") throw new AnalysisError("refusal", usd);
    if (msg.stop_reason === "max_tokens") throw new AnalysisError("truncated", usd);

    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content as never });
      continue;
    }

    for (const b of msg.content) {
      if (b.type === "tool_use" && b.name === TOOL_NAME) {
        const parsed = InputSchema.safeParse(b.input);
        if (!parsed.success) throw new AnalysisError("invalid_output", usd, "bad tool input");
        const prices = toPrices(
          parsed.data.fiyatlar,
          new Set(needs.map((n) => n.itemId)),
          istanbulDay(now),
          input.vehicleKey ?? null,
          grounded,
        );
        return { prices, usd };
      }
    }
    throw new AnalysisError("invalid_output", usd, "no price tool call");
  }
  throw new AnalysisError("invalid_output", usd, "too many pause_turn continuations");
}
