// Opus 5.5 fiyatları (USD / milyon token).
const INPUT_PER_MTOK = 4;
const OUTPUT_PER_MTOK = 20;
const CACHE_READ_PER_MTOK = 0.2;
// Önbellek yazımı: temel girdi fiyatının 1,25 katı (5 dk önbellek).
const CACHE_WRITE_PER_MTOK = 5;
// Claude web_search sunucu aracı: 1000 arama başına 10 $ (token ücretine ek).
const CLAUDE_WEB_SEARCH_USD = 10 / 1000;

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  /** Claude sunucu araçları: web_search istek sayısı ayrıca faturalanır. */
  server_tool_use?: { web_search_requests?: number | null } | null;
  /**
   * Gemini uyarlayıcısı doldurur: fiyat tablosu için model adı ve Google Search sorgu sayısı.
   * Bu durumda input_tokens = prompt + araç istemi, output_tokens = yanıt + düşünme tokenları.
   */
  gemini?: { model: string; searchQueries?: number };
};

export function usageToUsd(u: Usage): number {
  if (u.gemini) return geminiUsd(u.gemini.model, u.input_tokens, u.output_tokens, u.gemini.searchQueries ?? 0);
  return (
    (u.input_tokens * INPUT_PER_MTOK +
      u.output_tokens * OUTPUT_PER_MTOK +
      (u.cache_read_input_tokens ?? 0) * CACHE_READ_PER_MTOK +
      (u.cache_creation_input_tokens ?? 0) * CACHE_WRITE_PER_MTOK) /
      1_000_000 +
    (u.server_tool_use?.web_search_requests ?? 0) * CLAUDE_WEB_SEARCH_USD
  );
}

/**
 * Gemini fiyatları (USD / milyon token, Standard ücretli katman), Gemini API fiyat
 * sayfasından 2026-11-24'te alındı. Çıktı fiyatı düşünme tokenlarını kapsar. Tarihli
 * zamlarda (ör. Flash için 1 Ocak 2027) YÜKSEK olan değer, bağlam kademelerinde üst kademe
 * kullanılır: harcama tavanı için üst sınır. Önbellek indirimi yok sayılır.
 * Tabloda olmayan model Opus 5.5 fiyatıyla (4 $ / 20 $) hesaplanır; bu, listelenen bütün
 * Gemini modellerinin üzerinde olduğu için bir üst sınırdır.
 */
const GEMINI_PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /flash-lite/, input: 0.3, output: 2.5 },
  { match: /^gemini-3(\.\d+)?-flash/, input: 1.5, output: 7.5 },
  { match: /^gemini-3(\.\d+)?-pro/, input: 4, output: 18 },
  { match: /^gemini-4-hydrogen/, input: 1.5, output: 7.5 },
  { match: /^gemini-4-neon/, input: 3, output: 15 },
  { match: /^gemini-4-(carbon|argon)/, input: 4, output: 20 },
];
/** Google Search ile temellendirme: 1000 sorgu başına 14 $ (aylık ücretsiz kota yok sayılır). */
const GEMINI_SEARCH_USD_PER_QUERY = 14 / 1000;

export function geminiRates(model: string): { input: number; output: number; upperBound: boolean } {
  const m = model.trim().toLowerCase().replace(/^models\//, "");
  const row = GEMINI_PRICES.find((p) => p.match.test(m));
  return row
    ? { input: row.input, output: row.output, upperBound: false }
    : { input: INPUT_PER_MTOK, output: OUTPUT_PER_MTOK, upperBound: true };
}

export function geminiUsd(model: string, inputTokens: number, outputTokens: number, searchQueries = 0): number {
  const r = geminiRates(model);
  return (inputTokens * r.input + outputTokens * r.output) / 1_000_000 + searchQueries * GEMINI_SEARCH_USD_PER_QUERY;
}

/**
 * Sağlayıcı çağrısı yanıt alınamadan bitti. `usd`: o ana kadarki tahmini harcama (ör.
 * istek gönderildikten sonra zaman aşımı: girdi tokenı tahmini x girdi fiyatı), yoksa 0.
 * `reason` yalnız kısa bir koddur (günlük sözleşmesi: yanıt gövdesi taşınmaz).
 */
export class ProviderCallError extends Error {
  readonly reason: string;
  readonly usd: number;
  constructor(reason: string, usd: number) {
    super(reason);
    this.name = "ProviderCallError";
    this.reason = reason;
    this.usd = usd;
  }
}
