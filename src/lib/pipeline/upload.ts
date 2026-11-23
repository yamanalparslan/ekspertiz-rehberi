import { AnalysisError } from "@/lib/claude/client";

export const MAX_IMAGES = 25;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Dosya baytları okunmadan önce çağrılır; geçersizse `upload_invalid` fırlatır. */
export function validateUpload(files: { size: number; type: string }[]): void {
  const fail = () => {
    throw new AnalysisError("upload_invalid", 0);
  };
  if (files.length === 0) fail();
  const pdfs = files.filter((f) => f.type === "application/pdf").length;
  const images = files.filter((f) => IMAGE_TYPES.has(f.type)).length;
  if (pdfs + images !== files.length) fail();
  if (pdfs > 0 && (pdfs !== 1 || images !== 0)) fail();
  if (images > MAX_IMAGES) fail();
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) fail();
}
