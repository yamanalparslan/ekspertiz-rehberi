"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Vehicle } from "@/lib/schema/result";
import { failureCode, STALL_MS } from "./failure";
import { readEventResponse } from "./ndjson";
import type { QrFound } from "./qr";
import { startQrScan } from "./qr-scan";
import { initialRun, retryKind, runReducer } from "./run-state";

/** Gönderilecek parça: küçültülmüş sayfa ya da PDF. Yalnızca bellekte tutulur. */
export type Part = { blob: Blob; name: string };

/**
 * Analiz akışı: yükleme, NDJSON olayları, düzeltme (yeniden yorumlama), yeniden deneme ve QR
 * taraması. Rapor verisi yalnız bellekte durur; konsola ya da tarayıcı deposuna yazılmaz.
 */
export function useAnalysis() {
  const [run, dispatch] = useReducer(runReducer, initialRun);
  const [startedAt, setStartedAt] = useState(0);
  const [qr, setQr] = useState<QrFound[]>([]);
  const parts = useRef<Part[]>([]);
  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const stopScan = useRef<(() => void) | null>(null);
  /** Aynı dokunuşla ikinci bir ücretli istek başlamasın diye eşzamanlı kilit. */
  const inFlight = useRef(false);

  useEffect(
    () => () => {
      controller.current?.abort();
      stopScan.current?.();
    },
    [],
  );

  /** Önceki isteği keser ve yeni bir çalıştırma kimliği verir; eski olaylar yok sayılır. */
  const begin = useCallback((): number => {
    controller.current?.abort();
    controller.current = new AbortController();
    inFlight.current = true;
    setStartedAt(Date.now());
    window.scrollTo({ top: 0 });
    return ++runId.current;
  }, []);

  const stream = useCallback(async (id: number, url: string, init: RequestInit) => {
    const live = () => runId.current === id;
    const ctrl = controller.current;
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Uzun süre hiç olay gelmezse istek kesilir; kullanıcı bekleme ekranında takılı kalmaz.
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        ctrl?.abort();
      }, STALL_MS);
    };
    arm();
    try {
      const res = await fetch(url, { ...init, signal: ctrl?.signal });
      arm();
      // 2xx dışı yanıt (ön akış hatası) da gövdesinde aynı biçimde bir hata olayı taşır.
      await readEventResponse(res, (event) => {
        arm();
        if (live()) dispatch({ type: "event", event });
      });
      if (live()) dispatch({ type: "ended" });
    } catch (e) {
      if (!live()) return;
      dispatch({ type: "failed", code: stalled ? "stalled" : failureCode(e, navigator.onLine) });
    } finally {
      clearTimeout(timer);
      if (live()) inFlight.current = false;
    }
  }, []);

  const send = useCallback(
    (id: number) => {
      const form = new FormData();
      for (const p of parts.current) form.append("files", p.blob, p.name);
      return stream(id, "/api/analyze", { method: "POST", body: form });
    },
    [stream],
  );

  /** Hazırlanmış parçalarla analizi başlatır; `originals` QR araması için özgün fotoğraflardır. */
  const analyze = useCallback(
    (ready: Part[], originals: readonly Blob[]) => {
      if (inFlight.current || ready.length === 0) return;
      const id = begin();
      dispatch({ type: "start", mode: "analyze" });
      stopScan.current?.();
      setQr([]);
      parts.current = ready;
      stopScan.current = startQrScan(originals, (found) => {
        if (runId.current === id) setQr(found);
      });
      void send(id);
    },
    [begin, send],
  );

  const reinterpret = useCallback(
    (vehicle: Vehicle) => {
      const token = run.token;
      if (token === null || inFlight.current) return;
      const id = begin();
      dispatch({ type: "start", mode: "reinterpret", vehicle });
      void stream(id, "/api/reinterpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, vehicle }),
      });
    },
    [run.token, begin, stream],
  );

  /** Analizi bırakır ve yükleme ekranına döner (seçilen sayfalar çağıranda kalır). */
  const reset = useCallback(() => {
    controller.current?.abort();
    stopScan.current?.();
    stopScan.current = null;
    runId.current++;
    inFlight.current = false;
    parts.current = [];
    setQr([]);
    dispatch({ type: "reset" });
  }, []);

  /** Hata ekranındaki ana düğme: geçici hatada aynı istek, kalıcı hatada yükleme ekranı. */
  const retry = useCallback(() => {
    const kind = retryKind(run);
    if (kind === "resubmit" && parts.current.length > 0 && !inFlight.current) {
      const id = begin();
      dispatch({ type: "start", mode: "analyze", resubmit: true });
      void send(id);
    } else if (kind === "reinterpret" && run.vehicle) {
      reinterpret(run.vehicle);
    } else {
      reset();
    }
  }, [run, begin, send, reinterpret, reset]);

  const restorePrior = useCallback(() => dispatch({ type: "restorePrior" }), []);
  const dismissCorrection = useCallback(() => dispatch({ type: "dismissCorrection" }), []);

  return { run, startedAt, qr, analyze, reinterpret, retry, reset, restorePrior, dismissCorrection };
}
