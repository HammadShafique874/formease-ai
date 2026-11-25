# FormEase AI — "Every Form. Finally Understandable."

BuildHybridAI 2026 (Google + Devpost). A Chrome Extension + React web dashboard that
explains complicated online forms in simple English or Roman Urdu, using
Firebase AI Logic Hybrid Inference (local-first, cloud fallback).

## Phase 5 status — Firebase AI Logic Hybrid Inference integrated (credentials NOT included)

What works now:
- Real hybrid inference in the web app only (`apps/web/src/services/ai.ts`, Firebase 13.4.0 / `@firebase/ai` 3.1.0): `getAI(app, { backend: new GoogleAIBackend() })` + `getGenerativeModel(ai, { mode })`, structured JSON output via `responseSchema` (`Schema.object(...)` matching `FieldExplanation`), every response validated with shared `parseFieldExplanationJson`. No cloud model name is hard-coded — the SDK default applies.
- Workspace "Analyse form" is one click for the whole journey: it detects the fields and automatically runs AI guidance for every field (user gesture, calls `initializeDeviceModel` with download progress shown). The complete guide appears in place — each field with English / Simple English / Roman Urdu tabs, required information, an example, possible documents and common mistakes — with staged progress ("Step 2 of 2 — Generating AI guidance…", "Explaining field 3 of 12…"), Cancel (AbortSignal), 60 s per-field timeout, 120 s overall budget, one retry only for transient failures, in-flight dedup. Partial failure keeps successes and keeps the phrasebook explanation (labelled) for failed fields. Auto-run can be turned off in Settings → AI processing, in which case "Generate AI guidance" runs it manually.
- Actual route is shown per field and overall: Local / Cloud / Mixed (mixed = some fields local, some cloud). Never a fake route. With no Firebase config the button honestly says "AI unavailable — Firebase is not configured".
- App Check (`apps/web/src/firebase/appCheck.ts`): reCAPTCHA Enterprise in production, debug provider in local dev only. **Bug fixed:** Phase 2 set the debug flag and returned before calling `initializeAppCheck`, so debug was never initialised — now the flag is set *before* `initializeAppCheck` and it is always called (debug mode without a site key uses a placeholder provider, since the SDK exchanges the debug token instead). Initialised lazily, exactly once, before the first AI call; a throw surfaces as an AI error, not a crash.
- Settings: AI preference (prefer/only on-device/cloud) is actually used; cloud consent is enforced (no consent → prefer modes run on-device only, cloud-only refused); a Firebase setup section shows which env var *names* are set (never values) and the App Check status, with a copyable setup checklist.
- Dashboard Hybrid AI status shows three separate facts: Firebase configured, on-device model status, App Check status — plus the latest AI run's route.
- Full setup steps: `docs/firebase-setup.md`.
- **Supported browsers and devices:** on-device inference needs Chrome Desktop 139+ with the Prompt API flag (`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`) and the Gemini Nano model downloaded; it is not available on every device or browser, and the app never assumes it is — when Nano is unavailable the run falls back to cloud (with consent) or fails honestly. Cloud inference works in any modern browser once Firebase is configured. The web app is responsive (desktop / laptop / tablet / mobile); the extension popup is designed for extension dimensions. The Muse Space preview is a demo recreation, not the production build.

What still needs YOU (no credentials exist in this repo):
- A Firebase project + AI Logic enabled (Gemini Developer API), web app config in `apps/web/.env`, a reCAPTCHA Enterprise site key, App Check enforcement, and (dev only) a debug token. Chrome 139+ with the Prompt API flag for on-device runs.
- A live local/cloud test in a real browser — impossible here without credentials, so the no-config behaviour is what was verified (see below).
- The actual deploy and push (Phase 8 preparation is done — configs, scripts and docs are in this repo): run `npm run deploy` after `firebase login` (your Google account, project `formease-ai-933b6`), and push the git repo to GitHub. See `docs/deployment.md`.

What works now (no credentials needed):
- Web app builds and runs: landing, dashboard, workspace, guide, checklist, saved guides, settings — responsive with a mobile hamburger nav, loading skeletons, empty/error states, and no dead buttons.
- Form analysis: paste text, URL input (never fetched — CORS is explained honestly), PDF upload (real client-side text extraction via pdfjs-dist 5.4.296, line-aware) and image upload (real on-device OCR via tesseract.js 6.0.1, lazy, progress %, cancellable, ~60 s timeout). PDF/JPEG/PNG only, 10 MB max.
- Explanations WITHOUT fake AI: a deterministic curated phrasebook (`packages/shared/src/phrasebook.ts`, 34 entries) in English / Simple English / Roman Urdu, plus a generic local-parser fallback that re-uses the original label and says "no phrasebook entry yet". Every explanation carries a visible source label: "Phrasebook (local)", "Local parser", or "AI explanation unavailable — Firebase not configured (Phase 5)". The language selector switches explanations everywhere (Landing example, Workspace, Guide, extension popup).
- Extension → dashboard transfer, both paths: primary storage bridge (background stores the scan in `chrome.storage.local`, opens `#/workspace?scan=<id>`; a dashboard-origin-only content script validates it and hands it to the web app via localStorage `formease.incomingScan` + a window event) and URL fallback (`?scanData=` base64url, small scans < 8 KB only; oversized scans show an honest message instead of truncating). Popup shows field count/summary, "Send to Dashboard", "Copy scan JSON", "Open Dashboard"; highlight/scroll-to-field still works.
- Saved guides + checklists: full CRUD (save, search, filter by source/language, rename, delete with confirm, duplicate, export JSON, copy JSON, export Markdown), per-guide checklist with progress %, reset, rebuild; settings (language, style, AI preference, privacy toggles, clear-all) persist and take effect. Dashboard stats and recent activity are computed from real saved data + a local activity log; demo data is labelled "Demo" with Load/Clear controls.
- The Chrome extension has no Firebase/AI code by design — AI runs only in the web app.

What does NOT work yet (without your Firebase credentials):
- A live AI call. The integration is complete and wired, but until you add
  `apps/web/.env` (see `docs/firebase-setup.md`) every AI request honestly
  reports `route: "unavailable"` with "Firebase not configured" — no fake AI
  responses, no simulated local inference.

Known limits (Phase 4, honest):
- OCR (tesseract.js) fetches its worker core + English model from a CDN on first use, so it needs network and is slow on first run (~19 s in a Node test); it fails honestly with a paste-text fallback when offline or timed out.
- PDF text extraction relies on the PDF having an embedded text layer; image-only (scanned) PDFs yield no text — upload as an image for OCR instead.
- Extension transfer only works when the dashboard runs at the single configured URL (`http://localhost:5173` until the hosted switch — one constant in `apps/web/src/config.ts`, `apps/extension/src/shared/config.ts`, and duplicated in the self-contained content script; see `docs/deployment.md`).

## Run

```bash
cd formease
npm install
npm run dev        # web at http://localhost:5173
npm run build      # web dist/ + extension dist/
npm run typecheck
npm run lint
```

Load the extension: Chrome → `chrome://extensions` → Developer mode →
Load unpacked → select `apps/extension/dist`.

## Configure Firebase (Phase 5)

Full steps: `docs/firebase-setup.md`. Summary:

1. Create a Firebase project, enable AI Logic (Gemini Developer API).
2. Copy `.env.example` to `apps/web/.env` and fill `VITE_FIREBASE_*`.
3. Register the web app with reCAPTCHA Enterprise for App Check; set
   `VITE_APPCHECK_SITE_KEY`. Debug tokens only on localhost (`VITE_APPCHECK_DEBUG=true`).
4. Verify in the Dashboard (Hybrid AI status) and by clicking "Analyse form" in the Workspace — AI guidance runs automatically and the complete guide appears in place.

## Architecture

- `packages/shared/` — types, runtime validators, pure helpers (no deps).
- `apps/web/` — React 19 + TypeScript (strict) + Vite 8. All Firebase code is
  isolated in `src/firebase/` + `src/services/ai.ts`.
- `apps/extension/` — Manifest V3, TypeScript, no framework, no Firebase.

License: Apache License 2.0 — see `LICENSE`.
