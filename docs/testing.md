# FormEase AI — Test Report (Phase 7)

Run 2026-11-25, after the Phase 6 security fix (unused `scripting`
permission removed). Commands were actually executed; nothing below is
assumed. Anything this environment cannot test is marked **not proven**
rather than claimed.

## Automated checks (all passing)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | Pass (shared, web, extension) |
| Lint | `npm run lint` | Pass, 0 errors |
| Build | `npm run build` | Pass — web `dist/` + extension `dist/` |
| Shared logic | `npm test` → `node scripts/smoke-test.mjs` | **71/71** |
| AI fallback service | `npm test` → `node scripts/ai-fallback-test.mjs` | **25/25** |
| Web dev server | `npm run dev` → `curl http://localhost:5173/` | HTTP 200 |
| Web production bundle | `npm run preview` → `curl http://localhost:4173/` | HTTP 200, title "FormEase AI — Every Form. Finally Understandable." |
| Extension JS syntax | `node --check` on `dist/background/background.js`, `dist/content/content.js`, `dist/popup/popup.js` | Pass |
| Extension manifest | Parsed `dist/manifest.json` | Valid MV3; permissions `["activeTab", "storage"]`; host `http://localhost:5173/*` (dev) |

`npm test` covers: form parsing, phrasebook lookup (34 entries), guide
building, transfer encode/decode, schema validation (valid + malformed AI
JSON), the fallback planner (`planFallbackStages`), failure classifiers
(`isLocalFailure`, `shouldFallbackToCloud`, transient detection), consent
gating, and the per-language explanation helper. The fake-model service
test drives the **real** `FirebaseHybridService` with injected fake models:
local-unavailable → cloud, local-available → local first with cloud never
called, local generation failure → cloud, consent-off → prompt with no
cloud call, both-fail error, on-device-only, cloud-only refusal,
multi-field early stop, and one AI call returning all three languages.

## Master prompt §12 scenario checklist

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Website loads successfully | ✅ Verified | Dev server 200 + production preview 200 (this run); user manual-tested the Space preview 2026-11-25 |
| 2 | Extension installs successfully | ⚠️ Not proven live | Build + `node --check` + valid manifest only. Needs real Chrome → Load unpacked → `apps/extension/dist` |
| 3 | Extension detects a normal HTML form | ⚠️ Not proven live | Detection code reviewed (label/`for`, wrapping label, aria, placeholder, fieldset legend; skips hidden/submit/button, skips invisible fields). No live browser here to run it on |
| 4 | Extension detects a form with missing labels where possible | ⚠️ Not proven live | Parser fallbacks covered by smoke tests (placeholder/name/type fallbacks). Live page not tested |
| 5 | Field explanation works | ✅ Partially verified | Phrasebook/parser path verified by smoke tests + user manual test. Real AI explanation **not yet proven live** — pending the user's Windows Chrome retest with the latest ZIP |
| 6 | Full form analysis works | ✅ Verified | Smoke tests (parse → guide → merge) + user manual test of the preview; single-click Analyse → complete guide flow verified in build |
| 7 | Roman Urdu explanations work | ✅ Verified | Phrasebook entries carry Roman Urdu (smoke tests); fake-model test asserts the AI `roman-ur` field is preserved |
| 8 | English explanations work | ✅ Verified | Same as 7, for `en` / `simple-en` |
| 9 | Local inference is used when supported | ✅ Verified in simulation | Fake-model scenario B: local available → route Local, cloud never called. Real Gemini Nano **not available in this environment** — needs Chrome 139+ with the Prompt API flag + downloaded model |
| 10 | Cloud fallback works when local is unavailable | ✅ Verified in simulation | Fake-model scenarios A + I. **Real cloud call not yet proven** — pending the user's retest (consent prompt → Cloud badge) |
| 11 | Network failure is handled | ✅ Verified | Transient vs permanent classification tests; both-routes-fail error path tested; cancel path tested |
| 12 | AI malformed responses are handled | ✅ Verified | Schema validation rejects bad JSON / wrong types (smoke tests); invalid output fails the field, keeps the labelled phrasebook explanation |
| 13 | Uploaded PDFs and images are validated | ✅ Verified | PDF extraction passed on a generated PDF (Phase 4); OCR passed on a test image (19.2 s first run incl. model download); file type/size validation is in `validateUploadFile` (PDF/JPEG/PNG, 10 MB) |
| 14 | Document checklist works | ✅ Verified by manual test | User manual-tested the preview (checklist auto-seeded, progress tracked). No automated test for checklist state in this repo |
| 15 | Saved guides persist correctly | ✅ Verified by manual test | User manual-tested save/search/rename/delete in the preview; storage helpers are localStorage-based |
| 16 | Website and extension communicate correctly | ✅ Partially verified | Transfer encode/decode covered by smoke tests; storage-bridge + URL-fallback code reviewed. **Live hand-off not proven** — needs real Chrome with the extension loaded |
| 17 | Responsive layouts work | ✅ Verified | Space preview probe at 390 px passed with zero overflow; hamburger nav under 768 px in the real build |
| 18 | App Check configuration is documented | ✅ Verified | `docs/firebase-setup.md` + `docs/security.md`; debug token + reCAPTCHA Enterprise key registered in the user's Firebase project |

## What still needs a real browser (owner: Hammad, Windows Chrome)

1. **Live AI test (the important one):** extract the latest ZIP, `npm install`,
   `npm run dev`, Workspace → sample form → Analyse. Expect the consent
   prompt, then Cloud badges. Also test the Local route with the Prompt API
   flag on + model downloaded.
2. **Extension live test:** load `apps/extension/dist` unpacked, open a real
   form page, Scan Current Form → Send to Dashboard → confirm the scan
   arrives and AI guidance auto-runs.
3. **Mobile/responsive spot-check** on a real phone width (the 390 px probe
   passed in the preview, not on a device).

## Known limits (carried from Phase 4, still true)

- OCR fetches its worker core + English model from a CDN on first use
  (needs network; slow first run); fails honestly with a paste-text
  fallback when offline or timed out.
- PDF extraction needs an embedded text layer; image-only PDFs yield no
  text — upload as an image for OCR instead.
- Extension transfer only works when the dashboard runs at the single
  configured URL (`http://localhost:5173` until the hosted URL switch in
  `docs/deployment.md`).
