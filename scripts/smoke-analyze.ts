// Canlı deneme: klasördeki rapor dosyalarını okutur, yalnızca ÖZET basar.
// Kullanım: npx tsx scripts/smoke-analyze.ts <klasör> [--extract-only]
// Tam mod bilgi tabanını diskten (kb/) yükler; D1'e dokunmaz.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { createClaude } from "../src/lib/claude/client";
import { extractReport, type UploadFile } from "../src/lib/claude/extract";
import { interpretReport } from "../src/lib/claude/interpret";
import { normalizeExtraction } from "../src/lib/normalize";
import { buildResult } from "../src/lib/pipeline/result";
import { computeFloors } from "../src/lib/rules/floors";
import { computeSignals } from "../src/lib/signals/signals";
import { matchKnowledge, type KbData } from "../src/lib/kb/match";
import {
  FirmsFileSchema,
  GenericPricesFileSchema,
  VehicleKbFileSchema,
} from "../src/lib/schema/kb";

const MEDIA: Record<string, UploadFile["mediaType"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function loadApiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (!existsSync(".dev.vars")) return undefined;
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const m = /^\s*ANTHROPIC_API_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

// Plaka (ör. 34 ABC 123) veya 10 haneli telefon benzeri desen.
const PII_PATTERNS = [/\b\d{2}\s?[A-ZÇĞİÖŞÜ]{1,3}\s?\d{2,4}\b/, /\b0?5\d{9}\b/, /\b\d{10}\b/];

function piiHits(text: string): number {
  let n = 0;
  for (const re of PII_PATTERNS) n += text.match(new RegExp(re.source, "g"))?.length ?? 0;
  return n;
}

function loadKb(): KbData {
  const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
  const vehicles = readdirSync("kb/vehicles")
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => VehicleKbFileSchema.parse(readJson(join("kb/vehicles", n))));
  return {
    vehicles,
    generic: GenericPricesFileSchema.parse(readJson("kb/generic-prices.json")).priceItems,
    firms: FirmsFileSchema.parse(readJson("kb/firms.json")).firms,
  };
}

async function main() {
  const [dir, flag] = process.argv.slice(2);
  if (!dir) {
    console.error("Kullanım: tsx scripts/smoke-analyze.ts <klasör> --extract-only");
    process.exit(2);
  }
  const extractOnly = flag === "--extract-only";
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY bulunamadı (ortam değişkeni veya .dev.vars).");
    process.exit(2);
  }

  const names = readdirSync(dir)
    .filter((n) => extname(n).toLowerCase() in MEDIA)
    .sort();
  const files: UploadFile[] = names.map((n) => ({
    bytes: new Uint8Array(readFileSync(join(dir, n))),
    mediaType: MEDIA[extname(n).toLowerCase()],
  }));
  if (files.length === 0) {
    console.error("Klasörde desteklenen dosya yok.");
    process.exit(2);
  }

  const claude = createClaude(apiKey);
  const { raw, usd } = await extractReport(claude, files);
  const dyno = raw.measurements.find((m) => m.test === "dinamometre_guc");
  const lines = [
    "SUMMARY",
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
    { vehicle: extraction.vehicle, firm: extraction.report.firm },
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
  console.error(`smoke failed: ${e instanceof Error ? e.name + " " + (e as { code?: string }).code : "error"}`);
  process.exit(1);
});
