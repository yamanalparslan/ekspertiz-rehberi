import { z } from "zod";
import { RawExtractionSchema } from "@/lib/schema/extraction";
import { GroupSchema } from "@/lib/schema/interpretation";

export const SignalCodeSchema = z.enum([
  "rapor_eski",
  "km_tutarli",
  "km_dusus",
  "hasar_parca_uyumlu",
  "hasar_parca_uyumsuz",
  "degisen_var_hasar_yok",
  "obd_ozet_celiski",
  "eksik_bolum",
  "mor_isik_celiski",
  "qr_var",
  "firma_dogrulama",
  "pdf_duzenleyici",
  "pdf_sonradan_degistirilmis",
]);
export type SignalCode = z.infer<typeof SignalCodeSchema>;

export const SignalSchema = z.strictObject({
  code: SignalCodeSchema,
  level: z.enum(["ok", "info", "warn"]),
  message: z.string(),
  details: z.array(z.string()),
});
export type Signal = z.infer<typeof SignalSchema>;

const SourceSchema = z.strictObject({ url: z.string(), title: z.string() });

export const ResultItemSchema = z.strictObject({
  itemId: z.string(),
  group: GroupSchema,
  floorApplied: z.boolean(),
  title: z.string(),
  meaning: z.string(),
  whyItMatters: z.string(),
  askSeller: z.string().nullable(),
  cost: z
    .strictObject({
      minTry: z.number(),
      maxTry: z.number(),
      partType: z.string(),
      laborIncluded: z.boolean().nullable(),
      source: SourceSchema,
      asOf: z.string(),
      stale: z.boolean(),
    })
    .nullable(),
  chronic: z
    .strictObject({
      issueId: z.string(),
      confidence: z.enum(["yuksek", "dusuk"]),
      sources: z.array(SourceSchema),
    })
    .nullable(),
  generalUnverified: z.boolean(),
});
export type ResultItem = z.infer<typeof ResultItemSchema>;

export const VehicleSchema = RawExtractionSchema.shape.vehicle;
export type Vehicle = z.infer<typeof VehicleSchema>;

export const AnalysisResultSchema = z.strictObject({
  vehicle: VehicleSchema,
  report: z.strictObject({
    firm: z.string().nullable(),
    reportNo: z.string().nullable(),
    date: z.string().nullable(),
  }),
  summary: z.string(),
  counts: z.record(GroupSchema, z.number()),
  items: z.array(ResultItemSchema),
  checkList: z.array(
    z.strictObject({
      title: z.string(),
      why: z.string(),
      chronicIssueId: z.string().nullable(),
    }),
  ),
  signals: z.array(SignalSchema),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
