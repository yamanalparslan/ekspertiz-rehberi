import { z } from "zod";
import { VehicleInferredSchema } from "@/lib/schema/extraction";
import { AnalysisResultSchema, VehicleSchema } from "@/lib/schema/result";

export const ErrorCodeSchema = z.enum([
  "cap_reached",
  "not_report",
  "refusal",
  "truncated",
  "invalid_output",
  "upload_invalid",
  "token_invalid",
  "reinterpret_used",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

// NDJSON akış olayları.
export const AnalysisEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("stage"),
    stage: z.enum(["okuma", "arac", "yorumlama"]),
  }),
  z.strictObject({
    type: z.literal("vehicle"),
    vehicle: VehicleSchema,
    token: z.string(),
    /** Raporda basılı olmayıp tahmin edilen alanlar ("tahmini" etiketi); yoksa alan yoktur. */
    vehicleInferred: VehicleInferredSchema.optional(),
  }),
  z.strictObject({ type: z.literal("result"), result: AnalysisResultSchema }),
  z.strictObject({ type: z.literal("error"), code: ErrorCodeSchema, message: z.string() }),
]);
export type AnalysisEvent = z.infer<typeof AnalysisEventSchema>;
