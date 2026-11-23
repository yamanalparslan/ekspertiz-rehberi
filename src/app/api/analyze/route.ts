import type { UploadFile } from "@/lib/claude/extract";
import { AnalysisError } from "@/lib/claude/client";
import { buildDeps, errorEvent, ndjsonResponse } from "@/lib/pipeline/http";
import { runAnalysis } from "@/lib/pipeline/run";
import { validateUpload } from "@/lib/pipeline/upload";

export async function POST(req: Request): Promise<Response> {
  const usd = { total: 0 };
  let entries: File[] = [];
  let parseFailed = false;
  try {
    const form = await req.formData();
    entries = form.getAll("files").filter((v): v is File => typeof v !== "string");
  } catch {
    parseFailed = true;
  }

  return ndjsonResponse(
    "analyze",
    entries.length,
    async (emit) => {
      if (parseFailed) return emit(errorEvent("upload_invalid"));
      try {
        // Baytlar okunmadan önce boyut ve tür denetlenir.
        validateUpload(entries);
      } catch (e) {
        return emit(errorEvent(e instanceof AnalysisError ? e.code : "internal"));
      }
      // "okuma" aşamasını runAnalysis bildirir (tavan denetiminden sonra).
      const deps = buildDeps(usd);
      if (!deps) return emit(errorEvent("internal"));
      const files: UploadFile[] = await Promise.all(
        entries.map(async (f) => ({
          bytes: new Uint8Array(await f.arrayBuffer()),
          mediaType: f.type as UploadFile["mediaType"],
        })),
      );
      await runAnalysis(deps, files, emit);
    },
    usd,
  );
}
