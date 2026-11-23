import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyStatus, collectKbLinks, type LinkStatus } from "../src/lib/kb/links";
import {
  FirmsFileSchema,
  GenericPricesFileSchema,
  VehicleKbFileSchema,
} from "../src/lib/schema/kb";

// Read-only: never edits kb files.
const root = join(import.meta.dirname, "..", "kb");
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

const vehicles = readdirSync(join(root, "vehicles"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => VehicleKbFileSchema.parse(readJson(join(root, "vehicles", f))));
const generic = GenericPricesFileSchema.parse(readJson(join(root, "generic-prices.json")));
const firms = FirmsFileSchema.parse(readJson(join(root, "firms.json")));
const links = collectKbLinks(vehicles, generic, firms);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function check(url: string): Promise<{ status: number | null; note: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "tr,en;q=0.8" },
    });
    if (res.status === 200) {
      const head = (await res.text()).slice(0, 4000).toLowerCase();
      if (/captcha|cf-challenge|just a moment|attention required/.test(head)) {
        return { status: null, note: "captcha" };
      }
    } else {
      await res.body?.cancel();
    }
    return { status: res.status, note: "" };
  } catch (e) {
    const err = e as Error;
    return { status: null, note: err.name === "TimeoutError" ? "timeout" : err.message };
  }
}

const results: { url: string; records: string[]; status: number | null; cls: LinkStatus; note: string }[] = [];
let next = 0;
async function worker() {
  while (next < links.length) {
    const l = links[next++];
    const r = await check(l.url);
    results.push({ ...l, ...r, cls: classifyStatus(r.status) });
  }
}
async function main() {
  await Promise.all(Array.from({ length: 6 }, worker));


  results.sort((a, b) => a.cls.localeCompare(b.cls) || a.url.localeCompare(b.url));
  for (const r of results) {
    const label = r.cls === "ok" ? "ok" : r.cls === "dead" ? "DEAD" : "UNREACHABLE";
    console.log(
      [label.padEnd(11), String(r.status ?? "-").padEnd(4), r.url, `[${r.records.join(", ")}]`, r.note]
        .filter(Boolean)
        .join("  "),
    );
  }
  const count = (c: LinkStatus) => results.filter((r) => r.cls === c).length;
  console.log(`\nok=${count("ok")} dead=${count("dead")} unreachable=${count("unreachable")} total=${results.length}`);
  process.exit(count("dead") > 0 ? 1 : 0);

}
void main();
