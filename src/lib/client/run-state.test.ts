import { expect, test } from "vitest";
import type { AnalysisResult, Vehicle } from "@/lib/schema/result";
import { initialRun, retryKind, runReducer, type RunState } from "./run-state";

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
  expect(runReducer(running(), { type: "failed" })).toMatchObject({ status: "error", error: "internal" });
});

test("bitmiş bir analizde akış sonu ve geç gelen olaylar durumu değiştirmez", () => {
  const done = runReducer(running(), { type: "event", event: { type: "result", result } });
  expect(runReducer(done, { type: "ended" })).toBe(done);
  expect(runReducer(done, { type: "failed" })).toBe(done);
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
