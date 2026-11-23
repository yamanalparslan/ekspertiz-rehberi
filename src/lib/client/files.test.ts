import { expect, test } from "vitest";
import { MAX_IMAGES as SERVER_MAX_IMAGES, MAX_TOTAL_BYTES as SERVER_MAX_BYTES } from "@/lib/pipeline/upload";
import { MAX_IMAGES, MAX_TOTAL_BYTES, checkSelection } from "./files";

const img = (size = 4_000_000) => ({ type: "image/jpeg", size });
const pdf = (size = 2_000_000) => ({ type: "application/pdf", size });

test("istemci sınırları sunucu sınırlarıyla aynıdır", () => {
  expect(MAX_IMAGES).toBe(SERVER_MAX_IMAGES);
  expect(MAX_TOTAL_BYTES).toBe(SERVER_MAX_BYTES);
});

test("checkSelection boş seçimi ayırt eder", () => {
  expect(checkSelection([])).toBe("empty");
});

test("checkSelection 25 fotoğrafa kadar kabul eder; ham boyut küçültmeden önce sayılmaz", () => {
  expect(checkSelection(Array.from({ length: 25 }, () => img(8_000_000)))).toBe("ok");
  expect(checkSelection(Array.from({ length: 26 }, () => img()))).toBe("invalid");
  expect(checkSelection([{ type: "image/heic", size: 3_000_000 }])).toBe("ok");
});

test("checkSelection tek PDF kabul eder, PDF ile fotoğraf karışımını reddeder", () => {
  expect(checkSelection([pdf()])).toBe("ok");
  expect(checkSelection([pdf(), pdf()])).toBe("invalid");
  expect(checkSelection([pdf(), img()])).toBe("invalid");
  expect(checkSelection([pdf(21 * 1024 * 1024)])).toBe("invalid");
});

test("checkSelection desteklenmeyen türü reddeder", () => {
  expect(checkSelection([{ type: "text/plain", size: 10 }])).toBe("invalid");
  expect(checkSelection([{ type: "", size: 10 }])).toBe("invalid");
});
