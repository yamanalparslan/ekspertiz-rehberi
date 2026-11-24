import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * Content-Security-Policy (CourtMax örneği).
 *
 * - `script-src 'unsafe-inline'`: Next.js hidrasyon verisini satır içi `<script>` ile gömüyor;
 *   nonce için bir proxy katmanı gerekir (ayrı iş). React'ın geliştirme modu `eval()` kullandığı
 *   için `'unsafe-eval'` yalnız geliştirmede eklenir; üretim politikası gevşemez.
 * - `connect-src 'self'`: tarayıcı yalnız kendi API'mize bağlanır (model çağrıları sunucuda).
 * - `img-src data: blob:`: yüklenen fotoğrafların önizlemesi ve küçültme (canvas -> blob).
 * - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
 */
const DEV = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** Kamera yükleme için kendi kökenimize açık (telefonda rapor fotoğrafı); diğer güçlü API'ler kapalı. */
const PERMISSIONS = "camera=(self), microphone=(), geolocation=(), payment=(), usb=()";

const nextConfig: NextConfig = {
  // "X-Powered-By: Next.js" gönderilmez.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // frame-ancestors bunu kapsar; CSP anlamayan eski tarayıcılar için.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: PERMISSIONS },
        ],
      },
      // API yanıtları (hata gövdeleri dahil) hiçbir yerde önbelleğe alınmaz.
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      // Örnek sonuç sayfası arama motorlarında görünmesin.
      {
        source: "/ornek",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;

// Geliştirme ortamında Cloudflare bağlamını (env, bindings) açar.
initOpenNextCloudflareForDev();
