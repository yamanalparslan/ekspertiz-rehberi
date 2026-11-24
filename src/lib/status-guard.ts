// Sağlayıcıdan bağımsız, temiz durum koruması.
//
// Temiz statusKind (orijinal, saglam, orijinalinde_yok, calisiyor) ön-sınıflandırmada
// "normal" sayılır ve şasi/airbag taban kuralını atlar. Bu yüzden temiz bir etiket yalnız
// raporda basılı ham durum onu AÇIKÇA doğruluyorsa korunur; aksi hâlde "diger" olur
// (temiz değildir: yorumlayıcıya gider, taban kuralları uygulanır). Bilinmeyen metin -> diger.

export const CLEAN_STATUS: ReadonlySet<string> = new Set(["orijinal", "saglam", "orijinalinde_yok", "calisiyor"]);

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

export const words = (folded: string): string[] => folded.split(/[^a-z0-9µ%°]+/).filter(Boolean);
export const hasWordPrefix = (ws: string[], stems: readonly string[]) =>
  ws.some((w) => stems.some((s) => w.startsWith(s)));
export const hasWord = (ws: string[], list: readonly string[]) => ws.some((w) => list.includes(w));

// Tek başına "sorun yok" anlamına gelen durumlar (katlanmış, tam eşleşme).
export const POSITIVE_STATUS: ReadonlySet<string> = new Set([
  "iyi", "cok iyi", "saglam", "sorunsuz", "hasarsiz", "normal", "temiz", "uygun",
  "ariza kaydi yok", "ariza yok", "hata kaydi yok", "hata yok", "kacak yok", "sizinti yok",
]);
export const ORIGINAL_STATUS: ReadonlySet<string> = new Set(["orijinal", "orijinal boya", "orijinal parca"]);
const WORKING_STATUS: ReadonlySet<string> = new Set(["calisiyor", "calisir", "aktif"]);
// Raporda açıkça "fabrikadan yok" yazan donanım.
const FACTORY_ABSENT: ReadonlySet<string> = new Set(["orijinalinde yok", "orijinalde yok", "fabrikadan yok"]);
// Olumsuz yanıtlar (bir sorunun YOKLUĞUNU bildirir), yalnız "sorun öznesi" olan satırlarda temizdir.
export const NEGATIVE_ANSWERS: ReadonlySet<string> = new Set([
  "hayir", "yok", "yoktur", "yanmiyor", "mevcut degil", "gorulmedi", "tespit edilmedi", "bulunmadi",
]);
export const YES_ANSWERS: ReadonlySet<string> = new Set(["evet", "var", "mevcut", "yaniyor"]);
// Ölçüm eki dışında bir şey içeren nitelik ("İyi: değişim gerekli") temizliği bozar.
const BENIGN_QUALIFIER_WORDS = new Set(["yapildi", "mikron", "µ", "µm", "mm", "cm", "c", "°c", "v", "volt", "bar", "km", "olcum", "deger"]);
// Durum ya da nitelikte görülürse temiz sayılmaz.
export const NEGATION_STEMS = [
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
// "-sız/-siz/-suz/-süz" (katlanınca siz/suz): "Hasarsız", "Kazasız" sorunun YOKLUĞUNU sorar.
const PRIVATIVE_SUFFIX = /(siz|suz)$/;
// Olumsuz kutuplu soru ekleri ("... var mı?", "... yanıyor mu?", "işlemli mi?").
const NEG_QUESTION_SUFFIX =
  /(var mi|mevcut mu|yaniyor mu|gerekli mi|yapilmis mi|yapildi mi|li mi|lu mu|goruluyor mu|tespit edildi mi)\s*\?*\s*$/;
export const IS_QUESTION = /\?|\b(mi|mu)\s*$/;

// Katlanmış parça adında: "air bag" (iki kelime) ve çıplak "fişek/fişeği" de airbag sayılır.
export const AIRBAG_PART = /\b(air ?bag|hava yastig|srs\b|fise[kg]|emniyet kemeri fise|kemer fise|kemer gergi)/;
// "direk/direği"; "direksiyon" da eşleşir: koruma için sıkı (temiz durum doğrulaması), taban için
// isChassisPart taşıyıcı olmayanları ayıklar.
export const SASI_PART = /\b(dire[kg]|sasi|sase|podye|tavan|bagaj havuz|havuz|kule|frangart|taban)/;
// Adı şasi parçasına benzeyen ama taşıyıcı olmayanlar (direksiyon, kule bilyası, cam tavan, döşeme...).
const NOT_CHASSIS =
  /\bdireksiyon|\bkule (bilya|rulman|takoz)|\b(cam|acilir) tavan|\btavan (doseme|lamba|isig|kaplama|konsol|cam|pencere|perde|ray|bar|bagaj)|\btaban (hali|paspas|doseme|kaplama)/;

/** Katlanmış parça adı bir airbag/hava yastığı/fişek parçası mı? */
export const isAirbagPart = (foldedPart: string): boolean => AIRBAG_PART.test(foldedPart);
/** Katlanmış parça adı taşıyıcı bir şasi parçası mı (direk, şasi, podye, tavan, havuz...)? */
export const isChassisPart = (foldedPart: string): boolean =>
  SASI_PART.test(foldedPart) && !NOT_CHASSIS.test(foldedPart);
// "orijinalinde_yok" hiçbir zaman kabul edilmeyen güvenlik donanımı (airbag/şasi dışında).
const SAFETY_EQUIPMENT_PART = /\b(abs|esp|esc|fren|kemer)/;

/**
 * Satır, bir SORUNUN varlığını soran/bildiren bir özne mi? ("Ağır işlem var mı?",
 * "Arıza lambası yanıyor mu?", "Conta kaçak"). Olumlu soru ("Şasi düzgün mü?"), işlev
 * sorusu ("çalışıyor mu?"), test/paket sorusu, "-sız" kelimesi ("Hasarsız") ve donanım adı
 * ("Sürücü hava yastığı") değildir. Emin olunamazsa false.
 */
export function isProblemSubject(part: string): boolean {
  const p = fold(part);
  const ws = words(p);
  if (hasWordPrefix(ws, BLOCK_STEMS) || hasWord(ws, BLOCK_WORDS)) return false;
  if (ws.some((w) => PRIVATIVE_SUFFIX.test(w))) return false;
  const asksNeed = /gerekli mi\s*\?*\s*$/.test(p);
  const problem =
    hasWordPrefix(ws, PROBLEM_STEMS) || hasWord(ws, PROBLEM_WORDS) || (asksNeed && hasWordPrefix(ws, INTERVENTION_STEMS));
  if (!problem) return false;
  if (IS_QUESTION.test(p) && !NEG_QUESTION_SUFFIX.test(p)) return false;
  return true;
}

/** "Baş : kuyruk (parantez)" biçimini ayırır; nitelik yalnız ölçüm/birimden oluşuyorsa zararsızdır. */
export function splitStatus(rawStatus: string): { head: string; benign: boolean; text: string } {
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
 * Değer olarak tek bir "<sorun kökü>-sız/-suz" kelimesi mi? ("Boyasız", "İşlemsiz", "Kaynaksız").
 * Özne olarak ("Hasarsız mı?") olumlu bir sorudur ve isProblemSubject onu dışlar; DEĞER olarak
 * sorunun yokluğunu bildirir. Sorun kökü olmayan ("Yağsız") olumlu sayılmaz.
 */
function isPrivativeOfProblem(head: string): boolean {
  if (!/^[a-z]+$/.test(head)) return false;
  const m = /^(.+?)(siz|suz)$/.exec(head);
  if (!m) return false;
  const stem = m[1];
  return PROBLEM_STEMS.some((s) => stem.startsWith(s)) || PROBLEM_WORDS.includes(stem);
}

/** "<sorun> yok" biçiminde tam bir ifade mi? ("Anlık Kaçak Yok", "Negatif - Kaçak Yok"). */
function isNegativeStatement(head: string): boolean {
  const m = /^(.+?)\s+(yok|yoktur|mevcut degil|gorulmedi|tespit edilmedi|bulunmadi)$/.exec(head);
  return m !== null && isProblemSubject(m[1]);
}

/**
 * Temiz bir statusKind'i yalnız ham durum doğruluyorsa korur; aksi hâlde "diger".
 * Temiz olmayan etiketler aynen döner. Doğrulama:
 * - Durum başı açık bir olumlu/orijinal/çalışıyor ifadesi ("İyi", "Sorunsuz (Yapıldı)",
 *   "Orijinal : 70-90 µ") ya da değer olarak "<sorun>-sız" ("Boyasız", "İşlemsiz") ve
 *   nitelikleri yalnız ölçüm/birim.
 * - Airbag dışında: "<sorun> yok" ifadesi ya da sorun öznesine olumsuz yanıt ("Ağır işlem
 *   var mı? = Hayır"). Şasi satırında olumsuz yanıt yalnız soru biçimindeki özneye geçerlidir.
 * - Airbag satırında yalnız sorun sorusuna "Hayır"/"Yanmıyor" ("Airbag arıza lambası yanıyor
 *   mu? = Hayır"); "Airbag ikaz lambası: Yok" temiz değildir.
 * - "orijinalinde_yok": airbag satırında yalnız tam "Orijinalinde Yok" ifadesiyle; şasi
 *   bölümünde ve şasi/fren/kemer parça adlarında asla; başka yerde yalnız "Orijinalinde yok"
 *   yazıyorsa.
 * `section` bilinmiyorsa (null) yalnız parça adına bakılır.
 */
export function confirmCleanStatus<K extends string>(
  kind: K,
  rawStatus: string,
  part: string,
  section: string | null,
): K | "diger" {
  if (!CLEAN_STATUS.has(kind)) return kind;
  const p = fold(part);
  const airbag = section === "airbag" || AIRBAG_PART.test(p);
  const chassis = section === "sasi" || SASI_PART.test(p);
  const { head, benign, text } = splitStatus(rawStatus);
  if (!benign || hasWordPrefix(words(text), NEGATION_STEMS)) return "diger";

  if (kind === "orijinalinde_yok") {
    // R42: airbag satırında firmanın tam "Orijinalinde Yok" ifadesi (harf/aksan/boşluk farkı
    // gözetilmez) kabul edilir; çıplak "Yok"/"Bulunmuyor" ve şasi satırları asla.
    if (airbag && !chassis && text.replace(/[.!]+$/, "").trim() === "orijinalinde yok") return kind;
    if (airbag || chassis || SAFETY_EQUIPMENT_PART.test(p)) return "diger";
    if (FACTORY_ABSENT.has(head)) return kind;
  }
  if (POSITIVE_STATUS.has(head) || ORIGINAL_STATUS.has(head) || WORKING_STATUS.has(head)) return kind;
  if (isPrivativeOfProblem(head)) return kind;
  if (airbag) {
    // R42: yalnız sorun sorusuna (ör. "Airbag ikaz lambası yanıyor mu?") "Hayır"/"Yanmıyor" temizdir.
    // Soru olmayan satırda ya da "Yok" yanıtında (ampul sökülmüş olabilir) temiz değildir.
    const answer = head === "hayir" || head === "yanmiyor";
    return answer && IS_QUESTION.test(p) && isProblemSubject(part) ? kind : "diger";
  }
  if (isNegativeStatement(head)) return kind;
  if (NEGATIVE_ANSWERS.has(head) && isProblemSubject(part) && (!chassis || IS_QUESTION.test(p))) return kind;
  return "diger";
}
