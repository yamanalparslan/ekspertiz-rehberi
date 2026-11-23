/**
 * Tarayıcıda görsel küçültme. Görseller yalnızca bellekte işlenir; hiçbir
 * depolamaya (localStorage, IndexedDB) yazılmaz.
 */

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      // EXIF yönü uygulanır: dik çekilmiş sayfa yan dönmez.
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Eski tarayıcı veya desteklenmeyen seçenek: <img> ile denenir.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(
  img: Decoded,
  maxEdge: number,
  willReadFrequently = false,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently });
  if (!ctx) throw new Error("canvas 2d bağlamı yok");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Uzun kenarı en fazla `maxEdge` piksel olan bir JPEG üretir. */
export async function resizeImage(file: File, maxEdge = 1568, quality = 0.85): Promise<Blob> {
  const img = await decode(file);
  try {
    const { canvas } = drawScaled(img, maxEdge);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("görsel kodlanamadı"))),
        "image/jpeg",
        quality,
      ),
    );
  } finally {
    img.close();
  }
}

/**
 * QR araması için görselin piksellerini okur. Yükleme için küçültülmüş (1568 px)
 * görselde küçük QR kodları çözülemeyebildiği için özgün dosyadan, uzun kenarı
 * en fazla `maxEdge` piksel olacak şekilde okunur.
 */
export async function readPixels(blob: Blob, maxEdge = 2560): Promise<ImageData> {
  const img = await decode(blob);
  try {
    const { canvas, ctx } = drawScaled(img, maxEdge, true);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    img.close();
  }
}
