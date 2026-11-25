// Single source of truth for the dashboard URL (extension side).
// Phase 5: change this ONE constant to the hosted URL.
export const DASHBOARD_BASE_URL = "http://localhost:5173";
export const DASHBOARD_URL = `${DASHBOARD_BASE_URL}/#/dashboard`;
export const WORKSPACE_URL = `${DASHBOARD_BASE_URL}/#/workspace`;
export const SETTINGS_URL = `${DASHBOARD_BASE_URL}/#/settings`;
/** chrome.storage.local key prefix for scans awaiting pickup by the dashboard. */
export const SCAN_STORAGE_PREFIX = "formease:scan:";
/** localStorage key the dashboard content script writes for the web app. */
export const INCOMING_SCAN_KEY = "formease.incomingScan";
export const INCOMING_SCAN_EVENT = "formease:incoming-scan";
