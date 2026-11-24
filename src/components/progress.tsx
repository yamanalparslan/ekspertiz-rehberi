"use client";

import { useEffect, useRef, useState } from "react";
import { STAGES } from "@/lib/copy";
import { STAGE_ORDER, type Stage } from "@/lib/client/run-state";
import { CheckIcon, Spinner } from "./icons";

/** "Araç bilgileri bulundu" en az bu kadar etkin adım olarak görünür (sunucu hemen yorumlamaya geçer). */
export const ARAC_DWELL_MS = 1500;

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/**
 * Gösterilen adım: sunucunun ulaştığı aşamayı adım adım izler. Araç bilgisi gelince
 * "Araç bilgileri bulundu" etkin adım olur ve yorumlama olayı hemen ardından gelse bile en az
 * ARAC_DWELL_MS görünür kalır; böylece kullanıcı aracın bulunduğunu fark eder.
 */
function useShownStep(stage: Stage | null): number {
  const target = stage === null ? 0 : STAGE_ORDER.indexOf(stage);
  const [shown, setShown] = useState(target);
  const shownAt = useRef(0);

  useEffect(() => {
    if (target < shown) {
      setShown(target);
      return;
    }
    if (target === shown) return;
    // Bir sonraki adıma geç; "arac" adımından çıkmadan önce bekleme süresini doldur.
    const wait = shown === 1 ? Math.max(0, ARAC_DWELL_MS - (Date.now() - shownAt.current)) : 0;
    // Mutlak değer: önceki bir zamanlayıcı da çalışmışsa adım iki kez atlanmaz.
    const next = shown + 1;
    const t = setTimeout(() => {
      shownAt.current = Date.now();
      setShown(next);
    }, wait);
    return () => clearTimeout(t);
  }, [target, shown]);

  return shown;
}

/** Üç adımlı ilerleme: rapor okunuyor, araç bilgileri bulundu, maddeler yorumlanıyor. */
export function Progress(props: { stage: Stage | null; startedAt: number }) {
  const active = useShownStep(props.stage);
  const current = STAGES[STAGE_ORDER[active]];

  return (
    <section aria-labelledby="ilerleme-baslik" className="rounded-2xl bg-field px-4 py-5 sm:px-5">
      <h2 id="ilerleme-baslik" className="sr-only">
        İlerleme
      </h2>
      <p className="sr-only" aria-live="polite">
        {current}
      </p>
      <ol className="space-y-1">
        {STAGE_ORDER.map((stage, i) => {
          const done = i < active;
          const now = i === active;
          return (
            <li key={stage} aria-current={now ? "step" : undefined} className="flex min-h-11 items-center gap-3">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                  done ? "bg-normal-bar text-paper" : now ? "bg-action text-on-action" : "border-2 border-rule bg-paper"
                }`}
              >
                {done ? <CheckIcon className="size-5" /> : now ? <Spinner className="size-5" /> : null}
              </span>
              <span className={`text-lg ${now ? "font-bold" : done ? "font-semibold" : "text-ink-soft"}`}>
                {STAGES[stage]}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 border-t border-rule pt-3 text-ink-soft">
        Analiz 30 ile 120 saniye sürebilir. Bu sayfayı açık tutun ve ekranı kilitlemeyin; telefon kilitlenirse
        bağlantı kopabilir. Geçen süre <Elapsed since={props.startedAt} />
      </p>
    </section>
  );
}
