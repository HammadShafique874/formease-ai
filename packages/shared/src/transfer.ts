// Extension → dashboard transfer helpers. Pure functions, chrome-free, so the
// web app and a node smoke test can exercise them identically.
import type { DetectedField, ExtensionScan, Language } from "./types.js";
import { validateExtensionScan } from "./schemas.js";

export const MAX_URL_SCAN_BYTES = 8 * 1024;

/** Base64url encode/decode that works in browsers and node. */
export function encodeScanForUrl(scan: ExtensionScan): string | null {
  const json = JSON.stringify(scan);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_URL_SCAN_BYTES) return null;
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeScanFromUrl(encoded: string): { ok: true; scan: ExtensionScan } | { ok: false; errors: string[] } {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64)));
    const parsed: unknown = JSON.parse(json);
    const v = validateExtensionScan(parsed);
    if (!v.ok) return { ok: false, errors: v.errors };
    return { ok: true, scan: parsed as ExtensionScan };
  } catch {
    return { ok: false, errors: ["Could not decode the scan in the URL — it may be truncated or corrupted."] };
  }
}

export function scanUrl(scan: ExtensionScan, dashboardBase: string): string | null {
  const encoded = encodeScanForUrl(scan);
  if (!encoded) return null;
  return `${dashboardBase}/#/workspace?scanData=${encoded}`;
}

export function isSmallEnoughForUrl(scan: ExtensionScan): boolean {
  return new TextEncoder().encode(JSON.stringify(scan)).length <= MAX_URL_SCAN_BYTES;
}

export function languageLabel(lang: Language): string {
  return lang === "roman-ur" ? "Roman Urdu" : lang === "simple-en" ? "Simple English" : "English";
}

export type { DetectedField };
