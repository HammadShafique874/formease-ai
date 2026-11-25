import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { ExtensionScan, FormGuide, InferenceModePreference, Language } from "@formease/shared";
import { buildGuideFromText, decodeScanFromUrl, detectDocumentHints, isValidExtensionScan, parseFormFields } from "@formease/shared";
import { getHashParam } from "../App.tsx";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { FieldGuideCard } from "../components/FieldGuideCard.tsx";
import { InferenceBadge } from "../components/InferenceBadge.tsx";
import { Input, Textarea } from "../components/Input.tsx";
import { LanguageSelector } from "../components/LanguageSelector.tsx";
import { LoadingSkeleton } from "../components/LoadingSkeleton.tsx";
import { INCOMING_SCAN_EVENT, INCOMING_SCAN_KEY } from "../config.ts";
import { isFirebaseConfigured } from "../firebase/config.ts";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import { hybridAI } from "../services/ai.ts";
import { extractImageText, extractPdfText, validateUploadFile } from "../services/extraction.ts";
import type { ExtractionProgress, OcrHandle } from "../services/extraction.ts";
import { downloadText, exportGuideMarkdown, logActivity, upsertGuide } from "../services/storage.ts";

const AUTO_AI_KEY = "formease:v1:auto-ai";

/** Auto-run AI guidance after Analyse, unless the user turned it off in Settings. Defaults to on. */
function readAutoAi(): boolean {
  try {
    const raw = window.localStorage.getItem(AUTO_AI_KEY);
    return raw === null ? true : JSON.parse(raw) === true;
  } catch { return true; }
}

const DEMO_TEXT = "Full name\nFather's name\nDate of birth\nPermanent Residential Address\nPrevious Academic Qualifications\nProvide your previous academic qualifications and relevant supporting documentation.\nUpload Matric marksheet\nUpload Intermediate certificate\nEmail address\nPhone number";

export default function Workspace(): React.JSX.Element {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [language] = useLocalStorage<Language>("formease:v1:language", "en");
  const [saveHistory] = useLocalStorage<boolean>("formease:v1:save-locally", true);
  const [aiPref] = useLocalStorage<InferenceModePreference>("formease:v1:ai-preference", "prefer_on_device");
  // Cloud consent lives in Settings → Privacy. It is NOT asked before a run:
  // the service asks for it just in time (aiNeedsConsent) only if on-device
  // AI fails and consent is the only thing blocking the cloud fallback.
  // Once granted it is remembered here and later runs fall back automatically.
  const [, setCloudConsent] = useLocalStorage<boolean>("formease:v1:cloud-consent", false);
  const [fileInfo, setFileInfo] = useState("");
  const [fileError, setFileError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [guide, setGuide] = useState<FormGuide | null>(null);
  const [scanBanner, setScanBanner] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ fieldIndex: number; total: number; fieldLabel: string; downloadProgress: number | null } | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiDone, setAiDone] = useState(false);
  // True only when a run stopped because on-device AI failed and cloud
  // fallback needs consent — the UI then asks for consent just in time.
  const [aiNeedsConsent, setAiNeedsConsent] = useState(false);
  const [copiedGuide, setCopiedGuide] = useState(false);
  const aiControllerRef = useRef<AbortController | null>(null);
  // Each AI run takes a token; completion handlers from an older run (e.g.
  // the user clicked Analyse again mid-run) ignore themselves, so a stale
  // run can never overwrite a newer guide or hide its progress.
  const aiRunTokenRef = useRef(0);
  const ocrRef = useRef<OcrHandle | null>(null);
  const importedRef = useRef(false);

  const cancelAi = () => {
    aiControllerRef.current?.abort();
  };

  // Runs real AI guidance for every field of `target` and merges the results
  // into the displayed guide. Takes the guide as a parameter so Analyse and
  // extension-scan import can auto-run it with the freshly built guide
  // (state is not updated yet at that point).
  const getAiExplanations = (target: FormGuide) => {
    // Stop any previous run (it belonged to a previous guide). Its
    // completion handlers ignore themselves via the run token below.
    aiControllerRef.current?.abort();
    const runToken = (aiRunTokenRef.current += 1);
    setAiError("");
    setAiNeedsConsent(false);
    setAiRunning(true);
    setAiDone(false);
    setAiProgress({ fieldIndex: 0, total: target.detectedLabels.length, fieldLabel: target.detectedLabels[0] ?? "", downloadProgress: null });
    const controller = new AbortController();
    aiControllerRef.current = controller;
    // User gesture (this click / the Analyse click) — required before initializeDeviceModel().
    void hybridAI.explainForm(target, aiPref, {
      signal: controller.signal,
      onFieldStart: (info) => setAiProgress((p) => ({ ...info, downloadProgress: p?.downloadProgress ?? null })),
      onDownloadProgress: (p) => setAiProgress((prev) => (prev ? { ...prev, downloadProgress: p } : prev)),
    }).then((result) => {
      if (aiRunTokenRef.current !== runToken) return; // superseded by a newer run
      aiControllerRef.current = null;
      setAiRunning(false);
      setAiProgress(null);
      const failedByLabel = new Map((result.results ?? []).filter((r) => r.error).map((r) => [r.fieldLabel, r.error as string]));
      const aiByLabel = new Map((result.data ?? []).map((f) => [f.fieldLabel, f]));
      const mergedFields = target.fields.map((f) => {
        const ai = aiByLabel.get(f.fieldLabel);
        if (ai) return ai;
        const err = failedByLabel.get(f.fieldLabel);
        return err ? { ...f, aiError: err } : f;
      });
      const succeeded = result.data?.length ?? 0;
      const noteParts = [
        succeeded > 0
          ? `${String(succeeded)} of ${String(target.detectedLabels.length)} field(s) explained by real AI (${result.route === "local" ? "on-device" : result.route === "cloud" ? "cloud" : result.route === "mixed" ? "mixed on-device + cloud" : "route not reported"}) in ${(result.latencyMs / 1000).toFixed(1)}s.`
          : "No field received an AI explanation.",
        failedByLabel.size > 0 ? `Failed fields kept their phrasebook/parser explanation: ${[...failedByLabel.keys()].join(", ")}.` : "",
        result.error ?? "",
      ].filter((s) => s !== "");
      const merged: FormGuide = {
        ...target,
        fields: mergedFields,
        inferenceRoute: result.route,
        inferenceNote: noteParts.join(" "),
        updatedAt: new Date().toISOString(),
      };
      setGuide(merged);
      setAiDone(true);
      setAiNeedsConsent(result.needsCloudConsent === true);
      if (result.error && succeeded === 0) setAiError(result.error);
      else if (result.error) setNotice(result.error);
      if (saveHistory) {
        const { error: saveError } = upsertGuide(merged);
        if (saveError) setError(saveError);
      }
      logActivity(`AI explanations requested (${String(succeeded)}/${String(target.detectedLabels.length)} fields, route: ${result.route})`);
    }).catch((err: unknown) => {
      if (aiRunTokenRef.current !== runToken) return; // superseded by a newer run
      aiControllerRef.current = null;
      setAiRunning(false);
      setAiProgress(null);
      setAiError(err instanceof Error ? err.message : "AI explanations failed.");
    });
  };

  // One click = the complete guide. Analyse detects the fields, then AI
  // guidance runs automatically (when Firebase is configured and the user
  // has not turned auto-AI off in Settings). Nothing is a two-step flow.
  const maybeAutoAi = (built: FormGuide) => {
    if (isFirebaseConfigured && readAutoAi()) getAiExplanations(built);
  };

  const importScan = useCallback((scan: ExtensionScan, via: string) => {
    // A new scan replaces the current guide — stop any AI run for the old one.
    aiControllerRef.current?.abort();
    const labels = scan.fields.map((f) => ({ label: f.label, required: f.required, type: f.type }));
    const built = buildGuideFromText(
      labels.map((l) => `${l.label}${l.required ? " *" : ""}`).join("\n"),
      { source: "extension", sourceLabel: scan.url, language: scan.language, title: scan.title || "Scanned form" },
    );
    setText(labels.map((l) => l.label).join("\n"));
    setUrl(scan.url);
    setGuide(built);
    if (saveHistory) upsertGuide(built);
    logActivity(`Imported extension scan (${String(scan.fields.length)} fields) from ${scan.url}`);
    setScanBanner(`Scan received from extension (${via}) — ${String(scan.fields.length)} fields from ${scan.url}.`);
    setNotice("");
    setError("");
    // A scan is an analysis: generate the complete AI guidance for it too.
    maybeAutoAi(built);
  }, [saveHistory]);

  // Extension transfer: storage bridge (localStorage key written by the
  // dashboard content script) + URL fallback (?scanData= base64url).
  useEffect(() => {
    if (importedRef.current) return;
    const fromStorage = (): boolean => {
      try {
        const raw = window.localStorage.getItem(INCOMING_SCAN_KEY);
        if (!raw) return false;
        const parsedRaw = JSON.parse(raw) as unknown;
        if (!isValidExtensionScan(parsedRaw)) return false;
        importedRef.current = true;
        window.localStorage.removeItem(INCOMING_SCAN_KEY);
        importScan(parsedRaw, "storage bridge");
        return true;
      } catch { return false; }
    };
    const fromUrl = (): void => {
      const encoded = getHashParam("scanData");
      if (encoded) {
        const decoded = decodeScanFromUrl(encoded);
        if (decoded.ok) {
          importedRef.current = true;
          importScan(decoded.scan, "URL transfer");
        } else {
          setError(decoded.errors.join(" "));
        }
        return;
      }
      const scanId = getHashParam("scan");
      if (scanId) {
        // Storage bridge writes the key asynchronously; wait for the event too.
        if (!fromStorage()) setNotice("Waiting for the extension scan to arrive via the storage bridge… If nothing appears, open the extension popup and use “Send to Dashboard” again.");
      }
    };
    fromUrl();
    const onEvent = () => { fromStorage(); };
    const onStorage = (e: StorageEvent) => { if (e.key === INCOMING_SCAN_KEY) fromStorage(); };
    window.addEventListener(INCOMING_SCAN_EVENT, onEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(INCOMING_SCAN_EVENT, onEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, [importScan]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    setFileError(""); setFileInfo(""); setProgress(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateUploadFile(file);
    if (validation) { setFileError(validation); return; }
    setFileInfo(`${file.name} · ${(file.size / 1024).toFixed(0)} KB · extracting text…`);
    setLoading(true);
    const onProg = (p: ExtractionProgress) => setProgress(p);
    if (file.type === "application/pdf") {
      void extractPdfText(file, onProg).then((res) => {
        setLoading(false); setProgress(null);
        if (!res.text.trim()) { setFileError("No text could be read from this PDF — it may be a scanned image. Try uploading it as an image, or paste the form text."); return; }
        setText(res.text);
        setFileInfo(`${file.name} · ${String(res.pages ?? 0)} pages · text extracted — review it below, then analyse.`);
        setNotice(`Extracted text from ${String(res.pages ?? 0)} PDF page(s). Check it, then click “Analyse form”.`);
      }).catch((err: unknown) => {
        setLoading(false); setProgress(null);
        setFileError(err instanceof Error ? `PDF extraction failed: ${err.message}` : "PDF extraction failed. Paste the form text instead.");
      });
    } else {
      const handle = extractImageText(file, onProg);
      ocrRef.current = handle;
      void handle.promise.then((res) => {
        ocrRef.current = null;
        setLoading(false); setProgress(null);
        if (!res.text.trim()) { setFileError("No text could be read from this image — it may be too blurry or low-contrast. Paste the form text instead."); return; }
        setText(res.text);
        setFileInfo(`${file.name} · text extracted by on-device OCR — review it below, then analyse.`);
        setNotice("Text extracted from the image (on-device OCR). Check it, then click “Analyse form”.");
      }).catch((err: unknown) => {
        ocrRef.current = null;
        setLoading(false); setProgress(null);
        setFileError(err instanceof Error ? `Image OCR failed: ${err.message}` : "Image OCR failed. Paste the form text instead.");
      });
    }
  };

  const analyse = () => {
    // A previous AI run belongs to the previous guide — stop it so it cannot
    // overwrite the new one (its completion handlers also ignore themselves
    // via the run token).
    aiControllerRef.current?.abort();
    setError(""); setNotice(""); setGuide(null); setAiDone(false); setAiError(""); setAiNeedsConsent(false); setAiProgress(null);
    if (url.trim() !== "") {
      setNotice("FormEase cannot fetch arbitrary websites directly — browsers block cross-site reads (CORS). Your URL was not fetched. Paste the form text above, or upload the form document, instead.");
    }
    const fields = parseFormFields(text);
    if (fields.length === 0) { setError("Paste the form text first — no field labels were detected."); return; }
    setLoading(true);
    window.setTimeout(() => {
      const built = buildGuideFromText(text, {
        source: url.trim() !== "" ? "url" : "paste",
        sourceLabel: url.trim() !== "" ? url.trim() : "Pasted text",
        language,
      });
      setGuide(built);
      if (saveHistory) {
        const { error: saveError } = upsertGuide(built);
        if (saveError) setError(saveError);
      } else {
        setNotice("Guide created but not saved — “Save guides in this browser” is off in Settings.");
      }
      logActivity(`Analysed a form (${String(fields.length)} fields, ${built.source})`);
      setLoading(false);
      maybeAutoAi(built);
    }, 60);
  };

  const exportJson = () => {
    if (!guide) return;
    downloadText(`${guide.title}.json`, JSON.stringify(guide, null, 2), "application/json");
  };
  const exportMarkdown = () => {
    if (!guide) return;
    downloadText(`${guide.title}.md`, exportGuideMarkdown(guide), "text/markdown");
  };
  const copyGuide = () => {
    if (!guide) return;
    void navigator.clipboard.writeText(exportGuideMarkdown(guide)).then(() => {
      setCopiedGuide(true);
      window.setTimeout(() => setCopiedGuide(false), 1500);
    }).catch(() => setCopiedGuide(false));
  };

  const hints = detectDocumentHints(text);
  return (
    <div className="container page">
      <h1>Form Analysis Workspace</h1>
      <p className="muted">Paste form text, enter a URL, or upload a PDF/image. Choose a language, then click <strong>Analyse form</strong>. FormEase detects the fields and generates the complete guide for every field in one place — explanation in English, Simple English and Roman Urdu, required information, an example, possible documents and common mistakes. AI guidance runs automatically after analysis when Firebase is configured (you can turn that off in Settings). Until AI guidance has run, the guide below is clearly marked provisional — it is not the final guide. Nothing is ever presented as AI unless a real AI call produced it.</p>
      {scanBanner && (
        <div className="banner" role="status" style={{ marginTop: 16 }}>
          <span>{scanBanner}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setScanBanner(null)}>Dismiss</button>
        </div>
      )}
      <div className="grid grid-2" style={{ marginTop: 20, alignItems: "start" }}>
        <Card>
          <div className="field">
            <label htmlFor="form-text">Paste form instructions or field labels</label>
            <Textarea id="form-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Full name\nPermanent Residential Address\nPrevious Academic Qualifications…"} />
            <div className="hint">One field per line works best. Numbered lists, “Field: label”, labels ending in “?” and “* / (required)” markers are all understood.</div>
          </div>
          <div className="field">
            <label htmlFor="form-url">Form URL (optional)</label>
            <Input id="form-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.edu/admissions" />
            <div className="hint">URLs are never fetched automatically — browsers block cross-site reads (CORS). Paste the text or upload the document instead.</div>
          </div>
          <div className="field">
            <label htmlFor="form-file">Upload a PDF or image (max 10 MB)</label>
            <Input id="form-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={onFile} />
            {fileInfo && <div className="hint">{fileInfo}</div>}
            {progress && (
              <div style={{ marginTop: 8 }}>
                <div className="progress"><div style={{ width: `${String(progress.percent)}%` }} /></div>
                <div className="small muted" style={{ marginTop: 4 }}>{progress.status} {progress.percent}%</div>
                {progress.stage === "ocr" && (
                  <Button variant="secondary" onClick={() => { ocrRef.current?.cancel(); setLoading(false); setProgress(null); setFileError("OCR cancelled. Paste the form text instead."); }}>Cancel OCR</Button>
                )}
              </div>
            )}
            {fileError && <div className="notice notice-error" style={{ marginTop: 8 }}>{fileError}</div>}
          </div>
          <div className="field">
            <label htmlFor="lang">Explanation language</label>
            <LanguageSelector />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button onClick={analyse} disabled={loading}>{loading ? "Working…" : "Analyse form"}</Button>
            <Button variant="secondary" onClick={() => { setText(DEMO_TEXT); setNotice("Demo form text loaded — this is sample text, labelled as a demo, not a real form."); }}>Load demo form text</Button>
            <Button variant="ghost" onClick={() => { setText(""); setUrl(""); setGuide(null); setNotice(""); setError(""); setFileInfo(""); }}>Clear</Button>
          </div>
          {notice && <div className="notice" style={{ marginTop: 14 }}>{notice}</div>}
          {error && <div className="notice notice-error" style={{ marginTop: 14 }}>{error}</div>}
          {hints.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h3>Possible documents (keyword hints)</h3>
              <p className="small muted">Detected from words in your pasted text. These are hints only — not confirmed requirements.</p>
              <ul>{hints.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
          )}
        </Card>
        <div>
          {loading && <Card><LoadingSkeleton lines={4} /><p className="muted">Step 1 of 2 — Detecting fields…</p></Card>}
          {!loading && !guide && (
            <EmptyState title="No analysis yet" body="Your complete field-by-field guide will appear here after you analyse — every field explained in English, Simple English and Roman Urdu, with required information, an example, possible documents and common mistakes." />
          )}
          {!loading && guide && (
            <div>
              <Card>
                <h2 style={{ fontSize: "1.2rem" }}>Your complete guide</h2>
                <p className="muted" style={{ marginTop: 4 }}>{guide.title} · {guide.detectedLabels.length} fields detected locally · {guide.fields.filter((f) => f.source === "phrasebook").length} from the phrasebook, {guide.fields.filter((f) => f.source === "parser").length} from the local parser, {guide.fields.filter((f) => f.source === "ai").length} from real AI.</p>
                <InferenceBadge route={guide.inferenceRoute} reason={!isFirebaseConfigured ? "Firebase not configured — add your config to apps/web/.env" : guide.fields.find((f) => f.aiError)?.aiError} />
                {aiRunning && aiProgress && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ margin: 0 }}><strong>Step 2 of 2 — Generating AI guidance…</strong></p>
                    <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${String(Math.round(((aiProgress.fieldIndex) / Math.max(aiProgress.total, 1)) * 100))}%` }} /></div>
                    <p className="small muted" style={{ marginTop: 6 }}>
                      Explaining field {aiProgress.fieldIndex + 1} of {aiProgress.total} — {aiProgress.fieldLabel}
                      {aiProgress.downloadProgress !== null && aiProgress.downloadProgress < 1 ? ` · downloading on-device model ${String(Math.round(aiProgress.downloadProgress * 100))}%` : ""}
                    </p>
                    <p className="small muted">The guide below is provisional until this finishes — the phrasebook/parser explanations will be replaced by AI explanations field by field.</p>
                    <Button variant="secondary" onClick={cancelAi}>Cancel AI run</Button>
                  </div>
                )}
                {!aiRunning && !aiDone && isFirebaseConfigured && (
                  <div style={{ marginTop: 12 }}>
                    <p className="small" style={{ margin: 0 }}>AI guidance has not finished for this guide yet — the explanations below are provisional (phrasebook/parser), not the final AI guide.</p>
                    <Button onClick={() => getAiExplanations(guide)} style={{ marginTop: 8 }}>Generate AI guidance</Button>
                  </div>
                )}
                {!aiRunning && !aiDone && !isFirebaseConfigured && (
                  <div className="notice" style={{ marginTop: 12 }}>
                    <strong>AI guidance not generated — Firebase is not configured.</strong> Add your Firebase config to <code>apps/web/.env</code> (see <a href="#/settings">Settings → Firebase setup</a> and <code>docs/firebase-setup.md</code>). This is a provisional guide from the local phrasebook and parser only — not the final AI guide. The phrasebook explanations below are real and stay as they are.
                  </div>
                )}
                {!aiRunning && aiDone && (
                  <p className="small" style={{ marginTop: 12 }}>{guide.inferenceNote}</p>
                )}
                {aiError && <div className="notice notice-error" style={{ marginTop: 12 }}>{aiError}</div>}
                {aiNeedsConsent && (
                  <div className="notice" style={{ marginTop: 12 }}>
                    <strong>On-device AI isn’t available in this browser.</strong> To explain this form with Firebase Cloud AI, enable cloud fallback — your form text will be sent to Google’s cloud AI. You can turn this off anytime in Settings → Privacy.
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                      <Button onClick={() => { setCloudConsent(true); setAiNeedsConsent(false); setAiDone(false); getAiExplanations(guide); }}>Enable cloud fallback and retry</Button>
                      <Button variant="secondary" onClick={() => setAiNeedsConsent(false)}>Not now — keep local explanations</Button>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <Button variant="secondary" onClick={copyGuide}>{copiedGuide ? "Copied" : "Copy guide"}</Button>
                  <Button variant="secondary" onClick={exportJson}>Export JSON</Button>
                  <Button variant="secondary" onClick={exportMarkdown}>Export Markdown</Button>
                  <a className="btn btn-secondary" href="#/checklist">Open document checklist</a>
                  <a className="btn btn-ghost" href={`#/guide?id=${encodeURIComponent(guide.id)}`}>Open the saved copy</a>
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>“Open the saved copy” is the same guide on the Guide page — for sharing or opening later. You don’t need it to see the complete guide; it’s already above.</p>
              </Card>
              {guide.fields.map((f) => (
                <div key={f.fieldLabel} style={{ marginTop: 14 }}>
                  <FieldGuideCard field={f} guideLanguage={guide.language} defaultLanguage={language} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
