import { describe, expect, test } from "vitest";
import { DISCLAIMER, CONSENT_TRANSFER, ERROR_MESSAGES, STAGES } from "@/lib/copy";
import { ErrorCodeSchema } from "@/lib/schema/events";

test("her hata kodunun Türkçe metni var; düzeltme isteği ve araç bilgisi hataları ayrı", () => {
  for (const code of ErrorCodeSchema.options) expect(ERROR_MESSAGES[code], code).toMatch(/\S/);
  expect(ERROR_MESSAGES.vehicle_invalid).toBe("Araç bilgisi geçersiz. Lütfen değerleri kontrol edin.");
  expect(ERROR_MESSAGES.request_invalid).toMatch(/^Düzeltme bilgisi geçersiz\./);
  expect(ERROR_MESSAGES.request_invalid).not.toBe(ERROR_MESSAGES.internal);
});

describe("copy", () => {
  test("sabit metinler spesifikasyondaki gibi", () => {
    expect(DISCLAIMER).toMatch(/^Bu analiz yapay zekayla hazırlanmış/);
    expect(DISCLAIMER).toMatch(/tüm sorumluluk kullanıcıya aittir\.$/);
    expect(CONSENT_TRANSFER).toContain("yurt dışındaki bir yapay zeka hizmetine");
    expect(STAGES).toEqual({
      okuma: "Rapor okunuyor",
      arac: "Araç bilgileri bulundu",
      yorumlama: "Maddeler yorumlanıyor",
    });
  });
});
