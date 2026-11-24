import { expect, test } from "vitest";
import { normalizeExtraction } from "@/lib/normalize";
import { RawExtractionSchema, type RawExtraction } from "@/lib/schema/extraction";
import fixtureJson from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { computeSignals } from "@/lib/signals/signals";

const fixture: RawExtraction = RawExtractionSchema.parse(fixtureJson);
const now = new Date("2026-11-23T15:00:00+03:00");
const run = (mutate?: (r: RawExtraction) => void) => {
  const raw = structuredClone(fixture);
  mutate?.(raw);
  return computeSignals(normalizeExtraction(raw).extraction, { now });
};
const codes = (s: ReturnType<typeof run>) => s.map((x) => x.code);

test("örnek rapor: güncel, km tutarlı, hasar uyumlu, klimada OBD çelişkisi", () => {
  const signals = run();
  expect(codes(signals)).toEqual(
    expect.arrayContaining(["km_tutarli", "hasar_parca_uyumlu", "obd_ozet_celiski", "qr_var"]),
  );
  expect(signals.find((s) => s.code === "obd_ozet_celiski")!.details).toEqual(["klima"]);
  expect(codes(signals)).not.toContain("rapor_eski");
  expect(codes(signals)).not.toContain("eksik_bolum");
  expect(codes(signals)).not.toContain("km_dusus");
  const uyumlu = signals.find((s) => s.code === "hasar_parca_uyumlu")!;
  expect(uyumlu.details).toHaveLength(2);
  expect(uyumlu.details[0]).toContain("2023-10-28");
});

test("hiçbir mesaj yasak sözcük içermez", () => {
  const all = [
    ...run(),
    ...run((r) => {
      r.report.date = "2026-10-01";
      r.kmHistory.push({ date: "2026-11-01", km: 140000 });
      r.sectionsPresent = [];
    }),
  ];
  for (const s of all) expect(s.message).not.toMatch(/sahte|gerçek|doğrulandı/i);
});

test("eski rapor uyarı alır", () => {
  const s = run((r) => {
    r.report.date = "2026-10-01";
  }).find((x) => x.code === "rapor_eski");
  expect(s?.level).toBe("warn");
});

test("rapor tarihi yoksa yaş sinyali çıkmaz", () => {
  expect(
    codes(
      run((r) => {
        r.report.date = null;
      }),
    ),
  ).not.toContain("rapor_eski");
});

test("km düşüşü yakalanır", () => {
  const signals = run((r) => {
    r.kmHistory.push({ date: "2026-11-01", km: 140000 });
  });
  expect(codes(signals)).toContain("km_dusus");
  expect(codes(signals)).not.toContain("km_tutarli");
});

test("geçmiş kendi içinde azalıyorsa km_dusus", () => {
  const signals = run((r) => {
    r.vehicle.km = null;
    r.kmHistory = [
      { date: "2024-01-01", km: 90000 },
      { date: "2025-01-01", km: 80000 },
    ];
  });
  expect(codes(signals)).toContain("km_dusus");
});

test("rapordaki km okunamadıysa km_tutarli rapordaki km ile karşılaştırma iddia etmez", () => {
  const withKm = run().find((s) => s.code === "km_tutarli")!;
  expect(withKm.message).toContain("rapordaki km");
  const noKm = run((r) => {
    r.vehicle.km = null;
  }).find((s) => s.code === "km_tutarli")!;
  expect(noKm.message).not.toContain("rapordaki km ile tutarlı");
  expect(noKm.message).toMatch(/kendi içinde tutarlı/);
  expect(noKm.message).toMatch(/km okunamadı/);
});

test("km geçmişi boşsa km sinyali yok", () => {
  const signals = run((r) => {
    r.kmHistory = [];
  });
  expect(codes(signals)).not.toContain("km_dusus");
  expect(codes(signals)).not.toContain("km_tutarli");
});

test("eksik sayfa: test hattı ve OBD yoksa eksik_bolum", () => {
  const signals = run((r) => {
    r.sectionsPresent = r.sectionsPresent.filter((s) => s !== "obd" && s !== "test_hatti");
  });
  expect(signals.find((s) => s.code === "eksik_bolum")!.details).toEqual(["obd", "test_hatti"]);
});

test("hasar kaydı var, değişmiş parça yok: uyumsuz", () => {
  const changed = ["degisen", "boyali", "lokal_boyali", "tadilat_boyali", "sokulup_takilmis"];
  const signals = run((r) => {
    for (const i of r.items) if (changed.includes(i.statusKind)) i.statusKind = "orijinal";
  });
  expect(codes(signals)).toContain("hasar_parca_uyumsuz");
  expect(codes(signals)).not.toContain("hasar_parca_uyumlu");
});

test("değişmiş parça var, hasar sorgusu var ama kayıt yok: info", () => {
  const signals = run((r) => {
    r.damageRecords = [];
  });
  expect(signals.find((x) => x.code === "degisen_var_hasar_yok")?.level).toBe("info");
});

test("hasar sorgusu bölümü yoksa hasar-parça sinyali çıkmaz", () => {
  const signals = run((r) => {
    r.sectionsPresent = r.sectionsPresent.filter((s) => s !== "hasar_sorgusu");
    r.damageRecords = [];
  });
  expect(codes(signals)).not.toContain("degisen_var_hasar_yok");
  expect(codes(signals)).not.toContain("hasar_parca_uyumsuz");
});

test("özette olmayan sistemin ham arızası çelişki sayılmaz", () => {
  const signals = run((r) => {
    r.obd.summary = r.obd.summary.filter((x) => x.system !== "klima");
  });
  expect(codes(signals)).not.toContain("obd_ozet_celiski");
});

test("QR yoksa qr_var çıkmaz", () => {
  expect(
    codes(
      run((r) => {
        r.report.onlineReportQrPresent = false;
      }),
    ),
  ).not.toContain("qr_var");
});
