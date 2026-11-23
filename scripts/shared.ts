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

export function loadApiKey(): string | undefined {
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
