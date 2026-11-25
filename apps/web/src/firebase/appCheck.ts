// App Check — web only. The Chrome extension NEVER initialises App Check
// (see Phase 1 risk: chrome-extension:// origins are not attestable the same way).
// Production: ReCaptchaEnterpriseProvider, only when a site key is configured.
// Local dev: debug mode only when import.meta.env.DEV and VITE_APPCHECK_DEBUG=true.
//
// BUG FIXED (Phase 5): the Phase 2 code set FIREBASE_APPCHECK_DEBUG_TOKEN and
// then RETURNED EARLY when no site key was set, so initializeAppCheck was
// never called and the debug provider was never actually initialised.
// Verified against @firebase/app-check 0.12.x (firebase 13.4.0):
//   - initializeAppCheck() itself calls initializeDebugMode(), which reads
//     self.FIREBASE_APPCHECK_DEBUG_TOKEN — so the flag MUST be set BEFORE
//     initializeAppCheck, and initializeAppCheck MUST still be called.
//   - In debug mode the SDK exchanges the debug token instead of calling the
//     provider, so the provider object is required by the type but unused.
//     With no site key we pass a CustomProvider whose getToken throws — it is
//     only reachable if debug mode somehow did not activate.
//   - Debug tokens are never committed and never enabled in production builds.
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import { appCheckDebugToken, appCheckSiteKey } from "./config.ts";

export type AppCheckStatus =
  | "not-initialised" // initAppCheck has not run yet (lazy: first AI call)
  | "enterprise" // ReCaptchaEnterpriseProvider initialised
  | "debug" // Debug flag set (local dev only); token printed by the SDK console
  | "not-configured" // No site key and not debug mode — calls may be blocked once enforced
  | "error"; // initialiseAppCheck threw; see appCheckError

let status: AppCheckStatus = "not-initialised";
let appCheckError: string | null = null;
let initialised = false;

export function getAppCheckStatus(): { status: AppCheckStatus; error: string | null } {
  return { status, error: appCheckError };
}

/** True when App Check is actually protecting calls (enterprise or debug). */
export function isAppCheckConfigured(): boolean {
  return status === "enterprise" || status === "debug";
}

export function initAppCheck(app: FirebaseApp): void {
  if (initialised) return;
  initialised = true;
  const debugMode = import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG === "true";
  try {
    if (debugMode) {
      // MUST happen before initializeAppCheck — the SDK reads this flag inside it.
      // If an explicit debug token was registered in the console (VITE_APPCHECK_DEBUG_TOKEN),
      // use that exact value; otherwise `true` makes the SDK generate one and print it.
      if (appCheckDebugToken !== "") {
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
      } else {
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      console.warn("FormEase: App Check debug provider enabled (local dev only). Register the debug token printed in the console under Firebase console > App Check > Manage debug tokens.");
    }
    if (appCheckSiteKey !== "") {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      status = debugMode ? "debug" : "enterprise";
      return;
    }
    if (debugMode) {
      initializeAppCheck(app, {
        provider: new CustomProvider({
          getToken: () => Promise.reject(new Error("App Check debug mode: the attestation provider is unused — the debug token is exchanged instead.")),
        }),
        isTokenAutoRefreshEnabled: true,
      });
      status = "debug";
      return;
    }
    console.warn("FormEase: VITE_APPCHECK_SITE_KEY not set — App Check not initialised. AI calls will be blocked once App Check is enforced for AI Logic.");
    status = "not-configured";
  } catch (err) {
    status = "error";
    appCheckError = err instanceof Error ? err.message : "App Check failed to initialise.";
    throw new Error(`App Check failed to initialise: ${appCheckError}`);
  }
}
