// QR araması için Web Worker: görsel çözme, piksel okuma ve jsQR ana iş parçacığını
// kilitlemez (telefonda 12 MP fotoğrafta tek tarama yüzlerce ms sürebilir).
// Görsel yalnız bellekte işlenir; sonuç olarak yalnız QR metni döner.
import { decodeQr } from "./qr";

export type QrRequest = { id: number; blob: Blob; maxEdge: number };
export type QrResponse = { id: number; text: string | null };

// Bu dosya "webworker" kütüphane tipleri olmadan derlenir; gereken küçük yüzey elle tanımlı.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<QrRequest>) => void) | null;
  postMessage: (message: QrResponse) => void;
};

async function scan({ blob, maxEdge }: QrRequest): Promise<string | null> {
  // EXIF yönü uygulanır: dik çekilmiş sayfa yan dönmez.
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return decodeQr(ctx.getImageData(0, 0, width, height));
  } finally {
    bitmap.close();
  }
}

scope.onmessage = (e) => {
  const { id } = e.data;
  scan(e.data).then(
    (text) => scope.postMessage({ id, text }),
    () => scope.postMessage({ id, text: null }),
  );
};
