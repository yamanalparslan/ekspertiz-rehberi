import { RawExtractionSchema, type RawExtraction } from "@/lib/schema/extraction";
import { runStructured, type ClaudeLike, type ContentBlockParam } from "./client";
import { EXTRACTION_SYSTEM, EXTRACTION_USER } from "./prompts";

export type UploadFile = {
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
};

export function buildContent(files: UploadFile[]): ContentBlockParam[] {
  const blocks: ContentBlockParam[] = files.map((f) => {
    const data = Buffer.from(f.bytes).toString("base64");
    return f.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: f.mediaType, data } };
  });
  blocks.push({ type: "text", text: EXTRACTION_USER });
  return blocks;
}

export async function extractReport(
  client: ClaudeLike,
  files: UploadFile[],
): Promise<{ raw: RawExtraction; usd: number }> {
  const { data, usd } = await runStructured(client, {
    system: EXTRACTION_SYSTEM,
    content: buildContent(files),
    schema: RawExtractionSchema,
    effort: "medium",
    maxTokens: 32000,
  });
  return { raw: data, usd };
}
