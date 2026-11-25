export function LoadingSkeleton({ lines = 3 }: { lines?: number }): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 18, marginBottom: 10, width: `${String(100 - i * 12)}%` }} />
      ))}
    </div>
  );
}
