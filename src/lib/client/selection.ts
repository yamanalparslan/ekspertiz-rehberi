import { MAX_IMAGES, MAX_TOTAL_BYTES } from "./files";

/** Seçilen bir dosya. Yalnız bileşen belleğinde durur; hiçbir depolamaya yazılmaz. */
export type SelectedItem = {
  id: number;
  file: File;
  kind: "image" | "pdf" | "other";
  /** Fotoğraflar seçilir seçilmez küçültülür; PDF olduğu gibi gönderilir. */
  status: "preparing" | "ready" | "failed";
  /** Gönderilecek veri: küçültülmüş JPEG ya da PDF'in kendisi. */
  upload: Blob | null;
  /** Önizleme küçük resmi (blob: adresi); PDF'te yok. */
  thumbUrl: string | null;
  failure: "decode" | "type" | null;
};

export const kindOf = (f: { type: string }): SelectedItem["kind"] =>
  f.type === "application/pdf" ? "pdf" : f.type.startsWith("image/") ? "image" : "other";

/** Tipik rapor 15–20 sayfa; bundan az fotoğrafta (engellemeden) eksik sayfa uyarısı verilir. */
export const FEW_PAGES = 5;

export type SelectionState =
  | { kind: "empty" }
  | { kind: "failed"; names: string[] }
  | { kind: "invalid"; message: string }
  | { kind: "preparing"; done: number; total: number }
  | { kind: "ok"; images: number; pdf: boolean; fewPages: boolean };

type Assessable = Pick<SelectedItem, "kind" | "status"> & {
  file: { name: string; size: number };
  upload: { size: number } | null;
};

/**
 * Seçimin gönderilmeye hazır olup olmadığı ve değilse nedeni. Sıra: okunamayan dosya, kural
 * dışı seçim (PDF ile fotoğraf karışık, birden çok PDF, 25'ten çok fotoğraf, büyük PDF),
 * hazırlanmakta olan fotoğraflar, küçültülmüş toplamın 20 MB'ı aşması.
 */
export function assessSelection(items: readonly Assessable[]): SelectionState {
  if (items.length === 0) return { kind: "empty" };
  const failed = items.filter((i) => i.status === "failed");
  if (failed.length > 0) return { kind: "failed", names: failed.map((i) => i.file.name) };

  const pdfs = items.filter((i) => i.kind === "pdf");
  const images = items.filter((i) => i.kind === "image");
  if (pdfs.length > 0 && images.length > 0) {
    return { kind: "invalid", message: "Ya tek bir PDF ya da sayfaların fotoğraflarını yükleyin; ikisi birlikte gönderilemez." };
  }
  if (pdfs.length > 1) return { kind: "invalid", message: "Yalnızca bir PDF yükleyebilirsiniz; fazlasını kaldırın." };
  if (images.length > MAX_IMAGES) {
    return {
      kind: "invalid",
      message: `En fazla ${MAX_IMAGES} fotoğraf gönderilebilir; ${images.length - MAX_IMAGES} tanesini kaldırın.`,
    };
  }
  if (pdfs.length === 1 && pdfs[0].file.size > MAX_TOTAL_BYTES) {
    return { kind: "invalid", message: "PDF 20 MB'tan büyük. Sayfaların fotoğrafını çekip yükleyin." };
  }

  const preparing = items.filter((i) => i.status === "preparing").length;
  if (preparing > 0) return { kind: "preparing", done: items.length - preparing, total: items.length };

  const total = items.reduce((n, i) => n + (i.upload?.size ?? 0), 0);
  if (total > MAX_TOTAL_BYTES) {
    return { kind: "invalid", message: "Fotoğraflar küçültüldükten sonra da 20 MB'ı geçiyor; birkaç sayfayı kaldırın." };
  }
  return { kind: "ok", images: images.length, pdf: pdfs.length === 1, fewPages: images.length > 0 && images.length < FEW_PAGES };
}

/** Okunamayan dosyaların mesajı: hangi dosya, olası neden ve ne yapılacağı. */
export function failedMessage(names: readonly string[]): string {
  const list = names.join(", ");
  return names.length === 1
    ? `${list} okunamadı. HEIC biçiminde ya da bozuk olabilir. Bu dosyayı kaldırıp devam edin ya da sayfayı yeniden çekin.`
    : `Şu dosyalar okunamadı: ${list}. HEIC biçiminde ya da bozuk olabilirler. Bunları kaldırıp devam edin ya da sayfaları yeniden çekin.`;
}

/** Gönderilecek parçalar: fotoğraflar seçim sırasıyla "sayfa-N.jpg", PDF "rapor.pdf". */
export function uploadParts(items: readonly Pick<SelectedItem, "kind" | "upload">[]): { blob: Blob; name: string }[] {
  let page = 0;
  return items.flatMap((i) => {
    if (!i.upload) return [];
    return [{ blob: i.upload, name: i.kind === "pdf" ? "rapor.pdf" : `sayfa-${++page}.jpg` }];
  });
}
