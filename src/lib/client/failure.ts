import type { ClientErrorCode } from "@/lib/copy";

/** 413 ya da gövdesinde bizim hata olayımızı taşımayan 2xx dışı yanıt (ör. ağ geçidinin 502/524 sayfası). */
export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

/**
 * Olay taşımayan başarısızlığın kodu. Bağlantı yoksa `offline`; fetch ya da akış okuması ağ
 * hatasıyla düştüyse (tarayıcılar bunu TypeError olarak verir) `network`; gövdesiz HTTP
 * durumlarında 413/429/5xx ayrı metin alır. Bozuk/şemaya uymayan akış `internal` kalır.
 */
export function failureCode(error: unknown, online: boolean): ClientErrorCode | "internal" {
  if (error instanceof HttpStatusError) {
    if (error.status === 413) return "upload_too_large";
    if (error.status === 429) return "rate_limited";
    if (error.status >= 500) return "server_unavailable";
    return "internal";
  }
  if (!online) return "offline";
  if (error instanceof TypeError) return "network";
  return "internal";
}

/** Uzun süre hiç olay gelmezse akış kesilir (sunucuda tek adım bu kadar sürmez). */
export const STALL_MS = 180_000;
