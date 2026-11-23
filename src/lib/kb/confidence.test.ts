import { expect, test } from "vitest";
import { confidenceFromSources } from "./confidence";
import type { Source } from "@/lib/schema/kb";

const s = (domain: string): Source => ({ url: `https://${domain}/x`, title: "t", domain });

test("güven: iki farklı alan adı yüksek, aynı alan adı iki kez düşük", () => {
  expect(confidenceFromSources([s("a.com"), s("b.com")])).toBe("yuksek");
  expect(confidenceFromSources([s("a.com"), s("a.com")])).toBe("dusuk");
});

test("www. öneki ve büyük harf aynı alan adı sayılır", () => {
  expect(confidenceFromSources([s("www.A.com"), s("a.com")])).toBe("dusuk");
});

test("şikayet siteleri bağımsız kaynak sayılmaz", () => {
  expect(confidenceFromSources([s("araclo.com"), s("sikayetvar.com")])).toBe("dusuk");
  expect(confidenceFromSources([s("araclo.com"), s("www.sikayetvar.com")])).toBe("dusuk");
  expect(confidenceFromSources([s("araclo.com"), s("carcomplaints.com")])).toBe("yuksek");
  expect(confidenceFromSources([s("sikayetvar.com"), s("a.com"), s("b.com")])).toBe("yuksek");
});

test("kaynak yoksa düşük", () => {
  expect(confidenceFromSources([])).toBe("dusuk");
});
