// Gemini yanıtlarını şemaya zorlayan dönüştürücü (RawExtraction / Interpretation).
//
// İlke: emin olunamayan her değer GÜVENLİ tarafa düşer.
// - Tanınmayan durum "diger" kalır (temiz sayılmaz, yorumlayıcıya ve taban kurallarına gider).
// - Bilinmeyen bölüm/sistem, parça veya ünite adından şasi/airbag/fren olarak çıkarılır.
// - Bilinmeyen grup "dikkat" olur; eksik isReport "false" olur.

const VALID_SECTIONS = new Set([
  "kaporta_boya", "mor_isik", "sasi", "ust_motor", "motor_alt_mekanik",
  "ic_dis_donanim", "conta_kacak", "airbag", "obd", "test_hatti",
  "km_sorgusu", "hasar_sorgusu", "diger",
]);
const VALID_STATUS = new Set([
  "orijinal", "saglam", "orijinalinde_yok", "lokal_boyali", "boyali",
  "tadilat_boyali", "degisen", "sokulup_takilmis", "deforme", "asinmis",
  "terleme", "sizinti", "zayif", "bakim_onerilir", "degisim_gerekli",
  "ariza", "calisiyor", "kontrol_onerilir", "diger",
]);
// Ön-sınıflandırmada "normal" sayılan durumlar (interpret.ts CLEAN_STATUS ile aynı).
const CLEAN_STATUS = new Set(["orijinal", "saglam", "orijinalinde_yok", "calisiyor"]);
const VALID_OBD = new Set([
  "motor", "sanziman", "fren", "airbag", "klima", "direksiyon",
  "multimedya", "govde_elektronik", "surus_destek", "gosterge", "diger",
]);
const VALID_TESTS = new Set([
  "fren_sapma_on", "fren_sapma_arka", "el_freni_sapma",
  "yanal_kayma_on", "yanal_kayma_arka", "suspansiyon_tutunma", "dinamometre_guc",
]);
const VALID_FUELS = new Set(["benzin", "dizel", "lpg", "hibrit", "elektrik"]);
const VALID_TRANS = new Set(["manuel", "otomatik", "yari_otomatik"]);
const VALID_GROUPS = new Set(["normal", "belirsiz", "kronik", "dikkat"]);
const VALID_FAULT_TYPES = new Set(["intermittent", "permanent", "unknown"]);

// ---------------------------------------------------------------------------
// Metin yardımcıları

/** Türkçe küçük harf + ASCII katlama + tek boşluk: eşleştirme için. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/̇/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[âà]/g, "a")
    .replace(/[î]/g, "i")
    .replace(/[û]/g, "u")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (folded: string): string[] => folded.split(/[^a-z0-9µ%°]+/).filter(Boolean);
const hasWordPrefix = (ws: string[], stems: readonly string[]) => ws.some((w) => stems.some((s) => w.startsWith(s)));
const hasWord = (ws: string[], list: readonly string[]) => ws.some((w) => list.includes(w));

/** true/false/"true"/"false" dışındaki her şey varsayılan değere düşer. */
function strictBool(x: unknown, dflt: boolean): boolean {
  if (typeof x === "boolean") return x;
  if (typeof x === "string") {
    const f = fold(x);
    if (f === "true") return true;
    if (f === "false") return false;
  }
  return dflt;
}

// ---------------------------------------------------------------------------
// Durum (statusKind)

// Tek başına "sorun yok" anlamına gelen ifadeler (katlanmış, tam eşleşme).
const POSITIVE_STATUS = new Set([
  "iyi", "cok iyi", "saglam", "sorunsuz", "hasarsiz", "normal", "temiz", "uygun",
  "ariza kaydi yok", "ariza yok", "hata kaydi yok", "hata yok", "kacak yok", "sizinti yok",
]);
const ORIGINAL_STATUS = new Set(["orijinal", "orijinal boya"]);
// Olumsuz yanıtlar (bir sorunun YOKLUĞUNU bildirir), yalnız "sorun öznesi" olan satırlarda temizdir.
const NEGATIVE_ANSWERS = new Set([
  "hayir", "yok", "yoktur", "yanmiyor", "mevcut degil", "gorulmedi", "tespit edilmedi", "bulunmadi",
]);
const YES_ANSWERS = new Set(["evet", "var", "mevcut", "yaniyor"]);
// Ölçüm eki dışında bir şey içeren nitelik ("İyi: değişim gerekli") temizliği bozar.
const BENIGN_QUALIFIER_WORDS = new Set(["yapildi", "mikron", "µ", "µm", "mm", "cm", "c", "°c", "v", "volt", "bar", "km", "olcum", "deger"]);
// Durum ya da nitelikte görülürse temiz sayılmaz.
const NEGATION_STEMS = [
  "degil", "kotu", "zayif", "yetersiz", "sorunlu", "arizali", "hasarli", "dusuk", "kritik", "gerek",
];

// Sorun bildiren özneler (kelime başı).
const PROBLEM_STEMS = [
  "kacak", "kacag", "sizinti", "ariza", "hasar", "islem", "ezik", "cizik", "gocuk", "duman", "ufleme",
  "bosluk", "titreme", "catlak", "korozyon", "curume", "paslan", "hata", "uyari", "ikaz", "asinma",
  "terleme", "darbe", "kaynak", "macun", "boya", "degisen", "degisim", "tadilat", "sorun", "kaza",
];
const PROBLEM_WORDS = ["ses", "sesi", "pas", "pasi"];
// Yalnız "... gerekli mi?" sorularında sorun öznesi sayılan müdahaleler.
const INTERVENTION_STEMS = ["bakim", "ayar", "onarim", "tamir", "mudahale", "rot", "balans"];
// Olumlu/işlev soran veya test/paket soran satırlar: "Hayır" burada sorun demektir.
const BLOCK_STEMS = [
  "duzgun", "calis", "saglam", "orijinal", "normal", "uygun", "yeterli", "dogru", "aktif", "sorunsuz",
  "temiz", "test", "kontrol", "yapildi", "olcul", "incelen", "bakil", "secil", "paket", "sizdirmaz",
];
const BLOCK_WORDS = ["iyi", "tam"];
// Olumsuz kutuplu soru ekleri ("... var mı?", "... yanıyor mu?", "işlemli mi?").
const NEG_QUESTION_SUFFIX =
  /(var mi|mevcut mu|yaniyor mu|gerekli mi|yapilmis mi|yapildi mi|li mi|lu mu|goruluyor mu|tespit edildi mi)\s*\?*\s*$/;
const IS_QUESTION = /\?|\b(mi|mu)\s*$/;

/**
 * Satır, bir SORUNUN varlığını soran/bildiren bir özne mi? ("Ağır işlem var mı?",
 * "Arıza lambası yanıyor mu?", "Conta kaçak"). Olumlu soru ("Şasi düzgün mü?"),
 * işlev sorusu ("çalışıyor mu?"), test/paket sorusu ve donanım adı ("Sürücü hava yastığı")
 * değildir. Emin olunamazsa false.
 */
export function isProblemSubject(part: string): boolean {
  const p = fold(part);
  const ws = words(p);
  if (hasWordPrefix(ws, BLOCK_STEMS) || hasWord(ws, BLOCK_WORDS)) return false;
  const asksNeed = /gerekli mi\s*\?*\s*$/.test(p);
  const problem =
    hasWordPrefix(ws, PROBLEM_STEMS) || hasWord(ws, PROBLEM_WORDS) || (asksNeed && hasWordPrefix(ws, INTERVENTION_STEMS));
  if (!problem) return false;
  if (IS_QUESTION.test(p) && !NEG_QUESTION_SUFFIX.test(p)) return false;
  return true;
}

/** "Baş : kuyruk (parantez)" biçimini ayırır; nitelik yalnız ölçüm/birimden oluşuyorsa zararsızdır. */
function splitStatus(rawStatus: string): { head: string; benign: boolean; text: string } {
  const text = fold(rawStatus);
  const parens = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const noParens = text.replace(/\([^)]*\)/g, " ");
  const colon = noParens.indexOf(":");
  const head = (colon >= 0 ? noParens.slice(0, colon) : noParens).replace(/[.!,;\s]+$/g, "").trim();
  const tail = colon >= 0 ? noParens.slice(colon + 1) : "";
  const qualifiers = [tail, ...parens].join(" ");
  const qWords = words(qualifiers).filter((w) => !/^[0-9.,%°µ-]+$/.test(w));
  const benign = qWords.every((w) => BENIGN_QUALIFIER_WORDS.has(w));
  return { head, benign, text };
}

/**
 * Ham durumdan statusKind. Model geçerli bir değer verdiyse kullanılır; ancak temiz bir
 * değer, çıplak evet/hayır/yok yanıtında kutupluluk denetiminden geçmezse veya durum bir
 * olumsuzluk içeriyorsa "diger"e indirilir. Tanınmayan her şey "diger" kalır.
 */
export function inferStatusKind(rawKind: string, rawStatus: string, part: string): string {
  const k = fold(rawKind).replace(/[\s-]+/g, "_");
  const { head, benign, text } = splitStatus(rawStatus);
  const negated = hasWordPrefix(words(text), NEGATION_STEMS);
  const isNegAnswer = NEGATIVE_ANSWERS.has(head);
  const isYes = YES_ANSWERS.has(head);
  const cleanByPolarity = isNegAnswer && benign && isProblemSubject(part);

  if (VALID_STATUS.has(k) && k !== "diger") {
    if (!CLEAN_STATUS.has(k)) return k;
    // Model "temiz" dedi: güvenli olduğu doğrulanabiliyorsa kabul et.
    if (negated) return "diger";
    if (isNegAnswer || isYes) return cleanByPolarity ? k : "diger";
    return k;
  }

  // Model değeri yok/geçersiz: yalnız açık ifadeler eşlenir.
  if (/\b(ezik|cizik|gocuk)/.test(text) && !isNegAnswer) return "deforme";
  if (/(secilmedi|incelenmesi gerekli|kontrol edilmedi|yapilmadi)/.test(text)) return "kontrol_onerilir";
  if (isYes && /gerekli mi\s*\?*\s*$/.test(fold(part))) return "bakim_onerilir";
  if (!negated && benign && POSITIVE_STATUS.has(head)) return "saglam";
  if (!negated && benign && ORIGINAL_STATUS.has(head)) return "orijinal";
  if (cleanByPolarity) return "saglam";
  return "diger";
}

// ---------------------------------------------------------------------------
// Bölüm, OBD sistemi, grup

const SECTION_TITLE_RULES: [RegExp, string][] = [
  [/\b(sasi|sase|iskelet)/, "sasi"],
  [/\b(airbag|hava yastig|srs)/, "airbag"],
  [/\bmor isik/, "mor_isik"],
  [/\b(kaporta|boya)/, "kaporta_boya"],
  [/\bust motor/, "ust_motor"],
  [/\b(motor alt|alt ve mekanik|mekanik)/, "motor_alt_mekanik"],
  [/\b(donanim)/, "ic_dis_donanim"],
  [/\bconta/, "conta_kacak"],
  [/\b(obd|ariza tespit|tanilayici|beyin)/, "obd"],
  [/\b(test hatti|dinamometre|suspansiyon testi|fren testi|yanal kayma)/, "test_hatti"],
  [/\b(kilometre|km sorgu)/, "km_sorgusu"],
  [/\b(hasar sorgu|hasar kaydi|tramer|sbm)/, "hasar_sorgusu"],
];
const AIRBAG_PART = /\b(airbag|hava yastig|srs\b|emniyet kemeri fise|kemer fise|kemer gergi)/;
const SASI_PART = /\b(direk|sasi|sase|podye|tavan|bagaj havuz|havuz|kule|frangart|taban)/;

/**
 * Geçerli bölüm (büyük/küçük harf ve tire/boşluk farkı gözetmeden) korunur. Değilse sayfa
 * başlığından, o da olmazsa parça adından şasi/airbag çıkarılır; emin olunamazsa "diger".
 */
export function inferSection(section: unknown, part: string): string {
  const raw = typeof section === "string" ? section : "";
  const key = fold(raw).replace(/[\s/-]+/g, "_");
  if (VALID_SECTIONS.has(key) && key !== "diger") return key;
  const t = fold(raw.replace(/[_-]+/g, " "));
  if (key !== "diger") {
    for (const [re, s] of SECTION_TITLE_RULES) if (re.test(t)) return s;
  }
  const p = fold(part);
  if (AIRBAG_PART.test(p)) return "airbag";
  if (SASI_PART.test(p)) return "sasi";
  return "diger";
}

const OBD_RULES: [string[], RegExp | null, string][] = [
  // [kısa kodlar (tam kelime), uzun ifadeler, sistem] — güvenlik sistemleri önce.
  [["airbag", "srs", "acsm", "sdm"], /(hava yastig|emniyet kemer|kemer gergi)/, "airbag"],
  [["abs", "esp", "esc", "dsc", "esr", "ebd", "asr", "epb", "tcs"], /(fren|el freni)/, "fren"],
  [["dme", "dde", "ecu", "ecm", "pcm", "motor"], /(motor|enjeksiyon)/, "motor"],
  [["egs", "tcu", "tcm", "dsg", "sanziman", "vites"], /(sanziman|vites)/, "sanziman"],
  [["ihka", "klima", "hvac"], /klima/, "klima"],
  [["eps", "direksiyon"], /direksiyon/, "direksiyon"],
  [["hu", "radyo", "navigasyon", "carplay", "wlan", "multimedya"], /(multimedya|radyo|navigasyon)/, "multimedya"],
  [["bdc", "zgm", "bcm", "fem", "cas"], /(govde|konfor|lastik basinc)/, "govde_elektronik"],
  [["adas", "kafas", "radar", "kamera", "acc"], /(serit|surus destek|kamera|radar)/, "surus_destek"],
  [["kombi", "gosterge", "ipc"], /gosterge/, "gosterge"],
];

/** Geçerli sistem korunur; değilse sistem + ünite adından çıkarılır (airbag/fren önceliklidir). */
export function inferObdSystem(system: unknown, unitName: string): string {
  const raw = typeof system === "string" ? system : "";
  const key = fold(raw).replace(/[\s-]+/g, "_");
  if (VALID_OBD.has(key) && key !== "diger") return key;
  const text = fold(`${raw} ${unitName}`);
  const ws = words(text);
  for (const [codes, phrase, s] of OBD_RULES) {
    if (hasWord(ws, codes) || (phrase !== null && phrase.test(text))) return s;
  }
  return "diger";
}

/** Grup büyük/küçük harften bağımsız eşlenir; bilinmeyen ya da eksik grup "dikkat" olur. */
export function coerceGroup(g: unknown): string {
  const key = typeof g === "string" ? fold(g) : "";
  return VALID_GROUPS.has(key) ? key : "dikkat";
}

// ---------------------------------------------------------------------------

/**
 * Zod'dan üretilen JSON şemasını Gemini `responseJsonSchema` için sadeleştirir: yerel
 * `#/$defs/...` başvuruları açılır, `$defs`/`$schema` atılır ve tipsiz `enum` düğümlerine
 * tip eklenir (Gemini belgesi `$ref`/`$defs`i yalnız özyineleme için anar).
 */
export function toGeminiResponseSchema(schema: unknown): unknown {
  const root = (schema && typeof schema === "object" ? schema : {}) as Record<string, unknown>;
  const defs = (root.$defs ?? {}) as Record<string, unknown>;
  const walk = (node: unknown, depth: number): unknown => {
    if (depth > 64) return node;
    if (Array.isArray(node)) return node.map((n) => walk(n, depth + 1));
    if (!node || typeof node !== "object") return node;
    const o = node as Record<string, unknown>;
    if (typeof o.$ref === "string") {
      const m = /^#\/\$defs\/(.+)$/.exec(o.$ref);
      if (m && m[1] in defs) return walk(defs[m[1]], depth + 1);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === "$defs" || k === "$schema") continue;
      out[k] = walk(v, depth + 1);
    }
    if (Array.isArray(out.enum) && out.type === undefined) {
      const vals = out.enum as unknown[];
      if (vals.every((v) => typeof v === "string")) out.type = "string";
      else if (vals.every((v) => typeof v === "number")) out.type = "number";
    }
    return out;
  };
  return walk(root, 0);
}

export function coerceGeminiJson(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const o = input as Record<string, unknown>;

  // Interpretation çıktısı:
  if ("summary" in o || "checkList" in o) {
    const rawItems = Array.isArray(o.items) ? o.items : [];
    const rawCheck = Array.isArray(o.checkList) ? o.checkList : [];
    return {
      summary: String(o.summary ?? ""),
      items: rawItems
        .filter((it): it is Record<string, unknown> => Boolean(it && typeof it === "object"))
        .map((it) => ({
          itemId: String(it.itemId ?? it.id ?? ""),
          group: coerceGroup(it.group),
          title: String(it.title ?? ""),
          meaning: String(it.meaning ?? ""),
          whyItMatters: String(it.whyItMatters ?? ""),
          askSeller: typeof it.askSeller === "string" ? it.askSeller : null,
          priceItemId: typeof it.priceItemId === "string" ? it.priceItemId : null,
          priceNeed: typeof it.priceNeed === "string" ? it.priceNeed : null,
          chronicIssueId: typeof it.chronicIssueId === "string" ? it.chronicIssueId : null,
          generalUnverified: strictBool(it.generalUnverified, false),
        })),
      checkList: rawCheck
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
        .map((c) => ({
          title: String(c.title ?? ""),
          why: String(c.why ?? ""),
          chronicIssueId: typeof c.chronicIssueId === "string" ? c.chronicIssueId : null,
        })),
    };
  }

  // RawExtraction çıktısı:
  if ("isReport" in o || "vehicle" in o || "sectionsPresent" in o) {
    const v = (o.vehicle && typeof o.vehicle === "object" ? o.vehicle : {}) as Record<string, unknown>;
    const r = (o.report && typeof o.report === "object" ? o.report : {}) as Record<string, unknown>;
    const obd = (o.obd && typeof o.obd === "object" ? o.obd : {}) as Record<string, unknown>;
    const numOrNull = (x: unknown): number | null =>
      typeof x === "number" && Number.isFinite(x) ? x : null;
    const strOrNull = (x: unknown): string | null =>
      typeof x === "string" && x.trim() !== "" ? x : null;
    const sectionsPresent = (Array.isArray(o.sectionsPresent) ? o.sectionsPresent : [])
      .map((s) => inferSection(s, ""))
      .filter((s) => s !== "diger" || (o.sectionsPresent as unknown[]).includes("diger"));

    const expertNotes = (Array.isArray(o.expertNotes) ? o.expertNotes : []).map(String);
    return {
      // Eksik ya da bozuk isReport: rapor sayılmaz (yorumlama çalışmaz).
      isReport: strictBool(o.isReport, false),
      notReportReason: strOrNull(o.notReportReason),
      // Yalnız modelin yazdığı (basılı) değerler; tahmin normalizeExtraction'da işaretlenerek yapılır.
      vehicle: {
        brand: strOrNull(v.brand),
        model: strOrNull(v.model),
        variant: strOrNull(v.variant),
        year: numOrNull(v.year),
        engineCc: numOrNull(v.engineCc),
        powerHp: numOrNull(v.powerHp),
        fuel: VALID_FUELS.has(String(v.fuel)) ? String(v.fuel) : null,
        transmission: VALID_TRANS.has(String(v.transmission)) ? String(v.transmission) : null,
        km: numOrNull(v.km),
      },
      report: {
        firm: strOrNull(r.firm),
        reportNo: strOrNull(r.reportNo),
        date: strOrNull(r.date),
        package: strOrNull(r.package),
        platform: strOrNull(r.platform),
        onlineReportQrPresent: strictBool(r.onlineReportQrPresent, false),
      },
      sectionsPresent: [...new Set(sectionsPresent)],
      items: (Array.isArray(o.items) ? o.items : [])
        .filter((it): it is Record<string, unknown> => Boolean(it && typeof it === "object"))
        .map((it) => {
          const part = String(it.part ?? "Bilinmeyen Parça");
          const rawStatus = String(it.rawStatus ?? "");
          return {
            section: inferSection(it.section, part),
            part,
            rawStatus,
            statusKind: inferStatusKind(String(it.statusKind ?? ""), rawStatus, part),
            note: strOrNull(it.note),
          };
        }),
      measurements: (Array.isArray(o.measurements) ? o.measurements : [])
        .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === "object" && VALID_TESTS.has(String(m.test))))
        .map((m) => ({
          test: String(m.test),
          position: strOrNull(m.position),
          value: numOrNull(m.value),
          unit: strOrNull(m.unit),
          performed: strictBool(m.performed, true),
          printedPassMin: numOrNull(m.printedPassMin),
          printedPassMax: numOrNull(m.printedPassMax),
        })),
      obd: {
        summary: (Array.isArray(obd.summary) ? obd.summary : [])
          .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
          .map((s) => ({
            system: inferObdSystem(s.system, String(s.unitName ?? "")),
            unitName: String(s.unitName ?? ""),
            hasFault: strictBool(s.hasFault, false),
          })),
        rawFaults: (Array.isArray(obd.rawFaults) ? obd.rawFaults : [])
          .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === "object"))
          .map((f) => ({
            system: inferObdSystem(f.system, String(f.unitName ?? "")),
            unitName: String(f.unitName ?? ""),
            code: String(f.code ?? ""),
            description: String(f.description ?? ""),
            type: VALID_FAULT_TYPES.has(String(f.type)) ? String(f.type) : "unknown",
          })),
      },
      kmHistory: (Array.isArray(o.kmHistory) ? o.kmHistory : [])
        .filter((k): k is Record<string, unknown> => Boolean(k && typeof k === "object" && typeof k.date === "string" && typeof k.km === "number"))
        .map((k) => ({ date: String(k.date), km: Number(k.km) })),
      damageRecords: (Array.isArray(o.damageRecords) ? o.damageRecords : [])
        .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === "object"))
        .map((d) => ({
          date: strOrNull(d.date),
          cause: strOrNull(d.cause),
          amountTry: numOrNull(d.amountTry),
        })),
      expertNotes,
      unreadable: (Array.isArray(o.unreadable) ? o.unreadable : []).map(String),
    };
  }

  return input;
}
