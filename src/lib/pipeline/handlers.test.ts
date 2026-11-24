import { afterEach, beforeEach, expect, test, vi } from "vitest";
import fixture from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { textMsg } from "@/lib/claude/testing";
import { ERROR_MESSAGES } from "@/lib/copy";
import type { Knowledge } from "@/lib/kb/match";
import { normalizeExtraction } from "@/lib/normalize";
import { AnalysisEventSchema, type ErrorCode } from "@/lib/schema/events";
import type { Vehicle } from "@/lib/schema/result";
import { handleAnalyze, handleReinterpret } from "./handlers";
import type { RunMeta } from "./http";
import type { PipelineDeps } from "./run";
import { signExtraction } from "./token";

// Cloudflare bağlamı yok: bağımlılıklar doğrudan verilir.
vi.mock("./env", () => ({
  getServerEnv: () => {
    throw new Error("no cloudflare context");
  },
}));

const NOW = new Date("2026-11-24T10:00:00Z");
const SECRET = "s".repeat(32);
const knowledge: Knowledge = { vehicleId: null, chronicIssues: [], priceItems: [], firmVerifyUrl: null };
const interp = () => textMsg(JSON.stringify({ summary: "özet", items: [], checkList: [] }));

function fakeDeps(o: { spent?: number; msgs?: unknown[] } = {}) {
  const msgs = o.msgs ?? [textMsg(JSON.stringify(fixture)), interp()];
  let i = 0;
  const calls: unknown[] = [];
  const deps: PipelineDeps = {
    claude: {
      beta: {
        messages: {
          stream: (p: unknown) => {
            calls.push(p);
            const m = msgs[i++];
            return { finalMessage: async () => m };
          },
        },
      },
    } as never,
    loadKnowledge: async () => knowledge,
    savePrices: async () => {},
    spend: { get: async () => o.spent ?? 0, add: async () => {} },
    secret: SECRET,
    now: () => NOW,
    capUsd: 10,
  };
  const factory = vi.fn(async (meta: RunMeta) => {
    meta.provider = "claude";
    return deps;
  });
  return { deps, factory, calls };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, "JFIF");
const PDF = bytes("%PDF-1.7\n1 0 obj\n");

function analyzeReq(files: { data: Uint8Array<ArrayBuffer>; type: string; name?: string }[], headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const f of files) form.append("files", new Blob([f.data], { type: f.type }), f.name ?? "x");
  return new Request("http://localhost/api/analyze", { method: "POST", body: form, headers });
}

async function expectError(res: Response, status: number, code: ErrorCode) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const body = AnalysisEventSchema.parse(JSON.parse(await res.text()));
  expect(body).toEqual({ type: "error", code, message: ERROR_MESSAGES[code] });
}

async function events(res: Response) {
  return (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => AnalysisEventSchema.parse(JSON.parse(l)));
}

// --- /api/analyze ---

test("analyze: geçerli yükleme 200 NDJSON akışı, no-store", async () => {
  const { factory } = fakeDeps();
  const res = await handleAnalyze(analyzeReq([{ data: JPEG, type: "image/jpeg" }]), factory);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/x-ndjson");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect((await events(res)).at(-1)?.type).toBe("result");
});

test("analyze: Content-Length 20 MB + form payını aşarsa gövde okunmadan 413", async () => {
  const { factory } = fakeDeps();
  const req = analyzeReq([{ data: JPEG, type: "image/jpeg" }], { "content-length": String(30 * 1024 * 1024) });
  const formData = vi.spyOn(req, "formData");
  await expectError(await handleAnalyze(req, factory), 413, "upload_invalid");
  expect(formData).not.toHaveBeenCalled();
  expect(factory).not.toHaveBeenCalled();
});

test("analyze: form ayrıştırılamaz ya da dosya yoksa 400 upload_invalid", async () => {
  const { factory } = fakeDeps();
  const notForm = new Request("http://localhost/api/analyze", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  await expectError(await handleAnalyze(notForm, factory), 400, "upload_invalid");
  await expectError(await handleAnalyze(analyzeReq([]), factory), 400, "upload_invalid");
});

test("analyze: dosyaların toplamı 20 MB'ı aşarsa 413", async () => {
  const { factory } = fakeDeps();
  const big = new Uint8Array(21 * 1024 * 1024);
  big.set(JPEG);
  await expectError(await handleAnalyze(analyzeReq([{ data: big, type: "image/jpeg" }]), factory), 413, "upload_invalid");
});

test("analyze: boş dosya ve imzası türüyle uyuşmayan dosya 400 upload_invalid; model çağrılmaz", async () => {
  const { factory, calls } = fakeDeps();
  await expectError(await handleAnalyze(analyzeReq([{ data: new Uint8Array(0), type: "image/jpeg" }]), factory), 400, "upload_invalid");
  await expectError(await handleAnalyze(analyzeReq([{ data: PDF, type: "image/jpeg" }]), factory), 400, "upload_invalid");
  await expectError(await handleAnalyze(analyzeReq([{ data: JPEG, type: "application/pdf" }]), factory), 400, "upload_invalid");
  expect(calls).toHaveLength(0);
});

test("analyze: yapılandırma eksikse 500 internal; tavan doluysa 429 cap_reached (akış açılmadan)", async () => {
  const missing = vi.fn(async () => null);
  await expectError(await handleAnalyze(analyzeReq([{ data: JPEG, type: "image/jpeg" }]), missing), 500, "internal");
  const { factory, calls } = fakeDeps({ spent: 10 });
  await expectError(await handleAnalyze(analyzeReq([{ data: JPEG, type: "image/jpeg" }]), factory), 429, "cap_reached");
  expect(calls).toHaveLength(0);
});

test("analyze: akış başladıktan sonraki hata NDJSON olayı olarak kalır (200)", async () => {
  const { factory } = fakeDeps({ msgs: [textMsg("", "refusal")] });
  const res = await handleAnalyze(analyzeReq([{ data: JPEG, type: "image/jpeg" }]), factory);
  expect(res.status).toBe(200);
  expect((await events(res)).at(-1)).toEqual({ type: "error", code: "refusal", message: ERROR_MESSAGES.refusal });
});

test("analyze: tek günlük satırı sağlayıcıyı ve durumu içerir", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const { factory } = fakeDeps({ spent: 10 });
  await handleAnalyze(analyzeReq([{ data: JPEG, type: "image/jpeg" }]), factory);
  const lines = log.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('"ms"'));
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ event: "analyze", files: 1, code: "cap_reached", status: 429, provider: "claude" });
});

// --- /api/reinterpret ---

const { extraction } = normalizeExtraction(fixture as never);
const vehicle: Vehicle = extraction.vehicle;
const token = (left: 0 | 1 = 1) => signExtraction({ extraction, reinterpretsLeft: left, carriedSignals: [] }, SECRET, NOW);
const reReq = (body: unknown) =>
  new Request("http://localhost/api/reinterpret", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("reinterpret: geçerli istek 200 akış", async () => {
  const { factory } = fakeDeps({ msgs: [interp()] });
  const res = await handleReinterpret(reReq({ token: await token(), vehicle: { ...vehicle, year: 2020 } }), factory);
  expect(res.status).toBe(200);
  expect((await events(res)).at(-1)).toMatchObject({ type: "result", result: { vehicle: { year: 2020 } } });
});

test("reinterpret: bozuk gövde 400 request_invalid (internal değil)", async () => {
  const { factory } = fakeDeps();
  await expectError(await handleReinterpret(reReq("{bozuk"), factory), 400, "request_invalid");
  await expectError(await handleReinterpret(reReq({ token: "x" }), factory), 400, "request_invalid");
  await expectError(await handleReinterpret(reReq({ token: "x", vehicle: { ...vehicle, extra: 1 } }), factory), 400, "request_invalid");
  expect(factory).not.toHaveBeenCalled();
});

test("reinterpret: sınır dışı araç bilgisi 400 vehicle_invalid", async () => {
  const { factory } = fakeDeps();
  const t = await token();
  await expectError(await handleReinterpret(reReq({ token: t, vehicle: { ...vehicle, year: 1800 } }), factory), 400, "vehicle_invalid");
  await expectError(await handleReinterpret(reReq({ token: t, vehicle: { ...vehicle, engineCc: 16 } }), factory), 400, "vehicle_invalid");
  await expectError(await handleReinterpret(reReq({ token: t, vehicle: { ...vehicle, model: "x".repeat(61) } }), factory), 400, "vehicle_invalid");
});

test("reinterpret: belirteç yok/geçersiz 401, hakkı kullanılmış 403, tavan dolu 429", async () => {
  const { factory } = fakeDeps();
  await expectError(await handleReinterpret(reReq({ vehicle }), factory), 401, "token_invalid");
  await expectError(await handleReinterpret(reReq({ token: "x.y", vehicle }), factory), 401, "token_invalid");
  await expectError(await handleReinterpret(reReq({ token: await token(0), vehicle }), factory), 403, "reinterpret_used");
  const full = fakeDeps({ spent: 10 });
  await expectError(await handleReinterpret(reReq({ token: await token(), vehicle }), full.factory), 429, "cap_reached");
  expect(full.calls).toHaveLength(0);
});

test("reinterpret: kırpılmış araç bilgisi modele gider", async () => {
  const { factory, calls } = fakeDeps({ msgs: [interp()] });
  const res = await handleReinterpret(reReq({ token: await token(), vehicle: { ...vehicle, model: "  320i  " } }), factory);
  await res.text();
  const sent = JSON.parse((calls[0] as { messages: { content: { text: string }[] }[] }).messages[0].content[0].text);
  expect(sent.vehicle.model).toBe("320i");
});
