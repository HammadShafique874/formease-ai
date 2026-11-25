// Single source of truth for the dashboard URL.
// Hosted URL (Firebase Hosting, deployed 2026-11-25). Local dev still works:
// the dev server's .env keeps VITE_DASHBOARD_URL=http://localhost:5173, which
// firebase/config.ts prefers over this constant.
export const DASHBOARD_BASE_URL = "https://formease-ai-933b6.web.app";
export const DASHBOARD_URL = `${DASHBOARD_BASE_URL}/#/dashboard`;
export const WORKSPACE_URL = `${DASHBOARD_BASE_URL}/#/workspace`;
export const SETTINGS_URL = `${DASHBOARD_BASE_URL}/#/settings`;
export const INCOMING_SCAN_KEY = "formease.incomingScan";
export const INCOMING_SCAN_EVENT = "formease:incoming-scan";
