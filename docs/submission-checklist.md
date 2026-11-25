# FormEase AI — Devpost Submission Checklist (BuildHybridAI 2026)

Deadline: **30 Nov 2026, 5:00 PM ET** (= 1 Dec 2026, 3:00 AM PKT).
Platform to select on Devpost: **Web (Chrome)**.
Hackathon page: https://firebasehybridaihackathon.devpost.com/

## Already done (2026-11-25)

- [x] App built and verified: typecheck, lint, build pass; smoke 81/81,
      fallback test 31/31. Git repo committed (4 commits, no `.env`).
- [x] Firebase project `formease-ai-933b6` (Spark): AI Logic enabled
      (Gemini Developer API), web app registered, App Check registered.
- [x] Production reCAPTCHA Enterprise key `formease-ai-production`
      (domains `formease-ai-933b6.web.app` + `formease-ai-933b6.firebaseapp.com`)
      created and registered in App Check. Localhost debug setup untouched.
- [x] `apps/web/.env.production` created (production key, debug OFF, no debug
      token). Production builds stage only this file (see
      `apps/web/scripts/build.mjs`) — verified the debug token and localhost
      values are absent from the production bundle.
- [x] Dashboard URLs switched to `https://formease-ai-933b6.web.app` in the web
      app, the extension, and the manifest (localhost kept for local dev).
- [x] Extension ZIP served from the hosted site
      (`/formease-extension.zip`) + install section on the landing page.
- [x] Submission text ready: `docs/devpost.md` (title, tagline, problem,
      solution, features, Hybrid AI implementation, technologies, impact).
- [x] Demo script ready: `docs/demo-script.md` (3 minutes, honest fallback
      line when Nano is unavailable).
- [x] Apache 2.0 LICENSE, README with Hybrid AI section.

## Still to do — needs Hammad

### 1. Firebase CLI login + deploy (about 10 minutes)

The CLI login was started with `XDG_CONFIG_HOME=/tmp/fbconfig` (the default
config store is not writable in this VM). Steps:

1. Open the auth link given in chat and sign in with the FormEase Google
   account; paste the authorization code back in chat.
2. Then run (from `~/workspace/formease/`):
   `XDG_CONFIG_HOME=/tmp/fbconfig ./node_modules/.bin/firebase login <code>`
3. Deploy: `npm run deploy` (builds with the production env, then
   `firebase deploy --only hosting`).
4. Verify: open https://formease-ai-933b6.web.app — landing page loads,
   Workspace → sample form → Analyse shows Cloud badges (consent prompt
   first, if needed), and the "Download the extension (.zip)" link works.

### 2. Push to GitHub (about 5 minutes)

Exact commands are in `docs/deployment.md` §6 (create a public repo named
`formease-ai` on github.com first, then `git remote add origin …` and
`git push -u origin main`). After pushing, add the repo URL to
`docs/devpost.md`.

### 3. Record the demo video (about 30 minutes)

Follow `docs/demo-script.md` (3 minutes max). Record on Windows Chrome:
landing → Workspace sample form → Analyse → Cloud badges → language tabs →
checklist → extension scan on a real form page. Upload to YouTube as
**Public**, then add the link to `docs/devpost.md`. The video must show the
project functioning, in English or with English subtitles.

### 4. Submit on Devpost (about 15 minutes)

On https://firebasehybridaihackathon.devpost.com/ (your Devpost account):

- Title: FormEase AI — tagline: Every Form. Finally Understandable.
- Platform: Web (Chrome).
- Description: paste from `docs/devpost.md`.
- Links: hosted app, GitHub repo, YouTube demo video, extension ZIP.
- Built With: React 19, TypeScript, Vite 8, Firebase AI Logic Hybrid
  Inference, Firebase App Check, Chrome Extension Manifest V3, pdfjs-dist,
  tesseract.js, Firebase Hosting.
- Submit before **30 Nov, 5:00 PM ET**. A Chrome Web Store listing is NOT
  required — the installable ZIP on the hosted site is the extension
  deliverable for judging.

## Notes

- Free-tier quota: Gemini Developer API free tier allows 15 requests/minute;
  the 11-field demo run can hit it — the app's "Retry failed fields" button
  handles that, and the demo script mentions it honestly.
- Do NOT deploy from the dev `.env` (it contains the App Check debug token).
  Always deploy via `npm run deploy`, which uses `.env.production`.
