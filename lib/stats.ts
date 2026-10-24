import { getPool } from "./db";

export type Source = {
  key: string;
  label: string;
  product: "ZendFi" | "Zend";
  count: number;
  valueUsd: number;
  error?: string;
};

export type Stats = {
  totalCount: number;
  totalValueUsd: number;
  sources: Source[];
  generatedAt: string;
};

// Mainnet-only, successful transactions. Each source is chosen so that a
// single money movement is counted once (see notes per query).
type SourceDef = Omit<Source, "count" | "valueUsd" | "error"> & { sql: string };

// Schema notes (ZendFi DB, migrations up to 0130):
// - payments is the canonical ledger. mode='live' = mainnet. Confirmed rows
//   include checkout, links, invoices, subscriptions, terminal charges and
//   PAJ on-ramps that settle into a payment (paj_ramp_orders.payment_id).
// - PAJ on-ramps NOT linked to a payment are counted separately.
// - PAJ off-ramps: status 'PAID' is set once USDC is sent on mainnet to PAJ
//   (paj_offramp.rs, always Live mode). Not represented in payments.
// - withdrawals / settlements are merchant payouts, not volume: excluded.
const SOURCES: SourceDef[] = [
  {
    key: "payments",
    label: "Merchant payments",
    product: "ZendFi",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(amount_usd),0)::float8 AS v
          FROM payments
          WHERE status = 'confirmed' AND mode = 'live'`,
  },
  {
    key: "paj_onramp",
    label: "Paj on-ramp (unlinked)",
    product: "ZendFi",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(token_amount),0)::float8 AS v
          FROM paj_ramp_orders
          WHERE order_type = 'onramp' AND status = 'COMPLETED'
            AND payment_id IS NULL AND payment_intent_id IS NULL`,
  },
  {
    key: "paj_offramp",
    label: "Paj off-ramp",
    product: "ZendFi",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(token_amount),0)::float8 AS v
          FROM paj_ramp_orders
          WHERE order_type = 'offramp' AND status IN ('PAID','COMPLETED')`,
  },
];

let cache: { at: number; data: Stats } | null = null;
const TTL_MS = 10_000;

export async function getStats(): Promise<Stats> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const pool = getPool();
  const sources: Source[] = await Promise.all(
    SOURCES.map(async ({ sql, ...meta }) => {
      try {
        const { rows } = await pool.query<{ c: string; v: number }>(sql);
        return { ...meta, count: Number(rows[0].c), valueUsd: rows[0].v };
      } catch (e) {
        // One broken source shouldn't take the dashboard down.
        console.error(`[stats] ${meta.key} failed:`, e);
        // Surface only the error code (no message) so no connection details leak.
        const code =
          (e as { code?: string })?.code ??
          (String(e).includes("DATABASE_URL") ? "NO_DATABASE_URL" : "unavailable");
        return { ...meta, count: 0, valueUsd: 0, error: code };
      }
    }),
  );

  const data: Stats = {
    totalCount: sources.reduce((a, s) => a + s.count, 0),
    totalValueUsd: sources.reduce((a, s) => a + s.valueUsd, 0),
    sources,
    generatedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };
  return data;
}
