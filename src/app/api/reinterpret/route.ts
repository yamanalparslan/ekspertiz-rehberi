import { z } from "zod";
import { buildDeps, errorEvent, ndjsonResponse } from "@/lib/pipeline/http";
import { runReinterpret } from "@/lib/pipeline/run";
import { VehicleSchema } from "@/lib/schema/result";

const BodySchema = z.object({ token: z.string().optional(), vehicle: VehicleSchema });

export async function POST(req: Request): Promise<Response> {
  const usd = { total: 0 };
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }

  return ndjsonResponse(
    "reinterpret",
    0,
    async (emit) => {
      const parsed = BodySchema.safeParse(body);
      if (!parsed.success) return emit(errorEvent("internal"));
      if (!parsed.data.token) return emit(errorEvent("token_invalid"));
      const deps = buildDeps(usd);
      if (!deps) return emit(errorEvent("internal"));
      await runReinterpret(deps, { token: parsed.data.token, vehicle: parsed.data.vehicle }, emit);
    },
    usd,
  );
}
