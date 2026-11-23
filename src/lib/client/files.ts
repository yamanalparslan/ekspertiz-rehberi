// Sunucudaki sınırlarla aynı (src/lib/pipeline/upload.ts). O modül Claude istemcisini
// içe aktardığı için tarayıcı paketine alınmaz; eşitliği files.test.ts denetler.
export const MAX_IMAGES = 25;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/**
 * Seçilen dosyaların yüklenmeye uygun olup olmadığı. Fotoğraflar gönderilmeden önce
 * küçültüldüğü için ham boyutları burada sayılmaz; küçültülmüş toplam ayrıca denetlenir.
 */
export function checkSelection(files: { type: string; size: number }[]): "ok" | "empty" | "invalid" {
  if (files.length === 0) return "empty";
  const pdfs = files.filter((f) => f.type === "application/pdf");
  const images = files.filter((f) => f.type.startsWith("image/")).length;
  if (pdfs.length + images !== files.length) return "invalid";
  if (pdfs.length > 0 && (pdfs.length !== 1 || images > 0)) return "invalid";
  if (images > MAX_IMAGES) return "invalid";
  if (pdfs.length === 1 && pdfs[0].size > MAX_TOTAL_BYTES) return "invalid";
  return "ok";
}
