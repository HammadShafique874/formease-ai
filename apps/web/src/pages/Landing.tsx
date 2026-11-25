import { ArrowRight, CheckCircle2, Globe, FileText, Languages, Lock, Sparkles, Upload } from "lucide-react";
import type { Language } from "@formease/shared";
import { lookupPhrasebook } from "@formease/shared";
import { LanguageSelector } from "../components/LanguageSelector.tsx";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";

const FEATURES = [
  { icon: FileText, title: "Field-by-field explanations", body: "Every question on a form, explained in plain language — what it asks, what to enter, and what to avoid." },
  { icon: Languages, title: "English, Simple English & Roman Urdu", body: "Switch languages without losing the meaning of the original question." },
  { icon: Sparkles, title: "Hybrid AI — local first", body: "On-device inference when your browser supports it, cloud fallback when it does not. The app always shows which route actually ran." },
  { icon: Upload, title: "Document checklist", body: "Possible supporting documents, detected from the form — clearly labelled as hints, never as official requirements." },
  { icon: Lock, title: "Privacy-first", body: "Minimum necessary context only. No auto-fill, no auto-submit, nothing saved unless you choose to save it." },
  { icon: Globe, title: "Chrome Extension", body: "Scan any real webpage form from the popup, then open the full guide in the dashboard." },
];
const FORM_TYPES = ["University admissions", "Scholarships", "Job applications", "Government services", "Visas & permits", "Banking & accounts", "Healthcare forms", "Online registrations"];

export default function Landing(): React.JSX.Element {
  const [language] = useLocalStorage<Language>("formease:v1:language", "en");
  const example = lookupPhrasebook("Previous Academic Qualifications");
  const exampleText = example ? example.explanations[language] : "Apni previous education ki details enter karein aur Matric / Intermediate ki marksheets upload karein.";
  return (
    <div>
      <div className="container">
        <section className="hero">
          <div>
            <h1>Stop Struggling With Complicated Forms.</h1>
            <p className="lead">Understand every question, discover required documents, and complete online applications with AI-powered guidance.</p>
            <div className="hero-cta">
              <a className="btn" href="#/workspace">Get Started <ArrowRight size={17} /></a>
              <a className="btn btn-secondary" href="#how-it-works">Explore How It Works</a>
            </div>
            <p className="small muted" style={{ marginTop: 14 }}>Free for the hackathon demo · No account needed to try the workspace</p>
          </div>
          <div className="illustration" aria-label="Example: a complicated form field next to its simple explanation">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Admission Form</strong><span className="badge">Original</span>
            </div>
            <div className="form-line" style={{ width: "92%" }} />
            <p style={{ fontSize: "0.95rem", margin: "12px 0 4px" }}>“Provide your previous academic qualifications and relevant supporting documentation.”</p>
            <div className="form-line" style={{ width: "70%" }} />
            <div className="explain">
              <strong>FormEase AI explains:</strong>
              <p style={{ margin: "6px 0 0" }}>{exampleText}</p>
              <p className="small muted" style={{ margin: "6px 0 0" }}>Documents that may be needed: academic transcript · previous certificate</p>
              <p className="small muted" style={{ margin: "6px 0 0" }}>Source: Phrasebook (local) — try the language switcher:</p>
              <div style={{ maxWidth: 260, marginTop: 6 }}><LanguageSelector /></div>
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <h2>How It Works</h2>
          <div className="grid grid-3 steps" style={{ marginTop: 20 }}>
            <div className="card step"><span className="step-num">1</span><div><h3>Open any form</h3><p className="muted">Use the Chrome Extension on a real webpage, or paste form text into the workspace.</p></div></div>
            <div className="card step"><span className="step-num">2</span><div><h3>AI explains it</h3><p className="muted">Firebase AI Logic tries on-device inference first, then falls back to the cloud — and tells you which one ran.</p></div></div>
            <div className="card step"><span className="step-num">3</span><div><h3>Complete with confidence</h3><p className="muted">Follow the field guide, tick off your document checklist, and submit the form yourself. You stay in control.</p></div></div>
          </div>
        </section>

        <section className="section" id="extension">
          <h2>Get the Chrome Extension</h2>
          <p className="muted" style={{ maxWidth: 720 }}>
            Scan a form on the real page you are already on — the extension detects its fields and sends only the
            minimum context to this dashboard. It never reads field values, never auto-fills, and never auto-submits.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <a className="btn" href="/formease-extension.zip" download>Download the extension (.zip)</a>
          </div>
          <ol className="muted" style={{ marginTop: 16, lineHeight: 1.7 }}>
            <li>Download and extract the ZIP above.</li>
            <li>Open <code>chrome://extensions</code> in Chrome and turn on <strong>Developer mode</strong>.</li>
            <li>Click <strong>Load unpacked</strong> and select the extracted folder.</li>
            <li>Pin FormEase AI, open any form page, and click <strong>Scan this form</strong> in the popup.</li>
          </ol>
          <p className="small muted">The extension is also available as source in the GitHub repository. A Chrome Web Store listing is planned after the hackathon.</p>
        </section>

        <section className="section">
          <h2>Main features</h2>
          <div className="grid grid-3" style={{ marginTop: 20 }}>
            {FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <f.icon size={22} color="#5b5ce2" />
                <h3 style={{ marginTop: 10 }}>{f.title}</h3>
                <p className="muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Hybrid AI, honestly explained</h2>
          <p className="muted" style={{ maxWidth: 720 }}>
            Firebase AI Logic Hybrid Inference runs the on-device model (Gemini Nano, via Chrome&apos;s Prompt API)
            when it is available on your desktop Chrome browser. If it is not available, the same request falls
            back to a cloud Gemini model. Every explanation in FormEase shows its real inference route — Local or
            Cloud — with latency. Nothing is simulated: if AI is not configured, the app says so instead of faking an answer.
          </p>
          <div className="grid grid-3" style={{ marginTop: 16 }}>
            <div className="card"><h3>Local</h3><p className="muted">Private, offline-capable, no cost. Short, single-field explanations.</p></div>
            <div className="card"><h3>Cloud</h3><p className="muted">For complex, multi-section forms and detailed guidance.</p></div>
            <div className="card"><h3>You choose</h3><p className="muted">Prefer on-device, prefer cloud, or local-only in Settings. The app reports what actually happened.</p></div>
          </div>
        </section>

        <section className="section">
          <h2>Privacy-first by design</h2>
          <ul>
            <li><CheckCircle2 size={16} color="#16a36a" /> Explicit consent before any form text is sent for analysis.</li>
            <li><CheckCircle2 size={16} color="#16a36a" /> Only the minimum field context is extracted — never the whole page.</li>
            <li><CheckCircle2 size={16} color="#16a36a" /> No automatic form submission or filling of sensitive fields.</li>
            <li><CheckCircle2 size={16} color="#16a36a" /> Raw form content is not saved by default; guides are saved only when you ask.</li>
          </ul>
        </section>

        <section className="section">
          <h2>Supported form types</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {FORM_TYPES.map((t) => <span className="badge" key={t}>{t}</span>)}
          </div>
          <div style={{ marginTop: 28 }}>
            <a className="btn" href="#/workspace">Get Started <ArrowRight size={17} /></a>
          </div>
        </section>
      </div>
    </div>
  );
}
