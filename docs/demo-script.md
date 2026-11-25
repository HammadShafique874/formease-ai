# FormEase AI — Demo Video Script (max 3:00, English)

Read the video as shot, not as claimed. **Do not fake the local
inference demonstration.** If Gemini Nano is not available on the demo
machine, show the honest "unavailable" state and the cloud fallback
instead — that *is* the hybrid story.

## Setup before recording

- Chrome Desktop 139+ with `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
  enabled, relaunched, and the model pre-downloaded
  (`LanguageModel.availability()` → `available` in DevTools). If the
  download has not finished, the demo shows cloud fallback instead —
  do not pretend otherwise.
- FormEase AI running at the hosted URL with Firebase configured and
  cloud consent already granted (so no consent prompt interrupts the demo).
- A real form page open in a second tab (e.g. a university admission
  form). The extension loaded unpacked from `apps/extension/dist`.
- Sample form loaded in the Workspace (or use "Load demo form text").

## Script

### 0:00–0:20 — Real-world problem

*[Screen: a real university admission form, dense English, long
instructions.]*

"Millions of people give up on online forms — not because they can't do
the task, but because the form doesn't speak their language. Complicated
English, unclear questions, confusing document requirements. Admission
forms, scholarships, job applications, government services."

### 0:20–0:45 — Introduce FormEase AI

*[Screen: FormEase landing page, then the dashboard.]*

"FormEase AI makes every form understandable. A Chrome Extension that
reads the form you're already on, and a web dashboard that explains
every field — in English, Simple English, or Roman Urdu. Your data
stays private: AI runs on your device first, and only falls back to the
cloud with your permission."

### 0:45–1:20 — Chrome Extension on a real webpage

*[Screen: the real form page. Click the FormEase extension icon →
Scan Current Form.]*

"I'm on a real admission form. One click scans it — the extension
detects every field, its label, whether it's required, and whether it
needs a document upload. It never reads what I typed — only the labels.
Send to Dashboard…"

*[Screen: dashboard workspace opens with the scan; fields appear.]*

"…and the scan is here, ready to explain."

### 1:20–1:50 — Explain a complex form field

*[Screen: Workspace. Click Analyse form. The complete guide appears.]*

"Analyse, and every field gets a complete explanation — what it means,
what information is required, an example, which documents might be
needed, and the mistakes to avoid. Switch to Roman Urdu…"

*[Click the Roman Urdu tab on one field.]*

"…and the same explanation is there in Roman Urdu. One click, one
place — no second step."

### 1:50–2:20 — Local inference and cloud fallback

*[Screen: the field badges.]*

"Each field shows the route that actually ran it. This one ran
**on-device** — Gemini Nano, in the browser, no data left the machine.
*[If Nano is unavailable on the demo machine, say instead:]* On this
machine the on-device model isn't available, so FormEase says so
honestly and falls back to Firebase Cloud AI — see the Cloud badge.
Nothing is ever presented as local when it ran in the cloud."

*[Screen: Settings → Privacy, the consent checkbox.]*

"And the cloud only ever sees your form text if you said yes."

### 2:20–2:45 — Dashboard and document checklist

*[Screen: Dashboard stats, then the Document Checklist.]*

"The dashboard tracks your forms, fields explained, and documents
found. The checklist turns the form's document requirements into
something you can tick off — collected, pending, done."

### 2:45–3:00 — Impact and conclusion

*[Screen: landing page hero.]*

"FormEase AI — every form, finally understandable. Built with Firebase
AI Logic Hybrid Inference for BuildHybridAI 2026."
