import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { AnalysisResultSchema } from "@/lib/schema/result";

// /ornek sayfasının gösterdiği örnek sonuç (npm run sample:build ile üretilir).
const raw: unknown = JSON.parse(
  readFileSync(join(process.cwd(), "src/lib/__fixtures__/bmw-320i-2021.result.json"), "utf8"),
);

test("örnek sonuç AnalysisResult şemasına uyar", () => {
  expect(AnalysisResultSchema.safeParse(raw).success).toBe(true);
});

test("örnek kurgusaldır: kurgusal firma, bine yuvarlanmış km ve tutarlar, tahmini motor hacmi", () => {
  const result = AnalysisResultSchema.parse(raw);
  expect(result.report.firm).toBe("Kurgusal Oto Ekspertiz");
  expect(result.report.reportNo).toBeNull();
  expect(result.vehicle.km! % 1000).toBe(0);
  const damage = result.signals.find((s) => s.code === "hasar_parca_uyumlu");
  for (const d of damage?.details ?? []) expect(d, d).toMatch(/-01 — .* — [\d.]+\.000,00 TL$/);
  // Arayüzün "tahmini" etiketini örnekte göstermek için hacim paket adından tahmin edilir.
  expect(result.vehicleInferred).toEqual({ engineCc: true });
});

test("örnek sonuç dört grubu da gösterir ve yorumlanamayan madde içermez", () => {
  const result = AnalysisResultSchema.parse(raw);
  for (const g of ["dikkat", "kronik", "belirsiz", "normal"] as const) {
    expect(result.counts[g], g).toBeGreaterThan(0);
  }
  expect(result.items.some((i) => i.meaning === "Bu madde otomatik yorumlanamadı.")).toBe(false);
  expect(result.items.length).toBe(
    result.counts.dikkat + result.counts.kronik + result.counts.belirsiz + result.counts.normal,
  );
});
