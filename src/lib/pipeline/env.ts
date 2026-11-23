// Yalnızca sunucu tarafında (route handler) içe aktarılır.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Like } from "@/lib/kb/d1";
import type { D1SpendDb } from "./spend";

export interface ServerEnv {
  /** Üretimde zorunlu: harcama tavanı ve bilgi tabanı D1'dedir. */
  DB?: D1Like & D1SpendDb;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  /** Gemini yolu: birincil model (varsayılan GEMINI_DEFAULT_MODEL). */
  GEMINI_MODEL?: string;
  /** Gemini yolu: en fazla bir yedek model; "none" yedeği kapatır. */
  GEMINI_FALLBACK_MODEL?: string;
  /** Gemini yolu: modelin çıktı token sınırı (varsayılan 65536). */
  GEMINI_MAX_OUTPUT_TOKENS?: string;
  EXTRACTION_HMAC_SECRET?: string;
  DAILY_SPEND_CAP_USD?: string;
  /** Yalnız geliştirme: "1" ise ağ çağrısı yapmayan çevrimdışı demo kullanılır. */
  OFFLINE_DEMO?: string;
  /** Yalnız geliştirme: demonun tanıdığı PDF'lerin SHA-256 özetleri (virgülle ayrılmış). */
  OFFLINE_DEMO_PDF_SHA256?: string;
}

export function getServerEnv(): ServerEnv {
  return getCloudflareContext().env as unknown as ServerEnv;
}
