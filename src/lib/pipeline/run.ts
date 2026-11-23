import { AnalysisError, type ClaudeLike } from "@/lib/claude/client";
import { extractReport, type UploadFile } from "@/lib/claude/extract";
import { interpretReport } from "@/lib/claude/interpret";
import { ERROR_MESSAGES } from "@/lib/copy";
import { priceCacheKey, type Knowledge, type KnowledgeQuery } from "@/lib/kb/match";
import type { PriceItem } from "@/lib/schema/kb";
import type { Group, Interpretation } from "@/lib/schema/interpretation";
import { lookupPrices } from "@/lib/claude/prices";
import { normalizeExtraction } from "@/lib/normalize";
import { computeFloors, mergeGroup } from "@/lib/rules/floors";
import type { Extraction } from "@/lib/schema/extraction";
import type { AnalysisEvent, ErrorCode } from "@/lib/schema/events";
import type { Signal } from "@/lib/schema/result";
import { computeSignals } from "@/lib/signals/signals";
import { inspectPdfMetadata } from "@/lib/signals/pdf-metadata";
import { buildResult } from "./result";
import { istanbulDay, type SpendStore } from "./spend";
import { signExtraction, verifyExtraction } from "./token";

export type PipelineDeps = {
  claude: ClaudeLike;
  loadKnowledge: (q: KnowledgeQuery) => Promise<Knowledge>;
  /** Canlı fiyatları önbelleğe yazar (anahtar: priceCacheKey). */
  savePrices: (vehicleKey: string, prices: PriceItem[]) => Promise<void>;
  spend: SpendStore;
  secret: string;
  now: () => Date;
  capUsd: number;
};

type Emit = (e: AnalysisEvent) => void;

const fail = (emit: Emit, code: ErrorCode) =>
  emit({ type: "error", code, message: ERROR_MESSAGES[code] });

/** Claude çağrısı: başarıda da AnalysisError'da da harcama yazılır. */
async function tracked<T extends { usd: number }>(d: PipelineDeps, call: () => Promise<T>): Promise<T> {
  const day = istanbulDay(d.now());
  let out: T;
  try {
    out = await call();
  } catch (e) {
    if (e instanceof AnalysisError && e.usd > 0) await d.spend.add(day, e.usd);
    throw e;
  }
  await d.spend.add(day, out.usd);
  return out;
}

async function capOk(d: PipelineDeps, emit: Emit): Promise<boolean> {
  if ((await d.spend.get(istanbulDay(d.now()))) >= d.capUsd) {
    fail(emit, "cap_reached");
    return false;
  }
  return true;
}

async function interpretAndEmit(
  d: PipelineDeps,
  extraction: Extraction,
  signals: Signal[],
  emit: Emit,
): Promise<void> {
  const floors = computeFloors(extraction);
  const knowledge = await d.loadKnowledge({
    vehicle: extraction.vehicle,
    firm: extraction.report.firm,
  });
  emit({ type: "stage", stage: "yorumlama" });
  const { interpretation } = await tracked(d, () =>
    interpretReport(d.claude, { extraction, knowledge, floors }),
  );
  const live = await addLivePrices(d, extraction, interpretation, knowledge, floors);
  emit({
    type: "result",
    result: buildResult({
      extraction,
      interpretation: live.interpretation,
      knowledge: live.knowledge,
      floors,
      signals,
    }),
  });
}

const MAX_LIVE_NEEDS = 5;

/** Fiyatı bilgi tabanında olmayan dikkat/kronik maddeler için canlı arama; hatalar ölümcül değildir. */
async function addLivePrices(
  d: PipelineDeps,
  extraction: Extraction,
  interpretation: Interpretation,
  knowledge: Knowledge,
  floors: Map<string, Group>,
): Promise<{ interpretation: Interpretation; knowledge: Knowledge }> {
  const needs: { itemId: string; need: string }[] = [];
  const seen = new Set<string>();
  for (const it of interpretation.items) {
    const group = mergeGroup(it.group, floors.get(it.itemId));
    const need = it.priceNeed?.trim() ?? "";
    if ((group !== "dikkat" && group !== "kronik") || it.priceItemId !== null || need === "") continue;
    if (seen.has(it.itemId)) continue;
    seen.add(it.itemId);
    needs.push({ itemId: it.itemId, need });
    if (needs.length === MAX_LIVE_NEEDS) break;
  }
  if (needs.length === 0) return { interpretation, knowledge };

  try {
    const { prices } = await tracked(d, () =>
      lookupPrices(d.claude, { vehicle: extraction.vehicle, needs }, d.now()),
    );
    if (prices.length === 0) return { interpretation, knowledge };

    const have = new Set(knowledge.priceItems.map((p) => p.id));
    const added = prices
      .filter((p) => !have.has(p.id))
      .map(({ forItemId: _f, ...p }) => ({ ...p, stale: false }));
    const firstFor = new Map<string, string>();
    for (const p of prices) if (!firstFor.has(p.forItemId)) firstFor.set(p.forItemId, p.id);

    const key = priceCacheKey(knowledge.vehicleId, extraction.vehicle);
    if (key !== null) {
      try {
        await d.savePrices(
          key,
          added.map(({ stale: _s, ...p }) => p),
        );
      } catch {
        // Önbellek yazımı başarısızsa sonuç yine de gösterilir.
      }
    }
    return {
      knowledge: { ...knowledge, priceItems: [...knowledge.priceItems, ...added] },
      interpretation: {
        ...interpretation,
        items: interpretation.items.map((it) =>
          it.priceItemId === null && firstFor.has(it.itemId)
            ? { ...it, priceItemId: firstFor.get(it.itemId) as string }
            : it,
        ),
      },
    };
  } catch {
    // Harcama tracked içinde yazıldı; canlı fiyat olmadan devam edilir.
    return { interpretation, knowledge };
  }
}

function toErrorCode(e: unknown): ErrorCode {
  return e instanceof AnalysisError ? e.code : "internal";
}

export async function runAnalysis(d: PipelineDeps, files: UploadFile[], emit: Emit): Promise<void> {
  try {
    if (!(await capOk(d, emit))) return;

    emit({ type: "stage", stage: "okuma" });
    const { raw } = await tracked(d, () => extractReport(d.claude, files));
    if (!raw.isReport) {
      fail(emit, "not_report");
      return;
    }

    const { extraction, signals: normSignals } = normalizeExtraction(raw);
    const pdf = files.length === 1 && files[0].mediaType === "application/pdf" ? files[0] : null;
    const pdfSignals = pdf ? await inspectPdfMetadata(pdf.bytes) : [];
    const carriedSignals = [...normSignals, ...pdfSignals];

    const token = await signExtraction(
      { extraction, reinterpretsLeft: 1, carriedSignals },
      d.secret,
      d.now(),
    );
    emit({ type: "stage", stage: "arac" });
    emit({ type: "vehicle", vehicle: extraction.vehicle, token });

    const signals = [...computeSignals(extraction, { now: d.now() }), ...carriedSignals];
    await interpretAndEmit(d, extraction, signals, emit);
  } catch (e) {
    fail(emit, toErrorCode(e));
  }
}

export async function runReinterpret(
  d: PipelineDeps,
  input: { token: string; vehicle: Extraction["vehicle"] },
  emit: Emit,
): Promise<void> {
  try {
    const t = await verifyExtraction(input.token, d.secret, d.now());
    if (t.reinterpretsLeft === 0) {
      fail(emit, "reinterpret_used");
      return;
    }
    if (!(await capOk(d, emit))) return;

    const extraction: Extraction = { ...t.extraction, vehicle: input.vehicle };
    const signals = [...computeSignals(extraction, { now: d.now() }), ...t.carriedSignals];
    await interpretAndEmit(d, extraction, signals, emit);
  } catch (e) {
    fail(emit, toErrorCode(e));
  }
}
