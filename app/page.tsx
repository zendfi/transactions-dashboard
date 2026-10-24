import { getStats, type Stats } from "@/lib/stats";
import LiveDashboard from "./LiveDashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  let initial: Stats | null = null;
  try {
    initial = await getStats();
  } catch (e) {
    console.error("[page] initial stats failed", e);
  }
  return <LiveDashboard initial={initial} />;
}
