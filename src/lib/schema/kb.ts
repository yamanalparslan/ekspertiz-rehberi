import { z } from "zod";

export const SegmentSchema = z.enum(["a_b", "c", "d", "e_premium", "suv"]);
export type Segment = z.infer<typeof SegmentSchema>;

export const SourceSchema = z.strictObject({
  url: z.string(),
  title: z.string(),
  domain: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

export const PriceItemSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  partType: z.enum(["orijinal", "yan_sanayi", "belirtilmemis"]),
  laborIncluded: z.boolean(),
  minTry: z.number(),
  maxTry: z.number(),
  segment: SegmentSchema.nullable(),
  source: SourceSchema,
  asOf: z.string(), // YYYY-MM-DD
});
export type PriceItem = z.infer<typeof PriceItemSchema>;

export const ChronicIssueSchema = z.strictObject({
  id: z.string(),
  system: z.string(),
  title: z.string(),
  description: z.string(),
  symptoms: z.array(z.string()),
  matchKeywords: z.array(z.string()),
  obdCodes: z.array(z.string()),
  engineCodes: z.array(z.string()).nullable(),
  priceItemId: z.string().nullable(),
  sources: z.array(SourceSchema),
  researchedAt: z.string(), // YYYY-MM-DD
});
export type ChronicIssue = z.infer<typeof ChronicIssueSchema>;

export const VehicleKbFileSchema = z.strictObject({
  vehicle: z.strictObject({
    id: z.string(), // slug; equals the JSON file's basename
    brand: z.string(),
    model: z.string(),
    generation: z.string(),
    aliases: z.array(z.string()),
    yearFrom: z.number(),
    yearTo: z.number(),
    engines: z.array(
      z.strictObject({ code: z.string(), cc: z.number(), fuel: z.string() }),
    ),
    segment: SegmentSchema,
  }),
  chronicIssues: z.array(ChronicIssueSchema),
  priceItems: z.array(PriceItemSchema),
});
export type VehicleKbFile = z.infer<typeof VehicleKbFileSchema>;

export const GenericPricesFileSchema = z.strictObject({
  priceItems: z.array(PriceItemSchema),
});
export type GenericPricesFile = z.infer<typeof GenericPricesFileSchema>;

export const FirmsFileSchema = z.strictObject({
  firms: z.array(
    z.strictObject({ name: z.string(), verifyUrl: z.string(), note: z.string() }),
  ),
});
export type FirmsFile = z.infer<typeof FirmsFileSchema>;
