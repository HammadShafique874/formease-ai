import type { ReactNode } from "react";
export function Badge({ children, tone }: { children: ReactNode; tone?: "local" | "cloud" | "mixed" | "unavailable" | "default" }): React.JSX.Element {
  const cls = tone && tone !== "default" ? `badge badge-${tone}` : "badge";
  return <span className={cls}>{children}</span>;
}
