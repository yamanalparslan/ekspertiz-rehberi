// Bileşen testleri (jsdom) için ortak hazırlık.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library global `afterEach` olmadan kendiliğinden temizlemez.
afterEach(() => {
  cleanup();
});
