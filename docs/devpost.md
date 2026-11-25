# FormEase AI — Devpost Description (BuildHybridAI 2026)

Fill in the three links after deploy + GitHub push (see
`docs/deployment.md`); everything else is ready to paste.

## Project title

FormEase AI

## Short tagline

Every Form. Finally Understandable.

## Problem statement

Millions of people struggle with online forms — university admissions,
scholarships, job applications, government services — because of
complicated English, technical terminology, unclear questions, and
confusing document requirements. The barrier is language, not ability,
and it hits hardest for users with limited English proficiency.

## Solution

FormEase AI is a Chrome Extension + web dashboard that explains any
online form field by field: what the question means, what information
is required, an example answer, which documents may be needed, and the
mistakes to avoid — in English, Simple English, or Roman Urdu. The
extension detects the form on the real page you are already on; the
dashboard turns it into a complete, savable, exportable guide with a
document checklist. The user stays in control: nothing is auto-filled,
nothing is auto-submitted, and field values are never read.

## Key features

- Chrome Extension (Manifest V3) that detects real form fields on any
  webpage — labels, required markers, upload fields — and sends only the
  minimum context to the dashboard.
- One-click analysis: Analyse detects the fields and generates the
  complete guide in place — no second step.
- Trilingual explanations: English, Simple English, Roman Urdu, with an
  honest source label on every text (AI / phrasebook / local parser).
- Document checklist generated from the form's requirements, with
  progress tracking.
- Saved guides with search, rename, duplicate, export (JSON/Markdown).
- Real PDF text extraction and on-device image OCR for uploaded forms.
- Privacy-first: local-first AI, cloud only with explicit consent,
  everything saved in the user's own browser.

## Hybrid AI implementation

FormEase AI uses genuine Firebase AI Logic Hybrid Inference — no
simulation, no fake local/cloud toggle. The web app calls
`getAI(app, { backend: new GoogleAIBackend() })` and
`getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE })`.
One click runs an explicit two-stage plan: on-device first
(`ONLY_ON_DEVICE`, Gemini Nano via the Prompt API, initialised on the
user gesture), and on init or generation failure it automatically falls
back to cloud (`ONLY_IN_CLOUD`). `ONLY_ON_DEVICE` never touches the
cloud; `ONLY_IN_CLOUD` never touches the device. Cloud consent is asked
just in time — only when local fails and consent is the blocker — and
remembered afterwards; without consent the run stays on-device and fails
honestly. Every response is structured JSON validated against shared
schemas before display, and every field shows the route that actually
ran it: Local, Cloud, or Mixed. App Check (reCAPTCHA Enterprise in
production, debug tokens in local dev only) protects the AI calls, and
all Firebase code lives in the web app — the extension has none.

## Technologies

React 19, TypeScript (strict), Vite 8, Firebase AI Logic Hybrid
Inference (Firebase JS SDK 13.4.0 / @firebase/ai 3.1.0), Firebase App
Check, Chrome Extension Manifest V3, pdfjs-dist, tesseract.js,
lucide-react, Firebase Hosting.

## Potential impact

Anyone who has ever abandoned a form because of its language — students,
job seekers, applicants for government services, and the millions of
users who think in Roman Urdu but must apply in English — can complete
applications they would otherwise give up on. Local-first AI keeps
sensitive form data on the device; the cloud is a consented fallback,
not the default.

## Links

- Hosted application: https://formease-ai-933b6.web.app
  (Firebase Hosting; deploy pending — see `docs/submission-checklist.md`)
- Chrome Extension (installable ZIP, served from the hosted site):
  https://formease-ai-933b6.web.app/formease-extension.zip
  (Download → Extract → `chrome://extensions` → Developer mode → Load unpacked.
  Also linked from the landing page's "Get the Chrome Extension" section.)
- Demo video: _[add after recording — see `docs/demo-script.md`; must be ≤ 3 min,
  public on YouTube, English or English subtitles, showing the app functioning]_
- GitHub repository: https://github.com/HammadShafique874/formease-ai
  (public, Apache 2.0 LICENSE at the top level)

## Submission checklist

Full step-by-step list, including what is already done: see
`docs/submission-checklist.md`. Deadline: **30 Nov 2026, 5:00 PM ET**
(1 Dec, 3:00 AM PKT). Platform to select on Devpost: **Web (Chrome)**.
