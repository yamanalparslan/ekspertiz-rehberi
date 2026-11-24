// /api/analyze ve /api/reinterpret istek işleyicileri (route dosyaları yalnız bağımlılığı verir).
//
// Akış başlamadan bilinen hatalar uygun HTTP durumuyla ve akıştaki `error` olayıyla aynı JSON
// gövdesiyle döner (400/401/403/413/429/500); akış başladıktan sonraki hatalar NDJSON olayı kalır.
import { z } from "zod";
import { AnalysisError } from "@/lib/claude/client";
import type { UploadFile } from "@/lib/claude/extract";
import { VehicleSchema } from "@/lib/schema/result";
import { errorResponse, ndjsonResponse, type RunMeta } from "./http";
import { capReached, runAnalysis, runReinterpret, type PipelineDeps } from "./run";
import { verifyExtraction } from "./token";
import { checkMagic, MAX_REQUEST_BYTES, UploadError, validateUpload } from "./upload";
import { parseCorrectedVehicle } from "./vehicle-input";

export type DepsFactory = (meta: RunMeta) => Promise<PipelineDeps | null>;

/** Tavan denetimi; D1 okunamazsa null (çağıran `internal` döner). */
async function capCheck(deps: PipelineDeps): Promise<boolean | null> {
  try {
    return await capReached(deps);
  } catch {
    return null;
  }
}

export async function handleAnalyze(req: Request, makeDeps: DepsFactory): Promise<Response> {
  const meta: RunMeta = { total: 0 };
  const started = Date.now();
  let count = 0;
  const reject = (code: Parameters<typeof errorResponse>[2], status?: number) =>
    errorResponse("analyze", count, code, meta, status, started);

  // Gövde okunmadan: bildirilen boyut 20 MB + form payını aşıyorsa 413.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) return reject("upload_invalid", 413);

  let entries: File[];
  try {
    const form = await req.formData();
    entries = form.getAll("files").filter((v): v is File => typeof v !== "string");
  } catch {
    return reject("upload_invalid", 400);
  }
  count = entries.length;

  // Baytlar okunmadan önce sayı, tür, boş dosya ve toplam boyut.
  try {
    validateUpload(entries);
  } catch (e) {
    return reject("upload_invalid", e instanceof UploadError ? e.httpStatus : 400);
  }

  const deps = await makeDeps(meta);
  if (!deps) return reject("internal", 500);
  const full = await capCheck(deps);
  if (full === null) return reject("internal", 500);
  if (full) return reject("cap_reached", 429);

  const files: UploadFile[] = await Promise.all(
    entries.map(async (f) => ({
      bytes: new Uint8Array(await f.arrayBuffer()),
      mediaType: f.type as UploadFile["mediaType"],
    })),
  );
  // İçerik imzası bildirilen türle uyuşmalı (istemcinin `type` alanına güvenilmez).
  try {
    checkMagic(files);
  } catch {
    return reject("upload_invalid", 400);
  }

  // "okuma" aşamasını runAnalysis bildirir.
  return ndjsonResponse("analyze", count, (emit) => runAnalysis(deps, files, emit), meta, started);
}

const BodySchema = z.object({ token: z.string().optional(), vehicle: VehicleSchema });

export async function handleReinterpret(req: Request, makeDeps: DepsFactory): Promise<Response> {
  const meta: RunMeta = { total: 0 };
  const started = Date.now();
  const reject = (code: Parameters<typeof errorResponse>[2], status?: number) =>
    errorResponse("reinterpret", 0, code, meta, status, started);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reject("request_invalid");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return reject("request_invalid");
  const token = parsed.data.token;
  if (!token) return reject("token_invalid");
  const vehicle = parseCorrectedVehicle(parsed.data.vehicle, new Date());
  if (!vehicle) return reject("vehicle_invalid");

  const deps = await makeDeps(meta);
  if (!deps) return reject("internal");
  try {
    const t = await verifyExtraction(token, deps.secret, deps.now());
    if (t.reinterpretsLeft === 0) return reject("reinterpret_used");
  } catch (e) {
    return reject(e instanceof AnalysisError ? e.code : "internal");
  }
  const full = await capCheck(deps);
  if (full === null) return reject("internal");
  if (full) return reject("cap_reached");

  return ndjsonResponse("reinterpret", 0, (emit) => runReinterpret(deps, { token, vehicle }, emit), meta, started);
}
