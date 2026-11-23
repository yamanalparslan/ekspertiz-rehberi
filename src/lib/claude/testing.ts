import type { ClaudeLike } from "./client";

// Test yardımcısı: client.beta.messages.stream(params) çağrısını kaydeden sahte nesne.
export function fakeClient(msg: unknown) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          calls.push(params);
          return { finalMessage: async () => msg };
        },
      },
    },
  } as unknown as ClaudeLike;
  return { client, calls };
}

export function textMsg(
  text: string,
  stop_reason = "end_turn",
  usage = { input_tokens: 1000, output_tokens: 100 },
) {
  return { stop_reason, usage, content: [{ type: "text", text }] };
}
