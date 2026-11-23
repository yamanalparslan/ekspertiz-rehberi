// Opus 5.5 fiyatları (USD / milyon token).
const INPUT_PER_MTOK = 4;
const OUTPUT_PER_MTOK = 20;
const CACHE_READ_PER_MTOK = 0.2;
// Önbellek yazımı: temel girdi fiyatının 1,25 katı (5 dk önbellek).
const CACHE_WRITE_PER_MTOK = 5;

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function usageToUsd(u: Usage): number {
  return (
    (u.input_tokens * INPUT_PER_MTOK +
      u.output_tokens * OUTPUT_PER_MTOK +
      (u.cache_read_input_tokens ?? 0) * CACHE_READ_PER_MTOK +
      (u.cache_creation_input_tokens ?? 0) * CACHE_WRITE_PER_MTOK) /
    1_000_000
  );
}
