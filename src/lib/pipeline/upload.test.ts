import { expect, test } from "vitest";
import { validateUpload } from "./upload";

const img = (n = 1000, type = "image/jpeg") => ({ size: n, type });
const pdf = { size: 10, type: "application/pdf" };
const bad = (f: { size: number; type: string }[]) =>
  expect(() => validateUpload(f)).toThrowError(expect.objectContaining({ code: "upload_invalid" }));

test("yükleme: 26 görsel, PDF+görsel, 21 MB ve image/gif reddedilir; 25 jpeg kabul", () => {
  bad(Array.from({ length: 26 }, () => img()));
  bad([pdf, img()]);
  bad([pdf, pdf]);
  bad([img(21 * 1024 * 1024)]);
  bad([img(1000, "image/gif")]);
  bad([]);
  expect(() => validateUpload(Array.from({ length: 25 }, () => img()))).not.toThrow();
  expect(() => validateUpload([{ size: 20 * 1024 * 1024, type: "application/pdf" }])).not.toThrow();
});
