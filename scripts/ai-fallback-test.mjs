// FormEase AI — automatic fallback test for the real AI service.
// Run:  node scripts/ai-fallback-test.mjs   (Node 20+, after `npm install`)
// It compiles the real apps/web/src/services/ai.ts (with stubbed Firebase
// config / App Check — no network, no browser, no Prompt API) and drives it
// with a fake model factory, proving both scenarios the user asked for:
//   A. Local AI unavailable  -> automatic Firebase Cloud AI fallback (Cloud badge)
//   B. Local AI available    -> Local AI is used first (Local badge, cloud never called)
// Plus: consent-on-demand, both-fail, on-device-only, cloud-only, and the
// multi-field early stop. Exit non-zero on any failure.
/* global console, process, URL */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "formease-fallback-"));
let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed += 1; } else { failed += 1; console.error(`FAIL: ${name}${extra ? ` — ${extra}` : ""}`); }
};

try {
  const tsc = join(root, "node_modules", ".bin", "tsc");
  // 1. Compile @formease/shared to $tmp/shared (+ package.json so it can be imported by name).
  const sharedOut = join(tmp, "shared");
  execFileSync(tsc, [
    join(root, "packages", "shared", "src", "types.ts"),
    join(root, "packages", "shared", "src", "utils.ts"),
    join(root, "packages", "shared", "src", "phrasebook.ts"),
    join(root, "packages", "shared", "src", "schemas.ts"),
    join(root, "packages", "shared", "src", "guide.ts"),
    join(root, "packages", "shared", "src", "transfer.ts"),
    join(root, "packages", "shared", "src", "hybrid.ts"),
    join(root, "packages", "shared", "src", "index.ts"),
    "--outDir", sharedOut, "--target", "ES2023", "--module", "NodeNext",
    "--moduleResolution", "NodeNext", "--skipLibCheck", "--declaration",
  ], { stdio: "pipe" });
  writeFileSync(join(sharedOut, "package.json"), JSON.stringify({ name: "@formease/shared", version: "0.1.0", type: "module", main: "index.js", exports: { ".": "./index.js" } }));

  // 2. Stage the real ai.ts with stubbed Firebase config / App Check.
  const stage = join(tmp, "stage");
  const svcDir = join(stage, "apps", "web", "src", "services");
  const fbDir = join(stage, "apps", "web", "src", "firebase");
  mkdirSync(svcDir, { recursive: true });
  mkdirSync(fbDir, { recursive: true });
  cpSync(join(root, "apps", "web", "src", "services", "ai.ts"), join(svcDir, "ai.ts"));
  writeFileSync(join(fbDir, "config.ts"), `
export interface FirebaseConfig { apiKey: string; authDomain: string; projectId: string; storageBucket: string; messagingSenderId: string; appId: string; measurementId?: string; }
export const firebaseConfig: FirebaseConfig = { apiKey: "test-api-key", authDomain: "test.firebaseapp.com", projectId: "test-project", storageBucket: "test.firebasestorage.app", messagingSenderId: "123", appId: "1:123:web:abc" };
export const isFirebaseConfigured = true;
export const appCheckSiteKey = "";
export const appCheckDebugToken = "";
export const dashboardUrl = "http://localhost:5173/#/dashboard";
`);
  writeFileSync(join(fbDir, "appCheck.ts"), `
export type AppCheckStatus = "not-initialised" | "enterprise" | "debug" | "not-configured" | "error";
export function getAppCheckStatus(): { status: AppCheckStatus; error: string | null } { return { status: "not-initialised", error: null }; }
export function isAppCheckConfigured(): boolean { return false; }
export function initAppCheck(_app: unknown): void {}
`);
  writeFileSync(join(stage, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext",
      skipLibCheck: true, strict: true, outDir: join(tmp, "compiled"),
      rootDir: stage, rewriteRelativeImportExtensions: true,
      // Types come from the compiled shared declarations; the emitted JS
      // keeps the "@formease/shared" specifier, resolved at runtime via the
      // symlink below.
      paths: { "@formease/shared": [join(tmp, "shared", "index.d.ts")] },
    },
    include: ["apps/**/*"],
  }));
  // Let the stage resolve "firebase/*" types from the workspace node_modules.
  symlinkSync(join(root, "node_modules"), join(stage, "node_modules"), "dir");
  try {
    execFileSync(tsc, ["-p", join(stage, "tsconfig.json")], { stdio: "pipe" });
  } catch (e) {
    console.error("STAGE TSC FAILED:\n", e.stdout?.toString() ?? "", e.stderr?.toString() ?? "", e.message);
    throw e;
  }
  const compiled = join(tmp, "compiled");
  mkdirSync(join(compiled, "node_modules", "@formease"), { recursive: true });
  symlinkSync(sharedOut, join(compiled, "node_modules", "@formease", "shared"), "dir");

  const { FirebaseHybridService } = await import(pathToFileURL(join(compiled, "apps", "web", "src", "services", "ai.js")).href);

  // --- fake model -------------------------------------------------------
  // The fake AI returns all three languages, like the real service prompt
  // now requests — the complete guide must show EN / Simple EN / Roman Urdu
  // from one call, without a second AI round.
  const validJson = (label) => JSON.stringify({
    fieldLabel: label,
    simpleExplanation: `AI explanation for ${label}.`,
    explanations: { en: `AI explanation for ${label}.`, "simple-en": `Simple AI explanation for ${label}.`, "roman-ur": `${label} ke baare mein AI wazahat.` },
    requiredInformation: [`The information asked for in "${label}"`],
    possibleDocuments: [],
    commonMistakes: ["Guessing"],
    exampleAnswer: "Example",
    confidence: 0.9,
  });
  // behavior: { local: { initError?, genError?, genSource? }, cloud: {...} }
  function makeFake(behavior) {
    const calls = [];
    const createModel = async (mode) => {
      const isLocal = mode === "only_on_device";
      const b = isLocal ? behavior.local : behavior.cloud;
      return {
        initializeDeviceModel: async () => {
          calls.push(`init:${mode}`);
          if (b?.initError) throw new Error(b.initError);
        },
        generateContent: async () => {
          calls.push(`gen:${mode}`);
          if (b?.genError) throw new Error(b.genError);
          const source = b?.genSource ?? (isLocal ? "on_device" : "in_cloud");
          return { response: { inferenceSource: source, text: () => validJson("Full name") } };
        },
      };
    };
    return { calls, createModel };
  }
  const req = (mode) => ({ fieldLabel: "Full name", context: "Pasted text", language: "en", mode });
  const guide = (labels) => ({
    id: "guide-1", title: "Test form", source: "paste", sourceLabel: "Pasted text",
    language: "en", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    fields: [], detectedLabels: labels, inferenceRoute: "unavailable", inferenceNote: "",
  });

  // A. Local unavailable -> automatic cloud fallback (consent granted).
  {
    const fake = makeFake({ local: { initError: "Local LanguageModel API not available in this environment. (AI/api-not-enabled)" }, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => true, createModel: fake.createModel });
    const r = await svc.explainField(req("prefer_on_device"));
    check("A: local unavailable -> cloud route", r.route === "cloud", `route=${r.route} error=${r.error ?? ""}`);
    check("A: cloud explanation returned", r.data?.source === "ai" && r.data?.route === "cloud");
    check("A: one AI call returned all 3 languages", r.data?.explanations?.en === "AI explanation for Full name." && r.data?.explanations?.["simple-en"] === "Simple AI explanation for Full name." && r.data?.explanations?.["roman-ur"] === "Full name ke baare mein AI wazahat.");
    check("A: local generateContent never ran (init failed first)", !fake.calls.includes("gen:only_on_device"), fake.calls.join(","));
    check("A: cloud generateContent ran once", fake.calls.filter((c) => c === "gen:only_in_cloud").length === 1, fake.calls.join(","));
  }
  // B. Local available -> local used first, cloud never called.
  {
    const fake = makeFake({ local: {}, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => true, createModel: fake.createModel });
    const r = await svc.explainField(req("prefer_on_device"));
    check("B: local available -> local route", r.route === "local", `route=${r.route}`);
    check("B: cloud never called", !fake.calls.some((c) => c.includes("only_in_cloud")), fake.calls.join(","));
    check("B: local generateContent ran once", fake.calls.filter((c) => c === "gen:only_on_device").length === 1);
  }
  // I. Local fails DURING generation -> automatic cloud fallback.
  {
    const fake = makeFake({ local: { genError: "Prompt API session failed" }, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => true, createModel: fake.createModel });
    const r = await svc.explainField(req("prefer_on_device"));
    check("I: local generation failure -> cloud route", r.route === "cloud", `route=${r.route} error=${r.error ?? ""}`);
  }
  // C. Consent off + local unavailable -> ask for consent just in time, no cloud call.
  {
    const fake = makeFake({ local: { initError: "Local LanguageModel API not available in this environment. (AI/api-not-enabled)" }, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => false, createModel: fake.createModel });
    const r = await svc.explainField(req("prefer_on_device"));
    check("C: no consent -> needsCloudConsent", r.needsCloudConsent === true, `route=${r.route}`);
    check("C: no cloud call without consent", !fake.calls.some((c) => c.includes("only_in_cloud")), fake.calls.join(","));
    check("C: error asks to enable cloud fallback", (r.error ?? "").includes("Enable cloud fallback"));
  }
  // D. Both fail -> clear both-failed error.
  {
    const fake = makeFake({ local: { initError: "Local LanguageModel API not available in this environment. (AI/api-not-enabled)" }, cloud: { genError: "503 Service Unavailable" } });
    const svc = new FirebaseHybridService({ getCloudConsent: () => true, createModel: fake.createModel });
    const r = await svc.explainField(req("prefer_on_device"));
    check("D: both fail -> unavailable", r.route === "unavailable");
    check("D: error says both failed", (r.error ?? "").includes("both failed"), r.error ?? "");
  }
  // E. On-device only: local fails, never cloud, no consent prompt.
  {
    const fake = makeFake({ local: { initError: "Local LanguageModel API not available in this environment. (AI/api-not-enabled)" }, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => false, createModel: fake.createModel });
    const r = await svc.explainField(req("only_on_device"));
    check("E: only_on_device stays local-only", !fake.calls.some((c) => c.includes("only_in_cloud")));
    check("E: only_on_device does not ask for consent", r.needsCloudConsent !== true);
  }
  // F. Prefer cloud + consent: cloud first, local never called.
  {
    const fake = makeFake({ local: {}, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => true, createModel: fake.createModel });
    const r = await svc.explainField(req("prefer_in_cloud"));
    check("F: prefer_in_cloud -> cloud route", r.route === "cloud", `route=${r.route}`);
    check("F: local never called", !fake.calls.some((c) => c.includes("only_on_device")), fake.calls.join(","));
  }
  // G. Cloud only without consent: refused before any model call.
  {
    const fake = makeFake({ local: {}, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => false, createModel: fake.createModel });
    const r = await svc.explainField(req("only_in_cloud"));
    check("G: cloud-only without consent refused", r.route === "unavailable" && (r.error ?? "").includes("consent"));
    check("G: no model call at all", fake.calls.length === 0, fake.calls.join(","));
  }
  // H. Multi-field run, consent off, local unavailable: stops after first field, asks once.
  {
    const fake = makeFake({ local: { initError: "Local LanguageModel API not available in this environment. (AI/api-not-enabled)" }, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => false, createModel: fake.createModel });
    const r = await svc.explainForm(guide(["Full name", "Email address", "Date of birth"]), "prefer_on_device");
    check("H: form run needsCloudConsent", r.needsCloudConsent === true);
    check("H: stopped after first field (no repeated failures)", (r.results ?? []).length === 1, `results=${(r.results ?? []).length}`);
    check("H: no cloud call without consent", !fake.calls.some((c) => c.includes("only_in_cloud")));
  }
  // H2. Multi-field run, consent on, local unavailable: all fields fall back to cloud.
  {
    const fake = makeFake({ local: { initError: "Local LanguageModel API not available in this environment. (AI/api-not-enabled)" }, cloud: {} });
    const svc = new FirebaseHybridService({ getCloudConsent: () => true, createModel: fake.createModel });
    const r = await svc.explainForm(guide(["Full name", "Email address"]), "prefer_on_device");
    check("H2: form run -> cloud route", r.route === "cloud", `route=${r.route} error=${r.error ?? ""}`);
    check("H2: both fields explained by cloud", (r.data ?? []).length === 2, `data=${(r.data ?? []).length}`);
  }
  // J. One field fails with a real quota dump -> the aggregated error is one
  // short plain-language line, never the raw Firebase dump (URLs + JSON).
  {
    const quotaDump = "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/formease-ai-933b6/models/gemini-3.5-flash-lite:generateContent: [429 ] You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite. Please retry in 33.481147255s. [{\"@type\":\"type.googleapis.com/google.rpc.Help\"}] (AI/fetch-error)";
    let cloudCalls = 0;
    const createModel = async () => ({
      initializeDeviceModel: async () => { throw new Error("Local LanguageModel API not available in this environment. (AI/api-not-enabled)"); },
      generateContent: async () => {
        cloudCalls += 1;
        if (cloudCalls === 2) throw new Error(quotaDump);
        return { response: { inferenceSource: "in_cloud", text: () => validJson("Full name") } };
      },
    });
    const svc = new FirebaseHybridService({ getCloudConsent: () => true, createModel });
    const r = await svc.explainForm(guide(["Full name", "Email address"]), "prefer_on_device");
    check("J: one field succeeded by cloud", (r.data ?? []).length === 1, `data=${(r.data ?? []).length} error=${r.error ?? ""}`);
    check("J: aggregated error is short and plain", (r.error ?? "").length < 300, r.error ?? "");
    check("J: aggregated error has no raw URL or JSON", !(r.error ?? "").includes("googleapis.com") && !(r.error ?? "").includes("{"), r.error ?? "");
    check("J: aggregated error says both failed", (r.error ?? "").includes("both failed"), r.error ?? "");
    check("J: aggregated error gives the quota reason", (r.error ?? "").includes("hit its limit"), r.error ?? "");
    check("J: aggregated error names the failed field", (r.error ?? "").includes("Email address"), r.error ?? "");
  }
} catch (e) {
  failed += 1;
  console.error("TEST HARNESS ERROR:", e?.message ?? e);
  if (e?.stderr) console.error(e.stderr.toString());
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`AI FALLBACK TEST: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
