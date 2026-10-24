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

const SOURCES: SourceDef[] = [
  {
    // Canonical merchant ledger. Includes checkout, payment links, intents,
    // and PAJ on-ramps that settle into a payment row.
    key: "zendfi_payments",
    label: "Merchant payments",
    product: "ZendFi",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(amount_usd),0)::float8 AS v
          FROM payments
          WHERE status = 'confirmed' AND mode = 'live' AND user_id IS NULL`,
  },
  {
    // Zend user payment links write into payments with user_id set.
    key: "zend_payment_links",
    label: "Payment links",
    product: "Zend",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(amount_usd),0)::float8 AS v
          FROM payments
          WHERE status = 'confirmed' AND mode = 'live' AND user_id IS NOT NULL`,
  },
  {
    // P2P sends, pay-merchant, pool contributions (pool_contributions points
    // here, so it is intentionally not summed separately).
    key: "zend_transfers",
    label: "Transfers",
    product: "Zend",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(amount_usdc),0)::float8 AS v
          FROM zend_transfers
          WHERE status = 'confirmed' AND network = 'mainnet'`,
  },
  {
    key: "paj_bank_sends",
    label: "Paj off-ramp (bank sends)",
    product: "Zend",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(amount_usdc),0)::float8 AS v
          FROM user_bank_send_orders
          WHERE status = 'completed' AND blockchain_network = 'mainnet'`,
  },
  {
    key: "paj_payins",
    label: "Paj on-ramp (pay-ins)",
    product: "Zend",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(amount_usdc),0)::float8 AS v
          FROM user_payin_orders
          WHERE status = 'completed' AND settlement_network = 'mainnet'`,
  },
  {
    // Orders linked to a payment / intent are already counted via payments.
    key: "paj_ramp_orders",
    label: "Paj ramp orders",
    product: "ZendFi",
    sql: `SELECT COUNT(*)::bigint AS c, COALESCE(SUM(token_amount),0)::float8 AS v
          FROM paj_ramp_orders
          WHERE status = 'COMPLETED'
            AND payment_id IS NULL AND payment_intent_id IS NULL`,
  },
  {
    // Bridge is a real-money rail (no sandbox flag in our schema).
    // amount is stored as text; ignore anything non-numeric.
    key: "bridge_transfers",
    label: "Bridge transfers",
    product: "ZendFi",
    sql: `SELECT COUNT(*)::bigint AS c,
                 COALESCE(SUM(CASE WHEN amount ~ '^[0-9]+(\\.[0-9]+)?$'
                                   THEN amount::numeric END),0)::float8 AS v
          FROM bridge_transfers
          WHERE state = 'payment_processed' AND deleted_at IS NULL
            AND LOWER(COALESCE(currency,'usd')) IN ('usd','usdc','usdt','usdb')`,
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
