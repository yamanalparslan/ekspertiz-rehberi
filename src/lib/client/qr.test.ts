import { expect, test } from "vitest";
import { decodeQr, qrLink } from "./qr";

test("qrLink yalnız http(s) bağlantı kabul eder ve alan adını verir", () => {
  expect(qrLink("https://www.ornek.com/r/YAV-1")).toEqual({
    url: "https://www.ornek.com/r/YAV-1",
    domain: "ornek.com",
  });
  expect(qrLink("javascript:alert(1)")).toBeNull();
});

test("qrLink düz http bağlantısını ve boşlukları kabul eder, alan adını küçük harfe çevirir", () => {
  expect(qrLink("  http://Rapor.Firma.com.tr/abc?x=1 \n")).toEqual({
    url: "http://rapor.firma.com.tr/abc?x=1",
    domain: "rapor.firma.com.tr",
  });
});

test("qrLink bağlantı olmayan veya başka şemalı metinleri reddeder", () => {
  expect(qrLink("YAV-123456")).toBeNull();
  expect(qrLink("")).toBeNull();
  expect(qrLink("ftp://ornek.com/rapor")).toBeNull();
  expect(qrLink("data:text/html,<b>x</b>")).toBeNull();
  expect(qrLink("mailto:a@ornek.com")).toBeNull();
});

test("qrLink kullanıcı adı/parola içeren yanıltıcı bağlantıyı reddeder", () => {
  // Görünüşte firma.com, aslında kotu.example adresine gider.
  expect(qrLink("https://firma.com@kotu.example/rapor")).toBeNull();
});

test("decodeQr boş görüntüde null döner", () => {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  expect(decodeQr({ data, width, height } as ImageData)).toBeNull();
});
