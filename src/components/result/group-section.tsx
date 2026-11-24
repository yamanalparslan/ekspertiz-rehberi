import { GROUP_LABELS, GROUP_NOTES } from "@/lib/client/format";
import type { Group } from "@/lib/schema/interpretation";
import type { ResultItem } from "@/lib/schema/result";
import { ChevronIcon } from "../icons";
import { ItemCard, NormalRow } from "./item-card";
import { TONE } from "./tone";

/** Uzun listede (LONG_LIST'ten çok madde) baştan kaç kart açık gelir; kalanlar başlığıyla kapalı durur. */
export const OPEN_CARDS = 3;
export const LONG_LIST = 5;

/** Yapışkan atlama çubuğunun altında kalmasın diye bölüm başlığına bırakılan pay. */
const SCROLL_MARGIN = "scroll-mt-24";

function GroupHeading({ group, count }: { group: Group; count: number }) {
  return (
    <span className={`flex items-baseline gap-2.5 ${TONE[group].text}`}>
      <span className="text-2xl font-bold tracking-tight">{GROUP_LABELS[group]}</span>
      <span className="text-xl font-bold tabular-nums">{count}</span>
    </span>
  );
}

export function GroupSection({ group, items }: { group: Group; items: ResultItem[] }) {
  const id = `grup-${group}`;
  if (group === "normal") {
    return (
      <section id={id} aria-label={`${GROUP_LABELS[group]}: ${items.length} madde`} className={SCROLL_MARGIN}>
        <details className="group/normal">
          <summary
            className={`flex min-h-14 cursor-pointer items-center justify-between gap-4 border-b-4 ${TONE[group].rule} pb-2`}
          >
            <h2>
              <GroupHeading group={group} count={items.length} />
            </h2>
            <span className="flex items-center gap-1 font-bold text-action">
              <span className="group-open/normal:hidden">Listeyi aç</span>
              <span className="hidden group-open/normal:inline">Listeyi kapat</span>
              <ChevronIcon className="size-5 motion-safe:transition-transform group-open/normal:rotate-90" />
            </span>
          </summary>
          <p className="mt-2 text-ink-soft">{GROUP_NOTES[group]}</p>
          <ul className="mt-1 divide-y divide-rule">
            {items.map((it) => (
              <NormalRow key={it.itemId} item={it} />
            ))}
          </ul>
        </details>
      </section>
    );
  }
  const closed = items.length > LONG_LIST ? items.length - OPEN_CARDS : 0;
  return (
    <section id={id} aria-labelledby={`${id}-baslik`} className={SCROLL_MARGIN}>
      <h2 id={`${id}-baslik`} className={`border-b-4 ${TONE[group].rule} pb-2`}>
        <GroupHeading group={group} count={items.length} />
      </h2>
      <p className="mt-2 text-ink-soft">{GROUP_NOTES[group]}</p>
      {closed > 0 && (
        <p className="mt-1 text-[0.9375rem] text-ink-soft">
          İlk {OPEN_CARDS} madde açık; kalan {closed} maddenin ayrıntısı için başlığına dokunun.
        </p>
      )}
      <ol className="mt-4 space-y-4">
        {items.map((it, i) => (
          <ItemCard key={it.itemId} item={it} open={closed === 0 || i < OPEN_CARDS} />
        ))}
      </ol>
    </section>
  );
}
