import { createClaude } from "@/lib/claude/client";
import { ERROR_MESSAGES } from "@/lib/copy";
import { loadKnowledge } from "@/lib/kb/d1";
import type { AnalysisEvent, ErrorCode } from "@/lib/schema/events";
import { getServerEnv } from "./env";
import type { PipelineDeps } from "./run";
import { d1SpendStore, parseCap, type SpendStore } from "./spend";

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
  const env = getServerEnv();
  for (const name of ["ANTHROPIC_API_KEY", "EXTRACTION_HMAC_SECRET"] as const) {
    if (!env[name]) {
      console.log(JSON.stringify({ event: "config_missing", name }));
      return null;
    }
  }
  const inner = d1SpendStore(env.DB);
  const spend: SpendStore = {
    get: (day) => inner.get(day),
    add: async (day, v) => {
      usd.total += v;
      await inner.add(day, v);
    },
  };
  return {
    claude: createClaude(env.ANTHROPIC_API_KEY as string),
    loadKnowledge: (q) => loadKnowledge(env.DB, q, new Date()),
    spend,
    secret: env.EXTRACTION_HMAC_SECRET as string,
    now: () => new Date(),
    capUsd: parseCap(env.DAILY_SPEND_CAP_USD),
  };
}

export const errorEvent = (code: ErrorCode): AnalysisEvent => ({
  type: "error",
  code,
  message: ERROR_MESSAGES[code],
});
