import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ERROR_MESSAGES } from "@/lib/copy";
import type { AnalysisEvent } from "@/lib/schema/events";
import { item, result, vehicle } from "@/test/fixtures";
import { Home } from "./home";

// Görsel çözme (canvas) ve QR taraması jsdom'da yok: hazır sonuç döndüren sahteleri kullanılır.
vi.mock("@/lib/client/resize", () => ({
  prepareImage: vi.fn(async () => ({ upload: new Blob(["jpeg"], { type: "image/jpeg" }), thumb: new Blob(["t"]) })),
  readPixels: vi.fn(),
}));
vi.mock("@/lib/client/qr-scan", () => ({ startQrScan: vi.fn(() => () => {}) }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("scrollTo", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:test/thumb");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const ndjson = (events: AnalysisEvent[], status = 200) =>
  new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { status });
const errorEvent = (code: Extract<AnalysisEvent, { type: "error" }>["code"]): AnalysisEvent => ({
  type: "error",
  code,
  message: ERROR_MESSAGES[code],
});
const sample = result([item({ group: "dikkat" }), item({ group: "normal" })]);
const fullRun: AnalysisEvent[] = [
  { type: "stage", stage: "okuma" },
  { type: "stage", stage: "arac" },
  { type: "vehicle", vehicle, token: "imzali-jeton" },
  { type: "stage", stage: "yorumlama" },
  { type: "result", result: sample },
];

/** Onayları verir, iki sayfa seçer, hazırlanmalarını bekler ve yüklemeyi başlatır. */
async function upload(user: ReturnType<typeof userEvent.setup>) {
  for (const box of screen.getAllByRole("checkbox")) await user.click(box);
  const picker = document.querySelector<HTMLInputElement>("input[type=file][multiple]")!;
  await user.upload(picker, [new File(["a"], "s1.jpg", { type: "image/jpeg" }), new File(["b"], "s2.jpg", { type: "image/jpeg" })]);
  const submit = screen.getByRole("button", { name: "Raporu yükle" }) as HTMLButtonElement;
  await waitFor(() => expect(submit.disabled).toBe(false));
  await user.click(submit);
}

test("geçici hata (500 internal): 'Tekrar dene' aynı sayfaları yeniden gönderir", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(ndjson([errorEvent("internal")], 500)).mockResolvedValueOnce(ndjson(fullRun));
  render(<Home provider="claude" />);
  await upload(user);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(ERROR_MESSAGES.internal);
  await user.click(within(alert).getByRole("button", { name: "Tekrar dene" }));
  await screen.findByRole("heading", { level: 2, name: "Sonuç" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const body = fetchMock.mock.calls[1][1]!.body as FormData;
  expect(body.getAll("files").map((f) => (f as File).name)).toEqual(["sayfa-1.jpg", "sayfa-2.jpg"]);
});

test("413: 'çok büyük' metni; yükleme ekranına dönülür, sayfalar ve onaylar kalır, istek yinelenmez", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(ndjson([errorEvent("upload_invalid")], 413));
  render(<Home provider="claude" />);
  await upload(user);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(ERROR_MESSAGES.upload_too_large);
  expect(within(alert).queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  await user.click(within(alert).getByRole("button", { name: "Yükleme ekranına dön" }));
  expect(within(screen.getByRole("list", { name: "Seçilen sayfalar" })).getAllByRole("img")).toHaveLength(2);
  for (const box of screen.getAllByRole("checkbox")) expect((box as HTMLInputElement).checked).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("akış içindeki kalıcı hata (rapor değil) aynı isteği yinelemez", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(ndjson([{ type: "stage", stage: "okuma" }, errorEvent("not_report")]));
  render(<Home provider="claude" />);
  await upload(user);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(ERROR_MESSAGES.not_report);
  await user.click(within(alert).getByRole("button", { name: "Yükleme ekranına dön" }));
  expect(screen.getByRole("button", { name: "Raporu yükle" })).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("bağlantı koparsa ayrı metin ve yeniden deneme; ağ geçidi 502 sunucu metni", async () => {
  const user = userEvent.setup();
  fetchMock
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
  render(<Home provider="claude" />);
  await upload(user);
  let alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(ERROR_MESSAGES.network);
  await user.click(within(alert).getByRole("button", { name: "Tekrar dene" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(ERROR_MESSAGES.server_unavailable));
  alert = screen.getByRole("alert");
  expect(within(alert).getByRole("button", { name: "Tekrar dene" })).toBeTruthy();
});

test("sonuç gelince odak sonuç başlığına taşınır ve duyurulur; Düzelt ancak o zaman açılır", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(ndjson(fullRun));
  render(<Home provider="claude" />);
  await upload(user);
  const heading = await screen.findByRole("heading", { level: 2, name: "Sonuç" });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(screen.getByText("Sonuç hazır.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Düzelt" }) as HTMLButtonElement).disabled).toBe(false);
});

test("sunucu düzeltmeyi reddederse (vehicle_invalid) sonuç kalır, form yazılanlarla ve mesajla açılır", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(ndjson(fullRun)).mockResolvedValueOnce(ndjson([errorEvent("vehicle_invalid")], 400));
  render(<Home provider="claude" />);
  await upload(user);
  await screen.findByRole("heading", { level: 2, name: "Sonuç" });
  await user.click(screen.getByRole("button", { name: "Düzelt" }));
  const km = screen.getByLabelText("Kilometre");
  await user.clear(km);
  await user.type(km, "99.000");
  await user.click(screen.getByRole("button", { name: "Yeniden yorumla" }));

  const form = await screen.findByRole("form", { name: "Araç bilgisini düzelt" });
  expect(within(form).getByRole("alert").textContent).toBe(ERROR_MESSAGES.vehicle_invalid);
  expect((within(form).getByLabelText("Kilometre") as HTMLInputElement).value).toBe("99.000");
  expect(screen.getByRole("heading", { level: 2, name: "Sonuç" })).toBeTruthy();
  const sent = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
  expect(sent).toEqual({ token: "imzali-jeton", vehicle: { ...vehicle, km: 99000 } });
});

test("'Yeni rapor yükle' sonuç ekrandayken onay ister; Vazgeç sonucu korur", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(ndjson(fullRun));
  render(<Home provider="claude" />);
  await upload(user);
  await screen.findByRole("heading", { level: 2, name: "Sonuç" });
  await user.click(screen.getByRole("button", { name: "Yeni rapor yükle" }));
  expect(screen.getByText(/Ekrandaki sonuç silinecek/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Vazgeç" }));
  expect(screen.getByRole("heading", { level: 2, name: "Sonuç" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Yeni rapor yükle" }));
  await user.click(screen.getByRole("button", { name: "Evet, yeni rapor yükle" }));
  expect(screen.getByRole("button", { name: "Raporu yükle" })).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Seçilen sayfalar" })).toBeNull();
});
