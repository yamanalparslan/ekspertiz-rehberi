import { z } from "zod";

// Ciddiyet sırası: normal < belirsiz < kronik < dikkat.
export const GroupSchema = z.enum(["normal", "belirsiz", "kronik", "dikkat"]);
export type Group = z.infer<typeof GroupSchema>;

// Fiyat rakamı şemada yoktur: model yalnızca bilgi tabanındaki bir priceItemId seçer.
export const InterpretationSchema = z.strictObject({
  summary: z.string(),
  items: z.array(
    z.strictObject({
      itemId: z.string(),
      group: GroupSchema,
      title: z.string(),
      meaning: z.string(),
      whyItMatters: z.string(),
      askSeller: z.string().nullable(),
      priceItemId: z.string().nullable(),
      priceNeed: z.string().nullable(),
      chronicIssueId: z.string().nullable(),
      generalUnverified: z.boolean(),
    }),
  ),
  checkList: z.array(
    z.strictObject({
      title: z.string(),
      why: z.string(),
      chronicIssueId: z.string().nullable(),
    }),
  ),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;
