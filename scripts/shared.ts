// smoke-analyze.ts ve eval.ts için ortak yardımcılar (yalnızca yerel betikler).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { UploadFile } from "../src/lib/claude/extract";
import type { KbData } from "../src/lib/kb/match";
import { FirmsFileSchema, GenericPricesFileSchema, VehicleKbFileSchema } from "../src/lib/schema/kb";

export const MEDIA: Record<string, UploadFile["mediaType"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

/** `.dev.vars` satırı (`#` ile başlayan satırlar yok sayılır). */
function devVar(name: string): string | undefined {
  if (!existsSync(".dev.vars")) return undefined;
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const m = new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`).exec(line);
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

/** Ortam değişkeni, yoksa `.dev.vars` satırı. */
export function loadVar(name: string): string | undefined {
  return process.env[name] || devVar(name);
}

export function loadApiKey(): string | undefined {
  return (
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY ||
    devVar("ANTHROPIC_API_KEY") ||
    devVar("GEMINI_API_KEY")
  );
}

/** Gemini yolu ayarları (sunucudaki buildDeps ile aynı değişkenler). */
export function geminiOptions(): { geminiModel?: string; geminiFallbackModel?: string; geminiMaxOutputTokens?: number } {
  const max = Number(loadVar("GEMINI_MAX_OUTPUT_TOKENS"));
  return {
    geminiModel: loadVar("GEMINI_MODEL"),
    geminiFallbackModel: loadVar("GEMINI_FALLBACK_MODEL"),
    geminiMaxOutputTokens: Number.isFinite(max) && max > 0 ? max : undefined,
  };
}

// Plaka (ör. 34 ABC 123) veya 10 haneli telefon benzeri desen.
const PII_PATTERNS = [/\b\d{2}\s?[A-ZÇĞİÖŞÜ]{1,3}\s?\d{2,4}\b/, /\b0?5\d{9}\b/, /\b\d{10}\b/];

export function piiHits(text: string): number {
  let n = 0;
  for (const re of PII_PATTERNS) n += text.match(new RegExp(re.source, "g"))?.length ?? 0;
  return n;
}

/** Klasördeki desteklenen dosyaları ada göre sıralı okur. */
export function readUploadFiles(dir: string): UploadFile[] {
  return readdirSync(dir)
    .filter((n) => extname(n).toLowerCase() in MEDIA)
    .sort()
    .map((n) => ({
      bytes: new Uint8Array(readFileSync(join(dir, n))),
      mediaType: MEDIA[extname(n).toLowerCase()],
    }));
}

export function loadKb(): KbData {
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
