import { decodeQr, qrLink, type QrFound } from "./qr";
import type { QrRequest, QrResponse } from "./qr.worker";
import { readPixels } from "./resize";

/** QR özgün fotoğrafta aranır; küçültülmüş (1568 px) görselde küçük kodlar kaybolabiliyor. */
const MAX_EDGE = 2560;

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

function createWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    return new Worker(new URL("./qr.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

/**
 * Görsellerde QR kodu arar ve her yeni bağlantıda bulunanların tamamını bildirir. Tarama bir
 * Web Worker'da, görseller sırayla gönderilerek yapılır; worker yoksa ya da yüklenemezse ana
 * iş parçacığında, her görselden önce nefes payı bırakarak sürer. Analizi bekletmez.
 * Dönen fonksiyon taramayı durdurur.
 */
export function startQrScan(images: readonly Blob[], onFound: (found: QrFound[]) => void): () => void {
  let stopped = false;
  const found: QrFound[] = [];
  const add = (text: string | null) => {
    const link = text === null ? null : qrLink(text);
    if (link && !found.some((f) => f.url === link.url)) {
      found.push(link);
      onFound([...found]);
    }
  };

  async function onMainThread(from: number) {
    for (let i = from; i < images.length; i++) {
      await nextTick();
      if (stopped) return;
      try {
        add(decodeQr(await readPixels(images[i], MAX_EDGE)));
      } catch {
        // Okunamayan görselde QR aranmaz.
      }
    }
  }

  const worker = createWorker();
  if (worker) {
    let index = 0;
    const next = () => {
      if (stopped || index >= images.length) {
        worker.terminate();
        return;
      }
      const request: QrRequest = { id: index, blob: images[index], maxEdge: MAX_EDGE };
      worker.postMessage(request);
    };
    worker.onmessage = (e: MessageEvent<QrResponse>) => {
      if (stopped || e.data.id !== index) return;
      add(e.data.text);
      index++;
      next();
    };
    // Worker yüklenemedi (ör. eski tarayıcı): kalan görseller ana iş parçacığında taranır.
    worker.onerror = () => {
      worker.terminate();
      if (!stopped) void onMainThread(index);
    };
    next();
  } else {
    void onMainThread(0);
  }

  return () => {
    stopped = true;
    worker?.terminate();
  };
}
