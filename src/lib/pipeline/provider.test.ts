import { expect, test } from "vitest";
import { providerFrom, type DepsContext } from "./http";

const ctx = (over: Partial<DepsContext>): DepsContext => ({ isDev: false, env: {}, devVars: {}, processEnv: {}, ...over });

test("rıza metni için sağlayıcı: Anthropic önce, yoksa Gemini; anahtar biçimine göre", () => {
  expect(providerFrom(ctx({ env: { ANTHROPIC_API_KEY: "sk-ant-x" } }))).toBe("claude");
  expect(providerFrom(ctx({ env: { GEMINI_API_KEY: "AIzaX" } }))).toBe("gemini");
  expect(providerFrom(ctx({ env: { ANTHROPIC_API_KEY: "sk-ant-x", GEMINI_API_KEY: "AIzaX" } }))).toBe("claude");
  // Yanlış yere konmuş Gemini anahtarı Gemini'ye gider; rıza metni de bunu söylemeli.
  expect(providerFrom(ctx({ processEnv: { ANTHROPIC_API_KEY: "AQ.x" } }))).toBe("gemini");
});

test("anahtar yoksa null; demo yalnız geliştirmede; .dev.vars yalnız geliştirmede okunur", () => {
  expect(providerFrom(ctx({}))).toBeNull();
  expect(providerFrom(ctx({ isDev: true, devVars: { OFFLINE_DEMO: "1" } }))).toBe("demo");
  expect(providerFrom(ctx({ isDev: false, processEnv: { OFFLINE_DEMO: "1" } }))).toBeNull();
  expect(providerFrom(ctx({ isDev: true, devVars: { GEMINI_API_KEY: "AIzaX" } }))).toBe("gemini");
  expect(providerFrom(ctx({ isDev: false, devVars: { GEMINI_API_KEY: "AIzaX" } }))).toBeNull();
});
