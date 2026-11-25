import { useMemo, useState } from "react";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Input, Select } from "../components/Input.tsx";
import { Modal } from "../components/Modal.tsx";
import { deleteGuide, downloadText, duplicateGuide, loadGuides, renameGuide } from "../services/storage.ts";

export default function Saved(): React.JSX.Element {
  const [guides, setGuides] = useState(loadGuides);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [langFilter, setLangFilter] = useState("all");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const filtered = useMemo(() => guides.filter((g) => {
    const q = query.trim().toLowerCase();
    if (q && !g.title.toLowerCase().includes(q) && !g.guide.detectedLabels.some((l) => l.toLowerCase().includes(q))) return false;
    if (filter !== "all" && g.guide.source !== filter) return false;
    if (langFilter !== "all" && g.guide.language !== langFilter) return false;
    return true;
  }), [guides, query, filter, langFilter]);
  const copyJson = async (id: string, json: string) => {
    try { await navigator.clipboard.writeText(json); setCopiedId(id); window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500); } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="container page">
      <h1>Saved Guides</h1>
      <p className="muted">{guides.length} guide{guides.length === 1 ? "" : "s"} saved in this browser.</p>
      <div className="toolbar">
        <Input style={{ maxWidth: 320 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guides…" aria-label="Search guides" />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by source" style={{ maxWidth: 200 }}>
          <option value="all">All sources</option>
          <option value="paste">Pasted text</option>
          <option value="url">URL</option>
          <option value="upload">Upload</option>
          <option value="extension">Extension</option>
        </Select>
        <Select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} aria-label="Filter by language" style={{ maxWidth: 200 }}>
          <option value="all">All languages</option>
          <option value="en">English</option>
          <option value="simple-en">Simple English</option>
          <option value="roman-ur">Roman Urdu</option>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No saved guides" body={guides.length === 0 ? "Analyse a form in the workspace to save your first guide." : "No guides match this search or filter."} action={<a className="btn" href="#/workspace">Analyse a form</a>} />
      ) : (
        <div className="grid">
          {filtered.map((g) => (
            <Card key={g.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div>
                  <h2 style={{ fontSize: "1.1rem" }}>{g.title}</h2>
                  <p className="small muted">{g.guide.detectedLabels.length} fields · {g.guide.source} · {g.guide.language} · {g.guide.fields.filter((f) => f.source === "phrasebook").length} phrasebook · {new Date(g.savedAt).toLocaleString()}</p>
                </div>
                <span className="badge">{g.guide.inferenceRoute}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="btn btn-secondary btn-sm" href={`#/guide?id=${encodeURIComponent(g.id)}`}>Open</a>
                <Button variant="secondary" onClick={() => setGuides(duplicateGuide(g.id))}>Duplicate</Button>
                <Button variant="secondary" onClick={() => downloadText(`${g.id}.json`, JSON.stringify(g.guide, null, 2), "application/json")}>Export JSON</Button>
                <Button variant="secondary" onClick={() => void copyJson(g.id, JSON.stringify(g.guide, null, 2))}>{copiedId === g.id ? "Copied!" : "Copy JSON"}</Button>
                <Button variant="secondary" onClick={() => { setRenameId(g.id); setRenameValue(g.title); }}>Rename</Button>
                <Button variant="danger" onClick={() => { if (window.confirm(`Delete "${g.title}"? This cannot be undone.`)) setGuides(deleteGuide(g.id)); }}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {renameId && (
        <Modal title="Rename guide" onClose={() => setRenameId(null)}>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} aria-label="New guide title" />
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Button onClick={() => { const t = renameValue.trim(); if (t) setGuides(renameGuide(renameId, t)); setRenameId(null); }}>Save</Button>
            <Button variant="secondary" onClick={() => setRenameId(null)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
