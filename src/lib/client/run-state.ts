import type { ClientErrorCode, DisplayErrorCode } from "@/lib/copy";
import type { VehicleInferred } from "@/lib/schema/extraction";
import type { AnalysisEvent } from "@/lib/schema/events";
import type { AnalysisResult, Vehicle } from "@/lib/schema/result";
import { carryInferred } from "@/lib/vehicle-enrich";

export type Stage = "okuma" | "arac" | "yorumlama";
export const STAGE_ORDER: readonly Stage[] = ["okuma", "arac", "yorumlama"];

export type RunMode = "analyze" | "reinterpret";

/** Düzeltmeden önceki sonuç: düzeltme başarısız olursa geri dönülebilir. */
export type PriorResult = {
  vehicle: Vehicle;
  vehicleInferred: VehicleInferred | null;
  result: AnalysisResult;
};

/** Sunucunun reddettiği düzeltme: form, kullanıcının yazdıklarıyla ve hata mesajıyla yeniden açılır. */
export type PendingCorrection = { draft: Vehicle; code: "vehicle_invalid" | "request_invalid" };

/** Analiz akışının durumu. Yalnızca bileşen belleğinde tutulur, hiçbir yere yazılmaz. */
export type RunState = {
  status: "idle" | "running" | "done" | "error";
  mode: RunMode | null;
  /** Ulaşılan en ileri aşama; tekrarlanan veya geride kalan olaylar bunu geri almaz. */
  stage: Stage | null;
  vehicle: Vehicle | null;
  /** Raporda basılı olmayıp tahmin edilen araç alanları ("tahmini" etiketi). */
  vehicleInferred: VehicleInferred | null;
  token: string | null;
  result: AnalysisResult | null;
  error: DisplayErrorCode | null;
  reinterpretUsed: boolean;
  /** Aynı dosyalarla kaçıncı deneme (yinelenen model hatasında daha net sayfa önerilir). */
  attempt: number;
  prior: PriorResult | null;
  correction: PendingCorrection | null;
};

export type RunAction =
  /** `resubmit`: aynı dosyalarla yeniden deneme (deneme sayacı artar). */
  | { type: "start"; mode: "analyze"; resubmit?: boolean }
  | { type: "start"; mode: "reinterpret"; vehicle: Vehicle }
  | { type: "event"; event: AnalysisEvent }
  /** Akış olağan biçimde kapandı. */
  | { type: "ended" }
  /** İstek veya akış koptu, HTTP durumu olay taşımadı ya da akış durdu. */
  | { type: "failed"; code: ClientErrorCode | "internal" }
  /** Başarısız düzeltmeden önceki sonuca dön. */
  | { type: "restorePrior" }
  /** Sunucunun reddettiği düzeltme formunu kapat. */
  | { type: "dismissCorrection" }
  | { type: "reset" };

export const initialRun: RunState = {
  status: "idle",
  mode: null,
  stage: null,
  vehicle: null,
  vehicleInferred: null,
  token: null,
  result: null,
  error: null,
  reinterpretUsed: false,
  attempt: 0,
  prior: null,
  correction: null,
};

function furthest(a: Stage | null, b: Stage): Stage {
  return a !== null && STAGE_ORDER.indexOf(a) >= STAGE_ORDER.indexOf(b) ? a : b;
}

/** Sunucunun reddettiği düzeltme: aynı istek tekrarlanmaz, kullanıcı formu düzeltir. */
const CORRECT_CODES: ReadonlySet<DisplayErrorCode> = new Set<DisplayErrorCode>(["vehicle_invalid", "request_invalid"]);

/** Önceki sonuca döner (düzeltme hakkı kullanılmış sayılır; istek sunucuya ulaşmış olabilir). */
function restore(state: RunState, prior: PriorResult): RunState {
  return {
    ...state,
    status: "done",
    stage: "yorumlama",
    vehicle: prior.vehicle,
    vehicleInferred: prior.vehicleInferred,
    result: prior.result,
    error: null,
    prior: null,
  };
}

function fail(state: RunState, code: DisplayErrorCode): RunState {
  // Düzeltme sunucuda reddedildi: hiçbir şey çalışmadı, hak harcanmadı. Önceki sonuç geri gelir
  // ve form kullanıcının yazdıklarıyla, hata mesajıyla açılır.
  if (state.mode === "reinterpret" && state.prior && CORRECT_CODES.has(code) && state.vehicle) {
    return {
      ...restore(state, state.prior),
      reinterpretUsed: false,
      correction: { draft: state.vehicle, code: code as PendingCorrection["code"] },
    };
  }
  return { ...state, status: "error", error: code };
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "reset":
      return initialRun;
    case "start":
      if (action.mode === "analyze") {
        return {
          ...initialRun,
          status: "running",
          mode: "analyze",
          attempt: action.resubmit ? state.attempt + 1 : 1,
        };
      }
      return {
        ...state,
        status: "running",
        mode: "reinterpret",
        stage: "arac",
        vehicle: action.vehicle,
        // Değiştirilmeyen tahmini alan tahmini kalır (sunucudaki carryInferred ile aynı kural).
        vehicleInferred:
          state.vehicle === null
            ? null
            : (carryInferred(state.vehicle, state.vehicleInferred ?? undefined, action.vehicle) ?? null),
        result: null,
        error: null,
        reinterpretUsed: true,
        correction: null,
        // Yeniden denemede (önceki sonuç zaten saklı) eski sonuç korunur.
        prior:
          state.result && state.vehicle
            ? { vehicle: state.vehicle, vehicleInferred: state.vehicleInferred, result: state.result }
            : state.prior,
      };
    case "ended":
      // Sonuç ya da hata gelmeden biten akış: kullanıcı beklemede kalmaz.
      return state.status === "running" ? fail(state, "internal") : state;
    case "failed":
      return state.status === "running" ? fail(state, action.code) : state;
    case "restorePrior":
      return state.status === "error" && state.prior ? restore(state, state.prior) : state;
    case "dismissCorrection":
      return state.correction ? { ...state, correction: null } : state;
    case "event": {
      if (state.status !== "running") return state;
      const e = action.event;
      switch (e.type) {
        case "stage":
          return { ...state, stage: furthest(state.stage, e.stage) };
        case "vehicle":
          return {
            ...state,
            vehicle: e.vehicle,
            vehicleInferred: e.vehicleInferred ?? null,
            token: e.token,
            stage: furthest(state.stage, "arac"),
          };
        case "result":
          return {
            ...state,
            status: "done",
            result: e.result,
            vehicle: e.result.vehicle,
            vehicleInferred: e.result.vehicleInferred ?? null,
            stage: "yorumlama",
            prior: null,
          };
        case "error":
          return fail(state, e.code);
      }
    }
  }
}

/** Dosya, jeton veya günlük tavan kaynaklı hatalar: aynı istek yinelenmez, yükleme ekranına dönülür. */
const RESTART_CODES: ReadonlySet<DisplayErrorCode> = new Set<DisplayErrorCode>([
  "not_report",
  "upload_invalid",
  "upload_too_large",
  "token_invalid",
  "reinterpret_used",
  "cap_reached",
]);

/** Modelin bu sayfalarla başaramadığı hatalar: ikinci kez olursa daha net sayfa önerilir. */
const MODEL_CODES: ReadonlySet<DisplayErrorCode> = new Set<DisplayErrorCode>(["refusal", "truncated", "invalid_output"]);

export type RetryKind = "resubmit" | "reinterpret" | "restart";

/**
 * Hata ekranındaki ana düğme ne yapar: geçici hatalarda aynı istek yinelenir; dosya, jeton veya
 * tavan kaynaklı hatalarda yükleme ekranına dönülür (seçilen sayfalar korunur). Sunucunun
 * reddettiği düzeltme (`vehicle_invalid`, `request_invalid`) hata ekranına düşmez: reducer önceki
 * sonuca dönüp formu açar; önceki sonuç yoksa yükleme ekranına dönülür, istek yinelenmez.
 */
export function retryKind(state: RunState): RetryKind {
  if (state.error !== null && (RESTART_CODES.has(state.error) || CORRECT_CODES.has(state.error))) return "restart";
  if (state.mode === "reinterpret") return "reinterpret";
  if (state.mode === "analyze") return "resubmit";
  return "restart";
}

/** Aynı dosyalarla model hatası en az iki kez oldu mu (daha az ve daha net sayfa önerisi). */
export function repeatedModelFailure(state: RunState): boolean {
  return state.status === "error" && state.mode === "analyze" && state.attempt >= 2 && state.error !== null && MODEL_CODES.has(state.error);
}
