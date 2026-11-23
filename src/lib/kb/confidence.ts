import type { Source } from "@/lib/schema/kb";

export type Confidence = "yuksek" | "dusuk";

function normDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/** Two or more distinct domains -> "yuksek"; otherwise "dusuk". */
export function confidenceFromSources(sources: Source[]): Confidence {
  const domains = new Set(sources.map((s) => normDomain(s.domain)));
  return domains.size >= 2 ? "yuksek" : "dusuk";
}
