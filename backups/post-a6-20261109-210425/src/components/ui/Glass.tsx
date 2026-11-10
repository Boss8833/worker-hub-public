import type { ReactNode } from 'react';
import { Inbox, AlertTriangle } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Button } from './Controls';

export function GlassCard({ children, className = '', hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={`glass ${hover ? 'glass-hover' : ''} ${className}`}>{children}</div>;
}

export function DemoBadge() {
  const { t } = useI18n();
  return <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-warn">{t('common.demo')}</span>;
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'brand';
const TONES: Record<Tone, string> = {
  ok: 'bg-ok/15 text-ok border-ok/30', warn: 'bg-warn/15 text-warn border-warn/30', bad: 'bg-bad/15 text-bad border-bad/30',
  info: 'bg-info/15 text-info border-info/30', muted: 'bg-white/10 text-muted border-white/10', brand: 'bg-brand/15 text-brand border-brand/30',
};
const DOT: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info', muted: 'bg-muted', brand: 'bg-brand' };

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}
export function StatusDot({ tone = 'muted' }: { tone?: Tone }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${DOT[tone]}`} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-extrabold md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="rounded-2xl bg-white/10 p-3 text-muted"><Inbox className="h-6 w-6" /></div>
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-bad" />
      <p className="max-w-md text-sm text-bad">{message}</p>
      {onRetry && <Button onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/10 ${className}`} />;
}
