import { CONSULT_EXPERT } from "@/lib/copy";
import type { ResultItem } from "@/lib/schema/result";
import { ChevronIcon, WarnIcon } from "../icons";
import { Badges } from "./badges";
import { Cost, Field, Sources } from "./fields";
import { TONE } from "./tone";

/**
 * Dikkat/kronik/belirsiz maddesi. Her kart açılıp kapanabilir (<details>, JavaScript'siz de
 * çalışır); uzun listelerde ilk birkaç kart açık gelir. "Dikkat" kartındaki danışma uyarısı
 * kart kapalıyken de görünür.
 */
export function ItemCard({ item, open }: { item: ResultItem; open: boolean }) {
  const tone = TONE[item.group];
  return (
    <li className={`rounded-r-xl border-l-[6px] ${tone.rule} ${tone.tint}`}>
      <details open={open} className="group/card">
        <summary className="flex min-h-14 cursor-pointer items-start justify-between gap-3 rounded-tr-xl px-4 pt-4 pb-3 sm:px-5">
          <span className="min-w-0">
            <h3 className="text-lg leading-snug font-bold">{item.title}</h3>
            <Badges item={item} />
          </span>
          <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[0.9375rem] font-bold text-action">
            <span className="group-open/card:hidden">Ayrıntılar</span>
            <ChevronIcon className="size-5 rotate-90 motion-safe:transition-transform group-open/card:-rotate-90" />
          </span>
        </summary>
        <dl className="space-y-3 px-4 pb-4 sm:px-5">
          <Field label="Ne demek">{item.meaning}</Field>
          {item.whyItMatters !== "" && <Field label="Neden önemli">{item.whyItMatters}</Field>}
          <Field label="Tahmini maliyet">
            <Cost cost={item.cost} />
          </Field>
          {item.askSeller && <Field label="Satıcıya sorun">{item.askSeller}</Field>}
          {item.chronic && <Sources chronic={item.chronic} />}
        </dl>
      </details>
      {item.group === "dikkat" && (
        <p className="mx-4 mb-4 flex items-start gap-2.5 rounded-lg border-[1.5px] border-dikkat-bar bg-paper px-3 py-2.5 font-bold text-dikkat sm:mx-5">
          <WarnIcon className="mt-0.5 size-5" />
          {CONSULT_EXPERT}
        </p>
      )}
    </li>
  );
}

/** "Normal" listesinin satırı: kısa açıklama; maliyet varsa gösterilir. */
export function NormalRow({ item }: { item: ResultItem }) {
  return (
    <li className="py-3.5">
      <h3 className="leading-snug font-bold">{item.title}</h3>
      <Badges item={item} />
      <p className="mt-0.5 text-ink-soft">{item.meaning}</p>
      {item.cost && (
        <dl className="mt-2">
          <Field label="Tahmini maliyet">
            <Cost cost={item.cost} />
          </Field>
        </dl>
      )}
    </li>
  );
}
