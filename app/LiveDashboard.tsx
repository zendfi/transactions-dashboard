"use client";

import { useEffect, useRef, useState } from "react";
import type { Stats } from "@/lib/stats";

const POLL_MS = 10_000;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-US");

// Smoothly tweens from the previous value to the new one.
function useTween(target: number, ms = 1200) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(a + (target - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export default function LiveDashboard({ initial }: { initial: Stats | null }) {
  const [stats, setStats] = useState<Stats | null>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/stats", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data: Stats = await r.json();
        if (alive) { setStats(data); setFailed(false); }
      } catch {
        if (alive) setFailed(true);
      }
    };
    if (!initial) load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [initial]);

  const count = useTween(stats?.totalCount ?? 0);
  const value = useTween(stats?.totalValueUsd ?? 0);

  return (
    <main>
      <div className="header">
        <div>
          <h1>Zend + ZendFi</h1>
          <div className="sub">Mainnet only. Successful transactions across payments, transfers, Paj and Bridge.</div>
        </div>
        <div className="live" role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          {failed ? "Reconnecting…" : "Live"}
          {stats && <span className="sub" style={{ margin: 0 }}>· {new Date(stats.generatedAt).toLocaleTimeString()}</span>}
        </div>
      </div>

      <section className="hero" aria-label="Totals">
        <div className="card">
          <div className="label">Total value processed</div>
          <div className="big">{usd.format(value)}</div>
        </div>
        <div className="card">
          <div className="label">Total transactions</div>
          <div className="big">{int.format(Math.round(count))}</div>
        </div>
      </section>

      <section className="card" aria-label="Breakdown by source">
        <table>
          <thead>
            <tr><th>Source</th><th>Product</th><th className="num">Transactions</th><th className="num">Value</th></tr>
          </thead>
          <tbody>
            {stats?.sources.map((s) => (
              <tr key={s.key}>
                <td>{s.label}{s.error && <span className="err">({s.error})</span>}</td>
                <td><span className="tag">{s.product}</span></td>
                <td className="num">{int.format(s.count)}</td>
                <td className="num">{usd.format(s.valueUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
