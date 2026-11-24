import { PDFDocument } from "pdf-lib";
import type { Signal } from "@/lib/schema/result";

const EDITORS = [
  "photoshop",
  "gimp",
  "canva",
  "ilovepdf",
  "smallpdf",
  "sejda",
  "pdfescape",
  "pdffiller",
];
const DAY_MS = 24 * 60 * 60 * 1000;

export async function inspectPdfMetadata(bytes: Uint8Array): Promise<Signal[]> {
  let doc: PDFDocument;
  try {
    // updateMetadata: false, yükleme sırasında üretici ve değiştirme tarihinin ezilmesini engeller.
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch {
    return [];
  }

  const signals: Signal[] = [];
  // Ayrıntıda yalnız eşleşen alan, hangi alan olduğu yazılarak gösterilir.
  const fields = [
    { label: "Üretici (Producer)", value: doc.getProducer() ?? "" },
    { label: "Oluşturan program (Creator)", value: doc.getCreator() ?? "" },
  ];
  const matched = fields.filter((f) => EDITORS.some((name) => f.value.toLowerCase().includes(name)));
  if (matched.length > 0) {
    signals.push({
      code: "pdf_duzenleyici",
      level: "warn",
      message: "PDF'in üretici bilgisinde bir görsel veya PDF düzenleme programı geçiyor.",
      details: matched.map((f) => `${f.label}: ${f.value}`),
    });
  }

  const created = doc.getCreationDate();
  const modified = doc.getModificationDate();
  if (created && modified && modified.getTime() - created.getTime() > DAY_MS) {
    signals.push({
      code: "pdf_sonradan_degistirilmis",
      level: "warn",
      message: "PDF oluşturulduktan 24 saatten fazla sonra değiştirilmiş.",
      details: [created.toISOString(), modified.toISOString()],
    });
  }
  return signals;
}
