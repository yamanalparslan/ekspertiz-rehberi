export type Threshold = { value: number | null; source: string };

export type Thresholds = {
  brakeImbalanceMaxPct: Threshold;
  suspensionGripMinPct: Threshold;
  sideSlipMaxAbsMPerKm: Threshold;
};

const PRINTED_SOURCE = "Rapor üzerinde basılı sınır (Yavuzlar Oto Ekspertiz, 2026)";

// Yanal kayma (m/km) için TÜVTÜRK/mevzuat kaynağında sayı bulunamadı
// (alomaliye.com araç muayene Ek-2 metni yalnızca nitel ifade içerir).
// Bu yüzden değer null: bu ölçüm için kural yalnızca raporda basılı sınırla çalışır.
export const DEFAULT_THRESHOLDS: Thresholds = {
  brakeImbalanceMaxPct: { value: 30, source: PRINTED_SOURCE },
  suspensionGripMinPct: { value: 40, source: PRINTED_SOURCE },
  sideSlipMaxAbsMPerKm: { value: null, source: "bulunamadı" },
};
