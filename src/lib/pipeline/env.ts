// Yalnızca sunucu tarafında (route handler) içe aktarılır.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Like } from "@/lib/kb/d1";
import type { D1SpendDb } from "./spend";

export interface ServerEnv {
  DB: D1Like & D1SpendDb;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  EXTRACTION_HMAC_SECRET?: string;
  DAILY_SPEND_CAP_USD?: string;
}

export function getServerEnv(): ServerEnv {
  return getCloudflareContext().env as unknown as ServerEnv;
}
