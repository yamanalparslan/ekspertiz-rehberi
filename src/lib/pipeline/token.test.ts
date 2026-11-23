import { expect, test } from "vitest";
import fixture from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { normalizeExtraction } from "@/lib/normalize";
import type { RawExtraction } from "@/lib/schema/extraction";
import { signExtraction, verifyExtraction } from "./token";
import { istanbulDay } from "./spend";

const { extraction } = normalizeExtraction(fixture as RawExtraction);
const now = new Date("2026-11-23T10:00:00Z");
const carried = [{ code: "qr_var" as const, level: "info" as const, message: "m", details: [] }];
const secret = "s3cret";

const reject = async (p: Promise<unknown>) =>
  expect(p).rejects.toMatchObject({ name: "AnalysisError", code: "token_invalid", usd: 0 });

test("jeton: gidip gelir, değiştirilmiş jeton ve 61 dakikalık jeton reddedilir", async () => {
  const t = await signExtraction(
    { extraction, reinterpretsLeft: 1, carriedSignals: carried },
    secret,
    now,
  );
  const back = await verifyExtraction(t, secret, new Date(now.getTime() + 59 * 60_000));
  expect(back).toEqual({ extraction, reinterpretsLeft: 1, carriedSignals: carried });

  await reject(verifyExtraction(t, secret, new Date(now.getTime() + 61 * 60_000)));
  await reject(verifyExtraction(t, "other", now));
  const [body, mac] = t.split(".");
  await reject(verifyExtraction(`${body}x.${mac}`, secret, now));
  await reject(verifyExtraction(`${body}.${mac}x`, secret, now));
  await reject(verifyExtraction("garbage", secret, now));
  await reject(verifyExtraction("", secret, now));
});

test("jeton: imzalı ama şemaya uymayan yük reddedilir", async () => {
  const t = await signExtraction(
    { extraction: { ...extraction, items: "x" } as never, reinterpretsLeft: 1, carriedSignals: [] },
    secret,
    now,
  );
  await reject(verifyExtraction(t, secret, now));
});

test("istanbulDay 2026-11-23T22:30Z -> 2026-11-24", () => {
  expect(istanbulDay(new Date("2026-11-23T22:30:00Z"))).toBe("2026-11-24");
  expect(istanbulDay(new Date("2026-11-23T20:59:00Z"))).toBe("2026-11-23");
});
