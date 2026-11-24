import type { ObdSystem, Section } from "@/lib/schema/extraction";
import type { Group } from "@/lib/schema/interpretation";
import type { ResultItem, Signal, Vehicle } from "@/lib/schema/result";

/** Sonuç ekranındaki grup sırası: en ciddiden en hafife. */
export const GROUP_ORDER: readonly Group[] = ["dikkat", "kronik", "belirsiz", "normal"];

export const GROUP_LABELS: Record<Group, string> = {
  dikkat: "Dikkat",
  kronik: "Kronik",
  belirsiz: "Belirsiz",
  normal: "Normal",
};

/** Grup tanımları (spesifikasyon §8), sade dille. */
export const GROUP_NOTES: Record<Group, string> = {
  dikkat: "Güvenlik riski veya yüksek maliyet ihtimali var.",
  kronik: "Bu model için bilinen bir sorun ve raporda belirtisi var.",
  belirsiz: "Bilgi yetersiz, okunamıyor ya da yorum için uzman gerekiyor.",
  normal: "Aracın yaşı ve kilometresi için beklenen durum.",
};

export const FUEL_LABELS: Record<NonNullable<Vehicle["fuel"]>, string> = {
  benzin: "Benzin",
  dizel: "Dizel",
  lpg: "LPG",
  hibrit: "Hibrit",
  elektrik: "Elektrik",
};

export const TRANSMISSION_LABELS: Record<NonNullable<Vehicle["transmission"]>, string> = {
  manuel: "Manuel",
  otomatik: "Otomatik",
  yari_otomatik: "Yarı otomatik",
};

const PART_TYPE_LABELS: Record<string, string> = {
  orijinal: "orijinal parça",
  yan_sanayi: "yan sanayi",
  belirtilmemis: "parça tipi belirtilmemiş",
};

const SECTION_LABELS: Record<Section, string> = {
  kaporta_boya: "Kaporta-boya",
  mor_isik: "Mor ışık",
  sasi: "Şasi",
  ust_motor: "Üst motor",
  motor_alt_mekanik: "Motor altı ve mekanik",
  ic_dis_donanim: "İç ve dış donanım",
  conta_kacak: "Conta kaçak testi",
  airbag: "Airbag",
  obd: "Arıza tespit (OBD)",
  test_hatti: "Test hattı (fren, süspansiyon, yanal kayma)",
  km_sorgusu: "Km sorgusu",
  hasar_sorgusu: "Hasar kaydı sorgusu",
  diger: "Diğer",
};

const OBD_SYSTEM_LABELS: Record<ObdSystem, string> = {
  motor: "Motor",
  sanziman: "Şanzıman",
  fren: "Fren",
  airbag: "Airbag",
  klima: "Klima",
  direksiyon: "Direksiyon",
  multimedya: "Multimedya",
  govde_elektronik: "Gövde elektroniği",
  surus_destek: "Sürüş destek sistemleri",
  gosterge: "Gösterge paneli",
  diger: "Diğer",
};

export const formatTry = (n: number): string => n.toLocaleString("tr-TR");

export const formatKm = (km: number): string => `${km.toLocaleString("tr-TR")} km`;

/**
 * Motor hacmi. Basılı değer olduğu gibi ("1597 cc"); tahmini değer kesin bir cc gibi
 * görünmesin diye litre olarak, yaklaşık işaretiyle ("~1.6 L"; araç adlarındaki gibi noktalı).
 */
export function engineText(cc: number, inferred: boolean): string {
  return inferred ? `~${(Math.round(cc / 100) / 10).toFixed(1)} L` : `${cc} cc`;
}

/** Motor gücü; tahminiyse yaklaşık işaretiyle ("~170 HP"). */
export const powerText = (hp: number, inferred: boolean): string => `${inferred ? "~" : ""}${hp} HP`;

/** "2026-11-23" -> "23.11.2026"; başka biçimdeki metni olduğu gibi bırakır. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

const DATE_TIME = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : DATE_TIME.format(new Date(t));
}

export type CostLine = {
  range: string;
  partType: string;
  labor: string;
  asOf: string;
  stale: string | null;
};

export function costLine(cost: NonNullable<ResultItem["cost"]>): CostLine {
  const range =
    cost.minTry === cost.maxTry
      ? `${formatTry(cost.minTry)} TL`
      : `${formatTry(cost.minTry)}–${formatTry(cost.maxTry)} TL`;
  const labor =
    cost.laborIncluded === null
      ? "işçilik bilgisi belirtilmemiş"
      : cost.laborIncluded
        ? "işçilik dahil"
        : "işçilik hariç";
  return {
    range,
    partType: PART_TYPE_LABELS[cost.partType] ?? PART_TYPE_LABELS.belirtilmemis,
    labor,
    asOf: `Fiyat tarihi: ${formatDate(cost.asOf)}`,
    stale: cost.stale ? "güncel olmayabilir" : null,
  };
}

export function vehicleTitle(v: Vehicle): string {
  const parts = [v.year, v.brand, v.model, v.variant].filter(
    (p): p is string | number => p !== null && String(p).trim() !== "",
  );
  return parts.length > 0 ? parts.join(" ") : "Araç bilgisi okunamadı";
}

/** İşaret ayrıntılarını kullanıcıya gösterilecek metne çevirir. Bağlantılar ayrı gösterilir. */
export function signalDetails(signal: Signal): string[] {
  switch (signal.code) {
    case "eksik_bolum":
      return signal.details.map((d) => SECTION_LABELS[d as Section] ?? d);
    case "obd_ozet_celiski":
      return signal.details.map((d) => OBD_SYSTEM_LABELS[d as ObdSystem] ?? d);
    case "rapor_eski":
      return signal.details.map((d) => `Rapor tarihi: ${formatDate(d)}`);
    case "pdf_sonradan_degistirilmis": {
      const [created, modified] = signal.details;
      return [
        created ? `Oluşturulma: ${formatDateTime(created)}` : null,
        modified ? `Değiştirilme: ${formatDateTime(modified)}` : null,
      ].filter((d): d is string => d !== null);
    }
    case "firma_dogrulama":
    case "qr_var":
      return [];
    default:
      return signal.details;
  }
}
