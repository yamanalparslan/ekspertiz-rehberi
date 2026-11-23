"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Progress } from "@/components/progress";
import { ResultView } from "@/components/result-view";
import type { QrFound } from "@/components/signal-list";
import { UploadForm } from "@/components/upload-form";
import { VehicleCard } from "@/components/vehicle-card";
import { MAX_TOTAL_BYTES } from "@/lib/client/files";
import { GROUP_LABELS, GROUP_NOTES, GROUP_ORDER } from "@/lib/client/format";
import { readNdjson } from "@/lib/client/ndjson";
import { decodeQr, qrLink } from "@/lib/client/qr";
import { readPixels, resizeImage } from "@/lib/client/resize";
import { initialRun, retryKind, runReducer } from "@/lib/client/run-state";
import { ERROR_MESSAGES } from "@/lib/copy";
import type { Group } from "@/lib/schema/interpretation";
import type { Vehicle } from "@/lib/schema/result";

// Yüklenecek parça: küçültülmüş görsel ya da PDF. Yalnızca bellekte tutulur.
type Part = { blob: Blob; name: string };

const SWATCH: Record<Group, string> = {
  dikkat: "bg-dikkat-bar",
  kronik: "bg-kronik-bar",
  belirsiz: "bg-belirsiz-bar",
  normal: "bg-normal-bar",
};
const LABEL_TONE: Record<Group, string> = {
  dikkat: "text-dikkat",
  kronik: "text-kronik",
  belirsiz: "text-belirsiz",
  normal: "text-normal",
};

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

async function prepare(files: File[], onProgress: (done: number) => void): Promise<Part[]> {
  const parts: Part[] = [];
  for (const [n, f] of files.entries()) {
    parts.push(
      f.type === "application/pdf"
        ? { blob: f, name: "rapor.pdf" }
        : { blob: await resizeImage(f), name: `sayfa-${n + 1}.jpg` },
    );
    onProgress(n + 1);
  }
  return parts;
}

function Intro() {
  return (
    <div>
      <h1 className="text-[2rem] leading-[1.1] font-bold tracking-tight text-balance sm:text-[2.5rem]">
        Ekspertiz raporunuzu sade Türkçeyle anlayın.
      </h1>
      <p className="mt-3 max-w-prose text-lg">
        Raporun sayfalarını çekin ya da PDF'ini seçin. Her maddeyi ne anlama geldiğiyle birlikte dört gruptan birine
        koyarız.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <section aria-labelledby="gruplar-baslik" className="border-t border-rule pt-8">
      <h2 id="gruplar-baslik" className="text-xl font-bold tracking-tight">
        Sonuçta göreceğiniz gruplar
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {GROUP_ORDER.map((g) => (
          <div key={g} className="flex gap-3">
            <span aria-hidden="true" className={`mt-1 h-10 w-1.5 shrink-0 rounded-full ${SWATCH[g]}`} />
            <div>
              <dt className={`font-bold ${LABEL_TONE[g]}`}>{GROUP_LABELS[g]}</dt>
              <dd className="text-ink-soft">{GROUP_NOTES[g]}</dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="mt-5">
        <a
          href="/ornek"
          className="inline-flex min-h-11 items-center font-bold text-action underline decoration-2 underline-offset-[3px]"
        >
          Örnek bir sonuç görün
        </a>
      </p>
    </section>
  );
}

export default function Home() {
  const [run, dispatch] = useReducer(runReducer, initialRun);
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [qr, setQr] = useState<QrFound[]>([]);
  const parts = useRef<Part[]>([]);
  const runId = useRef(0);
  const scanId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  /** Önceki isteği keser ve yeni bir çalıştırma kimliği verir; eski olaylar yok sayılır. */
  function begin(): number {
    controller.current?.abort();
    controller.current = new AbortController();
    setStartedAt(Date.now());
    window.scrollTo({ top: 0 });
    return ++runId.current;
  }

  async function stream(id: number, url: string, init: RequestInit) {
    const live = () => runId.current === id;
    try {
      const res = await fetch(url, { ...init, signal: controller.current?.signal });
      if (!res.ok || !res.body) throw new Error("yanıt yok");
      await readNdjson(res.body, (event) => {
        if (live()) dispatch({ type: "event", event });
      });
      if (live()) dispatch({ type: "ended" });
    } catch {
      if (live()) dispatch({ type: "failed" });
    }
  }

  function send(id: number) {
    const form = new FormData();
    for (const p of parts.current) form.append("files", p.blob, p.name);
    return stream(id, "/api/analyze", { method: "POST", body: form });
  }

  /** Görsellerde QR kodu arar. Analizi bekletmez; sırayla ve araya nefes payı koyarak çalışır. */
  async function scanQr(images: Blob[]) {
    const id = ++scanId.current;
    const found: QrFound[] = [];
    for (const blob of images) {
      await nextTick();
      if (scanId.current !== id) return;
      try {
        const text = decodeQr(await readPixels(blob));
        const link = text === null ? null : qrLink(text);
        if (link && !found.some((f) => f.url === link.url)) {
          found.push(link);
          if (scanId.current === id) setQr([...found]);
        }
      } catch {
        // Okunamayan görselde QR aranmaz.
      }
    }
  }

  async function analyze(files: File[]) {
    const id = begin();
    dispatch({ type: "start", mode: "analyze" });
    setQr([]);
    scanId.current++;
    parts.current = [];
    setPreparing({ done: 0, total: files.length });
    let prepared: Part[];
    try {
      prepared = await prepare(files, (done) => {
        if (runId.current === id) setPreparing({ done, total: files.length });
      });
    } catch {
      prepared = [];
    }
    if (runId.current !== id) return;
    setPreparing(null);
    const total = prepared.reduce((n, p) => n + p.blob.size, 0);
    if (prepared.length === 0 || total > MAX_TOTAL_BYTES) {
      const code = "upload_invalid";
      dispatch({ type: "event", event: { type: "error", code, message: ERROR_MESSAGES[code] } });
      return;
    }
    parts.current = prepared;
    // QR özgün fotoğraflarda aranır; küçültülmüş görselde küçük kodlar kaybolabiliyor.
    void scanQr(files.filter((f) => f.type !== "application/pdf"));
    await send(id);
  }

  function reinterpret(vehicle: Vehicle) {
    const token = run.token;
    if (token === null) return;
    const id = begin();
    dispatch({ type: "start", mode: "reinterpret", vehicle });
    void stream(id, "/api/reinterpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, vehicle }),
    });
  }

  function reset() {
    controller.current?.abort();
    runId.current++;
    scanId.current++;
    parts.current = [];
    setPreparing(null);
    setQr([]);
    dispatch({ type: "reset" });
  }

  function retry() {
    const kind = retryKind(run);
    if (kind === "resubmit" && parts.current.length > 0) {
      const id = begin();
      dispatch({ type: "start", mode: "analyze" });
      void send(id);
    } else if (kind === "reinterpret" && run.vehicle) {
      reinterpret(run.vehicle);
    } else {
      reset();
    }
  }

  if (run.status === "idle") {
    return (
      <main className="mx-auto max-w-2xl space-y-10 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <Intro />
        <UploadForm onStart={(files) => void analyze(files)} />
        <Legend />
      </main>
    );
  }

  const canCorrect = run.token !== null && !(run.status === "running" && run.mode === "reinterpret");

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-lg px-3 font-bold text-action underline underline-offset-[3px] hover:bg-field"
        >
          Yeni rapor yükle
        </button>
      </div>

      {run.vehicle && (
        <VehicleCard
          vehicle={run.vehicle}
          correctAction={canCorrect ? reinterpret : undefined}
          used={run.reinterpretUsed}
        />
      )}

      {run.status === "running" && <Progress stage={run.stage} startedAt={startedAt} preparing={preparing} />}

      {run.status === "error" && run.error && (
        <div role="alert" className="rounded-2xl border-l-[6px] border-dikkat-bar bg-dikkat-tint px-4 py-5 sm:px-5">
          <p className="text-lg font-bold text-dikkat">{ERROR_MESSAGES[run.error]}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 min-h-14 w-full rounded-xl bg-action px-5 text-lg font-bold text-white hover:bg-action-strong sm:w-auto"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {run.status === "done" && run.result && <ResultView result={run.result} qr={qr} />}
    </main>
  );
}
