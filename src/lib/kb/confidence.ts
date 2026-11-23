import type { Source } from "@/lib/schema/kb";

export type Confidence = "yuksek" | "dusuk";

/** Complaint sites hold user reports, not independent corroboration: they never raise confidence. */
export const COMPLAINT_DOMAINS: readonly string[] = ["sikayetvar.com"];

function normDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/** Two or more distinct non-complaint domains -> "yuksek"; otherwise "dusuk". */
export function confidenceFromSources(sources: Source[]): Confidence {
  const domains = new Set(
    sources.map((s) => normDomain(s.domain)).filter((d) => !COMPLAINT_DOMAINS.includes(d)),
  );
  return domains.size >= 2 ? "yuksek" : "dusuk";
}
