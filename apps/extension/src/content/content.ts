// Content script: detects form fields on the real page and extracts the
// MINIMUM context needed (label, type, required, placeholder). It never reads
// field VALUES, never reads unrelated page content, and never auto-fills or
// submits anything. The floating panel is NOT injected on page load — the
// script only acts when the popup sends a message (user action).
//
// NOTE: manifest content scripts are classic scripts, not ES modules, so this
// file is deliberately self-contained — no imports at all. The small
// constants/validators below mirror apps/extension/src/shared/{config,transfer}
// (the single source of truth lives there; change the dashboard URL in both
// places in Phase 5, or bundle this file then).
interface DetectedField {
  id: string;
  label: string;
  type: string;
  name?: string;
  required: boolean;
  placeholder?: string;
  isUpload: boolean;
}

const DASHBOARD_BASE_URL = "https://formease-ai-933b6.web.app";
const SCAN_STORAGE_PREFIX = "formease:scan:";
const INCOMING_SCAN_KEY = "formease.incomingScan";
const INCOMING_SCAN_EVENT = "formease:incoming-scan";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isValidExtensionScan(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (typeof v.id !== "string" || v.id === "") return false;
  if (typeof v.url !== "string" || v.url === "") return false;
  if (typeof v.title !== "string") return false;
  if (typeof v.scannedAt !== "string" || Number.isNaN(Date.parse(v.scannedAt))) return false;
  if (v.language !== "en" && v.language !== "simple-en" && v.language !== "roman-ur") return false;
  if (!Array.isArray(v.fields) || v.fields.length > 200) return false;
  return v.fields.every((f) => {
    if (!isRecord(f)) return false;
    return typeof f.id === "string" && f.id !== ""
      && typeof f.label === "string" && f.label.trim() !== ""
      && typeof f.type === "string" && f.type !== ""
      && typeof f.required === "boolean" && typeof f.isUpload === "boolean";
  });
}
function isExtensionMessage(v: unknown): v is { type: string; fieldId?: string } {
  if (!isRecord(v)) return false;
  const t = v.type;
  return t === "SCAN_FORM" || t === "HIGHLIGHT_FIELD" || t === "OPEN_DASHBOARD";
}

/**
 * Dashboard bridge — runs ONLY on the FormEase dashboard origin.
 * When the dashboard URL carries ?scan=<id>, this reads that scan from
 * chrome.storage.local, validates its shape, and hands it to the web app
 * via localStorage + a window event. It never runs on any other origin and
 * never writes anything except the validated scan payload.
 */
async function bridgeIncomingScan(): Promise<void> {
  if (window.location.origin !== DASHBOARD_BASE_URL) return;
  const hash = window.location.hash;
  const query = hash.split("?")[1] ?? "";
  const scanId = new URLSearchParams(query).get("scan");
  if (!scanId) return;
  try {
    const stored = await chrome.storage.local.get(`${SCAN_STORAGE_PREFIX}${scanId}`);
    const scan = stored[`${SCAN_STORAGE_PREFIX}${scanId}`];
    if (!isValidExtensionScan(scan)) return;
    window.localStorage.setItem(INCOMING_SCAN_KEY, JSON.stringify(scan));
    window.dispatchEvent(new Event(INCOMING_SCAN_EVENT));
    await chrome.storage.local.remove(`${SCAN_STORAGE_PREFIX}${scanId}`);
  } catch {
    // Bridge unavailable (e.g. storage blocked) — the dashboard falls back
    // to the ?scanData= URL transfer or shows an honest message.
  }
}

void bridgeIncomingScan();


function labelFor(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const id = el.id;
  if (id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (byFor?.textContent?.trim()) return byFor.textContent.trim();
  }
  const wrapping = el.closest("label");
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((x) => document.getElementById(x)?.textContent?.trim() ?? "").filter(Boolean).join(" ");
    if (text) return text;
  }
  const ph = "placeholder" in el ? el.placeholder : "";
  if (ph?.trim()) return ph.trim();
  const fieldset = el.closest("fieldset");
  const legend = fieldset?.querySelector("legend")?.textContent?.trim();
  if (legend) return legend;
  return el.name?.trim() || el.type || el.tagName.toLowerCase();
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function detectFields(): DetectedField[] {
  const els = document.querySelectorAll("input, textarea, select");
  const out: DetectedField[] = [];
  els.forEach((node, i) => {
    const el = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "submit" || el.type === "button")) return;
    if (!isVisible(el)) return;
    const type = el instanceof HTMLInputElement ? el.type || "text" : el.tagName.toLowerCase();
    out.push({
      id: `formease-field-${String(i)}`,
      label: labelFor(el),
      type,
      name: el.name || undefined,
      required: el.required || el.getAttribute("aria-required") === "true",
      placeholder: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.placeholder || undefined : undefined,
      isUpload: el instanceof HTMLInputElement && el.type === "file",
    });
    el.setAttribute("data-formease-field", `formease-field-${String(i)}`);
  });
  return out;
}

function highlight(fieldId: string): boolean {
  const el = document.querySelector(`[data-formease-field="${CSS.escape(fieldId)}"]`) as HTMLElement | null;
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.style.outline = "3px solid #5b5ce2";
  el.style.outlineOffset = "2px";
  el.focus({ preventScroll: true });
  window.setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; }, 4000);
  return true;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (r: unknown) => void) => {
  if (!isExtensionMessage(message)) { sendResponse({ ok: false, error: "Unknown message type" }); return false; }
  if (message.type === "SCAN_FORM") {
    try { sendResponse({ ok: true, fields: detectFields() }); } catch (err) { sendResponse({ ok: false, error: err instanceof Error ? err.message : "Scan failed" }); }
    return false;
  }
  if (message.type === "HIGHLIGHT_FIELD") {
    sendResponse({ ok: typeof message.fieldId === "string" && highlight(message.fieldId) });
    return false;
  }
  sendResponse({ ok: false, error: "Message not handled by content script" });
  return false;
});
