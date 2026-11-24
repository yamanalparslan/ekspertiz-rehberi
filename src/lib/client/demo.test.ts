import { expect, test } from "vitest";
import { DEMO_SUMMARY_PREFIX } from "@/lib/claude/offline-demo";
import { DEMO_PREFIX, splitDemo } from "./demo";

test("istemcideki demo öneki sunucudakiyle aynı", () => {
  expect(DEMO_PREFIX).toBe(DEMO_SUMMARY_PREFIX);
});

test("splitDemo öneki atar ve demo olduğunu söyler; gerçek özete dokunmaz", () => {
  expect(splitDemo(`${DEMO_SUMMARY_PREFIX}2021 model Kia Picanto`)).toEqual({ demo: true, text: "2021 model Kia Picanto" });
  expect(splitDemo("Raporda dört madde dikkat istiyor.")).toEqual({ demo: false, text: "Raporda dört madde dikkat istiyor." });
  expect(splitDemo("")).toEqual({ demo: false, text: "" });
});
