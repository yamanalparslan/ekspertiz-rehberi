import type { Metadata } from "next";
import Link from "next/link";
import sample from "@/lib/__fixtures__/bmw-320i-2021.result.json";
import { ResultView } from "@/components/result-view";
import { VehicleCard } from "@/components/vehicle-card";
import { AnalysisResultSchema } from "@/lib/schema/result";

export const metadata: Metadata = {
  title: "Örnek sonuç | Ekspertiz Rehberi",
  description: "Ekspertiz Rehberi sonuç ekranının örneği.",
  // X-Robots-Tag başlığı da gönderilir (next.config.ts); başlığı görmeyen tarayıcılar için meta.
  robots: { index: false, follow: true },
};

// Örnek, gerçek hat fonksiyonlarıyla üretilmiş sabit bir sonuçtur (npm run sample:build).
// Firma adı kurgusaldır, km ve tutarlar yuvarlanmıştır.
const result = AnalysisResultSchema.parse(sample);

export default function SamplePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <div role="note" className="rounded-2xl bg-ink px-4 py-4 text-paper sm:px-5">
        <p className="text-lg font-bold">Örnek sonuç — gerçek bir analiz değildir.</p>
        <Link
          href="/"
          className="mt-1 inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-[3px]"
        >
          Kendi raporunuzu yükleyin
        </Link>
      </div>
      <VehicleCard vehicle={result.vehicle} inferred={result.vehicleInferred ?? null} />
      <ResultView result={result} />
    </main>
  );
}
