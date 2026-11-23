import type { FirmsFile, GenericPricesFile, VehicleKbFile } from "@/lib/schema/kb";

export type LinkStatus = "ok" | "dead" | "unreachable";

export interface KbLink {
  url: string;
  records: string[];
}

/** 2xx/3xx ok; 404/410 dead; everything else (401/403/429/5xx, timeouts = null) unreachable. */
export function classifyStatus(status: number | null): LinkStatus {
  if (status === null) return "unreachable";
  if (status >= 200 && status < 400) return "ok";
  if (status === 404 || status === 410) return "dead";
  return "unreachable";
}

/** Every source URL in the KB with the ids of the records using it. */
export function collectKbLinks(
  vehicles: VehicleKbFile[],
  generic: GenericPricesFile,
  firms: FirmsFile,
): KbLink[] {
  const map = new Map<string, string[]>();
  const add = (url: string, id: string) => {
    const list = map.get(url) ?? [];
    if (!list.includes(id)) list.push(id);
    map.set(url, list);
  };
  for (const v of vehicles) {
    for (const c of v.chronicIssues) for (const s of c.sources) add(s.url, c.id);
    for (const p of v.priceItems) add(p.source.url, p.id);
  }
  for (const p of generic.priceItems) add(p.source.url, p.id);
  for (const f of firms.firms) add(f.verifyUrl, `firm:${f.name}`);
  return [...map.entries()].map(([url, records]) => ({ url, records }));
}
