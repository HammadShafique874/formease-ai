import { useMemo, useState } from "react";
import type { Language } from "@formease/shared";
import { summarizeAiError } from "@formease/shared";
import { Badge } from "../components/Badge.tsx";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { FieldGuideCard } from "../components/FieldGuideCard.tsx";
import { InferenceBadge } from "../components/InferenceBadge.tsx";
import { LanguageSelector, languageLabel } from "../components/LanguageSelector.tsx";
import { getHashParam } from "../App.tsx";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import { downloadText, exportGuideMarkdown, loadGuides } from "../services/storage.ts";

export default function Guide(): React.JSX.Element {
  const id = getHashParam("id");
  const guides = useMemo(() => loadGuides(), []);
  const saved = guides.find((g) => g.id === id);
  const [language] = useLocalStorage<Language>("formease:v1:language", "en");
  const [style] = useLocalStorage<"concise" | "detailed">("formease:v1:style", "concise");
  const [exported, setExported] = useState<string | null>(null);
  if (!saved) {
    return (
      <div className="container page">
        <EmptyState title="Guide not found" body="That guide is not in local storage — it may have been deleted, or this link was opened in a different browser." action={<a className="btn" href="#/workspace">Analyse a form</a>} />
      </div>
    );
  }
  const guide = saved.guide;
  const exportJson = () => {
    downloadText(`${guide.id}.json`, JSON.stringify(guide, null, 2), "application/json");
    setExported("JSON downloaded.");
  };
  const exportMd = () => {
    downloadText(`${guide.id}.md`, exportGuideMarkdown(guide), "text/markdown");
    setExported("Markdown guide downloaded.");
  };
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(guide, null, 2)); setExported("Guide JSON copied to clipboard."); } catch { setExported("Copy failed — clipboard unavailable in this browser."); }
  };
  return (
    <div className="container page">
      <h1>{guide.title}</h1>
      <p className="muted">Source: {guide.sourceLabel} · Saved {new Date(guide.createdAt).toLocaleString()}</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <InferenceBadge route={guide.inferenceRoute} reason={summarizeAiError(guide.fields.find((f) => f.aiError)?.aiError).summary} />
        <Badge>{guide.source}</Badge>
        <span className="badge">Showing: {languageLabel(language)}</span>
        <span className="badge">{guide.fields.filter((f) => f.source === "ai").length} AI · {guide.fields.filter((f) => f.source === "phrasebook").length} phrasebook · {guide.fields.filter((f) => f.source === "parser").length} parser</span>
      </div>
      <div className="field" style={{ maxWidth: 320, marginTop: 14 }}>
        <label htmlFor="guide-lang">Explanation language</label>
        <LanguageSelector />
      </div>
      {guide.inferenceNote && <div className="notice" style={{ marginTop: 14 }}>{guide.inferenceNote}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <Button variant="secondary" onClick={exportJson}>Export guide (JSON)</Button>
        <Button variant="secondary" onClick={exportMd}>Export as Markdown</Button>
        <Button variant="secondary" onClick={() => void copyJson()}>Copy guide JSON</Button>
        <a className="btn btn-secondary" href="#/checklist">Open document checklist</a>
      </div>
      {exported && <p className="small" style={{ color: "#16a36a", marginTop: 8 }}>{exported}</p>}
      {guide.fields.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <Card>
            <h2 style={{ fontSize: "1.15rem" }}>Detected fields — explanations not yet available</h2>
            <p className="muted">These labels were detected locally. AI explanations will appear here once Firebase is configured (Phase 5). No explanations have been invented.</p>
            <ul>{guide.detectedLabels.map((l) => <li key={l}>{l}</li>)}</ul>
          </Card>
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 16 }}>
          {guide.fields.map((f) => (
            <FieldGuideCard key={f.fieldLabel} field={f} guideLanguage={guide.language} defaultLanguage={language} showMistakes={style === "detailed"} />
          ))}
        </div>
      )}
    </div>
  );
}
