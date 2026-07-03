import { ReactNode, useEffect } from "react";

export function NavButton({ active, icon, label, hint, onClick }: { active: boolean; icon: ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button className={active ? "nav-item active" : "nav-item"} onClick={onClick} aria-label={label} title={label}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-copy"><strong>{label}</strong><small>{hint}</small></span>
    </button>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>×</button>
        {children}
      </div>
    </div>
  );
}

export function Page({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return <><header className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div><div>{actions}</div></header>{children}</>;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
