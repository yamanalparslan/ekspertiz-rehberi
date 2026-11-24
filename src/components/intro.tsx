import Link from "next/link";
import { GROUP_LABELS, GROUP_NOTES, GROUP_ORDER } from "@/lib/client/format";
import { TONE } from "./result/tone";

export function Intro() {
  return (
    <div>
      <h1 className="text-[2rem] leading-[1.1] font-bold tracking-tight text-balance sm:text-[2.5rem]">
        Ekspertiz raporunuzu sade Türkçeyle anlayın.
      </h1>
      <p className="mt-3 max-w-prose text-lg">
        Raporun sayfalarını çekin ya da PDF&apos;ini seçin. Her maddeyi ne anlama geldiğiyle birlikte dört gruptan
        birine koyarız.
      </p>
    </div>
  );
}

/** Sonuçta görülecek dört grup ve örnek sonuç bağlantısı. */
export function Legend() {
  return (
    <section aria-labelledby="gruplar-baslik" className="border-t border-rule pt-8">
      <h2 id="gruplar-baslik" className="text-xl font-bold tracking-tight">
        Sonuçta göreceğiniz gruplar
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {GROUP_ORDER.map((g) => (
          <div key={g} className="flex gap-3">
            <span aria-hidden="true" className={`mt-1 h-10 w-1.5 shrink-0 rounded-full ${TONE[g].bar}`} />
            <div>
              <dt className={`font-bold ${TONE[g].text}`}>{GROUP_LABELS[g]}</dt>
              <dd className="text-ink-soft">{GROUP_NOTES[g]}</dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="mt-5">
        <Link
          href="/ornek"
          className="inline-flex min-h-11 items-center font-bold text-action underline decoration-2 underline-offset-[3px]"
        >
          Örnek bir sonuç görün
        </Link>
      </p>
    </section>
  );
}
