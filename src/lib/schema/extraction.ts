import { z } from "zod";

// Claude'un yapılandırılmış çıktısı için şema. Bütün nesneler strictObject
// (additionalProperties: false) ve sayı/uzunluk kısıtı yoktur. Plaka, şasi
// numarası ve kişi alanı bilerek yoktur.

export const SectionSchema = z.enum([
  "kaporta_boya",
  "mor_isik",
  "sasi",
  "ust_motor",
  "motor_alt_mekanik",
  "ic_dis_donanim",
  "conta_kacak",
  "airbag",
  "obd",
  "test_hatti",
  "km_sorgusu",
  "hasar_sorgusu",
  "diger",
]);
export type Section = z.infer<typeof SectionSchema>;

export const StatusKindSchema = z.enum([
  "orijinal",
  "saglam",
  "orijinalinde_yok",
  "lokal_boyali",
  "boyali",
  "tadilat_boyali",
  "degisen",
  "sokulup_takilmis",
  "deforme",
  "asinmis",
  "terleme",
  "sizinti",
  "zayif",
  "bakim_onerilir",
  "degisim_gerekli",
  "ariza",
  "calisiyor",
  "kontrol_onerilir",
  "diger",
]);
export type StatusKind = z.infer<typeof StatusKindSchema>;

export const ObdSystemSchema = z.enum([
  "motor",
  "sanziman",
  "fren",
  "airbag",
  "klima",
  "direksiyon",
  "multimedya",
  "govde_elektronik",
  "surus_destek",
  "gosterge",
  "diger",
]);
export type ObdSystem = z.infer<typeof ObdSystemSchema>;

export const MeasurementTestSchema = z.enum([
  "fren_sapma_on",
  "fren_sapma_arka",
  "el_freni_sapma",
  "yanal_kayma_on",
  "yanal_kayma_arka",
  "suspansiyon_tutunma",
  "dinamometre_guc",
]);
export type MeasurementTest = z.infer<typeof MeasurementTestSchema>;

export const RawExtractionSchema = z.strictObject({
  isReport: z.boolean(),
  notReportReason: z.string().nullable(),
  vehicle: z.strictObject({
    brand: z.string().nullable(),
    model: z.string().nullable(),
    variant: z.string().nullable(),
    year: z.number().nullable(),
    engineCc: z.number().nullable(),
    powerHp: z.number().nullable(),
    fuel: z.enum(["benzin", "dizel", "lpg", "hibrit", "elektrik"]).nullable(),
    transmission: z.enum(["manuel", "otomatik", "yari_otomatik"]).nullable(),
    km: z.number().nullable(),
  }),
  report: z.strictObject({
    firm: z.string().nullable(),
    reportNo: z.string().nullable(),
    date: z.string().nullable(), // YYYY-MM-DD
    package: z.string().nullable(),
    platform: z.string().nullable(),
    onlineReportQrPresent: z.boolean(),
  }),
  sectionsPresent: z.array(SectionSchema),
  items: z.array(
    z.strictObject({
      section: SectionSchema,
      part: z.string(),
      rawStatus: z.string(),
      statusKind: StatusKindSchema,
      note: z.string().nullable(),
    }),
  ),
  measurements: z.array(
    z.strictObject({
      test: MeasurementTestSchema,
      position: z.string().nullable(),
      value: z.number().nullable(),
      unit: z.string().nullable(),
      performed: z.boolean(),
      printedPassMin: z.number().nullable(),
      printedPassMax: z.number().nullable(),
    }),
  ),
  obd: z.strictObject({
    summary: z.array(
      z.strictObject({
        system: ObdSystemSchema,
        unitName: z.string(),
        hasFault: z.boolean(),
      }),
    ),
    rawFaults: z.array(
      z.strictObject({
        system: ObdSystemSchema,
        unitName: z.string(),
        code: z.string(),
        description: z.string(),
        type: z.enum(["intermittent", "permanent", "unknown"]),
      }),
    ),
  }),
  kmHistory: z.array(z.strictObject({ date: z.string(), km: z.number() })),
  damageRecords: z.array(
    z.strictObject({
      date: z.string().nullable(),
      cause: z.string().nullable(),
      amountTry: z.number().nullable(),
    }),
  ),
  expertNotes: z.array(z.string()),
  unreadable: z.array(z.string()),
});
export type RawExtraction = z.infer<typeof RawExtractionSchema>;

// Normalleştirilmiş çıktı: her madde, ölçüm ve ham arıza kaydına kimlik eklenir.
const withId = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject({ id: z.string(), ...shape });

export const ExtractionSchema = z.strictObject({
  ...RawExtractionSchema.shape,
  items: z.array(withId(RawExtractionSchema.shape.items.element.shape)),
  measurements: z.array(withId(RawExtractionSchema.shape.measurements.element.shape)),
  obd: z.strictObject({
    summary: RawExtractionSchema.shape.obd.shape.summary,
    rawFaults: z.array(withId(RawExtractionSchema.shape.obd.shape.rawFaults.element.shape)),
  }),
});
export type Extraction = z.infer<typeof ExtractionSchema>;
