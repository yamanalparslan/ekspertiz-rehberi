import { describe, expect, test } from "vitest";
import { normalizeExtraction } from "@/lib/normalize";
import { computeFloors } from "@/lib/rules/floors";
import { RawExtractionSchema } from "@/lib/schema/extraction";
import { InterpretationSchema } from "@/lib/schema/interpretation";
import { coerceGeminiJson, coerceGroup, inferObdSystem, inferSection, inferStatusKind } from "./gemini-coerce";

const CLEAN = new Set(["orijinal", "saglam", "orijinalinde_yok", "calisiyor"]);

describe("statusKind kutupluluk tablosu (modelin statusKind'i yok ya da geçersiz)", () => {
  // [parça, ham durum, beklenen]; "temiz-degil" = temiz bir duruma (saglam/orijinal/
  // orijinalinde_yok/calisiyor) asla dönüşmemeli.
  const rows: [string, string, string][] = [
    ["Şasi düzgün mü?", "Hayır", "temiz-degil"],
    ["Airbag sistemi çalışıyor mu?", "Hayır", "temiz-degil"],
    ["Sürücü hava yastığı", "Yok", "temiz-degil"],
    ["Motor", "İyi değil", "temiz-degil"],
    ["Conta kaçak var mı?", "Evet", "temiz-degil"],
    ["Kaçak testi yapıldı mı?", "Hayır", "temiz-degil"],
    ["Fren lambası yanıyor mu?", "Hayır", "temiz-degil"],
    ["Airbag mevcut mu?", "Hayır", "temiz-degil"],
    ["Sunroof", "Yok", "temiz-degil"],
    ["Yağ sızdırmazlığı", "Hayır", "temiz-degil"],
    ["Bakım kaydı", "Yok", "temiz-degil"],
    ["Motor", "İyi: değişim gerekli", "temiz-degil"],
    ["Ağır işlem var mı?", "Hayır", "saglam"],
    ["Ağır işlemli mi?", "Hayır", "saglam"],
    ["Arıza lambası yanıyor mu?", "Hayır", "saglam"],
    ["Conta kaçak var mı?", "Hayır", "saglam"],
    ["Rot-balans ayarı gerekli mi?", "Hayır", "saglam"],
    ["Debriyaj", "İyi", "saglam"],
    ["Akü Durumu (%)", "İyi : %80", "saglam"],
    ["Antifiriz Derecesi", "İyi : -30 °C", "saglam"],
    ["Conta Kaçak Testi", "Sorunsuz (Yapıldı)", "saglam"],
    ["Ön Kaput", "Orijinal : 70-90 µ (mikron)", "orijinal"],
    ["Sol Arka Çamurluk", "Orijinal, Ezik Mevcut : 70-90 µ", "deforme"],
    ["Airbag Usta Kanaati", "Airbag paketi müşteri tarafından seçilmedi", "kontrol_onerilir"],
    ["Rot-Balans Gerekli Mi?", "Evet (Gerekli)", "bakim_onerilir"],
    ["Sağ Ön Kapı", "Bilinmeyen ifade", "diger"],
  ];

  for (const kind of ["", "ok", "good", "DİĞER"]) {
    test.each(rows)(`statusKind=${JSON.stringify(kind)}: %s = %s -> %s`, (part, raw, want) => {
      const got = inferStatusKind(kind, raw, part);
      if (want === "temiz-degil") expect(CLEAN.has(got), got).toBe(false);
      else expect(got).toBe(want);
    });
  }
});

describe("model geçerli ama temiz bir statusKind verse de çıplak evet/hayır/yok kutuplulukla denetlenir", () => {
  test.each([
    ["Şasi düzgün mü?", "Hayır", "saglam"],
    ["Airbag sistemi çalışıyor mu?", "Hayır", "calisiyor"],
    ["Sürücü hava yastığı", "Yok", "orijinalinde_yok"],
    ["Conta kaçak var mı?", "Evet", "saglam"],
    ["Motor", "İyi değil", "saglam"],
  ])("%s = %s (model: %s) temiz kalmaz", (part, raw, kind) => {
    expect(CLEAN.has(inferStatusKind(kind, raw, part))).toBe(false);
  });

  test("olumsuz soruya Hayır ve açık ifadeler geçerli temiz durumu korur", () => {
    expect(inferStatusKind("saglam", "Hayır", "Ağır işlem var mı?")).toBe("saglam");
    expect(inferStatusKind("orijinal", "Orijinal", "Tavan")).toBe("orijinal");
    expect(inferStatusKind("boyali", "Boyalı", "Tavan")).toBe("boyali");
    expect(inferStatusKind("saglam", "Sorunsuz", "Conta")).toBe("saglam");
  });
});

describe("'-sız/-siz/-suz' kelimeleri sorun öznesi değildir (boş, diger ve saglam model etiketi)", () => {
  const rows: [string, string][] = [
    ["Hasarsız", "Hayır"],
    ["Kazasız", "Hayır"],
    ["Boyasız", "Hayır"],
    ["Arızasız", "Hayır"],
    ["Sızıntısız", "Yok"],
    ["Şasi hasarsız", "Hayır"],
    ["Hasarsız mı?", "Hayır"],
  ];
  for (const kind of ["", "diger", "saglam"]) {
    test.each(rows)(`statusKind=${JSON.stringify(kind)}: %s = %s temiz olmaz`, (part, raw) => {
      expect(CLEAN.has(inferStatusKind(kind, raw, part))).toBe(false);
    });
  }
});

describe("modelin temiz etiketi ham durumla doğrulanmazsa düşer (Önemli 2)", () => {
  test.each([
    ["Şarj Dinamosu", "Çalışmıyor", "calisiyor"],
    ["Turbo", "Bozuk", "saglam"],
    ["Cam Krikosu", "Hatalı", "saglam"],
    ["Rot Ayarı", "Uygunsuz", "saglam"],
    ["Sağ Ön Şase", "Kaynaklı", "saglam"],
    ["Akü", "İyi (değişim önerilir)", "saglam"],
    ["Sol A Direği", "Değişmiş", "orijinal"],
  ])("%s = %s (model: %s) temiz kalmaz", (part, raw, kind) => {
    expect(CLEAN.has(inferStatusKind(kind, raw, part))).toBe(false);
  });
});

describe("bölüm çıkarımı: bilinmeyen bölüm şasi/airbag tabanını kaybetmez", () => {
  test.each([
    ["Şasi / İç Aksam", "Sağ Ön Şasi Ucu", "sasi"],
    ["Şase", "Ön Panel", "sasi"],
    ["bilinmeyen", "Sol Ön Direk", "sasi"],
    ["diger", "Bagaj Havuzu", "sasi"],
    ["", "Sağ Podye Sacı", "sasi"],
    ["???", "Sol Frangart", "sasi"],
    ["Diğer", "Tavan", "sasi"],
    ["xyz", "Sürücü Hava Yastığı", "airbag"],
    ["xyz", "SRS Modülü", "airbag"],
    ["xyz", "Emniyet Kemeri Fişeği", "airbag"],
    ["Airbag Testi", "Yolcu", "airbag"],
    ["KAPORTA_BOYA", "Ön Kaput", "kaporta_boya"],
    ["Kaporta-Boya", "Ön Kaput", "kaporta_boya"],
    ["kaporta_boya", "Sol Ön Direk", "kaporta_boya"],
    ["xyz", "Ön Tampon", "diger"],
  ])("%s / %s -> %s", (section, part, want) => {
    expect(inferSection(section, part)).toBe(want);
  });
});

describe("OBD sistemi çıkarımı: fren/airbag tabanı korunur", () => {
  test.each([
    ["ABS", "ABS", "fren"],
    ["unknown", "ESP Kontrol Ünitesi", "fren"],
    ["DSC", "", "fren"],
    ["", "Fren Elektroniği", "fren"],
    ["Airbag", "", "airbag"],
    ["", "SRS Airbag ACSM", "airbag"],
    ["", "Hava Yastığı Elektroniği", "airbag"],
    ["motor", "DME", "motor"],
    ["MOTOR", "", "motor"],
    ["xyz", "Radyo", "multimedya"],
    ["xyz", "Bilinmeyen", "diger"],
  ])("%s / %s -> %s", (system, unit, want) => {
    expect(inferObdSystem(system, unit)).toBe(want);
  });
});

test("grup büyük/küçük harften bağımsız; bilinmeyen ya da eksik grup dikkat olur", () => {
  expect(coerceGroup("Dikkat")).toBe("dikkat");
  expect(coerceGroup("KRONİK")).toBe("kronik");
  expect(coerceGroup(" Normal ")).toBe("normal");
  expect(coerceGroup("belirsiz")).toBe("belirsiz");
  expect(coerceGroup("attention")).toBe("dikkat");
  expect(coerceGroup(undefined)).toBe("dikkat");
  expect(coerceGroup(3)).toBe("dikkat");
});

const rawBase = {
  notReportReason: null,
  vehicle: { brand: "Kia", model: "Picanto" },
  report: { onlineReportQrPresent: "false" },
  sectionsPresent: ["sasi", "Airbag"],
  items: [],
  measurements: [],
  obd: { summary: [], rawFaults: [] },
};

test("isReport eksik ya da bozuksa false olur (rapor olmayan dosya faturalanmaz/yorumlanmaz)", () => {
  const parse = (o: object) => RawExtractionSchema.parse(coerceGeminiJson(o));
  expect(parse(rawBase).isReport).toBe(false);
  expect(parse({ ...rawBase, isReport: "evet" }).isReport).toBe(false);
  expect(parse({ ...rawBase, isReport: null }).isReport).toBe(false);
  expect(parse({ ...rawBase, isReport: "false" }).isReport).toBe(false);
  expect(parse({ ...rawBase, isReport: true }).isReport).toBe(true);
  expect(parse({ ...rawBase, isReport: "true" }).isReport).toBe(true);
});

test("hasFault, performed ve QR alanları katı ayrıştırılır (\"false\" -> false)", () => {
  const out = RawExtractionSchema.parse(
    coerceGeminiJson({
      ...rawBase,
      isReport: true,
      obd: {
        summary: [
          { system: "ABS", unitName: "ABS", hasFault: "false" },
          { system: "motor", unitName: "DME", hasFault: "true" },
          { system: "motor", unitName: "DME", hasFault: true },
        ],
        rawFaults: [],
      },
      measurements: [{ test: "fren_sapma_on", value: 10, performed: "false" }],
    }),
  );
  expect(out.obd.summary.map((s) => s.hasFault)).toEqual([false, true, true]);
  expect(out.obd.summary[0].system).toBe("fren");
  expect(out.measurements[0].performed).toBe(false);
  expect(out.report.onlineReportQrPresent).toBe(false);
});

test("uçtan uca: bilinmeyen bölüm/sistem ve tanınmayan durum taban kurallarına ulaşır", () => {
  const raw = RawExtractionSchema.parse(
    coerceGeminiJson({
      ...rawBase,
      isReport: true,
      items: [
        { section: "Şasi / İç Aksam", part: "Sağ Ön Şasi Ucu", rawStatus: "Kaynaklı", statusKind: "welded" },
        { section: "bilinmeyen", part: "Sol Ön Direk", rawStatus: "Hayır", statusKind: "" },
        { section: "xyz", part: "Sürücü hava yastığı", rawStatus: "Yok" },
        { section: "Şasi / İç Aksam", part: "Şasi düzgün mü?", rawStatus: "Hayır", statusKind: "saglam" },
      ],
      obd: {
        summary: [],
        rawFaults: [
          { system: "ABS", unitName: "ABS", code: "C1234", description: "x", type: "permanent" },
          { system: "", unitName: "SRS", code: "B0001", description: "x", type: "?" },
        ],
      },
    }),
  );
  const { extraction } = normalizeExtraction(raw);
  const floors = computeFloors(extraction);
  for (const it of extraction.items) expect(floors.get(it.id), it.part).toBe("dikkat");
  for (const f of extraction.obd.rawFaults) expect(floors.get(f.id), f.code).toBe("dikkat");
});

test("yorum çıktısında grup normalleştirilir ve şemaya uyar", () => {
  const out = InterpretationSchema.parse(
    coerceGeminiJson({
      summary: "s",
      items: [
        { itemId: "i1", group: "Dikkat", title: "t", meaning: "m", whyItMatters: "" },
        { itemId: "i2", group: "bilmiyorum", title: "t", meaning: "m", whyItMatters: "" },
        { itemId: "i3", title: "t", meaning: "m", whyItMatters: "", generalUnverified: "false" },
      ],
      checkList: [],
    }),
  );
  expect(out.items.map((i) => i.group)).toEqual(["dikkat", "dikkat", "dikkat"]);
  expect(out.items[2].generalUnverified).toBe(false);
});
