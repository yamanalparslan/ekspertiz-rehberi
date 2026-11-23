// Canlı deneme: klasördeki rapor dosyalarını okutur, yalnızca ÖZET basar.
// Kullanım: npx tsx scripts/smoke-analyze.ts <klasör> [--extract-only]
// Tam mod bilgi tabanını diskten (kb/) yükler; D1'e dokunmaz.
import { createClaude, providerLabel } from "../src/lib/claude/client";
import { extractReport } from "../src/lib/claude/extract";
import { interpretReport } from "../src/lib/claude/interpret";
import { normalizeExtraction } from "../src/lib/normalize";
import { buildResult } from "../src/lib/pipeline/result";
import { computeFloors } from "../src/lib/rules/floors";
import { computeSignals } from "../src/lib/signals/signals";
import { matchKnowledge } from "../src/lib/kb/match";
import { geminiOptions, loadApiKey, loadKb, piiHits, readUploadFiles } from "./shared";

async function main() {
  const [dir, flag] = process.argv.slice(2);
  if (!dir) {
    console.error("Kullanım: tsx scripts/smoke-analyze.ts <klasör> --extract-only");
    process.exit(2);
  }
  const extractOnly = flag === "--extract-only";
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY veya GEMINI_API_KEY bulunamadı (ortam değişkeni veya .dev.vars).");
    process.exit(2);
  }

  const files = readUploadFiles(dir);
  if (files.length === 0) {
    console.error("Klasörde desteklenen dosya yok.");
    process.exit(2);
  }

  const gemini = geminiOptions();
  // Harcama, çalışan sağlayıcının fiyat tablosuyla hesaplanır (usageToUsd Gemini kullanımını tanır).
  const provider = providerLabel(apiKey, gemini);
  const claude = createClaude(apiKey, gemini);
  const { raw, usd } = await extractReport(claude, files);
  const dyno = raw.measurements.find((m) => m.test === "dinamometre_guc");
  const lines = [
    "SUMMARY",
    `provider: ${provider}`,
    `files: ${files.length}`,
    `isReport: ${raw.isReport}`,
    `vehicle: ${[raw.vehicle.brand, raw.vehicle.model, raw.vehicle.variant, raw.vehicle.year, raw.vehicle.engineCc, raw.vehicle.powerHp, raw.vehicle.fuel, raw.vehicle.transmission, raw.vehicle.km].join(" | ")}`,
    `report date: ${raw.report.date}`,
    `sectionsPresent: ${raw.sectionsPresent.length}`,
    `items: ${raw.items.length}`,
    `measurements: ${raw.measurements.length}`,
    `obd rawFaults: ${raw.obd.rawFaults.length}`,
    `dyno performed: ${dyno ? dyno.performed : "n/a"}`,
    `cost USD: ${usd.toFixed(4)}`,
  ];
  // PII taraması tam çıktı metni üzerinde yapılır; ham JSON basılmaz.
  const hits = piiHits(JSON.stringify(raw));
  lines.push(hits === 0 ? "PII check: clean" : `PII check: FOUND ${hits} hits`);
  if (extractOnly) {
    console.log(lines.join("\n"));
    return;
  }
  if (!raw.isReport) {
    console.log([...lines, "not a report: interpretation skipped"].join("\n"));
    return;
  }

  const now = new Date();
  const { extraction, signals: normSignals } = normalizeExtraction(raw);
  const floors = computeFloors(extraction);
  const signals = [...normSignals, ...computeSignals(extraction, { now })];
  const knowledge = matchKnowledge(
    loadKb(),
    { vehicle: extraction.vehicle, firm: extraction.report.firm, inferred: extraction.vehicleInferred },
    now,
  );
  const { interpretation, usd: usd2 } = await interpretReport(claude, {
    extraction,
    knowledge,
    floors,
  });
  const result = buildResult({ extraction, interpretation, knowledge, floors, signals });

  const titles = (g: string) => result.items.filter((i) => i.group === g).map((i) => i.title);
  const resultHits = piiHits(JSON.stringify(result));
  console.log(
    [
      "SUMMARY",
      `kb vehicle: ${knowledge.vehicleId ?? "none"}`,
      `vehicle inferred: ${Object.keys(extraction.vehicleInferred ?? {}).join(",") || "none"}`,
      `counts: ${Object.entries(result.counts).map(([g, n]) => `${g}=${n}`).join(" ")}`,
      `dikkat: ${titles("dikkat").join(" | ")}`,
      `kronik: ${titles("kronik").join(" | ")}`,
      `signals: ${result.signals.map((s) => s.code).join(", ")}`,
      `checkList: ${result.checkList.map((c) => c.title).join(" | ")}`,
      `total cost USD: ${(usd + usd2).toFixed(4)}`,
      hits + resultHits === 0 ? "PII check: clean" : `PII check: FOUND ${hits + resultHits} hits`,
    ].join("\n"),
  );
}

main().catch((e) => {
  // Yalnız hata adı ve kodu: ileti/neden model yanıtından veya rapordan metin taşıyabilir.
  const code = e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code) : "-";
  console.error(`smoke failed: ${e instanceof Error ? e.name : "error"} ${code}`);
  process.exit(1);
});
