// Firebase config — reads ONLY from Vite env vars. No hard-coded keys.
// Phase 2: all values are empty, so isFirebaseConfigured is false and every
// AI call honestly returns route "unavailable". Fill apps/web/.env in Phase 5.
import { DASHBOARD_URL } from "../config.ts";
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}
function env(name: string): string {
  return (import.meta.env[name] as string | undefined ?? "").trim();
}
export const firebaseConfig: FirebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("VITE_FIREBASE_APP_ID"),
  measurementId: env("VITE_FIREBASE_MEASUREMENT_ID") || undefined,
};
export const isFirebaseConfigured: boolean =
  firebaseConfig.apiKey !== "" && firebaseConfig.projectId !== "" && firebaseConfig.appId !== "";
export const appCheckSiteKey: string = env("VITE_APPCHECK_SITE_KEY");
export const appCheckDebugToken: string = env("VITE_APPCHECK_DEBUG_TOKEN");
export const dashboardUrl: string = env("VITE_DASHBOARD_URL") || DASHBOARD_URL;
