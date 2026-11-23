import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ekspertiz Rehberi",
  description: "Ekspertiz raporunuzu sade Türkçe ile anlayın.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
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
            <a
              href="/"
              className="-mx-2 flex min-h-12 items-center gap-2.5 rounded-lg px-2 text-[1.0625rem] font-bold tracking-tight"
            >
              <Mark />
              Ekspertiz Rehberi
            </a>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
