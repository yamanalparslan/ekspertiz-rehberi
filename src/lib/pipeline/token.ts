import { z } from "zod";
import { AnalysisError } from "@/lib/claude/client";
import { ExtractionSchema, type Extraction } from "@/lib/schema/extraction";
import { SignalSchema, type Signal } from "@/lib/schema/result";

const TTL_MS = 60 * 60 * 1000;

const PayloadSchema = z.object({
  v: z.literal(1),
  exp: z.number(),
  extraction: ExtractionSchema,
  reinterpretsLeft: z.union([z.literal(0), z.literal(1)]),
  carriedSignals: z.array(SignalSchema),
});

export type TokenPayload = {
  extraction: Extraction;
  reinterpretsLeft: 0 | 1;
  carriedSignals: Signal[];
};

const enc = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad base64url");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    usage,
  ]);
}

export async function signExtraction(p: TokenPayload, secret: string, now: Date): Promise<string> {
  const body = toB64Url(
    enc.encode(JSON.stringify({ v: 1, exp: now.getTime() + TTL_MS, ...p })),
  );
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body));
  return `${body}.${toB64Url(new Uint8Array(mac))}`;
}

export async function verifyExtraction(
  token: string,
  secret: string,
  now: Date,
): Promise<TokenPayload> {
  const invalid = (cause?: unknown) =>
    new AnalysisError("token_invalid", 0, "invalid token", { cause });
  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw invalid();
    const [body, mac] = parts;
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      fromB64Url(mac),
      enc.encode(body),
    );
    if (!ok) throw invalid();
    const payload = PayloadSchema.parse(JSON.parse(new TextDecoder().decode(fromB64Url(body))));
    if (payload.exp < now.getTime()) throw invalid();
    return {
      extraction: payload.extraction,
      reinterpretsLeft: payload.reinterpretsLeft,
      carriedSignals: payload.carriedSignals,
    };
  } catch (e) {
    throw e instanceof AnalysisError ? e : invalid(e);
  }
}
