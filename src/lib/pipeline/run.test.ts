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
    savePrices: vi.fn(async () => {}),
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

test("tahmini araç alanları vehicle olayı, bilgi tabanı sorgusu ve sonuçta işaretlenir; düzeltilince düşer", async () => {
  const egea = {
    ...fixture,
    vehicle: { ...fixture.vehicle, brand: "Fiat", model: "Egea", variant: "1.3 Multijet", engineCc: null, fuel: null },
  };
  const first = mkDeps({ msgs: [textMsg(JSON.stringify(egea)), interp()] });
  const ev = await collect((emit) => runAnalysis(first.deps, [file], emit));
  const v = ev.find((e) => e.type === "vehicle");
  if (v?.type !== "vehicle") throw new Error("no vehicle");
  expect(v.vehicle).toMatchObject({ engineCc: 1332, fuel: "dizel", powerHp: 170 });
  expect(v.vehicleInferred).toEqual({ engineCc: true, fuel: true });
  expect(first.loadKnowledge).toHaveBeenCalledWith(
    expect.objectContaining({ inferred: { engineCc: true, fuel: true } }),
  );
  const res = ev.at(-1);
  if (res?.type !== "result") throw new Error("no result");
  expect(res.result.vehicleInferred).toEqual({ engineCc: true, fuel: true });

  // Kullanıcı hacmi düzeltir, yakıta dokunmaz: yalnız yakıt tahmini kalır.
  const second = mkDeps({ msgs: [interp()] });
  const re = await collect((emit) =>
    runReinterpret(second.deps, { token: v.token, vehicle: { ...v.vehicle, engineCc: 1248 } }, emit),
  );
  const r2 = re.at(-1);
  if (r2?.type !== "result") throw new Error("no result");
  expect(r2.result.vehicle.engineCc).toBe(1248);
  expect(r2.result.vehicleInferred).toEqual({ fuel: true });

  // Basılı değerlerle gelen raporda işaret yoktur.
  const plain = mkDeps();
  const ev3 = await collect((emit) => runAnalysis(plain.deps, [file], emit));
  const v3 = ev3.find((e) => e.type === "vehicle");
  expect(v3).not.toHaveProperty("vehicleInferred");
  const r3 = ev3.at(-1);
  expect(r3?.type === "result" && r3.result).not.toHaveProperty("vehicleInferred");
});

// --- Canlı fiyat araması ---
const norm1 = normalizeExtraction(structuredClone(fixture) as never).extraction;
// Temiz durumlar modele gitmez (şablonla "normal"); yalnızca sorunlu maddeler kullanılır.
const CLEAN = ["orijinal", "saglam", "orijinalinde_yok", "calisiyor"];
const ids = norm1.items.filter((i) => !CLEAN.includes(i.statusKind)).map((i) => i.id);

const iItem = (itemId: string, over: Record<string, unknown> = {}) => ({
  itemId,
  group: "dikkat",
  title: `madde ${itemId}`,
  meaning: "anlam",
  whyItMatters: "neden",
  askSeller: null,
  priceItemId: null,
  priceNeed: `${itemId} için onarım maliyeti`,
  chronicIssueId: null,
  generalUnverified: false,
  ...over,
});
const interpMsg = (items: unknown[]) =>
  textMsg(JSON.stringify({ summary: "özet", items, checkList: [] }), "end_turn", { input_tokens: 2000, output_tokens: 200 });
const liveRow = (itemId: string, title = "Arka çamurluk boyama (tek panel)") => ({
  itemId,
  title,
  minTry: 4000,
  maxTry: 6000,
  partType: "belirtilmemis",
  laborIncluded: true,
  sourceUrl: "https://www.example.com/fiyat",
  sourceTitle: "Örnek",
});
const priceMsg = (fiyatlar: unknown[], groundedUrl = "https://example.com/arama") => ({
  stop_reason: "tool_use",
  usage: { input_tokens: 5000, output_tokens: 500 },
  content: [
    {
      type: "web_search_tool_result",
      tool_use_id: "s",
      content: [{ type: "web_search_result", url: groundedUrl, title: "t", encrypted_content: "x", page_age: null }],
    },
    { type: "tool_use", id: "t", name: "fiyatlari_kaydet", input: { fiyatlar } },
  ],
});

test("hat: priceNeed olan madde canlı fiyatla dolar ve harcama eklenir", async () => {
  const savePrices = vi.fn(async () => {});
  const { deps, spend, sc } = mkDeps({
    savePrices,
    msgs: [textMsg(JSON.stringify(fixture)), interpMsg([iItem(ids[0])]), priceMsg([liveRow(ids[0])])],
  });
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  const res = ev.at(-1);
  if (res?.type !== "result") throw new Error("no result");
  const it = res.result.items.find((i) => i.itemId === ids[0]);
  expect(it?.cost).toMatchObject({
    minTry: 4000,
    maxTry: 6000,
    stale: false,
    asOf: "2026-11-23",
    source: { url: "https://www.example.com/fiyat" },
  });
  expect(spend.adds).toHaveLength(3);
  expect(spend.adds[2]).toBeCloseTo(0.03, 6);
  expect(sc.calls).toHaveLength(3);
  // Önbellek anahtarı: KB eşleşmesi yok -> "marka|model".
  expect(savePrices).toHaveBeenCalledWith("bmw|320i", [
    expect.objectContaining({ id: "live-bmw-320i-arka-camurluk-boyama-tek-panel-2026-11-23" }),
  ]);
  expect(JSON.stringify(savePrices.mock.calls[0])).not.toContain("forItemId");
});

test("hat: yalnızca dikkat/kronik, fiyatsız, priceNeed dolu maddeler aranır; en çok 5", async () => {
  const items = [
    iItem(ids[0], { group: "normal" }),
    iItem(ids[1], { priceNeed: null }),
    iItem(ids[2], { priceItemId: "var" }),
    ...ids.slice(3, 10).map((id) => iItem(id)),
  ];
  const { deps, sc } = mkDeps({
    msgs: [textMsg(JSON.stringify(fixture)), interpMsg(items), priceMsg([])],
  });
  await collect((emit) => runAnalysis(deps, [file], emit));
  const sent = JSON.parse(
    (sc.calls[2].messages as { content: { text: string }[] }[])[0].content[0].text,
  ).needs as { itemId: string }[];
  expect(sent.map((n) => n.itemId)).toEqual(ids.slice(3, 8));
});

test("hat: fiyat araması hata verirse result yine gelir, harcama yazılır", async () => {
  const { deps, spend } = mkDeps({
    msgs: [
      textMsg(JSON.stringify(fixture)),
      interpMsg([iItem(ids[0])]),
      { stop_reason: "refusal", usage: { input_tokens: 5000, output_tokens: 0 }, content: [] },
    ],
  });
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  expect(ev.at(-1)?.type).toBe("result");
  expect(ev.some((e) => e.type === "error")).toBe(false);
  expect(spend.adds).toHaveLength(3);
  expect(spend.adds[2]).toBeCloseTo(0.02, 6);
});

test("hat: aramada görünmeyen kaynaklı fiyat ne gösterilir ne önbelleğe yazılır", async () => {
  const savePrices = vi.fn(async () => {});
  const { deps } = mkDeps({
    savePrices,
    msgs: [
      textMsg(JSON.stringify(fixture)),
      interpMsg([iItem(ids[0])]),
      priceMsg([liveRow(ids[0])], "https://baska-site.com/sonuc"),
    ],
  });
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  const res = ev.at(-1);
  if (res?.type !== "result") throw new Error("no result");
  expect(res.result.items.find((i) => i.itemId === ids[0])?.cost).toBeNull();
  expect(savePrices).not.toHaveBeenCalled();
});

test("hat: önbellek yazımı hata verirse result yine gelir", async () => {
  const { deps } = mkDeps({
    savePrices: async () => {
      throw new Error("d1 down");
    },
    msgs: [textMsg(JSON.stringify(fixture)), interpMsg([iItem(ids[0])]), priceMsg([liveRow(ids[0])])],
  });
  const ev = await collect((emit) => runAnalysis(deps, [file], emit));
  expect(ev.at(-1)?.type).toBe("result");
});
