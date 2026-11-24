"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setLeaveGuard } from "@/lib/client/leave-guard";
import { repeatedModelFailure, retryKind, type RunState } from "@/lib/client/run-state";
import { assessSelection, uploadParts } from "@/lib/client/selection";
import { useAnalysis } from "@/lib/client/use-analysis";
import { useSelection } from "@/lib/client/use-selection";
import { ERROR_MESSAGES, type ProviderId } from "@/lib/copy";
import { Intro, Legend } from "./intro";
import { Progress } from "./progress";
import { ResultView } from "./result-view";
import { UploadForm, type Consents } from "./upload-form";
import { VehicleCard } from "./vehicle-card";

const LEAVE_RUNNING = "Analiz sürüyor. Ayrılırsanız analiz durur ve sonuç kaybolur. Ayrılmak istiyor musunuz?";
const LEAVE_DONE = "Ekrandaki sonuç silinecek. Ayrılmak istiyor musunuz?";

/** Ekranda emek var mı: süren analiz ya da gösterilen (veya geri dönülebilir) sonuç. */
const hasWork = (run: RunState) => run.status === "running" || run.status === "done" || (run.status === "error" && run.prior !== null);

/** Sekme kapatılırken / yenilenirken tarayıcının kendi onayı. */
function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}

/** Analiz sürerken ekran kararmasın (iOS kilitlenince sekme askıya alınır ve akış kopar). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        // İzin yok ya da desteklenmiyor: uyarı metni yeterli.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

function RunError(props: {
  run: RunState;
  onRetry: () => void;
  onEditPages: () => void;
  onRestorePrior: () => void;
}) {
  const { run } = props;
  if (run.error === null) return null;
  const kind = retryKind(run);
  const repeated = repeatedModelFailure(run);
  const secondary =
    "min-h-14 w-full rounded-xl border-[1.5px] border-rule bg-paper px-5 text-lg font-bold text-ink hover:bg-field sm:w-auto";
  return (
    <div role="alert" className="rounded-2xl border-l-[6px] border-dikkat-bar bg-dikkat-tint px-4 py-5 sm:px-5">
      <p className="text-lg font-bold text-dikkat">{ERROR_MESSAGES[run.error]}</p>
      {repeated && (
        <p className="mt-2 font-semibold">
          Aynı sorun yinelendi. Bulanık, eğik ya da kesik sayfaları kaldırıp daha az ve daha net sayfayla deneyin.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={props.onRetry}
          className="min-h-14 w-full rounded-xl bg-action px-5 text-lg font-bold text-on-action hover:bg-action-strong sm:w-auto"
        >
          {kind === "restart" ? "Yükleme ekranına dön" : "Tekrar dene"}
        </button>
        {repeated && (
          <button type="button" onClick={props.onEditPages} className={secondary}>
            Sayfaları düzenle
          </button>
        )}
        {run.prior && (
          <button type="button" onClick={props.onRestorePrior} className={secondary}>
            Önceki sonuca dön
          </button>
        )}
      </div>
    </div>
  );
}

/** "Yeni rapor yükle": ekranda emek varsa önce satır içinde onay ister. */
function NewReport({ run, onConfirm }: { run: RunState; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);
  const link = "min-h-11 rounded-lg px-3 font-bold text-action underline underline-offset-[3px] hover:bg-field";

  if (!asking) {
    return (
      <div className="flex justify-end">
        <button
          ref={askRef}
          type="button"
          onClick={() => (hasWork(run) ? setAsking(true) : onConfirm())}
          className={link}
        >
          Yeni rapor yükle
        </button>
      </div>
    );
  }
  return (
    <div role="group" aria-labelledby="yeni-rapor-soru" className="rounded-2xl border-[1.5px] border-rule px-4 py-4 sm:px-5">
      <p id="yeni-rapor-soru" className="font-bold">
        {run.status === "running" ? "Süren analiz durdurulacak ve sonucu gelmeyecek." : "Ekrandaki sonuç silinecek."}{" "}
        Yeni rapor yüklemek istiyor musunuz?
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className="min-h-12 rounded-xl bg-action px-5 font-bold text-on-action hover:bg-action-strong"
        >
          Evet, yeni rapor yükle
        </button>
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            requestAnimationFrame(() => askRef.current?.focus());
          }}
          className="min-h-12 rounded-xl border-[1.5px] border-rule px-5 font-bold text-ink hover:bg-field"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/**
 * Ana sayfa: yükleme ekranı ve analiz/sonuç ekranı. Seçilen sayfalar ve onaylar burada durur;
 * hata sonrası "Yükleme ekranına dön" ile kaybolmaz, "Yeni rapor yükle" ile temizlenir.
 */
export function Home({ provider }: { provider: ProviderId | null }) {
  const analysis = useAnalysis();
  const selection = useSelection();
  const [consents, setConsents] = useState<Consents>({ disclaimer: false, transfer: false });
  const [announce, setAnnounce] = useState("");
  const { run } = analysis;
  const state = assessSelection(selection.items);
  const work = hasWork(run);

  const { reset } = analysis;
  const { clear } = selection;
  const newReport = useCallback(() => {
    reset();
    clear();
    window.scrollTo({ top: 0 });
  }, [reset, clear]);

  useBeforeUnload(work);
  useWakeLock(run.status === "running");

  // Başlıktaki logo ve iç bağlantılar emek varken önce onay ister.
  useEffect(() => {
    setLeaveGuard(work ? { message: run.status === "running" ? LEAVE_RUNNING : LEAVE_DONE, onLeave: newReport } : null);
    return () => setLeaveGuard(null);
  }, [work, run.status, newReport]);

  // Sonuç gelince odak ve ekran sonucun başlığına taşınır, ekran okuyucuya duyurulur.
  // Sunucu düzeltmeyi reddettiyse odak formdaki hata mesajında kalır.
  const prevStatus = useRef(run.status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = run.status;
    if (run.status === "done" && was !== "done" && !run.correction) {
      const heading = document.getElementById("sonuc-baslik");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "start" });
      setAnnounce("Sonuç hazır.");
    } else if (run.status !== "done") {
      setAnnounce("");
    }
  }, [run.status, run.correction]);

  const start = () => {
    if (assessSelection(selection.items).kind !== "ok") return;
    const originals = selection.items.filter((i) => i.kind === "image").map((i) => i.file);
    analysis.analyze(uploadParts(selection.items), originals);
  };

  const live = (
    <p className="sr-only" aria-live="polite">
      {announce}
    </p>
  );

  if (run.status === "idle") {
    return (
      <main className="mx-auto max-w-2xl space-y-10 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        {live}
        <Intro />
        <UploadForm
          provider={provider}
          consents={consents}
          onConsentsChange={setConsents}
          items={selection.items}
          selection={state}
          onAdd={selection.add}
          onRemove={selection.remove}
          onClear={selection.clear}
          onStart={start}
        />
        <Legend />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      {live}
      <NewReport run={run} onConfirm={newReport} />

      {run.vehicle && (
        <VehicleCard
          vehicle={run.vehicle}
          inferred={run.vehicleInferred}
          onCorrect={run.token !== null ? analysis.reinterpret : undefined}
          correctDisabled={run.status !== "done"}
          used={run.reinterpretUsed}
          correction={run.correction}
          onDismissCorrection={analysis.dismissCorrection}
        />
      )}

      {run.status === "running" && <Progress stage={run.stage} startedAt={analysis.startedAt} />}

      {run.status === "error" && (
        <RunError
          run={run}
          onRetry={analysis.retry}
          onEditPages={analysis.reset}
          onRestorePrior={analysis.restorePrior}
        />
      )}

      {run.status === "done" && run.result && <ResultView result={run.result} qr={analysis.qr} />}
    </main>
  );
}
