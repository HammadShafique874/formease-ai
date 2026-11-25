import type { ReactNode } from "react";
export function Card({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <div className={className ? `card ${className}` : "card"}>{children}</div>;
}
