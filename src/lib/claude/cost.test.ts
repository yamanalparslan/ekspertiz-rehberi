import { expect, test } from "vitest";
import { usageToUsd } from "./cost";

test("maliyet", () =>
  expect(
    usageToUsd({ input_tokens: 30000, output_tokens: 4000, cache_read_input_tokens: 10000 }),
  ).toBeCloseTo(0.12 + 0.08 + 0.002, 6));

test("null önbellek alanları sıfır sayılır", () =>
  expect(
    usageToUsd({ input_tokens: 1000000, output_tokens: 0, cache_read_input_tokens: null, cache_creation_input_tokens: null }),
  ).toBeCloseTo(4, 6));
