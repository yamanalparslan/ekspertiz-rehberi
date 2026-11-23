import { useEffect, useState } from "react";
import { STAGES } from "@/lib/copy";
import { STAGE_ORDER, type Stage } from "@/lib/client/run-state";
import { CheckIcon, Spinner } from "./icons";

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
 * Üç adımlı ilerleme. "Araç bilgileri bulundu" bir varılan noktadır; araç okununca
 * o adım tamamlanmış sayılır ve yorumlama adımı etkin olur.
 */
export function Progress(props: {
  stage: Stage | null;
  startedAt: number;
  preparing: { done: number; total: number } | null;
}) {
  const active = props.stage === null || props.stage === "okuma" ? 0 : 2;
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
            <li key={stage} className="flex min-h-11 items-center gap-3">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                  done ? "bg-normal-bar text-white" : now ? "bg-action text-white" : "border-2 border-rule bg-paper"
                }`}
              >
                {done ? <CheckIcon className="size-5" /> : now ? <Spinner className="size-5" /> : null}
              </span>
              <span className={`text-lg ${now ? "font-bold" : done ? "font-semibold" : "text-ink-soft"}`}>
                {STAGES[stage]}
                {now && i === 0 && props.preparing && (
                  <span className="block text-[0.9375rem] font-normal text-ink-soft tabular-nums">
                    Fotoğraflar hazırlanıyor: {props.preparing.done}/{props.preparing.total}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 border-t border-rule pt-3 text-ink-soft">
        Analiz 30 ile 120 saniye sürebilir. Bu sayfayı açık tutun. Geçen süre <Elapsed since={props.startedAt} />
      </p>
    </section>
  );
}
