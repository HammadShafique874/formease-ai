# Firebase setup — FormEase AI (Phase 5)

No Firebase project or credentials exist in this repo. Everything below is
done by **you** in the Firebase / Google Cloud consoles. Never commit
`apps/web/.env`, a debug token, or an API key. The Chrome extension never
uses Firebase or App Check — AI runs only in the web app.

## 1. Create a Firebase project

1. Sign in to the [Firebase console](https://console.firebase.google.com/) and create a project (a name like `formease-ai`).
2. When prompted, you do **not** need Google Analytics for AI Logic.

## 2. Enable Firebase AI Logic (Gemini Developer API)

1. In the Firebase console go to **AI Services > AI Logic** and click **Get started**.
2. When asked for a Gemini API provider, choose the **Gemini Developer API** (quickest, no billing to start). You can switch to the Agent Platform Gemini API (formerly Vertex AI) later.
3. Follow the guided workflow. It sets up the required APIs and resources.
4. **App Check enforcement:** starting 2 November 2026 Firebase automatically enforces App Check for Firebase AI Logic (if not already enforced). Requests without a valid App Check token are blocked — so step 3 below is not optional.

## 3. Register the web app and copy the config

1. In the Firebase console, register a **Web app** (</> icon) for your project.
2. Copy `.env.example` to `apps/web/.env` and fill in the values from the console (names only — never paste values into chat, docs, or git):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID` (optional)
3. `apps/web/.env` is gitignored (root `.gitignore` covers `.env`). Verify with `git status` before committing.

## 4. App Check — reCAPTCHA Enterprise (web)

1. In Google Cloud Console, create a **score-based reCAPTCHA Enterprise key** for your hosted domain (do not add `localhost` to a production key; leave the checkbox challenge off).
2. In the Firebase console go to **Security > App Check > Apps**, select your web app, and register it with that site key.
3. Set `VITE_APPCHECK_SITE_KEY` in `apps/web/.env`.
4. In **Security > App Check > APIs**, find **Firebase AI Logic** and enforce App Check for it.
5. The web app calls `initializeAppCheck` lazily, exactly once, before the first AI call (`apps/web/src/firebase/appCheck.ts`), with `isTokenAutoRefreshEnabled: true`. If initialisation throws, AI calls return `route: "unavailable"` with an error naming App Check instead of crashing.

### Local development — debug tokens (dev only)

1. Set `VITE_APPCHECK_DEBUG=true` in `apps/web/.env` (never in production).
2. Run `npm run dev`, open the app, and open the browser DevTools console. The SDK prints a debug token, e.g. `AppCheck debug token: "123a4567-..."`.
3. In the Firebase console go to **Security > App Check > Apps > Manage debug tokens** and register that token.
4. The code sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` **before** calling `initializeAppCheck` — the SDK reads the flag inside `initializeAppCheck`, so the order matters. With a site key set, the debug flag is used with the Enterprise provider; without a site key (dev only) a placeholder provider is passed because the SDK exchanges the debug token instead of calling the provider.
5. Never commit a debug token, never log one, and never enable debug mode in a production build (`import.meta.env.DEV` guards it).

## 5. On-device inference — browser setup

On-device inference works only on **Chrome on Desktop, version 139 or higher**, using the Prompt API / Gemini Nano. It does not work in other browsers, on mobile, or in the Chrome extension.

1. Update Chrome (`chrome://settings/help`).
2. Enable the flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart Chrome.
3. (Optional, recommended before a demo) Pre-download the model: open DevTools console and run `await LanguageModel.availability();` — it should print `available`, `downloading`, or `downloadable`. If `downloadable`, run `await LanguageModel.create();` and wait for the download. The app also downloads the model on first use, after you click "Analyse form" (a user gesture is required), and shows download progress.

## 6. How hybrid inference is implemented

- SDK: `firebase` 13.4.0 (`@firebase/ai` 3.1.0), imports from `firebase/ai` only.
- `getAI(app, { backend: new GoogleAIBackend() })`, then `getGenerativeModel(ai, { mode })` with `mode` one of `InferenceMode.PREFER_ON_DEVICE` (default), `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`. The mode comes from Settings ("AI processing" preference).
- **No cloud model name is hard-coded.** `inCloudParams.model` is left unspecified, so the SDK default cloud model applies.
- Structured output: `model.generationConfig = { responseMimeType: "application/json", responseSchema: Schema.object(...) }` matching `FieldExplanation` exactly. (`HybridParams` carries no `generationConfig`, so it is assigned on the model instance.) Every AI response is validated with the shared `parseFieldExplanationJson` / `validateFieldExplanation` in `packages/shared/src/schemas.ts`; invalid output is returned as an error, never shown as an explanation, and never replaced with phrasebook text presented as AI.
- On-device inference is single-turn text generation only (no chat). A multi-field guide is explained one field at a time, sequentially.
- **Automatic fallback (no manual route picking).** One click on "Analyse form" runs a plan derived from the saved preference + saved consent (`planFallbackStages` in `packages/shared/src/hybrid.ts`): "Prefer on-device" tries on-device first (`ONLY_ON_DEVICE`) and, if that fails at init or during generation, automatically tries the cloud (`ONLY_IN_CLOUD`); "Prefer cloud" does the reverse. `ONLY_ON_DEVICE` never touches the cloud; `ONLY_IN_CLOUD` never touches the device model. A failure the other route cannot fix (bad output, App Check, auth, quota, cancelled) ends the run instead of burning a cloud call. If both stages fail, the error says both failed. `model.initializeDeviceModel(progressCb)` is called only from the "Analyse form" click (a user gesture), with download progress shown in the UI; it is a pre-warm for the on-device stage, and a failed init only ends that stage. **Bug found in live testing 2026-11-25:** the original code awaited `initializeDeviceModel()` unconditionally and returned its `api-not-enabled` error, so a browser without the Prompt API could never reach the cloud fallback — fixed by the explicit two-stage plan above.
- Timeouts: 60 s per field (`generateContent(..., { timeout: 60000 })`, SDK default is 180 s), 120 s overall budget for a multi-field run, and an AbortSignal from the Cancel button. One retry only, only for transient failures (network / timeout / 5xx / 429); validation, App Check, auth, and `ONLY_ON_DEVICE` unavailability are never retried. In-flight duplicates are deduped by field + language + mode.
- Cloud consent (asked only when needed): the app never sends form text to the cloud without consent. Consent is NOT asked before a run. If on-device AI fails and consent is the only thing blocking the cloud stage, the run stops and the Workspace shows a just-in-time prompt ("Enable cloud fallback and retry") plus a clear message; the same checkbox lives in Settings → Privacy. Once granted it is remembered (localStorage `formease:v1:cloud-consent`) and later runs fall back automatically. Without consent, prefer modes run on-device only and cloud-only is refused. **To get a Cloud badge on a machine without on-device AI, consent must be granted when asked** — otherwise the run is on-device only by design and fails honestly when Nano is unavailable.
- The actual route is read from `result.response.inferenceSource` (`on_device` → Local, `in_cloud` → Cloud) and shown per field and as an overall badge (Local / Cloud / **Mixed** when a run used both). The overall route is "local" only if *every* field ran locally.

## 7. How to verify local vs cloud

1. `npm run dev`, open the Dashboard — **Hybrid AI status** shows three separate facts: Firebase configured, on-device model status (`LanguageModel.availability()`), and App Check status.
2. In the Workspace, analyse a form — AI guidance runs automatically after analysis (Settings → AI processing can turn auto-run off; then use the "Generate AI guidance" button).
3. Watch the staged progress ("Step 2 of 2 — Generating AI guidance…", "Explaining field 3 of 12…", Nano download % when applicable), then check the complete guide in place: each field with English / Simple English / Roman Urdu tabs and a Local / Cloud / Mixed badge per field.
4. To see automatic fallback, test in a browser without the Prompt API (or with the flag off): click "Analyse form", grant cloud consent when asked, and the fields come back badged Cloud. To force local-only, use "On-device only" (it errors honestly if Nano is unavailable — it never silently falls back to cloud). To force the cloud path directly, use Settings → "Prefer cloud". Both scenarios are covered by automated tests: `node scripts/ai-fallback-test.mjs` (fake-model service test, 25 checks) and `node scripts/smoke-test.mjs` (planner + classifier checks).
5. With no `.env`, the Workspace shows "AI guidance not generated — Firebase is not configured" and the guide stays clearly marked provisional (phrasebook/parser only); no AI call is attempted.

## 8. Known limitations

- The extension cannot use Hybrid Inference or App Check directly: a `chrome-extension://` origin is not attestable the same way. The extension detects fields and sends context to this web app, where AI runs. See `apps/extension/` (no Firebase code there — verified by grep).
- On-device inference supports text-only input (and JPEG/PNG images); it does **not** support PDF input, multi-turn chat, tools/function calling, or server prompt templates. PDFs are text-extracted client-side first and sent as text; complex guides may fall back to cloud.
- AI monitoring in the Firebase console shows cloud inference only, not on-device inference.
- `countTokens` is not used: the count differs between on-device and cloud models.
