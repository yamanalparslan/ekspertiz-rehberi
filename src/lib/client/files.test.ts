import { expect, test } from "vitest";
import { MAX_IMAGES as SERVER_MAX_IMAGES, MAX_TOTAL_BYTES as SERVER_MAX_BYTES } from "@/lib/pipeline/upload";
import { MAX_IMAGES, MAX_TOTAL_BYTES } from "./files";

test("istemci sınırları sunucu sınırlarıyla aynıdır", () => {
  expect(MAX_IMAGES).toBe(SERVER_MAX_IMAGES);
  expect(MAX_TOTAL_BYTES).toBe(SERVER_MAX_BYTES);
});
