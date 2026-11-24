import { AnalysisEventSchema, type AnalysisEvent } from "@/lib/schema/events";

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
 * 413/429/500): gövde akıştaki `error` olayıyla aynı tek JSON satırıdır ve kodu okunur. 2xx dışı
 * yanıtta hata olayı yoksa ya da gövde bizim değilse (ör. ağ geçidinin 502 HTML sayfası) hata
 * fırlatılır; çağıran bunu `internal` gösterir.
 */
export async function readEventResponse(res: Response, onEvent: (e: AnalysisEvent) => void): Promise<void> {
  if (!res.body) throw new Error("yanıt yok");
  if (res.ok) return readNdjson(res.body, onEvent);
  let sawError = false;
  await readNdjson(res.body, (e) => {
    if (e.type !== "error") throw new Error("beklenmeyen olay");
    sawError = true;
    onEvent(e);
  });
  if (!sawError) throw new Error(`HTTP ${res.status}`);
}
