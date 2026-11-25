import type { ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }): React.JSX.Element {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
