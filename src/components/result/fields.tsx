import { costLine } from "@/lib/client/format";
import { qrLink } from "@/lib/client/qr";
import { PRICE_MISSING } from "@/lib/copy";
import type { ResultItem } from "@/lib/schema/result";
import { ExternalLink } from "../signal-list";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.9375rem] font-bold text-ink-soft">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** Tahmini maliyet: aralık, parça tipi, işçilik, fiyat tarihi ve kaynak; yoksa PRICE_MISSING. */
export function Cost({ cost }: { cost: ResultItem["cost"] }) {
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

/** Kronik sorunun kaynakları; yalnız geçerli http(s) bağlantıları gösterilir. */
export function Sources({ chronic }: { chronic: NonNullable<ResultItem["chronic"]> }) {
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
