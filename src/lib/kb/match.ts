import type { Extraction } from "@/lib/schema/extraction";
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

function issueApplies(
  issue: ChronicIssue,
  kb: VehicleKbFile,
  engineCc: number | null,
): boolean {
  if (issue.engineCodes === null) return true;
  if (engineCc === null) return true; // cannot exclude
  const codes = issue.engineCodes;
  return kb.vehicle.engines.some((e) => e.cc === engineCc && codes.includes(e.code));
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

  const chronicIssues = hit
    ? hit.chronicIssues
        .filter((i) => issueApplies(i, hit, q.vehicle.engineCc))
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
