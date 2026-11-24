import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// İki proje: kütüphane testleri (*.test.ts) node ortamında, bileşen testleri (*.test.tsx)
// jsdom ortamında çalışır. jsdom ve Testing Library yalnız bileşen testlerinde kullanılır.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "lib",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "bilesen",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
