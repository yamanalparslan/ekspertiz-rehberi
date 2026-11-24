import { describe, expect, test } from "vitest";
import { coerceGeminiJson } from "@/lib/claude/gemini-coerce";
import { EXTRACTION_SYSTEM } from "@/lib/claude/prompts";
import bmwFixture from "@/lib/__fixtures__/bmw-320i-2021.extraction.json";
import { preclassify } from "@/lib/claude/interpret";
import { normalizeExtraction } from "@/lib/normalize";
import { computeFloors } from "@/lib/rules/floors";
import { RawExtractionSchema, type RawExtraction } from "@/lib/schema/extraction";
import { confirmCleanStatus } from "./status-guard";

// [bölüm, parça, ham durum, modelin statusKind'i, beklenen ("keep" = aynı kalır)]
type Row = [string, string, string, string, string];

const DOWNGRADE: Row[] = [
  // Kritik: "-sız/-siz/-suz" kelimesi sorun öznesi değildir; çıplak Hayır/Yok temiz olmaz.
  ["kaporta_boya", "Hasarsız", "Hayır", "saglam", "diger"],
  ["kaporta_boya", "Kazasız", "Hayır", "saglam", "diger"],
  ["kaporta_boya", "Boyasız", "Hayır", "saglam", "diger"],
  ["ust_motor", "Arızasız", "Hayır", "saglam", "diger"],
  ["ust_motor", "Sızıntısız", "Yok", "saglam", "diger"],
  ["sasi", "Şasi hasarsız", "Hayır", "saglam", "diger"],
  // Önemli 1: airbag/şasi satırında "Yok" donanım yokluğu sayılmaz.
  ["airbag", "Yolcu hava yastığı", "Yok", "orijinalinde_yok", "diger"],
  ["ic_dis_donanim", "Yolcu hava yastığı", "Yok", "orijinalinde_yok", "diger"],
  ["airbag", "Airbag ikaz lambası", "Yok", "saglam", "diger"],
  // R42: airbag satırında çıplak "Yok"/"Yok."/"Bulunmuyor" donanım yokluğu sayılmaz.
  ["airbag", "Sağ Perde Airbag", "Yok.", "orijinalinde_yok", "diger"],
  ["airbag", "Sürücü Airbag", "Bulunmuyor", "orijinalinde_yok", "diger"],
  ["airbag", "Sol Diz Airbag", "Orijinalinde Yok (sökülmüş)", "orijinalinde_yok", "diger"],
  // Lamba sorusuna "Yok" (ampul yok olabilir) temiz değildir; yalnız Hayır/Yanmıyor.
  ["airbag", "Airbag ikaz lambası yanıyor mu?", "Yok", "saglam", "diger"],
  ["sasi", "Sol Ön Direk", "Yok", "orijinalinde_yok", "diger"],
  ["diger", "Sağ Podye", "Orijinalinde Yok", "orijinalinde_yok", "diger"],
  ["sasi", "Sol Ön Direk", "Orijinalinde Yok", "orijinalinde_yok", "diger"],
  ["sasi", "Hasar", "Yok", "saglam", "diger"],
  // Önemli 2: temiz etiket, ham durum doğrulamıyorsa düşer.
  ["ust_motor", "Şarj Dinamosu", "Çalışmıyor", "calisiyor", "diger"],
  ["ust_motor", "Turbo", "Bozuk", "saglam", "diger"],
  ["ic_dis_donanim", "Cam Krikosu", "Hatalı", "saglam", "diger"],
  ["motor_alt_mekanik", "Rot Ayarı", "Uygunsuz", "saglam", "diger"],
  ["sasi", "Sağ Ön Şase", "Kaynaklı", "saglam", "diger"],
  ["ust_motor", "Akü", "İyi (değişim önerilir)", "saglam", "diger"],
  ["sasi", "Sol A Direği", "Değişmiş", "orijinal", "diger"],
  ["kaporta_boya", "Kaput", "İyi değil", "saglam", "diger"],
  // Bilinmeyen ya da yalnız ölçüm: temiz sayılmaz (yorumlayıcıya gider).
  ["kaporta_boya", "Kaput", "70-90 µ", "orijinal", "diger"],
  ["ic_dis_donanim", "Sunroof", "Yok", "orijinalinde_yok", "diger"],
  ["ic_dis_donanim", "Stepne", "Var", "saglam", "diger"],
  ["ust_motor", "Şasi düzgün mü?", "Hayır", "saglam", "diger"],
  ["ust_motor", "Airbag sistemi çalışıyor mu?", "Hayır", "calisiyor", "diger"],
  ["ust_motor", "Conta kaçak var mı?", "Evet", "saglam", "diger"],
  // "air bag" (iki kelime) ve çıplak "fişek/fişeği" airbag parçasıdır: "Yok" yanıtı temiz değildir.
  ["ust_motor", "Air Bag İkaz Lambası", "Yok", "saglam", "diger"],
  ["ust_motor", "Fişek Arıza Lambası", "Yok", "saglam", "diger"],
  // "-sız" değeri yalnız bir sorun kökünün yokluğunu söylüyorsa olumludur.
  ["kaporta_boya", "Tavan", "Boyasız değil", "orijinal", "diger"],
  ["ic_dis_donanim", "Stepne", "Yağsız", "saglam", "diger"],
];

const KEEP: Row[] = [
  // RaporTürk ve BMW örneğindeki meşru temiz durumlar.
  ["ust_motor", "Turbo Genel Kontrolü", "İyi", "saglam", "keep"],
  ["ust_motor", "Debriyaj", "Iyi", "saglam", "keep"],
  ["conta_kacak", "Conta Kaçak Testi", "Sorunsuz (Yapıldı)", "saglam", "keep"],
  ["ust_motor", "Akü Durumu (%)", "İyi : %80", "saglam", "keep"],
  ["kaporta_boya", "Ağır işlem var mı?", "Hayır", "saglam", "keep"],
  ["ust_motor", "Arıza lambası yanıyor mu?", "Hayır", "saglam", "keep"],
  ["ust_motor", "Conta kaçak var mı?", "Hayır", "saglam", "keep"],
  ["kaporta_boya", "Sol Ön Kapı", "Orijinal : 70-90 µ (mikron)", "orijinal", "keep"],
  ["sasi", "Sağ Ön Şase", "Orijinal", "orijinal", "keep"],
  ["sasi", "Ağır İşlem Mevcut mu?", "Hayır", "saglam", "keep"],
  ["airbag", "Direksiyon Airbag", "Sağlam", "saglam", "keep"],
  // R42: firmanın açık "Orijinalinde Yok" ifadesi airbag satırında temiz kalır (büyük/küçük harf,
  // aksan ve boşluk farkı gözetilmez); airbag lambası sorusuna olumsuz yanıt temizdir.
  ["airbag", "Sol Diz Airbag", "Orijinalinde Yok", "orijinalinde_yok", "keep"],
  ["airbag", "Sol Ön Kapı Airbag", "ORİJİNALİNDE  YOK", "orijinalinde_yok", "keep"],
  ["airbag", "Kaput Fişeği", "orijinalinde yok.", "orijinalinde_yok", "keep"],
  ["airbag", "Airbag Arıza Lambası Yanıyor mu?", "Hayır", "saglam", "keep"],
  ["airbag", "Airbag ikaz lambası yanıyor mu?", "Hayır", "saglam", "keep"],
  ["ust_motor", "Marş Motoru", "Çalışıyor", "calisiyor", "keep"],
  ["ust_motor", "Motor Su Kaçağı / Eksiltme", "Anlık Kaçak Yok", "saglam", "keep"],
  ["ust_motor", "Motor Üfleme Var Mı?", "Anlık Olarak Üfleme Yok", "saglam", "keep"],
  ["conta_kacak", "Conta kaçak testi (CO/HC)", "Negatif - Kaçak Yok", "saglam", "keep"],
  ["motor_alt_mekanik", "Arazi Şanzımanı", "Orijinalinde Yok", "orijinalinde_yok", "keep"],
  ["ic_dis_donanim", "Far Yıkama", "Orijinalinde Yok", "orijinalinde_yok", "keep"],
  // Değer olarak "Boyasız/İşlemsiz" (öznede değil): olumlu; orijinal kalabilir.
  ["kaporta_boya", "Motor Kaputu", "Boyasız", "orijinal", "keep"],
  ["kaporta_boya", "Sol Ön Kapı", "Boyasız", "saglam", "keep"],
  ["kaporta_boya", "Sağ Arka Kapı", "İşlemsiz", "orijinal", "keep"],
  // Temiz olmayan etiketlere dokunulmaz.
  ["sasi", "Sol Ön Direk", "Boyalı", "boyali", "keep"],
  ["ust_motor", "Turbo", "Bozuk", "diger", "keep"],
];

describe("ortak temiz durum koruması (her iki sağlayıcı)", () => {
  test.each([...DOWNGRADE, ...KEEP])("%s / %s = %s (model: %s) -> %s", (section, part, raw, kind, want) => {
    expect(confirmCleanStatus(kind, raw, part, section)).toBe(want === "keep" ? kind : want);
  });
});

const rawWith = (items: RawExtraction["items"]): RawExtraction =>
  RawExtractionSchema.parse({
    isReport: true,
    notReportReason: null,
    vehicle: {
      brand: "BMW",
      model: "320i",
      variant: null,
      year: 2021,
      engineCc: 1597,
      powerHp: 170,
      fuel: "benzin",
      transmission: "otomatik",
      km: 1000,
    },
    report: { firm: null, reportNo: null, date: null, package: null, platform: null, onlineReportQrPresent: false },
    sectionsPresent: [],
    items,
    measurements: [],
    obd: { summary: [], rawFaults: [] },
    kmHistory: [],
    damageRecords: [],
    expertNotes: [],
    unreadable: [],
  });

const toItems = (rows: Row[]): RawExtraction["items"] =>
  rows.map(([section, part, rawStatus, statusKind]) => ({
    section: section as RawExtraction["items"][number]["section"],
    part,
    rawStatus,
    statusKind: statusKind as RawExtraction["items"][number]["statusKind"],
    note: null,
  }));

const CLEAN = ["orijinal", "saglam", "orijinalinde_yok", "calisiyor"];

describe("Claude yolu: normalizeExtraction korumayı uygular", () => {
  const { extraction } = normalizeExtraction(rawWith(toItems([...DOWNGRADE, ...KEEP])));
  const floors = computeFloors(extraction);
  const { done } = preclassify(extraction, floors);
  const doneIds = new Set(done.map((d) => d.itemId));

  test.each(DOWNGRADE)("%s / %s = %s (model: %s) önceden normal sayılmaz", (section, part, raw) => {
    const it = extraction.items.find((i) => i.part === part && i.rawStatus === raw && i.section === section)!;
    expect(CLEAN).not.toContain(it.statusKind);
    expect(doneIds.has(it.id)).toBe(false);
    if (section === "sasi" || section === "airbag") expect(floors.get(it.id)).toBe("dikkat");
  });

  test("Yolcu hava yastığı: Yok (Claude orijinalinde_yok) dikkat tabanı alır", () => {
    const it = extraction.items.find((i) => i.part === "Yolcu hava yastığı" && i.section === "airbag")!;
    expect(it.statusKind).toBe("diger");
    expect(floors.get(it.id)).toBe("dikkat");
  });

  test.each(KEEP.filter((r) => CLEAN.includes(r[3])))("%s / %s = %s meşru temiz kalır", (section, part, raw, kind) => {
    const it = extraction.items.find((i) => i.part === part && i.rawStatus === raw && i.section === section)!;
    expect(it.statusKind).toBe(kind);
  });
});

test("BMW örneği (R42): basılı 'Orijinalinde Yok' airbag satırları ve lamba sorusuna Hayır dikkat almaz; 'Yolcu hava yastığı: Yok' alır", () => {
  const raw = RawExtractionSchema.parse(bmwFixture);
  raw.items.push({ section: "airbag", part: "Yolcu hava yastığı", rawStatus: "Yok", statusKind: "orijinalinde_yok", note: null });
  const { extraction } = normalizeExtraction(raw);
  const floors = computeFloors(extraction);
  const { done } = preclassify(extraction, floors);
  const doneIds = new Set(done.map((d) => d.itemId));
  const airbag = (part: string) => extraction.items.find((i) => i.section === "airbag" && i.part === part)!;
  for (const part of ["Sol Diz Airbag", "Sağ Ön Kapı Airbag", "Sol Ön Kapı Airbag", "Kaput Fişeği"]) {
    const it = airbag(part);
    expect(it.statusKind, part).toBe("orijinalinde_yok");
    expect(floors.get(it.id), part).toBeUndefined();
    expect(doneIds.has(it.id), part).toBe(true);
  }
  const lamp = airbag("Airbag Arıza Lambası Yanıyor mu?");
  expect(lamp.statusKind).toBe("saglam");
  expect(floors.get(lamp.id)).toBeUndefined();
  const passenger = airbag("Yolcu hava yastığı");
  expect(passenger.statusKind).toBe("diger");
  expect(floors.get(passenger.id)).toBe("dikkat");
  expect(doneIds.has(passenger.id)).toBe(false);
});

test("okuma talimatı güvenlik parçaları için orijinalinde_yok/saglam istisnasını içerir", () => {
  expect(EXTRACTION_SYSTEM).toContain("İSTİSNA (güvenlik parçaları)");
  expect(EXTRACTION_SYSTEM).toContain('"Yolcu hava yastığı: Yok" ve "Airbag ikaz lambası: Yok" -> "diger"');
  expect(EXTRACTION_SYSTEM).toMatch(/-sız\/-siz" soruları olumlu sorudur/);
  // R42 ile uyumlu: airbag satırında basılı "Orijinalinde Yok" ve lamba sorusuna "Hayır".
  expect(EXTRACTION_SYSTEM).toContain('airbag satırında raporda tam olarak "Orijinalinde Yok" yazıyorsa "orijinalinde_yok"');
  expect(EXTRACTION_SYSTEM).toContain('"Airbag arıza lambası yanıyor mu? Hayır" -> "saglam"');
});

test("okuma talimatı korumayla uyumlu: orijinalinde_yok yalnız basılı 'Orijinalinde yok'; değer olarak 'Boyasız' orijinal", () => {
  expect(EXTRACTION_SYSTEM).toContain('"orijinalinde_yok" yalnız raporda açıkça "Orijinalinde yok" yazıyorsa');
  expect(EXTRACTION_SYSTEM).toContain('Çıplak "Yok" ("Sunroof: Yok", "Turbo: Yok") -> "diger"');
  expect(EXTRACTION_SYSTEM).not.toContain('"Sunroof: Yok", "Turbo: Yok", "Airmatik: Yok", "Arazi Şanzımanı: Yok") -> "orijinalinde_yok"');
  expect(EXTRACTION_SYSTEM).toContain('Panel satırında DEĞER olarak "Boyasız" ya da "İşlemsiz" -> "orijinal"');
  // Bu iki kural koruma tarafından da aynen uygulanır.
  expect(confirmCleanStatus("orijinalinde_yok", "Yok", "Sunroof", "ic_dis_donanim")).toBe("diger");
  expect(confirmCleanStatus("orijinal", "Boyasız", "Motor Kaputu", "kaporta_boya")).toBe("orijinal");
});

describe("Gemini yolu: dönüştürücü + normalizeExtraction aynı sonucu verir", () => {
  const raw = RawExtractionSchema.parse(
    coerceGeminiJson({ ...rawWith([]), items: toItems([...DOWNGRADE, ...KEEP]) }),
  );
  const { extraction } = normalizeExtraction(raw);
  // Dönüştürücü "diger" bölümünü parça adından yeniden çıkarabilir (ör. Podye -> sasi): parça + durumla bulunur.
  test.each(DOWNGRADE)("%s / %s = %s (model: %s) temiz değil", (_section, part, rawStatus) => {
    const it = extraction.items.find((i) => i.part === part && i.rawStatus === rawStatus)!;
    expect(CLEAN).not.toContain(it.statusKind);
  });
});
