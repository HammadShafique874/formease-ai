// FormEase AI — smoke test for @formease/shared (pure logic, no DOM/Firebase).
/* global console, process */
// Run:  node scripts/smoke-test.mjs        (Node 20+, after `npm install`)
// It compiles the shared TypeScript to a temp dir with the workspace tsc and
// runs the checks against the compiled output, then prints
// "SMOKE: N passed, M failed" and exits non-zero on any failure.
// Covers the Phase 5 hybrid fix: a failed initializeDeviceModel() must NOT
// block cloud fallback for PREFER_* modes (deviceInitFailureIsFatal is true
// only for only_on_device), and cloud consent gates the cloud route.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "formease-smoke-"));
try {
  execFileSync(join(root, "node_modules", ".bin", "tsc"), [
    join(root, "packages", "shared", "src", "types.ts"),
    join(root, "packages", "shared", "src", "utils.ts"),
    join(root, "packages", "shared", "src", "phrasebook.ts"),
    join(root, "packages", "shared", "src", "schemas.ts"),
    join(root, "packages", "shared", "src", "guide.ts"),
    join(root, "packages", "shared", "src", "transfer.ts"),
    join(root, "packages", "shared", "src", "hybrid.ts"),
    "--outDir", outDir,
    "--target", "ES2023",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--skipLibCheck",
  ], { stdio: "pipe" });
} catch (e) {
  console.error("SMOKE: shared package failed to compile", e.stderr?.toString() ?? e.message);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

const imp = (f) => import(pathToFileURL(join(outDir, f)).href);
const hybrid = await imp("hybrid.js");
const schemas = await imp("schemas.js");
const utils = await imp("utils.js");
const phrasebook = await imp("phrasebook.js");
const guideMod = await imp("guide.js");
const transfer = await imp("transfer.js");

const {
  dedupKey, deviceInitFailureIsFatal, deviceInitRequired, isLocalFailure, isTransientError,
  overallRoute, planFallbackStages, resolveEffectiveMode, routeFromInferenceSource, shouldFallbackToCloud, summarizeAiError,
} = hybrid;
const { parseFieldExplanationJson, validateFieldExplanation } = schemas;
const { formatLatency, guessFieldType, parseFormFields, slugify } = utils;
const { PHRASEBOOK, lookupPhrasebook } = phrasebook;
const { buildGuideFromText, fieldExplanationInLanguage } = guideMod;
const { decodeScanFromUrl, encodeScanForUrl } = transfer;

let passed = 0;
let failed = 0;
const check = (name, cond) => {
  if (cond) { passed += 1; } else { failed += 1; console.error(`FAIL: ${name}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- hybrid routing ---
check("route on_device -> local", routeFromInferenceSource("on_device") === "local");
check("route in_cloud -> cloud", routeFromInferenceSource("in_cloud") === "cloud");
check("route undefined -> unavailable", routeFromInferenceSource(undefined) === "unavailable");
check("route garbage -> unavailable (never guess)", routeFromInferenceSource("somewhere-else") === "unavailable");
check("overall all local", overallRoute(["local", "local"]) === "local");
check("overall all cloud", overallRoute(["cloud", "cloud"]) === "cloud");
check("overall mixed", overallRoute(["local", "cloud"]) === "mixed");
check("overall empty -> unavailable", overallRoute([]) === "unavailable");
check("overall only unavailable -> unavailable", overallRoute(["unavailable", "unavailable"]) === "unavailable");
check("dedup case-insensitive", dedupKey("Full Name", "en", "prefer_on_device") === dedupKey("full name", "en", "prefer_on_device"));
check("dedup mode-specific", dedupKey("Full Name", "en", "prefer_on_device") !== dedupKey("Full Name", "en", "only_in_cloud"));

// --- device-init gating (the Phase 5 live-test fix) ---
check("device init required for prefer_on_device", deviceInitRequired("prefer_on_device") === true);
check("device init required for only_on_device", deviceInitRequired("only_on_device") === true);
check("device init required for prefer_in_cloud", deviceInitRequired("prefer_in_cloud") === true);
check("device init NOT required for only_in_cloud", deviceInitRequired("only_in_cloud") === false);
check("device init failure fatal ONLY for only_on_device", deviceInitFailureIsFatal("only_on_device") === true);
check("device init failure NOT fatal for prefer_on_device (cloud fallback must run)", deviceInitFailureIsFatal("prefer_on_device") === false);
check("device init failure NOT fatal for prefer_in_cloud", deviceInitFailureIsFatal("prefer_in_cloud") === false);
check("device init failure NOT fatal for only_in_cloud", deviceInitFailureIsFatal("only_in_cloud") === false);

// --- cloud consent ---
check("consent on: prefer_on_device stays", eq(resolveEffectiveMode("prefer_on_device", true), { mode: "prefer_on_device", cloudBlockedByConsent: false }));
check("consent off: prefer_on_device -> only_on_device, blocked", eq(resolveEffectiveMode("prefer_on_device", false), { mode: "only_on_device", cloudBlockedByConsent: true }));
check("consent off: prefer_in_cloud -> only_on_device, blocked", eq(resolveEffectiveMode("prefer_in_cloud", false), { mode: "only_on_device", cloudBlockedByConsent: true }));
check("consent off: only_in_cloud refused", eq(resolveEffectiveMode("only_in_cloud", false), { mode: "only_in_cloud", cloudBlockedByConsent: true }));
check("consent on: only_in_cloud allowed", eq(resolveEffectiveMode("only_in_cloud", true), { mode: "only_in_cloud", cloudBlockedByConsent: false }));
check("consent off: only_on_device unchanged, not blocked", eq(resolveEffectiveMode("only_on_device", false), { mode: "only_on_device", cloudBlockedByConsent: false }));

// --- automatic fallback plan (local first, cloud second, consent-gated) ---
check("plan prefer_on_device + consent -> [local, cloud]", eq(planFallbackStages("prefer_on_device", true).stages, ["only_on_device", "only_in_cloud"]));
check("plan prefer_on_device + no consent -> [local] only, blocked", eq(planFallbackStages("prefer_on_device", false), { stages: ["only_on_device"], cloudBlockedByConsent: true }));
check("plan prefer_in_cloud + consent -> [cloud, local]", eq(planFallbackStages("prefer_in_cloud", true).stages, ["only_in_cloud", "only_on_device"]));
check("plan prefer_in_cloud + no consent -> [local] only, blocked", eq(planFallbackStages("prefer_in_cloud", false), { stages: ["only_on_device"], cloudBlockedByConsent: true }));
check("plan only_on_device never includes cloud", eq(planFallbackStages("only_on_device", true).stages, ["only_on_device"]));
check("plan only_on_device + no consent is not consent-blocked", planFallbackStages("only_on_device", false).cloudBlockedByConsent === false);
check("plan only_in_cloud + consent -> [cloud]", eq(planFallbackStages("only_in_cloud", true).stages, ["only_in_cloud"]));
check("plan only_in_cloud + no consent -> no stages (refused)", eq(planFallbackStages("only_in_cloud", false), { stages: [], cloudBlockedByConsent: true }));
check("isLocalFailure detects api-not-enabled", isLocalFailure("Local LanguageModel API not available in this environment. (AI/api-not-enabled)") === true);
check("isLocalFailure detects prompt api failure", isLocalFailure("Prompt API session failed") === true);
check("isLocalFailure false for cloud 503", isLocalFailure("503 Service Unavailable") === false);
check("isLocalFailure false for empty error", isLocalFailure(undefined) === false);
check("shouldFallbackToCloud true for device errors", shouldFallbackToCloud("Local LanguageModel API not available in this environment. (AI/api-not-enabled)") === true);
check("shouldFallbackToCloud true for 503", shouldFallbackToCloud("503 Service Unavailable") === true);
check("shouldFallbackToCloud false for App Check errors", shouldFallbackToCloud("App Check failed to initialise") === false);
check("shouldFallbackToCloud false for validation errors", shouldFallbackToCloud("AI returned invalid output: bad json") === false);
check("shouldFallbackToCloud false for quota errors", shouldFallbackToCloud("quota exceeded") === false);

// --- per-language explanation with honest source (complete guide) ---
{
  const g = buildGuideFromText("Full name\nZebra code", { source: "paste", sourceLabel: "Pasted text", language: "en" });
  const phrase = g.fields.find((f) => f.fieldLabel === "Full name");
  const parser = g.fields.find((f) => f.fieldLabel === "Zebra code");
  check("lang helper: phrasebook field has EN from phrasebook", phrase !== undefined && fieldExplanationInLanguage(phrase, "en", "en").source === "phrasebook");
  check("lang helper: phrasebook field has Roman Urdu from phrasebook", phrase !== undefined && fieldExplanationInLanguage(phrase, "roman-ur", "en").source === "phrasebook" && fieldExplanationInLanguage(phrase, "roman-ur", "en").text.length > 0);
  check("lang helper: parser field has all 3 languages from parser", parser !== undefined && fieldExplanationInLanguage(parser, "en", "en").source === "parser" && fieldExplanationInLanguage(parser, "simple-en", "en").source === "parser" && fieldExplanationInLanguage(parser, "roman-ur", "en").source === "parser");
  const aiOneLang = { fieldLabel: "Full name", simpleExplanation: "AI explanation.", requiredInformation: ["x"], possibleDocuments: [], commonMistakes: ["y"], source: "ai", route: "cloud", explanations: { en: "AI explanation." } };
  check("lang helper: AI field with 1 language returns AI for that language", fieldExplanationInLanguage(aiOneLang, "en", "en").source === "ai");
  const missing = fieldExplanationInLanguage(aiOneLang, "roman-ur", "en");
  check("lang helper: AI field missing a language returns a labelled local note, not AI", missing.source === "local-note" && missing.text.length > 0);
  const aiAllLang = { ...aiOneLang, explanations: { en: "AI EN.", "simple-en": "AI simple.", "roman-ur": "AI Urdu." } };
  check("lang helper: AI field with all 3 languages returns AI for each", fieldExplanationInLanguage(aiAllLang, "en", "en").source === "ai" && fieldExplanationInLanguage(aiAllLang, "simple-en", "en").source === "ai" && fieldExplanationInLanguage(aiAllLang, "roman-ur", "en").text === "AI Urdu.");
  check("schema: explanations map validates", validateFieldExplanation({ fieldLabel: "x", simpleExplanation: "y", requiredInformation: [], possibleDocuments: [], commonMistakes: [], explanations: { en: "a", "roman-ur": "b" } }).ok === true);
  check("schema: empty explanations string fails", validateFieldExplanation({ fieldLabel: "x", simpleExplanation: "y", requiredInformation: [], possibleDocuments: [], commonMistakes: [], explanations: { en: "" } }).ok === false);
}

// --- transient classification ---
check("timeout is transient", isTransientError(new Error("request timed out")) === true);
check("503 is transient", isTransientError(new Error("503 Service Unavailable")) === true);
check("api-not-enabled is NOT transient (fail fast, no retry)", isTransientError(new Error("Local LanguageModel API not available in this environment. (AI/api-not-enabled)")) === false);
check("app check error is NOT transient", isTransientError(new Error("App Check failed")) === false);
check("abort is NOT transient", isTransientError(new Error("AbortError")) === false);

// --- schemas: AI JSON validation ---
const goodJson = JSON.stringify({
  fieldLabel: "Full name",
  simpleExplanation: "Write your full legal name.",
  requiredInformation: ["Your full name"],
  possibleDocuments: [],
  commonMistakes: ["Using a nickname"],
  exampleAnswer: "Hammad Shafique",
  confidence: 0.9,
});
check("valid AI JSON parses", parseFieldExplanationJson(goodJson).ok === true);
check("invalid JSON rejected", parseFieldExplanationJson("{not json").ok === false);
check("AI JSON missing fields rejected", parseFieldExplanationJson(JSON.stringify({ fieldLabel: "x" })).ok === false);
check("validateFieldExplanation accepts good object", validateFieldExplanation(JSON.parse(goodJson)).ok === true);

// --- parser + phrasebook + guide ---
const fields = parseFormFields("Full name\nEmail address\nDate of birth");
check("parser finds 3 fields", fields.length === 3);
check("email type guessed", guessFieldType("Email address") === "email");
check("phrasebook has 34 entries", PHRASEBOOK.length === 34);
const entry = lookupPhrasebook("Full name");
check("phrasebook lookup hits Full name", entry !== null && entry.explanations.en.length > 0 && entry.explanations["roman-ur"].length > 0);
check("phrasebook lookup misses unknown label", lookupPhrasebook("Quantum flux capacitor serial") === null);
const guide = buildGuideFromText("Full name\nEmail address", { source: "paste", sourceLabel: "Pasted text", language: "en" });
check("guide has 2 fields", guide.fields.length === 2 && guide.detectedLabels.length === 2);
check("new guide route is unavailable (no AI run yet)", guide.inferenceRoute === "unavailable");
check("slugify", slugify("Full Name!") === "full-name");
check("formatLatency", formatLatency(1500) === "1.5 s");

// --- friendly AI errors (summarizeAiError) ---
// Raw AI errors are long Firebase dumps (URLs + JSON). The UI must show one
// short plain-language sentence, never the dump.
const quotaRaw = "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/formease-ai-933b6/models/gemini-3.5-flash-lite:generateContent: [429 ] You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15. Please retry in 33.481147255s. [{\"@type\":\"type.googleapis.com/google.rpc.Help\"}] (AI/fetch-error)";
const quota = summarizeAiError(quotaRaw);
check("friendly error: quota says limit + wait time", quota.summary.includes("hit its limit") && quota.summary.includes("34 seconds"), quota.summary);
check("friendly error: quota retry seconds parsed", quota.retrySeconds === 34, String(quota.retrySeconds));
check("friendly error: quota keeps raw detail", quota.detail === quotaRaw);
check("friendly error: 500 high demand says busy", summarizeAiError("AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/x/models/gemini-3.5-flash-lite:generateContent: [500 ] This model is currently experiencing high demand. (AI/fetch-error)").summary.includes("busy right now"));
check("friendly error: api-not-enabled says on-device unavailable", summarizeAiError("Local LanguageModel API not available in this environment. (AI/api-not-enabled)").summary.includes("On-device AI isn't available"));
check("friendly error: App Check says security check", summarizeAiError("AI: App Check token is invalid (AI/app-check)").summary.includes("security check failed"));
check("friendly error: empty error is generic", summarizeAiError("").summary.includes("couldn't complete"));
check("friendly error: unknown error is generic but detail kept", summarizeAiError("Something odd happened").summary.includes("couldn't complete") && summarizeAiError("Something odd happened").detail === "Something odd happened");

// --- extension transfer ---
const scan = { id: "scan-1", url: "https://example.edu/apply", title: "Apply", scannedAt: new Date().toISOString(), language: "en", fields: [{ id: "f-1", label: "Full name", required: true, type: "text", isUpload: false }] };
const encoded = encodeScanForUrl(scan);
check("scan encodes for URL", typeof encoded === "string" && (encoded?.length ?? 0) > 0);
if (encoded) {
  const decoded = decodeScanFromUrl(encoded);
  check("scan decodes round-trip", decoded.ok === true && decoded.ok && decoded.scan.fields[0]?.label === "Full name");
}
const huge = { ...scan, fields: Array.from({ length: 500 }, (_, i) => ({ id: `f-${i}`, label: `Field ${i} ${"x".repeat(100)}`, required: false, type: "text", isUpload: false })) };
check("oversize scan refused for URL", encodeScanForUrl(huge) === null);

rmSync(outDir, { recursive: true, force: true });
console.log(`SMOKE: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
