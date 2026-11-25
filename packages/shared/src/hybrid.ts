// Pure hybrid-inference helpers — no Firebase, no DOM, no I/O.
// Kept here (not in the web service) so they are unit-testable in Node.
import type { InferenceModePreference, InferenceRoute } from "./types.js";

/** Map the SDK's reported inference source to our route. Missing/unknown => "unavailable" (never guess). */
export function routeFromInferenceSource(source: string | undefined): InferenceRoute {
  if (source === "on_device") return "local";
  if (source === "in_cloud") return "cloud";
  return "unavailable";
}

/** Overall route for a multi-field run. "local" only if EVERY field was local; "mixed" if both routes appear. */
export function overallRoute(routes: InferenceRoute[]): InferenceRoute {
  const real = routes.filter((r) => r === "local" || r === "cloud");
  if (real.length === 0) return "unavailable";
  if (real.every((r) => r === "local")) return "local";
  if (real.every((r) => r === "cloud")) return "cloud";
  return "mixed";
}

/** Key for in-flight dedup: identical field + language + mode reuses one promise. */
export function dedupKey(fieldLabel: string, language: string, mode: InferenceModePreference): string {
  return `${mode}::${language}::${fieldLabel.trim().toLowerCase()}`;
}

/** Transient failures are worth exactly one retry; everything else must fail fast. */
export function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (/abort|cancel|user activation|user gesture|notallowederror|only_on_device|only on-device|app check|appcheck|permission|forbidden|401|403|invalid|validation|schema|json|quota|api key|api-not-enabled|language model api|prompt api|not supported/.test(msg)) return false;
  return (
    /timeout|timed out|network|fetch failed|failed to fetch|econnreset|econnrefused|enotfound|socket|502|503|504|429|too many requests|temporarily|unavailable|internal error|500/.test(msg)
  );
}

/**
 * Whether the on-device model needs initialising before generateContent for
 * this mode. ONLY_IN_CLOUD never touches the device model.
 */
export function deviceInitRequired(mode: InferenceModePreference): boolean {
  return mode !== "only_in_cloud";
}

/**
 * Whether a failed initializeDeviceModel() must fail the whole run.
 * Only ONLY_ON_DEVICE has no other route. For PREFER_* modes the Firebase
 * docs say generateContent() itself falls back to the cloud-hosted model
 * when the on-device model is unavailable — so a failed device init is a
 * pre-warm failure, not a run failure, and generateContent() must still run.
 * (Docs: "You may want to await this promise if using ONLY_ON_DEVICE".)
 */
export function deviceInitFailureIsFatal(mode: InferenceModePreference): boolean {
  return mode === "only_on_device";
}

export interface EffectiveMode {
  mode: InferenceModePreference;
  /** True when the requested mode could use the cloud but the user has not consented to cloud processing. */
  cloudBlockedByConsent: boolean;
}

/**
 * Resolve the mode that may actually run.
 * Cloud fallback/only-cloud requires the user's cloud consent (Settings).
 * Without consent, prefer-* modes run on-device only and only_in_cloud is refused outright.
 */
export function resolveEffectiveMode(mode: InferenceModePreference, cloudConsent: boolean): EffectiveMode {
  if (cloudConsent) return { mode, cloudBlockedByConsent: false };
  if (mode === "only_in_cloud") return { mode, cloudBlockedByConsent: true };
  if (mode === "prefer_on_device" || mode === "prefer_in_cloud") {
    return { mode: "only_on_device", cloudBlockedByConsent: true };
  }
  return { mode, cloudBlockedByConsent: false };
}

export interface FallbackPlan {
  /**
   * Explicit single-route modes to attempt, in order. The service tries
   * each in turn until one produces an explanation — never more than one
   * cloud attempt, and never a cloud attempt without consent.
   */
  stages: InferenceModePreference[];
  /**
   * True when the plan was cut short by missing cloud consent: the first
   * stage is on-device only, and a cloud stage would have followed if the
   * user had consented. The UI asks for consent only if that first stage
   * actually fails for a device reason.
   */
  cloudBlockedByConsent: boolean;
}

/**
 * Automatic fallback plan for one AI run. Local-first is preserved:
 * prefer_on_device tries on-device first and cloud second; prefer_in_cloud
 * tries cloud first and on-device second. The user never has to pick a
 * route by hand — the plan is derived from their saved preference plus
 * their saved cloud consent.
 */
export function planFallbackStages(preference: InferenceModePreference, cloudConsent: boolean): FallbackPlan {
  if (preference === "only_in_cloud") {
    return cloudConsent
      ? { stages: ["only_in_cloud"], cloudBlockedByConsent: false }
      : { stages: [], cloudBlockedByConsent: true };
  }
  if (preference === "only_on_device") {
    return { stages: ["only_on_device"], cloudBlockedByConsent: false };
  }
  if (preference === "prefer_in_cloud") {
    return cloudConsent
      ? { stages: ["only_in_cloud", "only_on_device"], cloudBlockedByConsent: false }
      : { stages: ["only_on_device"], cloudBlockedByConsent: true };
  }
  return cloudConsent
    ? { stages: ["only_on_device", "only_in_cloud"], cloudBlockedByConsent: false }
    : { stages: ["only_on_device"], cloudBlockedByConsent: true };
}

/** True when an error string says the on-device model itself is unavailable (not a request or account problem). */
export function isLocalFailure(error: string | undefined): boolean {
  if (!error) return false;
  const msg = error.toLowerCase();
  return /api-not-enabled|language ?model api|prompt api|gemini nano|device model|on-device model|on-device|not available in this environment|only_on_device|only on-device/.test(msg);
}

/**
 * True when a failed stage is worth falling back from: the request itself
 * was fine, so the other route might succeed. Request-intrinsic failures
 * (bad prompt/schema, App Check, auth, quota, cancelled) would fail the
 * same way on the other route, so they end the run instead.
 */
export function shouldFallbackToCloud(error: string | undefined): boolean {
  if (!error) return false;
  const msg = error.toLowerCase();
  if (/validation|schema|invalid|json|app check|appcheck|permission|forbidden|401|403|api key|quota|user activation|user gesture|cancel|abort/.test(msg)) return false;
  return true;
}

export interface AiErrorSummary {
  /** One short plain-language sentence the user can act on. */
  summary: string;
  /** Seconds to wait before retrying, when the error says so (quota). */
  retrySeconds: number | null;
  /** The raw error, kept for the collapsed "technical details" view. */
  detail: string;
}

/**
 * Turns a raw AI error (often a long Firebase/HTTP dump with URLs and a
 * JSON blob) into one short plain-language sentence. The raw text is kept
 * as `detail` for debugging, but the UI must show `summary` — never the
 * raw dump — or users see a wall of JSON they cannot act on.
 */
export function summarizeAiError(raw: string | undefined | null): AiErrorSummary {
  const detail = (raw ?? "").trim();
  if (detail === "") {
    return { summary: "The AI service couldn't complete this field. Please try again.", retrySeconds: null, detail };
  }
  // Retry delay when the error states one ("Please retry in 33.48s", "retryDelay":"33s").
  let retrySeconds: number | null = null;
  const retryMatch = detail.match(/retry (?:in )?(\d+(?:\.\d+)?)\s*s/i) ?? detail.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)\s*s?"/i);
  if (retryMatch) retrySeconds = Math.ceil(Number(retryMatch[1]));
  if (/429|quota|rate.?limit|too many requests/i.test(detail)) {
    return {
      summary: retrySeconds !== null
        ? `The free AI service hit its limit (too many requests in a minute). Please wait about ${String(retrySeconds)} seconds, then try again.`
        : "The free AI service hit its limit (too many requests in a minute). Please wait about a minute, then try again.",
      retrySeconds,
      detail,
    };
  }
  if (/500|high demand|overloaded|service unavailable|temporarily unavailable/i.test(detail)) {
    return { summary: "The AI service is busy right now. Please try again in a moment.", retrySeconds, detail };
  }
  if (/api-not-enabled|not available in this environment|language ?model api|prompt api/i.test(detail)) {
    return { summary: "On-device AI isn't available in this browser.", retrySeconds: null, detail };
  }
  if (/app check/i.test(detail)) {
    return { summary: "A security check failed (App Check). Check the Firebase setup and try again.", retrySeconds: null, detail };
  }
  if (/cancel|abort/i.test(detail)) {
    return { summary: "The AI run was cancelled.", retrySeconds: null, detail };
  }
  if (/network|failed to fetch|fetch failed|offline|timeout|timed out/i.test(detail)) {
    return { summary: "The AI service couldn't be reached. Check your connection and try again.", retrySeconds, detail };
  }
  if (/firebase not configured/i.test(detail)) {
    return { summary: "AI isn't available — Firebase is not configured.", retrySeconds: null, detail };
  }
  return { summary: "The AI service couldn't complete this field. Please try again.", retrySeconds, detail };
}
