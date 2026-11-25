// Popup: scans the current page, shows a summary, and sends the scan to the
// dashboard (storage bridge first, URL fallback for small scans).
// It contains NO Firebase / AI code — AI lives in the web app.
import type { DetectedField, ExtensionScan, Language } from "@formease/shared";
import { DASHBOARD_BASE_URL, DASHBOARD_URL, SETTINGS_URL } from "../shared/config.js";
import { encodeScanForUrl, isSmallEnoughForUrl } from "../shared/transfer.js";

function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}
async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

let lastScan: ExtensionScan | null = null;
let lastTabUrl = "";

function renderFields(fields: DetectedField[]): void {
  const box = el<HTMLDivElement>("fields");
  box.textContent = "";
  for (const f of fields.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "field-item";
    const label = document.createElement("span");
    label.textContent = `${f.label}${f.required ? " *" : ""}${f.isUpload ? " (upload)" : ""}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary";
    btn.textContent = "Highlight";
    btn.addEventListener("click", () => {
      void (async () => {
        const tab = await activeTab();
        if (tab?.id !== undefined) {
          await chrome.tabs.sendMessage(tab.id, { type: "HIGHLIGHT_FIELD", fieldId: f.id }).catch(() => undefined);
        }
      })();
    });
    row.append(label, btn);
    box.append(row);
  }
  if (fields.length > 8) {
    const more = document.createElement("p");
    more.className = "muted small";
    more.textContent = `+ ${String(fields.length - 8)} more fields — open the dashboard for the full guide.`;
    box.append(more);
  }
}

function renderSummary(): void {
  const box = el<HTMLDivElement>("summary");
  const sendBtn = el<HTMLButtonElement>("send-dashboard");
  const copyBtn = el<HTMLButtonElement>("copy-scan");
  if (!lastScan) {
    box.textContent = "";
    sendBtn.disabled = true;
    copyBtn.disabled = true;
    return;
  }
  const required = lastScan.fields.filter((f) => f.required).length;
  const uploads = lastScan.fields.filter((f) => f.isUpload).length;
  box.textContent = `${String(lastScan.fields.length)} fields detected · ${String(required)} required · ${String(uploads)} upload field${uploads === 1 ? "" : "s"} · from ${lastTabUrl ? new URL(lastTabUrl).hostname : "this page"}`;
  sendBtn.disabled = false;
  copyBtn.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const status = el<HTMLParagraphElement>("status");
  const langSel = el<HTMLSelectElement>("lang");
  void (async () => {
    const tab = await activeTab();
    lastTabUrl = tab?.url ?? "";
    el<HTMLDivElement>("page-info").textContent = tab?.url ? new URL(tab.url).hostname : "No active tab";
    const stored = await chrome.storage.local.get("formease:language");
    const lang = stored["formease:language"];
    if (typeof lang === "string") langSel.value = lang;
    const last = await chrome.storage.local.get("formease:last-scan");
    const prev = last["formease:last-scan"];
    if (prev && typeof prev === "object" && prev !== null && Array.isArray((prev as { fields?: unknown }).fields)) {
      const p = prev as { url?: string; title?: string; fields: DetectedField[]; at?: string; language?: Language };
      lastScan = {
        id: newId("scan"),
        url: typeof p.url === "string" ? p.url : "",
        title: typeof p.title === "string" ? p.title : "",
        scannedAt: typeof p.at === "string" ? p.at : new Date().toISOString(),
        language: (langSel.value as Language) ?? "en",
        fields: p.fields,
      };
      renderFields(p.fields);
      renderSummary();
      status.textContent = "Last scan restored from this browser.";
    }
  })();
  langSel.addEventListener("change", () => {
    void chrome.storage.local.set({ "formease:language": langSel.value as Language });
    if (lastScan) lastScan.language = langSel.value as Language;
  });
  el<HTMLButtonElement>("scan").addEventListener("click", () => {
    void (async () => {
      const btn = el<HTMLButtonElement>("scan");
      btn.disabled = true;
      status.textContent = "Scanning this page…";
      try {
        const tab = await activeTab();
        if (!tab?.id) { status.textContent = "No active tab to scan."; return; }
        const res = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_FORM" }) as { ok: boolean; fields?: DetectedField[]; error?: string };
        if (!res.ok || !res.fields) { status.textContent = res.error ?? "Scan failed — reload the page and try again."; return; }
        lastTabUrl = tab.url ?? "";
        lastScan = {
          id: newId("scan"),
          url: tab.url ?? "",
          title: tab.title ?? "",
          scannedAt: new Date().toISOString(),
          language: langSel.value as Language,
          fields: res.fields,
        };
        await chrome.storage.local.set({ "formease:last-scan": { url: tab.url ?? "", title: tab.title ?? "", fields: res.fields, at: lastScan.scannedAt } });
        status.textContent = res.fields.length === 0
          ? "No form fields detected on this page."
          : `${String(res.fields.length)} field${res.fields.length === 1 ? "" : "s"} detected. Send it to the dashboard for explanations (phrasebook/local — AI is Phase 5).`;
        renderFields(res.fields);
        renderSummary();
      } catch (err) {
        status.textContent = err instanceof Error ? `Scan failed: ${err.message}` : "Scan failed — reload the page and try again.";
      } finally {
        btn.disabled = false;
      }
    })();
  });
  el<HTMLButtonElement>("send-dashboard").addEventListener("click", () => {
    void (async () => {
      const btn = el<HTMLButtonElement>("send-dashboard");
      if (!lastScan) return;
      btn.disabled = true;
      status.textContent = "Sending scan to dashboard…";
      try {
        const res = await chrome.runtime.sendMessage({ type: "STORE_SCAN_AND_OPEN", scan: lastScan }) as { ok: boolean; error?: string };
        if (res.ok) {
          status.textContent = "Scan sent — the dashboard workspace will open with your fields.";
          return;
        }
        // Storage bridge failed: fall back to a URL transfer for small scans.
        if (isSmallEnoughForUrl(lastScan)) {
          const encoded = encodeScanForUrl(lastScan);
          if (encoded) {
            await chrome.tabs.create({ url: `${DASHBOARD_BASE_URL}/#/workspace?scanData=${encoded}` });
            status.textContent = "Storage bridge unavailable — sent via URL instead.";
            return;
          }
        }
        status.textContent = res.error ?? "Scan too large for URL transfer — open the dashboard and use storage transfer (send again from the popup).";
      } catch {
        if (lastScan && isSmallEnoughForUrl(lastScan)) {
          const encoded = encodeScanForUrl(lastScan);
          if (encoded) {
            await chrome.tabs.create({ url: `${DASHBOARD_BASE_URL}/#/workspace?scanData=${encoded}` });
            status.textContent = "Storage bridge unavailable — sent via URL instead.";
            return;
          }
        }
        status.textContent = "Scan too large for URL transfer — open the dashboard and use storage transfer.";
      } finally {
        btn.disabled = false;
      }
    })();
  });
  el<HTMLButtonElement>("copy-scan").addEventListener("click", () => {
    void (async () => {
      if (!lastScan) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(lastScan, null, 2));
        status.textContent = "Scan JSON copied to clipboard.";
      } catch {
        status.textContent = "Copy failed — clipboard unavailable in the popup.";
      }
    })();
  });
  el<HTMLButtonElement>("open-dashboard").addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" }).catch(() => { void chrome.tabs.create({ url: DASHBOARD_URL }); });
  });
  el<HTMLButtonElement>("settings").addEventListener("click", () => {
    void chrome.tabs.create({ url: SETTINGS_URL });
  });
});
