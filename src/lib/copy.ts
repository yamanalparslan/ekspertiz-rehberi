/** Arayüzdeki sabit Türkçe metinler. Değerler spesifikasyondan harfiyen alınmıştır. */

import type { ErrorCode } from "@/lib/schema/events";

export const DISCLAIMER =
  "Bu analiz yapay zekayla hazırlanmış, bilgilendirme amaçlı bir yorumdur. Ekspertiz raporunun veya bir uzmanın görüşünün yerine geçmez. Fiyatlar tahminidir ve değişebilir. Satın alma kararı ve bu karardan doğan tüm sorumluluk kullanıcıya aittir.";

export const CONSENT_DISCLAIMER = "Sorumluluk notunu okudum ve kabul ediyorum.";

export const CONSENT_TRANSFER =
  "Raporumun analiz için yurt dışındaki bir yapay zeka hizmetine aktarılmasını kabul ediyorum.";

export const CONSULT_EXPERT = "Bir ustaya veya ekspertize danışın.";

export const CAP_REACHED = "Bugünlük kapasite doldu, yarın tekrar deneyin.";

export const NOT_REPORT = "Bu dosya bir ekspertiz raporu gibi görünmüyor.";

export const REINTERPRET_USED = "Bu analiz için düzeltme hakkı kullanıldı.";

export const PRICE_MISSING = "Fiyat bilgisi henüz yok.";

export const GENERAL_UNVERIFIED = "genel bilgi, doğrulanmamış";

/**
 * Sunucunun göndermediği, tarayıcıda anlaşılan hatalar: bağlantı kopması, çevrimdışı olmak,
 * olay gövdesi taşımayan HTTP durumları (413, 429, 5xx / ağ geçidi zaman aşımı) ve uzun süre
 * hiç olay gelmemesi. Akış şemasına (ErrorCodeSchema) girmezler.
 */
export type ClientErrorCode =
  | "network"
  | "offline"
  | "upload_too_large"
  | "rate_limited"
  | "server_unavailable"
  | "stalled";

/** Ekranda gösterilebilen her hata kodu. */
export type DisplayErrorCode = ErrorCode | ClientErrorCode;

/** Her `error` olayının mesajı buradan gelir; ham hata metni istemciye gitmez. */
export const ERROR_MESSAGES: Record<DisplayErrorCode, string> = {
  cap_reached: CAP_REACHED,
  not_report: NOT_REPORT,
  reinterpret_used: REINTERPRET_USED,
  refusal: "Yapay zeka bu raporu işleyemedi. Lütfen tekrar deneyin.",
  truncated: "Analiz yarıda kesildi. Lütfen tekrar deneyin.",
  invalid_output: "Analiz sonucu okunamadı. Lütfen tekrar deneyin.",
  upload_invalid: "Dosyalar uygun değil: en fazla 25 görsel veya 1 PDF, toplam 20 MB.",
  token_invalid: "Analizin süresi doldu. Lütfen raporu yeniden yükleyin.",
  request_invalid: "Düzeltme bilgisi geçersiz. Lütfen araç bilgisini yeniden girip tekrar deneyin.",
  vehicle_invalid: "Araç bilgisi geçersiz. Lütfen değerleri kontrol edin.",
  internal: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
  network: "Bağlantı koptu. İnternet bağlantınızı kontrol edip tekrar deneyin.",
  offline: "İnternet bağlantısı yok. Bağlantı gelince tekrar deneyin.",
  upload_too_large:
    "Dosyalar çok büyük: toplam en fazla 20 MB gönderilebilir. Daha az sayfa seçin ya da büyük PDF yerine sayfaların fotoğrafını yükleyin.",
  rate_limited: "Kısa sürede çok fazla istek gönderildi. Bir dakika bekleyip tekrar deneyin.",
  server_unavailable: "Sunucu şu an yanıt vermiyor. Birkaç dakika sonra tekrar deneyin.",
  stalled: "Sunucudan uzun süredir yanıt gelmedi. Bağlantınızı kontrol edip tekrar deneyin.",
};

/** Yapılandırılmış yapay zeka sağlayıcısı (sunucu ortamından; anahtar değil, yalnız ad). */
export type ProviderId = "claude" | "gemini" | "demo";

/**
 * Açık rıza kutusunun altındaki satır: raporun gerçekte hangi hizmete gönderildiği.
 * `CONSENT_TRANSFER` metni değişmez; bu satır onu tamamlar.
 */
export const PROVIDER_NOTES: Record<ProviderId | "none", string> = {
  claude: "Analizi Anthropic şirketinin Claude yapay zekası yapar. Rapor fotoğraflarınız ya da PDF'iniz bu hizmete gönderilir.",
  gemini: "Analizi Google şirketinin Gemini yapay zekası yapar. Rapor fotoğraflarınız ya da PDF'iniz bu hizmete gönderilir.",
  demo: "Geliştirme demosu: dosyalarınız hiçbir yapay zeka hizmetine gönderilmez.",
  none: "Yapay zeka hizmeti henüz ayarlanmadı; analiz şu an yapılamaz.",
};

export const INTERNET_SOURCED = "internet kaynaklı";

export const SINGLE_SOURCE = "tek kaynak";

export const STAGES = {
  okuma: "Rapor okunuyor",
  arac: "Araç bilgileri bulundu",
  yorumlama: "Maddeler yorumlanıyor",
} as const;
