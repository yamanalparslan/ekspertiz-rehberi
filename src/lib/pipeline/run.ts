import { AnalysisError, type ClaudeLike } from "@/lib/claude/client";
import { extractReport, type UploadFile } from "@/lib/claude/extract";
import { interpretReport } from "@/lib/claude/interpret";
import { ERROR_MESSAGES } from "@/lib/copy";
import type { Knowledge, KnowledgeQuery } from "@/lib/kb/match";
import { normalizeExtraction } from "@/lib/normalize";
import { computeFloors } from "@/lib/rules/floors";
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
  emit({
    type: "result",
    result: buildResult({ extraction, interpretation, knowledge, floors, signals }),
  });
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
