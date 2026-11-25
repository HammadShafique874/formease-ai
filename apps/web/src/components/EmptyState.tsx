import type { ReactNode } from "react";
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {action}
    </div>
  );
}
