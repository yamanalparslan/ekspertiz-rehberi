import type { Metadata, Viewport } from "next";
import { GuardedLink } from "@/components/guarded-link";
import "./globals.css";

const DESCRIPTION =
  "İkinci el araç ekspertiz raporunuzun fotoğraflarını ya da PDF'ini yükleyin; her maddeyi sade Türkçeyle, dört grupta açıklayalım.";

export const metadata: Metadata = {
  title: "Ekspertiz Rehberi",
  applicationName: "Ekspertiz Rehberi",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Ekspertiz Rehberi",
    title: "Ekspertiz Rehberi",
    description: DESCRIPTION,
  },
  // iOS km ve fiyat gibi sayıları telefon numarası sanıp bağlantıya çevirmesin.
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e131d" },
  ],
};

/** Dört grup renginden oluşan işaret: dikkat, kronik, belirsiz, normal. */
function Mark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0">
      <rect x="0" y="0" width="9" height="9" rx="2" className="fill-dikkat-bar" />
      <rect x="11" y="0" width="9" height="9" rx="2" className="fill-kronik-bar" />
      <rect x="0" y="11" width="9" height="9" rx="2" className="fill-belirsiz-bar" />
      <rect x="11" y="11" width="9" height="9" rx="2" className="fill-normal-bar" />
    </svg>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className="min-h-dvh antialiased">
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-2xl items-center px-4 sm:px-6">
            <GuardedLink
              href="/"
              className="-mx-2 flex min-h-12 items-center gap-2.5 rounded-lg px-2 text-[1.0625rem] font-bold tracking-tight"
            >
              <Mark />
              Ekspertiz Rehberi
            </GuardedLink>
          </div>
        </header>
        <noscript>
          <div className="mx-auto mt-6 max-w-2xl px-4 sm:px-6">
            <p className="rounded-2xl border-l-[6px] border-kronik-bar bg-kronik-tint px-4 py-4 font-semibold text-kronik">
              Rapor yüklemek için tarayıcınızda JavaScript açık olmalı. Örnek sonucu JavaScript olmadan da
              görebilirsiniz: <a href="/ornek" className="underline">örnek sonuç</a>.
            </p>
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
