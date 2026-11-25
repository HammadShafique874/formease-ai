import { summarizeAiError } from "@formease/shared";
import { Button } from "./Button.tsx";

/**
 * Shows an AI failure the way a user can understand it: one short
 * plain-language sentence, an optional retry button, and the raw technical
 * error hidden behind a collapsed "technical details" disclosure. The raw
 * Firebase/HTTP dump must never be the visible text — it is a wall of URLs
 * and JSON that no user can act on.
 */
export function FriendlyError({ raw, onRetry, retryLabel }: { raw: string; onRetry?: () => void; retryLabel?: string }): React.JSX.Element {
  const { summary, detail } = summarizeAiError(raw);
  const showDetails = detail !== "" && detail !== summary;
  return (
    <div>
      <p style={{ margin: 0 }}>{summary}</p>
      {onRetry ? (
        <div style={{ marginTop: 10 }}>
          <Button variant="secondary" onClick={onRetry}>{retryLabel ?? "Try again"}</Button>
        </div>
      ) : null}
      {showDetails ? (
        <details style={{ marginTop: 8 }}>
          <summary className="small muted">Show technical details</summary>
          <p className="small" style={{ wordBreak: "break-word", whiteSpace: "pre-wrap", marginBottom: 0 }}>
            {detail.length > 2000 ? `${detail.slice(0, 2000)}…` : detail}
          </p>
        </details>
      ) : null}
    </div>
  );
}
