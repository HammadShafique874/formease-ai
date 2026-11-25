import { useEffect, useState } from "react";
import { FileText, Menu, X } from "lucide-react";
import Landing from "./pages/Landing.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Workspace from "./pages/Workspace.tsx";
import Guide from "./pages/Guide.tsx";
import Checklist from "./pages/Checklist.tsx";
import Saved from "./pages/Saved.tsx";
import Settings from "./pages/Settings.tsx";

export function getHashRoute(): string {
  const h = window.location.hash.replace(/^#/, "") || "/";
  return h.split("?")[0] ?? "/";
}
export function getHashParam(name: string): string | null {
  const h = window.location.hash;
  const q = h.split("?")[1];
  if (!q) return null;
  return new URLSearchParams(q).get(name);
}
const NAV: Array<{ path: string; label: string }> = [
  { path: "/", label: "Home" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/workspace", label: "Analyse a form" },
  { path: "/checklist", label: "Checklist" },
  { path: "/saved", label: "Saved guides" },
  { path: "/settings", label: "Settings" },
];

export default function App(): React.JSX.Element {
  const [route, setRoute] = useState<string>(getHashRoute());
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onHash = () => { setRoute(getHashRoute()); setMenuOpen(false); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (path: string) => { window.location.hash = `#${path}`; };
  return (
    <div>
      <header className="nav">
        <div className="container nav-inner">
          <a className="logo" href="#/" onClick={(e) => { e.preventDefault(); go("/"); }}>
            <span className="logo-mark"><FileText size={17} /></span> FormEase AI
          </a>
          <button
            type="button"
            className="nav-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className={`nav-links${menuOpen ? " nav-links-open" : ""}`} aria-label="Main">
            {NAV.map((n) => (
              <a key={n.path} href={`#${n.path}`} className={route === n.path || (n.path === "/dashboard" && route === "/guide") ? "active" : ""}>{n.label}</a>
            ))}
          </nav>
          <button type="button" className="btn btn-sm nav-cta" onClick={() => go("/workspace")}>Get Started</button>
        </div>
      </header>
      <main>
        {route === "/" && <Landing />}
        {route === "/dashboard" && <Dashboard />}
        {route === "/workspace" && <Workspace />}
        {route === "/guide" && <Guide />}
        {route === "/checklist" && <Checklist />}
        {route === "/saved" && <Saved />}
        {route === "/settings" && <Settings />}
        {!["/", "/dashboard", "/workspace", "/guide", "/checklist", "/saved", "/settings"].includes(route) && (
          <div className="container page"><h1>Page not found</h1><p className="muted">That route does not exist.</p><a className="btn" href="#/">Back home</a></div>
        )}
      </main>
      <footer className="footer">
        <div className="container">
          FormEase AI — BuildHybridAI 2026. Every form, finally understandable.
          <span className="muted"> Privacy-first: form content is never saved unless you explicitly save a guide.</span>
        </div>
      </footer>
    </div>
  );
}
