import { formatDate } from "@/lib/client/format";
import type { AnalysisResult, ResultItem } from "@/lib/schema/result";
import { TONE } from "./tone";

/** Her kare rapordaki bir madde: raporun tamamı tek bakışta. */
export function Tally({ items }: { items: ResultItem[] }) {
  return (
    <figure>
      <div aria-hidden="true" className="flex flex-wrap gap-[3px]">
        {items.map((it) => (
          <span key={it.itemId} className={`size-3 rounded-[3px] ${TONE[it.group].bar}`} />
        ))}
      </div>
      <figcaption className="mt-1.5 text-[0.9375rem] text-ink-soft">Her kare rapordaki bir madde.</figcaption>
    </figure>
  );
}

/** Çevrimdışı demodan gelen sonuç: gerçek analizle karışmasın diye açık bir işaret. */
function DemoNote() {
  return (
    <p role="note" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-ink px-4 py-3 text-paper">
      <span className="rounded-md border-2 border-paper px-2 py-0.5 text-[0.9375rem] font-bold tracking-wide">DEMO</span>
      <span className="font-semibold">Çevrimdışı demo sonucu; gerçek bir analiz değildir.</span>
    </p>
  );
}

/** Sonucun başı: başlık (sonuç gelince odak buraya taşınır), demo işareti, rapor tarihi ve firma. */
export function ResultHeader({ report, demo }: { report: AnalysisResult["report"]; demo: boolean }) {
  const { date, firm } = report;
  return (
    <section aria-labelledby="sonuc-baslik">
      <h2 id="sonuc-baslik" tabIndex={-1} className="scroll-mt-4 text-[1.75rem] leading-tight font-bold tracking-tight">
        Sonuç
      </h2>
      {demo && <DemoNote />}
      {(date || firm) && (
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          {date && (
            <div className="flex gap-1.5">
              <dt className="text-ink-soft">Rapor tarihi</dt>
              <dd className="font-semibold tabular-nums">{formatDate(date)}</dd>
            </div>
          )}
          {firm && (
            <div className="flex gap-1.5">
              <dt className="text-ink-soft">Firma</dt>
              <dd className="font-semibold">{firm}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
