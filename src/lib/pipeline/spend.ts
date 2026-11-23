/** Europe/Istanbul takvim günü (YYYY-MM-DD). */
export function istanbulDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type SpendStore = {
  get(day: string): Promise<number>;
  add(day: string, usd: number): Promise<void>;
};

/** Minimal structural subset of D1Database used by the spend store. */
export type D1SpendDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

export function d1SpendStore(db: D1SpendDb): SpendStore {
  return {
    async get(day) {
      const row = await db
        .prepare("SELECT usd FROM daily_spend WHERE day = ?")
        .bind(day)
        .first<{ usd: number }>();
      return row?.usd ?? 0;
    },
    async add(day, usd) {
      await db
        .prepare(
          "INSERT INTO daily_spend (day, usd) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET usd = usd + excluded.usd",
        )
        .bind(day, usd)
        .run();
    },
  };
}

export const DEFAULT_CAP_USD = 10;

export function parseCap(v: string | undefined): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP_USD;
}
