import { AnalysisEventSchema, type AnalysisEvent } from "@/lib/schema/events";
import { HttpStatusError } from "./failure";

/**
 * NDJSON akışını satır satır okur. Parçalara bölünmüş satırları ve çok baytlı
 * karakterleri birleştirir. Şemaya uymayan bir satırda hata fırlatır; çağıran
 * bunu `internal` hatası olarak gösterir.
 */
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: AnalysisEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitLine = (line: string) => {
    const text = line.trim();
    if (text === "") return;
    onEvent(AnalysisEventSchema.parse(JSON.parse(text)));
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        emitLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    emitLine(buffer);
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Sunucu yanıtını olay olarak okur. 2xx: NDJSON akışı. 2xx dışı (ön akış hatası: 400/401/403/
 * 429/500): gövde akıştaki `error` olayıyla aynı tek JSON satırıdır ve kodu okunur. 413 (çok
 * büyük yükleme), hata olayı taşımayan ya da gövdesi bizim olmayan (ör. ağ geçidinin 502 HTML
 * sayfası) 2xx dışı yanıtta `HttpStatusError` fırlatılır; çağıran durumu `failureCode` ile
 * metne çevirir.
 */
export async function readEventResponse(res: Response, onEvent: (e: AnalysisEvent) => void): Promise<void> {
  if (res.ok) {
    if (!res.body) throw new Error("yanıt yok");
    return readNdjson(res.body, onEvent);
  }
  // 413'te sunucu `upload_invalid` gönderir; kullanıcıya ayrıca "çok büyük" denir.
  if (res.status === 413 || !res.body) throw new HttpStatusError(res.status);
  let first: AnalysisEvent | null = null;
  try {
    await readNdjson(res.body, (e) => {
      if (e.type !== "error") throw new Error("beklenmeyen olay");
      first ??= e;
    });
  } catch {
    first = null;
  }
  if (first === null) throw new HttpStatusError(res.status);
  onEvent(first);
}
