# FormEase AI — Deployment Guide (Phase 8)

Deploy target: **Firebase Hosting**, project `formease-ai-933b6`
(default project in `.firebaserc`). Expected public URL once Hosting is
enabled: **https://formease-ai-933b6.web.app**.

The deploy itself cannot run from this environment — Firebase Hosting
deploy needs a login in the owner's Google account. Everything below is
prepared so the deploy is three commands on the owner's machine.

## 1. Before you deploy — production config

The dev `.env` (`apps/web/.env`) contains a **debug token** and a
**localhost-only** reCAPTCHA key. Never deploy with it: Vite inlines
`VITE_*` values into the shipped JS bundle, so the debug token string
would be inside the public bundle (see `docs/security.md`).

Create a production env file `apps/web/.env.production` (gitignored —
never commit it):

```bash
cp apps/web/.env apps/web/.env.production
```

Then edit `apps/web/.env.production`:

- `VITE_APPCHECK_DEBUG=false`
- **Delete** the `VITE_APPCHECK_DEBUG_TOKEN` line entirely.
- `VITE_APPCHECK_SITE_KEY=` — a **production** reCAPTCHA Enterprise key.
  Create it in the Firebase console → App Check → reCAPTCHA Enterprise →
  create a key for the **hosting domain** (`formease-ai-933b6.web.app`).
  The existing key `formease-ai-local-dev` covers localhost only and will
  not work on the hosted site.
- `VITE_DASHBOARD_URL=https://formease-ai-933b6.web.app/#/dashboard`
- All `VITE_FIREBASE_*` values stay the same (same project).

Vite loads `.env.production` automatically for `npm run build`.

## 2. Log in and deploy

On your own machine (Windows PowerShell or terminal), in the project root:

```bash
npm install
npx firebase login          # sign in with hmdkhan874@gmail.com in the browser
npm run deploy              # builds the web app, then: firebase deploy --only hosting
```

`npm run deploy` is `npm run build && firebase deploy --only hosting`.
First deploy enables Hosting for the project and prints the live URL —
confirm it is `https://formease-ai-933b6.web.app`.

## 3. After deploy — point the extension at the hosted dashboard

The extension and the web app both hard-code the dashboard base URL
(`http://localhost:5173`). After the site is live, change it in **three**
places to `https://formease-ai-933b6.web.app`:

1. `apps/web/src/config.ts` — `DASHBOARD_BASE_URL`
2. `apps/extension/src/shared/config.ts` — `DASHBOARD_BASE_URL`
3. `apps/extension/src/content/content.ts` — `DASHBOARD_BASE_URL`
   (the content script is self-contained and duplicates the constant)

Then rebuild and reload the extension:

```bash
npm run build   # regenerates apps/extension/dist
```

Chrome → `chrome://extensions` → FormEase AI → Reload. Also update the
extension's `host_permissions` in `apps/extension/manifest.json` from
`http://localhost:5173/*` to `https://formease-ai-933b6.web.app/*` before
rebuilding, so the dashboard transfer is allowed on the hosted origin.

## 4. Verify after deploy

1. Open `https://formease-ai-933b6.web.app/` — landing page loads.
2. Dashboard → Hybrid AI status: Firebase "Configured", App Check status.
3. Firebase console → App Check → verify enforcement is on for AI Logic
   on the production web app (see `docs/security.md`).
4. Workspace → sample form → Analyse: AI guidance runs; Cloud badge
   appears after consent when on-device is unavailable.
5. Extension: scan a real form → Send to Dashboard → the scan arrives at
   the hosted workspace and AI guidance auto-runs.

## 5. Rollback

```bash
npx firebase hosting:rollback --site formease-ai-933b6
```

Or redeploy the previous build with `npm run deploy`.

## 6. Publish the code to GitHub

The local git repo is already initialised and committed (branch `main`,
78 files, no `.env` — verified). Create the remote in your GitHub
account, then push from the project root:

```bash
# 1. On github.com, create a new PUBLIC repository named e.g. formease-ai
#    (do NOT initialise it with a README — the repo already has one).
# 2. Then, on your machine:
git remote add origin https://github.com/<your-username>/formease-ai.git
git push -u origin main
```

After pushing, fill in the GitHub link in `docs/devpost.md` and in the
README header. If GitHub ever shows a secret-scanning warning, check
that it is only the `.env.example` placeholders — the real `.env` was
never committed (`git ls-files | grep "\.env$"` returns nothing).
