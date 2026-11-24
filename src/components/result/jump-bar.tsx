import { GROUP_LABELS, GROUP_ORDER } from "@/lib/client/format";
import type { AnalysisResult } from "@/lib/schema/result";
import { TONE } from "./tone";

/**
 * Grup sayıları ve gruplara atlama: özet ve gruplar boyunca ekranın üstüne yapışan çubuk
 * (sayı üstte, grup adı altta; 360 px'te de adlar kesilmez). Maddesi olmayan grup bağlantı
 * değil, yalnız sayıdır (gidecek bölüm yok). Yapışkanlık için kapsayıcının doğrudan çocuğu olmalı.
 */
export function JumpBar({ counts, className = "" }: { counts: AnalysisResult["counts"]; className?: string }) {
  return (
    <nav
      aria-label="Gruplar"
      className={`sticky top-0 z-10 -mx-4 bg-paper px-4 py-2 shadow-[0_1px_0_var(--color-rule)] sm:-mx-6 sm:px-6 ${className}`}
    >
      <ul className="grid grid-cols-4 gap-2">
        {GROUP_ORDER.map((g) => {
          const n = counts[g] ?? 0;
          const base = `flex min-h-14 flex-col justify-center rounded-lg border-t-4 bg-field px-2 py-1 leading-tight ${TONE[g].rule}`;
          const body = (
            <>
              <span className="text-2xl font-bold tabular-nums">{n}</span>
              <span className="text-[0.875rem] font-bold">{GROUP_LABELS[g]}</span>
            </>
          );
          return (
            <li key={g}>
              {n > 0 ? (
                <a
                  href={`#grup-${g}`}
                  aria-label={`${GROUP_LABELS[g]}: ${n} madde`}
                  className={`${base} ${TONE[g].text} hover:bg-rule/60`}
                >
                  {body}
                </a>
              ) : (
                <span className={`${base} ${TONE[g].text}`}>{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
