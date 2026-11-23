import type { AnalysisEvent, ErrorCode } from "@/lib/schema/events";
import type { AnalysisResult, Vehicle } from "@/lib/schema/result";

export type Stage = "okuma" | "arac" | "yorumlama";
export const STAGE_ORDER: readonly Stage[] = ["okuma", "arac", "yorumlama"];

export type RunMode = "analyze" | "reinterpret";

/** Analiz akışının durumu. Yalnızca bileşen belleğinde tutulur, hiçbir yere yazılmaz. */
export type RunState = {
  status: "idle" | "running" | "done" | "error";
  mode: RunMode | null;
  /** Ulaşılan en ileri aşama; tekrarlanan veya geride kalan olaylar bunu geri almaz. */
  stage: Stage | null;
  vehicle: Vehicle | null;
  token: string | null;
  result: AnalysisResult | null;
  error: ErrorCode | null;
  reinterpretUsed: boolean;
};

export type RunAction =
  | { type: "start"; mode: "analyze" }
  | { type: "start"; mode: "reinterpret"; vehicle: Vehicle }
  | { type: "event"; event: AnalysisEvent }
  /** Akış olağan biçimde kapandı. */
  | { type: "ended" }
  /** İstek veya akış koptu. */
  | { type: "failed" }
  | { type: "reset" };

export const initialRun: RunState = {
  status: "idle",
  mode: null,
  stage: null,
  vehicle: null,
  token: null,
  result: null,
  error: null,
  reinterpretUsed: false,
};

function furthest(a: Stage | null, b: Stage): Stage {
  return a !== null && STAGE_ORDER.indexOf(a) >= STAGE_ORDER.indexOf(b) ? a : b;
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "reset":
      return initialRun;
    case "start":
      if (action.mode === "analyze") return { ...initialRun, status: "running", mode: "analyze" };
      return {
        ...state,
        status: "running",
        mode: "reinterpret",
        stage: "arac",
        vehicle: action.vehicle,
        result: null,
        error: null,
        reinterpretUsed: true,
      };
    case "ended":
    case "failed":
      // Sonuç ya da hata gelmeden biten akış: kullanıcı beklemede kalmaz.
      return state.status === "running" ? { ...state, status: "error", error: "internal" } : state;
    case "event": {
      if (state.status !== "running") return state;
      const e = action.event;
      switch (e.type) {
        case "stage":
          return { ...state, stage: furthest(state.stage, e.stage) };
        case "vehicle":
          return { ...state, vehicle: e.vehicle, token: e.token, stage: furthest(state.stage, "arac") };
        case "result":
          return { ...state, status: "done", result: e.result, stage: "yorumlama" };
        case "error":
          return { ...state, status: "error", error: e.code };
      }
    }
  }
}

const RESTART_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "not_report",
  "upload_invalid",
  "token_invalid",
  "reinterpret_used",
]);

/**
 * "Tekrar dene" ne yapar: geçici hatalarda aynı istek yinelenir; dosya veya jeton
 * kaynaklı hatalarda yükleme ekranına dönülür.
 */
export function retryKind(state: RunState): "resubmit" | "reinterpret" | "restart" {
  if (state.error !== null && RESTART_CODES.has(state.error)) return "restart";
  if (state.mode === "reinterpret") return "reinterpret";
  if (state.mode === "analyze") return "resubmit";
  return "restart";
}
