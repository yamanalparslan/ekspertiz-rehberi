import { AnalysisError } from "@/lib/claude/client";
import type { UploadFile } from "@/lib/claude/extract";

export const MAX_IMAGES = 25;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
/**
 * İstek gövdesi üst sınırı (Content-Length ön denetimi): dosyalar + çok parçalı form payı
 * (sınır satırları, parça başlıkları, dosya adları; 25 dosya için birkaç KB) için cömert pay.
 */
export const MAX_REQUEST_BYTES = MAX_TOTAL_BYTES + 256 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Yükleme hatası: `upload_invalid`; HTTP durumu 413 (çok büyük) ya da 400 (diğer). */
export class UploadError extends AnalysisError {
  readonly httpStatus: 400 | 413;
  constructor(httpStatus: 400 | 413, message: string) {
    super("upload_invalid", 0, message);
    this.name = "UploadError";
    this.httpStatus = httpStatus;
  }
}

/** Dosya baytları okunmadan önce çağrılır; geçersizse `UploadError` fırlatır. */
export function validateUpload(files: { size: number; type: string }[]): void {
  const fail = (reason: string) => {
    throw new UploadError(400, reason);
  };
  if (files.length === 0) fail("no files");
  if (files.some((f) => f.size <= 0)) fail("empty file");
  const pdfs = files.filter((f) => f.type === "application/pdf").length;
  const images = files.filter((f) => IMAGE_TYPES.has(f.type)).length;
  if (pdfs + images !== files.length) fail("unsupported type");
  if (pdfs > 0 && (pdfs !== 1 || images !== 0)) fail("pdf mix");
  if (images > MAX_IMAGES) fail("too many images");
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) throw new UploadError(413, "too large");
}

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) =>
  b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const PDF = ascii("%PDF-");
// PDF okuyucuları başlığı ilk 1024 bayt içinde arar (öncesinde BOM/boşluk olabilir).
const PDF_HEADER_WINDOW = 1024;

function matchesType(bytes: Uint8Array, type: UploadFile["mediaType"]): boolean {
  switch (type) {
    case "image/jpeg":
      return startsWith(bytes, JPEG);
    case "image/png":
      return startsWith(bytes, PNG);
    case "image/webp":
      return startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8);
    case "application/pdf": {
      const end = Math.min(bytes.length - PDF.length, PDF_HEADER_WINDOW);
      for (let i = 0; i <= end; i++) if (startsWith(bytes, PDF, i)) return true;
      return false;
    }
  }
}

/**
 * İçerik imzası denetimi: istemcinin bildirdiği tür, dosyanın baştaki baytlarıyla uyuşmalı
 * (JPEG FF D8 FF, PNG 89 50 4E 47 0D 0A 1A 0A, WEBP "RIFF....WEBP", PDF "%PDF-"). Uyuşmazsa
 * `UploadError` (400) fırlatır; model çağrılmaz.
 */
export function checkMagic(files: Pick<UploadFile, "bytes" | "mediaType">[]): void {
  for (const f of files) {
    if (!matchesType(f.bytes, f.mediaType)) throw new UploadError(400, "content does not match type");
  }
}
