// Re-export shared types. Local copies are NOT duplicated here.
export type { DetectedField, ExtensionScan, FieldExplanation, FormGuide, Language } from "@formease/shared";

export type ExtensionMessage =
  | { type: "SCAN_FORM" }
  | { type: "HIGHLIGHT_FIELD"; fieldId: string }
  | { type: "OPEN_DASHBOARD" }
  | { type: "STORE_SCAN_AND_OPEN"; scan: unknown };

export function isExtensionMessage(v: unknown): v is ExtensionMessage {
  if (typeof v !== "object" || v === null) return false;
  const t = (v as { type?: unknown }).type;
  return t === "SCAN_FORM" || t === "HIGHLIGHT_FIELD" || t === "OPEN_DASHBOARD" || t === "STORE_SCAN_AND_OPEN";
}
