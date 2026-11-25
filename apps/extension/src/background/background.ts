// Background service worker: validates every message, then acts.
// No Firebase, no App Check, no API keys here — the extension never calls AI
// directly. AI runs in the hosted web app; this worker only stores scans and
// opens it.
import { DASHBOARD_BASE_URL, DASHBOARD_URL, SCAN_STORAGE_PREFIX } from "../shared/config.js";
import { isValidExtensionScanLocal } from "../shared/transfer.js";
import { isExtensionMessage } from "../shared/types.js";

chrome.runtime.onInstalled.addListener(() => {
  // Install hook kept for future first-run setup.
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (r: unknown) => void) => {
  if (!isExtensionMessage(message)) { sendResponse({ ok: false, error: "Unknown message type" }); return false; }
  if (message.type === "OPEN_DASHBOARD") {
    void chrome.tabs.create({ url: DASHBOARD_URL }).then(
      () => sendResponse({ ok: true }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : "Could not open dashboard" }),
    );
    return true; // async response
  }
  if (message.type === "STORE_SCAN_AND_OPEN") {
    void (async () => {
      if (!isValidExtensionScanLocal(message.scan)) {
        sendResponse({ ok: false, error: "Scan failed validation — it was not stored." });
        return;
      }
      const scan = message.scan;
      try {
        await chrome.storage.local.set({ [`${SCAN_STORAGE_PREFIX}${scan.id}`]: scan });
        await chrome.tabs.create({ url: `${DASHBOARD_BASE_URL}/#/workspace?scan=${encodeURIComponent(scan.id)}` });
        sendResponse({ ok: true, via: "storage" });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : "Could not store the scan" });
      }
    })();
    return true;
  }
  // SCAN_FORM / HIGHLIGHT_FIELD are handled by the content script, not here.
  void sender;
  sendResponse({ ok: false, error: "Message not handled by background worker" });
  return false;
});
