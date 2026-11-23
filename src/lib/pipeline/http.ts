import firmsJson from "../../../kb/firms.json";
import genericPricesJson from "../../../kb/generic-prices.json";
import bmwG20Json from "../../../kb/vehicles/bmw-3-serisi-g20.json";
import kiaPicantoJson from "../../../kb/vehicles/kia-picanto-ja.json";
import { createClaude } from "@/lib/claude/client";
import { ERROR_MESSAGES } from "@/lib/copy";
import { loadKnowledge, savePriceCache } from "@/lib/kb/d1";
import { matchKnowledge, type KbData } from "@/lib/kb/match";
import type { AnalysisEvent, ErrorCode } from "@/lib/schema/events";
import { FirmsFileSchema, GenericPricesFileSchema, VehicleKbFileSchema } from "@/lib/schema/kb";
import { getServerEnv, type ServerEnv } from "./env";
import type { PipelineDeps } from "./run";
import { d1SpendStore, parseCap, type SpendStore } from "./spend";

const FALLBACK_KB: KbData = {
  vehicles: [VehicleKbFileSchema.parse(kiaPicantoJson), VehicleKbFileSchema.parse(bmwG20Json)],
  generic: GenericPricesFileSchema.parse(genericPricesJson).priceItems,
  firms: FirmsFileSchema.parse(firmsJson).firms,
};
const memSpend = new Map<string, number>();

const HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
};

type Emit = (e: AnalysisEvent) => void;

/**
 * NDJSON akışı: her olay bir satır. `work` ne olursa olsun akış kapanır.
 * Günlükte yalnızca olay kodu, dosya sayısı, süre ve harcama bulunur.
 */
export function ndjsonResponse(
  event: "analyze" | "reinterpret",
  files: number,
  work: (emit: Emit) => Promise<void>,
  usd: { total: number },
): Response {
  const enc = new TextEncoder();
  const started = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let code = "ok";
      const emit: Emit = (e) => {
        if (e.type === "error") code = e.code;
        controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      };
      try {
        await work(emit);
      } catch {
        code = "internal";
        emit({ type: "error", code: "internal", message: ERROR_MESSAGES.internal });
      } finally {
        console.log(JSON.stringify({ event, files, ms: Date.now() - started, usd: usd.total, code }));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: HEADERS });
}

/** Yapılandırma eksikse null döner ve yalnızca değişken adını günlüğe yazar. */
export function buildDeps(usd: { total: number }): PipelineDeps | null {
  const isDev = process.env.NODE_ENV === "development";
  let env: Partial<ServerEnv> = {};
  try {
    env = getServerEnv() ?? {};
  } catch {
    if (!isDev) return null;
  }
  const apiKey =
    env.ANTHROPIC_API_KEY ||
    env.GEMINI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY ||
    (isDev ? "offline-local-demo" : undefined);
  if (!apiKey) {
    console.log(JSON.stringify({ event: "config_missing", name: "ANTHROPIC_API_KEY" }));
    return null;
  }
  const secret =
    env.EXTRACTION_HMAC_SECRET ||
    process.env.EXTRACTION_HMAC_SECRET ||
    (isDev ? "local-dev-hmac-secret-ekspertiz-rehberi-2026" : undefined);
  if (!secret) {
    console.log(JSON.stringify({ event: "config_missing", name: "EXTRACTION_HMAC_SECRET" }));
    return null;
  }
  const inner = env.DB ? d1SpendStore(env.DB) : null;
  const spend: SpendStore = {
    get: async (day) => {
      if (inner) {
        try {
          return await inner.get(day);
        } catch {
          if (!isDev) throw new Error("d1 spend get failed");
        }
      }
      return memSpend.get(day) ?? 0;
    },
    add: async (day, v) => {
      usd.total += v;
      memSpend.set(day, (memSpend.get(day) ?? 0) + v);
      if (inner) {
        try {
          await inner.add(day, v);
        } catch {
          if (!isDev) throw new Error("d1 spend add failed");
        }
      }
    },
  };
  return {
    claude: createClaude(apiKey),
    loadKnowledge: async (q) => {
      if (env.DB) {
        try {
          return await loadKnowledge(env.DB, q, new Date());
        } catch {
          if (!isDev) throw new Error("d1 loadKnowledge failed");
        }
      }
      return matchKnowledge(FALLBACK_KB, q, new Date());
    },
    savePrices: async (key, prices) => {
      if (env.DB) {
        try {
          await savePriceCache(env.DB, key, prices);
        } catch {
          if (!isDev) throw new Error("d1 savePriceCache failed");
        }
      }
    },
    spend,
    secret,
    now: () => new Date(),
    capUsd: parseCap(env.DAILY_SPEND_CAP_USD),
  };
}

export const errorEvent = (code: ErrorCode): AnalysisEvent => ({
  type: "error",
  code,
  message: ERROR_MESSAGES[code],
});
