import { expect, test } from "vitest";
import { classifyStatus, collectKbLinks } from "@/lib/kb/links";
import type { FirmsFile, GenericPricesFile, VehicleKbFile } from "@/lib/schema/kb";

const src = (url: string) => ({ url, title: "t", domain: "x.com" });

test("classifyStatus", () => {
  expect(classifyStatus(200)).toBe("ok");
  expect(classifyStatus(301)).toBe("ok");
  expect(classifyStatus(404)).toBe("dead");
  expect(classifyStatus(410)).toBe("dead");
  for (const s of [401, 403, 429, 500, 503]) expect(classifyStatus(s)).toBe("unreachable");
  expect(classifyStatus(null)).toBe("unreachable");
});

test("collectKbLinks groups records per URL", () => {
  const vehicle = {
    vehicle: { id: "v1" },
    chronicIssues: [
      { id: "c1", sources: [src("https://a.com/1"), src("https://b.com/2")] },
      { id: "c2", sources: [src("https://a.com/1")] },
    ],
    priceItems: [{ id: "p1", source: src("https://b.com/2") }],
  } as unknown as VehicleKbFile;
  const generic = { priceItems: [{ id: "g1", source: src("https://c.com/3") }] } as unknown as GenericPricesFile;
  const firms = { firms: [{ name: "F", verifyUrl: "https://d.com", note: "" }] } as FirmsFile;
  const links = collectKbLinks([vehicle], generic, firms);
  const by = Object.fromEntries(links.map((l) => [l.url, l.records]));
  expect(by["https://a.com/1"]).toEqual(["c1", "c2"]);
  expect(by["https://b.com/2"]).toEqual(["c1", "p1"]);
  expect(by["https://c.com/3"]).toEqual(["g1"]);
  expect(by["https://d.com"]).toEqual(["firm:F"]);
  expect(links).toHaveLength(4);
});
