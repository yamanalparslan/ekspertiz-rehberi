/**
 * Çevrimdışı demo sonuçlarının özet öneki (src/lib/claude/offline-demo.ts: DEMO_SUMMARY_PREFIX).
 * O modül demo kaydını taşıdığı için tarayıcı paketine alınmaz; eşitliği demo.test.ts denetler.
 */
export const DEMO_PREFIX = "DEMO — ";

/** Demo sonucu mu; öyleyse önek atılmış özet (arayüz öneki metin olarak değil, rozet olarak gösterir). */
export function splitDemo(summary: string): { demo: boolean; text: string } {
  return summary.startsWith(DEMO_PREFIX)
    ? { demo: true, text: summary.slice(DEMO_PREFIX.length).trimStart() }
    : { demo: false, text: summary };
}
