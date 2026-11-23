// Değerlendirme: etiketli vakalarda hattı çalıştırır, tablo basar.
// Kullanım: npm run eval -- --cases ~/ekspertiz-eval
// Çıkış: 0 tamam, 1 en az bir "dikkat altında gösterildi" (veya vaka hatası), 2 anahtar/girdi eksik.
// Ham çıkarım JSON'u basılmaz; model çıktısından türeyen metinler PII taramasından geçer.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createClaude } from "../src/lib/claude/client";
import { matchKnowledge } from "../src/lib/kb/match";
import { scoreCase, type CaseScore, type Label } from "../src/lib/eval/score";
import { runAnalysis, type PipelineDeps } from "../src/lib/pipeline/run";
import type { SpendStore } from "../src/lib/pipeline/spend";
import { verifyExtraction } from "../src/lib/pipeline/token";
import type { Extraction } from "../src/lib/schema/extraction";
import type { AnalysisEvent } from "../src/lib/schema/events";
import type { AnalysisResult } from "../src/lib/schema/result";
import { loadApiKey, loadKb, piiHits, readUploadFiles } from "./shared";

const CAP_USD = 50;

function parseArgs(): string | undefined {
  const a = process.argv.slice(2);
  const i = a.indexOf("--cases");
  const v = i >= 0 ? a[i + 1] : undefined;
  if (!v) return undefined;
  return v === "~" || v.startsWith("~/") ? join(homedir(), v.slice(1)) : v;
}

type Row = { name: string; score: CaseScore | null; usd: number; error?: string; pii: number };

async function runCase(
  name: string,
  dir: string,
  label: Label,
  claude: ReturnType<typeof createClaude>,
  kb: ReturnType<typeof loadKb>,
): Promise<Row> {
  const files = readUploadFiles(dir);
  if (files.length === 0) return { name, score: null, usd: 0, error: "klasörde dosya yok", pii: 0 };

  let total = 0;
  const spend: SpendStore = {
    get: async () => total,
    add: async (_day, usd) => {
      total += usd;
    },
  };
  const secret = randomBytes(32).toString("hex");
  const deps: PipelineDeps = {
    claude,
    loadKnowledge: async (q) => matchKnowledge(kb, q, new Date()),
    savePrices: async () => {},
    spend,
    secret,
    now: () => new Date(),
    capUsd: CAP_USD,
  };

  let token: string | null = null;
  let result: AnalysisResult | null = null;
  let errorCode: string | null = null;
  await runAnalysis(deps, files, (e: AnalysisEvent) => {
    if (e.type === "vehicle") token = e.token;
    else if (e.type === "result") result = e.result;
    else if (e.type === "error") errorCode = e.code;
  });

  if (!result || !token) {
    return { name, score: null, usd: total, error: `hat hatası: ${errorCode ?? "sonuç yok"}`, pii: 0 };
  }
  const { extraction } = await verifyExtraction(token, secret, new Date());
  const items: Extraction["items"] = extraction.items;
  const pii = piiHits(JSON.stringify(result)) + piiHits(JSON.stringify(extraction));
  return { name, score: scoreCase(result, items, label, extraction.measurements), usd: total, pii };
}

async function main() {
  const casesDir = parseArgs();
  if (!casesDir || !existsSync(casesDir)) {
    console.error("Kullanım: npm run eval -- --cases ~/ekspertiz-eval (klasör bulunamadı)");
    process.exit(2);
  }
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY bulunamadı. Değerlendirmeyi çalıştırmak için anahtarı .dev.vars dosyasına ANTHROPIC_API_KEY=... olarak ekleyin (veya ortam değişkeni verin).",
    );
    process.exit(2);
  }

  const caseNames = readdirSync(casesDir)
    .filter((n) => statSync(join(casesDir, n)).isDirectory())
    .sort();
  if (caseNames.length === 0) {
    console.error("Vaka klasörü bulunamadı.");
    process.exit(2);
  }

  const claude = createClaude(apiKey);
  const kb = loadKb();
  const rows: Row[] = [];
  for (const name of caseNames) {
    const labelPath = join("eval", "labels", `${name}.json`);
    if (!existsSync(labelPath)) {
      rows.push({ name, score: null, usd: 0, error: "etiket dosyası yok", pii: 0 });
      continue;
    }
    const label = JSON.parse(readFileSync(labelPath, "utf8")) as Label;
    try {
      rows.push(await runCase(name, join(casesDir, name), label, claude, kb));
    } catch (e) {
      rows.push({ name, score: null, usd: 0, error: e instanceof Error ? e.name : "hata", pii: 0 });
    }
  }

  console.log("vaka | araç alanları | grup doğruluğu | dikkat altında | USD");
  for (const r of rows) {
    if (!r.score) {
      console.log(`${r.name} | - | - | - | ${r.usd.toFixed(4)} | ${r.error}`);
      continue;
    }
    const s = r.score;
    console.log(
      `${r.name} | ${s.vehicleFieldsCorrect}/${s.vehicleFieldsTotal} | %${Math.round(s.groupAccuracy * 100)} | ${s.dikkatShownBelow.length} | ${r.usd.toFixed(4)}`,
    );
  }
  for (const r of rows) {
    if (r.score && r.score.dikkatShownBelow.length > 0) {
      console.log(`\n${r.name}: dikkat altında gösterilenler`);
      for (const d of r.score.dikkatShownBelow) console.log(`  - ${d}`);
    }
  }
  const pii = rows.reduce((n, r) => n + r.pii, 0);
  console.log(`\nToplam harcama: ${rows.reduce((n, r) => n + r.usd, 0).toFixed(4)} USD`);
  console.log(pii === 0 ? "PII check: clean" : `PII check: FOUND ${pii} hits`);

  const bad = rows.some((r) => !r.score || r.score.dikkatShownBelow.length > 0);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(`eval failed: ${e instanceof Error ? e.name : "error"}`);
  process.exit(1);
});
