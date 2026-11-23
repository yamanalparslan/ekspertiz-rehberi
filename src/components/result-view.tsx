import {
  CONSULT_EXPERT,
  DISCLAIMER,
  GENERAL_UNVERIFIED,
  INTERNET_SOURCED,
  PRICE_MISSING,
  SINGLE_SOURCE,
} from "@/lib/copy";
import { GROUP_LABELS, GROUP_NOTES, GROUP_ORDER, costLine, formatDate } from "@/lib/client/format";
import { qrLink } from "@/lib/client/qr";
import type { Group } from "@/lib/schema/interpretation";
import type { AnalysisResult, ResultItem } from "@/lib/schema/result";
import { ChevronIcon, WarnIcon } from "./icons";
import { ExternalLink, SignalList, type QrFound } from "./signal-list";

// Tailwind sınıfları tam adlarıyla yazılır (taranabilmeleri için).
const TONE: Record<Group, { text: string; bar: string; tint: string; rule: string }> = {
  dikkat: { text: "text-dikkat", bar: "bg-dikkat-bar", tint: "bg-dikkat-tint", rule: "border-dikkat-bar" },
  kronik: { text: "text-kronik", bar: "bg-kronik-bar", tint: "bg-kronik-tint", rule: "border-kronik-bar" },
  belirsiz: {
    text: "text-belirsiz",
    bar: "bg-belirsiz-bar",
    tint: "bg-belirsiz-tint",
    rule: "border-belirsiz-bar",
  },
  normal: { text: "text-normal", bar: "bg-normal-bar", tint: "bg-normal-tint", rule: "border-normal-bar" },
};

function Badge({ children, tone }: { children: React.ReactNode; tone: "kronik" | "plain" }) {
  const style =
    tone === "kronik"
      ? "border-kronik-bar text-kronik bg-paper"
      : "border-belirsiz-bar border-dashed text-belirsiz bg-paper";
  return (
    <span className={`inline-flex items-center rounded-full border-[1.5px] px-2.5 py-0.5 text-[0.9375rem] font-semibold ${style}`}>
      {children}
    </span>
  );
}

function Badges({ item }: { item: ResultItem }) {
  if (!item.chronic && !item.generalUnverified) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-2">
      {item.chronic && <Badge tone="kronik">{INTERNET_SOURCED}</Badge>}
      {item.chronic?.confidence === "dusuk" && <Badge tone="plain">{SINGLE_SOURCE}</Badge>}
      {item.generalUnverified && <Badge tone="plain">{GENERAL_UNVERIFIED}</Badge>}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.9375rem] font-bold text-ink-soft">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Cost({ cost }: { cost: ResultItem["cost"] }) {
  if (!cost) return <span className="text-ink-soft">{PRICE_MISSING}</span>;
  const line = costLine(cost);
  const source = qrLink(cost.source.url);
  return (
    <span className="block">
      <span className="block text-xl font-bold tabular-nums">{line.range}</span>
      <span className="block">
        {line.partType}, {line.labor}
      </span>
      <span className="block text-ink-soft">
        {line.asOf}
        {line.stale && (
          <>
            , <strong className="font-bold whitespace-nowrap text-kronik">{line.stale}</strong>
          </>
        )}
      </span>
      <span className="mt-1 block text-[0.9375rem]">
        Kaynak: {source ? <ExternalLink href={source.url}>{cost.source.title}</ExternalLink> : cost.source.title}
      </span>
    </span>
  );
}

function Sources({ chronic }: { chronic: NonNullable<ResultItem["chronic"]> }) {
  const links = chronic.sources
    .map((s) => ({ title: s.title, link: qrLink(s.url) }))
    .filter((s): s is { title: string; link: { url: string; domain: string } } => s.link !== null);
  if (links.length === 0) return null;
  return (
    <Field label="Bilinen sorunun kaynakları">
      <ul className="space-y-1.5">
        {links.map((s) => (
          <li key={s.link.url}>
            <ExternalLink href={s.link.url}>{s.title}</ExternalLink>{" "}
            <span className="text-ink-soft">({s.link.domain})</span>
          </li>
        ))}
      </ul>
    </Field>
  );
}

function ItemCard({ item }: { item: ResultItem }) {
  const tone = TONE[item.group];
  return (
    <li className={`rounded-r-xl border-l-[6px] ${tone.rule} ${tone.tint} px-4 py-4 sm:px-5`}>
      <h3 className="text-lg font-bold leading-snug">{item.title}</h3>
      <Badges item={item} />
      <dl className="mt-3 space-y-3">
        <Field label="Ne demek">{item.meaning}</Field>
        {item.whyItMatters !== "" && <Field label="Neden önemli">{item.whyItMatters}</Field>}
        <Field label="Tahmini maliyet">
          <Cost cost={item.cost} />
        </Field>
        {item.askSeller && <Field label="Satıcıya sorun">{item.askSeller}</Field>}
        {item.chronic && <Sources chronic={item.chronic} />}
      </dl>
      {item.group === "dikkat" && (
        <p className="mt-4 flex items-start gap-2.5 rounded-lg border-[1.5px] border-dikkat-bar bg-paper px-3 py-2.5 font-bold text-dikkat">
          <WarnIcon className="mt-0.5 size-5" />
          {CONSULT_EXPERT}
        </p>
      )}
    </li>
  );
}

function NormalRow({ item }: { item: ResultItem }) {
  return (
    <li className="py-3.5">
      <h3 className="font-bold leading-snug">{item.title}</h3>
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

function GroupHeading({ group, count }: { group: Group; count: number }) {
  return (
    <span className={`flex items-baseline gap-2.5 ${TONE[group].text}`}>
      <span className="text-2xl font-bold tracking-tight">{GROUP_LABELS[group]}</span>
      <span className="text-xl font-bold tabular-nums">{count}</span>
    </span>
  );
}

function GroupSection({ group, items }: { group: Group; items: ResultItem[] }) {
  const id = `grup-${group}`;
  if (group === "normal") {
    return (
      <section id={id} aria-label={`${GROUP_LABELS[group]}: ${items.length} madde`} className="scroll-mt-4">
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
  return (
    <section id={id} aria-labelledby={`${id}-baslik`} className="scroll-mt-4">
      <h2 id={`${id}-baslik`} className={`border-b-4 ${TONE[group].rule} pb-2`}>
        <GroupHeading group={group} count={items.length} />
      </h2>
      <p className="mt-2 text-ink-soft">{GROUP_NOTES[group]}</p>
      <ol className="mt-4 space-y-4">
        {items.map((it) => (
          <ItemCard key={it.itemId} item={it} />
        ))}
      </ol>
    </section>
  );
}

/** Her kare rapordaki bir madde: raporun tamamı tek bakışta. */
function Tally({ items }: { items: ResultItem[] }) {
  return (
    <figure className="mt-5">
      <div aria-hidden="true" className="flex flex-wrap gap-[3px]">
        {items.map((it) => (
          <span key={it.itemId} className={`size-3 rounded-[3px] ${TONE[it.group].bar}`} />
        ))}
      </div>
      <figcaption className="mt-1.5 text-[0.9375rem] text-ink-soft">Her kare rapordaki bir madde.</figcaption>
    </figure>
  );
}

function Counts({ counts }: { counts: AnalysisResult["counts"] }) {
  return (
    <ul className="mt-5 grid grid-cols-4 gap-2">
      {GROUP_ORDER.map((g) => (
        <li key={g}>
          <a
            href={`#grup-${g}`}
            className={`flex min-h-16 flex-col justify-center rounded-xl border-t-4 ${TONE[g].rule} bg-field px-2 py-2 ${TONE[g].text}`}
          >
            <span className="text-[1.75rem] leading-none font-bold tabular-nums">{counts[g] ?? 0}</span>
            <span className="mt-1 text-[0.9375rem] font-bold">{GROUP_LABELS[g]}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function CheckList({ items }: { items: AnalysisResult["checkList"] }) {
  return (
    <section aria-labelledby="kontrol-baslik">
      <h2 id="kontrol-baslik" className="flex items-baseline gap-2.5 text-2xl font-bold tracking-tight">
        Ustaya kontrol ettirin <span className="text-xl tabular-nums text-ink-soft">{items.length}</span>
      </h2>
      <p className="mt-1 max-w-prose text-ink-soft">
        Bu model için bilinen ama raporda görünmeyen sorunlar. Aracı bir ustaya gösterirken bunları da sorun.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((c) => (
          <li key={c.title} className="flex gap-3 rounded-xl border-[1.5px] border-rule px-4 py-3.5">
            <span aria-hidden="true" className="mt-1 size-5 shrink-0 rounded-[4px] border-2 border-ink" />
            <div className="min-w-0">
              <h3 className="font-bold leading-snug">{c.title}</h3>
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

export function Disclaimer() {
  return (
    <section aria-labelledby="sorumluluk-baslik" className="border-t-[3px] border-ink pt-5">
      <h2 id="sorumluluk-baslik" className="text-lg font-bold">
        Sorumluluk notu
      </h2>
      <p className="mt-1.5 max-w-prose">{DISCLAIMER}</p>
    </section>
  );
}

/** Sonuç ekranı (spesifikasyon §9): özet, gruplar, kontrol listesi, işaretler, sorumluluk notu. */
export function ResultView({ result, qr = [] }: { result: AnalysisResult; qr?: QrFound[] }) {
  const byGroup = (g: Group) => result.items.filter((it) => it.group === g);
  const ordered = GROUP_ORDER.flatMap(byGroup);
  const { date, firm } = result.report;
  return (
    <div className="space-y-12">
      <section aria-labelledby="sonuc-baslik">
        <h2 id="sonuc-baslik" className="text-[1.75rem] leading-tight font-bold tracking-tight">
          Sonuç
        </h2>
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
        <Counts counts={result.counts} />
        <Tally items={ordered} />
        {result.summary !== "" && <p className="mt-5 max-w-prose text-lg leading-relaxed">{result.summary}</p>}
      </section>

      {GROUP_ORDER.map((g) => {
        const items = byGroup(g);
        return items.length > 0 ? <GroupSection key={g} group={g} items={items} /> : null;
      })}

      {result.checkList.length > 0 && <CheckList items={result.checkList} />}
      <SignalList signals={result.signals} qr={qr} />
      <Disclaimer />
    </div>
  );
}
