import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { inspectPdfMetadata } from "@/lib/signals/pdf-metadata";

async function makePdf(meta: {
  producer?: string;
  creator?: string;
  created?: Date;
  modified?: Date;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage();
  if (meta.producer !== undefined) doc.setProducer(meta.producer);
  if (meta.creator !== undefined) doc.setCreator(meta.creator);
  if (meta.created) doc.setCreationDate(meta.created);
  if (meta.modified) doc.setModificationDate(meta.modified);
  return doc.save({ updateFieldAppearances: false });
}

test("üretici Canva ise pdf_duzenleyici", async () => {
  const s = await inspectPdfMetadata(await makePdf({ producer: "Canva" }));
  expect(s.map((x) => x.code)).toEqual(["pdf_duzenleyici"]);
  expect(s[0].level).toBe("warn");
});

test("oluşturucu alanı da büyük/küçük harf duyarsız eşleşir", async () => {
  const s = await inspectPdfMetadata(await makePdf({ creator: "Adobe PHOTOSHOP 25" }));
  expect(s.map((x) => x.code)).toEqual(["pdf_duzenleyici"]);
});

test("değiştirme tarihi 24 saatten fazla sonraysa pdf_sonradan_degistirilmis", async () => {
  const s = await inspectPdfMetadata(
    await makePdf({
      created: new Date("2026-11-01T10:00:00Z"),
      modified: new Date("2026-11-20T10:00:00Z"),
    }),
  );
  expect(s.map((x) => x.code)).toEqual(["pdf_sonradan_degistirilmis"]);
});

test("aynı gün içindeki değişiklik sinyal vermez", async () => {
  const s = await inspectPdfMetadata(
    await makePdf({
      created: new Date("2026-11-01T10:00:00Z"),
      modified: new Date("2026-11-01T12:00:00Z"),
    }),
  );
  expect(s).toEqual([]);
});

test("temiz PDF boş döner", async () => {
  expect(await inspectPdfMetadata(await makePdf({ producer: "Skia/PDF m120" }))).toEqual([]);
});

test("tarihler yoksa tarih kontrolü atlanır", async () => {
  expect(await inspectPdfMetadata(await makePdf({}))).toEqual([]);
});

test("PDF olmayan bayt boş döner", async () => {
  expect(await inspectPdfMetadata(new TextEncoder().encode("merhaba"))).toEqual([]);
});
