import { afterEach, expect, test, vi } from "vitest";

// Cloudflare bağlamı testte yok; buildDepsFrom ortamı doğrudan alır.
vi.mock("./env", () => ({
  getServerEnv: () => {
    throw new Error("no cloudflare context");
  },
}));

import { createClaude } from "@/lib/claude/client";
import { buildDepsFrom } from "./http";

const usd = () => ({ total: 0 });
const KEY = { ANTHROPIC_API_KEY: "sk-ant-test", EXTRACTION_HMAC_SECRET: "x".repeat(32) };

// Minimal D1 sahtesi: daily_spend ve KB sorguları.
function fakeDb() {
  const spend = new Map<string, number>();
  const calls: string[] = [];
  const db = {
    prepare(sql: string) {
      calls.push(sql);
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              return (spend.has(String(values[0])) ? { usd: spend.get(String(values[0])) } : null) as T;
            },
            async run() {
              if (sql.startsWith("INSERT INTO daily_spend")) {
                const day = String(values[0]);
                spend.set(day, (spend.get(day) ?? 0) + Number(values[1]));
              }
              return {};
            },
            async all<T>() {
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  };
  return { db, spend, calls };
}

afterEach(() => vi.restoreAllMocks());

const picanto = {
  brand: "Kia",
  model: "Picanto",
  variant: null,
  year: 2021,
  engineCc: null,
  powerHp: null,
  fuel: null,
  transmission: null,
  km: null,
};

test("üretim: DB bağlantısı yoksa config_missing DB günlüğü ve null (internal yolu)", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const deps = await buildDepsFrom(usd(), { isDev: false, env: { ...KEY }, devVars: {}, processEnv: {} });
  expect(deps).toBeNull();
  expect(log.mock.calls.map((c) => c[0])).toContain(JSON.stringify({ event: "config_missing", name: "DB" }));
});

test("üretim: DB varsa harcama D1'e yazılır ve okunur, bellek yedeği kullanılmaz", async () => {
  const { db, spend } = fakeDb();
  const u = usd();
  const deps = await buildDepsFrom(u, {
    isDev: false,
    env: { ...KEY, DB: db as never },
    devVars: {},
    processEnv: {},
  });
  expect(deps).not.toBeNull();
  await deps!.spend.add("2026-11-24", 0.5);
  expect(spend.get("2026-11-24")).toBeCloseTo(0.5, 6);
  expect(u.total).toBeCloseTo(0.5, 6);
  expect(await deps!.spend.get("2026-11-24")).toBeCloseTo(0.5, 6);
  // Başka bir istekte (yeni deps) D1 dışı bir kaynak olmadığı için aynı değer okunur.
  spend.set("2026-11-24", 3);
  expect(await deps!.spend.get("2026-11-24")).toBe(3);
});

test("üretim: D1 harcama okuması hata verirse hata yayılır (bellek yedeğine düşmez)", async () => {
  const db = {
    prepare: () => ({
      bind: () => ({
        first: async () => {
          throw new Error("d1 down");
        },
        run: async () => {
          throw new Error("d1 down");
        },
        all: async () => ({ results: [] }),
      }),
    }),
  };
  const deps = await buildDepsFrom(usd(), { isDev: false, env: { ...KEY, DB: db as never }, devVars: {}, processEnv: {} });
  await expect(deps!.spend.get("2026-11-24")).rejects.toThrow();
  await expect(deps!.spend.add("2026-11-24", 1)).rejects.toThrow();
});

test("geliştirme: DB yoksa bellek harcaması ve yedek bilgi tabanı kullanılır", async () => {
  const deps = await buildDepsFrom(usd(), { isDev: true, env: { ...KEY }, devVars: {}, processEnv: {} });
  expect(deps).not.toBeNull();
  const day = `dev-${Math.random()}`;
  await deps!.spend.add(day, 0.25);
  expect(await deps!.spend.get(day)).toBeCloseTo(0.25, 6);
  const k = await deps!.loadKnowledge({ vehicle: picanto, firm: null });
  expect(k.vehicleId).toBe("kia-picanto-ja");
});

test("anahtar yoksa ve OFFLINE_DEMO=1 değilse null: geliştirmede de sessiz demo yok", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const deps = await buildDepsFrom(usd(), {
    isDev: true,
    env: { EXTRACTION_HMAC_SECRET: "s".repeat(32) },
    devVars: {},
    processEnv: {},
  });
  expect(deps).toBeNull();
  expect(log.mock.calls.map((c) => c[0])).toContain(
    JSON.stringify({ event: "config_missing", name: "ANTHROPIC_API_KEY" }),
  );
});

test("OFFLINE_DEMO=1 yalnız geliştirmede demo istemcisini açar", async () => {
  const dev = await buildDepsFrom(usd(), { isDev: true, env: {}, devVars: { OFFLINE_DEMO: "1" }, processEnv: {} });
  expect(dev).not.toBeNull();
  // Demo istemcisi tanımadığı dosyada isReport:false döner (ağ çağrısı yok).
  const msg = await dev!.claude.beta.messages
    .stream({
      model: "x",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "AAEC" } }],
        },
      ],
    } as never)
    .finalMessage();
  const text = (msg.content[0] as { text: string }).text;
  expect(JSON.parse(text).isReport).toBe(false);

  vi.spyOn(console, "log").mockImplementation(() => {});
  const prod = await buildDepsFrom(usd(), {
    isDev: false,
    env: { EXTRACTION_HMAC_SECRET: "s".repeat(32), DB: fakeDb().db as never },
    devVars: {},
    processEnv: { OFFLINE_DEMO: "1" },
  });
  expect(prod).toBeNull();
});

test("createClaude anahtarsız çağrılırsa hata fırlatır (sessiz demo yok)", () => {
  expect(() => createClaude("")).toThrow();
  expect(() => createClaude("   ")).toThrow();
});
