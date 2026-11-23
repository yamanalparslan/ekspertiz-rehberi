import type { Extraction, VehicleInferred } from "@/lib/schema/extraction";
import type {
  ChronicIssue,
  FirmsFile,
  PriceItem,
  VehicleKbFile,
} from "@/lib/schema/kb";
import { confidenceFromSources, type Confidence } from "./confidence";

export type KnowledgeQuery = {
  vehicle: Extraction["vehicle"];
  firm: string | null;
  /** Tahmini araç alanları: eşleşmede bilinmiyor (null) sayılır, hiçbir sorunu dışlamaz. */
  inferred?: VehicleInferred;
};

export type Knowledge = {
  vehicleId: string | null;
  chronicIssues: (ChronicIssue & { confidence: Confidence })[];
  priceItems: (PriceItem & { stale: boolean })[];
  firmVerifyUrl: string | null;
};

export type KbData = {
  vehicles: VehicleKbFile[];
  generic: PriceItem[];
  firms: FirmsFile["firms"];
};

const STALE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export function norm(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i") // ASCII "I" lowercases to dotless ı under tr-TR
    .replace(/̇/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** price_cache anahtarı: eşleşen araç kimliği, yoksa "marka|model". Marka veya model yoksa null. */
export function priceCacheKey(vehicleId: string | null, v: Extraction["vehicle"]): string | null {
  if (vehicleId !== null) return vehicleId;
  if (v.brand === null || v.model === null) return null;
  const b = norm(v.brand);
  const m = norm(v.model);
  return b === "" || m === "" ? null : `${b}|${m}`;
}

function isStale(asOf: string, now: Date): boolean {
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) return true; // unparseable date: do not vouch for freshness
  return now.getTime() - t > STALE_DAYS * DAY_MS;
}

function vehicleMatches(kb: VehicleKbFile, v: Extraction["vehicle"]): boolean {
  if (v.brand === null || v.model === null) return false;
  const k = kb.vehicle;
  if (norm(v.brand) !== norm(k.brand)) return false;
  const model = norm(v.model);
  if (model !== norm(k.model) && !k.aliases.some((a) => norm(a) === model)) return false;
  if (v.year !== null && (v.year < k.yearFrom || v.year > k.yearTo)) return false;
  return true;
}

const CC_TOLERANCE = 30;

/**
 * Motor kodu/adı belirteçleri: tek parçalar ve ardışık ikililer ("1.4 TSI" -> "1.4tsi"),
 * yalnız harf VE rakam içeren, en az 3 karakterli olanlar ("g3ld", "1.3multijet", "ea211").
 */
function engineTokens(s: string): { all: Set<string>; singles: string[] } {
  const parts = norm(s)
    .split(/[\s/()+,_-]+/)
    .filter(Boolean);
  const distinctive = (t: string) => t.length >= 3 && /[a-z]/.test(t) && /[0-9]/.test(t);
  const all = new Set<string>();
  const singles: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (distinctive(parts[i])) {
      all.add(parts[i]);
      singles.push(parts[i]);
    }
    if (i + 1 < parts.length && distinctive(parts[i] + parts[i + 1])) all.add(parts[i] + parts[i + 1]);
  }
  return { all, singles };
}

function codeTokenMatch(codes: string[], vehicleText: string): boolean {
  const v = engineTokens(vehicleText);
  if (v.all.size === 0) return false;
  for (const code of codes) {
    const k = engineTokens(code);
    for (const t of v.all) if (k.all.has(t)) return true;
    // Kısa motor kodu öneki: "B48" -> "B48B16A".
    for (const t of v.singles) if (k.singles.some((s) => s !== t && s.startsWith(t))) return true;
  }
  return false;
}

// LPG dönüşümü ve hibritler benzinli motor taşır.
const PETROL_LIKE = new Set(["benzin", "lpg", "hibrit"]);
function fuelCompatible(kbFuel: string, fuel: string | null): boolean {
  if (fuel === null) return true;
  const a = norm(kbFuel);
  return a === fuel || (PETROL_LIKE.has(a) && PETROL_LIKE.has(fuel));
}

/**
 * Motora bağlı kronik sorun şu durumlarda geçerlidir: araç metninde (model/varyant) bir
 * motor kodu/adı belirteci eşleşir; ya da basılı hacim, listelenen bir motorun hacmine
 * ±30 cc yakındır ve yakıt uyar (veya yakıt bilinmez). Hacim bilinmiyorsa (ya da tahminiyse)
 * yalnız basılı yakıt kesin uyuşmazlık gösterdiğinde dışlanır.
 */
function issueApplies(
  issue: ChronicIssue,
  kb: VehicleKbFile,
  v: { text: string; engineCc: number | null; fuel: string | null },
): boolean {
  if (issue.engineCodes === null) return true;
  const codes = issue.engineCodes;
  if (codeTokenMatch(codes, v.text)) return true;
  const engines = kb.vehicle.engines.filter((e) => codes.includes(e.code));
  if (engines.length === 0) return v.engineCc === null; // KB tutarsız: yalnız hacim bilinmiyorsa dışlama
  if (v.engineCc === null) return engines.some((e) => fuelCompatible(e.fuel, v.fuel));
  const cc = v.engineCc;
  return engines.some((e) => Math.abs(e.cc - cc) <= CC_TOLERANCE && fuelCompatible(e.fuel, v.fuel));
}

function matchFirm(firms: FirmsFile["firms"], firm: string | null): string | null {
  if (firm === null) return null;
  const f = norm(firm);
  if (f === "") return null;
  for (const entry of firms) {
    const n = norm(entry.name);
    if (n !== "" && (f.includes(n) || n.includes(f))) return entry.verifyUrl;
  }
  return null;
}

export function matchKnowledge(kb: KbData, q: KnowledgeQuery, now: Date): Knowledge {
  const hit = kb.vehicles.find((v) => vehicleMatches(v, q.vehicle)) ?? null;
  // Tahmini alanlar eşleşmeyi daraltmamalı: bilinmiyor sayılır.
  const engineView = {
    text: `${q.vehicle.model ?? ""} ${q.vehicle.variant ?? ""}`,
    engineCc: q.inferred?.engineCc ? null : q.vehicle.engineCc,
    fuel: q.inferred?.fuel ? null : q.vehicle.fuel,
  };

  const chronicIssues = hit
    ? hit.chronicIssues
        .filter((i) => issueApplies(i, hit, engineView))
        .map((i) => ({ ...i, confidence: confidenceFromSources(i.sources) }))
    : [];

  const segment = hit ? hit.vehicle.segment : null;
  const items = [
    ...(hit ? hit.priceItems : []),
    ...kb.generic.filter((p) => p.segment === null || p.segment === segment),
  ];

  return {
    vehicleId: hit ? hit.vehicle.id : null,
    chronicIssues,
    priceItems: items.map((p) => ({ ...p, stale: isStale(p.asOf, now) })),
    firmVerifyUrl: matchFirm(kb.firms, q.firm),
  };
}
