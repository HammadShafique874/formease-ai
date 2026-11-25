// Hybrid AI service — the ONLY place firebase/ai is used.
// Firebase is lazily imported ONLY when config is present. With no config
// every method returns route "unavailable" — never a fake response.
// Verified against installed @firebase/ai 3.1.0 typings (firebase 13.4.0):
//   getAI(app, { backend: new GoogleAIBackend() })
//   getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE })  // HybridParams
//   model.initializeDeviceModel(onDownloadProgress?) — must follow a user gesture
//   model.generationConfig = { responseMimeType: "application/json", responseSchema: Schema.object(...) }
//   result.response.inferenceSource: "on_device" | "in_cloud"
//   generateContent(request, { timeout, signal }) — timeout defaults 180000ms; signal is an AbortSignal
//   HybridParams has NO generationConfig field, so it is assigned on the model instance.
// The cloud model is deliberately left unspecified so the SDK default applies;
// do not hard-code a Gemini model name here without verifying it in the typings.
// Never set topK / presencePenalty / frequencyPenalty — deprecated, they fail on Gemini 3.x.
import type { FieldExplanation, FormGuide, HybridResult, InferenceModePreference, InferenceRoute, Language, PerFieldAIResult } from "@formease/shared";
import { dedupKey, deviceInitFailureIsFatal, deviceInitRequired, isLocalFailure, isTransientError, overallRoute, parseFieldExplanationJson, planFallbackStages, routeFromInferenceSource, shouldFallbackToCloud } from "@formease/shared";
import type { GenerativeModel } from "firebase/ai";
import { firebaseConfig, isFirebaseConfigured } from "../firebase/config.ts";
import { getAppCheckStatus, initAppCheck } from "../firebase/appCheck.ts";

export interface ExplainRequest {
  fieldLabel: string;
  context?: string;
  language: Language;
  mode: InferenceModePreference;
}

export interface ExplainFieldOptions {
  signal?: AbortSignal;
  /** Called with Nano download progress (0–1) while the on-device model downloads. */
  onDownloadProgress?: (progress: number) => void;
}

export interface ExplainFormOptions extends ExplainFieldOptions {
  /** Called before each field: { fieldIndex (0-based), total, fieldLabel }. */
  onFieldStart?: (info: { fieldIndex: number; total: number; fieldLabel: string }) => void;
  /** Overall time budget for the whole multi-field run. Default 120000ms. */
  overallTimeoutMs?: number;
}

export interface HybridAIService {
  explainField(req: ExplainRequest, opts?: ExplainFieldOptions): Promise<HybridResult<FieldExplanation>>;
  explainForm(guide: FormGuide, mode: InferenceModePreference, opts?: ExplainFormOptions): Promise<HybridResult<FieldExplanation[]>>;
}

/**
 * Test hooks. Production always leaves these unset (real Firebase + real
 * localStorage consent). Tests inject a fake model factory and a fake
 * consent reader so both fallback scenarios can be exercised in Node
 * without a browser, a Prompt API, or a network call.
 */
export interface HybridServiceDeps {
  getCloudConsent?: () => boolean;
  createModel?: (mode: InferenceModePreference) => Promise<GenerativeModel>;
}

const FIELD_TIMEOUT_MS = 60000;
const DEFAULT_OVERALL_TIMEOUT_MS = 120000;
const RETRY_BACKOFF_MS = 1000;
const MAX_ATTEMPTS = 2;

const FIELD_PROMPT = (label: string, context: string, language: string): string =>
  `You explain one online form field in plain language. Reply with JSON ONLY, no markdown, matching this shape: ` +
  `{"fieldLabel": "...", "simpleExplanation": "...", "explanations": {"en": "...", "simple-en": "...", "roman-ur": "..."}, "requiredInformation": ["..."], "possibleDocuments": ["..."], "commonMistakes": ["..."], "exampleAnswer": "...", "confidence": 0.9}. ` +
  `Rules: preserve the meaning of the original question; never invent official requirements; ` +
  `if a document is only possibly needed, say so in possibleDocuments, do not claim it is mandatory. ` +
  `Language for simpleExplanation: ${language}. Also provide "explanations" with the same explanation in all three languages, so the guide can show every language without another AI call: "en" (English), "simple-en" (Simple English, short plain words), "roman-ur" (Roman Urdu, written in Latin letters). Field: "${label}". Context: "${context}".`;

function readCloudConsent(): boolean {
  try {
    return window.localStorage.getItem("formease:v1:cloud-consent") === "true";
  } catch {
    return false;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(true); return; }
    // globalThis (not window) so the retry path also works in Node-based tests.
    const t = globalThis.setTimeout(() => resolve(false), ms);
    signal?.addEventListener("abort", () => { globalThis.clearTimeout(t); resolve(true); }, { once: true });
  });
}

function modelInfoFor(route: InferenceRoute): string {
  if (route === "local") return "Gemini Nano (on-device, via Firebase AI Logic)";
  if (route === "cloud") return "Cloud Gemini (via Firebase AI Logic, SDK default model)";
  return "Firebase AI Logic (hybrid)";
}

export class FirebaseHybridService implements HybridAIService {
  private readonly deps: HybridServiceDeps;
  constructor(deps: HybridServiceDeps = {}) {
    this.deps = deps;
  }

  private appPromise: Promise<unknown> | null = null;
  private modelCache = new Map<InferenceModePreference, Promise<GenerativeModel>>();
  /** Per mode: null = device model initialised OK, string = init failed with this message. Cached so later fields do not re-attempt a failed init. */
  private deviceInitCache = new Map<InferenceModePreference, Promise<string | null>>();
  private inFlight = new Map<string, Promise<HybridResult<FieldExplanation>>>();

  private readConsent(): boolean {
    if (this.deps.getCloudConsent) return this.deps.getCloudConsent();
    return readCloudConsent();
  }

  private async getApp(): Promise<unknown> {
    if (!this.appPromise) {
      this.appPromise = (async () => {
        const { initializeApp } = await import("firebase/app");
        const app = initializeApp(firebaseConfig);
        // App Check is initialised lazily, exactly once, before the first AI call.
        // A throw here means AI calls cannot be trusted — surface it, don't crash.
        initAppCheck(app);
        return app;
      })();
    }
    return this.appPromise;
  }

  private async getModel(mode: InferenceModePreference): Promise<GenerativeModel> {
    const cached = this.modelCache.get(mode);
    if (cached) return cached;
    const created = (async (): Promise<GenerativeModel> => {
      if (this.deps.createModel) return this.deps.createModel(mode);
      const app = await this.getApp();
      const aiMod = await import("firebase/ai");
      const ai = aiMod.getAI(app as never, { backend: new aiMod.GoogleAIBackend() });
      const inferenceMode =
        mode === "only_on_device" ? aiMod.InferenceMode.ONLY_ON_DEVICE
        : mode === "prefer_in_cloud" ? aiMod.InferenceMode.PREFER_IN_CLOUD
        : mode === "only_in_cloud" ? aiMod.InferenceMode.ONLY_IN_CLOUD
        : aiMod.InferenceMode.PREFER_ON_DEVICE;
      // No inCloudParams.model: the SDK default cloud model applies.
      const model = aiMod.getGenerativeModel(ai, { mode: inferenceMode });
      // HybridParams carries no generationConfig, so assign it on the instance.
      // Structured JSON output is supported by both on-device and cloud routes.
      model.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: aiMod.Schema.object({
          properties: {
            fieldLabel: aiMod.Schema.string(),
            simpleExplanation: aiMod.Schema.string(),
            // All three languages in one call, so the complete guide can show
            // English, Simple English and Roman Urdu without another AI call.
            explanations: aiMod.Schema.object({
              properties: {
                en: aiMod.Schema.string(),
                "simple-en": aiMod.Schema.string(),
                "roman-ur": aiMod.Schema.string(),
              },
              optionalProperties: ["en", "simple-en", "roman-ur"],
            }),
            requiredInformation: aiMod.Schema.array({ items: aiMod.Schema.string() }),
            possibleDocuments: aiMod.Schema.array({ items: aiMod.Schema.string() }),
            commonMistakes: aiMod.Schema.array({ items: aiMod.Schema.string() }),
            exampleAnswer: aiMod.Schema.string(),
            confidence: aiMod.Schema.number(),
          },
          optionalProperties: ["explanations", "exampleAnswer", "confidence"],
        }),
      };
      return model;
    })();
    this.modelCache.set(mode, created);
    created.catch(() => { this.modelCache.delete(mode); });
    return created;
  }

  /**
   * Initialise the on-device model. Only ever called from a user gesture
   * (Analyse / "Get AI explanations" click). Returns null on success, or the
   * init error message. A failed init is NOT fatal for PREFER_* modes: the
   * Firebase docs say generateContent() itself falls back to the cloud-hosted
   * model when the on-device model is unavailable, and the docs only suggest
   * awaiting this promise for ONLY_ON_DEVICE. So for prefer modes we record
   * the failure and still call generateContent() — that is the cloud fallback.
   * ONLY_IN_CLOUD never calls this at all.
   */
  private ensureDeviceModel(mode: InferenceModePreference, onProgress?: (p: number) => void): Promise<string | null> {
    const cached = this.deviceInitCache.get(mode);
    if (cached) return cached;
    const started = (async (): Promise<string | null> => {
      try {
        const model = await this.getModel(mode);
        await model.initializeDeviceModel(onProgress);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "On-device model could not be initialised.";
      }
    })();
    this.deviceInitCache.set(mode, started);
    return started;
  }

  /**
   * One explicit single-route attempt (one stage): initialise the device
   * model when the stage needs it, then call generateContent once, with one
   * retry only for transient failures. Never decides about fallback — the
   * caller (explainField) does that from the plan.
   */
  private async attemptField(
    req: ExplainRequest,
    stage: InferenceModePreference,
    opts: ExplainFieldOptions,
    started: number,
  ): Promise<HybridResult<FieldExplanation>> {
    const unavailable = (error: string, latencyMs = performance.now() - started): HybridResult<FieldExplanation> =>
      ({ route: "unavailable", latencyMs, modelInfo: "Firebase AI Logic (hybrid)", error });
    let attempts = 0;
    let lastError = "AI request failed";
    // Device init is a pre-warm for this stage, done once per mode (cached,
    // including failures). ONLY_IN_CLOUD skips it entirely. A failed init
    // ends the attempt only for ONLY_ON_DEVICE; the caller then decides
    // whether the next stage (cloud) may run.
    if (deviceInitRequired(stage)) {
      const initError = await this.ensureDeviceModel(stage, opts.onDownloadProgress);
      if (initError && deviceInitFailureIsFatal(stage)) {
        return unavailable(`On-device model could not be initialised: ${initError}`, performance.now() - started);
      }
      if (initError) lastError = `On-device model unavailable (${initError})`;
    }
    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      try {
        const model = await this.getModel(stage);
        const result = await model.generateContent(
          FIELD_PROMPT(req.fieldLabel, req.context ?? "", req.language),
          { timeout: FIELD_TIMEOUT_MS, signal: opts.signal },
        );
        const latencyMs = performance.now() - started;
        const route = routeFromInferenceSource(result.response.inferenceSource);
        const parsed = parseFieldExplanationJson(result.response.text());
        if (!parsed.ok) {
          // Validation failure: never retry, never present as AI output.
          return { route, latencyMs, modelInfo: modelInfoFor(route), attempts, error: `AI returned invalid output: ${parsed.errors.join("; ")}` };
        }
        if (route === "unavailable") {
          return { route, latencyMs, modelInfo: modelInfoFor(route), attempts, error: "Inference source was not reported by the SDK." };
        }
        const value: FieldExplanation = {
          ...parsed.value,
          fieldLabel: req.fieldLabel,
          source: "ai",
          route,
          latencyMs,
          attempts,
          // Keep all three languages when the model provided them; otherwise
          // fall back to the single requested language.
          explanations: parsed.value.explanations && Object.keys(parsed.value.explanations).length > 0
            ? parsed.value.explanations
            : { [req.language]: parsed.value.simpleExplanation },
        };
        return { route, latencyMs, modelInfo: modelInfoFor(route), attempts, data: value, confidence: value.confidence };
      } catch (err) {
        if (opts.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
          return unavailable("AI run cancelled.", performance.now() - started);
        }
        lastError = err instanceof Error ? err.message : "AI request failed";
        const appCheck = getAppCheckStatus();
        if (appCheck.status === "error") {
          return unavailable(`App Check failed to initialise: ${appCheck.error ?? "unknown error"}. Check VITE_APPCHECK_SITE_KEY in apps/web/.env.`, performance.now() - started);
        }
        if (!isTransientError(err) || attempts >= MAX_ATTEMPTS) {
          return unavailable(lastError, performance.now() - started);
        }
        // Transient failure: one retry after a short backoff.
        const aborted = await sleep(RETRY_BACKOFF_MS, opts.signal);
        if (aborted) return unavailable("AI run cancelled.", performance.now() - started);
      }
    }
    return unavailable(lastError, performance.now() - started);
  }

  /**
   * Automatic local-first fallback. One click runs the plan from
   * planFallbackStages(): for "Prefer on-device" that is on-device first and
   * cloud second. The user never picks a route by hand. Cloud data is sent
   * only with consent: without it the plan has no cloud stage, and if the
   * on-device stage then fails for a device reason the result carries
   * needsCloudConsent, so the UI asks for consent just in time — once
   * granted it is remembered in Settings → Privacy and later runs fall
   * back automatically. If both stages fail, the error says so plainly.
   */
  async explainField(req: ExplainRequest, opts: ExplainFieldOptions = {}): Promise<HybridResult<FieldExplanation>> {
    const started = performance.now();
    const unavailable = (error: string, latencyMs = performance.now() - started): HybridResult<FieldExplanation> =>
      ({ route: "unavailable", latencyMs, modelInfo: "Firebase AI Logic (hybrid)", error });
    if (!isFirebaseConfigured) {
      return unavailable("Firebase not configured — set VITE_FIREBASE_* in apps/web/.env (Phase 5). See docs/firebase-setup.md.", 0);
    }
    if (opts.signal?.aborted) return unavailable("AI run cancelled.");
    const plan = planFallbackStages(req.mode, this.readConsent());
    if (plan.stages.length === 0) {
      return unavailable("Cloud inference requires your consent — enable cloud fallback in Settings → Privacy, or choose an on-device mode.");
    }

    // Dedup: an identical request already in flight reuses its promise.
    const key = dedupKey(req.fieldLabel, req.language, req.mode);
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const run = (async (): Promise<HybridResult<FieldExplanation>> => {
      let attemptsTotal = 0;
      let lastError = "AI request failed";
      for (const stage of plan.stages) {
        const r = await this.attemptField(req, stage, opts, started);
        attemptsTotal += r.attempts ?? 1;
        if (r.data) return { ...r, attempts: attemptsTotal };
        lastError = r.error ?? lastError;
        // Consent was the only thing standing between the user and the cloud:
        // ask for it now (just in time), instead of failing silently.
        if (plan.cloudBlockedByConsent && stage === "only_on_device" && isLocalFailure(r.error)) {
          return {
            route: "unavailable",
            latencyMs: performance.now() - started,
            modelInfo: "Firebase AI Logic (hybrid)",
            attempts: attemptsTotal,
            needsCloudConsent: true,
            error: `${lastError} Enable cloud fallback to use Firebase Cloud AI instead — your form text will be sent to the cloud only with your consent (Settings → Privacy).`,
          };
        }
        // A failure the other route cannot fix (bad output, App Check, auth,
        // quota, cancelled) ends the run — do not burn a cloud call on it.
        if (!shouldFallbackToCloud(r.error)) {
          return { ...r, attempts: attemptsTotal };
        }
        // Otherwise fall through to the next stage automatically.
      }
      return {
        route: "unavailable",
        latencyMs: performance.now() - started,
        modelInfo: "Firebase AI Logic (hybrid)",
        attempts: attemptsTotal,
        error: plan.stages.length > 1
          ? `On-device AI and cloud AI both failed. Last error: ${lastError}`
          : lastError,
      };
    })();
    this.inFlight.set(key, run);
    run.then(() => { this.inFlight.delete(key); }, () => { this.inFlight.delete(key); });
    return run;
  }

  async explainForm(guide: FormGuide, mode: InferenceModePreference, opts: ExplainFormOptions = {}): Promise<HybridResult<FieldExplanation[]>> {
    const started = performance.now();
    const overallBudget = opts.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS;
    if (!isFirebaseConfigured) {
      return {
        route: "unavailable", latencyMs: 0, modelInfo: "Firebase AI Logic (hybrid)",
        error: "Firebase not configured — set VITE_FIREBASE_* in apps/web/.env (Phase 5). See docs/firebase-setup.md.",
        results: [],
      };
    }
    // The plan is derived from the saved preference + saved consent, so the
    // run falls back automatically. An empty plan means cloud-only was
    // requested without consent — refused before any data leaves the device.
    const plan = planFallbackStages(mode, this.readConsent());
    if (plan.stages.length === 0) {
      return {
        route: "unavailable", latencyMs: performance.now() - started, modelInfo: "Firebase AI Logic (hybrid)",
        error: "Cloud inference requires your consent — enable cloud fallback in Settings → Privacy, or choose an on-device mode.",
        results: [],
        needsCloudConsent: true,
      };
    }
    const labels = guide.detectedLabels;
    const results: PerFieldAIResult[] = [];
    const out: FieldExplanation[] = [];
    let attemptsTotal = 0;
    let stoppedReason: string | null = null;
    let needsCloudConsent = false;
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i] as string;
      if (opts.signal?.aborted) { stoppedReason = "AI run cancelled."; break; }
      if (performance.now() - started > overallBudget) { stoppedReason = `Overall AI time budget (${String(Math.round(overallBudget / 1000))}s) exceeded — remaining fields were not attempted.`; break; }
      opts.onFieldStart?.({ fieldIndex: i, total: labels.length, fieldLabel: label });
      const fieldStarted = performance.now();
      const r = await this.explainField(
        { fieldLabel: label, context: guide.sourceLabel, language: guide.language, mode },
        { signal: opts.signal, onDownloadProgress: opts.onDownloadProgress },
      );
      attemptsTotal += r.attempts ?? 1;
      results.push({
        fieldLabel: label,
        route: r.route,
        latencyMs: performance.now() - fieldStarted,
        attempts: r.attempts ?? 1,
        error: r.error,
        explanation: r.data,
      });
      if (r.data) out.push(r.data);
      if (r.needsCloudConsent) {
        // Every remaining field would fail the same way — stop and ask for
        // consent once, instead of failing every field first.
        needsCloudConsent = true;
        stoppedReason = "Stopped after the first field — on-device AI is unavailable and cloud fallback needs your consent. Enable it and run again.";
        break;
      }
    }
    const latencyMs = performance.now() - started;
    const succeeded = results.filter((r) => r.explanation !== undefined);
    const failed = results.filter((r) => r.error !== undefined);
    const route = overallRoute(succeeded.map((r) => r.route));
    const errorParts: string[] = [];
    if (failed.length > 0) errorParts.push(`${String(failed.length)} of ${String(results.length)} field(s) failed: ${failed.map((f) => `${f.fieldLabel} (${f.error ?? "unknown error"})`).join("; ")}`);
    if (stoppedReason) errorParts.push(stoppedReason);
    return {
      route,
      latencyMs,
      modelInfo: route === "mixed" ? "Firebase AI Logic (hybrid) — mixed on-device + cloud" : modelInfoFor(route),
      attempts: attemptsTotal,
      data: out,
      results,
      error: errorParts.length > 0 ? errorParts.join(" ") : undefined,
      needsCloudConsent: needsCloudConsent || undefined,
    };
  }
}

export const hybridAI: HybridAIService = new FirebaseHybridService();
