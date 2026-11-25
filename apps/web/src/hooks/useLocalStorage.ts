import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });
  const set = useCallback((v: T) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // Storage full / unavailable (private mode): keep in-memory value only.
    }
  }, [key]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try { setValue(JSON.parse(e.newValue) as T); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  return [value, set];
}
