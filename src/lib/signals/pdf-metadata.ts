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
  const producer = doc.getProducer() ?? "";
  const creator = doc.getCreator() ?? "";
  const hay = `${producer}\n${creator}`.toLowerCase();
  const found = EDITORS.filter((name) => hay.includes(name));
  if (found.length > 0) {
    signals.push({
      code: "pdf_duzenleyici",
      level: "warn",
      message: "PDF'in üretici bilgisinde bir görsel veya PDF düzenleme programı geçiyor.",
      details: [producer, creator].filter((s) => s !== ""),
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
