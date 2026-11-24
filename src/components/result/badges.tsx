import { GENERAL_UNVERIFIED, INTERNET_SOURCED, SINGLE_SOURCE } from "@/lib/copy";
import type { ResultItem } from "@/lib/schema/result";

/** Kaynak ve güven etiketi: "kronik" turuncu çerçeve; "plain" kesik çizgili gri (tahmini, tek kaynak). */
export function Badge({ children, tone }: { children: React.ReactNode; tone: "kronik" | "plain" }) {
  const style =
    tone === "kronik"
      ? "border-kronik-bar text-kronik bg-paper"
      : "border-belirsiz-bar border-dashed text-belirsiz bg-paper";
  return (
    <span
      className={`inline-flex items-center rounded-full border-[1.5px] px-2.5 py-0.5 text-[0.9375rem] font-semibold ${style}`}
    >
      {children}
    </span>
  );
}

export function Badges({ item }: { item: ResultItem }) {
  if (!item.chronic && !item.generalUnverified) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-2">
      {item.chronic && <Badge tone="kronik">{INTERNET_SOURCED}</Badge>}
      {item.chronic?.confidence === "dusuk" && <Badge tone="plain">{SINGLE_SOURCE}</Badge>}
      {item.generalUnverified && <Badge tone="plain">{GENERAL_UNVERIFIED}</Badge>}
    </span>
  );
}
