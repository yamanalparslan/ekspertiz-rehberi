import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ERROR_MESSAGES, REINTERPRET_USED } from "@/lib/copy";
import { vehicle } from "@/test/fixtures";
import { INFERRED_HINT, VehicleCard } from "./vehicle-card";

const spec = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement!;

test("tahmini motor hacmi yaklaşık litre ve 'tahmini' etiketiyle, açıklama satırıyla gösterilir", () => {
  render(<VehicleCard vehicle={vehicle} inferred={{ engineCc: true }} />);
  const engine = spec("Motor hacmi");
  expect(within(engine).getByText(/~1\.6 L/)).toBeTruthy();
  expect(within(engine).getByText("tahmini")).toBeTruthy();
  expect(within(engine).queryByText(/1598/)).toBeNull();
  // Basılı değerler etiketsiz.
  expect(within(spec("Motor gücü")).queryByText("tahmini")).toBeNull();
  expect(within(spec("Motor gücü")).getByText("170 HP")).toBeTruthy();
  expect(screen.getByText(INFERRED_HINT)).toBeTruthy();
  expect(INFERRED_HINT).toBe("Raporda yazmıyor; model adından tahmin edildi.");
});

test("tahmini güç ve yakıt da etiketlenir; tahmin yoksa açıklama satırı yok", () => {
  const { rerender } = render(<VehicleCard vehicle={vehicle} inferred={{ powerHp: true, fuel: true }} />);
  expect(within(spec("Motor gücü")).getByText(/~170 HP/)).toBeTruthy();
  expect(within(spec("Yakıt")).getByText("tahmini")).toBeTruthy();
  expect(within(spec("Motor hacmi")).getByText("1598 cc")).toBeTruthy();
  rerender(<VehicleCard vehicle={vehicle} inferred={null} />);
  expect(screen.queryByText("tahmini")).toBeNull();
  expect(screen.queryByText(INFERRED_HINT)).toBeNull();
});

test("analiz sürerken Düzelt pasif ve nedenini söyler; düzeltme işlevi yoksa düğme yok", () => {
  const { rerender } = render(<VehicleCard vehicle={vehicle} onCorrect={() => {}} correctDisabled />);
  const button = screen.getByRole("button", { name: "Düzelt" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toMatch(/Analiz bitince/);
  rerender(<VehicleCard vehicle={vehicle} />);
  expect(screen.queryByRole("button", { name: "Düzelt" })).toBeNull();
  rerender(<VehicleCard vehicle={vehicle} onCorrect={() => {}} used />);
  expect(screen.queryByRole("button", { name: "Düzelt" })).toBeNull();
  expect(screen.getByText(REINTERPRET_USED)).toBeTruthy();
});

test("formda litre yazılan hacim ve aralık dışı yıl gönderilmez; düzeltilince araç sayılarla gönderilir", async () => {
  const user = userEvent.setup();
  const onCorrect = vi.fn();
  render(<VehicleCard vehicle={vehicle} inferred={{ engineCc: true }} onCorrect={onCorrect} />);
  await user.click(screen.getByRole("button", { name: "Düzelt" }));
  const form = screen.getByRole("form", { name: "Araç bilgisini düzelt" });
  // Tahmini alan formda da belirtilir.
  expect(within(form).getByText("(tahmini)")).toBeTruthy();
  const cc = within(form).getByLabelText(/Motor hacmi/);
  await user.clear(cc);
  await user.type(cc, "1.6");
  const year = within(form).getByLabelText("Model yılı");
  await user.clear(year);
  await user.type(year, "1949");
  await user.click(within(form).getByRole("button", { name: "Yeniden yorumla" }));
  expect(onCorrect).not.toHaveBeenCalled();
  expect(within(form).getByText(/^Litre değil, cc yazın/)).toBeTruthy();
  expect(within(form).getByText("1950 ile 2027 arasında bir yıl yazın.")).toBeTruthy();
  expect(cc.getAttribute("aria-invalid")).toBe("true");

  await user.clear(cc);
  await user.type(cc, "1598");
  await user.clear(year);
  await user.type(year, "2021");
  const km = within(form).getByLabelText("Kilometre") as HTMLInputElement;
  expect(km.value).toBe("136.000");
  await user.clear(km);
  await user.type(km, "135.689");
  await user.click(within(form).getByRole("button", { name: "Yeniden yorumla" }));
  expect(onCorrect).toHaveBeenCalledWith({ ...vehicle, engineCc: 1598, year: 2021, km: 135689 });
});

test("sunucunun reddettiği düzeltme: form kullanıcının yazdıklarıyla ve mesajla açılır; Vazgeç kapatır", async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  const draft = { ...vehicle, km: 99000 };
  render(
    <VehicleCard
      vehicle={vehicle}
      onCorrect={() => {}}
      correction={{ draft, code: "vehicle_invalid" }}
      onDismissCorrection={onDismiss}
    />,
  );
  const form = screen.getByRole("form", { name: "Araç bilgisini düzelt" });
  expect(within(form).getByRole("alert").textContent).toBe(ERROR_MESSAGES.vehicle_invalid);
  expect((within(form).getByLabelText("Kilometre") as HTMLInputElement).value).toBe("99.000");
  await user.click(within(form).getByRole("button", { name: "Vazgeç" }));
  expect(onDismiss).toHaveBeenCalled();
});
