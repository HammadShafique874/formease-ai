// Extension-local scan validation + URL transfer helpers.
// Mirrors @formease/shared schemas/transfer, kept local so the extension
// dist/ stays self-contained (no node_modules are shipped with it).
import type { ExtensionScan } from "@formease/shared";
import { MAX_URL_SCAN_BYTES } from "./limits.js";

export { MAX_URL_SCAN_BYTES };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateExtensionScanLocal(v: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(v)) return { ok: false, errors: ["ExtensionScan must be an object"] };
  if (typeof v.id !== "string" || v.id === "") errors.push("id must be a non-empty string");
  if (typeof v.url !== "string" || v.url === "") errors.push("url must be a non-empty string");
  if (typeof v.title !== "string") errors.push("title must be a string");
  if (typeof v.scannedAt !== "string" || Number.isNaN(Date.parse(v.scannedAt))) errors.push("scannedAt must be an ISO date string");
  if (v.language !== "en" && v.language !== "simple-en" && v.language !== "roman-ur") errors.push("language must be en, simple-en or roman-ur");
  if (!Array.isArray(v.fields)) errors.push("fields must be an array");
  else {
    if (v.fields.length > 200) errors.push("fields must have at most 200 entries");
    v.fields.forEach((f, i) => {
      if (!isRecord(f)) { errors.push(`fields[${String(i)}]: must be an object`); return; }
      if (typeof f.id !== "string" || f.id === "") errors.push(`fields[${String(i)}]: id must be a non-empty string`);
      if (typeof f.label !== "string" || f.label.trim() === "") errors.push(`fields[${String(i)}]: label must be a non-empty string`);
      if (typeof f.type !== "string" || f.type === "") errors.push(`fields[${String(i)}]: type must be a non-empty string`);
      if (typeof f.required !== "boolean") errors.push(`fields[${String(i)}]: required must be a boolean`);
      if (typeof f.isUpload !== "boolean") errors.push(`fields[${String(i)}]: isUpload must be a boolean`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function isValidExtensionScanLocal(v: unknown): v is ExtensionScan {
  return validateExtensionScanLocal(v).ok;
}

export function encodeScanForUrl(scan: ExtensionScan): string | null {
  const json = JSON.stringify(scan);
  if (new TextEncoder().encode(json).length > MAX_URL_SCAN_BYTES) return null;
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isSmallEnoughForUrl(scan: ExtensionScan): boolean {
  return new TextEncoder().encode(JSON.stringify(scan)).length <= MAX_URL_SCAN_BYTES;
}
