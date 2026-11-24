import jsQR from "jsqr";

/** Görüntüde QR kodu arar; bulursa içindeki metni döner. */
export function decodeQr(image: ImageData): string | null {
  // Basılı raporda QR koyu üstüne açık değil, açık üstüne koyudur: ters çevirme denenmez.
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
  return code && code.data.trim() !== "" ? code.data : null;
}

/** QR kodundan (ya da kaynaktan) okunan, gösterilebilir bağlantı. */
export type QrFound = { url: string; domain: string };

/**
 * Yalnızca http(s) bağlantılarını kabul eder ve gösterilecek alan adını verir.
 * Kullanıcı adı/parola içeren bağlantılar (https://firma.com@baska.site) yanıltıcı
 * olduğu için reddedilir.
 */
export function qrLink(text: string): QrFound | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.hostname === "") return null;
  return { url: url.href, domain: url.hostname.toLowerCase().replace(/^www\./, "") };
}
