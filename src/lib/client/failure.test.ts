import { expect, test } from "vitest";
import { ERROR_MESSAGES } from "@/lib/copy";
import { failureCode, HttpStatusError } from "./failure";

test("gövdesiz HTTP durumları ayrı metne düşer: 413, 429, 5xx ve ağ geçidi zaman aşımı", () => {
  expect(failureCode(new HttpStatusError(413), true)).toBe("upload_too_large");
  expect(failureCode(new HttpStatusError(429), true)).toBe("rate_limited");
  for (const s of [500, 502, 503, 504, 524]) expect(failureCode(new HttpStatusError(s), true), String(s)).toBe("server_unavailable");
  expect(failureCode(new HttpStatusError(404), true)).toBe("internal");
});

test("ağ hatası (TypeError) bağlantı kopması, çevrimdışıyken çevrimdışı; bozuk akış internal", () => {
  expect(failureCode(new TypeError("Failed to fetch"), true)).toBe("network");
  expect(failureCode(new TypeError("Load failed"), false)).toBe("offline");
  expect(failureCode(new SyntaxError("Unexpected token"), true)).toBe("internal");
  expect(failureCode(new Error("beklenmeyen olay"), true)).toBe("internal");
});

test("istemci hata kodlarının her birinin ayrı Türkçe metni var", () => {
  const codes = ["network", "offline", "upload_too_large", "rate_limited", "server_unavailable", "stalled"] as const;
  const texts = codes.map((c) => ERROR_MESSAGES[c]);
  for (const t of texts) expect(t).toMatch(/\S/);
  expect(new Set([...texts, ERROR_MESSAGES.internal]).size).toBe(codes.length + 1);
});
