import { connection } from "next/server";
import { Home } from "@/components/home";
import { configuredProvider } from "@/lib/pipeline/http";

/**
 * Ana sayfa. Açık rıza metninin altında raporun gerçekte hangi yapay zeka hizmetine gittiği
 * yazar; sağlayıcı istek anında sunucu ortamından okunur (anahtar değil, yalnız ad).
 */
export default async function Page() {
  await connection(); // ön oluşturma burada durur: ortam derlemede değil, istekte okunur
  return <Home provider={configuredProvider()} />;
}
