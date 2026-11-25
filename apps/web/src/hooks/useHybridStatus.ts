import { useEffect, useState } from "react";

export type HybridStatus = "available" | "downloading" | "unavailable" | "unsupported" | "checking";

interface LanguageModelApi {
  availability: () => Promise<string>;
}
function getLanguageModel(): LanguageModelApi | null {
  const w = window as unknown as { LanguageModel?: LanguageModelApi };
  return w.LanguageModel ?? null;
}

/** Honest on-device availability probe. Never claims "local" when unknown. */
export function useHybridStatus(): HybridStatus {
  const [status, setStatus] = useState<HybridStatus>("checking");
  useEffect(() => {
    let cancelled = false;
    const lm = getLanguageModel();
    if (!lm) { setStatus("unsupported"); return; }
    lm.availability()
      .then((v) => {
        if (cancelled) return;
        if (v === "available") setStatus("available");
        else if (v === "downloading" || v === "downloadable") setStatus("downloading");
        else setStatus("unavailable");
      })
      .catch(() => { if (!cancelled) setStatus("unsupported"); });
    return () => { cancelled = true; };
  }, []);
  return status;
}
export function isChromeDesktop(): boolean {
  return /Chrome\//.test(navigator.userAgent) && !/Android|iPhone|iPad/.test(navigator.userAgent);
}
