import { INTERNET_SOURCED } from "@/lib/copy";
import type { AnalysisResult } from "@/lib/schema/result";
import { Badge } from "./badges";

/** Bu model için bilinen ama raporda görünmeyen sorunlar: ustaya sorulacaklar. */
export function CheckList({ items }: { items: AnalysisResult["checkList"] }) {
  return (
    <section aria-labelledby="kontrol-baslik">
      <h2 id="kontrol-baslik" className="flex items-baseline gap-2.5 text-2xl font-bold tracking-tight">
        Ustaya kontrol ettirin <span className="text-xl text-ink-soft tabular-nums">{items.length}</span>
      </h2>
      <p className="mt-1 max-w-prose text-ink-soft">
        Bu model için bilinen ama raporda görünmeyen sorunlar. Aracı bir ustaya gösterirken bunları da sorun.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((c) => (
          <li key={c.title} className="flex gap-3 rounded-xl border-[1.5px] border-rule px-4 py-3.5">
            <span aria-hidden="true" className="mt-1 size-5 shrink-0 rounded-[4px] border-2 border-ink" />
            <div className="min-w-0">
              <h3 className="leading-snug font-bold">{c.title}</h3>
              <p className="mt-0.5">{c.why}</p>
              <p className="mt-2">
                <Badge tone="kronik">{INTERNET_SOURCED}</Badge>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
