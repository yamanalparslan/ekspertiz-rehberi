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

/** Her `error` olayının mesajı buradan gelir; ham hata metni istemciye gitmez. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
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
};

export const INTERNET_SOURCED = "internet kaynaklı";

export const SINGLE_SOURCE = "tek kaynak";

export const STAGES = {
  okuma: "Rapor okunuyor",
  arac: "Araç bilgileri bulundu",
  yorumlama: "Maddeler yorumlanıyor",
} as const;
