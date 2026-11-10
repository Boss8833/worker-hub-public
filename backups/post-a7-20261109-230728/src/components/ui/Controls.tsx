import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean };

export function Button({ variant = 'secondary', loading, className = '', children, disabled, ...p }: BtnProps) {
  const v = {
    primary: 'bg-gradient-to-br from-brand to-blue-500 shadow-[0_0_24px_rgba(139,92,246,.35)] hover:brightness-110',
    secondary: 'bg-white/10 border border-white/10 hover:bg-white/15',
    ghost: 'hover:bg-white/10',
    danger: 'bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25',
  }[variant];
  return (
    <button {...p} disabled={disabled || loading}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

const field = 'w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/20 placeholder:text-muted/60 min-h-[44px]';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${field} ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${field} [&>option]:bg-[#0E1433] ${p.className ?? ''}`} />;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-gradient-to-r from-brand to-accent' : 'bg-white/20'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'start-[22px]' : 'start-0.5'}`} />
    </button>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="glass page-enter max-h-[90dvh] w-full max-w-lg overflow-auto rounded-3xl bg-[#0E1433]/95 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="close" className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export type Column<T> = { key: string; header: string; render: (row: T) => ReactNode };

export function DataTable<T>({ columns, rows, rowKey, onRowClick }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; onRowClick?: (r: T) => void }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead><tr className="text-start text-xs text-muted">{columns.map((c) => <th key={c.key} className="px-3 py-2 text-start font-medium">{c.header}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={() => onRowClick?.(r)} className={`border-t border-white/10 ${onRowClick ? 'cursor-pointer hover:bg-white/5' : ''}`}>
                {columns.map((c) => <td key={c.key} className="px-3 py-3 align-middle">{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <div key={rowKey(r)} onClick={() => onRowClick?.(r)} className="rounded-xl border border-white/10 bg-white/5 p-3">
            {columns.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 py-1 text-sm">
                <span className="text-xs text-muted">{c.header}</span><span className="min-w-0 text-end">{c.render(r)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
