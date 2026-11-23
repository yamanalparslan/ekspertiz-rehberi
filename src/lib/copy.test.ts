import { describe, expect, test } from "vitest";
import { DISCLAIMER, CONSENT_TRANSFER, STAGES } from "@/lib/copy";

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
