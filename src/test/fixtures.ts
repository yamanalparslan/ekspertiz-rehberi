// Bileşen testleri için küçük, elle yazılmış sonuç parçaları (rapor verisi değil).
import type { AnalysisResult, ResultItem, Vehicle } from "@/lib/schema/result";

export const vehicle: Vehicle = {
  brand: "BMW",
  model: "320i",
  variant: "1.6 First Edition",
  year: 2021,
  engineCc: 1598,
  powerHp: 170,
  fuel: "benzin",
  transmission: "otomatik",
  km: 136000,
};

let n = 0;
export function item(over: Partial<ResultItem> & Pick<ResultItem, "group">): ResultItem {
  n++;
  return {
    itemId: `i${n}`,
    floorApplied: false,
    title: `Madde ${n}`,
    meaning: `Anlamı ${n}`,
    whyItMatters: `Önemi ${n}`,
    askSeller: null,
    cost: null,
    chronic: null,
    generalUnverified: false,
    ...over,
  };
}

export const cost = (url: string): NonNullable<ResultItem["cost"]> => ({
  minTry: 8000,
  maxTry: 14000,
  partType: "orijinal",
  laborIncluded: true,
  source: { url, title: "Fiyat kaynağı" },
  asOf: "2026-05-10",
  stale: false,
});

export function result(items: ResultItem[], over: Partial<AnalysisResult> = {}): AnalysisResult {
  const counts = { dikkat: 0, kronik: 0, belirsiz: 0, normal: 0 };
  for (const it of items) counts[it.group]++;
  return {
    vehicle,
    report: { firm: "Kurgusal Oto Ekspertiz", reportNo: null, date: "2026-11-20" },
    summary: "Kısa özet.",
    counts,
    items,
    checkList: [],
    signals: [],
    ...over,
  };
}
