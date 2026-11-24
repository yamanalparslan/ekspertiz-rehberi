import { splitDemo } from "@/lib/client/demo";
import { GROUP_ORDER } from "@/lib/client/format";
import type { QrFound } from "@/lib/client/qr";
import { DISCLAIMER } from "@/lib/copy";
import type { Group } from "@/lib/schema/interpretation";
import type { AnalysisResult } from "@/lib/schema/result";
import { CheckList } from "./result/check-list";
import { GroupSection } from "./result/group-section";
import { JumpBar } from "./result/jump-bar";
import { ResultHeader, Tally } from "./result/summary";
import { SignalList } from "./signal-list";

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

/**
 * Sonuç ekranı (spesifikasyon §9): başlık ve rapor bilgisi, grup sayıları (kaydırırken üstte
 * yapışık kalan atlama çubuğu), madde kareleri ve özet, gruplar (dikkat, kronik, belirsiz,
 * normal), kontrol listesi, güvenilirlik işaretleri, sorumluluk notu.
 * Sunucu bileşeni olarak da (/ornek) çalışır: kartlar <details> ile JavaScript'siz açılır.
 */
export function ResultView({ result, qr = [] }: { result: AnalysisResult; qr?: QrFound[] }) {
  const byGroup = (g: Group) => result.items.filter((it) => it.group === g);
  const ordered = GROUP_ORDER.flatMap(byGroup);
  const summary = splitDemo(result.summary);
  return (
    <div className="space-y-12">
      {/* Sayı çubuğu yalnız bu blok boyunca (özet ve gruplar) yapışık kalır. */}
      <div>
        <ResultHeader report={result.report} demo={summary.demo} />
        <JumpBar counts={result.counts} className="mt-4" />
        <div className="mt-4">
          <Tally items={ordered} />
          {summary.text !== "" && <p className="mt-5 max-w-prose text-lg leading-relaxed">{summary.text}</p>}
        </div>
        <div className="mt-12 space-y-12">
          {GROUP_ORDER.map((g) => {
            const items = byGroup(g);
            return items.length > 0 ? <GroupSection key={g} group={g} items={items} /> : null;
          })}
        </div>
      </div>
      {result.checkList.length > 0 && <CheckList items={result.checkList} />}
      <SignalList signals={result.signals} qr={qr} />
      <Disclaimer />
    </div>
  );
}
