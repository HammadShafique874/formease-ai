import { useState } from "react";
import type { InferenceModePreference } from "@formease/shared";
import { resolveEffectiveMode } from "@formease/shared";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { LanguageSelector } from "../components/LanguageSelector.tsx";
import { Select } from "../components/Input.tsx";
import { isFirebaseConfigured, appCheckSiteKey, firebaseConfig } from "../firebase/config.ts";
import { getAppCheckStatus } from "../firebase/appCheck.ts";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import { clearAllFormEaseData } from "../services/storage.ts";

export default function Settings(): React.JSX.Element {
  const [style, setStyle] = useLocalStorage<"concise" | "detailed">("formease:v1:style", "concise");
  const [aiPref, setAiPref] = useLocalStorage<InferenceModePreference>("formease:v1:ai-preference", "prefer_on_device");
  const [autoAi, setAutoAi] = useLocalStorage<boolean>("formease:v1:auto-ai", true);
  const [saveLocally, setSaveLocally] = useLocalStorage<boolean>("formease:v1:save-locally", true);
  const [cloudConsent, setCloudConsent] = useLocalStorage<boolean>("formease:v1:cloud-consent", false);
  // Effective mode after consent is applied: without consent, prefer-* modes
  // run on-device only — cloud fallback is genuinely off, and this text says so.
  const effective = resolveEffectiveMode(aiPref, cloudConsent);
  const effectiveModeLabel =
    effective.mode === "only_on_device"
      ? "On-device only (cloud fallback disabled — no cloud consent)"
      : effective.mode === "only_in_cloud"
        ? "Cloud only"
        : effective.mode === "prefer_in_cloud"
          ? "Prefer cloud, fall back to on-device"
          : "Prefer on-device, fall back to cloud";
  const [cleared, setCleared] = useState(false);
  const [copiedSetup, setCopiedSetup] = useState(false);
  const appCheck = getAppCheckStatus();
  const setupChecklist = [
    "1. Create a Firebase project at console.firebase.google.com (no Google Analytics needed).",
    "2. In the console go to AI Services > AI Logic > Get started; choose the Gemini Developer API provider and let it set up the required APIs.",
    "3. Register this web app and copy its Firebase config into apps/web/.env (VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID).",
    "4. Create a score-based reCAPTCHA Enterprise site key for your hosted domain in Google Cloud, then register it under Firebase console > Security > App Check > Apps; set VITE_APPCHECK_SITE_KEY in apps/web/.env.",
    "5. In Firebase console > Security > App Check > APIs, enforce App Check for Firebase AI Logic.",
    "6. Local dev only: set VITE_APPCHECK_DEBUG=true, run the app, copy the debug token printed in the browser console, and register it under App Check > Manage debug tokens. Never ship a debug token.",
    "7. On-device inference needs Chrome on Desktop v139+ with chrome://flags/#prompt-api-for-gemini-nano-multimodal-input enabled; check LanguageModel.availability() in DevTools and let the model download before expecting local runs.",
    "8. Verify: Dashboard > Hybrid AI status shows all three facts; run “Get AI explanations” in the Workspace and check the per-field badges (Local / Cloud / Mixed) — that is the route the SDK actually reported.",
  ].join("\n");
  const copySetup = () => {
    void navigator.clipboard.writeText(setupChecklist).then(() => setCopiedSetup(true)).catch(() => setCopiedSetup(false));
    window.setTimeout(() => setCopiedSetup(false), 2000);
  };
  const clearData = () => {
    if (!window.confirm("Delete all saved guides, checklist items and preferences stored in this browser?")) return;
    clearAllFormEaseData();
    setCleared(true);
  };
  return (
    <div className="container page">
      <h1>Settings</h1>
      <div className="grid" style={{ marginTop: 16 }}>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>Language &amp; explanation style</h2>
          <div className="field"><label htmlFor="pref-lang">Preferred language</label><LanguageSelector /></div>
          <div className="field">
            <label htmlFor="pref-style">Explanation style</label>
            <Select id="pref-style" value={style} onChange={(e) => setStyle(e.target.value as "concise" | "detailed")}>
              <option value="concise">Concise — short, plain explanations</option>
              <option value="detailed">Detailed — fuller guidance per field</option>
            </Select>
          </div>
        </Card>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>AI processing</h2>
          <p className="muted">Your preference is a request, not a guarantee — the app always reports the route that actually ran.</p>
          <div className="field">
            <label htmlFor="pref-ai">Inference preference</label>
            <Select id="pref-ai" value={aiPref} onChange={(e) => setAiPref(e.target.value as InferenceModePreference)}>
              <option value="prefer_on_device">Prefer on-device, fall back to cloud</option>
              <option value="only_on_device">On-device only (error if unavailable)</option>
              <option value="prefer_in_cloud">Prefer cloud, fall back to on-device</option>
              <option value="only_in_cloud">Cloud only</option>
            </Select>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {isFirebaseConfigured
              ? `Effective mode right now: ${effectiveModeLabel}. This preference is used by every AI run — and the app always reports the route that actually ran, per field. No badge is shown here because no AI call has run from this page.`
              : "Firebase is not configured yet, so AI is unavailable and this preference has nothing to apply to. Configure it below; until then every explanation comes from the local phrasebook/parser."}
          </p>
          <label className="check-row"><input type="checkbox" checked={autoAi} onChange={(e) => setAutoAi(e.target.checked)} /> Run AI guidance automatically after Analyse</label>
          <p className="small muted">On: one click on “Analyse form” detects the fields and generates the complete AI guide — no second button. Off: analysis shows the provisional phrasebook/parser guide and you start AI guidance with “Generate AI guidance”.</p>
        </Card>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>Firebase setup</h2>
          <p className="muted">Only variable <em>names</em> and whether each is set are shown here — never values.</p>
          <ul>
            <li>VITE_FIREBASE_API_KEY — {firebaseConfig.apiKey !== "" ? "set" : "not set"}</li>
            <li>VITE_FIREBASE_AUTH_DOMAIN — {firebaseConfig.authDomain !== "" ? "set" : "not set"}</li>
            <li>VITE_FIREBASE_PROJECT_ID — {firebaseConfig.projectId !== "" ? "set" : "not set"}</li>
            <li>VITE_FIREBASE_APP_ID — {firebaseConfig.appId !== "" ? "set" : "not set"}</li>
            <li>VITE_APPCHECK_SITE_KEY — {appCheckSiteKey !== "" ? "set" : "not set"}</li>
            <li>App Check status — {appCheck.status}{appCheck.error ? ` (${appCheck.error})` : ""}</li>
          </ul>
          <p className="small muted">Full steps: <code>docs/firebase-setup.md</code> in the project repo. The Chrome extension never uses Firebase or App Check — AI runs only in this web app.</p>
          <Button variant="secondary" onClick={copySetup}>{copiedSetup ? "Setup checklist copied" : "Copy setup checklist"}</Button>
        </Card>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>Privacy</h2>
          <label className="check-row"><input type="checkbox" checked={saveLocally} onChange={(e) => setSaveLocally(e.target.checked)} /> Save guides in this browser (localStorage)</label>
          <label className="check-row"><input type="checkbox" checked={cloudConsent} onChange={(e) => setCloudConsent(e.target.checked)} /> I consent to form text being sent to cloud AI when on-device inference is unavailable</label>
          <p className="small muted">Consent is asked only when on-device AI is unavailable — once granted here (or from the prompt in the Workspace), the app remembers it and later runs fall back to the cloud automatically. Without cloud consent, cloud fallback is not used for your form text — prefer modes run on-device only, and cloud-only is refused. (Enforced by the AI service.)</p>
        </Card>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>Extension connection</h2>
          <p className="muted">The extension connects by opening this dashboard. Load <code>apps/extension/dist</code> in Chrome developer mode, then use the popup&apos;s “Open Dashboard” button.</p>
          <h2 style={{ fontSize: "1.15rem", marginTop: 20 }}>Account</h2>
          <p className="muted">No account yet — everything is stored locally in your browser. Firebase Auth is not part of Phase 5.</p>
          <Button variant="danger" onClick={clearData}>Delete all local FormEase data</Button>
          {cleared && <p className="small" style={{ color: "#16a36a" }}>Local FormEase data deleted. Reload the page to see the reset state.</p>}
        </Card>
      </div>
    </div>
  );
}
