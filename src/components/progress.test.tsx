import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { STAGES } from "@/lib/copy";
import { ARAC_DWELL_MS, Progress } from "./progress";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const activeStep = () => screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step")?.textContent;

test("araç bulununca 'Araç bilgileri bulundu' etkin adım olur ve yorumlama hemen gelse de bir süre görünür", () => {
  const { rerender } = render(<Progress stage="okuma" startedAt={Date.now()} />);
  expect(activeStep()).toBe(STAGES.okuma);
  // Sunucu araç olayından hemen sonra yorumlama aşamasını bildirir.
  rerender(<Progress stage="yorumlama" startedAt={Date.now()} />);
  act(() => {
    vi.advanceTimersByTime(0);
  });
  expect(activeStep()).toBe(STAGES.arac);
  act(() => {
    vi.advanceTimersByTime(ARAC_DWELL_MS - 100);
  });
  expect(activeStep()).toBe(STAGES.arac);
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(activeStep()).toBe(STAGES.yorumlama);
});

test("ekranı kilitlememe uyarısı ve geçen süre gösterilir", () => {
  render(<Progress stage={null} startedAt={Date.now()} />);
  expect(screen.getByText(/ekranı kilitlemeyin/)).toBeTruthy();
  expect(activeStep()).toBe(STAGES.okuma);
});
