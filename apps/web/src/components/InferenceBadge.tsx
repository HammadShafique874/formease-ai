import type { InferenceRoute } from "@formease/shared";
import { formatLatency } from "@formease/shared";
import { Badge } from "./Badge.tsx";

// The badge reports only what a real AI run reported. "unavailable" never
// claims a cause on its own — callers pass the actual reason when they know
// it (e.g. "Firebase not configured" only when the config really is missing,
// or the per-field error). Previously this badge hard-coded
// "AI unavailable — Firebase not configured" for EVERY unavailable route,
// which contradicted the Dashboard when Firebase was configured and the run
// had failed for a different reason (e.g. on-device model unavailable).
export function InferenceBadge({ route, latencyMs, attempts, reason }: { route: InferenceRoute; latencyMs?: number; attempts?: number; reason?: string }): React.JSX.Element {
  const suffix = `${latencyMs !== undefined ? ` · ${formatLatency(latencyMs)}` : ""}${attempts !== undefined && attempts > 1 ? ` · ${String(attempts)} attempts` : ""}`;
  if (route === "local") return <Badge tone="local"><span className="dot" /> Local — on device{suffix}</Badge>;
  if (route === "cloud") return <Badge tone="cloud"><span className="dot" /> Cloud — Firebase AI{suffix}</Badge>;
  if (route === "mixed") return <Badge tone="mixed"><span className="dot" /> Mixed — on-device + cloud{suffix}</Badge>;
  return <Badge tone="unavailable"><span className="dot" /> AI unavailable{reason ? ` — ${reason}` : " — no successful AI run yet"}</Badge>;
}
