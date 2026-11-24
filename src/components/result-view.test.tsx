import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  CONSULT_EXPERT,
  DISCLAIMER,
  GENERAL_UNVERIFIED,
  INTERNET_SOURCED,
  PRICE_MISSING,
  SINGLE_SOURCE,
} from "@/lib/copy";
import { cost, item, result } from "@/test/fixtures";
import { ResultView } from "./result-view";

const section = (name: RegExp) => screen.getByRole("region", { name });

test("gruplar dikkat, kronik, belirsiz, normal sırasıyla gelir; sorumluluk notu sonda", () => {
  render(
    <ResultView
      result={result([item({ group: "normal" }), item({ group: "belirsiz" }), item({ group: "dikkat" }), item({ group: "kronik" })])}
    />,
  );
  const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(headings.slice(0, 5)).toEqual(["Sonuç", "Dikkat1", "Kronik1", "Belirsiz1", "Normal1"]);
  expect(screen.getByText(DISCLAIMER)).toBeTruthy();
});

test("fiyatı olmayan dikkat/kronik/belirsiz maddesinde PRICE_MISSING yazar; normal satırda yazmaz", () => {
  render(
    <ResultView
      result={result([
        item({ group: "dikkat" }),
        item({ group: "kronik" }),
        item({ group: "belirsiz" }),
        item({ group: "normal" }),
        item({ group: "normal", cost: cost("https://fiyat.ornek.com/x") }),
      ])}
    />,
  );
  for (const g of [/^Dikkat/, /^Kronik/, /^Belirsiz/]) {
    expect(within(section(g)).getByText(PRICE_MISSING), String(g)).toBeTruthy();
  }
  const normal = section(/^Normal/);
  expect(within(normal).queryByText(PRICE_MISSING)).toBeNull();
  // Fiyatı olan normal madde maliyetini gösterir.
  expect(within(normal).getByText("8.000–14.000 TL")).toBeTruthy();
});

test("rozetler: kronik kaynaklı 'internet kaynaklı', düşük güven 'tek kaynak', genel bilgi 'genel bilgi, doğrulanmamış'", () => {
  const chronic = (confidence: "yuksek" | "dusuk") => ({
    issueId: "x",
    confidence,
    sources: [{ url: "https://forum.ornek.com/a", title: "Forum" }],
  });
  render(
    <ResultView
      result={result([
        item({ group: "kronik", title: "Yüksek güven", chronic: chronic("yuksek") }),
        item({ group: "kronik", title: "Düşük güven", chronic: chronic("dusuk") }),
        item({ group: "belirsiz", title: "Genel", generalUnverified: true }),
      ])}
    />,
  );
  const card = (title: string) => screen.getByRole("heading", { level: 3, name: title }).closest("li")!;
  expect(within(card("Yüksek güven")).getByText(INTERNET_SOURCED)).toBeTruthy();
  expect(within(card("Yüksek güven")).queryByText(SINGLE_SOURCE)).toBeNull();
  expect(within(card("Düşük güven")).getByText(SINGLE_SOURCE)).toBeTruthy();
  expect(within(card("Genel")).getByText(GENERAL_UNVERIFIED)).toBeTruthy();
  expect(within(card("Genel")).queryByText(INTERNET_SOURCED)).toBeNull();
});

test("dış bağlantılar yeni sekmede, yönlendiren bilgisi olmadan açılır; http(s) olmayan kaynak bağlantı olmaz", () => {
  render(
    <ResultView
      result={result([
        item({ group: "dikkat", title: "Bağlantılı", cost: cost("https://fiyat.ornek.com/lastik") }),
        item({ group: "dikkat", title: "Bozuk", cost: cost("javascript:alert(1)") }),
        item({
          group: "kronik",
          title: "Kaynaklı",
          chronic: {
            issueId: "x",
            confidence: "yuksek",
            sources: [
              { url: "https://a.ornek.com/1", title: "Kaynak A" },
              { url: "ftp://b.ornek.com/2", title: "Kaynak B" },
            ],
          },
        }),
      ])}
    />,
  );
  const links = screen.getAllByRole("link").filter((a) => a.getAttribute("target") === "_blank");
  expect(links.length).toBe(2);
  for (const a of links) {
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.getAttribute("href")).toMatch(/^https:\/\//);
  }
  expect(screen.queryByRole("link", { name: /Kaynak B/ })).toBeNull();
  const broken = screen.getByRole("heading", { level: 3, name: "Bozuk" }).closest("li")!;
  expect(within(broken).queryByRole("link")).toBeNull();
  expect(within(broken).getByText(/Fiyat kaynağı/)).toBeTruthy();
});

test("her dikkat maddesinde CONSULT_EXPERT var (uzun listede kapalı kartlarda da görünür); kronikte yok", () => {
  const dikkat = Array.from({ length: 7 }, () => item({ group: "dikkat" }));
  render(<ResultView result={result([...dikkat, item({ group: "kronik" })])} />);
  const cards = within(section(/^Dikkat/)).getAllByRole("listitem");
  expect(cards.length).toBe(7);
  for (const c of cards) {
    const consult = within(c).getByText(CONSULT_EXPERT);
    // Uyarı <details> dışında: kart kapalıyken de görünür.
    expect(consult.closest("details")).toBeNull();
  }
  expect(within(section(/^Kronik/)).queryByText(CONSULT_EXPERT)).toBeNull();
});

test("uzun listede ilk 3 kart açık, kalanlar kapalı; kısa listede hepsi açık", () => {
  render(
    <ResultView
      result={result([...Array.from({ length: 7 }, () => item({ group: "dikkat" })), ...Array.from({ length: 4 }, () => item({ group: "kronik" }))])}
    />,
  );
  const open = (g: RegExp) => [...section(g).querySelectorAll("details")].map((d) => d.open);
  expect(open(/^Dikkat/)).toEqual([true, true, true, false, false, false, false]);
  expect(open(/^Kronik/)).toEqual([true, true, true, true]);
  expect(within(section(/^Dikkat/)).getByText(/kalan 4 maddenin/)).toBeTruthy();
});

test("grup çubuğu sayıları gösterir ve gruplara bağlanır; maddesi olmayan grup bağlantı değildir", () => {
  render(<ResultView result={result([item({ group: "dikkat" }), item({ group: "dikkat" }), item({ group: "normal" })])} />);
  const nav = screen.getByRole("navigation", { name: "Gruplar" });
  expect(within(nav).getByRole("link", { name: "Dikkat: 2 madde" }).getAttribute("href")).toBe("#grup-dikkat");
  expect(within(nav).getByRole("link", { name: "Normal: 1 madde" }).getAttribute("href")).toBe("#grup-normal");
  expect(within(nav).queryByRole("link", { name: /Kronik/ })).toBeNull();
  expect(within(nav).getByText("Kronik")).toBeTruthy();
  expect(document.getElementById("grup-dikkat")).not.toBeNull();
});

test("demo sonucunda DEMO işareti görünür ve önek özette yazmaz", () => {
  render(<ResultView result={result([item({ group: "normal" })], { summary: "DEMO — Örnek araç özeti." })} />);
  expect(screen.getByRole("note").textContent).toMatch(/^DEMO/);
  expect(screen.getByText("Örnek araç özeti.")).toBeTruthy();
  expect(screen.queryByText(/DEMO — /)).toBeNull();
});

test("gerçek sonuçta DEMO işareti yok; sonuç başlığı programla odaklanabilir", () => {
  render(<ResultView result={result([item({ group: "normal" })])} />);
  expect(screen.queryByRole("note")).toBeNull();
  expect(screen.getByRole("heading", { level: 2, name: "Sonuç" }).getAttribute("tabindex")).toBe("-1");
});
