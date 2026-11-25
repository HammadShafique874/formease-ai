# FormEase AI — Security Audit (Phase 6)

Audited 2026-11-25 against the master prompt §9–§10 and §14 Phase 6.
Scope: `apps/web`, `apps/extension`, `packages/shared`, repo configuration.
No credentials are in this document; values live only in `apps/web/.env`
(gitignored, never committed).

## What was checked and what was found

### Chrome extension — permissions (least privilege)

| Permission | Used by | Verdict |
|---|---|---|
| `activeTab` | Popup reads the active tab (`chrome.tabs.query`) and messages its content script | Keep — needed for the tab URL shown in the popup and for scan context |
| `storage` | Background stores scans in `chrome.storage.local`; popup stores the language choice | Keep |
| `scripting` | Nothing — no `chrome.scripting` call exists anywhere in the extension source | **Removed in Phase 6** (was unused) |
| `host_permissions: http://localhost:5173/*` | Dashboard transfer during local development | Dev only — must change to the hosted URL after Firebase Hosting deploy (see `docs/deployment.md`) |
| Content script `matches: <all_urls>` | Form detection must run on any real webpage the user visits | Keep — this is the product's purpose. The script only acts on a popup message (user action) and only extracts form-field context (below) |

### Chrome extension — minimum extraction

- The content script extracts **label, type, required, placeholder, upload flag**
  only. It never reads field **values**, never reads unrelated page content,
  never auto-fills and never auto-submits. Verified by code inspection
  (no `.value` access in `content.ts` / `popup.ts`).
- The floating panel is not injected on page load; the script only acts when
  the popup sends a message (user action).
- Page content shown in the popup is rendered with `textContent` /
  `createElement` only. There is **no `innerHTML` or
  `dangerouslySetInnerHTML` anywhere** in the web app or extension, so a
  hostile form label cannot inject HTML/JS.
- All extension messages are validated on both ends
  (`isExtensionMessage`, `isValidExtensionScan` / `isValidExtensionScanLocal`):
  unknown types are rejected, scans are shape-checked (max 200 fields, valid
  language, non-empty labels) before storage, and oversized URL transfers
  (> 8 KB) are refused with an honest message instead of truncated.
- The storage-bridge content script only runs on the FormEase dashboard
  origin (`window.location.origin === DASHBOARD_BASE_URL`) and only writes
  the validated scan payload to `localStorage`.
- No Firebase, App Check, API keys or AI calls exist in the extension.
  AI runs only in the web app; the extension only detects fields and hands
  the scan to the dashboard.

### Web app — secrets and configuration

- No hard-coded API keys, tokens or credentials in source (checked
  2026-11-25). All Firebase values come from `VITE_*` environment variables.
- `apps/web/.env` (real config) is gitignored (`.env`, `.env.local`).
  `.env.example` contains placeholders only.
- **Production-build warning:** Vite inlines `VITE_*` values into the JS
  bundle at build time. A production build must use a production `.env`
  **without** `VITE_APPCHECK_DEBUG_TOKEN` and with
  `VITE_APPCHECK_DEBUG=false` — otherwise the debug token string would ship
  inside the bundle even though the code can never use it (see below).
  The deployment guide (`docs/deployment.md`) makes this a checklist step.

### Firebase App Check

- Web app only; the extension never initialises App Check
  (a `chrome-extension://` origin is not attestable the same way).
- Production: `ReCaptchaEnterpriseProvider` when a site key is configured.
- Debug mode is possible **only** in a dev build:
  `import.meta.env.DEV && VITE_APPCHECK_DEBUG === "true"`. A production
  build (`vite build`) can never activate the debug provider.
- Initialised lazily, exactly once, before the first AI call; a failure
  surfaces as an AI error, not a crash.
- Current state (2026-11-25): debug token `formease-local-dev` registered;
  reCAPTCHA Enterprise key `formease-ai-local-dev` created for
  **localhost / 127.0.0.1 only**. For the hosted site a **production**
  reCAPTCHA Enterprise key covering the hosting domain is required —
  see `docs/deployment.md`. App Check enforcement for AI Logic should be
  verified in the Firebase console after deploy.

### Decisions (master prompt §14 Phase 6: "Authentication if required")

- **Firebase Authentication: not required, not implemented.** There are no
  user accounts, no server-side data and no shared state. Everything (saved
  guides, checklists, settings, activity) lives in the user's own browser
  localStorage. Adding sign-in would put a login wall in front of a demo
  with no benefit. If accounts are added later, Auth + Firestore rules must
  be designed then — not bolted on for the hackathon.
- **Cloud Firestore: not used, no security rules needed.** The master prompt
  lists Firestore as "where appropriate"; it is not appropriate here — there
  is no shared or server-side data to protect. No Firestore rules file is
  shipped, deliberately, rather than a copy-pasted permissive one.
- **What is persisted, and what is not:** saved guides store field labels
  and explanations only — never field values (the extension never extracts
  them; pasted text is parsed into labels and the raw text is not saved).
  Saving can be turned off in Settings ("Save guides in this browser") and
  all local data can be deleted from Settings ("Delete all local FormEase
  data"). Cloud AI receives form text only after explicit consent, only when
  on-device inference fails, and only for the fields being explained.

### Input and file validation

- Uploads: PDF / JPEG / PNG only, 10 MB max (`validateUploadFile`);
  PDF text extraction and image OCR run client-side.
- All AI responses are validated against the shared schemas
  (`parseFieldExplanationJson`) before display; invalid output is treated
  as a failed field, never shown.
- AI runs have a 60 s per-field timeout, 120 s overall budget, one
  transient-only retry, in-flight dedup and Cancel (AbortSignal).
- Error messages never include credentials or raw server internals.

## Remaining user steps (not code)

1. Create a **production** reCAPTCHA Enterprise key for the hosting domain
   and put it in the production `.env` (`VITE_APPCHECK_SITE_KEY`).
2. Build/deploy with a production `.env` that has **no debug token** and
   `VITE_APPCHECK_DEBUG=false`.
3. In the Firebase console, verify App Check enforcement for AI Logic on the
   production web app.
4. After deploy, update the dashboard URL in the three places listed in
   `docs/deployment.md` and rebuild the extension.
