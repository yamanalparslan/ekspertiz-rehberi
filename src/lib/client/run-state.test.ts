import { expect, test } from "vitest";
import type { AnalysisResult, Vehicle } from "@/lib/schema/result";
import { initialRun, repeatedModelFailure, retryKind, runReducer, type RunState } from "./run-state";

const vehicle: Vehicle = {
  brand: "BMW",
  model: "320i",
  variant: null,
  year: 2021,
  engineCc: 1597,
  powerHp: 170,
  fuel: "benzin",
  transmission: "otomatik",
  km: 135689,
};

const result: AnalysisResult = {
  vehicle,
  report: { firm: null, reportNo: null, date: null },
  summary: "",
  counts: { normal: 0, belirsiz: 0, kronik: 0, dikkat: 0 },
  items: [],
  checkList: [],
  signals: [],
};

const running = (): RunState => runReducer(initialRun, { type: "start", mode: "analyze" });

test("start analizi çalışır duruma alır ve önceki sonucu temizler", () => {
  const done: RunState = { ...initialRun, status: "done", result, vehicle, token: "t" };
  const s = runReducer(done, { type: "start", mode: "analyze" });
  expect(s.status).toBe("running");
  expect(s.mode).toBe("analyze");
  expect(s.result).toBeNull();
  expect(s.vehicle).toBeNull();
  expect(s.token).toBeNull();
  expect(s.stage).toBeNull();
});

test("tekrarlanan veya geride kalan stage olayı ilerlemeyi geri almaz", () => {
  let s = running();
  s = runReducer(s, { type: "event", event: { type: "stage", stage: "okuma" } });
  s = runReducer(s, { type: "event", event: { type: "stage", stage: "okuma" } });
  expect(s.stage).toBe("okuma");
  s = runReducer(s, { type: "event", event: { type: "stage", stage: "yorumlama" } });
  s = runReducer(s, { type: "event", event: { type: "stage", stage: "arac" } });
  expect(s.stage).toBe("yorumlama");
  expect(s.status).toBe("running");
});

test("vehicle olayı araç ve jetonu saklar", () => {
  const s = runReducer(running(), { type: "event", event: { type: "vehicle", vehicle, token: "tok" } });
  expect(s.vehicle).toEqual(vehicle);
  expect(s.token).toBe("tok");
  expect(s.stage).toBe("arac");
});

test("result olayı analizi bitirir", () => {
  const s = runReducer(running(), { type: "event", event: { type: "result", result } });
  expect(s.status).toBe("done");
  expect(s.result).toEqual(result);
});

test("error olayı bekleme durumunu bitirir", () => {
  const s = runReducer(running(), {
    type: "event",
    event: { type: "error", code: "refusal", message: "x" },
  });
  expect(s.status).toBe("error");
  expect(s.error).toBe("refusal");
});

test("sonuçsuz kapanan veya kopan akış internal hatasına döner", () => {
  expect(runReducer(running(), { type: "ended" })).toMatchObject({ status: "error", error: "internal" });
  expect(runReducer(running(), { type: "failed", code: "internal" })).toMatchObject({ status: "error", error: "internal" });
  expect(runReducer(running(), { type: "failed", code: "network" })).toMatchObject({ status: "error", error: "network" });
  expect(runReducer(running(), { type: "failed", code: "stalled" })).toMatchObject({ status: "error", error: "stalled" });
});

test("bitmiş bir analizde akış sonu ve geç gelen olaylar durumu değiştirmez", () => {
  const done = runReducer(running(), { type: "event", event: { type: "result", result } });
  expect(runReducer(done, { type: "ended" })).toBe(done);
  expect(runReducer(done, { type: "failed", code: "network" })).toBe(done);
  expect(
    runReducer(done, { type: "event", event: { type: "error", code: "internal", message: "x" } }),
  ).toBe(done);
});

test("düzeltme aracı ve jetonu korur, sonucu temizler, hakkı kullanılmış sayar", () => {
  const done: RunState = { ...initialRun, status: "done", mode: "analyze", result, vehicle, token: "tok" };
  const fixed = { ...vehicle, engineCc: 1998 };
  const s = runReducer(done, { type: "start", mode: "reinterpret", vehicle: fixed });
  expect(s.status).toBe("running");
  expect(s.mode).toBe("reinterpret");
  expect(s.vehicle).toEqual(fixed);
  expect(s.token).toBe("tok");
  expect(s.result).toBeNull();
  expect(s.stage).toBe("arac");
  expect(s.reinterpretUsed).toBe(true);
});

test("retryKind: geçici hatada aynı işlemi yineler, kalıcı hatada başa döner", () => {
  const err = (mode: "analyze" | "reinterpret", error: RunState["error"]): RunState => ({
    ...initialRun,
    status: "error",
    mode,
    error,
  });
  expect(retryKind(err("analyze", "internal"))).toBe("resubmit");
  expect(retryKind(err("analyze", "truncated"))).toBe("resubmit");
  expect(retryKind(err("reinterpret", "refusal"))).toBe("reinterpret");
  expect(retryKind(err("analyze", "not_report"))).toBe("restart");
  expect(retryKind(err("analyze", "upload_invalid"))).toBe("restart");
  expect(retryKind(err("reinterpret", "token_invalid"))).toBe("restart");
  expect(retryKind(err("reinterpret", "reinterpret_used"))).toBe("restart");
});

test("retryKind: yeni kalıcı kodlar (çok büyük, tavan, geçersiz düzeltme) aynı isteği yinelemez", () => {
  const err = (mode: "analyze" | "reinterpret", error: RunState["error"]): RunState => ({
    ...initialRun,
    status: "error",
    mode,
    error,
  });
  expect(retryKind(err("analyze", "upload_too_large"))).toBe("restart");
  expect(retryKind(err("analyze", "cap_reached"))).toBe("restart");
  expect(retryKind(err("reinterpret", "vehicle_invalid"))).toBe("restart");
  expect(retryKind(err("reinterpret", "request_invalid"))).toBe("restart");
  // Geçici: bağlantı, sunucu, bekleme
  expect(retryKind(err("analyze", "network"))).toBe("resubmit");
  expect(retryKind(err("analyze", "stalled"))).toBe("resubmit");
  expect(retryKind(err("reinterpret", "server_unavailable"))).toBe("reinterpret");
});

const inferredVehicle: Vehicle = { ...vehicle, engineCc: 1598, powerHp: null };

test("tahmini alanlar araç olayından, sonuçtan gelir ve düzeltmede değişmeyenler korunur", () => {
  let s = runReducer(running(), {
    type: "event",
    event: { type: "vehicle", vehicle: inferredVehicle, token: "tok", vehicleInferred: { engineCc: true } },
  });
  expect(s.vehicleInferred).toEqual({ engineCc: true });
  s = runReducer(s, {
    type: "event",
    event: { type: "result", result: { ...result, vehicle: inferredVehicle, vehicleInferred: { engineCc: true } } },
  });
  expect(s.vehicleInferred).toEqual({ engineCc: true });
  // Yalnız km düzeltildi: hacim hâlâ tahmini.
  const kmFixed = runReducer(s, { type: "start", mode: "reinterpret", vehicle: { ...inferredVehicle, km: 99000 } });
  expect(kmFixed.vehicleInferred).toEqual({ engineCc: true });
  // Hacim kullanıcı tarafından değişti: artık tahmini değil.
  const ccFixed = runReducer(s, { type: "start", mode: "reinterpret", vehicle: { ...inferredVehicle, engineCc: 1998 } });
  expect(ccFixed.vehicleInferred).toBeNull();
});

const doneWithResult = (): RunState => ({
  ...initialRun,
  status: "done",
  mode: "analyze",
  result,
  vehicle,
  token: "tok",
  stage: "yorumlama",
});

test("sunucu düzeltmeyi reddederse önceki sonuca dönülür, form kullanıcının yazdıklarıyla açılır, hak geri gelir", () => {
  const typo = { ...vehicle, year: 1949 };
  let s = runReducer(doneWithResult(), { type: "start", mode: "reinterpret", vehicle: typo });
  expect(s.prior?.result).toBe(result);
  s = runReducer(s, { type: "event", event: { type: "error", code: "vehicle_invalid", message: "x" } });
  expect(s.status).toBe("done");
  expect(s.result).toBe(result);
  expect(s.vehicle).toEqual(vehicle);
  expect(s.reinterpretUsed).toBe(false);
  expect(s.correction).toEqual({ draft: typo, code: "vehicle_invalid" });
  expect(s.error).toBeNull();
  expect(runReducer(s, { type: "dismissCorrection" }).correction).toBeNull();
  // Yeni düzeltme formu kapatır.
  expect(runReducer(s, { type: "start", mode: "reinterpret", vehicle }).correction).toBeNull();
});

test("geçici düzeltme hatasında önceki sonuca dönülebilir; yeniden deneme önceki sonucu korur", () => {
  const fixed = { ...vehicle, km: 99000 };
  let s = runReducer(doneWithResult(), { type: "start", mode: "reinterpret", vehicle: fixed });
  s = runReducer(s, { type: "failed", code: "network" });
  expect(s.status).toBe("error");
  expect(s.prior?.result).toBe(result);
  // Yeniden deneme (hata durumundan): önceki sonuç kaybolmaz.
  const again = runReducer(s, { type: "start", mode: "reinterpret", vehicle: fixed });
  expect(again.prior?.result).toBe(result);
  const back = runReducer(s, { type: "restorePrior" });
  expect(back).toMatchObject({ status: "done", result, vehicle, error: null, prior: null, reinterpretUsed: true });
  // Sonuç gelince önceki sonuç bırakılır.
  const ok = runReducer(again, { type: "event", event: { type: "result", result: { ...result, vehicle: fixed } } });
  expect(ok.prior).toBeNull();
  expect(ok.vehicle).toEqual(fixed);
});

test("aynı dosyalarla yinelenen model hatası sayılır; yeni analiz sayacı sıfırlar", () => {
  const refuse = (s: RunState) => runReducer(s, { type: "event", event: { type: "error", code: "refusal", message: "x" } });
  let s = refuse(running());
  expect(s.attempt).toBe(1);
  expect(repeatedModelFailure(s)).toBe(false);
  s = refuse(runReducer(s, { type: "start", mode: "analyze", resubmit: true }));
  expect(s.attempt).toBe(2);
  expect(repeatedModelFailure(s)).toBe(true);
  expect(runReducer(s, { type: "start", mode: "analyze" }).attempt).toBe(1);
  // Bağlantı hatası model hatası sayılmaz.
  const net = runReducer(runReducer(s, { type: "start", mode: "analyze", resubmit: true }), { type: "failed", code: "network" });
  expect(repeatedModelFailure(net)).toBe(false);
});
