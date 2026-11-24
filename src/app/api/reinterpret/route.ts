import { handleReinterpret } from "@/lib/pipeline/handlers";
import { buildDeps } from "@/lib/pipeline/http";

// Doğrulama, HTTP durumları ve akış: src/lib/pipeline/handlers.ts.
export function POST(req: Request): Promise<Response> {
  return handleReinterpret(req, buildDeps);
}
