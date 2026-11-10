import { useEffect, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { useI18n } from '../i18n';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import type { Platform } from '../lib/types';
import { GlassCard, PageHeader, Badge, ErrorState, Skeleton } from '../components/ui/Glass';
import { Button, Field, Input, Toggle } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';

type Settings = { automationEnabled: boolean; minReward: number; maxConcurrent: number; maxRuntimeSec: number; manualApproval: boolean; autoSubmit: boolean; platformIds: number[]; filters: { include: string[]; exclude: string[] } };
const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function Worker() {
  const { t } = useI18n();
  const toast = useToast();
  const status = useApi<{ state: string; states: string[] }>('/api/worker/status');
  const settings = useApi<Settings>('/api/worker/settings');
  const plats = useApi<Platform[]>('/api/platforms');
  const [s, setS] = useState<Settings | null>(null);
  const [inc, setInc] = useState('');
  const [exc, setExc] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (settings.data) { setS(settings.data); setInc(settings.data.filters.include.join(', ')); setExc(settings.data.filters.exclude.join(', ')); } }, [settings.data]);

  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />;
  if (!s) return <Skeleton className="h-48" />;

  const save = async () => {
    setBusy(true);
    try { await api('/api/worker/settings', { method: 'PUT', body: { ...s, filters: { include: split(inc), exclude: split(exc) } } }); toast(t('common.saved')); }
    catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };
  const row = (label: string, el: React.ReactNode) => <div className="flex items-center justify-between gap-3 py-1.5"><span className="text-sm">{label}</span>{el}</div>;

  return (
    <div className="space-y-4">
      <PageHeader title={t('worker.title')} subtitle={t('worker.note')} />
      <GlassCard className="space-y-3 p-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(status.data?.states ?? []).map((st) => <Badge key={st} tone={st === status.data?.state ? 'brand' : 'muted'}>{st}</Badge>)}
        </div>
        <div className="flex gap-2">
          <Button variant="primary" disabled title={t('worker.note')}><Play className="h-4 w-4" />{t('worker.start')}</Button>
          <Button disabled><Square className="h-4 w-4" />{t('worker.stop')}</Button>
        </div>
      </GlassCard>
      <GlassCard className="space-y-2 p-4">
        {row(t('worker.automation'), <Toggle checked={s.automationEnabled} onChange={(v) => setS({ ...s, automationEnabled: v })} label={t('worker.automation')} />)}
        {row(t('worker.manual'), <Toggle checked={s.manualApproval} onChange={(v) => setS({ ...s, manualApproval: v })} label={t('worker.manual')} />)}
        {row(t('worker.auto'), <Toggle checked={s.autoSubmit} onChange={(v) => setS({ ...s, autoSubmit: v })} label={t('worker.auto')} />)}
        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <Field label={t('worker.minReward')}><Input type="number" min="0" step="0.01" value={s.minReward} onChange={(e) => setS({ ...s, minReward: Number(e.target.value) })} /></Field>
          <Field label={t('worker.maxConc')}><Input type="number" min="1" max="10" value={s.maxConcurrent} onChange={(e) => setS({ ...s, maxConcurrent: Number(e.target.value) })} /></Field>
          <Field label={t('worker.maxRuntime')}><Input type="number" min="10" max="3600" value={s.maxRuntimeSec} onChange={(e) => setS({ ...s, maxRuntimeSec: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('worker.include')}><Input value={inc} onChange={(e) => setInc(e.target.value)} /></Field>
          <Field label={t('worker.exclude')}><Input value={exc} onChange={(e) => setExc(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">{t('worker.platforms')}</div>
          <div className="flex flex-wrap gap-2">
            {plats.data?.map((p) => {
              const on = s.platformIds.includes(p.id);
              return <button key={p.id} onClick={() => setS({ ...s, platformIds: on ? s.platformIds.filter((x) => x !== p.id) : [...s.platformIds, p.id] })} className={`min-h-[44px] rounded-xl border px-3 text-sm ${on ? 'border-brand bg-brand/20' : 'border-white/10 bg-white/5'}`}>{p.name}</button>;
            })}
          </div>
        </div>
        <div className="flex justify-end pt-2"><Button variant="primary" loading={busy} onClick={save}>{t('common.save')}</Button></div>
      </GlassCard>
    </div>
  );
}
