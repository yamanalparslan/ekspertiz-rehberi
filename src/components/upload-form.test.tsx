import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { assessSelection, type SelectedItem } from "@/lib/client/selection";
import { CONSENT_DISCLAIMER, CONSENT_TRANSFER, PROVIDER_NOTES, type ProviderId } from "@/lib/copy";
import { UploadForm, type Consents } from "./upload-form";

const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });

function img(id: number, over: Partial<SelectedItem> = {}): SelectedItem {
  return {
    id,
    file: file(`IMG_${id}.JPG`, "image/jpeg"),
    kind: "image",
    status: "ready",
    upload: new Blob(["x"]),
    thumbUrl: `blob:test/${id}`,
    failure: null,
    ...over,
  };
}

function setup(opts: { items?: SelectedItem[]; consents?: Consents; provider?: ProviderId | null } = {}) {
  const items = opts.items ?? [];
  const handlers = { onAdd: vi.fn(), onRemove: vi.fn(), onClear: vi.fn(), onStart: vi.fn(), onConsentsChange: vi.fn() };
  render(
    <UploadForm
      provider={opts.provider === undefined ? "claude" : opts.provider}
      consents={opts.consents ?? { disclaimer: true, transfer: true }}
      items={items}
      selection={assessSelection(items)}
      {...handlers}
    />,
  );
  return handlers;
}

test("onay metinleri harfiyen; altında yapılandırılmış sağlayıcının adı yazar", () => {
  setup({ provider: "gemini", consents: { disclaimer: false, transfer: false } });
  expect(screen.getByText(CONSENT_DISCLAIMER)).toBeTruthy();
  expect(screen.getByText(CONSENT_TRANSFER)).toBeTruthy();
  expect(screen.getByText(PROVIDER_NOTES.gemini)).toBeTruthy();
  expect(PROVIDER_NOTES.gemini).toMatch(/Google/);
  expect(PROVIDER_NOTES.claude).toMatch(/Anthropic/);
});

test("sağlayıcı ayarlı değilse bunu söyler", () => {
  setup({ provider: null });
  expect(screen.getByText(PROVIDER_NOTES.none)).toBeTruthy();
});

test("onay yokken sayfa ekleme düğmeleri pasif ve onay ipucuna bağlı", () => {
  setup({ consents: { disclaimer: true, transfer: false } });
  for (const name of ["Fotoğraf çek", "Galeriden veya dosyadan seç"]) {
    const b = screen.getByRole("button", { name }) as HTMLButtonElement;
    expect(b.disabled, name).toBe(true);
    expect(document.getElementById(b.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Sayfa eklemek için önce iki kutuyu da işaretleyin.",
    );
  }
  const submit = screen.getByRole("button", { name: "Raporu yükle" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(document.getElementById(submit.getAttribute("aria-describedby")!)?.textContent).toMatch(/iki kutuyu/);
});

test("seçilen sayfalar numaralı küçük resimlerle gösterilir; tek tek kaldırılabilir ve sonradan eklenebilir", async () => {
  const user = userEvent.setup();
  const items = Array.from({ length: 6 }, (_, i) => img(i + 1));
  const h = setup({ items });
  const list = screen.getByRole("list", { name: "Seçilen sayfalar" });
  expect(within(list).getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual([
    "1. sayfa",
    "2. sayfa",
    "3. sayfa",
    "4. sayfa",
    "5. sayfa",
    "6. sayfa",
  ]);
  expect(screen.getByText("6 sayfa eklendi")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "3. sayfa kaldır" }));
  expect(h.onRemove).toHaveBeenCalledWith(3);
  await user.click(screen.getByRole("button", { name: "Tümünü kaldır" }));
  expect(h.onClear).toHaveBeenCalled();
  // İlk seçimden sonra da sayfa eklenebilir.
  expect(screen.getByRole("button", { name: "Bir sayfa daha çek" })).toBeTruthy();
  const picker = document.querySelector<HTMLInputElement>("input[type=file][multiple]")!;
  await user.upload(picker, [file("ek.jpg", "image/jpeg")]);
  expect(h.onAdd).toHaveBeenCalledWith([expect.objectContaining({ name: "ek.jpg" })]);
  await user.click(screen.getByRole("button", { name: "Raporu yükle" }));
  expect(h.onStart).toHaveBeenCalled();
});

test("okunamayan dosya adıyla bildirilir, kaldırılabilir; o kaldırılmadan yükleme yapılamaz", async () => {
  const user = userEvent.setup();
  const heic = img(2, {
    file: file("IMG_0007.HEIC", "image/heic"),
    status: "failed",
    upload: null,
    thumbUrl: null,
    failure: "decode",
  });
  const h = setup({ items: [img(1), heic, img(3)] });
  expect(screen.getByText(/^IMG_0007\.HEIC okunamadı\. HEIC/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Raporu yükle" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "IMG_0007.HEIC kaldır" }));
  expect(h.onRemove).toHaveBeenCalledWith(2);
});

test("az sayfada uyarır ama engellemez; hazırlanan fotoğraflar sayılır", () => {
  setup({ items: [img(1), img(2)] });
  expect(screen.getByText(/Yalnız 2 sayfa seçtiniz/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Raporu yükle" }) as HTMLButtonElement).disabled).toBe(false);
});

test("fotoğraflar hazırlanırken yükleme bekler ve ilerlemeyi gösterir", () => {
  setup({ items: [img(1), img(2, { status: "preparing", upload: null, thumbUrl: null })] });
  expect((screen.getByRole("button", { name: "Raporu yükle" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Fotoğraflar hazırlanıyor: 1/2")).toBeTruthy();
  expect(screen.getByText("2. sayfa hazırlanıyor")).toBeTruthy();
});

test("PDF ile fotoğraf birlikte seçilirse açıkça söylenir", () => {
  const pdf: SelectedItem = { ...img(9), file: file("rapor.pdf", "application/pdf"), kind: "pdf", thumbUrl: null };
  setup({ items: [img(1), pdf] });
  expect(screen.getByText(/ikisi birlikte gönderilemez/)).toBeTruthy();
});
