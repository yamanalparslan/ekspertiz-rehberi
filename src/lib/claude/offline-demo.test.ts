import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { extractReport, type UploadFile } from "./extract";
import { createOfflineDemoClient, DEMO_SUMMARY_PREFIX } from "./offline-demo";
import { interpretReport } from "./interpret";
import { normalizeExtraction } from "@/lib/normalize";
import { computeFloors } from "@/lib/rules/floors";

const demoPdf: UploadFile = { bytes: new TextEncoder().encode("%PDF-1.7 demo"), mediaType: "application/pdf" };
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const knowledge = { vehicleId: null, chronicIssues: [], priceItems: [], firmVerifyUrl: null };

test("demo yalnız tanımlı dosyanın özetinde örnek çıkarımı döndürür; rapor numarası yer tutucudur", async () => {
  const client = createOfflineDemoClient({ fixtureSha256: [sha(demoPdf.bytes)] });
  const { raw, usd } = await extractReport(client, [demoPdf]);
  expect(usd).toBe(0);
  expect(raw.isReport).toBe(true);
  // Kaynakta gerçek rapor numarası yok: yalnız yer tutucu.
  expect(raw.report.reportNo).toBe("DEMO-0001");
});

test("demo başka her dosyada isReport:false döner (PDF, görsel, çoklu dosya)", async () => {
  const client = createOfflineDemoClient({ fixtureSha256: [sha(demoPdf.bytes)] });
  const other: UploadFile = { bytes: new TextEncoder().encode("%PDF-1.7 başka"), mediaType: "application/pdf" };
  const jpeg: UploadFile = { bytes: demoPdf.bytes, mediaType: "image/jpeg" };
  expect((await extractReport(client, [other])).raw.isReport).toBe(false);
  expect((await extractReport(client, [jpeg])).raw.isReport).toBe(false);
  expect((await extractReport(client, [demoPdf, demoPdf])).raw.isReport).toBe(false);
  // Özet tanımlı değilse hiçbir dosya tanınmaz.
  expect((await extractReport(createOfflineDemoClient({ fixtureSha256: [] }), [demoPdf])).raw.isReport).toBe(false);
});

test("demo yorumu görünür DEMO işaretiyle başlar", async () => {
  const client = createOfflineDemoClient({ fixtureSha256: [sha(demoPdf.bytes)] });
  const { raw } = await extractReport(client, [demoPdf]);
  const { extraction } = normalizeExtraction(raw);
  const { interpretation } = await interpretReport(client, {
    extraction,
    knowledge,
    floors: computeFloors(extraction),
  });
  expect(interpretation.summary.startsWith(DEMO_SUMMARY_PREFIX)).toBe(true);
  expect(DEMO_SUMMARY_PREFIX).toBe("DEMO — ");
});
