import { useMemo, useState } from "react";
import type { DocumentItem } from "@formease/shared";
import { detectDocumentHints, newId } from "@formease/shared";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Input, Select } from "../components/Input.tsx";
import { loadChecklistItems, loadGuides, logActivity, saveChecklistItems } from "../services/storage.ts";

export default function Checklist(): React.JSX.Element {
  const guides = useMemo(() => loadGuides(), []);
  const seeded = useMemo<DocumentItem[]>(() => {
    const existing = loadChecklistItems();
    if (existing.length > 0) return existing;
    const items: DocumentItem[] = [];
    for (const g of guides) {
      const text = [g.guide.title, ...g.guide.detectedLabels].join("\n");
      const docs = new Set<string>([...detectDocumentHints(text), ...g.guide.fields.flatMap((f) => f.possibleDocuments)]);
      for (const doc of docs) {
        if (!items.some((i) => i.name === doc)) items.push({ id: newId("doc"), name: doc, confirmedByForm: false, collected: false });
      }
    }
    return items;
  }, [guides]);
  const [items, setItemsState] = useState<DocumentItem[]>(seeded);
  const [guideFilter, setGuideFilter] = useState("all");
  const [newDoc, setNewDoc] = useState("");
  const setItems = (next: DocumentItem[]) => { setItemsState(next); saveChecklistItems(next); };
  const visible = guideFilter === "all" ? items : items.filter((i) => {
    const g = guides.find((x) => x.id === guideFilter);
    if (!g) return true;
    const docs = new Set([...detectDocumentHints([g.guide.title, ...g.guide.detectedLabels].join("\n")), ...g.guide.fields.flatMap((f) => f.possibleDocuments)]);
    return docs.has(i.name);
  });
  const collected = items.filter((i) => i.collected).length;
  const pct = items.length === 0 ? 0 : Math.round((collected / items.length) * 100);
  const toggle = (id: string) => setItems(items.map((i) => (i.id === id ? { ...i, collected: !i.collected } : i)));
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));
  const add = () => {
    const name = newDoc.trim();
    if (!name) return;
    setItems([...items, { id: newId("doc"), name, confirmedByForm: false, collected: false }]);
    setNewDoc("");
  };
  const reset = () => {
    if (!window.confirm("Reset all checklist ticks? Items are kept, only the collected marks are cleared.")) return;
    setItems(items.map((i) => ({ ...i, collected: false })));
    logActivity("Reset document checklist");
  };
  const rebuild = () => {
    const fresh: DocumentItem[] = [];
    for (const g of guides) {
      const text = [g.guide.title, ...g.guide.detectedLabels].join("\n");
      const docs = new Set<string>([...detectDocumentHints(text), ...g.guide.fields.flatMap((f) => f.possibleDocuments)]);
      for (const doc of docs) {
        if (!fresh.some((i) => i.name === doc)) fresh.push({ id: newId("doc"), name: doc, confirmedByForm: false, collected: items.find((x) => x.name === doc)?.collected ?? false });
      }
    }
    for (const custom of items.filter((i) => !fresh.some((f) => f.name === i.name))) fresh.push(custom);
    setItems(fresh);
  };
  return (
    <div className="container page">
      <h1>Document Checklist</h1>
      <p className="muted">Documents that may be needed, based on your analysed forms. Items marked “hint” are keyword detections — they are <strong>not</strong> confirmed official requirements unless the original form says so.</p>
      <div className="toolbar">
        <Select value={guideFilter} onChange={(e) => setGuideFilter(e.target.value)} aria-label="Filter by guide" style={{ maxWidth: 320 }}>
          <option value="all">All guides</option>
          {guides.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </Select>
        <Button variant="secondary" onClick={rebuild}>Rebuild from saved guides</Button>
        <Button variant="secondary" onClick={reset}>Reset progress</Button>
      </div>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <strong>{collected} of {items.length} collected</strong><span>{pct}% complete</span>
        </div>
        <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${String(pct)}%` }} /></div>
        {visible.length === 0 ? (
          <div style={{ marginTop: 16 }}><EmptyState title="No documents yet" body="Analyse a form in the workspace first, or add a document below." /></div>
        ) : visible.map((item) => (
          <div className="check-row" key={item.id}>
            <input type="checkbox" checked={item.collected} onChange={() => toggle(item.id)} aria-label={`Mark ${item.name} as collected`} />
            <span style={{ flex: 1, textDecoration: item.collected ? "line-through" : "none" }}>{item.name}</span>
            <span className="badge">{item.confirmedByForm ? "Confirmed by form" : "Hint — not confirmed"}</span>
            <Button variant="ghost" onClick={() => remove(item.id)}>Remove</Button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Input value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="Add a document, e.g. Domicile certificate" aria-label="New document name" />
          <Button onClick={add}>Add</Button>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Progress is saved in this browser (localStorage), per item, and survives reloads.</p>
      </Card>
    </div>
  );
}
