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
