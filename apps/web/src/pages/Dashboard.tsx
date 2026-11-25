import { useMemo, useState } from "react";
import { Globe, FileText, FolderCheck, Languages } from "lucide-react";
import { buildGuideFromText } from "@formease/shared";
import { Card } from "../components/Card.tsx";
import { Badge } from "../components/Badge.tsx";
import { Button } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { InferenceBadge } from "../components/InferenceBadge.tsx";
import { isFirebaseConfigured } from "../firebase/config.ts";
import { getAppCheckStatus } from "../firebase/appCheck.ts";
import { useHybridStatus, isChromeDesktop } from "../hooks/useHybridStatus.ts";
import { deleteGuide, isDemoLoaded, loadActivity, loadChecklistItems, loadGuides, logActivity, setDemoLoaded, upsertGuide } from "../services/storage.ts";

const DEMO_TEXT = "Full name\nFather's name\nDate of birth\nPermanent Residential Address\nPrevious Academic Qualifications\nEmail address\nPhone number\nUpload Matric marksheet";

export default function Dashboard(): React.JSX.Element {
  const hybrid = useHybridStatus();
  const [refresh, setRefresh] = useState(0);
  const guides = useMemo(() => loadGuides(), [refresh]);
  const activity = useMemo(() => loadActivity(), [refresh]);
  const checklistItems = useMemo(() => loadChecklistItems(), [refresh]);
  const demo = isDemoLoaded();
  const fieldsExplained = guides.reduce((n, g) => n + g.guide.fields.length, 0);
  const phrasebookFields = guides.reduce((n, g) => n + g.guide.fields.filter((f) => f.source === "phrasebook").length, 0);
  const aiFields = guides.reduce((n, g) => n + g.guide.fields.filter((f) => f.source === "ai").length, 0);
  const appCheck = getAppCheckStatus();
  const latestAiGuide = guides.find((g) => g.guide.inferenceRoute === "local" || g.guide.inferenceRoute === "cloud" || g.guide.inferenceRoute === "mixed");
  const latestAiRoute = latestAiGuide?.guide.inferenceRoute ?? "unavailable";
  const docsIdentified = new Set(guides.flatMap((g) => g.guide.fields.flatMap((f) => f.possibleDocuments))).size;
  const collected = checklistItems.filter((i) => i.collected).length;

  const loadDemo = () => {
    const built = buildGuideFromText(DEMO_TEXT, { source: "paste", sourceLabel: "Demo form text", language: "en", title: "Demo university admission form" });
    upsertGuide(built);
    logActivity("Loaded demo data (labelled Demo)");
    setDemoLoaded(true);
    setRefresh((r) => r + 1);
  };
  const clearDemo = () => {
    if (!window.confirm("Remove the demo guide? Your other saved guides are kept.")) return;
    const demoGuide = loadGuides().find((g) => g.title === "Demo university admission form");
    if (demoGuide) deleteGuide(demoGuide.id);
    logActivity("Cleared demo data");
    setDemoLoaded(false);
    setRefresh((r) => r + 1);
  };
  return (
    <div className="container page">
      <h1>Welcome back{demo && <span className="demo-tag">Demo</span>}</h1>
      <p className="muted">Your forms, explained. Every number below is computed from your real saved data — nothing is hard-coded.</p>
      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!demo && <Button variant="secondary" onClick={loadDemo}>Load demo data</Button>}
        {demo && <Button variant="secondary" onClick={clearDemo}>Clear demo data</Button>}
      </div>
      <div className="grid grid-4" style={{ marginTop: 20 }}>
        <Card><div className="stat-num">{guides.length}</div><div className="stat-label">Forms analysed</div></Card>
        <Card><div className="stat-num">{fieldsExplained}</div><div className="stat-label">Fields explained ({phrasebookFields} via phrasebook, {aiFields} via AI)</div></Card>
        <Card><div className="stat-num">{docsIdentified}</div><div className="stat-label">Documents identified</div></Card>
        <Card><div className="stat-num">{guides.length}</div><div className="stat-label">Saved guides</div></Card>
      </div>
      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}><Globe size={18} /> Extension status</h2>
          <p className="muted">The extension reports its connection from the popup. If you have not installed it yet, load <code>apps/extension/dist</code> in Chrome developer mode.</p>
          <Badge>Not connected in this browser session</Badge>
        </Card>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>Hybrid AI status</h2>
          <p className="muted">
            Three separate facts — never conflated. App Check starts lazily on the first AI call; press Refresh after a run to see its updated state.
          </p>
          <div style={{ marginBottom: 8 }}>
            <Button variant="secondary" onClick={() => setRefresh((r) => r + 1)}>Refresh status</Button>
          </div>
          <ul>
            <li>Firebase: {isFirebaseConfigured ? "configured" : "not configured — add VITE_FIREBASE_* to apps/web/.env"}</li>
            <li>On-device model: {isChromeDesktop() ? "Chrome desktop" : "not Chrome desktop"} · {hybrid}{hybrid === "unsupported" ? " — this browser does not expose the Prompt API, so on-device inference is unavailable here" : ""}</li>
            <li>App Check: {appCheck.status === "enterprise" ? "reCAPTCHA Enterprise active" : appCheck.status === "debug" ? "debug provider (local dev only)" : appCheck.status === "error" ? `error — ${appCheck.error ?? "initialisation failed"}` : appCheck.status === "not-configured" ? "not configured — set VITE_APPCHECK_SITE_KEY" : "not initialised yet — it starts lazily on the first AI call"}</li>
          </ul>
          <InferenceBadge route={latestAiRoute} reason={latestAiGuide ? undefined : isFirebaseConfigured ? "No AI run has succeeded yet — run “Get AI explanations” in the workspace." : "Firebase not configured — add your config to apps/web/.env"} />
          <p className="small muted" style={{ marginTop: 8 }}>{latestAiGuide ? `Latest AI run: “${latestAiGuide.title}” ran ${latestAiRoute === "local" ? "on-device" : latestAiRoute === "cloud" ? "in the cloud" : "mixed on-device + cloud"}. Per-field routes are shown on each guide.` : isFirebaseConfigured ? "Firebase is configured — run “Get AI explanations” in the workspace to see the actual route." : "Firebase is not configured yet. AI explanations are unavailable — the app will not fake them."}</p>
        </Card>
      </div>
      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>Recent activity</h2>
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" body="Analyse a form in the workspace and your activity will appear here." />
          ) : activity.slice(0, 5).map((a) => (
            <div className="list-row" key={a.id}><FileText size={18} /><div><strong>{a.text}</strong><div className="small muted">{new Date(a.at).toLocaleString()}</div></div></div>
          ))}
          <p className="small muted" style={{ marginTop: 10 }}><FolderCheck size={15} /> Checklist: {collected} of {checklistItems.length} documents collected.</p>
        </Card>
        <Card>
          <h2 style={{ fontSize: "1.15rem" }}>Quick actions</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <a className="btn" href="#/workspace">Analyse a form</a>
            <a className="btn btn-secondary" href="#/checklist">Open checklist</a>
            <a className="btn btn-secondary" href="#/saved">Saved guides</a>
          </div>
          <h3 style={{ marginTop: 20 }}>Your saved guides</h3>
          {guides.length === 0 ? <p className="muted">No saved guides yet. Analyse a form in the workspace to create one.</p> : guides.slice(0, 3).map((g) => (
            <div className="list-row" key={g.id}><FileText size={18} /><a href={`#/guide?id=${encodeURIComponent(g.id)}`}>{g.title}</a></div>
          ))}
          <p className="small muted" style={{ marginTop: 12 }}><Languages size={15} /> Language preference applies everywhere — change it in Settings or the workspace.</p>
        </Card>
      </div>
    </div>
  );
}
