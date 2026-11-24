import type { Extraction, Section, StatusKind } from "@/lib/schema/extraction";
import type { Signal } from "@/lib/schema/result";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 30;

const CHANGED_KINDS: ReadonlySet<StatusKind> = new Set<StatusKind>([
  "degisen",
  "boyali",
  "lokal_boyali",
  "tadilat_boyali",
  "sokulup_takilmis",
]);

const CORE_SECTIONS: readonly Section[] = [
  "kaporta_boya",
  "sasi",
  "ust_motor",
  "motor_alt_mekanik",
  "obd",
  "test_hatti",
];

const formatTry = (n: number): string => `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`;

export function computeSignals(e: Extraction, opts: { now: Date }): Signal[] {
  const signals: Signal[] = [];

  // Rapor yaşı
  if (e.report.date) {
    const reportDate = new Date(`${e.report.date}T00:00:00+03:00`);
    if (!Number.isNaN(reportDate.getTime())) {
      const ageDays = (opts.now.getTime() - reportDate.getTime()) / DAY_MS;
      if (ageDays > STALE_AFTER_DAYS) {
        signals.push({
          code: "rapor_eski",
          level: "warn",
          message: "Rapor 30 günden eski, araç bu sürede değişmiş olabilir.",
          details: [e.report.date],
        });
      }
    }
  }

  // Kilometre
  if (e.kmHistory.length > 0) {
    const reportKm = e.vehicle.km;
    const aboveReport = reportKm !== null && e.kmHistory.some((k) => k.km > reportKm);
    const sorted = [...e.kmHistory].sort((a, b) => a.date.localeCompare(b.date));
    const decreasing = sorted.some((k, n) => n > 0 && k.km < sorted[n - 1].km);
    if (aboveReport || decreasing) {
      signals.push({
        code: "km_dusus",
        level: "warn",
        message: "Km geçmişinde raporlanan km'den büyük ya da azalan bir kayıt var.",
        details: sorted.map((k) => `${k.date} — ${k.km.toLocaleString("tr-TR")} km`),
      });
    } else if (reportKm !== null) {
      signals.push({
        code: "km_tutarli",
        level: "ok",
        message: "Km geçmişi rapordaki km ile tutarlı görünüyor.",
        details: [],
      });
    } else {
      // Rapordaki güncel km okunamadı: yalnız geçmişin kendi içindeki sırası denetlenebildi.
      signals.push({
        code: "km_tutarli",
        level: "info",
        message: "Km geçmişi kendi içinde tutarlı görünüyor; raporda güncel km okunamadı, karşılaştırma yapılamadı.",
        details: [],
      });
    }
  }

  // Hasar kayıtları ve değişmiş parçalar
  if (e.sectionsPresent.includes("hasar_sorgusu")) {
    const hasChanged = e.items.some((i) => CHANGED_KINDS.has(i.statusKind));
    const hasRecords = e.damageRecords.length > 0;
    if (hasRecords && hasChanged) {
      signals.push({
        code: "hasar_parca_uyumlu",
        level: "ok",
        message: "Hasar kayıtları ile değişen veya boyalı parçalar birbirini destekliyor.",
        details: e.damageRecords.map((r) =>
          [
            r.date ?? "tarih yok",
            r.cause ?? "neden yok",
            r.amountTry === null ? "tutar yok" : formatTry(r.amountTry),
          ].join(" — "),
        ),
      });
    } else if (hasRecords) {
      signals.push({
        code: "hasar_parca_uyumsuz",
        level: "warn",
        message: "Hasar kaydı var ama raporda değişen veya boyalı parça görünmüyor.",
        details: [],
      });
    } else if (hasChanged) {
      signals.push({
        code: "degisen_var_hasar_yok",
        level: "info",
        message: "Raporda değişen veya boyalı parça var ama hasar kaydı yok.",
        details: [],
      });
    }
  }

  // OBD özeti ile ham çıktı
  const faultySystems = new Set(e.obd.rawFaults.map((f) => f.system));
  const conflicting: string[] = [];
  for (const row of e.obd.summary) {
    if (!row.hasFault && faultySystems.has(row.system) && !conflicting.includes(row.system)) {
      conflicting.push(row.system);
    }
  }
  if (conflicting.length > 0) {
    signals.push({
      code: "obd_ozet_celiski",
      level: "warn",
      message: "OBD özetinde arızasız görünen sistemde ham çıktıda arıza kodu var.",
      details: conflicting,
    });
  }

  // Eksik bölümler
  const missing = CORE_SECTIONS.filter((s) => !e.sectionsPresent.includes(s));
  if (missing.length > 0) {
    signals.push({
      code: "eksik_bolum",
      level: "info",
      message: "Raporun bazı ana bölümleri yüklenmemiş, o bölümler hakkında yorum yapılamaz.",
      details: missing,
    });
  }

  if (e.report.onlineReportQrPresent) {
    signals.push({
      code: "qr_var",
      level: "info",
      message: "Raporda çevrimiçi rapor QR kodu var, firmanın sitesinden karşılaştırabilirsiniz.",
      details: [],
    });
  }

  return signals;
}
