import { expect, test } from "vitest";
import { checkMagic, MAX_REQUEST_BYTES, MAX_TOTAL_BYTES, validateUpload } from "./upload";

const img = (n = 1000, type = "image/jpeg") => ({ size: n, type });
const pdf = { size: 10, type: "application/pdf" };
const bad = (f: { size: number; type: string }[], httpStatus = 400) =>
  expect(() => validateUpload(f)).toThrowError(expect.objectContaining({ code: "upload_invalid", httpStatus }));

test("yükleme: 26 görsel, PDF+görsel, 21 MB ve image/gif reddedilir; 25 jpeg kabul", () => {
  bad(Array.from({ length: 26 }, () => img()));
  bad([pdf, img()]);
  bad([pdf, pdf]);
  bad([img(21 * 1024 * 1024)], 413);
  bad([img(1000, "image/gif")]);
  bad([]);
  expect(() => validateUpload(Array.from({ length: 25 }, () => img()))).not.toThrow();
  expect(() => validateUpload([{ size: 20 * 1024 * 1024, type: "application/pdf" }])).not.toThrow();
});

test("boş (0 bayt) dosya reddedilir", () => {
  bad([img(0)]);
  bad([img(), img(0)]);
  bad([{ size: 0, type: "application/pdf" }]);
});

test("istek gövdesi sınırı: 20 MB + çok parçalı form payı", () => {
  expect(MAX_REQUEST_BYTES).toBeGreaterThan(MAX_TOTAL_BYTES);
  expect(MAX_REQUEST_BYTES - MAX_TOTAL_BYTES).toBeLessThanOrEqual(1024 * 1024);
});

// İçerik imzası (magic bytes): bildirilen tür dosyanın baştaki baytlarıyla uyuşmalı.
const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const WEBP = bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 ");
const PDF = bytes("%PDF-1.7\n");

test("imza: JPEG, PNG, WEBP ve PDF doğru türle kabul", () => {
  expect(() =>
    checkMagic([
      { bytes: JPEG, mediaType: "image/jpeg" },
      { bytes: PNG, mediaType: "image/png" },
      { bytes: WEBP, mediaType: "image/webp" },
    ]),
  ).not.toThrow();
  expect(() => checkMagic([{ bytes: PDF, mediaType: "application/pdf" }])).not.toThrow();
  // PDF başlığı ilk 1024 bayt içinde olabilir (okuyucular gibi).
  expect(() => checkMagic([{ bytes: bytes(0xef, 0xbb, 0xbf, "\n%PDF-1.4"), mediaType: "application/pdf" }])).not.toThrow();
});

test("imza: tür uyuşmazlığı ya da tanınmayan içerik upload_invalid (400)", () => {
  const mismatch = (b: Uint8Array, mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf") =>
    expect(() => checkMagic([{ bytes: b, mediaType }])).toThrowError(
      expect.objectContaining({ code: "upload_invalid", httpStatus: 400 }),
    );
  mismatch(PNG, "image/jpeg");
  mismatch(JPEG, "application/pdf");
  mismatch(PDF, "image/png");
  mismatch(bytes("RIFF", 0, 0, 0, 0, "WAVEfmt "), "image/webp");
  mismatch(bytes("GIF89a"), "image/jpeg");
  mismatch(bytes("<html>"), "application/pdf");
  mismatch(new Uint8Array(0), "image/jpeg");
  // Bir dosya bile uyuşmazsa tüm yükleme reddedilir.
  expect(() =>
    checkMagic([
      { bytes: JPEG, mediaType: "image/jpeg" },
      { bytes: PDF, mediaType: "image/jpeg" },
    ]),
  ).toThrowError(expect.objectContaining({ code: "upload_invalid" }));
});
