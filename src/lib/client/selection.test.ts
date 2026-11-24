import { expect, test } from "vitest";
import { assessSelection, failedMessage, kindOf, uploadParts, type SelectedItem } from "./selection";

type Item = Parameters<typeof assessSelection>[0][number];

const MB = 1024 * 1024;
const img = (over: Partial<Item> = {}): Item => ({
  kind: "image",
  status: "ready",
  file: { name: "IMG_0001.JPG", size: 4 * MB },
  upload: { size: 300_000 },
  ...over,
});
const pdf = (size = 2 * MB): Item => ({ kind: "pdf", status: "ready", file: { name: "rapor.pdf", size }, upload: { size } });

test("kindOf: PDF, görsel ve desteklenmeyen tür", () => {
  expect(kindOf({ type: "application/pdf" })).toBe("pdf");
  expect(kindOf({ type: "image/heic" })).toBe("image");
  expect(kindOf({ type: "" })).toBe("other");
  expect(kindOf({ type: "text/plain" })).toBe("other");
});

test("boş seçim ve hazır seçim; 5 sayfadan az fotoğrafta (engellemeden) uyarı", () => {
  expect(assessSelection([])).toEqual({ kind: "empty" });
  expect(assessSelection(Array.from({ length: 18 }, () => img()))).toEqual({
    kind: "ok",
    images: 18,
    pdf: false,
    fewPages: false,
  });
  expect(assessSelection([img(), img()])).toMatchObject({ kind: "ok", fewPages: true });
  expect(assessSelection([pdf()])).toEqual({ kind: "ok", images: 0, pdf: true, fewPages: false });
});

test("okunamayan dosya önce gelir ve adıyla bildirilir", () => {
  const s = assessSelection([img(), img({ status: "failed", file: { name: "IMG_0002.HEIC", size: 1 }, upload: null }), img({ status: "preparing" })]);
  expect(s).toEqual({ kind: "failed", names: ["IMG_0002.HEIC"] });
  expect(failedMessage(["IMG_0002.HEIC"])).toMatch(/^IMG_0002\.HEIC okunamadı\. HEIC/);
  expect(failedMessage(["a.heic", "b.heic"])).toMatch(/^Şu dosyalar okunamadı: a\.heic, b\.heic\./);
});

test("kural dışı seçimler: karışık, iki PDF, 25'ten çok fotoğraf, büyük PDF", () => {
  expect(assessSelection([pdf(), img()])).toMatchObject({ kind: "invalid", message: expect.stringMatching(/ikisi birlikte/) });
  expect(assessSelection([pdf(), pdf()])).toMatchObject({ kind: "invalid", message: expect.stringMatching(/bir PDF/) });
  expect(assessSelection(Array.from({ length: 27 }, () => img()))).toMatchObject({
    kind: "invalid",
    message: "En fazla 25 fotoğraf gönderilebilir; 2 tanesini kaldırın.",
  });
  expect(assessSelection(Array.from({ length: 25 }, () => img({ file: { name: "x", size: 8 * MB } })))).toMatchObject({ kind: "ok" });
  expect(assessSelection([pdf(21 * MB)])).toMatchObject({ kind: "invalid", message: expect.stringMatching(/20 MB/) });
});

test("hazırlanan fotoğraflar sayılır; küçültülmüş toplam 20 MB'ı aşarsa gönderilmez", () => {
  expect(assessSelection([img(), img({ status: "preparing", upload: null }), img({ status: "preparing", upload: null })])).toEqual({
    kind: "preparing",
    done: 1,
    total: 3,
  });
  expect(assessSelection(Array.from({ length: 21 }, () => img({ upload: { size: 1 * MB } })))).toMatchObject({
    kind: "invalid",
    message: expect.stringMatching(/küçültüldükten sonra/),
  });
});

test("uploadParts: fotoğraflar seçim sırasıyla numaralanır, PDF rapor.pdf olur", () => {
  const blob = (s: string) => new Blob([s]);
  const items: Pick<SelectedItem, "kind" | "upload">[] = [
    { kind: "image", upload: blob("1") },
    { kind: "image", upload: null },
    { kind: "image", upload: blob("3") },
  ];
  expect(uploadParts(items).map((p) => p.name)).toEqual(["sayfa-1.jpg", "sayfa-2.jpg"]);
  expect(uploadParts([{ kind: "pdf", upload: blob("%PDF") }]).map((p) => p.name)).toEqual(["rapor.pdf"]);
});
