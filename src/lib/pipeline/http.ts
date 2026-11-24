import { existsSync, readFileSync } from "node:fs";
import { createClaude, providerOf, type ClaudeLike } from "@/lib/claude/client";
import { ERROR_MESSAGES } from "@/lib/copy";
import { loadKnowledge, savePriceCache } from "@/lib/kb/d1";
import { matchKnowledge, type KbData } from "@/lib/kb/match";
import type { AnalysisEvent, ErrorCode } from "@/lib/schema/events";
import { getServerEnv, type ServerEnv } from "./env";
import type { PipelineDeps } from "./run";
import { d1SpendStore, parseCap, type SpendStore } from "./spend";

// Yalnız geliştirme yedekleri: D1 yoksa bellek içi harcama ve iki araçlık yerel bilgi tabanı.
const devMemSpend = new Map<string, number>();
let devFallbackKb: Promise<KbData> | null = null;

/** Yedek bilgi tabanı ilk ihtiyaçta yüklenir (modül yüklenirken değil). */
function loadDevFallbackKb(): Promise<KbData> {
  devFallbackKb ??= (async () => {
    const [{ FirmsFileSchema, GenericPricesFileSchema, VehicleKbFileSchema }, firms, generic, picanto, bmw] =
      await Promise.all([
        import("@/lib/schema/kb"),
        import("../../../kb/firms.json"),
        import("../../../kb/generic-prices.json"),
        import("../../../kb/vehicles/kia-picanto-ja.json"),
        import("../../../kb/vehicles/bmw-3-serisi-g20.json"),
      ]);
    return {
      vehicles: [VehicleKbFileSchema.parse(picanto.default), VehicleKbFileSchema.parse(bmw.default)],
      generic: GenericPricesFileSchema.parse(generic.default).priceItems,
      firms: FirmsFileSchema.parse(firms.default).firms,
    };
  })();
  return devFallbackKb;
}

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
};
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

type Emit = (e: AnalysisEvent) => void;

/** İstemciye giden hata olayı: mesaj her zaman copy.ts'ten; ham hata metni gitmez. */
export const errorEvent = (code: ErrorCode): AnalysisEvent => ({
  type: "error",
  code,
  message: ERROR_MESSAGES[code],
});

/** Çalışmada kullanılan sağlayıcı (günlük için; anahtar değil). */
export type ProviderName = "claude" | "gemini" | "demo";

/** İstek başına sayaç: harcama toplamı ve sağlayıcı (buildDeps doldurur). */
export type RunMeta = { total: number; provider?: ProviderName };

type RunEvent = "analyze" | "reinterpret";

/**
 * Çalışma başına TEK günlük satırı: olay, dosya sayısı, süre, harcama, kod, HTTP durumu ve
 * sağlayıcı. Rapor içeriği, plaka, ad, anahtar yazılmaz.
 */
function logRun(event: RunEvent, files: number, started: number, meta: RunMeta, code: string, status: number, extra: object = {}) {
  console.log(
    JSON.stringify({
      event,
      files,
      ms: Date.now() - started,
      usd: meta.total,
      code,
      status,
      provider: meta.provider ?? null,
      ...extra,
    }),
  );
}

/** Akış başlamadan dönen hataların HTTP durumu (akıştaki hatalar 200 NDJSON olayı kalır). */
const PRE_STREAM_STATUS: Partial<Record<ErrorCode, number>> = {
  upload_invalid: 400,
  request_invalid: 400,
  vehicle_invalid: 400,
  token_invalid: 401,
  reinterpret_used: 403,
  cap_reached: 429,
  internal: 500,
};

/**
 * Akış öncesi hata: uygun HTTP durumu (400/401/403/413/429/500) ve akıştaki `error` olayıyla
 * aynı JSON gövdesi. İstemci 2xx dışı yanıtta da gövdedeki kodu okur.
 */
export function errorResponse(
  event: RunEvent,
  files: number,
  code: ErrorCode,
  meta: RunMeta,
  status: number = PRE_STREAM_STATUS[code] ?? 500,
  started: number = Date.now(),
): Response {
  logRun(event, files, started, meta, code, status);
  return new Response(JSON.stringify(errorEvent(code)) + "\n", { status, headers: JSON_HEADERS });
}

/**
 * NDJSON akışı: her olay bir satır. `work` ne olursa olsun akış kapanır. İstemci akışı iptal
 * ederse (sekme kapandı) yazımlar sessizce atlanır, iş sürer ve harcaması yazılır.
 * Günlükte yalnızca olay kodu, dosya sayısı, süre, harcama ve sağlayıcı bulunur.
 */
export function ndjsonResponse(
  event: RunEvent,
  files: number,
  work: (emit: Emit) => Promise<void>,
  meta: RunMeta,
  started: number = Date.now(),
): Response {
  const enc = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let code = "ok";
      const emit: Emit = (e) => {
        if (e.type === "error") code = e.code;
        if (cancelled) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          cancelled = true; // akış kapanmış/iptal edilmiş
        }
      };
      try {
        await work(emit);
      } catch {
        code = "internal";
        emit(errorEvent("internal"));
      } finally {
        logRun(event, files, started, meta, code, 200, cancelled ? { cancelled: true } : {});
        if (!cancelled) {
          try {
            controller.close();
          } catch {
            // istemci bu arada kapattı
          }
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
}

/** Yalnız geliştirmede okunur: `.dev.vars` satırları (`#` ile başlayanlar yok sayılır). */
function readDevVars(): Record<string, string> {
  try {
    if (!existsSync(".dev.vars")) return {};
    const out: Record<string, string> = {};
    for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && m[2]) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const configMissing = (name: string) => console.log(JSON.stringify({ event: "config_missing", name }));

/**
 * İstek başına bağımlılıklar. Yapılandırma eksikse null döner (çağıran `internal` hatası
 * gösterir) ve günlüğe yalnızca değişken adını yazar.
 */
export async function buildDeps(usd: RunMeta): Promise<PipelineDeps | null> {
  const isDev = process.env.NODE_ENV === "development";
  let env: Partial<ServerEnv> = {};
  try {
    env = getServerEnv() ?? {};
  } catch {
    if (!isDev) {
      configMissing("cloudflare_env");
      return null;
    }
  }
  return buildDepsFrom(usd, {
    isDev,
    env,
    devVars: isDev ? readDevVars() : {},
    processEnv: process.env,
  });
}

export type DepsContext = {
  /** Yalnız `NODE_ENV === "development"` iken true; yedekler ve demo yalnız o zaman açılır. */
  isDev: boolean;
  env: Partial<ServerEnv>;
  devVars: Record<string, string>;
  processEnv: Record<string, string | undefined>;
};

const DEV_HMAC_SECRET = "local-dev-hmac-secret-ekspertiz-rehberi-2026";

export async function buildDepsFrom(usd: RunMeta, ctx: DepsContext): Promise<PipelineDeps | null> {
  const { isDev, env } = ctx;
  const pick = (name: Exclude<keyof ServerEnv, "DB">): string | undefined =>
    env[name] || ctx.processEnv[name] || (isDev ? ctx.devVars[name] : undefined) || undefined;

  let claude: ClaudeLike;
  if (isDev && pick("OFFLINE_DEMO") === "1") {
    const { createOfflineDemoClient } = await import("@/lib/claude/offline-demo");
    claude = createOfflineDemoClient({ fixtureSha256: (pick("OFFLINE_DEMO_PDF_SHA256") ?? "").split(",") });
    usd.provider = "demo";
  } else {
    const apiKey = pick("ANTHROPIC_API_KEY") || pick("GEMINI_API_KEY");
    if (!apiKey) {
      configMissing("ANTHROPIC_API_KEY");
      return null;
    }
    // Günlükte hangi sağlayıcıya gidildiği görünsün (yanlış yere konmuş anahtar fark edilsin).
    usd.provider = providerOf(apiKey) === "gemini" ? "gemini" : "claude";
    const maxOut = Number(pick("GEMINI_MAX_OUTPUT_TOKENS"));
    claude = createClaude(apiKey, {
      geminiModel: pick("GEMINI_MODEL"),
      geminiFallbackModel: pick("GEMINI_FALLBACK_MODEL"),
      geminiMaxOutputTokens: Number.isFinite(maxOut) && maxOut > 0 ? maxOut : undefined,
    });
  }

  const secret = pick("EXTRACTION_HMAC_SECRET") || (isDev ? DEV_HMAC_SECRET : undefined);
  if (!secret) {
    configMissing("EXTRACTION_HMAC_SECRET");
    return null;
  }

  const db = env.DB;
  if (!db && !isDev) {
    // Üretimde D1 olmadan harcama tavanı çalışmaz: istek reddedilir.
    configMissing("DB");
    return null;
  }

  const common = { claude, secret, now: () => new Date(), capUsd: parseCap(pick("DAILY_SPEND_CAP_USD")) };

  if (!isDev) {
    const inner = d1SpendStore(db!);
    return {
      ...common,
      spend: {
        get: (day) => inner.get(day),
        add: async (day, v) => {
          usd.total += v;
          await inner.add(day, v);
        },
      },
      loadKnowledge: (q) => loadKnowledge(db!, q, new Date()),
      savePrices: (key, prices) => savePriceCache(db!, key, prices),
    };
  }

  // Geliştirme: D1 yoksa ya da hata verirse bellek içi harcama ve yerel bilgi tabanı.
  const inner = db ? d1SpendStore(db) : null;
  const spend: SpendStore = {
    get: async (day) => {
      if (inner) {
        try {
          return await inner.get(day);
        } catch {
          // yerel yedeğe düş
        }
      }
      return devMemSpend.get(day) ?? 0;
    },
    add: async (day, v) => {
      usd.total += v;
      devMemSpend.set(day, (devMemSpend.get(day) ?? 0) + v);
      if (inner) {
        try {
          await inner.add(day, v);
        } catch {
          // yerel yedek yeterli
        }
      }
    },
  };
  return {
    ...common,
    spend,
    loadKnowledge: async (q) => {
      if (db) {
        try {
          return await loadKnowledge(db, q, new Date());
        } catch {
          // yerel yedeğe düş
        }
      }
      return matchKnowledge(await loadDevFallbackKb(), q, new Date());
    },
    savePrices: async (key, prices) => {
      if (!db) return;
      try {
        await savePriceCache(db, key, prices);
      } catch {
        // geliştirmede önbellek yazımı isteğe bağlı
      }
    },
  };
}
