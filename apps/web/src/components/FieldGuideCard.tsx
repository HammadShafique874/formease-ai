import { useState } from "react";
import type { FieldExplanation, Language } from "@formease/shared";
import { fieldExplanationInLanguage, fieldSourceLabel, sourceLabel } from "@formease/shared";
import { Badge } from "./Badge.tsx";
import { Button } from "./Button.tsx";
import { Card } from "./Card.tsx";
import { FriendlyError } from "./FriendlyError.tsx";
import { InferenceBadge } from "./InferenceBadge.tsx";
import { languageLabel } from "./LanguageSelector.tsx";

const LANGS: Language[] = ["en", "simple-en", "roman-ur"];

// One field's complete guidance, shown the same way in the Workspace and on
// the saved Guide page: explanation in English, Simple English and Roman
// Urdu (tabs), required information, an example, possible documents and
// common mistakes. Every text carries its honest source — AI, phrasebook,
// local parser, or a clearly labelled local note — so a partial guide is
// never mistaken for a finished one.
export function FieldGuideCard({ field, guideLanguage, defaultLanguage, showMistakes = true }: { field: FieldExplanation; guideLanguage: Language; defaultLanguage: Language; showMistakes?: boolean }): React.JSX.Element {
  const [tab, setTab] = useState<Language>(defaultLanguage);
  const [copied, setCopied] = useState(false);
  const { text, source } = fieldExplanationInLanguage(field, tab, guideLanguage);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => setCopied(false));
  };
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.15rem" }}>{field.fieldLabel}</h2>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="source-tag">{sourceLabel(field.source)}</span>
          {field.source === "ai" && field.route && <InferenceBadge route={field.route} latencyMs={field.latencyMs} attempts={field.attempts} />}
        </span>
      </div>
      {field.aiError && (
        <div className="small" style={{ color: "#dc5b64", marginTop: 8 }}>
          <FriendlyError raw={field.aiError} />
          <p style={{ margin: "6px 0 0" }}>The explanation below is from the phrasebook/parser, not AI.</p>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }} role="tablist" aria-label="Explanation language">
        {LANGS.map((lang) => (
          <button
            key={lang}
            type="button"
            role="tab"
            aria-selected={tab === lang}
            onClick={() => setTab(lang)}
            className="btn btn-sm"
            style={tab === lang ? { background: "#5b5ce2", color: "#fff", borderColor: "#5b5ce2" } : undefined}
          >
            {languageLabel(lang)}
          </button>
        ))}
      </div>
      <p style={{ marginTop: 10 }}>{text}</p>
      <p className="small muted">Source for this language: {fieldSourceLabel(source)}</p>
      <h3 className="small">Required information</h3>
      <ul>{field.requiredInformation.map((r) => <li key={r}>{r}</li>)}</ul>
      {field.exampleAnswer && <p className="small"><strong>Example:</strong> {field.exampleAnswer}</p>}
      <h3 className="small">Possible documents</h3>
      {field.possibleDocuments.length > 0
        ? <ul>{field.possibleDocuments.map((r) => <li key={r}>{r}</li>)}</ul>
        : <p className="small muted">None identified for this field.</p>}
      <h3 className="small">Common mistakes</h3>
      {showMistakes ? (
        <ul>{field.commonMistakes.map((r) => <li key={r}>{r}</li>)}</ul>
      ) : (
        <p className="small muted">Hidden by your “Concise” style in Settings — switch to “Detailed” to see common mistakes.</p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <Button variant="secondary" onClick={copy}>{copied ? "Copied" : `Copy ${languageLabel(tab)} explanation`}</Button>
        {field.route && <Badge>{field.route === "local" ? "On-device" : field.route === "cloud" ? "Cloud" : field.route === "mixed" ? "Mixed" : "AI route not reported"}</Badge>}
      </div>
    </Card>
  );
}
