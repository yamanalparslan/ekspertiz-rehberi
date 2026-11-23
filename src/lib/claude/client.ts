import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ZodType } from "zod";
import type { ErrorCode } from "@/lib/schema/events";
import { usageToUsd } from "./cost";

export const MODEL = "claude-opus-5-5";
const BETAS: ["server-side-fallback-2026-07-01"] = ["server-side-fallback-2026-07-01"];

export type ClaudeLike = Pick<Anthropic, "beta">;
export type ContentBlockParam = BetaContentBlockParam;

export function createClaude(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export class AnalysisError extends Error {
  readonly code: ErrorCode;
  /** O ana kadar harcanan tutar (USD); bilinmiyorsa 0. */
  readonly usd: number;
  constructor(code: ErrorCode, usd: number, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = "AnalysisError";
    this.code = code;
    this.usd = usd;
  }
}

export async function runStructured<T>(
  client: ClaudeLike,
  p: {
    system: string;
    content: ContentBlockParam[];
    schema: ZodType<T>;
    effort: "medium" | "high";
    maxTokens: number;
  },
): Promise<{ data: T; usd: number }> {
  let msg;
  try {
    msg = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: p.maxTokens,
        betas: BETAS,
        fallbacks: "default",
        system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: p.content }],
        output_config: { effort: p.effort, format: betaZodOutputFormat(p.schema) },
      })
      .finalMessage();
  } catch (e) {
    throw new AnalysisError("internal", 0, "claude call failed", { cause: e });
  }

  const usd = usageToUsd(msg.usage);
  if (msg.stop_reason === "refusal") throw new AnalysisError("refusal", usd);
  if (msg.stop_reason === "max_tokens") throw new AnalysisError("truncated", usd);

  // Yedek modelde yanıt birden çok blok içerebilir: son metin bloğu geçerlidir.
  let text: string | undefined;
  for (const b of msg.content) if (b.type === "text") text = b.text;
  if (text === undefined) throw new AnalysisError("invalid_output", usd, "no text block");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new AnalysisError("invalid_output", usd, "invalid JSON", { cause: e });
  }
  const parsed = p.schema.safeParse(json);
  if (!parsed.success) {
    throw new AnalysisError("invalid_output", usd, "schema mismatch", { cause: parsed.error });
  }
  return { data: parsed.data, usd };
}
