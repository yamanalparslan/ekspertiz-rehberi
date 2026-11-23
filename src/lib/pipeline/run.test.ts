import { expect, test, vi } from "vitest";
import fixture from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { textMsg } from "@/lib/claude/testing";
import { normalizeExtraction } from "@/lib/normalize";
import type { AnalysisEvent } from "@/lib/schema/events";
import type { Knowledge } from "@/lib/kb/match";
import type { UploadFile } from "@/lib/claude/extract";
import { ERROR_MESSAGES } from "@/lib/copy";
import { runAnalysis, runReinterpret, type PipelineDeps } from "./run";
import { signExtraction } from "./token";
import type { SpendStore } from "./spend";

const knowledge: Knowledge = { vehicleId: null, chronicIssues: [], priceItems: [], firmVerifyUrl: null };
const file: UploadFile = { bytes: new Uint8Array([1]), mediaType: "image/jpeg" };
const NOW = new Date("2026-11-23T10:00:00Z");

function memSpend(initial = 0): SpendStore & { adds: number[] } {
  const adds: number[] = [];
  return {
    adds,
    get: async () => initial + adds.reduce((a, b) => a + b, 0),
    add: async (_d, usd) => void adds.push(usd),
  };
}

// Sıra: ilk çağrı okuma, ikinci çağrı yorumlama.
function seqClient(msgs: unknown[]) {
  let i = 0;
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (p: Record<string, unknown>) => {
          calls.push(p);
          const m = msgs[i++];
          return { finalMessage: async () => m };
        },
      },
    },
  };
  return { client: client as never, calls };
}

const interp = () =>
  textMsg(JSON.stringify({ summary: "özet", items: [], checkList: [] }), "end_turn", { input_tokens: 2000, output_tokens: 200 });

function mkDeps(over: Partial<PipelineDeps> & { msgs?: unknown[] } = {}) {
  const { msgs, ...rest } = over;
  const spend = memSpend();
  const sc = seqClient(msgs ?? [textMsg(JSON.stringify(fixture)), interp()]);
  const loadKnowledge = vi.fn(async () => knowledge);
  const deps: PipelineDeps = {
    claude: sc.client,
    loadKnowledge,
    spend,
    secret: "s",
    now: () => NOW,
    capUsd: 10,
    ...rest,
  };
  return { deps, spend, sc, loadKnowledge };
}

async function collect(f: (emit: (e: AnalysisEvent) => void) => Promise<void>) {
  const ev: AnalysisEvent[] = [];
  await f((e) => ev.push(e));
  return ev;
}

test("olay sırası: stage okuma, stage arac, vehicle, stage yorumlama, result", async () => {
  const { deps, spend, loadKnowledge } = mkDeps();
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  expect(ev.map((e) => (e.type === "stage" ? `stage:${e.stage}` : e.type))).toEqual([
    "stage:okuma",
    "stage:arac",
    "vehicle",
    "stage:yorumlama",
    "result",
  ]);
  expect(spend.adds).toHaveLength(2);
  expect(loadKnowledge).toHaveBeenCalledTimes(1);
  expect(loadKnowledge).toHaveBeenCalledWith({
    vehicle: fixture.vehicle,
    firm: fixture.report.firm,
  });
});

test("rapor değil: not_report, yorumlama çağrılmaz, harcama bir kez eklenir", async () => {
  const notReport = { ...fixture, isReport: false, notReportReason: "araba fotoğrafı" };
  const { deps, spend, sc } = mkDeps({ msgs: [textMsg(JSON.stringify(notReport))] });
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  expect(ev.at(-1)).toMatchObject({ type: "error", code: "not_report" });
  expect(ev.some((e) => e.type === "vehicle")).toBe(false);
  expect(sc.calls).toHaveLength(1);
  expect(spend.adds).toHaveLength(1);
});

test("tavan dolu: cap_reached, okuma çağrılmaz", async () => {
  const spend = memSpend(10);
  const { deps, sc } = mkDeps({ spend });
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  expect(ev).toEqual([{ type: "error", code: "cap_reached", message: ERROR_MESSAGES.cap_reached }]);
  expect(sc.calls).toHaveLength(0);
});

test("yorumlamada refusal: error refusal ve iki harcama kaydı", async () => {
  const { deps, spend } = mkDeps({
    msgs: [textMsg(JSON.stringify(fixture)), textMsg("", "refusal")],
  });
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  expect(ev.at(-1)).toEqual({ type: "error", code: "refusal", message: ERROR_MESSAGES.refusal });
  expect(spend.adds).toHaveLength(2);
});

test("beklenmeyen hata: ham metin istemciye gitmez", async () => {
  const { deps } = mkDeps({
    loadKnowledge: async () => {
      throw new Error("secret db detail");
    },
  });
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  expect(ev.at(-1)).toEqual({ type: "error", code: "internal", message: ERROR_MESSAGES.internal });
  expect(JSON.stringify(ev)).not.toContain("secret db detail");
});

test("yeniden yorumlama hakkı bir kez", async () => {
  const first = mkDeps();
  const ev = await collect((emit) => runAnalysis(first.deps, [file], emit));
  const v = ev.find((e) => e.type === "vehicle");
  if (v?.type !== "vehicle") throw new Error("no vehicle");

  const second = mkDeps({ msgs: [interp()] });
  const re = await collect((emit) =>
    runReinterpret(second.deps, { token: v.token, vehicle: { ...v.vehicle, year: 2020 } }, emit),
  );
  expect(re.map((e) => e.type)).toEqual(["stage", "result"]);
  expect(re[1]).toMatchObject({ type: "result", result: { vehicle: { year: 2020 } } });
  expect(second.spend.adds).toHaveLength(1);

  // Hakkı kalmamış jeton: reinterpret_used. Çağrı ve harcama yok.
  const { extraction } = normalizeExtraction(fixture as never);
  const used = await signExtraction({ extraction, reinterpretsLeft: 0, carriedSignals: [] }, "s", NOW);
  const third = mkDeps({ msgs: [] });
  const r3 = await collect((emit) => runReinterpret(third.deps, { token: used, vehicle: v.vehicle }, emit));
  expect(r3).toEqual([
    { type: "error", code: "reinterpret_used", message: ERROR_MESSAGES.reinterpret_used },
  ]);
  expect(third.sc.calls).toHaveLength(0);

  const bad = await collect((emit) => runReinterpret(third.deps, { token: "x.y", vehicle: v.vehicle }, emit));
  expect(bad[0]).toMatchObject({ type: "error", code: "token_invalid" });
});
