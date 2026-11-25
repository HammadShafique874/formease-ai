// Single source of truth for the dashboard URL (extension side).
// Hosted URL (Firebase Hosting). The extension now sends scans to the live
// dashboard; local dev can still open the dashboard directly in the browser.
export const DASHBOARD_BASE_URL = "https://formease-ai-933b6.web.app";
export const DASHBOARD_URL = `${DASHBOARD_BASE_URL}/#/dashboard`;
export const WORKSPACE_URL = `${DASHBOARD_BASE_URL}/#/workspace`;
export const SETTINGS_URL = `${DASHBOARD_BASE_URL}/#/settings`;
/** chrome.storage.local key prefix for scans awaiting pickup by the dashboard. */
export const SCAN_STORAGE_PREFIX = "formease:scan:";
/** localStorage key the dashboard content script writes for the web app. */
export const INCOMING_SCAN_KEY = "formease.incomingScan";
export const INCOMING_SCAN_EVENT = "formease:incoming-scan";
