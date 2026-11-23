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
